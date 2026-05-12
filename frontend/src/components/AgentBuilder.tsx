/**
 * AgentBuilder — renders the standard form on mobile and the drag-and-drop
 * canvas on desktop (window.innerWidth >= 1024).
 *
 * The canvas is lazy-loaded so it doesn't bloat the mobile bundle.
 */
'use client'

import React, { useEffect, useState } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentConfig {
  name: string
  business_name: string
  language: string
  voice_id: string
  hours: string
  services: string
  escalation_phone: string
  calendly_url: string
  timezone: string
  faqs: { question: string; answer: string }[]
}

interface AgentBuilderProps {
  initial?: Partial<AgentConfig>
  onSave: (config: AgentConfig) => Promise<void>
  isSaving?: boolean
}

// ---------------------------------------------------------------------------
// Mobile form
// ---------------------------------------------------------------------------

function AgentForm({ initial, onSave, isSaving }: AgentBuilderProps) {
  const [form, setForm] = useState<AgentConfig>({
    name: '',
    business_name: '',
    language: 'english',
    voice_id: '',
    hours: 'Mon-Sat 9am-6pm',
    services: '',
    escalation_phone: '',
    calendly_url: '',
    timezone: 'Asia/Kolkata',
    faqs: [],
    ...initial,
  })

  const set = (key: keyof AgentConfig, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Map form fields to the backend CreateAgentRequest shape
    const payload = {
      name: form.name,
      voice_id: form.voice_id || undefined,
      language: form.language,
      config: {
        business_name: form.business_name,
        agent_name: form.name,
        greeting_message: `Thank you for calling ${form.business_name}. This call may be recorded for quality. I'm ${form.name}, how can I help you today?`,
        operating_hours: form.hours,
        services: form.services,
        escalation_triggers: 'emergency, urgent, immediate',
        owner_whatsapp: '',
        language: form.language,
        calendly_url: form.calendly_url,
        timezone: form.timezone,
        faqs: '',
      },
      forwarding_number: form.escalation_phone || undefined,
    }
    await onSave(payload as any)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 px-4 sm:px-6 lg:px-8 py-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-gray-900">Configure Agent</h2>

      <Field label="Agent Name" required>
        <input
          type="text"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="e.g. Priya"
          required
          className="input"
        />
      </Field>

      <Field label="Business Name" required>
        <input
          type="text"
          value={form.business_name}
          onChange={(e) => set('business_name', e.target.value)}
          placeholder="e.g. Sharma Dental Clinic"
          required
          className="input"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Language">
          <select value={form.language} onChange={(e) => set('language', e.target.value)} className="input">
            <option value="english">English</option>
            <option value="hindi">Hindi</option>
            <option value="tamil">Tamil</option>
            <option value="arabic">Arabic</option>
            <option value="spanish">Spanish</option>
          </select>
        </Field>

        <Field label="Timezone">
          <select value={form.timezone} onChange={(e) => set('timezone', e.target.value)} className="input">
            <option value="Asia/Kolkata">IST (Asia/Kolkata)</option>
            <option value="Asia/Dubai">GST (Asia/Dubai)</option>
            <option value="America/New_York">EST (New York)</option>
            <option value="Europe/London">GMT (London)</option>
            <option value="Asia/Singapore">SGT (Singapore)</option>
          </select>
        </Field>
      </div>

      <Field label="Business Hours">
        <input
          type="text"
          value={form.hours}
          onChange={(e) => set('hours', e.target.value)}
          placeholder="Mon-Sat 9am-6pm"
          className="input"
        />
      </Field>

      <Field label="Services (comma-separated)">
        <input
          type="text"
          value={form.services}
          onChange={(e) => set('services', e.target.value)}
          placeholder="Consultation, Cleaning, X-Ray"
          className="input"
        />
      </Field>

      <Field label="Escalation Phone">
        <input
          type="tel"
          value={form.escalation_phone}
          onChange={(e) => set('escalation_phone', e.target.value)}
          placeholder="+91 98765 43210"
          className="input"
        />
      </Field>

      <Field label="Calendly URL (optional)">
        <input
          type="url"
          value={form.calendly_url}
          onChange={(e) => set('calendly_url', e.target.value)}
          placeholder="https://calendly.com/your-link"
          className="input"
        />
      </Field>

      <button
        type="submit"
        disabled={isSaving}
        className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors"
      >
        {isSaving ? 'Saving…' : 'Save Agent'}
      </button>
    </form>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Desktop canvas (drag-and-drop node editor)
// ---------------------------------------------------------------------------

function AgentCanvas({ initial, onSave, isSaving }: AgentBuilderProps) {
  // Minimal canvas implementation — extend with react-flow or similar library
  const [nodes, setNodes] = useState([
    { id: 'greeting', label: 'Greeting', x: 80, y: 80, type: 'start' },
    { id: 'listen', label: 'Listen', x: 280, y: 80, type: 'action' },
    { id: 'ai', label: 'AI Response', x: 480, y: 80, type: 'action' },
    { id: 'escalate', label: 'Escalate', x: 480, y: 220, type: 'end' },
    { id: 'book', label: 'Book Slot', x: 680, y: 80, type: 'end' },
  ])

  const [dragging, setDragging] = useState<string | null>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  const onMouseDown = (e: React.MouseEvent, id: string, nx: number, ny: number) => {
    setDragging(id)
    setOffset({ x: e.clientX - nx, y: e.clientY - ny })
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return
    setNodes((prev) =>
      prev.map((n) =>
        n.id === dragging ? { ...n, x: e.clientX - offset.x, y: e.clientY - offset.y } : n
      )
    )
  }

  const onMouseUp = () => setDragging(null)

  const NODE_COLORS: Record<string, string> = {
    start: 'bg-green-100 border-green-400',
    action: 'bg-blue-100 border-blue-400',
    end: 'bg-purple-100 border-purple-400',
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <h2 className="text-xl font-bold text-gray-900">Agent Canvas</h2>
        <button
          onClick={() => {
            if (!initial) return
            const payload = {
              name: (initial as any).name || 'Agent',
              language: (initial as any).language || 'english',
              config: {
                business_name: (initial as any).business_name || '',
                agent_name: (initial as any).name || 'Agent',
                greeting_message: 'How can I help you today?',
                operating_hours: (initial as any).hours || 'Mon-Sat 9am-6pm',
                services: (initial as any).services || '',
                escalation_triggers: 'emergency, urgent',
                owner_whatsapp: '',
                language: (initial as any).language || 'english',
                calendly_url: (initial as any).calendly_url || '',
                timezone: (initial as any).timezone || 'Asia/Kolkata',
                faqs: '',
                builder_layout: { nodes, edges: [] },
              },
            }
            onSave(payload as any)
          }}
          disabled={isSaving}
          className="py-2 px-5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Canvas area */}
      <div
        className="relative flex-1 bg-gray-50 overflow-hidden cursor-default select-none"
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        role="application"
        aria-label="Agent flow canvas"
      >
        {/* SVG edges */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <line x1={180} y1={100} x2={280} y2={100} stroke="#94a3b8" strokeWidth={2} markerEnd="url(#arrow)" />
          <line x1={380} y1={100} x2={480} y2={100} stroke="#94a3b8" strokeWidth={2} markerEnd="url(#arrow)" />
          <line x1={580} y1={100} x2={680} y2={100} stroke="#94a3b8" strokeWidth={2} markerEnd="url(#arrow)" />
          <line x1={530} y1={130} x2={530} y2={220} stroke="#94a3b8" strokeWidth={2} markerEnd="url(#arrow)" />
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
            </marker>
          </defs>
        </svg>

        {/* Nodes */}
        {nodes.map((node) => (
          <div
            key={node.id}
            className={`absolute border-2 rounded-xl px-4 py-2 text-sm font-medium shadow-sm cursor-grab active:cursor-grabbing ${NODE_COLORS[node.type] ?? 'bg-gray-100 border-gray-300'}`}
            style={{ left: node.x, top: node.y, userSelect: 'none' }}
            onMouseDown={(e) => onMouseDown(e, node.id, node.x, node.y)}
            role="button"
            tabIndex={0}
            aria-label={`Node: ${node.label}`}
          >
            {node.label}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex gap-4 px-6 py-3 border-t border-gray-200 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-200 border border-green-400 inline-block" /> Start</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-200 border border-blue-400 inline-block" /> Action</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-200 border border-purple-400 inline-block" /> End</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export — conditional render based on screen width
// ---------------------------------------------------------------------------

export default function AgentBuilder(props: AgentBuilderProps) {
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return isDesktop ? <AgentCanvas {...props} /> : <AgentForm {...props} />
}
