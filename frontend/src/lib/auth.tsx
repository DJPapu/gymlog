import { type Session, type User } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'

interface AuthCtx {
  user: User | null
  session: Session | null
  loading: boolean
}

const AuthContext = createContext<AuthCtx>({ user: null, session: null, loading: true })

// Usuario local para desarrollo sin Supabase configurado
const LOCAL_USER = { id: 'local-user-dev' } as User

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => {/* no hay sesión guardada */})
      .finally(() => setLoading(false))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const user = session?.user ?? LOCAL_USER

  return (
    <AuthContext.Provider value={{ user, session, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
