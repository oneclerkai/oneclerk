'use client'
import React, { useEffect, useRef, useState } from 'react'
import AgentBuilder from '../../../components/AgentBuilder'
import VoicePreview from '../../../components/VoicePreview'
import MMICarrierCodes from '../../../components/MMICarrierCodes'
import { agents } from '../../../lib/api'

interface AgentFull {
  id: string
  name: string
  status: string
  is_active: boolean
  telnyx_phone?: string
  twilio_number?: string
  forwarding_number?: string
  calls_this_month: number
  total_calls: number
  voice_id?: string
  language?: string
  config?: Record<string, any>
  connection_status?: Record<string, boolean>
  activation_missing?: string[]
}

type View = 'list' | 'create' | 'edit' | 'setup'

export default function AgentsPage() {
  const [agentList, setAgentList] = useState<AgentFull[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('list')
  const [selected, setSelected] = useState<AgentFull | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const [provisioningId, setProvisioningId] = useState<string | null>(null)
  const [testMsg, setTestMsg] = useState('')
  const [testHistory, setTestHistory] = useState<{ role: string; content: string }[]>([])
  const [testLoading, setTestLoading] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const load = async () => {
    try {
      const data = await agents.list()
      setAgentList(data?.agents ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSave = async (payload: any) => {
    setIsSaving(true)
    try {
      if (view === 'edit' && selected) {
        const res = await agents.update(selected.id, payload)
        showToast('Agent saved')
        setSelected(res.agent)
        setView('setup')
      } else {
        const res = await agents.create(payload)
        showToast('Agent created — now connect it')
        setSelected(res.agent)
        setView('setup')
      }
      await load()
    } catch (e: any) {
      showToast(e.message || 'Save failed', 'err')
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggle = async (agent: AgentFull) => {
    try {
      if (agent.is_active) {
        await agents.deactivate(agent.id)
        showToast(`${agent.name} paused`)
      } else {
        await agents.activate(agent.id)
        showToast(`${agent.name} is live`)
      }
      await load()
      if (selected?.id === agent.id) {
        const fresh = (await agents.get(agent.id)).agent
        setSelected(fresh)
      }
    } catch (e: any) {
      showToast(e.message || 'Failed', 'err')
    }
  }

  const handleDelete = async (agent: AgentFull) => {
    if (!confirm(`Delete "${agent.name}"? This cannot be undone.`)) return
    try {
      await agents.delete(agent.id)
      showToast('Agent deleted')
      if (selected?.id === agent.id) { setSelected(null); setView('list') }
      await load()
    } catch (e: any) {
      showToast(e.message || 'Delete failed', 'err')
    }
  }

  const handleProvision = async (agent: AgentFull) => {
    setProvisioningId(agent.id)
    try {
      const res = await agents.getTelnyxNumber(agent.id)
      showToast(`Number provisioned: ${res.telnyx_number}`)
      await load()
      const fresh = (await agents.get(agent.id)).agent
      setSelected(fresh)
    } catch (e: any) {
      showToast(e.message || 'Provisioning failed', 'err')
    } finally {
      setProvisioningId(null)
    }
  }

  const handleTestChat = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!testMsg.trim() || !selected) return
    const msg = testMsg.trim()
    setTestMsg('')
    const newHistory = [...testHistory, { role: 'user', content: msg }]
    setTestHistory(newHistory)
    setTestLoading(true)
    try {
      const res = await agents.testChat(selected.id, msg, testHistory)
      setTestHistory([...newHistory, { role: 'assistant', content: res.reply || '(no reply)' }])
    } catch (e: any) {
      setTestHistory([...newHistory, { role: 'assistant', content: `Error: ${e.message}` }])
    } finally {
      setTestLoading(false)
      setTimeout(() => chatRef.current?.scrollTo({ top: 9999, behavior: 'smooth' }), 50)
    }
  }

  const goSetup = async (agent: AgentFull) => {
    const fresh = (await agents.get(agent.id)).agent
    setSelected(fresh)
    setTestHistory([])
    setView('setup')
  }

  if (view === 'create' || view === 'edit') {
    const initial = view === 'edit' && selected ? {
      name: selected.name,
      business_name: selected.config?.business_name || '',
      language: selected.language || 'english',
      voice_id: selected.voice_id || '',
      hours: selected.config?.operating_hours || 'Mon-Sat 9am-6pm',
      services: selected.config?.services || '',
      escalation_phone: selected.forwarding_number || '',
      calendly_url: selected.config?.calendly_url || '',
      timezone: selected.config?.timezone || 'Asia/Kolkata',
      faqs: [],
    } : undefined

    return (
      <div className="space-y-4">
        <button
          onClick={() => { setView('list'); setSelected(null) }}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 font-medium"
        >
          &larr; Back to agents
        </button>
        <AgentBuilder initial={initial} onSave={handleSave} isSaving={isSaving} />
        {toast && <Toast msg={toast.msg} type={toast.type} />}
      </div>
    )
  }

  if (view === 'setup' && selected) {
    const cfg = selected.config || {}
    const missing = selected.activation_missing || []
    const phone = selected.telnyx_phone || selected.twilio_number

    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setView('list')}
            className="text-sm text-gray-500 hover:text-gray-800 font-medium"
          >
            &larr; Agents
          </button>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-semibold text-gray-900">{selected.name}</span>
          <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${
            selected.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {selected.is_active ? 'Live' : selected.status}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Setup checklist</h2>
              <div className="space-y-3">
                <Step n={1} done={!!phone} title="Phone number"
                  desc={phone ? `Receiving calls on ${phone}` : 'Provision a Telnyx number to start receiving calls.'}>
                  {!phone ? (
                    <button
                      onClick={() => handleProvision(selected)}
                      disabled={provisioningId === selected.id}
                      className="text-xs font-semibold px-3 py-1.5 bg-gray-900 text-white rounded-lg disabled:opacity-50"
                    >
                      {provisioningId === selected.id ? 'Provisioning...' : 'Get number'}
                    </button>
                  ) : (
                    <CopyBtn text={phone} label="Copy" />
                  )}
                </Step>
                <Step n={2} done={!!cfg.owner_whatsapp} title="WhatsApp notifications"
                  desc={cfg.owner_whatsapp ? `Summaries sent to ${cfg.owner_whatsapp}` : 'Add your WhatsApp to receive call summaries.'}>
                  <button
                    onClick={() => setView('edit')}
                    className="text-xs font-semibold px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    {cfg.owner_whatsapp ? 'Edit' : 'Add'}
                  </button>
                </Step>
                <Step n={3} done={!!cfg.calendly_url} title="Booking link (optional)"
                  desc={cfg.calendly_url ? cfg.calendly_url.slice(0, 50) : 'Calendly URL for the AI to share when booking.'}>
                  <button
                    onClick={() => setView('edit')}
                    className="text-xs font-semibold px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    {cfg.calendly_url ? 'Edit' : 'Add'}
                  </button>
                </Step>
                <Step n={4} done={selected.is_active} title="Go live"
                  desc={selected.is_active ? 'Your agent is answering calls.' : missing.length ? `Still needed: ${missing.join(', ')}` : 'Activate to start handling calls.'}>
                  <button
                    onClick={() => handleToggle(selected)}
                    disabled={!selected.is_active && missing.length > 0}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40 ${
                      selected.is_active
                        ? 'bg-red-50 text-red-600 hover:bg-red-100'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    {selected.is_active ? 'Pause' : 'Activate'}
                  </button>
                </Step>
              </div>
            </div>

            {phone && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h2 className="font-semibold text-gray-900 mb-1">Call forwarding codes</h2>
                <p className="text-xs text-gray-500 mb-4">
                  Dial these codes from your business mobile to forward calls to OneClerk.
                </p>
                <MMICarrierCodes forwardingNumber={phone} />
              </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-900">Agent profile</h2>
                <button
                  onClick={() => setView('edit')}
                  className="text-xs font-semibold px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Edit profile
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <InfoPair label="Business" value={cfg.business_name || 'Not set'} />
                <InfoPair label="Language" value={selected.language || 'english'} />
                <InfoPair label="Hours" value={cfg.operating_hours || 'Not set'} />
                <InfoPair label="Services" value={cfg.services ? cfg.services.slice(0, 50) : 'Not set'} />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Voice preview</h2>
              <VoicePreview
                agentName={cfg.agent_name || selected.name}
                businessName={cfg.business_name}
                defaultLanguage={
                  selected.language === 'hindi' ? 'hi-IN'
                  : selected.language === 'arabic' ? 'ar-SA'
                  : selected.language === 'spanish' ? 'es-ES'
                  : selected.language === 'tamil' ? 'ta-IN'
                  : 'en-US'
                }
                compact
              />
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col" style={{ minHeight: 320 }}>
              <h2 className="font-semibold text-gray-900 mb-1">Test chat</h2>
              <p className="text-xs text-gray-500 mb-3">
                Type as if you are a caller. Same AI brain as the live call.
              </p>
              <div
                ref={chatRef}
                className="flex-1 overflow-y-auto space-y-2 mb-3"
                style={{ maxHeight: 220 }}
              >
                {testHistory.length === 0 && (
                  <p className="text-xs text-gray-400 italic">Send a message to test the agent...</p>
                )}
                {testHistory.map((t, i) => (
                  <div key={i} className={`flex ${t.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-xs px-3 py-2 rounded-xl text-sm leading-relaxed ${
                      t.role === 'user'
                        ? 'bg-gray-900 text-white'
                        : 'bg-yellow-50 text-gray-800 border border-yellow-100'
                    }`}>
                      {t.content}
                    </div>
                  </div>
                ))}
                {testLoading && (
                  <div className="flex justify-start">
                    <div className="bg-yellow-50 border border-yellow-100 px-3 py-2 rounded-xl text-sm text-gray-400">
                      ...
                    </div>
                  </div>
                )}
              </div>
              <form onSubmit={handleTestChat} className="flex gap-2">
                <input
                  value={testMsg}
                  onChange={e => setTestMsg(e.target.value)}
                  placeholder="Type as a caller..."
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <button
                  type="submit"
                  disabled={testLoading || !testMsg.trim()}
                  className="px-3 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold disabled:opacity-40"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        </div>
        {toast && <Toast msg={toast.msg} type={toast.type} />}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Agents</h1>
          <p className="text-sm text-gray-500 mt-1">Your AI receptionists</p>
        </div>
        <button
          onClick={() => { setSelected(null); setView('create') }}
          className="py-2 px-4 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          + New Agent
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      ) : agentList.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
          <p className="text-5xl mb-4">🤖</p>
          <p className="text-gray-700 font-semibold text-lg">No agents yet</p>
          <p className="text-sm text-gray-400 mt-1 mb-5">
            Create your first AI receptionist in about 5 minutes.
          </p>
          <button
            onClick={() => setView('create')}
            className="py-2.5 px-6 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Create your first agent
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agentList.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onSetup={() => goSetup(agent)}
              onToggle={() => handleToggle(agent)}
              onDelete={() => handleDelete(agent)}
            />
          ))}
        </div>
      )}
      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}

function AgentCard({ agent, onSetup, onToggle, onDelete }: {
  agent: AgentFull
  onSetup: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const cfg = agent.config || {}
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{agent.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{cfg.business_name || 'No business name'}</p>
          {(agent.telnyx_phone || agent.twilio_number) && (
            <p className="text-xs text-blue-600 mt-0.5 font-mono">
              {agent.telnyx_phone || agent.twilio_number}
            </p>
          )}
        </div>
        <span className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ml-2 ${
          agent.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
        }`}>
          {agent.is_active ? 'Live' : agent.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
        <div>
          <p className="font-semibold text-gray-800 text-sm">{agent.calls_this_month}</p>
          <p>calls this month</p>
        </div>
        <div>
          <p className="font-semibold text-gray-800 text-sm">{agent.total_calls}</p>
          <p>total calls</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onSetup}
          className="flex-1 py-2 text-xs font-semibold bg-gray-900 hover:bg-gray-800 text-white rounded-xl transition-colors"
        >
          Setup / Edit
        </button>
        <button
          onClick={onToggle}
          className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-colors ${
            agent.is_active
              ? 'bg-red-50 text-red-600 hover:bg-red-100'
              : 'bg-green-50 text-green-700 hover:bg-green-100'
          }`}
        >
          {agent.is_active ? 'Pause' : 'Activate'}
        </button>
        <button
          onClick={onDelete}
          className="px-3 py-2 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
          aria-label="Delete agent"
        >
          Del
        </button>
      </div>
    </div>
  )
}

function Step({ n, done, title, desc, children }: {
  n: number
  done: boolean
  title: string
  desc: string
  children?: React.ReactNode
}) {
  return (
    <div className={`flex items-start gap-4 p-4 rounded-xl border ${
      done ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-gray-50'
    }`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${
        done ? 'bg-green-500 text-white' : 'bg-yellow-100 text-yellow-800'
      }`}>
        {done ? '✓' : n}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
      </div>
      {children && <div className="flex-shrink-0">{children}</div>}
    </div>
  )
}

function InfoPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">{label}</p>
      <p className="text-sm text-gray-700 mt-0.5 truncate">{value}</p>
    </div>
  )
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        } catch {}
      }}
      className="text-xs font-semibold px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
    >
      {copied ? 'Copied!' : label}
    </button>
  )
}

function Toast({ msg, type }: { msg: string; type: 'ok' | 'err' }) {
  return (
    <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium border ${
      type === 'ok'
        ? 'bg-white border-green-200 text-green-800'
        : 'bg-white border-red-200 text-red-700'
    }`}>
      {type === 'ok' ? '✓ ' : '! '}{msg}
    </div>
  )
}
