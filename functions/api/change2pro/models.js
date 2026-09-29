import { CHANGE2PRO_BASE_URL, extractErrorMessage, getApiKey, isSameOrigin, jsonResponse, parseProviderPayload } from './_shared.js';

export async function onRequestGet({ request }) {
  if (!isSameOrigin(request)) return jsonResponse({ success: false, error: 'forbidden' }, 403);
  const apiKey = getApiKey(request);
  if (!apiKey) return jsonResponse({ success: false, error: '缺少或无效的 Change2pro API Key' }, 400);

  let response;
  try {
    response = await fetch(`${CHANGE2PRO_BASE_URL}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return jsonResponse({ success: false, error: 'Change2pro 服务不可用' }, 502);
  }

  const payload = await parseProviderPayload(response);
  if (!response.ok) return jsonResponse({ success: false, error: extractErrorMessage(payload, response.status) }, response.status);
  return jsonResponse({ success: true, data: Array.isArray(payload?.data) ? payload.data : [] });
}

export async function onRequest() {
  return jsonResponse({ success: false, error: 'method not allowed' }, 405, { Allow: 'GET' });
}
