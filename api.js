const API_BASE = (window.SPARK_API_BASE || '').replace(/\/+$/, '');
const CROSS_ORIGIN = API_BASE !== '';
const TOKEN_KEY = 'spark.token';

function url(path) {
  return `${API_BASE}${path}`;
}

function storedToken() {
  return CROSS_ORIGIN ? localStorage.getItem(TOKEN_KEY) : null;
}

function rememberToken(payload) {
  if (!CROSS_ORIGIN || !payload || typeof payload.token !== 'string') return payload;
  localStorage.setItem(TOKEN_KEY, payload.token);
  return payload;
}

function forgetToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(extra = {}) {
  const token = storedToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(url(path), {
    method,
    credentials: 'include',
    headers: authHeaders(body ? { 'Content-Type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined
  });

  let payload = null;
  if (response.status !== 204) {
    payload = await response.json().catch(() => null);
  }

  if (!response.ok) {
    if (response.status === 401) forgetToken();
    const error = new Error(payload?.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return rememberToken(payload);
}

window.SparkApi = {
  base: API_BASE,
  url,
  request,

  me: () => request('/api/auth/me'),
  settings: () => request('/api/config'),
  login: (email, password, turnstileToken) =>
    request('/api/auth/login', { method: 'POST', body: { email, password, turnstileToken } }),
  register: (email, password, displayName, turnstileToken) =>
    request('/api/auth/register', { method: 'POST', body: { email, password, displayName, turnstileToken } }),
  async logout() {
    try {
      await request('/api/auth/logout', { method: 'POST' });
    } finally {
      forgetToken();
    }
  },
  verifyEmail: (code) => request('/api/auth/verify', { method: 'POST', body: { code } }),
  resendCode: () => request('/api/auth/resend', { method: 'POST' }),

  conversations: () => request('/api/conversations'),
  conversation: (id) => request(`/api/conversations/${id}`),
  deleteConversation: (id) => request(`/api/conversations/${id}`, { method: 'DELETE' }),

  async streamChat({ message, conversationId, signal, onStart, onDelta, onStatus, onDone, onError }) {
    const response = await fetch(url('/api/chat'), {
      method: 'POST',
      credentials: 'include',
      signal,
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ message, conversationId })
    });

    if (!response.ok || !response.body) {
      if (response.status === 401) forgetToken();
      const payload = await response.json().catch(() => null);
      const error = new Error(payload?.error || 'Spark is unavailable right now.');
      error.status = response.status;
      throw error;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        let event = 'message';
        let data = '';

        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (!data) continue;

        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }

        if (event === 'start') onStart?.(parsed);
        else if (event === 'status') onStatus?.(parsed);
        else if (event === 'delta') onDelta?.(parsed.text);
        else if (event === 'done') onDone?.(parsed);
        else if (event === 'error') onError?.(new Error(parsed.message));
      }
    }
  }
};
