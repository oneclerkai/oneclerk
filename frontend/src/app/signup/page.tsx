/**
 * Signup page — link-based email verification flow + Google OAuth.
 *
 * Step 1: Enter email → backend sends verification link via Gmail/Resend
 * Step 2: User clicks link → redirected to verify-email page to complete signup
 */
'use client'

import React, { useEffect, useState } from 'react'
import { auth, setToken } from '../../lib/api'

type Step = 'email' | 'sent'

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''

export default function SignupPage() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [devLink, setDevLink] = useState<string | null>(null)

  // Load Google Identity Services script
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    document.head.appendChild(script)
    return () => {
      document.head.removeChild(script)
    }
  }, [])

  const handleGoogleSignup = async () => {
    if (!GOOGLE_CLIENT_ID) {
      setError('Google sign-up is not configured. Please use email.')
      return
    }
    setGoogleLoading(true)
    setError('')
    try {
      await new Promise<void>((resolve, reject) => {
        const win = window as any
        if (!win.google?.accounts?.id) {
          reject(new Error('Google Identity Services not loaded'))
          return
        }
        win.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response: { credential: string }) => {
            try {
              const result = await auth.googleLogin(response.credential)
              setToken(result.access_token)
              window.location.href = '/dashboard'
              resolve()
            } catch (err: any) {
              reject(err)
            }
          },
        })
        win.google.accounts.id.prompt((notification: any) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            reject(new Error('Google sign-up was dismissed. Please try again.'))
          }
        })
      })
    } catch (err: any) {
      setError(err.message || 'Google sign-up failed')
    } finally {
      setGoogleLoading(false)
    }
  }

  // ── Step 1: send verification link ─────────────────────────────────────────
  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await auth.sendEmailVerificationLink(email)
      if (res.dev_link) setDevLink(res.dev_link) // shown in dev when email not configured
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
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Create your account</h1>
                <p className="text-sm text-gray-500 mb-4">Set up your AI receptionist in 12 minutes.</p>
              </div>

              {/* Google OAuth */}
              {GOOGLE_CLIENT_ID && (
                <>
                  <button
                    type="button"
                    onClick={handleGoogleSignup}
                    disabled={googleLoading || loading}
                    className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    {googleLoading ? 'Signing up with Google…' : 'Continue with Google'}
                  </button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-100" />
                    </div>
                    <div className="relative flex justify-center text-xs text-gray-400">
                      <span className="bg-white px-3">or sign up with email</span>
                    </div>
                  </div>
                </>
              )}

              <form onSubmit={handleSendLink} className="space-y-4">
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
                  disabled={loading || googleLoading}
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
            </div>
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
