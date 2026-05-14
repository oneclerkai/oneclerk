/**
 * Signup page — link-based email verification flow.
 *
 * Step 1: Enter email → backend sends verification link via Resend
 * Step 2: User clicks link → redirected to verify-email page to complete signup
 */
'use client'

import React, { useState } from 'react'
import { auth } from '../../lib/api'

type Step = 'email' | 'sent'

export default function SignupPage() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [devLink, setDevLink] = useState<string | null>(null)

  // ── Step 1: send verification link ─────────────────────────────────────────
  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await auth.sendEmailVerificationLink(email)
      if (res.dev_link) setDevLink(res.dev_link) // shown in dev when Resend not configured
      setStep('sent')
    } catch (err: any) {
      setError(err.message || 'Could not send verification link')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#fafaf7] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-yellow-300 to-yellow-500 flex items-center justify-center font-bold text-gray-900 text-sm">
              OC
            </div>
            <span className="text-xl font-bold text-gray-900">OneClerk</span>
          </div>
          <p className="text-sm text-gray-500">Set up your AI receptionist in 12 minutes.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {/* ── Step 1: Email ── */}
          {step === 'email' && (
            <form onSubmit={handleSendLink} className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Create your account</h1>
                <p className="text-sm text-gray-500 mb-6">We'll send a verification link to your email.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                  Work email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@business.com"
                  required
                  autoComplete="email"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              {error && <ErrorBox message={error} />}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
              >
                {loading ? 'Sending link…' : 'Send verification link →'}
              </button>
              <p className="text-center text-sm text-gray-500">
                Already have an account?{' '}
                <a href="/login" className="font-semibold text-gray-900 hover:underline">
                  Sign in
                </a>
              </p>
            </form>
          )}

          {/* ── Step 2: Link Sent ── */}
          {step === 'sent' && (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Check your email</h1>
                <p className="text-sm text-gray-500 mb-1">
                  We sent a verification link to <strong>{email}</strong>.
                </p>
                <p className="text-sm text-gray-500">
                  Click the link in the email to complete your account setup.
                </p>
              </div>

              {devLink && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-800">
                  <strong>Dev mode:</strong> Click{' '}
                  <a href={devLink} className="font-mono font-bold underline">
                    here
                  </a>{' '}
                  to verify
                  <br />
                  <span className="text-xs">(Resend not configured — link shown here only in development)</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => setStep('email')}
                className="text-xs text-gray-400 hover:text-gray-600 underline"
              >
                Wrong email? Go back
              </button>

              <div className="pt-4 border-t border-gray-100">
                <p className="text-center text-xs text-gray-400 mb-3">
                  Didn't get it?{' '}
                  <button
                    type="button"
                    onClick={handleSendLink}
                    className="underline hover:text-gray-600"
                  >
                    Resend link
                  </button>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  )
}
