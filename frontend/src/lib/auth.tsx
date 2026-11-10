import type { User } from '@supabase/supabase-js'
import { createContext, useContext, type ReactNode } from 'react'

interface AuthCtx {
  user: User
  session: null
  loading: boolean
}

const FIXED_USER = {
  id: import.meta.env.VITE_USER_ID ?? 'local-user-dev',
  user_metadata: { full_name: (import.meta.env.VITE_USER_NAME as string | undefined) ?? 'Valentin' },
} as unknown as User

const AuthContext = createContext<AuthCtx>({ user: FIXED_USER, session: null, loading: false })

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider value={{ user: FIXED_USER, session: null, loading: false }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
