/**
 * Signup page — two-step OTP email verification flow.
 *
 * Step 1: Enter email → backend sends 6-digit OTP via Resend
 * Step 2: Enter OTP + name + password → account created, token stored
 */
'use client'

import React, { useState, useRef } from 'react'
import { auth, setToken } from '../../lib/api'

type Step = 'email' | 'otp' | 'details'

export default function SignupPage() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [devOtp, setDevOtp] = useState<string | null>(null)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  // ── Step 1: send OTP ──────────────────────────────────────────────────────
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await auth.sendEmailOtp(email)
      if (res.dev_otp) setDevOtp(res.dev_otp) // shown in dev when Resend not configured
      setStep('otp')
      setTimeout(() => otpRefs.current[0]?.focus(), 80)
    } catch (err: any) {
      setError(err.message || 'Could not send verification code')
    } finally {
      setLoading(false)
    }
  }

  // ── OTP input helpers ─────────────────────────────────────────────────────
  const handleOtpChange = (i: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1)
    const next = [...otp]
    next[i] = digit
    setOtp(next)
    if (digit && i < 5) otpRefs.current[i + 1]?.focus()
  }

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) {
      otpRefs.current[i - 1]?.focus()
    }
  }

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (digits.length === 6) {
      setOtp(digits.split(''))
      otpRefs.current[5]?.focus()
    }
  }

  const otpValue = otp.join('')

  // ── Step 2: verify OTP → show details form ────────────────────────────────
  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault()
    if (otpValue.length < 6) { setError('Enter all 6 digits'); return }
    setError('')
    setStep('details')
  }

  // ── Step 3: create account ────────────────────────────────────────────────
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await auth.verifyEmailOtpAndSignup({
        email,
        password,
        otp: otpValue,
        name: name.trim() || undefined,
      })
      setToken(result.access_token)
      window.location.href = '/dashboard'
    } catch (err: any) {
      setError(err.message || 'Account creation failed')
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
          {/* Progress dots */}
          <div className="flex items-center gap-2 mb-6">
            {(['email', 'otp', 'details'] as Step[]).map((s, i) => (
              <React.Fragment key={s}>
                <div
                  className={`w-2 h-2 rounded-full transition-colors ${
                    step === s
                      ? 'bg-gray-900 scale-125'
                      : ['email', 'otp', 'details'].indexOf(step) > i
                      ? 'bg-green-500'
                      : 'bg-gray-200'
                  }`}
                />
                {i < 2 && <div className="flex-1 h-px bg-gray-100" />}
              </React.Fragment>
            ))}
          </div>

          {/* ── Step 1: Email ── */}
          {step === 'email' && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Create your account</h1>
                <p className="text-sm text-gray-500 mb-6">We'll send a verification code to your email.</p>
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
                {loading ? 'Sending code…' : 'Send verification code →'}
              </button>
              <p className="text-center text-sm text-gray-500">
                Already have an account?{' '}
                <a href="/login" className="font-semibold text-gray-900 hover:underline">
                  Sign in
                </a>
              </p>
            </form>
          )}

          {/* ── Step 2: OTP ── */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Check your email</h1>
                <p className="text-sm text-gray-500 mb-1">
                  We sent a 6-digit code to <strong>{email}</strong>.
                </p>
                <button
                  type="button"
                  onClick={() => setStep('email')}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  Wrong email? Go back
                </button>
              </div>

              {devOtp && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-800">
                  <strong>Dev mode:</strong> OTP is <code className="font-mono font-bold">{devOtp}</code>
                  <br />
                  <span className="text-xs">(Resend not configured — code shown here only in development)</span>
                </div>
              )}

              {/* 6-box OTP input */}
              <div className="flex gap-2 justify-center" onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className="w-12 h-14 text-center text-xl font-bold border-2 border-gray-200 rounded-xl focus:outline-none focus:border-gray-900 transition-colors"
                    aria-label={`Digit ${i + 1}`}
                  />
                ))}
              </div>

              {error && <ErrorBox message={error} />}

              <button
                type="submit"
                disabled={otpValue.length < 6}
                className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
              >
                Verify code →
              </button>

              <p className="text-center text-xs text-gray-400">
                Didn't get it?{' '}
                <button
                  type="button"
                  onClick={handleSendOtp}
                  className="underline hover:text-gray-600"
                >
                  Resend
                </button>
              </p>
            </form>
          )}

          {/* ── Step 3: Details ── */}
          {step === 'details' && (
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Almost there</h1>
                <p className="text-sm text-gray-500 mb-6">Set your name and a password to finish.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                  Your name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Cooper"
                  autoComplete="name"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              {error && <ErrorBox message={error} />}

              <button
                type="submit"
                disabled={loading || !password || password.length < 6}
                className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
              >
                {loading ? 'Creating account…' : 'Create account →'}
              </button>
            </form>
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
