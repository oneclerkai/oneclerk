import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  full_name: string;
  onboarding_complete: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setUser: (user) => set({ user }),
      setToken: (token) => {
        if (token) localStorage.setItem('oneclerk_token', token);
        else localStorage.removeItem('oneclerk_token');
        set({ token });
      },
      logout: () => {
        localStorage.removeItem('oneclerk_token');
        set({ user: null, token: null });
      },
    }),
    {
      name: 'auth-storage',
    }
  )
);

interface UIState {
  sidebarOpen: boolean;
  activePage: string;
  setSidebarOpen: (open: boolean) => void;
  setActivePage: (page: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  activePage: 'dashboard',
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setActivePage: (page) => set({ activePage: page }),
}));
