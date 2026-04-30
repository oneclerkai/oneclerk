import { useEffect, useState } from 'react';
import { auth } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { useRouter } from 'next/navigation';

export const useAuth = () => {
  const { user, setUser, setToken, logout: storeLogout } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('oneclerk_token');
      if (token) {
        try {
          const res = await auth.me();
          setUser(res.data);
          setToken(token);
        } catch (error) {
          storeLogout();
        }
      }
      setLoading(false);
    };
    initAuth();
  }, [setUser, setToken, storeLogout]);

  const login = async (data: any) => {
    const res = await auth.login(data);
    setToken(res.data.access_token);
    const userRes = await auth.me();
    setUser(userRes.data);
    router.push('/dashboard');
  };

  const signup = async (data: any) => {
    const res = await auth.signup(data);
    setToken(res.data.access_token);
    const userRes = await auth.me();
    setUser(userRes.data);
    router.push('/onboarding');
  };

  const logout = () => {
    storeLogout();
    router.push('/login');
  };

  return { user, loading, login, logout, signup };
};
