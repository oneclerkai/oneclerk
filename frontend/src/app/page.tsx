/**
 * Root page — redirects authenticated users to the dashboard,
 * unauthenticated users to the login page.
 *
 * This is a client component so it can read localStorage.
 */
'use client'

import { useEffect } from 'react'
import { getToken } from '../lib/api'

export default function RootPage() {
  useEffect(() => {
    const token = getToken()
    // Small delay to avoid flash before redirect
    const dest = token ? '/dashboard' : '/login'
    window.location.replace(dest)
  }, [])

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#fafaf7]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-300 to-yellow-500 flex items-center justify-center font-bold text-gray-900 text-lg">
          OC
        </div>
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900" aria-label="Loading…" />
      </div>
    </div>
  )
}
