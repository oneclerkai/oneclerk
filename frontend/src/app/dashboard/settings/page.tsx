/**
 * Settings page — account info, phone OTP verification, integration status.
 */
'use client'

import React, { useEffect, useRef, useState } from 'react'
import { auth } from '../../../lib/api'

interface User {
  id: string
  email: string
  name: string | null
  whatsapp_number: string | null
  plan: string
  email_verified: boolean
  phone_verified: boolean
  onboarding_completed: boolean
}

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Phone OTP state
  const [phone, setPhone] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [devOtp, setDevOtp] = useState<string | null>(null)
  const [phoneLoading, setPhoneLoading] = useState(false)
  const [phoneError, setPhoneError] = useState('')
  const [phoneSuccess, setPhoneSuccess] = useState('')
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    auth.me().then(setUser).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const sendPhoneOtp = async () => {
    if (!phone.trim()) { setPhoneError('Enter a phone number'); return }
    setPhoneError('')
    setPhoneLoading(true)
    try {
      const res = await auth.sendPhoneOtp(phone.trim())
      if (res.dev_otp) setDevOtp(res.dev_otp)
      setOtpSent(true)
      setTimeout(() => otpRefs.current[0]?.focus(), 80)
    } catch (err: any) {
      setPhoneError(err.message || 'Could not send OTP')
    } finally {
      setPhoneLoading(false)
    }
  }

  const handleOtpChange = (i: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1)
    const next = [...otp]
    next[i] = digit
    setOtp(next)
    if (digit && i < 5) otpRefs.current[i + 1]?.focus()
  }

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus()
  }

  const verifyPhoneOtp = async () => {
    const code = otp.join('')
    if (code.length < 6) { setPhoneError('Enter all 6 digits'); return }
    setPhoneError('')
    setPhoneLoading(true)
    try {
      const res = await auth.verifyPhoneOtp(phone.trim(), code)
      setUser(res.user)
      setPhoneSuccess('Phone verified successfully!')
      setOtpSent(false)
      setOtp(['', '', '', '', '', ''])
      setDevOtp(null)
    } catch (err: any) {
      setPhoneError(err.message || 'Invalid code')
    } finally {
      setPhoneLoading(false)
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
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Account preferences and verification</p>
      </div>

      {/* Account info */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Account</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoRow label="Name" value={user?.name || '—'} />
          <InfoRow label="Email" value={user?.email || '—'} badge={user?.email_verified ? 'Verified' : 'Unverified'} badgeColor={user?.email_verified ? 'green' : 'yellow'} />
          <InfoRow label="Plan" value={(user?.plan || 'trial').charAt(0).toUpperCase() + (user?.plan || 'trial').slice(1)} />
          <InfoRow label="Phone" value={user?.whatsapp_number || 'Not set'} badge={user?.phone_verified ? 'Verified' : undefined} badgeColor="green" />
        </div>
      </div>

      {/* Phone verification */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Phone / WhatsApp Verification</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Verify your WhatsApp number to receive call summaries and urgent alerts.
          </p>
        </div>

        {user?.phone_verified ? (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <span className="text-green-600">✓</span>
            <p className="text-sm text-green-700 font-medium">
              {user.whatsapp_number} is verified
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {!otpSent ? (
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <button
                  onClick={sendPhoneOtp}
                  disabled={phoneLoading}
                  className="px-4 py-2.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  {phoneLoading ? 'Sending…' : 'Send OTP'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Enter the 6-digit code sent to <strong>{phone}</strong>
                </p>

                {devOtp && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2 text-sm text-yellow-800">
                    <strong>Dev mode:</strong> OTP is <code className="font-mono font-bold">{devOtp}</code>
                  </div>
                )}

                <div className="flex gap-2">
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
                      className="w-10 h-12 text-center text-lg font-bold border-2 border-gray-200 rounded-xl focus:outline-none focus:border-gray-900 transition-colors"
                      aria-label={`Digit ${i + 1}`}
                    />
                  ))}
                  <button
                    onClick={verifyPhoneOtp}
                    disabled={phoneLoading || otp.join('').length < 6}
                    className="ml-2 px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    {phoneLoading ? 'Verifying…' : 'Verify'}
                  </button>
                </div>

                <button
                  onClick={() => { setOtpSent(false); setOtp(['', '', '', '', '', '']); setDevOtp(null) }}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  Change number
                </button>
              </div>
            )}

            {phoneError && (
              <p className="text-sm text-red-600">{phoneError}</p>
            )}
            {phoneSuccess && (
              <p className="text-sm text-green-600 font-medium">{phoneSuccess}</p>
            )}
          </div>
        )}
      </div>

      {/* Logout */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Session</h2>
        <button
          onClick={() => auth.logout()}
          className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium rounded-xl transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

function InfoRow({
  label,
  value,
  badge,
  badgeColor = 'gray',
}: {
  label: string
  value: string
  badge?: string
  badgeColor?: 'green' | 'yellow' | 'gray'
}) {
  const colors = {
    green: 'bg-green-100 text-green-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    gray: 'bg-gray-100 text-gray-500',
  }
  return (
    <div>
      <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-0.5">{label}</p>
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-gray-800">{value}</p>
        {badge && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors[badgeColor]}`}>
            {badge}
          </span>
        )}
      </div>
    </div>
  )
}
