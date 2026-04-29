'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { auth } from '@/lib/api';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setToken, setUser } = useAuthStore();

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      setToken(token);
      auth.me().then((res) => {
        setUser(res.data);
        if (res.data.onboarding_complete) {
          router.push('/dashboard');
        } else {
          router.push('/onboarding');
        }
      }).catch(() => {
        router.push('/login');
      });
    } else {
      router.push('/login');
    }
  }, [router, searchParams, setToken, setUser]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
    </div>
  );
}
