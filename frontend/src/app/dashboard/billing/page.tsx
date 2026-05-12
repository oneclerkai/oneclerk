/**
 * Billing page — plan overview, usage widget, and plan upgrade cards.
 */
'use client'

import React, { useEffect, useState } from 'react'
import UsageWidget from '../../../components/UsageWidget'
import { useBilling } from '../../../hooks/useBilling'

const PLAN_FEATURES: Record<string, string[]> = {
  starter: [
    'AI voice agent in one language',
    'WhatsApp call summaries',
    '1 phone number',
    '1 AI agent',
    '300 minutes / month',
    'Email support',
  ],
  growth: [
    'Multi-language voice agent',
    'Live WhatsApp + email recaps',
    '2 phone numbers',
    '3 AI agents',
    '600 minutes / month',
    'Google Calendar sync',
    'Priority support',
  ],
  scale: [
    '1,200 minutes / month',
    'Custom voice clone',
    'WhatsApp + Slack + email recaps',
    'Unlimited numbers',
    '10 AI agents',
    'API + webhooks',
    'Dedicated CSM',
  ],
}

export default function BillingPage() {
  const { status, loading, error, createCheckout, openPortal } = useBilling()
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)

  const handleUpgrade = async (plan: 'starter' | 'growth' | 'scale') => {
    setCheckoutLoading(plan)
    try {
      await createCheckout(plan)
    } catch {
      // error already dispatched via notifyError
    } finally {
      setCheckoutLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Billing</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your plan and usage</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Current plan + usage */}
      {status && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Plan card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Current plan</p>
                <p className="text-2xl font-bold text-gray-900">{status.plan_name}</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  Status:{' '}
                  <span className={status.status === 'active' || status.status === 'trialing' ? 'text-green-600 font-medium' : 'text-yellow-600 font-medium'}>
                    {status.status}
                  </span>
                </p>
                {status.trial_ends_at && status.plan === 'trial' && (
                  <p className="text-xs text-gray-400 mt-1">
                    Trial ends {new Date(status.trial_ends_at).toLocaleDateString()}
                  </p>
                )}
              </div>
              {status.stripe_customer_id && (
                <button
                  onClick={openPortal}
                  className="text-xs font-semibold px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Manage →
                </button>
              )}
            </div>

            {!status.stripe_ready && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-xs text-yellow-800">
                Stripe is not configured. Set <code>STRIPE_SECRET_KEY</code> and price IDs to enable checkout.
              </div>
            )}
          </div>

          {/* Usage widget */}
          {status.usage && (
            <UsageWidget usage={status.usage} planName={status.plan_name} />
          )}
        </div>
      )}

      {/* Plan cards */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-4">Upgrade your plan</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(['starter', 'growth', 'scale'] as const).map((plan) => {
            const isCurrent = status?.plan === plan
            const isFeatured = plan === 'growth'
            const prices = { starter: 39, growth: 99, scale: 149 }
            const names = { starter: 'Starter', growth: 'Growth', scale: 'Scale' }

            return (
              <div
                key={plan}
                className={`relative bg-white rounded-2xl border shadow-sm p-6 flex flex-col ${
                  isFeatured ? 'border-gray-900 shadow-lg' : 'border-gray-100'
                } ${isCurrent ? 'ring-2 ring-green-400' : ''}`}
              >
                {isFeatured && (
                  <span className="absolute -top-3 left-6 bg-yellow-400 text-gray-900 text-xs font-bold px-3 py-1 rounded-full">
                    Most popular
                  </span>
                )}
                {isCurrent && (
                  <span className="absolute -top-3 right-6 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                    Current
                  </span>
                )}

                <div className="mb-4">
                  <p className="text-lg font-bold text-gray-900">{names[plan]}</p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-3xl font-extrabold text-gray-900">${prices[plan]}</span>
                    <span className="text-sm text-gray-400">/month</span>
                  </div>
                </div>

                <ul className="space-y-2 flex-1 mb-6">
                  {(PLAN_FEATURES[plan] || []).map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="text-green-500 font-bold mt-0.5">✓</span>
                      {feat}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleUpgrade(plan)}
                  disabled={isCurrent || checkoutLoading === plan || !status?.stripe_ready}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    isCurrent
                      ? 'bg-gray-100 text-gray-400 cursor-default'
                      : isFeatured
                      ? 'bg-gray-900 hover:bg-gray-800 text-white'
                      : 'border border-gray-200 hover:bg-gray-50 text-gray-700'
                  } disabled:opacity-50`}
                >
                  {isCurrent
                    ? 'Current plan'
                    : checkoutLoading === plan
                    ? 'Redirecting…'
                    : `Upgrade to ${names[plan]}`}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
