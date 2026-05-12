import { useEffect, useState } from 'react'
import { auth, clearToken, getToken, setToken } from '../lib/api'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  whatsapp_number: string | null
  plan: string
  trial_ends_at: string | null
  onboarding_completed: boolean
  email_verified: boolean
  phone_verified: boolean
  business_profile: Record<string, unknown> | null
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }
    auth
      .me()
      .then((u) => setUser(u as AuthUser))
      .catch(() => clearToken())
      .finally(() => setLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const result = await auth.login(email, password)
    setToken(result.access_token)
    setUser(result.user as AuthUser)
    return result
  }

  const logout = () => {
    setUser(null)
    auth.logout()
  }

  const refreshUser = async () => {
    try {
      const u = await auth.me()
      setUser(u as AuthUser)
    } catch {
      clearToken()
      setUser(null)
    }
  }

  return { user, loading, login, logout, refreshUser }
}

/**
 * Redirect to /login if no token is present.
 * Use this in dashboard pages that require authentication.
 */
export function useRequireAuth() {
  const { user, loading } = useAuth()

  useEffect(() => {
    if (!loading && !user && !getToken()) {
      window.location.href = '/login'
    }
  }, [user, loading])

  return { user, loading }
}
