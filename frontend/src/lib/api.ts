import { supabase } from './supabase'

const _envUrl = import.meta.env.VITE_API_URL as string | undefined
// Dev local: sin env var, construye la URL con la IP del PC (para iPhone en misma red)
// Producción: usa VITE_API_URL; si falta, cae al backend de Render como seguro HTTPS
const _isDev = import.meta.env.VITE_SUPABASE_URL?.includes('placeholder')
const API_URL = _envUrl || (_isDev ? `http://${window.location.hostname}:8000` : 'https://gymlog-5y6y.onrender.com')

async function getAuthHeaders(method = 'GET'): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }))
  const token = data.session?.access_token ?? 'dev-local-user'
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (method !== 'GET') headers['Content-Type'] = 'application/json'
  return headers
}

export async function wakeUpBackend(): Promise<void> {
  try { await fetch(`${API_URL}/health`) } catch { /* ignore — solo para despertar Render */ }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = await getAuthHeaders(method)
  const url = `${API_URL}${path}`
  let res: Response
  try {
    res = await fetch(url, { ...init, headers: { ...headers, ...init.headers } })
  } catch (err) {
    throw new Error(`Fetch failed (${url}): ${err}`)
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}
