const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

export const getToken = () => localStorage.getItem('oneclerk_token')
export const setToken = (t: string) => localStorage.setItem('oneclerk_token', t)
export const clearToken = () => localStorage.removeItem('oneclerk_token')

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken()
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (res.status === 401) {
    clearToken()
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Request failed' }))
    throw new Error(error.detail || 'Request failed')
  }
  if (res.status === 204) return null
  return res.json()
}

export const auth = {
  signup: (data: {email: string, password: string, full_name: string, business_name: string, business_type: string}) =>
    apiFetch('/api/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
  login: (email: string, password: string) =>
    apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => apiFetch('/api/auth/me'),
  logout: () => {
    clearToken()
    window.location.href = '/login'
  }
}

export const agents = {
  list: () => apiFetch('/api/agents/list'),
  get: (id: string) => apiFetch(`/api/agents/${id}`),
  create: (data: any) => apiFetch('/api/agents/create', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => apiFetch(`/api/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch(`/api/agents/${id}`, { method: 'DELETE' }),
  activate: (id: string) => apiFetch(`/api/agents/${id}/activate`, { method: 'POST' }),
  deactivate: (id: string) => apiFetch(`/api/agents/${id}/deactivate`, { method: 'POST' }),
  getSetupInstructions: (id: string) => apiFetch(`/api/agents/${id}/setup-instructions`),
  testCall: (id: string) => apiFetch(`/api/agents/${id}/test-chat`, { method: 'POST', body: JSON.stringify({ message: 'Test call', history: [] }) }),
  getTelnyxNumber: (id: string) => apiFetch(`/api/agents/${id}/get-telnyx-number`, { method: 'POST' }),
}

export const dashboard = {
  overview: () => apiFetch('/api/dashboard/stats'),
  calls: () => apiFetch('/api/calls/recent'),
  callDetail: (id: string) => apiFetch(`/api/calls/${id}`),
}

export const billing = {
  createCheckout: (plan: 'starter' | 'growth' | 'scale') =>
    apiFetch('/api/billing/create-checkout', { method: 'POST', body: JSON.stringify({ plan }) }),
  createPortal: () => apiFetch('/api/billing/create-portal', { method: 'POST' }),
  status: () => apiFetch('/api/billing/status'),
}
