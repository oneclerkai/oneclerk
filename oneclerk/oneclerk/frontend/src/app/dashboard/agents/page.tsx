'use client';

import { useAgents } from '@/hooks/useAgents';
import Link from 'next/link';

export default function AgentsPage() {
  const { list, loading, toggleStatus } = useAgents();

  if (loading) return <div className="p-8">Loading agents...</div>;

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Your AI Agents</h1>
          <p className="text-sm text-gray-500 sm:text-base">Manage and monitor your virtual receptionists</p>
        </div>
        <Link
          href="/dashboard/agents/new"
          className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition-colors hover:bg-indigo-700 sm:w-auto"
        >
          + Create New Agent
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
        {list.map((agent) => (
          <div key={agent.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-6">
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

            <div className="my-4 grid grid-cols-2 gap-3 border-y border-gray-50 py-4 sm:gap-4">
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
          className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 p-4 text-gray-400 transition-all hover:border-indigo-300 hover:text-indigo-400 sm:p-6"
        >
          <span className="text-4xl mb-2">+</span>
          <span className="font-medium">Add New Receptionist</span>
        </Link>
      </div>
    </div>
  );
}
