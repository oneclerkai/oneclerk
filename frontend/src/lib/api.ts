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

// ... rest of your auth, agents, dashboard exports stay exactly the same ...
// Keep the exports (auth, agents, dashboard, billing) as they are in your file.
