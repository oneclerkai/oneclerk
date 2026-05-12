/**
 * Agents page — lists agents and opens the AgentBuilder for create/edit.
 */
'use client'

import React, { useEffect, useState } from 'react'
import AgentBuilder from '../../../components/AgentBuilder'
import { agents } from '../../../lib/api'

interface Agent {
  id: string
  name: string
  status: string
  is_active: boolean
  telnyx_phone?: string
  calls_this_month: number
  total_calls: number
}

export default function AgentsPage() {
  const [agentList, setAgentList] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const load = async () => {
    try {
      const data = await agents.list()
      setAgentList(data?.agents ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSave = async (config: any) => {
    setIsSaving(true)
    try {
      if (editingAgent) {
        await agents.update(editingAgent.id, config)
      } else {
        await agents.create(config)
      }
      setShowBuilder(false)
      setEditingAgent(null)
      await load()
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggle = async (agent: Agent) => {
    if (agent.is_active) {
      await agents.deactivate(agent.id)
    } else {
      await agents.activate(agent.id)
    }
    await load()
  }

  if (showBuilder) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => { setShowBuilder(false); setEditingAgent(null) }}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to agents
        </button>
        <AgentBuilder
          initial={editingAgent ? { name: editingAgent.name } : undefined}
          onSave={handleSave}
          isSaving={isSaving}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Agents</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your AI receptionists</p>
        </div>
        <button
          onClick={() => setShowBuilder(true)}
          className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          + New Agent
        </button>
      </div>

      {/* Agent list */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" aria-label="Loading" />
        </div>
      ) : agentList.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
          <p className="text-4xl mb-3">🤖</p>
          <p className="text-gray-600 font-medium">No agents yet</p>
          <p className="text-sm text-gray-400 mt-1">Create your first AI receptionist to get started.</p>
          <button
            onClick={() => setShowBuilder(true)}
            className="mt-4 py-2 px-5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Create Agent
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agentList.map((agent) => (
            <div key={agent.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{agent.name}</h3>
                  {agent.telnyx_phone && (
                    <p className="text-xs text-gray-500 mt-0.5">{agent.telnyx_phone}</p>
                  )}
                </div>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    agent.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {agent.is_active ? 'Active' : agent.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                <div>
                  <p className="font-medium text-gray-700 text-sm">{agent.calls_this_month}</p>
                  <p>calls this month</p>
                </div>
                <div>
                  <p className="font-medium text-gray-700 text-sm">{agent.total_calls}</p>
                  <p>total calls</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { setEditingAgent(agent); setShowBuilder(true) }}
                  className="flex-1 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleToggle(agent)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    agent.is_active
                      ? 'bg-red-50 text-red-600 hover:bg-red-100'
                      : 'bg-green-50 text-green-600 hover:bg-green-100'
                  }`}
                >
                  {agent.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
