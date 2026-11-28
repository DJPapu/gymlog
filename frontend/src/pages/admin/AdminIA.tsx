import { useState } from 'react'
import { apiFetch } from '../../lib/api'

type Section = { title: string; lines: string[] }

function parseMarkdown(text: string): Section[] {
  const sections: Section[] = []
  let current: Section | null = null

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('## ')) {
      if (current) sections.push(current)
      current = { title: line.slice(3), lines: [] }
    } else if (current && line) {
      current.lines.push(line)
    }
  }
  if (current) sections.push(current)
  return sections
}

function renderLine(line: string, i: number) {
  const isBullet = line.startsWith('- ') || line.startsWith('• ')
  const content = isBullet ? line.slice(2) : line

  // Inline bold: **text**
  const parts = content.split(/\*\*(.*?)\*\*/g)
  const rich = parts.map((p, j) =>
    j % 2 === 1 ? <strong key={j} className="font-semibold text-gray-900">{p}</strong> : p
  )

  if (isBullet) {
    return (
      <div key={i} className="flex gap-2 text-sm text-gray-700">
        <span className="text-indigo-400 shrink-0 mt-0.5">•</span>
        <span>{rich}</span>
      </div>
    )
  }
  return <p key={i} className="text-sm text-gray-700 leading-relaxed">{rich}</p>
}

type AdjustResult = { updated: { exercise: string; old_kg: number | null; new_kg: number }[]; skipped: { exercise: string; reason: string }[] }

export default function AdminIA() {
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [weeks, setWeeks] = useState(4)
  const [adjusting, setAdjusting] = useState(false)
  const [adjustResult, setAdjustResult] = useState<AdjustResult | null>(null)
  const [adjustError, setAdjustError] = useState<string | null>(null)

  async function adjustWeights() {
    setAdjusting(true)
    setAdjustError(null)
    setAdjustResult(null)
    try {
      const res = await apiFetch<AdjustResult>('/admin/adjust-target-weights', { method: 'POST' })
      setAdjustResult(res)
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : 'Error')
    } finally {
      setAdjusting(false)
    }
  }

  async function generate() {
    setLoading(true)
    setError(null)
    setSummary(null)
    try {
      const res = await apiFetch<{ summary: string }>(`/admin/ai-summary?weeks=${weeks}`, {}, 180_000)
      setSummary(res.summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al generar el resumen')
    } finally {
      setLoading(false)
    }
  }

  const sections = summary ? parseMarkdown(summary) : []

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Resumen IA</h2>
        <p className="text-sm text-gray-500 mt-1">
          Gemini analiza tus sesiones, nutrición y mediciones corporales, y genera un informe integral con recomendaciones.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Período a analizar</label>
            <select
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value))}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value={1}>Última semana</option>
              <option value={2}>Últimas 2 semanas</option>
              <option value={4}>Último mes</option>
              <option value={8}>Últimos 2 meses</option>
            </select>
          </div>
          <button
            onClick={generate}
            disabled={loading}
            className="ml-auto bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
          >
            {loading ? 'Analizando...' : '✨ Generar informe'}
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-3 py-6 justify-center text-gray-400">
            <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
            <span className="text-sm">Analizando tu progreso con Gemini...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-700 text-sm">{error}</p>
            {error.startsWith('API 503') || error.includes('GEMINI_API_KEY') ? (
              <p className="text-red-500 text-xs mt-1">
                Asegúrate de haber añadido <code>GEMINI_API_KEY</code> en las variables de entorno de Render.
              </p>
            ) : error.includes('RESOURCE_EXHAUSTED') || error.includes('429') ? (
              <p className="text-red-500 text-xs mt-1">
                Límite diario de la API de Gemini alcanzado. Se reinicia a medianoche (hora del servidor). Considera activar facturación en Google AI Studio para aumentar el límite.
              </p>
            ) : error.startsWith('API 502') ? (
              <p className="text-red-500 text-xs mt-1">
                Gemini no está disponible en este momento. Inténtalo de nuevo en unos segundos.
              </p>
            ) : null}
          </div>
        )}
      </div>

      {sections.length > 0 && (
        <div className="space-y-4">
          {sections.map((section, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-2">
              <h3 className="font-bold text-gray-900 text-base border-b border-gray-100 pb-2">
                {section.title}
              </h3>
              <div className="space-y-1.5 pt-1">
                {section.lines.map((line, j) => renderLine(line, j))}
              </div>
            </div>
          ))}
          <p className="text-xs text-gray-400 text-center pb-2">
            Generado con Gemini · {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      )}

      {/* Herramientas de mantenimiento */}
      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Herramientas</h3>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Ajustar pesos objetivo</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Actualiza el peso objetivo de cada ejercicio en la rutina al máximo real ejecutado en la última sesión.
              </p>
            </div>
            <button
              onClick={adjustWeights}
              disabled={adjusting}
              className="shrink-0 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
            >
              {adjusting ? 'Ajustando...' : 'Ajustar'}
            </button>
          </div>

          {adjustError && (
            <p className="mt-3 text-red-600 text-xs">{adjustError}</p>
          )}

          {adjustResult && (
            <div className="mt-4 space-y-3">
              {adjustResult.updated.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">✏️ Actualizados ({adjustResult.updated.length})</p>
                  <table className="w-full text-xs text-gray-700">
                    <tbody>
                      {adjustResult.updated.map((r, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="py-1.5 pr-4">{r.exercise}</td>
                          <td className="py-1.5 pr-2 text-gray-400 text-right">{r.old_kg != null ? `${r.old_kg} kg` : '—'}</td>
                          <td className="py-1.5 text-right text-emerald-600 font-semibold">→ {r.new_kg} kg</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-gray-500">Todos los objetivos ya coincidían con el historial.</p>
              )}
              {adjustResult.skipped.length > 0 && (
                <p className="text-xs text-gray-400">
                  ⚠️ {adjustResult.skipped.length} sin historial: {adjustResult.skipped.map(s => s.exercise).join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
