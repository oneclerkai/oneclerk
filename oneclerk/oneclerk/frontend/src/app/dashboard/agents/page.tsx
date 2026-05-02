'use client';

import { useAgents } from '@/hooks/useAgents';
import Link from 'next/link';

export default function AgentsPage() {
  const { list, loading, toggleStatus } = useAgents();

  if (loading) return <div className="p-8">Loading agents...</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Your AI Agents</h1>
          <p className="text-gray-500">Manage and monitor your virtual receptionists</p>
        </div>
        <Link
          href="/dashboard/agents/new"
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
        >
          + Create New Agent
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {list.map((agent) => (
          <div key={agent.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center text-xl">
                  🤖
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{agent.name}</h3>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">{agent.language}</p>
                </div>
              </div>
              <button
                onClick={() => toggleStatus(agent.id, agent.status)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  agent.status === 'active' ? 'bg-green-500' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    agent.status === 'active' ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 py-4 border-y border-gray-50 my-4">
              <div>
                <p className="text-xs text-gray-400 uppercase font-semibold">Calls this month</p>
                <p className="text-lg font-bold">{agent.calls_this_month || 0}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase font-semibold">Total Minutes</p>
                <p className="text-lg font-bold">{(agent.total_minutes || 0).toFixed(1)}</p>
              </div>
            </div>

            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-gray-500">
                {agent.telnyx_phone || 'Number pending...'}
              </div>
              <Link
                href={`/dashboard/agents/${agent.id}`}
                className="text-indigo-600 hover:text-indigo-700 text-sm font-semibold"
              >
                Configure →
              </Link>
            </div>
          </div>
        ))}

        <Link
          href="/dashboard/agents/new"
          className="border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center text-gray-400 hover:border-indigo-300 hover:text-indigo-400 transition-all"
        >
          <span className="text-4xl mb-2">+</span>
          <span className="font-medium">Add New Receptionist</span>
        </Link>
      </div>
    </div>
  );
}
