/**
 * MMICarrierCodes — Indian call-forwarding MMI codes dashboard section.
 *
 * Lets the business owner select their carrier and copy the correct
 * call-forwarding code to activate OneClerk on their mobile number.
 */
import React, { useState } from 'react'

interface Carrier {
  id: string
  name: string
  logo: string
  /** {NUMBER} is replaced with the agent's forwarding number */
  activateCode: string
  deactivateCode: string
  conditionalCode: string
}

const CARRIERS: Carrier[] = [
  {
    id: 'jio',
    name: 'Jio',
    logo: '📱',
    activateCode: '*401*{NUMBER}#',
    deactivateCode: '##401#',
    conditionalCode: '*401*{NUMBER}#',
  },
  {
    id: 'airtel',
    name: 'Airtel',
    logo: '📶',
    activateCode: '*21*{NUMBER}#',
    deactivateCode: '##21#',
    conditionalCode: '*61*{NUMBER}#',
  },
  {
    id: 'vi',
    name: 'Vi (Vodafone Idea)',
    logo: '🔴',
    activateCode: '*21*{NUMBER}#',
    deactivateCode: '##21#',
    conditionalCode: '*61*{NUMBER}#',
  },
  {
    id: 'bsnl',
    name: 'BSNL',
    logo: '🏛️',
    activateCode: '**21*{NUMBER}#',
    deactivateCode: '##21#',
    conditionalCode: '**61*{NUMBER}#',
  },
]

interface MMICarrierCodesProps {
  forwardingNumber?: string
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard API not available
    }
  }

  return (
    <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 gap-2">
      <div className="min-w-0">
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <code className="text-sm font-mono font-semibold text-gray-800 break-all">{code}</code>
      </div>
      <button
        onClick={handleCopy}
        aria-label={`Copy ${label} code`}
        className="shrink-0 text-xs px-2 py-1 rounded-md bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>
    </div>
  )
}

export default function MMICarrierCodes({ forwardingNumber }: MMICarrierCodesProps) {
  const [selectedCarrierId, setSelectedCarrierId] = useState<string>('jio')
  const number = forwardingNumber || '+91XXXXXXXXXX'

  const carrier = CARRIERS.find((c) => c.id === selectedCarrierId) ?? CARRIERS[0]

  const fill = (template: string) => template.replace('{NUMBER}', number)

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700">Call Forwarding Setup</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Dial these codes from your business mobile to forward calls to OneClerk.
        </p>
      </div>

      {/* Carrier selector */}
      <div>
        <label htmlFor="carrier-select" className="text-xs font-medium text-gray-600 block mb-1">
          Select your carrier
        </label>
        <select
          id="carrier-select"
          value={selectedCarrierId}
          onChange={(e) => setSelectedCarrierId(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {CARRIERS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.logo} {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Forwarding number display */}
      {forwardingNumber ? (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
          <span className="text-blue-500">📞</span>
          <p className="text-xs text-blue-700">
            Forwarding to: <span className="font-semibold">{forwardingNumber}</span>
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-100 rounded-xl px-3 py-2">
          <span className="text-yellow-500">⚠</span>
          <p className="text-xs text-yellow-700">
            Activate your agent to get a forwarding number.
          </p>
        </div>
      )}

      {/* MMI codes */}
      <div className="space-y-2">
        <CodeBlock code={fill(carrier.activateCode)} label="Unconditional forward (all calls)" />
        <CodeBlock code={fill(carrier.conditionalCode)} label="Conditional forward (no answer / busy)" />
        <CodeBlock code={carrier.deactivateCode} label="Deactivate forwarding" />
      </div>

      {/* Instructions */}
      <div className="text-xs text-gray-500 space-y-1">
        <p>1. Copy the <strong>Unconditional forward</strong> code above.</p>
        <p>2. Open your phone dialler and dial the code exactly as shown.</p>
        <p>3. Press call — you'll hear a confirmation tone.</p>
        <p>4. Test by calling your business number from another phone.</p>
      </div>
    </div>
  )
}
