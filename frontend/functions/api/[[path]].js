// Cloudflare Pages Function: proxy transparente a Render.
// El frontend llama a /api/* (mismo dominio → sin CORS).
// Esta función reenvía el request al backend en Render, que sí puede
// hacer fetch cross-origin sin restricciones iOS/WKWebView.

const BACKEND = 'https://gymlog-5y6y.onrender.com'

export async function onRequest(context) {
  const { request } = context
  const url = new URL(request.url)

  // /api/sync/push → /sync/push
  const backendPath = url.pathname.replace(/^\/api/, '') || '/'
  const backendUrl = `${BACKEND}${backendPath}${url.search}`

  const headers = new Headers(request.headers)
  // Cloudflare añade host del origen — quitarlo para que Render vea el suyo propio
  headers.delete('host')

  // Reenviar la IP real del usuario: ayuda al bot management de Render a distinguir
  // tráfico legítimo de scrapers.
  const clientIp = request.headers.get('CF-Connecting-IP')
  if (clientIp) headers.set('X-Forwarded-For', clientIp)

  const init = {
    method: request.method,
    headers,
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body
  }

  return fetch(backendUrl, init)
}
