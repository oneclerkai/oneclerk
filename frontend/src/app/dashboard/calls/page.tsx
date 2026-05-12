/**
 * Calls page — recent call log with transcript viewer.
 */
'use client'

import React, { useEffect, useState } from 'react'
import { dashboard } from '../../../lib/api'

interface Call {
  id: string
  caller_number: string
  duration_seconds: number
  status: string
  is_urgent: boolean
  booking_made: boolean
  summary: string | null
  conversation: { role: string; content: string }[]
  created_at: string | null
  ended_at: string | null
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

function StatusBadge({ call }: { call: Call }) {
  if (call.is_urgent)
    return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Urgent</span>
  if (call.booking_made)
    return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Booked</span>
  return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{call.status}</span>
}

function CallDetail({ call, onClose }: { call: Call; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Call from</p>
            <p className="text-xl font-bold text-gray-900">{call.caller_number || 'Unknown'}</p>
            <p className="text-sm text-gray-500 mt-0.5">
              {call.created_at ? new Date(call.created_at).toLocaleString() : '—'}
              {' · '}{call.duration_seconds}s
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge call={call} />
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 text-lg"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Summary */}
          {call.summary && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Summary</p>
              <p className="text-sm text-gray-700 leading-relaxed">{call.summary}</p>
            </div>
          )}

          {/* Transcript */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Transcript</p>
            {call.conversation.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No transcript captured.</p>
            ) : (
              <div className="space-y-2">
                {call.conversation.map((turn, i) => (
                  <div
                    key={i}
                    className={`flex gap-3 ${turn.role === 'assistant' ? 'flex-row-reverse' : ''}`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        turn.role === 'user'
                          ? 'bg-gray-100 text-gray-500'
                          : 'bg-gray-900 text-yellow-400'
                      }`}
                    >
                      {turn.role === 'user' ? 'C' : 'AI'}
                    </div>
                    <div
                      className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        turn.role === 'user'
                          ? 'bg-gray-100 text-gray-800'
                          : 'bg-yellow-50 text-gray-800'
                      }`}
                    >
                      {turn.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CallsPage() {
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Call | null>(null)
  const [filter, setFilter] = useState<'all' | 'urgent' | 'booked'>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const data = await dashboard.calls()
        setCalls(data.calls || [])
      } finally {
        setLoading(false)
      }
    }
    load()
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [])

  const filtered = calls.filter((c) => {
    if (filter === 'urgent' && !c.is_urgent) return false
    if (filter === 'booked' && !c.booking_made) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        (c.caller_number || '').includes(q) ||
        (c.summary || '').toLowerCase().includes(q) ||
        c.conversation.some((t) => t.content.toLowerCase().includes(q))
      )
    }
    return true
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Call Logs</h1>
        <p className="text-sm text-gray-500 mt-1">Every call, every transcript, every booking</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by number, summary, or transcript…"
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <div className="flex gap-2">
          {(['all', 'urgent', 'booked'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-colors ${
                filter === f
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
          <p className="text-3xl mb-3">📞</p>
          <p className="text-gray-600 font-medium">
            {calls.length === 0 ? 'No calls yet' : 'No calls match your filter'}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {calls.length === 0
              ? 'Activate an agent and forward your business number to get started.'
              : 'Try clearing the search or changing the filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((call) => (
            <button
              key={call.id}
              onClick={() => setSelected(call)}
              className={`w-full text-left bg-white rounded-2xl border shadow-sm p-4 hover:shadow-md transition-all flex items-stretch gap-4 ${
                call.is_urgent
                  ? 'border-l-4 border-l-red-400 border-gray-100'
                  : call.booking_made
                  ? 'border-l-4 border-l-green-400 border-gray-100'
                  : 'border-gray-100'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <StatusBadge call={call} />
                  <span className="text-xs text-gray-400">
                    {call.created_at ? timeAgo(call.created_at) : ''}
                  </span>
                </div>
                <p className="font-semibold text-gray-900 text-sm">{call.caller_number || 'Unknown'}</p>
                {call.summary && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{call.summary}</p>
                )}
              </div>
              <div className="text-right flex-shrink-0 flex flex-col justify-between">
                <span className="text-xs text-gray-400">{call.duration_seconds}s</span>
                <span className="text-xs text-gray-300">→</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && <CallDetail call={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
