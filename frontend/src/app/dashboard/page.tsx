/**
 * Dashboard overview — stats, voice preview, usage widget, MMI codes.
 */
'use client'

import React, { useEffect, useState } from 'react'
import UsageWidget from '../../components/UsageWidget'
import MMICarrierCodes from '../../components/MMICarrierCodes'
import VoicePreview from '../../components/VoicePreview'
import { dashboard, billing, agents } from '../../lib/api'

interface Stats {
  total_calls: number
  calls_today: number
  bookings_today: number
  escalations_today: number
  active_agents: number
  urgent_today: number
}

interface BillingStatus {
  plan: string
  plan_name: string
  usage: {
    minutes_used: number
    minutes_included: number
    rollover_minutes: number
    total_available: number
    minutes_remaining: number
    overage_minutes: number
    overage_cost_inr: number
    pct_used: number
    alert_80: boolean
    alert_100: boolean
    allow_overage: boolean
  }
}

interface Agent {
  id: string
  name: string
  is_active: boolean
  telnyx_phone?: string
  config?: { business_name?: string }
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string
  value: number | string
  icon: string
  color: string
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl">{icon}</span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>{label}</span>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null)
  const [agentList, setAgentList] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [statsData, billingData, agentsData] = await Promise.all([
          dashboard.overview().catch(() => null),
          billing.status().catch(() => null),
          agents.list().catch(() => ({ agents: [] })),
        ])
        if (statsData) setStats(statsData)
        if (billingData) setBillingStatus(billingData)
        setAgentList(agentsData?.agents ?? [])
      } finally {
        setLoading(false)
      }
    }
    load()
    const timer = setInterval(load, 30_000)
    return () => clearInterval(timer)
  }, [])

  const activeAgent = agentList.find((a) => a.is_active)
  const forwardingNumber = activeAgent?.telnyx_phone

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" aria-label="Loading" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Your AI receptionist at a glance</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Calls"
          value={stats?.total_calls ?? 0}
          icon="📞"
          color="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Today"
          value={stats?.calls_today ?? 0}
          icon="📅"
          color="bg-green-50 text-green-600"
        />
        <StatCard
          label="Bookings Today"
          value={stats?.bookings_today ?? 0}
          icon="📆"
          color="bg-purple-50 text-purple-600"
        />
        <StatCard
          label="Urgent Today"
          value={stats?.urgent_today ?? 0}
          icon="🚨"
          color="bg-red-50 text-red-600"
        />
      </div>

      {/* Voice preview */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Agent Voice Preview</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Hear exactly how your agent will sound on a live call.
            </p>
          </div>
          {activeAgent && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              {activeAgent.name} · Live
            </span>
          )}
        </div>
        <VoicePreview
          agentName={activeAgent?.name}
          businessName={activeAgent?.config?.business_name}
        />
      </div>

      {/* Usage + MMI codes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {billingStatus?.usage && (
          <UsageWidget usage={billingStatus.usage} planName={billingStatus.plan_name} />
        )}
        <MMICarrierCodes forwardingNumber={forwardingNumber} />
      </div>
    </div>
  )
}
