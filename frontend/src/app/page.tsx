/**
 * Root page — redirects authenticated users to the dashboard,
 * unauthenticated users to login.
 */
'use client'

import { useEffect } from 'react'
import { getToken } from '../lib/api'

export default function RootPage() {
  useEffect(() => {
    const token = getToken()
    window.location.replace(token ? '/dashboard' : '/login')
  }, [])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" aria-label="Redirecting…" />
    </div>
  )
}
