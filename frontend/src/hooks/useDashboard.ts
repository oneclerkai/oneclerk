import { useEffect, useState } from 'react'
import { dashboard } from '../lib/api'

export function useDashboard() {
  const [overview, setOverview] = useState<any>(null)
  const [calls, setCalls] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      const [overviewData, callsData] = await Promise.all([dashboard.overview(), dashboard.calls()])
      if (!active) return
      setOverview(overviewData)
      setCalls(callsData.calls || [])
      setLoading(false)
    }
    load()
    const timer = setInterval(load, 10000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  return { overview, calls, loading }
}
