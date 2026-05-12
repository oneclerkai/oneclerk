/**
 * UsageWidget — shows minutes used vs. included, rollover (green), and
 * overage warnings (yellow / red).  Consumed by the dashboard.
 */
import React from 'react'

interface UsageData {
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

interface UsageWidgetProps {
  usage: UsageData
  planName: string
}

function ProgressBar({
  pct,
  color,
}: {
  pct: number
  color: 'green' | 'yellow' | 'red' | 'blue'
}) {
  const colorMap = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-400',
    red: 'bg-red-500',
    blue: 'bg-blue-500',
  }
  return (
    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
      <div
        className={`h-3 rounded-full transition-all duration-500 ${colorMap[color]}`}
        style={{ width: `${Math.min(100, pct)}%` }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  )
}

export default function UsageWidget({ usage, planName }: UsageWidgetProps) {
  const {
    minutes_used,
    minutes_included,
    rollover_minutes,
    total_available,
    minutes_remaining,
    overage_minutes,
    overage_cost_inr,
    pct_used,
    alert_80,
    alert_100,
    allow_overage,
  } = usage

  // Determine bar colour based on usage level
  const barColor: 'green' | 'yellow' | 'red' | 'blue' = alert_100
    ? 'red'
    : alert_80
    ? 'yellow'
    : rollover_minutes > 0
    ? 'green'
    : 'blue'

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Minutes Usage</h3>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
          {planName}
        </span>
      </div>

      {/* Progress bar */}
      <ProgressBar pct={pct_used} color={barColor} />

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-gray-500 text-xs">Used</p>
          <p className="font-semibold text-gray-800">
            {minutes_used} <span className="text-gray-400 font-normal">/ {total_available} min</span>
          </p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Remaining</p>
          <p className={`font-semibold ${minutes_remaining === 0 ? 'text-red-600' : 'text-gray-800'}`}>
            {minutes_remaining} min
          </p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Included</p>
          <p className="font-semibold text-gray-800">{minutes_included} min</p>
        </div>
        {rollover_minutes > 0 && (
          <div>
            <p className="text-green-600 text-xs font-medium">Rollover</p>
            <p className="font-semibold text-green-700">+{rollover_minutes} min</p>
          </div>
        )}
      </div>

      {/* Overage warning */}
      {overage_minutes > 0 && allow_overage && (
        <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-xl p-3">
          <span className="text-yellow-500 text-lg leading-none">⚠</span>
          <div>
            <p className="text-yellow-800 text-xs font-semibold">Overage active</p>
            <p className="text-yellow-700 text-xs">
              {overage_minutes} min over limit — ₹{overage_cost_inr.toFixed(0)} billed at end of cycle
            </p>
          </div>
        </div>
      )}

      {/* Hard limit warning for trial */}
      {alert_100 && !allow_overage && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
          <span className="text-red-500 text-lg leading-none">🚫</span>
          <div>
            <p className="text-red-800 text-xs font-semibold">Limit reached</p>
            <p className="text-red-700 text-xs">
              Upgrade to a paid plan to continue receiving calls.
            </p>
          </div>
        </div>
      )}

      {/* 80 % soft warning */}
      {alert_80 && !alert_100 && (
        <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-xl p-3">
          <span className="text-yellow-500 text-lg leading-none">⚡</span>
          <p className="text-yellow-700 text-xs">
            You've used {pct_used.toFixed(0)}% of your minutes this month.
          </p>
        </div>
      )}
    </div>
  )
}
