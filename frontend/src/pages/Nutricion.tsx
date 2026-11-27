import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { db, type FoodLog } from '../db/schema'
import { computeTargets } from '../lib/tdee'

import {
  GoogleGenerativeAI,
  type Part,
} from '@google/generative-ai'

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined
// Orden: primero los modelos que sí respetan responseMimeType:application/json
const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.7-flash',
]

async function fileToInlinePart(file: File): Promise<Part> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve({
        inlineData: {
          data: result.split(',')[1],
          mimeType: file.type || 'image/jpeg',
        },
      })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

interface GeminiEstimate {
  description: string | null
  calories: number
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
}

async function estimateWithGemini(
  description: string,
  weightG?: number | null,
  photos?: File[],
): Promise<GeminiEstimate> {
  if (!GEMINI_KEY) throw new Error('VITE_GEMINI_API_KEY no configurada')

  const genai = new GoogleGenerativeAI(GEMINI_KEY)
  const hasPhotos = photos && photos.length > 0
  const weightLine = weightG ? `\nCantidad indicada: ${weightG}g` : ''

  let prompt: string
  if (hasPhotos) {
    const descHint = description.trim()
      ? `El usuario describe: "${description}"${weightLine}.`
      : weightLine ? `Cantidad indicada: ${weightG}g.` : ''
    prompt =
      `Analiza las imágenes de esta comida o etiqueta nutricional. ${descHint}\n` +
      'Si hay una etiqueta nutricional visible, usa esos valores exactos (ajustando al peso indicado si aplica).\n' +
      'Si es una foto de comida, estima según las porciones visibles.\n\n' +
      'Responde completando este JSON con los valores reales (sin texto adicional, sin markdown):\n' +
      '{"description": "...", "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0}'
  } else {
    prompt =
      `Estima los macronutrientes de: "${description}"${weightLine}\n\n` +
      'Responde completando este JSON con los valores reales (sin texto adicional, sin markdown):\n' +
      '{"calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0}'
  }

  const imageParts: Part[] = hasPhotos
    ? await Promise.all(photos!.map(fileToInlinePart))
    : []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toResult = (p: any): GeminiEstimate => ({
    description: p.description ?? null,
    calories: Math.round(p.calories),
    protein_g: p.protein_g != null ? Math.round(p.protein_g * 10) / 10 : null,
    carbs_g:   p.carbs_g   != null ? Math.round(p.carbs_g   * 10) / 10 : null,
    fat_g:     p.fat_g     != null ? Math.round(p.fat_g     * 10) / 10 : null,
  })

  let lastErr: Error | null = null
  let lastRaw: string | null = null

  for (const modelName of GEMINI_MODELS) {
    try {
      const model = genai.getGenerativeModel({
        model: modelName,
        systemInstruction: 'Eres un nutricionista experto. Responde SOLO con JSON puro, sin markdown, sin texto adicional.',
        generationConfig: { maxOutputTokens: 512, responseMimeType: 'application/json' },
      })
      const result = await model.generateContent([...imageParts, { text: prompt }])
      const raw = result.response.text().trim()
      lastRaw = raw

      const s = raw.indexOf('{')
      const e = raw.lastIndexOf('}')
      if (s !== -1 && e > s) {
        return toResult(JSON.parse(raw.slice(s, e + 1)))
      }
      // Modelo respondió pero sin JSON → guardar texto y probar el siguiente
      lastErr = new Error(`Sin JSON (${modelName})`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      lastErr = new Error(`${modelName}: ${msg}`)
      if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED')) throw lastErr
      // Cualquier otro error (503, 404, red): probar siguiente modelo
    }
  }

  // Ningún modelo devolvió JSON — parsear la última respuesta como texto libre
  if (lastRaw) {
    const toF = (s: string) => parseFloat(s.replace(',', '.').trim())
    const txt = lastRaw.replace(/[*_]/g, '')

    // Busca la ÚLTIMA ocurrencia del label (más probable que sea el total)
    // y extrae: "= N" si existe, si no suma "X + Y + Z"
    const findLast = (re: RegExp): number | null => {
      const g = new RegExp(re.source, re.flags + 'g')
      let last: RegExpExecArray | null = null, m: RegExpExecArray | null
      while ((m = g.exec(txt)) !== null) last = m
      if (!last) return null
      const after = txt.slice(last.index + last[0].length)
      const tot = after.match(/^[^.\n]*?=\s*~?\s*([\d.,]+)/)
      if (tot) return toF(tot[1])
      const expr = after.match(/^[^.\n]*([\d.,]+(?:\s*\+\s*[\d.,]+)*)/)
      if (!expr) return null
      return expr[1].split('+').reduce((acc, n) => { const v = toF(n); return acc + (isNaN(v) ? 0 : v) }, 0)
    }

    const CAL  = /(?:Total\s+)?Calor[íi]?(?:ias?|es?)\s*(?:\([^)]*\))?\s*:/i
    const PROT = /(?:Total\s+)?Prote[íi]n[ao]?s?\s*:/i
    const CARB = /(?:Total\s+)?(?:Carb(?:oh?[iy]d[ar]a?t(?:es?|os?)?|os?|s?)|Hidra?tos?)\s*(?:de Carbono)?\s*:/i
    const FAT  = /(?:Total\s+)?(?:Gras[ao]s?|L[ií]pid[oa]s?|Fat)\s*:/i

    const calories = findLast(CAL)
    if (calories) {
      return {
        description: null,
        calories: Math.round(calories),
        protein_g: findLast(PROT),
        carbs_g:   findLast(CARB),
        fat_g:     findLast(FAT),
      }
    }
  }

  throw lastErr ?? new Error('Gemini no disponible')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type Meal = FoodLog['meal']

const MEALS: { key: Meal; label: string }[] = [
  { key: 'desayuno', label: 'Desayuno' },
  { key: 'almuerzo', label: 'Almuerzo' },
  { key: 'cena', label: 'Cena' },
  { key: 'snack', label: 'Snack' },
]

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(iso: string, n: number) {
  const d = new Date(iso)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function formatDate(iso: string) {
  const today = todayISO()
  if (iso === today) return 'Hoy'
  if (iso === addDays(today, -1)) return 'Ayer'
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

// ── Macro progress bar ────────────────────────────────────────────────────────

function MacroBar({
  label, value, target, unit, color,
}: {
  label: string; value: number; target: number; unit: string; color: string
}) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0
  const over = target > 0 && value > target
  return (
    <div className="flex-1 min-w-0">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{label}</span>
        <span className={over ? 'text-red-500 font-semibold' : ''}>
          {Math.round(value)}<span className="text-gray-400">/{target}{unit}</span>
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${over ? 'bg-red-400' : color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Photo slot ────────────────────────────────────────────────────────────────

function PhotoSlot({
  label, file, onCapture, onRemove,
}: {
  label: string; file: File | null; onCapture: (f: File) => void; onRemove: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const previewUrl = file ? URL.createObjectURL(file) : null

  return (
    <div className="flex-1">
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onCapture(f)
          e.target.value = ''
        }}
      />
      {file && previewUrl ? (
        <div className="relative">
          <img
            src={previewUrl}
            alt={label}
            className="w-full h-20 object-cover rounded-xl border border-gray-200"
          />
          <button
            onClick={onRemove}
            className="absolute top-1 right-1 w-5 h-5 bg-black/50 text-white rounded-full text-xs flex items-center justify-center"
          >
            ✕
          </button>
          <p className="text-center text-xs text-gray-400 mt-0.5">{label}</p>
        </div>
      ) : (
        <button
          onClick={() => ref.current?.click()}
          className="w-full h-20 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors"
        >
          <span className="text-2xl leading-none">📷</span>
          <span className="text-xs">{label}</span>
        </button>
      )}
    </div>
  )
}

// ── Add food form ──────────────────────────────────────────────────────────────

function AddFoodForm({
  date, defaultMeal, onDone,
}: {
  date: string; defaultMeal: Meal; onDone: () => void
}) {
  const [meal, setMeal] = useState<Meal>(defaultMeal)
  const [loggedAt, setLoggedAt] = useState(date)
  const [desc, setDesc] = useState('')
  const [weightG, setWeightG] = useState('')
  const [cals, setCals] = useState('')
  const [proteinG, setProteinG] = useState('')
  const [carbsG, setCarbsG] = useState('')
  const [fatG, setFatG] = useState('')
  const [estimating, setEstimating] = useState(false)
  const [estimateErr, setEstimateErr] = useState<string | null>(null)
  const [photo1, setPhoto1] = useState<File | null>(null)
  const [photo2, setPhoto2] = useState<File | null>(null)
  const [usedAI, setUsedAI] = useState(false)

  const hasPhotos = photo1 !== null || photo2 !== null
  const canEstimate = hasPhotos || desc.trim().length > 0

  async function estimate() {
    if (!canEstimate) return
    setEstimating(true)
    setEstimateErr(null)
    try {
      const photos = [photo1, photo2].filter(Boolean) as File[]
      const res = await estimateWithGemini(
        desc.trim(),
        weightG ? parseFloat(weightG) : null,
        photos,
      )
      if (res.description && !desc.trim()) setDesc(res.description)
      setCals(String(res.calories))
      if (res.protein_g != null) setProteinG(String(res.protein_g))
      if (res.carbs_g != null) setCarbsG(String(res.carbs_g))
      if (res.fat_g != null) setFatG(String(res.fat_g))
      setUsedAI(true)
    } catch (e) {
      setEstimateErr(e instanceof Error ? e.message : 'Error al estimar')
    } finally {
      setEstimating(false)
    }
  }

  async function save() {
    const calories = parseFloat(cals)
    if (!desc.trim() || isNaN(calories)) return
    const now = new Date().toISOString()
    const entry: FoodLog = {
      id: crypto.randomUUID(),
      user_id: '',
      logged_at: loggedAt || date,
      meal,
      description: desc.trim(),
      weight_g: weightG ? parseFloat(weightG) : null,
      calories_kcal: calories,
      protein_g: proteinG ? parseFloat(proteinG) : null,
      carbs_g: carbsG ? parseFloat(carbsG) : null,
      fat_g: fatG ? parseFloat(fatG) : null,
      source: usedAI ? 'gemini' : 'manual',
      notes: null,
      updated_at: now,
      deleted_at: null,
    }
    await db.food_logs.put(entry)
    await db.outbox.add({ table: 'food_logs', record_id: entry.id, op: 'upsert', payload: entry, ts: now })
    onDone()
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
      {/* Meal tabs */}
      <div className="flex gap-1">
        {MEALS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMeal(m.key)}
            className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors ${
              meal === m.key
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Date — solo visible si difiere del día actual */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-400 shrink-0">Fecha</label>
        <input
          type="date"
          value={loggedAt}
          max={todayISO()}
          onChange={(e) => setLoggedAt(e.target.value || date)}
          className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-indigo-400"
        />
        {loggedAt !== todayISO() && (
          <button
            onClick={() => setLoggedAt(todayISO())}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Hoy
          </button>
        )}
      </div>

      {/* Photo slots */}
      <div className="flex gap-2">
        <PhotoSlot
          label="Comida"
          file={photo1}
          onCapture={setPhoto1}
          onRemove={() => setPhoto1(null)}
        />
        <PhotoSlot
          label="Etiqueta"
          file={photo2}
          onCapture={setPhoto2}
          onRemove={() => setPhoto2(null)}
        />
      </div>

      {/* Description + weight */}
      <div className="flex gap-2">
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder={hasPhotos ? 'Descripción opcional…' : 'Descripción (p.ej. 2 huevos revueltos)'}
          className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-400"
        />
        <input
          value={weightG}
          onChange={(e) => setWeightG(e.target.value)}
          placeholder="g"
          inputMode="decimal"
          className="w-16 bg-gray-50 border border-gray-200 rounded-xl px-2 py-2 text-sm text-gray-800 text-center focus:outline-none focus:border-indigo-400"
        />
      </div>

      {/* Gemini estimate button */}
      <button
        onClick={estimate}
        disabled={estimating || !canEstimate}
        className="w-full text-sm py-2 rounded-xl bg-violet-50 text-violet-700 font-medium disabled:opacity-40 hover:bg-violet-100 transition-colors"
      >
        {estimating
          ? 'Estimando…'
          : hasPhotos
            ? '✨ Analizar foto con IA'
            : '✨ Estimar con IA'}
      </button>
      {estimateErr && <p className="text-xs text-red-500">{estimateErr}</p>}

      {/* Macros */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'kcal', val: cals, set: setCals, color: 'text-orange-600' },
          { label: 'prot g', val: proteinG, set: setProteinG, color: 'text-blue-600' },
          { label: 'carbs g', val: carbsG, set: setCarbsG, color: 'text-amber-600' },
          { label: 'grasa g', val: fatG, set: setFatG, color: 'text-pink-600' },
        ].map(({ label, val, set, color }) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <label className={`text-xs font-medium ${color}`}>{label}</label>
            <input
              value={val}
              onChange={(e) => set(e.target.value)}
              inputMode="decimal"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-1 py-1.5 text-sm text-gray-800 text-center focus:outline-none focus:border-indigo-400"
            />
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onDone}
          className="flex-1 py-2 text-sm text-gray-500 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={save}
          disabled={!desc.trim() || !cals}
          className="flex-1 py-2 text-sm text-white bg-indigo-600 rounded-xl font-medium disabled:opacity-40 hover:bg-indigo-500 transition-colors"
        >
          Guardar
        </button>
      </div>
    </div>
  )
}

// ── Food log item ──────────────────────────────────────────────────────────────

function FoodItem({ log }: { log: FoodLog }) {
  async function remove() {
    const now = new Date().toISOString()
    await db.food_logs.update(log.id, { deleted_at: now, updated_at: now })
    await db.outbox.add({
      table: 'food_logs', record_id: log.id, op: 'upsert',
      payload: { ...log, deleted_at: now, updated_at: now }, ts: now,
    })
  }

  return (
    <div className="flex items-center justify-between py-2 group">
      <div className="flex-1 min-w-0 mr-2">
        <p className="text-sm text-gray-800 truncate">{log.description}</p>
        <p className="text-xs text-gray-400">
          {Math.round(log.calories_kcal)} kcal
          {log.protein_g != null && ` · ${log.protein_g}g prot`}
          {log.weight_g != null && ` · ${log.weight_g}g`}
          {log.source === 'gemini' && ' · ✨'}
        </p>
      </div>
      <button
        onClick={remove}
        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs px-2 py-1 transition-opacity"
      >
        ✕
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Nutricion() {
  const [date, setDate] = useState(todayISO())
  const [addingMeal, setAddingMeal] = useState<Meal | null>(null)

  const profile = useLiveQuery(() => db.profiles.toCollection().first(), [])
  const latestMetric = useLiveQuery(
    () => db.body_metrics.orderBy('measured_at').filter((m) => !m.deleted_at && m.weight_kg != null).last(),
    []
  )
  const logs = useLiveQuery(
    () => db.food_logs.where('logged_at').equals(date).filter((l) => !l.deleted_at).toArray(),
    [date]
  )

  const targets = profile && latestMetric != null
    ? computeTargets(profile, latestMetric)
    : null

  const totals = (logs ?? []).reduce(
    (acc, l) => ({
      calories: acc.calories + l.calories_kcal,
      protein_g: acc.protein_g + (l.protein_g ?? 0),
      carbs_g: acc.carbs_g + (l.carbs_g ?? 0),
      fat_g: acc.fat_g + (l.fat_g ?? 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )

  const canGoForward = date < todayISO()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setDate(addDays(date, -1))}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
          >
            ‹
          </button>
          <span className="text-base font-semibold text-gray-800">{formatDate(date)}</span>
          <button
            onClick={() => canGoForward && setDate(addDays(date, 1))}
            disabled={!canGoForward}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 disabled:opacity-30"
          >
            ›
          </button>
        </div>

        {/* Summary card */}
        {targets ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-2xl font-bold text-gray-900">{Math.round(totals.calories)}</span>
              <span className="text-sm text-gray-400">/ {targets.calories} kcal</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
              <div
                className={`h-full rounded-full transition-all ${
                  totals.calories > targets.calories ? 'bg-red-400' : 'bg-orange-400'
                }`}
                style={{ width: `${Math.min((totals.calories / targets.calories) * 100, 100)}%` }}
              />
            </div>
            <div className="flex gap-3">
              <MacroBar label="Proteína" value={totals.protein_g} target={targets.protein_g} unit="g" color="bg-blue-400" />
              <MacroBar label="Carbos" value={totals.carbs_g} target={targets.carbs_g} unit="g" color="bg-amber-400" />
              <MacroBar label="Grasa" value={totals.fat_g} target={targets.fat_g} unit="g" color="bg-pink-400" />
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-2xl p-3 text-center text-sm text-gray-400">
            {!profile?.height_cm || !profile?.birth_date || !profile?.sex || !profile?.goal
              ? 'Completa tu perfil (peso, altura, fecha de nacimiento, sexo y objetivo) para ver los objetivos nutricionales.'
              : !latestMetric?.weight_kg
                ? 'Registra tu peso en Perfil para ver los objetivos nutricionales.'
                : 'Calculando objetivos…'}
          </div>
        )}
      </div>

      {/* Meal sections */}
      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">
        {addingMeal === null && (
          <button
            onClick={() => setAddingMeal('desayuno')}
            className="w-full mt-2 py-3 rounded-2xl border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors"
          >
            + Añadir alimento
          </button>
        )}

        {addingMeal !== null && (
          <AddFoodForm
            date={date}
            defaultMeal={addingMeal}
            onDone={() => setAddingMeal(null)}
          />
        )}

        {MEALS.map(({ key, label }) => {
          const items = (logs ?? []).filter((l) => l.meal === key)
          if (items.length === 0) return null
          const mealCals = items.reduce((s, l) => s + l.calories_kcal, 0)
          return (
            <div key={key} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-2 border-b border-gray-50 cursor-pointer"
                onClick={() => setAddingMeal(key)}
              >
                <span className="text-sm font-semibold text-gray-700">{label}</span>
                <span className="text-xs text-gray-400">{Math.round(mealCals)} kcal · + añadir</span>
              </div>
              <div className="px-4 divide-y divide-gray-50">
                {items.map((log) => <FoodItem key={log.id} log={log} />)}
              </div>
            </div>
          )
        })}

        {(logs ?? []).length === 0 && addingMeal === null && (
          <p className="text-center text-sm text-gray-400 py-8">
            Sin registros para {formatDate(date).toLowerCase()}.<br />
            Pulsa «+ Añadir alimento» para empezar.
          </p>
        )}
      </div>
    </div>
  )
}
