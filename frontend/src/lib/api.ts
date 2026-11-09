import { supabase } from './supabase'

// URL directa del backend en Render (sólo para diagnóstico / wake button UI).
export const BACKEND_ORIGIN = 'https://gymlog-5y6y.onrender.com'

// En producción: /api — Cloudflare Pages Function proxea a Render (sin CORS ni preflight).
// En dev: VITE_API_URL o localhost:8000.
const API_URL = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL as string | undefined ?? `http://${window.location.hostname}:8000`)
  : '/api'

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
