'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import VoicePreview from './VoicePreview'

// ── Node types & definitions ─────────────────────────────────────────────────

type NodeKind =
  | 'phone_start'
  | 'listen'
  | 'ai_response'
  | 'book_appt'
  | 'escalate'
  | 'whatsapp_notify'
  | 'language_switch'
  | 'end_call'

interface NodeDef {
  kind: NodeKind
  label: string
  icon: string
  bg: string
  border: string
  text: string
  category: 'start' | 'action' | 'end'
  desc: string
  allowedOutputs: NodeKind[]
}

const DEFS: Record<NodeKind, NodeDef> = {
  phone_start: {
    kind: 'phone_start', label: 'Phone Call', icon: '📞',
    bg: '#dcfce7', border: '#16a34a', text: '#15803d',
    category: 'start', desc: 'Entry — call comes in',
    allowedOutputs: ['listen', 'language_switch'],
  },
  listen: {
    kind: 'listen', label: 'Listen', icon: '👂',
    bg: '#dbeafe', border: '#2563eb', text: '#1d4ed8',
    category: 'action', desc: 'Collect caller speech',
    allowedOutputs: ['ai_response'],
  },
  ai_response: {
    kind: 'ai_response', label: 'AI Response', icon: '🤖',
    bg: '#f3e8ff', border: '#7c3aed', text: '#6d28d9',
    category: 'action', desc: 'AI speaks a reply',
    allowedOutputs: ['listen', 'book_appt', 'escalate', 'whatsapp_notify', 'end_call'],
  },
  book_appt: {
    kind: 'book_appt', label: 'Book Appointment', icon: '📅',
    bg: '#fef9c3', border: '#ca8a04', text: '#92400e',
    category: 'action', desc: 'Calendly / calendar booking',
    allowedOutputs: ['whatsapp_notify', 'end_call'],
  },
  escalate: {
    kind: 'escalate', label: 'Escalate to Human', icon: '🚨',
    bg: '#fee2e2', border: '#dc2626', text: '#b91c1c',
    category: 'action', desc: 'Transfer to staff member',
    allowedOutputs: ['end_call'],
  },
  whatsapp_notify: {
    kind: 'whatsapp_notify', label: 'WhatsApp Notify', icon: '💬',
    bg: '#d1fae5', border: '#059669', text: '#065f46',
    category: 'action', desc: 'Send summary to owner',
    allowedOutputs: ['end_call'],
  },
  language_switch: {
    kind: 'language_switch', label: 'Language Switch', icon: '🌐',
    bg: '#e0f2fe', border: '#0284c7', text: '#0369a1',
    category: 'action', desc: 'Detect & switch language',
    allowedOutputs: ['listen'],
  },
  end_call: {
    kind: 'end_call', label: 'End Call', icon: '📵',
    bg: '#f1f5f9', border: '#64748b', text: '#334155',
    category: 'end', desc: 'Hang up gracefully',
    allowedOutputs: [],
  },
}

const PALETTE: NodeKind[] = ['listen', 'ai_response', 'book_appt', 'escalate', 'whatsapp_notify', 'language_switch', 'end_call']

const LANG_OPTIONS = [
  { label: 'English (US)', code: 'en-US', api: 'english' },
  { label: 'Hindi (हिंदी)', code: 'hi-IN', api: 'hindi' },
  { label: 'Spanish', code: 'es-ES', api: 'spanish' },
  { label: 'Arabic', code: 'ar-SA', api: 'arabic' },
  { label: 'Tamil', code: 'ta-IN', api: 'tamil' },
  { label: 'French', code: 'fr-FR', api: 'english' },
  { label: 'Mandarin', code: 'zh-CN', api: 'english' },
]

// ── Canvas node & edge models ────────────────────────────────────────────────

interface CanvasNode {
  id: string
  kind: NodeKind
  x: number
  y: number
  language?: string
}

interface Edge {
  id: string
  fromId: string
  toId: string
}

// ── Tutorial steps ────────────────────────────────────────────────────────────

const TUTORIAL = [
  {
    title: 'Welcome to the Agent Builder 👋',
    body: 'Here you build your AI receptionist\'s call flow visually — drag, drop and connect nodes. Each node is one step the agent takes during a live call.',
    point: null as null | 'palette' | 'canvas' | 'preview' | 'start_node',
  },
  {
    title: 'Drag Nodes from Here',
    body: 'This left panel is your palette. Drag any node onto the canvas to add it to your call flow. Each node has a specific role — hover to read what it does.',
    point: 'palette' as const,
  },
  {
    title: 'The Call Always Starts Here',
    body: 'The green "Phone Call" node is your entry point. It fires when a call comes in. You cannot delete it — every flow must start here.',
    point: 'start_node' as const,
  },
  {
    title: 'Connect Nodes with Ports',
    body: 'Each node has a colored ● port on its right side (output) and a ● port on its left (input). Click an output port to begin a connection, then click a destination\'s input port to link them.',
    point: 'canvas' as const,
  },
  {
    title: 'What Can Connect to What?',
    body: 'Connections follow logical call-flow rules. For example:\n• Phone Call → Listen → AI Response ✅\n• WhatsApp Notify → End Call ✅\n• WhatsApp Notify → Phone Call ❌ (circular, blocked)\n\nInvalid connections are rejected with an explanation.',
    point: null,
  },
  {
    title: 'A Typical Call Flow',
    body: 'Phone Call → Language Switch (optional) → Listen → AI Response → Book Appointment or Escalate → WhatsApp Notify → End Call.\n\nYou can also loop: AI Response → Listen for multi-turn conversations.',
    point: null,
  },
  {
    title: 'Live Preview Panel →',
    body: 'The Voice Preview panel on the right updates automatically as you change language or voice nodes. Click "Play sample" to hear exactly what your agent will sound like.',
    point: 'preview' as const,
  },
]

// ── AgentConfig type ─────────────────────────────────────────────────────────

interface AgentConfig {
  id?: string
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
  previewText?: string
  setPreviewText?: (s: string) => void
  previewUrl?: string | null
  isPreviewing?: boolean
  doPreview?: (agentId?: string) => Promise<void>
}

// ── Constants ────────────────────────────────────────────────────────────────

const NW = 168
const NH = 64
const PORT_R = 7

// ── Canvas component ─────────────────────────────────────────────────────────

function AgentCanvas({ initial, onSave, isSaving }: AgentBuilderProps) {
  const wrapRef = useRef<HTMLDivElement>(null)

  // node & edge state
  const [nodes, setNodes] = useState<CanvasNode[]>([
    { id: 'start', kind: 'phone_start', x: 48, y: 190 },
    { id: 'n1', kind: 'listen', x: 276, y: 190 },
    { id: 'n2', kind: 'ai_response', x: 504, y: 190 },
  ])
  const [edges, setEdges] = useState<Edge[]>([
    { id: 'e0', fromId: 'start', toId: 'n1' },
    { id: 'e1', fromId: 'n1', toId: 'n2' },
  ])

  // drag
  const [dragging, setDragging] = useState<{ id: string; ox: number; oy: number } | null>(null)
  // connecting
  const [conn, setConn] = useState<{ fromId: string; mx: number; my: number } | null>(null)
  // error banner
  const [connErr, setConnErr] = useState<string | null>(null)
  // selected node
  const [sel, setSel] = useState<string | null>(null)
  // palette drag-over
  const [dragOver, setDragOver] = useState(false)
  // tutorial
  const [tut, setTut] = useState<number | null>(0)
  const [tutDismissed, setTutDismissed] = useState(false)

  // derive canvas language for preview sync
  const canvasLang = (() => {
    const ln = nodes.find(n => n.kind === 'language_switch')
    if (ln?.language) return ln.language
    const apiLang = (initial as any)?.language || 'english'
    const map: Record<string, string> = {
      english: 'en-US', hindi: 'hi-IN', spanish: 'es-ES',
      arabic: 'ar-SA', tamil: 'ta-IN',
    }
    return map[apiLang] || 'en-US'
  })()

  // sync to window global for Vapi demo-chat
  useEffect(() => {
    ;(window as any).harklyCanvasState = {
      language: canvasLang,
      voiceId: (initial as any)?.voice_id || 'maya',
    }
  }, [canvasLang, initial])

  // ── helpers ────────────────────────────────────────────────────────────────

  const clientToCanvas = (cx: number, cy: number) => {
    const r = wrapRef.current?.getBoundingClientRect()
    return r ? { x: cx - r.left, y: cy - r.top } : { x: cx, y: cy }
  }

  const canConnect = (fromId: string, toId: string): { ok: boolean; reason?: string } => {
    if (fromId === toId) return { ok: false, reason: 'Cannot connect a node to itself.' }
    const from = nodes.find(n => n.id === fromId)
    const to = nodes.find(n => n.id === toId)
    if (!from || !to) return { ok: false, reason: 'Node not found.' }
    if (edges.some(e => e.fromId === fromId && e.toId === toId))
      return { ok: false, reason: 'This connection already exists.' }

    const def = DEFS[from.kind]
    if (!def.allowedOutputs.includes(to.kind)) {
      const allowed = def.allowedOutputs.map(k => DEFS[k].label).join(', ')
      const hint = (() => {
        if (to.kind === 'phone_start') return '"Phone Call" is always the entry point — nothing connects into it.'
        if (from.kind === 'end_call') return '"End Call" is terminal — it has no outputs.'
        if (from.kind === 'whatsapp_notify') return '"WhatsApp Notify" can only lead to "End Call".'
        if (from.kind === 'escalate') return 'After escalating, the call must end.'
        return allowed ? `"${def.label}" can connect to: ${allowed}.` : `"${def.label}" has no valid outputs.`
      })()
      return { ok: false, reason: `Cannot connect "${def.label}" → "${DEFS[to.kind].label}". ${hint}` }
    }
    return { ok: true }
  }

  // ── drag-and-drop nodes ────────────────────────────────────────────────────

  const onNodeDown = (e: React.MouseEvent, id: string) => {
    if ((e.target as HTMLElement).dataset.port) return
    e.stopPropagation()
    const node = nodes.find(n => n.id === id)!
    const pos = clientToCanvas(e.clientX, e.clientY)
    setDragging({ id, ox: pos.x - node.x, oy: pos.y - node.y })
    setSel(id)
    setConn(null)
  }

  const onCanvasMove = (e: React.MouseEvent) => {
    const pos = clientToCanvas(e.clientX, e.clientY)
    if (dragging) {
      setNodes(prev => prev.map(n =>
        n.id === dragging.id ? { ...n, x: pos.x - dragging.ox, y: pos.y - dragging.oy } : n
      ))
    }
    if (conn) setConn(c => c ? { ...c, mx: pos.x, my: pos.y } : null)
  }

  const onCanvasUp = () => setDragging(null)

  const onCanvasClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).dataset.port) return
    setSel(null)
    if (conn) {
      setConn(null)
      showErr('Connection cancelled — click a canvas node\'s input port to finish, or click here to cancel.')
    }
  }

  // ── palette drag-and-drop ─────────────────────────────────────────────────

  const onPalDragStart = (e: React.DragEvent, kind: NodeKind) => {
    e.dataTransfer.setData('nodeKind', kind)
  }

  const onCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const kind = e.dataTransfer.getData('nodeKind') as NodeKind
    if (!kind) return
    const pos = clientToCanvas(e.clientX, e.clientY)
    setNodes(prev => [...prev, {
      id: `n${Date.now()}`, kind,
      x: pos.x - NW / 2, y: pos.y - NH / 2,
    }])
  }

  // ── ports ─────────────────────────────────────────────────────────────────

  const onOutputPort = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation()
    const pos = clientToCanvas(e.clientX, e.clientY)
    setConn({ fromId: nodeId, mx: pos.x, my: pos.y })
    setConnErr(null)
  }

  const onInputPort = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation()
    if (!conn) return
    const result = canConnect(conn.fromId, nodeId)
    if (result.ok) {
      setEdges(prev => [...prev, { id: `e${Date.now()}`, fromId: conn.fromId, toId: nodeId }])
      setConn(null)
    } else {
      showErr(result.reason || 'Invalid connection')
      setConn(null)
    }
  }

  const showErr = (msg: string) => {
    setConnErr(msg)
    setTimeout(() => setConnErr(null), 4000)
  }

  // ── delete ─────────────────────────────────────────────────────────────────

  const deleteNode = (id: string) => {
    if (id === 'start') return
    setNodes(prev => prev.filter(n => n.id !== id))
    setEdges(prev => prev.filter(e => e.fromId !== id && e.toId !== id))
    setSel(null)
  }

  const deleteEdge = (id: string) => setEdges(prev => prev.filter(e => e.id !== id))

  // ── SVG paths ─────────────────────────────────────────────────────────────

  const edgePath = (fromId: string, toId: string) => {
    const f = nodes.find(n => n.id === fromId)
    const t = nodes.find(n => n.id === toId)
    if (!f || !t) return ''
    const sx = f.x + NW, sy = f.y + NH / 2
    const ex = t.x, ey = t.y + NH / 2
    const cp = Math.max(80, Math.abs(ex - sx) * 0.45)
    return `M${sx},${sy} C${sx + cp},${sy} ${ex - cp},${ey} ${ex},${ey}`
  }

  const pendingPath = () => {
    if (!conn) return ''
    const f = nodes.find(n => n.id === conn.fromId)
    if (!f) return ''
    const sx = f.x + NW, sy = f.y + NH / 2
    const cp = Math.max(60, Math.abs(conn.mx - sx) * 0.45)
    return `M${sx},${sy} C${sx + cp},${sy} ${conn.mx - cp},${conn.my} ${conn.mx},${conn.my}`
  }

  const edgeMid = (fromId: string, toId: string) => {
    const f = nodes.find(n => n.id === fromId)
    const t = nodes.find(n => n.id === toId)
    if (!f || !t) return null
    return { x: (f.x + NW / 2 + t.x + NW / 2) / 2, y: (f.y + t.y + NH) / 2 }
  }

  // ── save ──────────────────────────────────────────────────────────────────

  const handleSave = () => {
    if (!initial) return
    const langCode = canvasLang
    const apiLangMap: Record<string, string> = {
      'en-US': 'english', 'hi-IN': 'hindi', 'es-ES': 'spanish',
      'ar-SA': 'arabic', 'ta-IN': 'tamil', 'fr-FR': 'english', 'zh-CN': 'english',
    }
    onSave({
      name: (initial as any).name || 'Agent',
      business_name: (initial as any).business_name || '',
      language: apiLangMap[langCode] || 'english',
      voice_id: (initial as any).voice_id || '',
      hours: (initial as any).hours || 'Mon-Sat 9am-6pm',
      services: (initial as any).services || '',
      escalation_phone: (initial as any).escalation_phone || '',
      calendly_url: (initial as any).calendly_url || '',
      timezone: (initial as any).timezone || 'Asia/Kolkata',
      faqs: [],
      config: {
        business_name: (initial as any).business_name || '',
        agent_name: (initial as any).name || 'Agent',
        greeting_message: `Thank you for calling ${(initial as any).business_name || 'us'}. I'm ${(initial as any).name || 'your AI receptionist'}, how can I help?`,
        operating_hours: (initial as any).hours || 'Mon-Sat 9am-6pm',
        services: (initial as any).services || '',
        escalation_triggers: 'emergency, urgent',
        owner_whatsapp: (initial as any).owner_whatsapp || '',
        language: apiLangMap[langCode] || 'english',
        calendly_url: (initial as any).calendly_url || '',
        timezone: (initial as any).timezone || 'Asia/Kolkata',
        faqs: '',
        builder_layout: { nodes, edges },
      },
    } as any)
  }

  // ── tutorial helpers ──────────────────────────────────────────────────────

  const tutNext = () => {
    if (tut === null) return
    if (tut >= TUTORIAL.length - 1) { setTut(null); setTutDismissed(true) }
    else setTut(tut + 1)
  }

  const tutSkip = () => { setTut(null); setTutDismissed(true) }

  const currentTut = tut !== null ? TUTORIAL[tut] : null
  const tutPoint = currentTut?.point ?? null

  // ── language change from node config ─────────────────────────────────────

  const setNodeLang = (id: string, language: string) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, language } : n))
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: 'flex', height: '100%', minHeight: 540, position: 'relative',
        fontFamily: 'Poppins, system-ui, sans-serif',
      }}
    >
      {/* ── Tutorial backdrop ── */}
      {currentTut && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 40,
          backdropFilter: 'blur(4px)',
          background: 'rgba(10,10,20,0.5)',
          pointerEvents: 'none',
        }} />
      )}

      {/* ── Tutorial card ── */}
      {currentTut && (
        <div style={{
          position: 'absolute', zIndex: 50,
          left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 380, pointerEvents: 'auto',
        }}>
          <div style={{
            background: '#fff', borderRadius: 18,
            boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
            padding: '28px 28px 22px',
            border: '2.5px solid #ffcd5c',
          }}>
            {/* Progress */}
            <div style={{ display: 'flex', gap: 5, marginBottom: 18 }}>
              {TUTORIAL.map((_, i) => (
                <div key={i} style={{
                  height: 5, borderRadius: 99, flex: i === tut ? 2.5 : 1,
                  transition: 'flex 220ms, background 220ms',
                  background: i === tut ? '#ffcd5c' : i < (tut || 0) ? '#16a34a' : '#e5e7eb',
                }} />
              ))}
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 7 }}>
              Step {(tut || 0) + 1} of {TUTORIAL.length}
            </div>

            <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0d0d0f', margin: '0 0 10px', lineHeight: 1.3 }}>
              {currentTut.title}
            </h3>
            <p style={{ fontSize: 13.5, color: '#4b5563', lineHeight: 1.7, margin: '0 0 22px', whiteSpace: 'pre-line' }}>
              {currentTut.body}
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={tutSkip} style={{
                fontSize: 12, color: '#9ca3af', background: 'none',
                border: 'none', cursor: 'pointer', padding: '4px 0',
              }}>
                Skip tutorial
              </button>
              <button onClick={tutNext} style={{
                background: '#0d0d0f', color: '#fff', border: 'none',
                borderRadius: 10, cursor: 'pointer',
                padding: '9px 22px', fontSize: 13, fontWeight: 700,
                boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              }}>
                {(tut || 0) >= TUTORIAL.length - 1 ? '✓ Got it!' : 'Next →'}
              </button>
            </div>
          </div>

          {/* Directional arrows */}
          {tutPoint === 'palette' && (
            <div style={{
              position: 'absolute', left: -50, top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 28, color: '#ffcd5c',
              animation: 'tutPulse 0.9s ease-in-out infinite',
            }}>←</div>
          )}
          {tutPoint === 'preview' && (
            <div style={{
              position: 'absolute', right: -50, top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 28, color: '#ffcd5c',
              animation: 'tutPulse 0.9s ease-in-out infinite',
            }}>→</div>
          )}
          {(tutPoint === 'canvas' || tutPoint === 'start_node') && (
            <div style={{
              position: 'absolute', bottom: -44, left: '50%',
              transform: 'translateX(-50%)',
              fontSize: 28, color: '#ffcd5c',
              animation: 'tutPulse 0.9s ease-in-out infinite',
            }}>↓</div>
          )}
        </div>
      )}

      <style>{`
        @keyframes tutPulse {
          0%,100% { opacity: 1; transform: translateY(-50%) scale(1); }
          50% { opacity: 0.55; transform: translateY(-50%) scale(1.18); }
        }
        @keyframes tutPulseV {
          0%,100% { opacity: 1; transform: translateX(-50%) scale(1); }
          50% { opacity: 0.55; transform: translateX(-50%) scale(1.18); }
        }
      `}</style>

      {/* ── Left palette ── */}
      <div
        id="agent-palette"
        style={{
          width: 172, flexShrink: 0,
          borderRight: '1px solid #e5e7eb',
          background: '#f9fafb',
          padding: '14px 8px 14px',
          overflowY: 'auto',
          zIndex: tutPoint === 'palette' ? 50 : 1,
          position: 'relative',
          boxShadow: tutPoint === 'palette' ? '0 0 0 3px #ffcd5c' : 'none',
          borderRadius: tutPoint === 'palette' ? '4px 0 0 4px' : 0,
        }}
      >
        <p style={{
          fontSize: 9.5, fontWeight: 800, color: '#9ca3af',
          textTransform: 'uppercase', letterSpacing: 1.2,
          margin: '0 4px 10px',
        }}>
          Drag onto canvas
        </p>

        {PALETTE.map(kind => {
          const d = DEFS[kind]
          return (
            <div
              key={kind}
              draggable
              onDragStart={e => onPalDragStart(e, kind)}
              title={d.desc}
              style={{
                background: d.bg, border: `1.5px solid ${d.border}`,
                borderRadius: 10, padding: '8px 10px', marginBottom: 6,
                cursor: 'grab', display: 'flex', alignItems: 'flex-start', gap: 7,
                userSelect: 'none',
                transition: 'transform 100ms, box-shadow 100ms',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1.03)'
                ;(e.currentTarget as HTMLElement).style.boxShadow = '0 3px 10px rgba(0,0,0,0.12)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = ''
                ;(e.currentTarget as HTMLElement).style.boxShadow = ''
              }}
            >
              <span style={{ fontSize: 18, marginTop: 1 }}>{d.icon}</span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: d.text, lineHeight: 1.2 }}>{d.label}</div>
                <div style={{ fontSize: 9.5, color: '#9ca3af', lineHeight: 1.35, marginTop: 1 }}>{d.desc}</div>
              </div>
            </div>
          )
        })}

        {!currentTut && (
          <button
            onClick={() => { setTut(0); setTutDismissed(false) }}
            style={{
              marginTop: 14, width: '100%', padding: '8px 4px',
              background: 'linear-gradient(135deg,#ffcd5c,#f59e0b)',
              border: 'none', borderRadius: 9, fontSize: 11,
              fontWeight: 700, cursor: 'pointer', color: '#1a1408',
              boxShadow: '0 2px 6px rgba(245,158,11,0.3)',
            }}
          >
            📖 How this works
          </button>
        )}
      </div>

      {/* ── Canvas ── */}
      <div
        id="agent-canvas"
        ref={wrapRef}
        style={{
          flex: 1, position: 'relative', overflow: 'hidden',
          background: '#fafafa',
          backgroundImage: 'radial-gradient(circle, #d1d5db 1.2px, transparent 1.2px)',
          backgroundSize: '22px 22px',
          cursor: conn ? 'crosshair' : dragging ? 'grabbing' : 'default',
          zIndex: (tutPoint === 'canvas' || tutPoint === 'start_node') ? 50 : 1,
          boxShadow: (tutPoint === 'canvas' || tutPoint === 'start_node') ? 'inset 0 0 0 3px #ffcd5c' : 'none',
        }}
        onMouseMove={onCanvasMove}
        onMouseUp={onCanvasUp}
        onMouseLeave={onCanvasUp}
        onClick={onCanvasClick}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onCanvasDrop}
      >
        {/* Drop zone hint */}
        {dragOver && (
          <div style={{
            position: 'absolute', inset: 0, border: '2px dashed #3b82f6',
            pointerEvents: 'none', zIndex: 5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 14, color: '#3b82f6', fontWeight: 700, background: '#eff6ff', padding: '6px 14px', borderRadius: 8 }}>
              Drop here
            </span>
          </div>
        )}

        {/* SVG edges */}
        <svg style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          pointerEvents: 'none', zIndex: 2, overflow: 'visible',
        }}>
          <defs>
            <marker id="ah" markerWidth="9" markerHeight="9" refX="8" refY="3.5" orient="auto">
              <path d="M0,0 L0,7 L9,3.5z" fill="#94a3b8" />
            </marker>
            <marker id="ah-blue" markerWidth="9" markerHeight="9" refX="8" refY="3.5" orient="auto">
              <path d="M0,0 L0,7 L9,3.5z" fill="#3b82f6" />
            </marker>
          </defs>

          {edges.map(edge => {
            const p = edgePath(edge.fromId, edge.toId)
            const mid = edgeMid(edge.fromId, edge.toId)
            return (
              <g key={edge.id}>
                <path d={p} stroke="#94a3b8" strokeWidth={2.2} fill="none"
                  markerEnd="url(#ah)" />
                {/* Wide transparent hit area */}
                <path d={p} stroke="transparent" strokeWidth={14} fill="none"
                  style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); deleteEdge(edge.id) }}
                />
                {/* Delete icon on hover (shown via mid point) */}
                {mid && (
                  <g style={{ pointerEvents: 'all', cursor: 'pointer' }}
                    onClick={e => { e.stopPropagation(); deleteEdge(edge.id) }}>
                    <circle cx={mid.x} cy={mid.y} r={9} fill="#fff" stroke="#e5e7eb" strokeWidth={1.5} opacity={0} className="edge-del-bg" />
                  </g>
                )}
              </g>
            )
          })}

          {/* Pending connection */}
          {conn && (
            <path d={pendingPath()} stroke="#3b82f6" strokeWidth={2.2}
              strokeDasharray="7 5" fill="none" markerEnd="url(#ah-blue)" />
          )}
        </svg>

        {/* ── Nodes ── */}
        {nodes.map(node => {
          const d = DEFS[node.kind]
          const isSelected = sel === node.id
          const isFrom = conn?.fromId === node.id
          const isStart = node.id === 'start'

          return (
            <div key={node.id} style={{
              position: 'absolute', left: node.x, top: node.y,
              width: NW, height: NH, zIndex: isSelected ? 12 : 4,
              userSelect: 'none',
            }}>
              {/* Node card */}
              <div
                onMouseDown={e => onNodeDown(e, node.id)}
                style={{
                  width: '100%', height: '100%',
                  background: d.bg,
                  border: `2px solid ${isFrom ? '#3b82f6' : isSelected ? d.border : d.border + 'aa'}`,
                  borderRadius: 13,
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '0 13px',
                  cursor: isStart ? 'default' : 'grab',
                  position: 'relative',
                  boxShadow: isSelected
                    ? `0 0 0 3px ${d.border}33, 0 6px 18px rgba(0,0,0,0.14)`
                    : '0 1px 5px rgba(0,0,0,0.08)',
                  transition: 'box-shadow 120ms, border-color 120ms',
                }}
              >
                <span style={{ fontSize: 22, flexShrink: 0 }}>{d.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 11.5, fontWeight: 700, color: d.text,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{d.label}</div>
                  <div style={{
                    fontSize: 9.5, color: '#9ca3af', marginTop: 1,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {d.category === 'start' ? '▶ Entry point'
                      : d.category === 'end' ? '⏹ Terminal'
                      : d.desc}
                  </div>
                </div>

                {/* Language dropdown for language_switch node */}
                {node.kind === 'language_switch' && isSelected && (
                  <select
                    data-port="config"
                    value={node.language || 'en-US'}
                    onChange={e => { e.stopPropagation(); setNodeLang(node.id, e.target.value) }}
                    onClick={e => e.stopPropagation()}
                    style={{
                      position: 'absolute', top: NH + 4, left: 0, width: NW,
                      fontSize: 11, padding: '4px 7px', borderRadius: 8,
                      border: '1.5px solid #0284c7', background: '#e0f2fe',
                      cursor: 'pointer', zIndex: 20,
                    }}
                  >
                    {LANG_OPTIONS.map(l => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                )}

                {/* Delete button */}
                {!isStart && isSelected && (
                  <button
                    data-port="delete"
                    onClick={e => { e.stopPropagation(); deleteNode(node.id) }}
                    style={{
                      position: 'absolute', top: -9, right: -9,
                      width: 20, height: 20, borderRadius: '50%',
                      background: '#ef4444', color: '#fff',
                      border: '2px solid #fff', fontSize: 9,
                      fontWeight: 800, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.22)', zIndex: 20,
                    }}
                  >✕</button>
                )}
              </div>

              {/* Output port (right) */}
              {d.category !== 'end' && (
                <div
                  data-port="output"
                  onClick={e => onOutputPort(e, node.id)}
                  title="Click to start a connection"
                  style={{
                    position: 'absolute', right: -PORT_R - 2, top: '50%',
                    transform: 'translateY(-50%)',
                    width: PORT_R * 2, height: PORT_R * 2, borderRadius: '50%',
                    background: isFrom ? '#3b82f6' : d.border,
                    border: '2.5px solid #fff',
                    cursor: 'pointer', zIndex: 16,
                    boxShadow: isFrom ? `0 0 0 3px #3b82f620` : '0 1px 4px rgba(0,0,0,0.2)',
                    transition: 'background 120ms, transform 100ms',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(-50%) scale(1.3)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(-50%) scale(1)'}
                />
              )}

              {/* Input port (left) */}
              {d.category !== 'start' && (
                <div
                  data-port="input"
                  onClick={e => onInputPort(e, node.id)}
                  title={conn ? 'Connect here' : 'Input port'}
                  style={{
                    position: 'absolute', left: -PORT_R - 2, top: '50%',
                    transform: 'translateY(-50%)',
                    width: PORT_R * 2, height: PORT_R * 2, borderRadius: '50%',
                    background: conn ? '#10b981' : '#e2e8f0',
                    border: '2.5px solid #fff',
                    cursor: conn ? 'pointer' : 'default', zIndex: 16,
                    boxShadow: conn ? '0 0 0 3px #10b98120' : '0 1px 4px rgba(0,0,0,0.15)',
                    transition: 'background 150ms, box-shadow 150ms',
                  }}
                  onMouseEnter={e => conn && ((e.currentTarget as HTMLElement).style.transform = 'translateY(-50%) scale(1.35)')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.transform = 'translateY(-50%) scale(1)')}
                />
              )}
            </div>
          )
        })}

        {/* ── Empty canvas hint ── */}
        {nodes.filter(n => n.kind !== 'phone_start').length === 0 && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            textAlign: 'center', pointerEvents: 'none', color: '#9ca3af',
          }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>⬅️</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#6b7280' }}>Drag nodes from the panel</div>
            <div style={{ fontSize: 11.5, marginTop: 5, color: '#9ca3af' }}>or click "How this works" to learn</div>
          </div>
        )}

        {/* ── Connection mode banner ── */}
        {conn && (
          <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            background: '#eff6ff', border: '1.5px solid #93c5fd', borderRadius: 10,
            padding: '7px 16px', fontSize: 12.5, color: '#1d4ed8', zIndex: 20,
            pointerEvents: 'none', boxShadow: '0 2px 8px rgba(59,130,246,0.15)',
          }}>
            🔗 Click a <strong>green port</strong> to connect — or click the canvas to cancel
          </div>
        )}

        {/* ── Error banner ── */}
        {connErr && (
          <div style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 11,
            padding: '9px 18px', fontSize: 12.5, color: '#b91c1c', zIndex: 20,
            maxWidth: 420, textAlign: 'center', boxShadow: '0 3px 12px rgba(239,68,68,0.15)',
          }}>
            ⚠️ {connErr}
          </div>
        )}

        {/* ── Toolbar ── */}
        <div style={{
          position: 'absolute', top: 10, right: 10,
          display: 'flex', gap: 8, zIndex: 10,
        }}>
          {tutDismissed && (
            <button
              onClick={() => { setTut(0); setTutDismissed(false) }}
              style={{
                padding: '6px 12px', background: '#fff', border: '1px solid #e5e7eb',
                borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                color: '#6b7280',
              }}
            >
              📖 Tutorial
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              padding: '8px 18px', background: '#0d0d0f', color: '#fff',
              border: 'none', borderRadius: 10, fontSize: 13,
              fontWeight: 700, cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.6 : 1,
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            {isSaving ? 'Saving…' : '💾 Save Flow'}
          </button>
        </div>
      </div>

      {/* ── Right: Voice Preview panel ── */}
      <div
        id="agent-preview"
        style={{
          width: 220, flexShrink: 0,
          borderLeft: '1px solid #e5e7eb',
          background: '#fff', padding: '14px 12px', overflowY: 'auto',
          zIndex: tutPoint === 'preview' ? 50 : 1,
          position: 'relative',
          boxShadow: tutPoint === 'preview' ? '0 0 0 3px #ffcd5c' : 'none',
        }}
      >
        <p style={{
          fontSize: 9.5, fontWeight: 800, color: '#9ca3af',
          textTransform: 'uppercase', letterSpacing: 1.2,
          margin: '0 0 12px',
        }}>Voice Preview</p>

        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 10, lineHeight: 1.5 }}>
          Hear your agent's voice. Updates when you add a Language Switch node.
        </div>

        <VoicePreview
          agentName={(initial as any)?.name}
          businessName={(initial as any)?.business_name}
          defaultLanguage={canvasLang}
          compact
          key={canvasLang}
        />

        {/* Legend */}
        <div style={{ marginTop: 18, borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
          <p style={{
            fontSize: 9.5, fontWeight: 800, color: '#9ca3af',
            textTransform: 'uppercase', letterSpacing: 1.2, margin: '0 0 10px',
          }}>Node legend</p>
          {(['start', 'action', 'end'] as const).map(cat => {
            const examples = Object.values(DEFS).filter(d => d.category === cat)
            const label = cat === 'start' ? '▶ Start' : cat === 'end' ? '⏹ End' : '⚙ Action'
            const color = cat === 'start' ? '#16a34a' : cat === 'end' ? '#64748b' : '#7c3aed'
            return (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: '#4b5563', fontWeight: 500 }}>{label}</span>
              </div>
            )
          })}
        </div>

        {/* Connection rules reminder */}
        <div style={{ marginTop: 12, background: '#f9fafb', borderRadius: 9, padding: 10 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', margin: '0 0 7px' }}>Allowed connections</p>
          {[
            { from: '📞 Phone Call', to: '👂 Listen or 🌐 Language Switch' },
            { from: '👂 Listen', to: '🤖 AI Response' },
            { from: '🤖 AI Response', to: '📅 Book, 🚨 Escalate, 💬 WhatsApp, 📵 End' },
            { from: '📅 Book / 🚨 Escalate', to: '💬 WhatsApp or 📵 End' },
            { from: '💬 WhatsApp', to: '📵 End Call only' },
          ].map((r, i) => (
            <div key={i} style={{ fontSize: 10, color: '#6b7280', marginBottom: 5 }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>{r.from}</span>
              <span style={{ color: '#9ca3af' }}> → </span>
              {r.to}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Mobile form ───────────────────────────────────────────────────────────────

function AgentForm({ initial, onSave, isSaving, previewText, setPreviewText, previewUrl, isPreviewing, doPreview }: AgentBuilderProps) {
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
    setForm(prev => ({ ...prev, [key]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSave({
      ...form,
      config: {
        business_name: form.business_name,
        agent_name: form.name,
        greeting_message: `Thank you for calling ${form.business_name}. I'm ${form.name}, how can I help?`,
        operating_hours: form.hours,
        services: form.services,
        escalation_triggers: 'emergency, urgent',
        owner_whatsapp: '',
        language: form.language,
        calendly_url: form.calendly_url,
        timezone: form.timezone,
        faqs: '',
      },
      forwarding_number: form.escalation_phone || undefined,
    } as any)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 px-4 sm:px-6 py-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-gray-900">Configure Agent</h2>
      <Field label="Agent Name" required>
        <input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Priya" required className="input" />
      </Field>
      <Field label="Business Name" required>
        <input type="text" value={form.business_name} onChange={e => set('business_name', e.target.value)} placeholder="e.g. Sharma Dental Clinic" required className="input" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Language">
          <select value={form.language} onChange={e => set('language', e.target.value)} className="input">
            <option value="english">English</option>
            <option value="hindi">Hindi</option>
            <option value="tamil">Tamil</option>
            <option value="arabic">Arabic</option>
            <option value="spanish">Spanish</option>
          </select>
        </Field>
        <Field label="Timezone">
          <select value={form.timezone} onChange={e => set('timezone', e.target.value)} className="input">
            <option value="Asia/Kolkata">IST (India)</option>
            <option value="Asia/Dubai">GST (Dubai)</option>
            <option value="America/New_York">EST (New York)</option>
            <option value="Europe/London">GMT (London)</option>
            <option value="Asia/Singapore">SGT (Singapore)</option>
          </select>
        </Field>
      </div>
      <Field label="Business Hours">
        <input type="text" value={form.hours} onChange={e => set('hours', e.target.value)} placeholder="Mon-Sat 9am-6pm" className="input" />
      </Field>
      <Field label="Services (comma-separated)">
        <input type="text" value={form.services} onChange={e => set('services', e.target.value)} placeholder="Consultation, Cleaning, X-Ray" className="input" />
      </Field>
      <Field label="Escalation Phone">
        <input type="tel" value={form.escalation_phone} onChange={e => set('escalation_phone', e.target.value)} placeholder="+91 98765 43210" className="input" />
      </Field>
      <Field label="Calendly URL (optional)">
        <input type="url" value={form.calendly_url} onChange={e => set('calendly_url', e.target.value)} placeholder="https://calendly.com/your-link" className="input" />
      </Field>
      <button type="submit" disabled={isSaving} className="w-full py-3 px-6 bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors">
        {isSaving ? 'Saving…' : 'Save Agent'}
      </button>
      <div className="space-y-2">
        <div className="flex gap-2">
          <input value={previewText} onChange={e => setPreviewText?.(e.target.value)} placeholder="Type a greeting to preview voice" className="input flex-1" />
          <button type="button" disabled={!initial || !(initial as any).id || isPreviewing} onClick={() => doPreview?.((initial as any)?.id)} className="py-2 px-4 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl text-sm font-semibold">
            {isPreviewing ? '…' : 'Preview'}
          </button>
        </div>
        {previewUrl && <audio className="w-full" controls src={previewUrl} />}
      </div>
    </form>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

// ── Root export ───────────────────────────────────────────────────────────────

export default function AgentBuilder(props: AgentBuilderProps) {
  const [isDesktop, setIsDesktop] = useState(false)
  const [previewText, setPreviewText] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)

  const doPreview = async (agentId?: string) => {
    if (!agentId || !previewText.trim()) return
    setIsPreviewing(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: previewText }),
      })
      if (!res.ok) { setPreviewUrl(null); return }
      const data = await res.json()
      setPreviewUrl(data.audio_url)
    } catch {
      setPreviewUrl(null)
    } finally {
      setIsPreviewing(false)
    }
  }

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  if (isDesktop) {
    return <AgentCanvas {...props} previewText={previewText} setPreviewText={setPreviewText} previewUrl={previewUrl} isPreviewing={isPreviewing} doPreview={doPreview} />
  }
  return <AgentForm {...props} previewText={previewText} setPreviewText={setPreviewText} previewUrl={previewUrl} isPreviewing={isPreviewing} doPreview={doPreview} />
}
