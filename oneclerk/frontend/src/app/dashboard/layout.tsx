'use client';

import Link from 'next/link';
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

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } transition-all duration-300 bg-white border-r border-gray-200 flex flex-col`}
      >
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">O</div>
          {sidebarOpen && <span className="text-xl font-bold text-gray-900">OneClerk</span>}
        </div>

        <nav className="flex-1 px-4 space-y-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
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

        <div className="p-4 border-t border-gray-100">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full flex items-center gap-3 px-3 py-2 text-gray-500 hover:bg-gray-100 rounded-lg"
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
