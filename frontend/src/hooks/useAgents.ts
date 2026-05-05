import { useEffect, useState } from 'react'
import { agents } from '../lib/api'

export function useAgents() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    const data = await agents.list()
    setItems(data.agents || [])
    setLoading(false)
  }

  useEffect(() => {
    refresh()
  }, [])

  const create = async (payload: any) => {
    const result = await agents.create(payload)
    await refresh()
    return result
  }

  const update = async (id: string, payload: any) => {
    const previous = items
    setItems(items.map(item => item.id === id ? { ...item, ...payload } : item))
    try {
      return await agents.update(id, payload)
    } catch (error) {
      setItems(previous)
      throw error
    }
  }

  const remove = async (id: string) => {
    await agents.delete(id)
    await refresh()
  }

  return { items, loading, refresh, create, update, remove }
}
