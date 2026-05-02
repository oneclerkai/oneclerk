import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:8000' : '');

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('oneclerk_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('oneclerk_token');
      if (window.location.pathname !== '/login' && window.location.pathname !== '/signup') {
        window.location.href = '/login';
      }
    } else if (!error.response) {
      toast.error('Connection error');
    }
    return Promise.reject(error);
  }
);

export const auth = {
  signup: (data: any) => api.post('/api/auth/signup', data),
  login: (data: any) => api.post('/api/auth/login', data),
  googleUrl: () => api.get('/api/auth/google'),
  me: () => api.get('/api/auth/me'),
  logout: () => api.post('/api/auth/logout'),
};

export const agents = {
  list: () => api.get('/api/agents'),
  create: (data: any) => api.post('/api/agents', data),
  get: (id: string) => api.get(`/api/agents/${id}`),
  update: (id: string, data: any) => api.patch(`/api/agents/${id}`, data),
  delete: (id: string) => api.delete(`/api/agents/${id}`),
  activate: (id: string) => api.post(`/api/agents/${id}/activate`),
  deactivate: (id: string) => api.post(`/api/agents/${id}/deactivate`),
  getNumber: (id: string) => api.post(`/api/agents/${id}/get-number`),
  getInstructions: (id: string) => api.get(`/api/agents/${id}/setup-instructions`),
  testCall: (id: string) => api.post(`/api/agents/${id}/test`),
  getAvailability: (id: string, date: string) => api.get(`/api/agents/${id}/availability`, { params: { date } }),
};

export const dashboard = {
  overview: () => api.get('/api/dashboard/overview'),
  calls: (params: any) => api.get('/api/dashboard/calls', { params }),
  callDetail: (id: string) => api.get(`/api/dashboard/calls/${id}`),
  recentActivity: () => api.get('/api/dashboard/recent-activity'),
  agentPerformance: () => api.get('/api/dashboard/agents/performance'),
};

export const billing = {
  checkout: (plan: string) => api.post('/api/billing/create-checkout', { plan }),
  portal: () => api.post('/api/billing/create-portal'),
  status: () => api.get('/api/billing/status'),
  usage: () => api.get('/api/billing/usage'),
};

export const integrations = {
  list: () => api.get('/api/integrations'),
  connectCalendar: () => api.post('/api/integrations/google-calendar/connect'),
  status: () => api.get('/api/integrations/status'),
};
