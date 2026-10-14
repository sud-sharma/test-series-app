const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'ts_admin_token';

export const auth = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  set(token) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
  },
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, raw = false } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;

  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && path !== '/admin/login') {
    auth.clear();
    window.dispatchEvent(new Event('auth:logout'));
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  }
  if (raw) return res;
  if (res.status === 204) return null;
  return res.json();
}

function qs(params) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const api = {
  login: (email, password) => request('/admin/login', { method: 'POST', body: { email, password } }),
  me: () => request('/admin/me'),
  stats: () => request('/admin/stats'),
  registrations: (params) => request(`/admin/registrations${qs(params)}`),
  registration: (id) => request(`/admin/registrations/${id}`),
  deleteRegistration: (id) => request(`/admin/registrations/${id}`, { method: 'DELETE' }),
  async exportCsv(params) {
    const res = await request(`/admin/registrations/export.csv${qs(params)}`, { raw: true });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `registrations-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

export const formatInr = (paise) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    (paise || 0) / 100
  );

export const formatDate = (d) =>
  d
    ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(
        new Date(d)
      )
    : '—';

export const classLabel = { 11: 'Class 11', 12: 'Class 12', dropper: 'Dropper' };
export const modeLabel = { online: 'Online', offline: 'At centre' };
