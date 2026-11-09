import { supabase } from './supabase'

// VITE_API_URL en Cloudflare Pages apunta a https://gymlog-5y6y.onrender.com
// (browser → Render directo; evita el Cloudflare Bot Challenge que triggea el Worker).
// Sin VITE_API_URL en producción: cae al proxy /api como fallback.
// En dev sin VITE_API_URL: localhost:8000.
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)
  ?? (import.meta.env.DEV ? `http://${window.location.hostname}:8000` : '/api')

async function getAuthHeaders(method = 'GET'): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }))
  const token = data.session?.access_token ?? 'dev-local-user'
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (method !== 'GET') headers['Content-Type'] = 'application/json'
  return headers
}

export function wakeUpBackend(): void {
  fetch(`${API_URL}/health`).catch(() => { /* fire-and-forget: activa el boot de Render */ })
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
