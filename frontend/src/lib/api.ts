// 1. Sanitized Base URL logic
const getBaseUrl = () => {
  let url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  // Remove trailing slash if present to prevent // double slashes
  return url.endsWith('/') ? url.slice(0, -1) : url;
};

const API_URL = getBaseUrl();

export const getToken = () => {
  if (typeof window === 'undefined') return null;
  // Standardized key name for the whole project
  return localStorage.getItem('oneclerk_token');
};

export const setToken = (t: string) => localStorage.setItem('oneclerk_token', t);
export const clearToken = () => localStorage.removeItem('oneclerk_token');

/** Helper to extract readable error messages from the backend */
function apiErrorMessage(payload: any, fallback: string) {
  const detail = payload?.detail ?? payload?.message ?? payload?.error;
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || item?.message || JSON.stringify(item)).join('; ');
  }
  return detail.message || JSON.stringify(detail);
}

function notifyError(message: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('oneclerk:error', { detail: message }));
    console.error(`[API Error]: ${message}`);
  }
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  
  // Ensure path starts with a slash
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const fullUrl = `${API_URL}${cleanPath}`;

  try {
    const res = await fetch(fullUrl, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    if (res.status === 401) {
      clearToken();
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      throw new Error('Unauthorized');
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: 'Request failed' }));
      const message = apiErrorMessage(error, `Request failed (${res.status})`);
      notifyError(message);
      throw new Error(message);
    }

    if (res.status === 204) return null;
    return res.json();
  } catch (err: any) {
    console.error(`Fetch failed for ${fullUrl}:`, err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const auth = {
  signup: (email: string, password: string, name?: string) =>
    apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),

  login: (email: string, password: string) =>
    apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => apiFetch('/api/auth/me'),

  logout: () => {
    clearToken();
    if (typeof window !== 'undefined') window.location.href = '/login';
  },

  sendEmailOtp: (email: string) =>
    apiFetch('/api/auth/send-email-otp', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  verifyEmailOtpAndSignup: (
    email: string,
    password: string,
    otp: string,
    name?: string,
  ) =>
    apiFetch('/api/auth/verify-email-otp-and-signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, otp, name }),
    }),

  sendPhoneOtp: (phone_number: string) =>
    apiFetch('/api/auth/send-phone-otp', {
      method: 'POST',
      body: JSON.stringify({ phone_number }),
    }),

  verifyPhoneOtp: (phone_number: string, otp: string) =>
    apiFetch('/api/auth/verify-phone-otp', {
      method: 'POST',
      body: JSON.stringify({ phone_number, otp }),
    }),

  onboarding: (profile: Record<string, unknown>, completed = true) =>
    apiFetch('/api/auth/onboarding', {
      method: 'POST',
      body: JSON.stringify({ profile, completed }),
    }),
};

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export const agents = {
  list: () => apiFetch('/api/agents/list'),

  get: (id: string) => apiFetch(`/api/agents/${id}`),

  create: (payload: Record<string, unknown>) =>
    apiFetch('/api/agents/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  update: (id: string, payload: Record<string, unknown>) =>
    apiFetch(`/api/agents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  delete: (id: string) =>
    apiFetch(`/api/agents/${id}`, { method: 'DELETE' }),

  activate: (id: string) =>
    apiFetch(`/api/agents/${id}/activate`, { method: 'POST' }),

  deactivate: (id: string) =>
    apiFetch(`/api/agents/${id}/deactivate`, { method: 'POST' }),

  getTelnyxNumber: (id: string) =>
    apiFetch(`/api/agents/${id}/get-telnyx-number`, { method: 'POST' }),

  releaseNumber: (id: string) =>
    apiFetch(`/api/agents/${id}/release-number`, { method: 'DELETE' }),

  setupInstructions: (id: string, carrier = 'generic') =>
    apiFetch(`/api/agents/${id}/setup-instructions?carrier=${carrier}`),

  calls: (id: string) => apiFetch(`/api/agents/${id}/calls`),

  testChat: (id: string, message: string, history: { role: string; content: string }[] = []) =>
    apiFetch(`/api/agents/${id}/test-chat`, {
      method: 'POST',
      body: JSON.stringify({ message, history }),
    }),

  // Preview & voice
  preview: (id: string) => apiFetch(`/api/agents/${id}/preview`),

  testVoice: (id: string, text: string) =>
    apiFetch(`/api/agents/${id}/test-voice?text=${encodeURIComponent(text)}`, {
      method: 'POST',
    }),

  voices: (id: string) => apiFetch(`/api/agents/${id}/voices`),

  // Phone configuration
  configurePhone: (id: string, payload: Record<string, unknown>) =>
    apiFetch(`/api/agents/${id}/configure-phone`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  phoneStatus: (id: string) => apiFetch(`/api/agents/${id}/phone-status`),

  // Workflow (drag-and-drop canvas)
  saveWorkflow: (id: string, payload: Record<string, unknown>) =>
    apiFetch(`/api/agents/${id}/workflow`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export const dashboard = {
  /** Full stats overview (calls, bookings, escalations, agents) */
  overview: () => apiFetch('/api/dashboard/stats'),

  /** Today's call count and total duration */
  callsToday: () => apiFetch('/api/dashboard/calls-today'),

  /** Minutes used, rollover status, overage warnings */
  usage: () => apiFetch('/api/dashboard/usage'),

  /** Stripe revenue and overage charges */
  revenue: () => apiFetch('/api/dashboard/revenue'),

  /** Usage alerts (80 % / 100 % threshold warnings) */
  alerts: () => apiFetch('/api/dashboard/alerts'),

  /** Recent calls list */
  calls: () => apiFetch('/api/calls/list'),

  /** Synthesize a voice sample and return an audio URL */
  voicePreview: (text: string, language = 'english', voice_id?: string) =>
    apiFetch('/api/dashboard/voice-preview', {
      method: 'POST',
      body: JSON.stringify({ text, language, voice_id }),
    }),
};

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export const billing = {
  plans: () => apiFetch('/api/billing/plans'),

  status: () => apiFetch('/api/billing/status'),

  createCheckout: (plan: 'starter' | 'growth' | 'scale') =>
    apiFetch('/api/billing/create-checkout', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    }),

  createPortal: () =>
    apiFetch('/api/billing/create-portal', { method: 'POST' }),
};

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

export const integrations = {
  googleCalendar: {
    connect: (payload: Record<string, unknown>) =>
      apiFetch('/api/integrations/google-calendar/connect', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    status: () => apiFetch('/api/integrations/google-calendar/status'),
  },

  whatsapp: {
    connect: (payload: Record<string, unknown>) =>
      apiFetch('/api/integrations/whatsapp/connect', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    status: () => apiFetch('/api/integrations/whatsapp/status'),
  },
};
