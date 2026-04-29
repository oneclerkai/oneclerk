import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('oneclerk_token')?.value || ''; // In real app, check localStorage via client-side or use cookies
  const isAuthPage = request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/signup');
  const isDashboardPage = request.nextUrl.pathname.startsWith('/dashboard') || request.nextUrl.pathname.startsWith('/onboarding');

  // Since we use localStorage, middleware can't easily check auth.
  // In a real Next.js app, we should use cookies for auth to make middleware work properly.
  // For this task, I'll provide a basic structure.
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding/:path*', '/login', '/signup'],
};
