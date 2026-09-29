const CHANGE2PRO_BASE_URL = 'https://gateway.change2pro.com';
const MAX_KEY_CHARS = 512;

export function getApiKey(request) {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const key = String(match?.[1] || '').trim();
  if (!key || key.length > MAX_KEY_CHARS || /\s/.test(key)) return '';
  return key;
}

export function isSameOrigin(request) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get('Origin');
  if (origin) return origin === requestOrigin;
  return request.headers.get('Sec-Fetch-Site') === 'same-origin';
}

export function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

export async function parseProviderPayload(response) {
  const contentType = response.headers.get('Content-Type') || '';
  try {
    return contentType.includes('application/json') ? await response.json() : await response.text();
  } catch {
    return '';
  }
}

export function extractErrorMessage(payload, status) {
  let message = '';
  if (typeof payload === 'string') message = payload;
  else message = payload?.error?.message || payload?.error?.code || payload?.error || payload?.msg || '';
  message = String(message || '').trim();
  if (!message || /^\s*</.test(message)) return `Change2pro 请求失败 (${status})`;
  return message.slice(0, 300);
}

export { CHANGE2PRO_BASE_URL };
