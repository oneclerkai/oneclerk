/**
 * Dashboard overview page — stats, usage widget, and MMI carrier codes.
 */
'use client'

import React, { useEffect, useState } from 'react'
import UsageWidget from '../../components/UsageWidget'
import MMICarrierCodes from '../../components/MMICarrierCodes'
import { dashboard, billing, agents } from '../../lib/api'

interface Stats {
  total_calls: number
  calls_today: number
  bookings_today: number
  escalations_today: number
  active_agents: number
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

function StatCard({ label, value, icon, color }: { label: string; value: number | string; icon: string; color: string }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-5`}>
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
  const [forwardingNumber, setForwardingNumber] = useState<string | undefined>()
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
        // Use the first active agent's telnyx number as the forwarding number
        const activeAgent = (agentsData?.agents ?? []).find((a: any) => a.is_active)
        if (activeAgent?.telnyx_phone) setForwardingNumber(activeAgent.telnyx_phone)
      } finally {
        setLoading(false)
      }
    }
    load()
    const timer = setInterval(load, 30_000)
    return () => clearInterval(timer)
  }, [])

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
        <StatCard label="Total Calls" value={stats?.total_calls ?? 0} icon="📞" color="bg-blue-50 text-blue-600" />
        <StatCard label="Today" value={stats?.calls_today ?? 0} icon="📅" color="bg-green-50 text-green-600" />
        <StatCard label="Bookings" value={stats?.bookings_today ?? 0} icon="📆" color="bg-purple-50 text-purple-600" />
        <StatCard label="Escalations" value={stats?.escalations_today ?? 0} icon="🚨" color="bg-red-50 text-red-600" />
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
