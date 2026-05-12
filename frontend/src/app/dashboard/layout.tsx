/**
 * Dashboard shell layout.
 *
 * Desktop: fixed left sidebar + main content area.
 * Mobile:  full-width content + fixed bottom navigation bar.
 */
'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import MobileNav from '../../components/MobileNav'

const SIDEBAR_LINKS = [
  { href: '/dashboard', label: 'Overview', icon: '🏠' },
  { href: '/dashboard/agents', label: 'Agents', icon: '🤖' },
  { href: '/dashboard/calls', label: 'Call Logs', icon: '📞' },
  { href: '/dashboard/billing', label: 'Billing', icon: '💳' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
]
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-gray-200 z-40">
        {/* Logo */}
        <div className="flex items-center gap-2 px-6 py-5 border-b border-gray-100">
          <span className="text-2xl">📞</span>
          <span className="text-lg font-bold text-gray-900">OneClerk</span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Sidebar navigation">
          {SIDEBAR_LINKS.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
            return (
              <a
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="text-base">{link.icon}</span>
                {link.label}
              </a>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-gray-100 space-y-2">
          <button
            onClick={() => { localStorage.removeItem('oneclerk_token'); window.location.href = '/login' }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
          <p className="text-xs text-gray-400 px-3">OneClerk v1.0</p>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 lg:ml-64 pb-20 lg:pb-0">
        {/* Top bar (mobile only) */}
        <header className="lg:hidden flex items-center justify-between px-4 py-4 bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <span className="text-xl">📞</span>
            <span className="text-base font-bold text-gray-900">OneClerk</span>
          </div>
        </header>

        <div className="px-4 sm:px-6 lg:px-8 py-6">{children}</div>
      </main>

      {/* ── Mobile bottom nav ── */}
      <MobileNav currentPath={pathname} />
    </div>
  )
}
