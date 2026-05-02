'use client';

import { useDashboard } from '@/hooks/useDashboard';
import { useAgents } from '@/hooks/useAgents';

export default function DashboardPage() {
  const { overview, recentActivity, loading: dashboardLoading } = useDashboard();
  const { list: agentsList, toggleStatus, loading: agentsLoading } = useAgents();

  if (dashboardLoading || agentsLoading) {
    return <div className="p-8">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <h1 className="text-xl font-bold sm:text-2xl">Dashboard Overview</h1>
      
      {/* StatCards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Calls Today" value={overview?.calls_today || 0} icon="📞" />
        <StatCard title="Answer Rate" value={`${((overview?.answer_rate || 0) * 100).toFixed(0)}%`} icon="📈" />
        <StatCard title="Bookings" value={overview?.bookings || 0} icon="📅" />
        <StatCard title="Escalations" value={overview?.escalations || 0} icon="🚨" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-6">
        {/* Live Activity */}
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          <div className="space-y-4">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity, i) => (
                <div key={i} className="flex items-center gap-4 py-2 border-b last:border-0">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <p className="text-sm text-gray-600">{activity.description}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-400">No recent activity</p>
            )}
          </div>
        </div>

        {/* Agents Status */}
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold mb-4">Agents Status</h2>
          <div className="space-y-4">
            {agentsList.map((agent) => (
              <div key={agent.id} className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{agent.name}</p>
                  <p className="text-xs text-gray-500">{agent.language}</p>
                </div>
                <button
                  onClick={() => toggleStatus(agent.id, agent.status)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    agent.status === 'active' ? 'bg-indigo-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      agent.status === 'active' ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: string | number; icon: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-500 text-sm font-medium">{title}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <div className="text-xl font-bold sm:text-2xl">{value}</div>
    </div>
  );
}
