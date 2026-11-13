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

export default function AdminIA() {
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [weeks, setWeeks] = useState(4)

  async function generate() {
    setLoading(true)
    setError(null)
    setSummary(null)
    try {
      const res = await apiFetch<{ summary: string }>(`/admin/ai-summary?weeks=${weeks}`)
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
          Gemini analiza tus sesiones y mediciones corporales y genera un informe con recomendaciones.
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
            {error.includes('GEMINI_API_KEY') || error.includes('API') ? (
              <p className="text-red-500 text-xs mt-1">
                Asegúrate de haber añadido <code>GEMINI_API_KEY</code> en las variables de entorno de Render.
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
    </div>
  )
}
