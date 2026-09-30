// Change2pro Gemini 原生接口代理（nano-banana 系列）
// 上游：POST /v1beta/models/{model}:generateContent，鉴权头 x-goog-api-key
// 安全约束与 images.js 一致：
// - API Key 由用户每次请求自带，这里不保存、不记录日志
// - 只接受同源 POST，不开放 CORS
// - 模型走白名单，限制提示词、图片数量与大小、比例和分辨率
import { CHANGE2PRO_BASE_URL, extractErrorMessage, isSameOrigin, jsonResponse, parseProviderPayload } from './_shared.js';

// 前端内部模型 ID -> Change2pro 上游模型 ID
const CLIENT_MODEL_MAP = {
  'nano-banana-2-change2pro': 'nano-banana-2',
  'nano-banana-pro-change2pro': 'nano-banana-pro',
};

// nano-banana-2 额外支持的极端比例
const EXTRA_RATIOS_BANANA_2 = new Set(['1:4', '4:1', '1:8', '8:1']);
const BASE_RATIOS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9']);
const ALLOWED_IMAGE_SIZES = new Set(['1K', '2K', '4K']);

const MAX_BODY_BYTES = 40 * 1024 * 1024;
// Base64 约为原图 4/3，限制原始参考图总量，避免上游 413
const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_PROMPT_CHARS = 4000;
const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_KEY_CHARS = 512;
const UPSTREAM_TIMEOUT_MS = 180 * 1000;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export async function onRequestPost({ request }) {
  if (!isSameOrigin(request)) return jsonResponse({ success: false, error: 'forbidden' }, 403);

  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > MAX_BODY_BYTES) return jsonResponse({ success: false, error: '请求体过大' }, 413);

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return jsonResponse({ success: false, error: '无法解析表单数据' }, 400);
  }

  const apiKey = String(formData.get('api_key') || '').trim();
  const clientModel = String(formData.get('model') || '').trim();
  const model = Object.hasOwn(CLIENT_MODEL_MAP, clientModel) ? CLIENT_MODEL_MAP[clientModel] : '';
  const prompt = String(formData.get('prompt') || '').trim();
  const imageSize = String(formData.get('image_size') || '1K').trim().toUpperCase();
  const aspectRatio = String(formData.get('aspect_ratio') || 'auto').trim();
  const images = formData.getAll('image').filter(isUploadFile);

  if (!apiKey) return jsonResponse({ success: false, error: '缺少 Change2pro-Gemini API Key' }, 400);
  if (apiKey.length > MAX_KEY_CHARS || /\s/.test(apiKey)) return jsonResponse({ success: false, error: 'API Key 格式无效' }, 400);
  if (!model) return jsonResponse({ success: false, error: '不支持的 Change2pro Gemini 模型' }, 400);
  if (!prompt) return jsonResponse({ success: false, error: '缺少提示词' }, 400);
  if (prompt.length > MAX_PROMPT_CHARS) return jsonResponse({ success: false, error: `提示词不能超过 ${MAX_PROMPT_CHARS} 字` }, 400);
  if (!ALLOWED_IMAGE_SIZES.has(imageSize)) return jsonResponse({ success: false, error: '分辨率仅支持 1K/2K/4K' }, 400);
  if (!isAllowedRatio(model, aspectRatio)) return jsonResponse({ success: false, error: '不支持的图片比例' }, 400);
  if (images.length > MAX_IMAGES) return jsonResponse({ success: false, error: `参考图最多 ${MAX_IMAGES} 张` }, 400);

  let totalBytes = 0;
  for (const image of images) {
    if (image.size > MAX_IMAGE_BYTES) return jsonResponse({ success: false, error: '单张参考图不能超过 10MB' }, 400);
    if (image.type && !ALLOWED_IMAGE_TYPES.has(image.type)) return jsonResponse({ success: false, error: '参考图仅支持 PNG/JPEG/WebP' }, 400);
    totalBytes += image.size;
  }
  if (totalBytes > MAX_TOTAL_IMAGE_BYTES) return jsonResponse({ success: false, error: '参考图总大小不能超过 20MB' }, 400);

  // 文本 + 参考图（inlineData 使用不带 data URL 前缀的 Base64）
  const parts = [{ text: prompt }];
  for (const image of images) {
    parts.push({ inlineData: { mimeType: image.type || 'image/png', data: arrayBufferToBase64(await image.arrayBuffer()) } });
  }

  // generationConfig 只传图像相关选项；auto 比例不传 aspectRatio，交给模型决定
  const imageConfig = { imageSize };
  if (aspectRatio !== 'auto') imageConfig.aspectRatio = aspectRatio;
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig },
  };

  let providerResponse;
  try {
    providerResponse = await fetch(`${CHANGE2PRO_BASE_URL}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return jsonResponse({ success: false, error: timedOut ? 'Change2pro 响应超时' : 'Change2pro 服务不可用' }, 502);
  }

  const payload = await parseProviderPayload(providerResponse);
  if (!providerResponse.ok) {
    return jsonResponse({ success: false, error: extractErrorMessage(payload, providerResponse.status) }, 502);
  }

  const { images: data, text } = extractGeminiImages(payload);
  if (!data.length) {
    // 模型可能只回了文字（如拒绝生成），把文字截断后告诉用户
    const reason = text ? `Change2pro 未返回图片：${text.slice(0, 200)}` : 'Change2pro 返回了空结果';
    return jsonResponse({ success: false, error: reason }, 502);
  }
  return jsonResponse({ success: true, data }, 200);
}

export async function onRequest() {
  return jsonResponse({ success: false, error: 'method not allowed' }, 405, { Allow: 'POST' });
}

function isAllowedRatio(model, ratio) {
  if (ratio === 'auto' || BASE_RATIOS.has(ratio)) return true;
  return model === 'nano-banana-2' && EXTRA_RATIOS_BANANA_2.has(ratio);
}

function isUploadFile(value) {
  return value && typeof value === 'object' && typeof value.arrayBuffer === 'function' && value.size > 0;
}

// Workers 环境没有 Buffer，分块转 Base64，避免大数组展开导致栈溢出
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// 读取 candidates[].content.parts[]：图片在 inlineData（兼容 inline_data），文本在 text
function extractGeminiImages(payload) {
  const images = [];
  const texts = [];
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      const inline = part?.inlineData || part?.inline_data;
      if (inline && typeof inline.data === 'string' && inline.data) {
        images.push({ mimeType: inline.mimeType || inline.mime_type || 'image/png', b64_json: inline.data });
      } else if (typeof part?.text === 'string' && part.text.trim() && !part.thought) {
        texts.push(part.text.trim());
      }
    }
  }
  return { images, text: texts.join(' ') };
}
