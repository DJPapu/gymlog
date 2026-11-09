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

  // Reenviar la IP real del usuario para que el bot management de Render
  // reconozca tráfico legítimo en lugar de la IP del datacenter de Pages.
  const clientIp = request.headers.get('CF-Connecting-IP')
  if (clientIp) headers.set('X-Forwarded-For', clientIp)

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'

  // Buffereamos el body una sola vez para poder reintentarlo si llega 429.
  let bodyBuffer = null
  if (hasBody) {
    bodyBuffer = await request.arrayBuffer()
  }

  const makeInit = () => ({
    method: request.method,
    headers,
    ...(hasBody ? { body: bodyBuffer } : {}),
  })

  let response = await fetch(backendUrl, makeInit())

  // Cloudflare Bot Management en Render devuelve 429 cuando el backend está dormido.
  // Esperamos 10s (el backend arranca en ~30-60s) y reintentamos una vez.
  if (response.status === 429) {
    await new Promise((r) => setTimeout(r, 10_000))
    response = await fetch(backendUrl, makeInit())
  }

  return response
}
