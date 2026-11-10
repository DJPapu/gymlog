// ── Tipos ───────────────────────────────────────────────────────────────────

export interface SetData {
  reps: number | null
  weight_kg: number | null
  rpe: number | null
  completed: boolean
  is_warmup: boolean
}

export interface SessionHistory {
  sets: SetData[]
  started_at: string
}

export interface ProgressionInput {
  rep_min: number
  rep_max: number
  target_rpe: number | null
  target_weight_kg: number | null
  weight_increment_kg: number
}

export interface ProgressionResult {
  weight_kg: number
  reps: number
  direction: 'up' | 'same' | 'down' | 'first'
  reason: string
}

// ── Función pura (misma lógica que progression.py) ──────────────────────────

export function suggestProgression(
  input: ProgressionInput,
  history: SessionHistory[], // ordenado desc: history[0] = sesión más reciente
): ProgressionResult {
  const { rep_min, rep_max, target_rpe, target_weight_kg, weight_increment_kg } = input
  const fallbackWeight = target_weight_kg ?? weight_increment_kg

  if (history.length === 0) {
    return {
      weight_kg: fallbackWeight,
      reps: rep_min,
      direction: 'first',
      reason: 'Primera vez con este ejercicio.',
    }
  }

  const effectiveSets = history[0].sets.filter(
    (s) => !s.is_warmup && s.completed && s.weight_kg != null,
  )

  if (effectiveSets.length === 0) {
    return {
      weight_kg: fallbackWeight,
      reps: rep_min,
      direction: 'first',
      reason: 'Sin series completadas la última vez.',
    }
  }

  const lastWeight = Math.max(...effectiveSets.map((s) => s.weight_kg!))
  const repsArr = effectiveSets.map((s) => s.reps ?? 0)
  const rpeArr = effectiveSets.map((s) => s.rpe).filter((r) => r != null) as number[]
  const avgRpe = rpeArr.length > 0 ? rpeArr.reduce((a, b) => a + b, 0) / rpeArr.length : null

  const prefix = `${_fmtDate(history[0].started_at)}: ${_fmtSummary(effectiveSets.length, repsArr, lastWeight)}${_fmtRpe(avgRpe)}`

  const allAtMax = effectiveSets.every((s) => (s.reps ?? 0) >= rep_max)
  const anyBelowMin = effectiveSets.some((s) => (s.reps ?? 0) < rep_min)
  const rpeTooHigh = target_rpe != null && avgRpe != null && avgRpe > target_rpe + 1
  const rpeOk = target_rpe == null || avgRpe == null || avgRpe <= target_rpe

  // Subir peso: todas las series llegaron al máximo Y RPE aceptable
  if (allAtMax && rpeOk) {
    const newWeight = _round(lastWeight + weight_increment_kg, weight_increment_kg)
    return {
      weight_kg: newWeight,
      reps: rep_min,
      direction: 'up',
      reason: `${prefix} → Completaste el máximo. ↑ Subís a ${newWeight} kg.`,
    }
  }

  // Por debajo del mínimo o RPE excesivo
  if (anyBelowMin || rpeTooHigh) {
    const twoInARow =
      history.length >= 2 &&
      (() => {
        const prev = history[1].sets.filter((s) => !s.is_warmup && s.completed)
        const prevBelowMin = prev.some((s) => (s.reps ?? 0) < rep_min)
        const prevRpe = prev.map((s) => s.rpe).filter((r) => r != null) as number[]
        const prevAvg = prevRpe.length > 0 ? prevRpe.reduce((a, b) => a + b, 0) / prevRpe.length : null
        return prevBelowMin || (target_rpe != null && prevAvg != null && prevAvg > target_rpe + 1)
      })()

    if (twoInARow) {
      const newWeight = _round(lastWeight * 0.9, weight_increment_kg)
      return {
        weight_kg: newWeight,
        reps: rep_min,
        direction: 'down',
        reason: `${prefix} → 2 sesiones sin completar el objetivo. ↓ Bajás a ${newWeight} kg.`,
      }
    }

    return {
      weight_kg: lastWeight,
      reps: rep_min,
      direction: 'same',
      reason: `${prefix} → No se completó el objetivo. Mismo peso.`,
    }
  }

  // En rango pero sin llegar al máximo → mismo peso, +1 rep
  const nextReps = Math.min(Math.max(...repsArr) + 1, rep_max)
  return {
    weight_kg: lastWeight,
    reps: nextReps,
    direction: 'same',
    reason: `${prefix} → Mismo peso, intenta ${nextReps} reps.`,
  }
}

// ── Helpers privados ─────────────────────────────────────────────────────────

function _round(value: number, increment: number): number {
  return Math.round(value / increment) * increment
}

function _fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function _fmtSummary(sets: number, repsArr: number[], weight: number): string {
  const unique = [...new Set(repsArr)]
  const repsStr = unique.length === 1 ? `${unique[0]}` : repsArr.join('/')
  return `${sets}×${repsStr} @ ${weight} kg`
}

function _fmtRpe(avg: number | null): string {
  if (avg == null) return ''
  return ` · RPE ${avg % 1 === 0 ? avg : avg.toFixed(1)}`
}
