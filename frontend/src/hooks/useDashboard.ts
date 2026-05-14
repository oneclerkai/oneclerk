import { useEffect, useState } from 'react'
import { dashboard } from '../lib/api'

export function useDashboard() {
  const [overview, setOverview] = useState<any>(null)
  const [callsToday, setCallsToday] = useState<any>(null)
  const [usage, setUsage] = useState<any>(null)
  const [alerts, setAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const [overviewData, callsTodayData, usageData, alertsData] = await Promise.all([
          dashboard.overview().catch(() => null),
          dashboard.callsToday().catch(() => null),
          dashboard.usage().catch(() => null),
          dashboard.alerts().catch(() => ({ alerts: [] })),
        ])
        if (!active) return
        if (overviewData) setOverview(overviewData)
        if (callsTodayData) setCallsToday(callsTodayData)
        if (usageData) setUsage(usageData)
        setAlerts(alertsData?.alerts ?? [])
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    const timer = setInterval(load, 30_000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  return { overview, callsToday, usage, alerts, loading }
}
