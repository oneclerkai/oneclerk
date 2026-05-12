import { useEffect, useState } from 'react'
import { billing } from '../lib/api'

export interface UsageData {
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

export interface BillingStatus {
  plan: string
  plan_name: string
  status: string
  calls_limit: number
  trial_ends_at: string | null
  stripe_customer_id: string | null
  stripe_ready: boolean
  usage: UsageData
}

export function useBilling() {
  const [status, setStatus] = useState<BillingStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    try {
      const data = await billing.status()
      setStatus(data)
      setError(null)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load billing status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const createCheckout = async (plan: 'starter' | 'growth' | 'scale') => {
    const data = await billing.createCheckout(plan)
    if (data?.checkout_url) {
      window.location.href = data.checkout_url
    }
  }

  const openPortal = async () => {
    const data = await billing.createPortal()
    if (data?.portal_url) {
      window.location.href = data.portal_url
    }
  }

  return { status, loading, error, refresh, createCheckout, openPortal }
}
