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

// Auth API
export const auth = {
  login: async (email: string, password: string) => {
    return apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  signup: async (email: string, password: string, name?: string, whatsapp_number?: string) => {
    return apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, whatsapp_number }),
    });
  },

  /** Google OAuth — pass the ID token from @react-oauth/google */
  googleLogin: async (idToken: string) => {
    return apiFetch('/api/auth/google-login', {
      method: 'POST',
      body: JSON.stringify({ id_token: idToken }),
    });
  },

  /** Legacy Google auth endpoint — accepts 'credential' field */
  googleAuth: async (credential: string) => {
    return apiFetch('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    });
  },

  sendEmailOtp: async (email: string) => {
    return apiFetch('/api/auth/send-email-otp', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  sendEmailVerificationLink: async (email: string) => {
    return apiFetch('/api/auth/send-email-verification-link', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  /** Send verification email to the currently logged-in user */
  sendVerificationEmail: async () => {
    return apiFetch('/api/auth/send-verification-email', {
      method: 'POST',
    });
  },

  /** Resend verification email to the currently logged-in user */
  resendVerificationEmail: async () => {
    return apiFetch('/api/auth/resend-verification-email', {
      method: 'POST',
    });
  },

  /** Verify email token for already-registered users (GET endpoint) */
  verifyEmail: async (token: string, userId: string) => {
    return apiFetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}&user_id=${encodeURIComponent(userId)}`);
  },

  verifyEmailOtpAndSignup: async (data: {
    email: string;
    password: string;
    otp: string;
    name?: string;
    whatsapp_number?: string;
  }) => {
    return apiFetch('/api/auth/verify-email-otp-and-signup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  verifyEmailLink: async (data: {
    token: string;
    email: string;
    password: string;
    name?: string;
    whatsapp_number?: string;
  }) => {
    return apiFetch('/api/auth/verify-email-link', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  sendPhoneOtp: async (phone_number: string) => {
    return apiFetch('/api/auth/send-phone-otp', {
      method: 'POST',
      body: JSON.stringify({ phone_number }),
    });
  },

  verifyPhoneOtp: async (phone_number: string, otp: string) => {
    return apiFetch('/api/auth/verify-phone-otp', {
      method: 'POST',
      body: JSON.stringify({ phone_number, otp }),
    });
  },

  me: async () => {
    return apiFetch('/api/auth/me');
  },

  logout: async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore errors — we always clear the token locally
    } finally {
      clearToken();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  },

  saveOnboarding: async (profile: Record<string, unknown>, completed: boolean = true) => {
    return apiFetch('/api/auth/onboarding', {
      method: 'POST',
      body: JSON.stringify({ profile, completed }),
    });
  },
};

// Dashboard API
export const dashboard = {
  overview: async () => {
    return apiFetch('/api/dashboard/stats');
  },

  callsToday: async () => {
    return apiFetch('/api/dashboard/calls-today');
  },

  usage: async () => {
    return apiFetch('/api/dashboard/usage');
  },

  revenue: async () => {
    return apiFetch('/api/dashboard/revenue');
  },

  alerts: async () => {
    return apiFetch('/api/dashboard/alerts');
  },

  /** @deprecated Use overview() — kept for backward compatibility */
  calls: async () => {
    return apiFetch('/api/calls/list').catch(() => ({ calls: [] }));
  },

  voicePreview: async (text: string, language: string = 'english', voice_id?: string) => {
    return apiFetch('/api/dashboard/voice-preview', {
      method: 'POST',
      body: JSON.stringify({ text, language, voice_id }),
    });
  },
};

// Billing API
export const billing = {
  plans: async () => {
    return apiFetch('/api/billing/plans');
  },

  status: async () => {
    return apiFetch('/api/billing/status');
  },

  createCheckout: async (plan: string) => {
    return apiFetch('/api/billing/create-checkout', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    });
  },

  createPortal: async () => {
    return apiFetch('/api/billing/create-portal', {
      method: 'POST',
    });
  },
};

// Agents API
export const agents = {
  list: async () => {
    return apiFetch('/api/agents/list');
  },

  create: async (data: {
    name: string;
    config: Record<string, unknown>;
    forwarding_number?: string;
    twilio_number?: string;
    voice_id?: string;
    language?: string;
  }) => {
    return apiFetch('/api/agents/create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  get: async (agent_id: string) => {
    return apiFetch(`/api/agents/${agent_id}`);
  },

  update: async (
    agent_id: string,
    data: {
      name: string;
      config: Record<string, unknown>;
      forwarding_number?: string;
      twilio_number?: string;
      voice_id?: string;
      language?: string;
    }
  ) => {
    return apiFetch(`/api/agents/${agent_id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  activate: async (agent_id: string) => {
    return apiFetch(`/api/agents/${agent_id}/activate`, {
      method: 'POST',
    });
  },

  deactivate: async (agent_id: string) => {
    return apiFetch(`/api/agents/${agent_id}/deactivate`, {
      method: 'POST',
    });
  },

  delete: async (agent_id: string) => {
    return apiFetch(`/api/agents/${agent_id}`, {
      method: 'DELETE',
    });
  },

  setupInstructions: async (agent_id: string, carrier: string = 'generic') => {
    return apiFetch(`/api/agents/${agent_id}/setup-instructions?carrier=${carrier}`);
  },

  /** Test voice synthesis for an agent */
  testVoice: async (agent_id: string, text?: string, language?: string, voice_id?: string) => {
    return apiFetch(`/api/agents/${agent_id}/test-voice`, {
      method: 'POST',
      body: JSON.stringify({ text, language, voice_id }),
    });
  },

  /** List available voices for an agent */
  voices: async (agent_id: string) => {
    return apiFetch(`/api/agents/${agent_id}/voices`);
  },

  /** Configure a phone number for an agent */
  configurePhone: async (agent_id: string, phone_number: string) => {
    return apiFetch(`/api/agents/${agent_id}/configure-phone`, {
      method: 'POST',
      body: JSON.stringify({ phone_number }),
    });
  },

  /** Get phone number status for an agent */
  phoneStatus: async (agent_id: string) => {
    return apiFetch(`/api/agents/${agent_id}/phone-status`);
  },

  /** Save workflow (drag-and-drop canvas) for an agent */
  saveWorkflow: async (agent_id: string, flow: { nodes: unknown[]; edges: unknown[] }) => {
    return apiFetch(`/api/agents/${agent_id}/workflow`, {
      method: 'POST',
      body: JSON.stringify({ flow }),
    });
  },

  /** Get agent config for preview */
  preview: async (agent_id: string) => {
    return apiFetch(`/api/agents/${agent_id}/preview`);
  },

  /** Test chat with an agent (text-based, same AI brain as voice) */
  testChat: async (agent_id: string, message: string, history: { role: string; content: string }[] = []) => {
    return apiFetch(`/api/agents/${agent_id}/test-chat`, {
      method: 'POST',
      body: JSON.stringify({ message, history }),
    });
  },

  /** Provision a Telnyx phone number for an agent */
  getTelnyxNumber: async (agent_id: string) => {
    return apiFetch(`/api/agents/${agent_id}/get-telnyx-number`, {
      method: 'POST',
    });
  },
};

// Integrations API
export const integrations = {
  googleCalendar: {
    connect: async () => {
      return apiFetch('/api/integrations/google-calendar/connect', {
        method: 'POST',
      });
    },

    status: async () => {
      return apiFetch('/api/integrations/google-calendar/status');
    },
  },

  whatsapp: {
    connect: async (phone_number: string) => {
      return apiFetch('/api/integrations/whatsapp/connect', {
        method: 'POST',
        body: JSON.stringify({ phone_number }),
      });
    },

    status: async () => {
      return apiFetch('/api/integrations/whatsapp/status');
    },
  },
};
