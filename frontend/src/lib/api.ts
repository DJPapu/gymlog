import { supabase } from './supabase'

// En móvil, window.location.hostname es la IP del PC (no localhost),
// así que la usamos para construir la URL del backend dinámicamente.
const _envUrl = import.meta.env.VITE_API_URL as string | undefined
const API_URL = _envUrl || `http://${window.location.hostname}:8000`

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }))
  // Sin sesión Supabase real → token de desarrollo
  const token = data.session?.access_token ?? 'dev-local-user'
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}${path}`, { ...init, headers: { ...headers, ...init.headers } })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}
