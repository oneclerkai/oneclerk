/**
 * VoicePreview — animated waveform + voice/language selector.
 *
 * Two modes:
 *  1. Real audio (ElevenLabs via backend) — plays the actual synthesized voice
 *  2. Browser TTS fallback — uses Web Speech API when backend audio unavailable
 *
 * The waveform animates while audio is playing.
 */
'use client'

import React, { useEffect, useRef, useState } from 'react'
import { dashboard } from '../lib/api'

// ---------------------------------------------------------------------------
// Voice definitions
// ---------------------------------------------------------------------------

interface VoiceDef {
  id: string
  label: string
  sub: string
  rate: number
  pitch: number
  gender: 'female' | 'male'
  elevenlabsId?: string
}

const VOICES: VoiceDef[] = [
  { id: 'maya',   label: 'Maya',   sub: 'Warm · Mid-30s',    rate: 0.95, pitch: 1.15, gender: 'female' },
  { id: 'arjun',  label: 'Arjun',  sub: 'Calm · Deep',       rate: 0.88, pitch: 0.65, gender: 'male'   },
  { id: 'sofia',  label: 'Sofia',  sub: 'Bright · Friendly', rate: 1.08, pitch: 1.35, gender: 'female' },
  { id: 'daniel', label: 'Daniel', sub: 'Professional',      rate: 1.00, pitch: 0.90, gender: 'male'   },
  { id: 'linh',   label: 'Linh',   sub: 'Soft · Soothing',   rate: 0.85, pitch: 1.05, gender: 'female' },
]

const LANGUAGES = [
  { label: 'English (US)',    code: 'en-US', apiLang: 'english' },
  { label: 'Hindi (हिंदी)',    code: 'hi-IN', apiLang: 'hindi'   },
  { label: 'Spanish',         code: 'es-ES', apiLang: 'spanish' },
  { label: 'Arabic',          code: 'ar-SA', apiLang: 'arabic'  },
  { label: 'Tamil',           code: 'ta-IN', apiLang: 'tamil'   },
  { label: 'French',          code: 'fr-FR', apiLang: 'english' },
  { label: 'Mandarin',        code: 'zh-CN', apiLang: 'english' },
  { label: 'Portuguese',      code: 'pt-PT', apiLang: 'english' },
  { label: 'German',          code: 'de-DE', apiLang: 'english' },
  { label: 'Japanese',        code: 'ja-JP', apiLang: 'english' },
]

const GREETINGS: Record<string, string> = {
  'en-US': "Hi, this is your AI receptionist from OneClerk. How can I help you today?",
  'hi-IN': "नमस्ते, यहाँ OneClerk है। मैं आपकी कैसे मदद कर सकता हूँ?",
  'es-ES': "Hola, le habla OneClerk. ¿En qué le puedo ayudar?",
  'ar-SA': "مرحبا، هذا OneClerk. كيف يمكنني مساعدتك؟",
  'ta-IN': "வணக்கம், இது OneClerk. நான் உங்களுக்கு எப்படி உதவலாம்?",
  'fr-FR': "Bonjour, ici OneClerk. Comment puis-je vous aider?",
  'zh-CN': "您好，这里是OneClerk。我可以如何帮助您？",
  'pt-PT': "Olá, aqui é o OneClerk. Como posso ajudá-lo?",
  'de-DE': "Hallo, hier ist OneClerk. Wie kann ich Ihnen helfen?",
  'ja-JP': "こんにちは、OneClerkです。どのようにお手伝いできますか？",
}

// ---------------------------------------------------------------------------
// Waveform canvas hook
// ---------------------------------------------------------------------------

function useWaveform(canvasRef: React.RefObject<HTMLCanvasElement>, speaking: boolean, pitch: number) {
  const rafRef = useRef<number>()
  const tRef = useRef(0)
  const levelRef = useRef(0.1)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      canvas.width = r.width * dpr
      canvas.height = r.height * dpr
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const draw = () => {
      tRef.current += 0.035 * (0.7 + pitch * 0.3)
      levelRef.current += ((speaking ? 0.88 : 0.08) - levelRef.current) * 0.06

      const w = canvas.width
      const h = canvas.height
      if (!w || !h) { rafRef.current = requestAnimationFrame(draw); return }

      ctx.clearRect(0, 0, w, h)
      const bars = 48
      const bw = w / bars

      for (let i = 0; i < bars; i++) {
        const phase = i * 0.4 + tRef.current
        const amp = Math.sin(phase) * 0.35 + Math.sin(phase * 1.7) * 0.35 + Math.sin(phase * 0.6) * 0.3
        const bh = Math.max(3 * dpr, Math.abs(amp) * levelRef.current * h * 0.88)
        const ratio = i / bars
        const r = Math.round(255 - ratio * 156)
        const g = Math.round(138 - ratio * 36)
        const b = Math.round(61 + ratio * 180)
        ctx.fillStyle = `rgba(${r},${g},${b},0.88)`
        ctx.fillRect(i * bw + bw * 0.18, (h - bh) / 2, bw * 0.64, bh)
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      ro.disconnect()
    }
  }, [speaking, pitch, canvasRef])
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface VoicePreviewProps {
  /** Optional agent name to personalise the greeting */
  agentName?: string
  /** Optional business name */
  businessName?: string
  /** Optional pre-selected voice ID */
  defaultVoiceId?: string
  /** Optional pre-selected language code */
  defaultLanguage?: string
  /** Show compact layout (no language list) */
  compact?: boolean
}

export default function VoicePreview({
  agentName,
  businessName,
  defaultVoiceId,
  defaultLanguage = 'en-US',
  compact = false,
}: VoicePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [speaking, setSpeaking] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState<VoiceDef>(
    VOICES.find((v) => v.id === defaultVoiceId) ?? VOICES[0]
  )
  const [selectedLang, setSelectedLang] = useState(
    LANGUAGES.find((l) => l.code === defaultLanguage) ?? LANGUAGES[0]
  )
  const [status, setStatus] = useState('Press Play to hear a sample call.')
  const [loading, setLoading] = useState(false)

  useWaveform(canvasRef, speaking, selectedVoice.pitch)

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    setSpeaking(false)
    setStatus('Stopped.')
  }

  const play = async () => {
    if (speaking) { stop(); return }

    const greeting = (() => {
      const base = GREETINGS[selectedLang.code] ?? GREETINGS['en-US']
      if (agentName || businessName) {
        return `Hi, this is ${agentName || 'your AI receptionist'} from ${businessName || 'OneClerk'}. How can I help you today?`
      }
      return base
    })()

    setStatus('Synthesizing…')
    setLoading(true)

    // Try real ElevenLabs audio first
    try {
      const res = await dashboard.voicePreview(greeting, selectedLang.apiLang)
      if (res?.audio_url) {
        const audio = new Audio(res.audio_url)
        audioRef.current = audio
        audio.onplay = () => { setSpeaking(true); setLoading(false); setStatus(`Speaking in ${selectedLang.label} · ${selectedVoice.label}`) }
        audio.onended = () => { setSpeaking(false); setStatus('Done. Press Play to replay.') }
        audio.onerror = () => { setSpeaking(false); setLoading(false); fallbackTts(greeting) }
        await audio.play()
        return
      }
    } catch {
      // fall through to browser TTS
    }

    setLoading(false)
    fallbackTts(greeting)
  }

  const fallbackTts = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setStatus('Audio not available in this browser.')
      return
    }
    const u = new SpeechSynthesisUtterance(text)
    u.lang = selectedLang.code
    u.rate = selectedVoice.rate
    u.pitch = selectedVoice.pitch
    u.onstart = () => { setSpeaking(true); setStatus(`Speaking in ${selectedLang.label} · ${selectedVoice.label}`) }
    u.onend = () => { setSpeaking(false); setStatus('Done. Press Play to replay.') }
    u.onerror = () => { setSpeaking(false); setStatus('Speech synthesis failed.') }
    window.speechSynthesis.speak(u)
  }

  return (
    <div className="space-y-4">
      {/* Waveform */}
      <div className="relative bg-gray-950 rounded-2xl overflow-hidden" style={{ height: 100 }}>
        <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
        <div className="absolute bottom-3 left-0 right-0 text-center">
          <p className="text-xs text-white/50">{status}</p>
        </div>
      </div>

      {/* Voice selector */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Voice</p>
        <div className="flex flex-wrap gap-2">
          {VOICES.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelectedVoice(v)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                selectedVoice.id === v.id
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              <span className="font-semibold">{v.label}</span>
              <span className={`ml-1 ${selectedVoice.id === v.id ? 'text-white/60' : 'text-gray-400'}`}>
                {v.sub}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Language selector */}
      {!compact && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Language <span className="font-normal normal-case">({LANGUAGES.length})</span>
          </p>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => setSelectedLang(l)}
                className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                  selectedLang.code === l.code
                    ? 'bg-yellow-400 text-gray-900 border-yellow-400'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Play button */}
      <button
        onClick={play}
        disabled={loading}
        className={`flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-all ${
          speaking
            ? 'bg-red-500 hover:bg-red-600 text-white'
            : 'bg-gray-900 hover:bg-gray-800 text-white'
        } disabled:opacity-50`}
      >
        {loading ? (
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : speaking ? (
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
        ) : (
          <span>▶</span>
        )}
        {loading ? 'Synthesizing…' : speaking ? 'Stop' : 'Play sample'}
      </button>
    </div>
  )
}
