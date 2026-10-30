import Dexie, { type EntityTable } from 'dexie'

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface Exercise {
  id: string
  name: string
  machine_name: string | null
  equipment: string
  primary_muscle: string
  secondary_muscles: string[]
  movement_pattern: string
  unilateral: boolean
  weight_increment_kg: number
  default_rep_range: string
  setup_tips: string | null
  photo_ref: string | null
  created_by: string | null
  updated_at: string
  deleted_at: string | null
}

export interface Routine {
  id: string
  user_id: string
  name: string
  is_active: boolean
  start_date: string | null
  duration_weeks: number | null
  updated_at: string
  deleted_at: string | null
}

export interface RoutineDay {
  id: string
  routine_id: string
  name: string
  position: number
  updated_at: string
  deleted_at: string | null
}

export interface RoutineDayExercise {
  id: string
  routine_day_id: string
  exercise_id: string
  position: number
  target_sets: number
  rep_min: number
  rep_max: number
  target_weight_kg: number | null
  target_rpe: number | null
  notes: string | null
  updated_at: string
  deleted_at: string | null
}

export interface Session {
  id: string
  user_id: string
  routine_day_id: string | null
  started_at: string
  ended_at: string | null
  notes: string | null
  updated_at: string
  deleted_at: string | null
}

export interface SessionExercise {
  id: string
  session_id: string
  exercise_id: string
  position: number
  notes: string | null
  updated_at: string
  deleted_at: string | null
}

export interface SetRecord {
  id: string
  session_exercise_id: string
  set_index: number
  is_warmup: boolean
  planned_reps: number | null
  planned_weight_kg: number | null
  reps: number | null
  weight_kg: number | null
  rpe: number | null
  completed: boolean
  notes: string | null
  updated_at: string
  deleted_at: string | null
}

export interface OutboxEntry {
  id?: number
  table: string
  record_id: string
  op: 'upsert' | 'delete'
  payload: object
  ts: string
}

// ── Base de datos ──────────────────────────────────────────────────────────

export class GymLogDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>
  routines!: EntityTable<Routine, 'id'>
  routine_days!: EntityTable<RoutineDay, 'id'>
  routine_day_exercises!: EntityTable<RoutineDayExercise, 'id'>
  sessions!: EntityTable<Session, 'id'>
  session_exercises!: EntityTable<SessionExercise, 'id'>
  sets!: EntityTable<SetRecord, 'id'>
  outbox!: EntityTable<OutboxEntry, 'id'>

  constructor() {
    super('gymlog')
    this.version(2).stores({
      exercises: 'id, name, equipment, primary_muscle, updated_at',
      routines: 'id, user_id, is_active, updated_at',
      routine_days: 'id, routine_id, position, updated_at',
      routine_day_exercises: 'id, routine_day_id, exercise_id, position, updated_at',
      sessions: 'id, user_id, routine_day_id, started_at, updated_at',
      session_exercises: 'id, session_id, exercise_id, updated_at',
      sets: 'id, session_exercise_id, set_index, updated_at',
      outbox: '++id, table, record_id, ts',
    })
  }
}

export const db = new GymLogDB()
