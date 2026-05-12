const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

export const getToken = () => {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('oneclerk_token')
}
export const setToken = (t: string) => localStorage.setItem('oneclerk_token', t)
export const clearToken = () => localStorage.removeItem('oneclerk_token')

function apiErrorMessage(payload: any, fallback: string) {
  const detail = payload?.detail ?? payload?.message ?? payload?.error
  if (!detail) return fallback
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || item?.message || JSON.stringify(item)).join('; ')
  }
  return detail.message || JSON.stringify(detail)
}

function notifyError(message: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('oneclerk:error', { detail: message }))
  }
}

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
    if (typeof window !== 'undefined') window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Request failed' }))
    const message = apiErrorMessage(error, `Request failed (${res.status})`)
    notifyError(message)
    throw new Error(message)
  }
  if (res.status === 204) return null
  return res.json()
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const auth = {
  /** Direct signup (no OTP) */
  signup: (data: {
    email: string
    password: string
    name?: string
    whatsapp_number?: string
  }) => apiFetch('/api/auth/signup', { method: 'POST', body: JSON.stringify(data) }),

  /** Step 1 of OTP signup — sends 6-digit code to email */
  sendEmailOtp: (email: string) =>
    apiFetch('/api/auth/send-email-otp', { method: 'POST', body: JSON.stringify({ email }) }),

  /** Step 2 of OTP signup — verify code and create account */
  verifyEmailOtpAndSignup: (data: {
    email: string
    password: string
    otp: string
    name?: string
    whatsapp_number?: string
  }) =>
    apiFetch('/api/auth/verify-email-otp-and-signup', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  login: (email: string, password: string) =>
    apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  me: () => apiFetch('/api/auth/me'),

  /** Step 1 of phone OTP — sends SMS */
  sendPhoneOtp: (phone_number: string) =>
    apiFetch('/api/auth/send-phone-otp', {
      method: 'POST',
      body: JSON.stringify({ phone_number }),
    }),

  /** Step 2 of phone OTP — verify and mark phone_verified */
  verifyPhoneOtp: (phone_number: string, otp: string) =>
    apiFetch('/api/auth/verify-phone-otp', {
      method: 'POST',
      body: JSON.stringify({ phone_number, otp }),
    }),

  /** Save onboarding answers */
  saveOnboarding: (profile: Record<string, unknown>, completed = true) =>
    apiFetch('/api/auth/onboarding', {
      method: 'POST',
      body: JSON.stringify({ profile, completed }),
    }),

  logout: () => {
    clearToken()
    if (typeof window !== 'undefined') window.location.href = '/login'
  },
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------
export const agents = {
  list: () => apiFetch('/api/agents/list'),
  get: (id: string) => apiFetch(`/api/agents/${id}`),
  create: (data: any) =>
    apiFetch('/api/agents/create', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    apiFetch(`/api/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch(`/api/agents/${id}`, { method: 'DELETE' }),
  activate: (id: string) =>
    apiFetch(`/api/agents/${id}/activate`, { method: 'POST' }),
  deactivate: (id: string) =>
    apiFetch(`/api/agents/${id}/deactivate`, { method: 'POST' }),
  getSetupInstructions: (id: string, carrier = 'generic') =>
    apiFetch(`/api/agents/${id}/setup-instructions?carrier=${carrier}`),
  testChat: (id: string, message: string, history: any[] = []) =>
    apiFetch(`/api/agents/${id}/test-chat`, {
      method: 'POST',
      body: JSON.stringify({ message, history }),
    }),
  getTelnyxNumber: (id: string) =>
    apiFetch(`/api/agents/${id}/get-telnyx-number`, { method: 'POST' }),
  releaseNumber: (id: string) =>
    apiFetch(`/api/agents/${id}/release-number`, { method: 'DELETE' }),
  getCalls: (id: string) => apiFetch(`/api/agents/${id}/calls`),
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export const dashboard = {
  overview: () => apiFetch('/api/dashboard/stats'),
  calls: () => apiFetch('/api/calls/recent'),
  callDetail: (id: string) => apiFetch(`/api/calls/${id}`),
  /** Synthesize a short text sample and return a public audio URL */
  voicePreview: (text: string, language = 'english', voice_id?: string) =>
    apiFetch('/api/dashboard/voice-preview', {
      method: 'POST',
      body: JSON.stringify({ text, language, voice_id }),
    }),
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------
export const billing = {
  plans: () => apiFetch('/api/billing/plans'),
  createCheckout: (plan: 'starter' | 'growth' | 'scale') =>
    apiFetch('/api/billing/create-checkout', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    }),
  createPortal: () => apiFetch('/api/billing/create-portal', { method: 'POST' }),
  status: () => apiFetch('/api/billing/status'),
}
