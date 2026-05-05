import { useEffect, useState } from 'react'
import { auth, clearToken, getToken, setToken } from '../lib/api'

export function useAuth() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }
    auth.me().then(setUser).catch(() => clearToken()).finally(() => setLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const result = await auth.login(email, password)
    setToken(result.access_token)
    setUser(result.user)
    return result
  }

  const logout = () => {
    setUser(null)
    auth.logout()
  }

  return { user, loading, login, logout }
}
