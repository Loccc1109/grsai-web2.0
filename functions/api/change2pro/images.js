// Change2pro 生图代理（Cloudflare Pages Function）
// 浏览器无法直接跨域调用 Change2pro，所以由这里转发。
// 安全约束：
// - API Key 由用户每次请求自带，这里不保存、不记录日志
// - 只接受同源 POST，不开放 CORS，避免被其他站点当作代理
// - 限制请求体、提示词、图片数量与大小、尺寸格式
// Change2pro 文档中的统一网关；不要再使用旧的 api.change2pro.com 地址。
const CHANGE2PRO_BASE_URL = 'https://gateway.change2pro.com';
// 前端内部模型 ID -> Change2pro 上游模型 ID（白名单，仅 OpenAI Images 接口的 GPT / Grok 模型；
// nano-banana 系列走 Gemini 原生接口，见 gemini.js）
const CLIENT_MODEL_MAP = {
  'gpt-image-2-change2pro': 'gpt-image-2',
  'gpt-image-2.5-flare-change2pro': 'gpt-image-2.5-flare',
  'gpt-image-2.5-sunburst-change2pro': 'gpt-image-2.5-sunburst',
  'grok-imagine-image-2.0-change2pro': 'grok-imagine-image-2.0',
};

const MAX_BODY_BYTES = 40 * 1024 * 1024;
const MAX_PROMPT_CHARS = 4000;
const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_COUNT = 4;
const MAX_KEY_CHARS = 512;
const UPSTREAM_TIMEOUT_MS = 180 * 1000;
const SIZE_PATTERN = /^(auto|\d{3,4}x\d{3,4})$/;
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
  const size = String(formData.get('size') || '1024x1024').trim();
  const n = normalizeCount(formData.get('n'));
  const images = formData.getAll('image').filter(isUploadFile);

  if (!apiKey) return jsonResponse({ success: false, error: '缺少 Change2pro API Key' }, 400);
  if (apiKey.length > MAX_KEY_CHARS || /\s/.test(apiKey)) return jsonResponse({ success: false, error: 'API Key 格式无效' }, 400);
  if (!model) return jsonResponse({ success: false, error: '不支持的 Change2pro 图像模型' }, 400);
  if (!prompt) return jsonResponse({ success: false, error: '缺少提示词' }, 400);
  if (prompt.length > MAX_PROMPT_CHARS) return jsonResponse({ success: false, error: `提示词不能超过 ${MAX_PROMPT_CHARS} 字` }, 400);
  if (!SIZE_PATTERN.test(size)) return jsonResponse({ success: false, error: '图片尺寸格式无效' }, 400);
  if (images.length > MAX_IMAGES) return jsonResponse({ success: false, error: `参考图最多 ${MAX_IMAGES} 张` }, 400);
  for (const image of images) {
    if (image.size > MAX_IMAGE_BYTES) return jsonResponse({ success: false, error: '单张参考图不能超过 10MB' }, 400);
    if (image.type && !ALLOWED_IMAGE_TYPES.has(image.type)) return jsonResponse({ success: false, error: '参考图仅支持 PNG/JPEG/WebP' }, 400);
  }

  let providerResponse;
  try {
    providerResponse = images.length
      ? await requestEdit({ apiKey, model, prompt, size, n, images })
      : await requestGeneration({ apiKey, model, prompt, size, n });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return jsonResponse({ success: false, error: timedOut ? 'Change2pro 响应超时' : 'Change2pro 服务不可用' }, 502);
  }

  const payload = await parseProviderPayload(providerResponse);
  if (!providerResponse.ok) {
    return jsonResponse({ success: false, error: extractErrorMessage(payload, providerResponse.status) }, 502);
  }

  const data = normalizeProviderData(payload);
  if (!data.length) return jsonResponse({ success: false, error: 'Change2pro 返回了空结果' }, 502);
  return jsonResponse({ success: true, data }, 200);
}

export async function onRequest() {
  return jsonResponse({ success: false, error: 'method not allowed' }, 405, { Allow: 'POST' });
}

// 浏览器同源 fetch 会带 Origin 或 Sec-Fetch-Site；两者都缺失时视为非浏览器调用，拒绝
function isSameOrigin(request) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get('Origin');
  if (origin) return origin === requestOrigin;
  return request.headers.get('Sec-Fetch-Site') === 'same-origin';
}

function upstreamSignal() {
  return AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
}

function requestGeneration({ apiKey, model, prompt, size, n }) {
  return fetch(`${CHANGE2PRO_BASE_URL}/v1/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, size, n }),
    signal: upstreamSignal(),
  });
}

function requestEdit({ apiKey, model, prompt, size, n, images }) {
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', prompt);
  form.append('size', size);
  form.append('n', String(n));
  images.forEach(image => form.append('image', image, sanitizeFilename(image.name)));
  return fetch(`${CHANGE2PRO_BASE_URL}/v1/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: upstreamSignal(),
  });
}

function sanitizeFilename(name) {
  const cleaned = String(name || '').replace(/[^\w.-]/g, '_').slice(0, 100);
  return cleaned || 'image.png';
}

function normalizeCount(value) {
  const count = Number.parseInt(String(value || '1'), 10);
  if (!Number.isFinite(count)) return 1;
  return Math.min(MAX_COUNT, Math.max(1, count));
}

function isUploadFile(value) {
  return value && typeof value === 'object' && typeof value.arrayBuffer === 'function' && value.size > 0;
}

async function parseProviderPayload(response) {
  const contentType = response.headers.get('Content-Type') || '';
  try {
    return contentType.includes('application/json') ? await response.json() : await response.text();
  } catch {
    return '';
  }
}

function normalizeProviderData(payload) {
  if (Array.isArray(payload?.data)) return payload.data.map(normalizeProviderItem).filter(Boolean);
  if (Array.isArray(payload?.results)) return payload.results.map(normalizeProviderItem).filter(Boolean);
  const item = normalizeProviderItem(payload);
  return item ? [item] : [];
}

// 只回传前端需要的字段，不透传上游其他内容
function normalizeProviderItem(item) {
  if (!item || typeof item !== 'object') return null;
  const b64 = item.b64_json || item.base64 || (typeof item.data === 'string' ? item.data : '');
  const url = typeof item.url === 'string' && /^https:\/\//i.test(item.url) ? item.url : '';
  if (!b64 && !url) return null;
  return {
    mimeType: item.mimeType || item.mime_type || 'image/jpeg',
    b64_json: b64 || undefined,
    url: url || undefined,
  };
}

// 上游错误信息截断后返回，避免把大段 HTML 错误页透传给前端
function extractErrorMessage(payload, status) {
  let message = '';
  if (typeof payload === 'string') message = payload;
  else message = payload?.error?.message || payload?.error?.code || payload?.error || payload?.msg || '';
  message = String(message || '').trim();
  if (!message || /^\s*</.test(message)) return `Change2pro 请求失败 (${status})`;
  return message.slice(0, 300);
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store', ...extraHeaders },
  });
}
