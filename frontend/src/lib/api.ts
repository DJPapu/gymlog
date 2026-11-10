// URL directa del backend en Render (sólo para diagnóstico / wake button UI).
export const BACKEND_ORIGIN = 'https://gymlog-5y6y.onrender.com'

// En producción: /api — Cloudflare Pages Function proxea a Render (sin CORS ni preflight).
// En dev: VITE_API_URL o localhost:8000.
const API_URL = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL as string | undefined ?? `http://${window.location.hostname}:8000`)
  : '/api'

const API_SECRET = (import.meta.env.VITE_API_SECRET as string | undefined) ?? 'dev-local-user'

function getAuthHeaders(method = 'GET'): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${API_SECRET}` }
  if (method !== 'GET') headers['Content-Type'] = 'application/json'
  return headers
}

export function wakeUpBackend(): void {
  // Llama DIRECTAMENTE a Render (no por el proxy de Pages) con UA de navegador,
  // así Cloudflare no aplica el Bot Management challenge que bloquea el proxy.
  fetch(`${BACKEND_ORIGIN}/health`, { mode: 'no-cors' })
    .catch(() => { /* fire-and-forget */ })
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = getAuthHeaders(method)
  const url = `${API_URL}${path}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 20_000) // 20s max por petición

  let res: Response
  try {
    res = await fetch(url, { ...init, headers: { ...headers, ...init.headers }, signal: controller.signal })
  } catch (err) {
    throw new Error(`Fetch failed (${url}): ${err}`)
  } finally {
    clearTimeout(timeoutId)
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}
