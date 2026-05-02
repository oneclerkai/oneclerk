'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useUIStore } from '@/lib/store';

const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: '📊' },
  { name: 'Calls', href: '/dashboard/calls', icon: '📞' },
  { name: 'Agents', href: '/dashboard/agents', icon: '🤖' },
  { name: 'Integrations', href: '/dashboard/integrations', icon: '🔌' },
  { name: 'Settings', href: '/dashboard/settings', icon: '⚙️' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { sidebarOpen, setSidebarOpen } = useUIStore();

  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, [setSidebarOpen]);

  return (
    <div className="flex h-screen flex-col bg-gray-50 md:flex-row">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 md:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700"
        >
          Menu
        </button>
        <span className="text-base font-semibold text-gray-900">OneClerk</span>
        <button
          onClick={logout}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700"
        >
          Logout
        </button>
      </header>

      {sidebarOpen && (
        <button
          aria-label="Close menu overlay"
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'translate-x-0 md:w-64' : '-translate-x-full md:w-20 md:translate-x-0'
        } fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-gray-200 bg-white transition-all duration-300 md:static md:w-64`}
      >
        <div className="flex items-center gap-3 p-5">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">O</div>
          {sidebarOpen && <span className="text-lg font-bold text-gray-900">OneClerk</span>}
        </div>

        <nav className="flex-1 space-y-2 px-3">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                {sidebarOpen && <span className="font-medium">{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-gray-100 p-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden w-full items-center gap-3 rounded-lg px-3 py-2 text-gray-500 hover:bg-gray-100 md:flex"
          >
            <span>{sidebarOpen ? '◀️' : '▶️'}</span>
            {sidebarOpen && <span>Collapse</span>}
          </button>
          
          <div className="mt-4 flex items-center gap-3 px-3">
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold">
              {user?.full_name?.charAt(0) || 'U'}
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user?.full_name}</p>
                <button onClick={logout} className="text-xs text-red-500 hover:text-red-600">Logout</button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
