import time
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
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
            exercises_data.append({
                "name": ex.name,
                "muscle": ex.primary_muscle,
                "sets": sets_str,
                "planned_weight_kg": planned,
                "notes": se.notes,
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
        "El usuario ya sabe lo que hizo — NO lo repitas ni lo resumas. "
        "Ve directo al análisis: compara el período actual con el anterior ejercicio por ejercicio. "
        "Indica claramente si mejoró, empeoró o se mantuvo, y en qué concretamente (peso, reps, adherencia a la rutina). "
        "Compara también los pesos reales vs los objetivos de la rutina. "
        "Mira el objetivo del usuario y da recomendaciones accionables de progresión. "
        "Sé directo, motivador y conciso. No uses relleno.\n\n"
        "Proporciona el informe con estas secciones (usa ## para los títulos):\n"
        "## Progreso vs período anterior\n"
        "## Pesos vs objetivos de la rutina\n"
        "## Recomendaciones de progresión\n"
        "## Observaciones del entrenador\n\n"
        "Responde solo con el informe, sin introducción previa."
    )

    client = genai.Client(api_key=settings.gemini_api_key)
    _MODELS = ["gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.7-flash"]
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
    lines.append(f"\n=== PERÍODO ACTUAL (últimas {weeks} semana/s) ===")
    if current:
        lines += _fmt_sessions(current)
    else:
        lines.append("  Sin sesiones registradas.")

    # --- Previous period ---
    lines.append(f"\n=== PERÍODO ANTERIOR ({weeks} semana/s previas) ===")
    if prev:
        lines += _fmt_sessions(prev)
    else:
        lines.append("  Sin sesiones registradas.")

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
