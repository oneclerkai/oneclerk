import axios from 'axios';

// 1. Get the Backend URL from your environment variables
// It defaults to localhost if the variable isn't found
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 2. Request Interceptor: Automatically attach your JWT Token to every call
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('oneclerk_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// 3. Response Interceptor: Catch "Unauthorized" errors (token expired)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn("Session expired. Redirecting to login...");
      if (typeof window !== 'undefined') {
        localStorage.removeItem('oneclerk_token');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export function setToken(token: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('oneclerk_token', token);
  }
}

export function getToken() {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem('oneclerk_token');
}

export function clearToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('oneclerk_token');
  }
}

export const auth = {
  login: (data: any, password?: string) => {
    const payload = typeof data === 'string' && password ? { email: data, password } : data
    return api.post('/api/auth/login', payload).then((res) => res.data)
  },
  signup: (data: any) => api.post('/api/auth/signup', data).then((res) => res.data),
  me: () => api.get('/api/auth/me').then((res) => res.data),
  logout: () => {
    clearToken();
    return Promise.resolve({ logged_out: true });
  },
  sendEmailOtp: (email: string) => api.post('/api/auth/send-email-otp', { email }).then((res) => res.data),
  sendEmailVerificationLink: (email: string) => api.post('/api/auth/send-email-verification-link', { email }).then((res) => res.data),
  verifyEmailOtpAndSignup: (data: any) => api.post('/api/auth/verify-email-otp-and-signup', data).then((res) => res.data),
  verifyEmailLink: (data: any) => api.post('/api/auth/verify-email-link', data).then((res) => res.data),
  sendPhoneOtp: (phone: string) => api.post('/api/auth/send-phone-otp', { phone_number: phone }).then((res) => res.data),
  verifyPhoneOtp: (phone: string, otp: string) => api.post('/api/auth/verify-phone-otp', { phone_number: phone, otp }).then((res) => res.data),
  google: (credential: string) => api.post('/api/auth/google', { credential }).then((res) => res.data),
};

export const agents = {
  list: () => api.get('/api/agents/list').then((res) => res.data),
  create: (data: any) => api.post('/api/agents/create', data).then((res) => res.data),
  update: (id: string, data: any) => api.put(`/api/agents/${id}`, data).then((res) => res.data),
  get: (id: string) => api.get(`/api/agents/${id}`).then((res) => res.data),
  delete: (id: string) => api.delete(`/api/agents/${id}`).then((res) => res.data),
  activate: (id: string) => api.post(`/api/agents/${id}/activate`).then((res) => res.data),
  deactivate: (id: string) => api.post(`/api/agents/${id}/deactivate`).then((res) => res.data),
  getTelnyxNumber: (id: string) => api.post(`/api/agents/${id}/get-telnyx-number`).then((res) => res.data),
  connectGoogleCalendar: (id: string, credentials: any) => api.post(`/api/agents/${id}/google-calendar/connect`, { credentials }).then((res) => res.data),
  verifyGoogleCalendar: (id: string) => api.post(`/api/agents/${id}/google-calendar/verify`).then((res) => res.data),
  testChat: (id: string, message: string, history: any) => api.post(`/api/agents/${id}/test-chat`, { message, history }).then((res) => res.data),
  preview: (id: string, text: string) => api.post(`/api/agents/${id}/preview`, { text }).then((res) => res.data),
};

export const dashboard = {
  overview: () => api.get('/api/dashboard/overview').then((res) => res.data),
  calls: () => api.get('/api/dashboard/calls').then((res) => res.data),
  usage: () => api.get('/api/dashboard/usage').then((res) => res.data),
  voicePreview: (text: string, language: string) => api.post('/api/dashboard/voice-preview', { text, language }).then((res) => res.data),
};

export const billing = {
  status: () => api.get('/api/billing/status').then((res) => res.data),
  plans: () => api.get('/api/billing/plans').then((res) => res.data),
  createCheckout: (planId: string) => api.post('/api/billing/create-checkout', { plan_id: planId }).then((res) => res.data),
  createPortal: () => api.post('/api/billing/create-portal').then((res) => res.data),
};

export default api;

