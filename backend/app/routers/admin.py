import time
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.auth import CurrentUser
from app.config import settings
from app.db import get_db
from app.models import (
    BodyMetric,
    Exercise,
    Profile,
    Routine,
    RoutineDay,
    RoutineDayExercise,
    Session as WorkoutSession,
    SessionExercise,
    Set as WorkoutSet,
)

router = APIRouter(prefix="/admin", tags=["admin"])

DB = Annotated[Session, Depends(get_db)]


def _fetch_sessions(db: Session, user_id: str, since: datetime, until: datetime | None = None) -> list[dict[str, Any]]:
    """Fetch and format session data for a time range."""
    ex_cache: dict[str, Exercise] = {}

    q = (
        select(WorkoutSession)
        .where(
            WorkoutSession.user_id == user_id,
            WorkoutSession.started_at >= since,
            WorkoutSession.deleted_at.is_(None),
        )
        .order_by(WorkoutSession.started_at)
    )
    if until:
        q = q.where(WorkoutSession.started_at < until)
    sessions = list(db.execute(q).scalars())

    day_ids = [s.routine_day_id for s in sessions if s.routine_day_id]
    day_map: dict[str, str] = {}
    if day_ids:
        day_map = {
            d.id: d.name
            for d in db.execute(select(RoutineDay).where(RoutineDay.id.in_(day_ids))).scalars()
        }

    result: list[dict[str, Any]] = []
    for session in sessions:
        se_list = list(
            db.execute(
                select(SessionExercise)
                .where(
                    SessionExercise.session_id == session.id,
                    SessionExercise.deleted_at.is_(None),
                )
                .order_by(SessionExercise.position)
            ).scalars()
        )

        exercises_data: list[dict[str, Any]] = []
        for se in se_list:
            if se.exercise_id not in ex_cache:
                ex = db.execute(select(Exercise).where(Exercise.id == se.exercise_id)).scalar_one_or_none()
                if ex:
                    ex_cache[se.exercise_id] = ex
            ex = ex_cache.get(se.exercise_id)
            if not ex:
                continue

            sets = list(
                db.execute(
                    select(WorkoutSet)
                    .where(
                        WorkoutSet.session_exercise_id == se.id,
                        WorkoutSet.deleted_at.is_(None),
                        WorkoutSet.is_warmup.is_(False),
                    )
                    .order_by(WorkoutSet.set_index)
                ).scalars()
            )

            def _fmt_set(s: WorkoutSet) -> str | None:
                if s.duration_min is not None:
                    return f"{s.duration_min}min"
                if s.reps is not None and s.weight_kg is not None:
                    rpe_str = f" RPE{float(s.rpe)}" if s.rpe else ""
                    return f"{s.reps}×{s.weight_kg}kg{rpe_str}"
                if s.reps is not None:
                    return f"{s.reps} reps"
                return None

            sets_str = ", ".join(f for s in sets if (f := _fmt_set(s)) is not None)
            if not sets_str:
                continue

            # planned_weight from first non-warmup set (copied from routine at session start)
            planned = next((s.planned_weight_kg for s in sets if s.planned_weight_kg is not None), None)

            # --- Aggregates for chart context ---
            volume = sum(
                (s.weight_kg or 0) * (s.reps or 0) for s in sets if s.weight_kg and s.reps
            )
            rpe_vals = [float(s.rpe) for s in sets if s.rpe is not None]
            best_e1rm = max(
                (s.weight_kg * (1 + s.reps / 30) for s in sets if s.weight_kg and s.reps and s.reps <= 20),
                default=0.0,
            )
            sets_completed = sum(1 for s in sets if s.completed)
            sets_total = len(sets)

            exercises_data.append({
                "name": ex.name,
                "muscle": ex.primary_muscle,
                "sets": sets_str,
                "planned_weight_kg": planned,
                "notes": se.notes,
                # chart aggregates
                "volume_kg": round(volume, 1) if volume else None,
                "best_e1rm": round(best_e1rm, 1) if best_e1rm else None,
                "avg_rpe": round(sum(rpe_vals) / len(rpe_vals), 1) if rpe_vals else None,
                "sets_completed": sets_completed,
                "sets_total": sets_total,
            })

        if not exercises_data:
            continue

        duration_min = None
        if session.ended_at and session.started_at:
            duration_min = round((session.ended_at - session.started_at).total_seconds() / 60)

        result.append({
            "date": str(session.started_at)[:10],
            "day_name": day_map.get(session.routine_day_id or "", "Sesión libre"),
            "duration_min": duration_min,
            "exercises": exercises_data,
            "notes": session.notes,
        })

    return result


def _fetch_routine(db: Session, user_id: str) -> list[dict[str, Any]]:
    """Return the active routine structure with target weights."""
    routines = list(
        db.execute(
            select(Routine)
            .where(
                Routine.user_id == user_id,
                Routine.is_active.is_(True),
                Routine.deleted_at.is_(None),
            )
        ).scalars()
    )
    if not routines:
        return []

    ex_cache: dict[str, str] = {}
    result = []
    for routine in routines:
        days = list(
            db.execute(
                select(RoutineDay)
                .where(
                    RoutineDay.routine_id == routine.id,
                    RoutineDay.deleted_at.is_(None),
                )
                .order_by(RoutineDay.position)
            ).scalars()
        )
        days_data = []
        for day in days:
            rdes = list(
                db.execute(
                    select(RoutineDayExercise)
                    .where(
                        RoutineDayExercise.routine_day_id == day.id,
                        RoutineDayExercise.deleted_at.is_(None),
                    )
                    .order_by(RoutineDayExercise.position)
                ).scalars()
            )
            exercises = []
            for rde in rdes:
                if rde.exercise_id not in ex_cache:
                    ex = db.execute(select(Exercise).where(Exercise.id == rde.exercise_id)).scalar_one_or_none()
                    ex_cache[rde.exercise_id] = ex.name if ex else "?"
                weight_str = f" @ {rde.target_weight_kg} kg" if rde.target_weight_kg else ""
                rpe_str = f" RPE {rde.target_rpe}" if rde.target_rpe else ""
                exercises.append(
                    f"{ex_cache[rde.exercise_id]}: {rde.target_sets}×{rde.rep_min}-{rde.rep_max}{weight_str}{rpe_str}"
                )
            days_data.append({"name": day.name, "exercises": exercises})
        result.append({"name": routine.name, "days": days_data})
    return result


@router.get("/ai-summary")
def ai_summary(
    weeks: int = 4,
    user_id: CurrentUser = "",
    db: DB = None,
) -> dict[str, str]:
    now = datetime.now(timezone.utc)
    since = now - timedelta(weeks=weeks)
    prev_since = since - timedelta(weeks=weeks)

    current_sessions = _fetch_sessions(db, user_id, since)
    prev_sessions = _fetch_sessions(db, user_id, prev_since, until=since)

    metrics = list(
        db.execute(
            select(BodyMetric)
            .where(
                BodyMetric.user_id == user_id,
                BodyMetric.measured_at >= prev_since,
                BodyMetric.deleted_at.is_(None),
            )
            .order_by(BodyMetric.measured_at)
        ).scalars()
    )

    profile = db.execute(select(Profile).where(Profile.user_id == user_id)).scalar_one_or_none()
    routine_data = _fetch_routine(db, user_id)

    context = _build_context(current_sessions, prev_sessions, metrics, routine_data, profile, weeks)

    if not settings.gemini_api_key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY no configurada en las variables de entorno del servidor.")

    try:
        from google import genai
        from google.genai import types as genai_types
    except ImportError as e:
        raise HTTPException(status_code=503, detail=f"Librería google-genai no instalada: {e}") from e

    system = (
        "Eres un entrenador personal experto con conocimiento en periodización y fisiología del ejercicio. "
        "Responde siempre en español. Usa los nombres exactos de los ejercicios que aparecen en los datos. "
        "No inventes cifras ni ejercicios que no estén en el contexto. "
        "Si faltan datos para un análisis, indícalo brevemente y da recomendaciones igualmente. "
        "Mantén un tono motivador y directo, como un entrenador que conoce bien al atleta."
    )
    prompt = (
        f"{context}\n\n"
        "El usuario ya sabe lo que hizo — NO repitas ni resumas las sesiones. "
        "Tienes dos fuentes de datos: el detalle crudo de cada sesión Y las estadísticas agregadas "
        "(duración, volumen, e1RM estimado, RPE, distribución muscular) que son exactamente lo que "
        "muestran los gráficos de la app. Úsalas ambas para hacer un análisis más rico.\n\n"
        "Ve directo al análisis:\n"
        "- Compara el período actual con el anterior: adherencia, duración media, volumen total, RPE.\n"
        "- Comenta las tendencias de e1RM por ejercicio (▲▼→ según los datos).\n"
        "- Señala qué grupos musculares recibieron más/menos volumen y si el balance es adecuado para el objetivo.\n"
        "- Compara pesos reales vs objetivos de la rutina.\n"
        "- Da recomendaciones accionables de progresión basadas en los datos.\n"
        "Sé directo, motivador y conciso. No uses relleno.\n\n"
        "Proporciona el informe con estas secciones (usa ## para los títulos):\n"
        "## Tendencias y estadísticas clave\n"
        "## Progreso vs período anterior\n"
        "## Pesos vs objetivos de la rutina\n"
        "## Recomendaciones de progresión\n"
        "## Observaciones del entrenador\n\n"
        "Responde solo con el informe, sin introducción previa."
    )

    client = genai.Client(api_key=settings.gemini_api_key)
    _MODELS = [
        "gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.7-flash",
        "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash",
    ]
    last_exc: Exception | None = None
    response = None
    for model in _MODELS:
        for attempt in range(2):
            if attempt:
                time.sleep(3)
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=genai_types.GenerateContentConfig(
                        system_instruction=system,
                        max_output_tokens=8192,
                    ),
                )
                break
            except Exception as e:
                last_exc = e
                err_str = str(e)
                if any(x in err_str for x in ("503", "UNAVAILABLE", "404", "429", "RESOURCE_EXHAUSTED")):
                    continue
                raise HTTPException(status_code=502, detail=f"Error llamando a Gemini: {e}") from e
        if response is not None:
            break

    if response is None:
        raise HTTPException(status_code=502, detail=f"Gemini no disponible en ningún modelo: {last_exc}") from last_exc

    return {"summary": response.text}


@router.post("/import-catalog")
def import_catalog(
    user_id: CurrentUser = "",
    db: DB = None,
) -> dict[str, Any]:
    """Read catalog/exercises.json and upsert all exercises into the DB."""
    import json
    from pathlib import Path

    from sqlalchemy.dialects.postgresql import insert as pg_insert

    catalog_path = Path(__file__).parents[4] / "catalog" / "exercises.json"
    if not catalog_path.exists():
        raise HTTPException(status_code=404, detail=f"No se encuentra {catalog_path}")

    exercises = json.loads(catalog_path.read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc)

    for ex in exercises:
        values = {**ex, "updated_at": now}
        # Remove keys not in the model
        values.pop("exercise_type", None)
        values.pop("met_value", None)
        stmt = (
            pg_insert(Exercise)
            .values(**values)
            .on_conflict_do_update(
                index_elements=["id"],
                set_={k: v for k, v in values.items() if k != "id"},
            )
        )
        db.execute(stmt)
    db.commit()
    return {"imported": len(exercises)}


@router.post("/adjust-target-weights")
def adjust_target_weights(
    user_id: CurrentUser = "",
    db: DB = None,
) -> dict[str, Any]:
    """
    Actualiza target_weight_kg en routine_day_exercises al peso máximo real
    ejecutado en la última sesión de cada ejercicio del usuario.
    """
    # Subquery: última sesión (started_at max) por exercise_id
    latest_subq = (
        select(
            SessionExercise.exercise_id,
            func.max(WorkoutSession.started_at).label("last_started"),
        )
        .join(WorkoutSession, WorkoutSession.id == SessionExercise.session_id)
        .where(WorkoutSession.user_id == user_id)
        .where(WorkoutSession.deleted_at.is_(None))
        .where(SessionExercise.deleted_at.is_(None))
        .group_by(SessionExercise.exercise_id)
        .subquery()
    )

    # Subquery: session_exercise_id de esa última sesión
    last_se_subq = (
        select(
            SessionExercise.id.label("se_id"),
            SessionExercise.exercise_id,
        )
        .join(WorkoutSession, WorkoutSession.id == SessionExercise.session_id)
        .join(
            latest_subq,
            (latest_subq.c.exercise_id == SessionExercise.exercise_id)
            & (latest_subq.c.last_started == WorkoutSession.started_at),
        )
        .where(WorkoutSession.user_id == user_id)
        .where(WorkoutSession.deleted_at.is_(None))
        .where(SessionExercise.deleted_at.is_(None))
        .subquery()
    )

    # Peso máximo por ejercicio en esa sesión
    max_weight_subq = (
        select(
            last_se_subq.c.exercise_id,
            func.max(WorkoutSet.weight_kg).label("max_weight"),
        )
        .join(WorkoutSet, WorkoutSet.session_exercise_id == last_se_subq.c.se_id)
        .where(WorkoutSet.is_warmup.is_(False))
        .where(WorkoutSet.weight_kg.is_not(None))
        .where(WorkoutSet.deleted_at.is_(None))
        .group_by(last_se_subq.c.exercise_id)
        .subquery()
    )

    # Routine day exercises del usuario (via routine → user_id)
    rows = db.execute(
        select(
            RoutineDayExercise.id,
            RoutineDayExercise.exercise_id,
            RoutineDayExercise.target_weight_kg,
            Exercise.name.label("ex_name"),
            max_weight_subq.c.max_weight,
        )
        .join(RoutineDay, RoutineDay.id == RoutineDayExercise.routine_day_id)
        .join(Routine, Routine.id == RoutineDay.routine_id)
        .join(Exercise, Exercise.id == RoutineDayExercise.exercise_id)
        .outerjoin(max_weight_subq, max_weight_subq.c.exercise_id == RoutineDayExercise.exercise_id)
        .where(Routine.user_id == user_id)
        .where(RoutineDayExercise.deleted_at.is_(None))
        .where(RoutineDay.deleted_at.is_(None))
        .where(Routine.deleted_at.is_(None))
    ).all()

    now = datetime.now(timezone.utc).isoformat()
    updated: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    for row in rows:
        if row.max_weight is None:
            skipped.append({"exercise": row.ex_name, "reason": "sin historial"})
            continue
        if row.max_weight == row.target_weight_kg:
            continue
        db.execute(
            text("UPDATE routine_day_exercises SET target_weight_kg = :w, updated_at = :ts WHERE id = :id"),
            {"w": float(row.max_weight), "ts": now, "id": row.id},
        )
        updated.append({
            "exercise": row.ex_name,
            "old_kg": row.target_weight_kg,
            "new_kg": float(row.max_weight),
        })

    db.commit()
    return {"updated": updated, "skipped": skipped}


def _compute_chart_stats(sessions: list[dict[str, Any]]) -> str:
    """Derive the same aggregates shown in AdminProgreso charts."""
    if not sessions:
        return "  Sin sesiones en este período."

    lines: list[str] = []

    # --- Duración por sesión ---
    durations = [(s["date"], s["duration_min"]) for s in sessions if s.get("duration_min")]
    if durations:
        avg_dur = round(sum(d for _, d in durations) / len(durations))
        dur_list = ", ".join(f"{d}: {m} min" for d, m in durations[-5:])
        lines.append(f"  Duración promedio: {avg_dur} min | Últimas sesiones: {dur_list}")

    # --- Sets completadas por sesión ---
    for s in sessions:
        total_c = sum(ex.get("sets_completed", 0) for ex in s["exercises"])
        total_t = sum(ex.get("sets_total", 0) for ex in s["exercises"])
        if total_t:
            pct = round(100 * total_c / total_t)
            lines.append(f"  {s['date']} — {s['day_name']}: {total_c}/{total_t} series completadas ({pct}%)")

    # --- Volumen total por sesión ---
    vol_sessions = [
        (s["date"], sum(ex.get("volume_kg") or 0 for ex in s["exercises"]))
        for s in sessions
    ]
    vol_sessions = [(d, v) for d, v in vol_sessions if v > 0]
    if vol_sessions:
        lines.append("  Volumen por sesión (kg×reps): " + ", ".join(f"{d}: {int(v)}" for d, v in vol_sessions))

    # --- e1RM mejor por ejercicio (tendencia) ---
    e1rm_by_ex: dict[str, list[tuple[str, float]]] = {}
    for s in sessions:
        for ex in s["exercises"]:
            if ex.get("best_e1rm"):
                e1rm_by_ex.setdefault(ex["name"], []).append((s["date"], ex["best_e1rm"]))
    if e1rm_by_ex:
        lines.append("  Tendencia e1RM estimado por ejercicio:")
        for name, pts in e1rm_by_ex.items():
            if len(pts) == 1:
                lines.append(f"    {name}: {pts[0][1]} kg ({pts[0][0]})")
            else:
                first_val, last_val = pts[0][1], pts[-1][1]
                trend = "▲" if last_val > first_val else ("▼" if last_val < first_val else "→")
                lines.append(f"    {name}: {first_val} → {last_val} kg {trend}")

    # --- RPE promedio por sesión ---
    rpe_sessions: list[tuple[str, float]] = []
    for s in sessions:
        rpes = [ex["avg_rpe"] for ex in s["exercises"] if ex.get("avg_rpe") is not None]
        if rpes:
            rpe_sessions.append((s["date"], round(sum(rpes) / len(rpes), 1)))
    if rpe_sessions:
        lines.append("  RPE promedio por sesión: " + ", ".join(f"{d}: {r}" for d, r in rpe_sessions))

    # --- Volumen por músculo ---
    muscle_vol: dict[str, float] = {}
    for s in sessions:
        for ex in s["exercises"]:
            if ex.get("volume_kg"):
                muscle_vol[ex["muscle"]] = muscle_vol.get(ex["muscle"], 0) + ex["volume_kg"]
    if muscle_vol:
        sorted_muscles = sorted(muscle_vol.items(), key=lambda x: x[1], reverse=True)
        lines.append("  Volumen por músculo principal: " + " | ".join(f"{m}: {int(v)} kg" for m, v in sorted_muscles[:6]))

    return "\n".join(lines) if lines else "  Sin datos suficientes para calcular estadísticas."


def _fmt_sessions(sessions: list[dict[str, Any]]) -> list[str]:
    lines: list[str] = []
    for s in sessions:
        dur = f" ({s['duration_min']} min)" if s["duration_min"] else ""
        lines.append(f"  {s['date']} — {s['day_name']}{dur}")
        for ex in s["exercises"]:
            planned = f" (planificado: {ex['planned_weight_kg']} kg)" if ex.get("planned_weight_kg") else ""
            note = f" [{ex['notes']}]" if ex.get("notes") else ""
            lines.append(f"    • {ex['name']} ({ex['muscle']}): {ex['sets']}{planned}{note}")
        if s.get("notes"):
            lines.append(f"    📝 {s['notes']}")
    return lines


def _build_context(
    current: list[dict[str, Any]],
    prev: list[dict[str, Any]],
    metrics: list[Any],
    routine_data: list[dict[str, Any]],
    profile: Any,
    weeks: int,
) -> str:
    lines: list[str] = []

    # --- User profile ---
    if profile:
        goal_map = {
            "lose_weight": "perder peso",
            "gain_muscle": "ganar músculo / hipertrofia",
            "maintain": "mantener composición corporal",
            "strength": "ganar fuerza",
            "endurance": "mejorar resistencia",
        }
        goal_str = goal_map.get(profile.goal or "", profile.goal or "no especificado")
        lines.append(f"=== PERFIL DEL USUARIO ===")
        lines.append(f"  Nombre: {profile.display_name or 'Usuario'}")
        lines.append(f"  Objetivo: {goal_str}")
        if profile.height_cm:
            lines.append(f"  Altura: {profile.height_cm} cm")

    # --- Active routine ---
    if routine_data:
        lines.append("\n=== RUTINA ACTIVA ===")
        for r in routine_data:
            lines.append(f"  Rutina: {r['name']}")
            for day in r["days"]:
                lines.append(f"    {day['name']}:")
                for ex_line in day["exercises"]:
                    lines.append(f"      - {ex_line}")

    # --- Current period ---
    lines.append(f"\n=== PERÍODO ACTUAL (últimas {weeks} semana/s) — detalle sesión a sesión ===")
    if current:
        lines += _fmt_sessions(current)
    else:
        lines.append("  Sin sesiones registradas.")

    # --- Chart stats for current period ---
    lines.append(f"\n=== ESTADÍSTICAS AGREGADAS DEL PERÍODO ACTUAL (equivalente a los gráficos) ===")
    lines.append(_compute_chart_stats(current))

    # --- Previous period ---
    lines.append(f"\n=== PERÍODO ANTERIOR ({weeks} semana/s previas) — detalle sesión a sesión ===")
    if prev:
        lines += _fmt_sessions(prev)
    else:
        lines.append("  Sin sesiones registradas.")

    # --- Chart stats for previous period ---
    lines.append(f"\n=== ESTADÍSTICAS AGREGADAS DEL PERÍODO ANTERIOR ===")
    lines.append(_compute_chart_stats(prev))

    # --- Body metrics (both periods) ---
    if metrics:
        lines.append("\n=== MEDICIONES CORPORALES ===")
        for m in metrics:
            parts: list[str] = []
            if m.weight_kg is not None:
                parts.append(f"{m.weight_kg} kg")
            if m.body_fat_pct is not None:
                parts.append(f"{m.body_fat_pct}% grasa")
            if m.waist_cm is not None:
                parts.append(f"cintura {m.waist_cm} cm")
            if parts:
                lines.append(f"  {str(m.measured_at)[:10]}: {' | '.join(parts)}")

    return "\n".join(lines)
