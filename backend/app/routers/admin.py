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
    RoutineDay,
    Session as WorkoutSession,
    SessionExercise,
    Set as WorkoutSet,
)

router = APIRouter(prefix="/admin", tags=["admin"])

DB = Annotated[Session, Depends(get_db)]


@router.get("/ai-summary")
def ai_summary(
    weeks: int = 4,
    user_id: CurrentUser = "",
    db: DB = None,
) -> dict[str, str]:
    since = datetime.now(timezone.utc) - timedelta(weeks=weeks)

    sessions = list(
        db.execute(
            select(WorkoutSession)
            .where(
                WorkoutSession.user_id == user_id,
                WorkoutSession.started_at >= since,
                WorkoutSession.ended_at.isnot(None),
                WorkoutSession.deleted_at.is_(None),
            )
            .order_by(WorkoutSession.started_at)
        ).scalars()
    )

    day_ids = [s.routine_day_id for s in sessions if s.routine_day_id]
    day_map: dict[str, str] = {}
    if day_ids:
        day_map = {
            d.id: d.name
            for d in db.execute(select(RoutineDay).where(RoutineDay.id.in_(day_ids))).scalars()
        }

    ex_cache: dict[str, Exercise] = {}

    session_data: list[dict[str, Any]] = []
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
                        WorkoutSet.completed.is_(True),
                        WorkoutSet.is_warmup.is_(False),
                    )
                    .order_by(WorkoutSet.set_index)
                ).scalars()
            )

            sets_str = ", ".join(
                f"{s.reps}×{s.weight_kg}kg" + (f" RPE{float(s.rpe)}" if s.rpe else "")
                for s in sets
                if s.reps is not None and s.weight_kg is not None
            )
            if not sets_str:
                continue

            exercises_data.append({
                "name": ex.name,
                "muscle": ex.primary_muscle,
                "sets": sets_str,
                "notes": se.notes,
            })

        if not exercises_data:
            continue

        duration_min = None
        if session.ended_at and session.started_at:
            duration_min = round((session.ended_at - session.started_at).total_seconds() / 60)

        session_data.append({
            "date": str(session.started_at)[:10],
            "day_name": day_map.get(session.routine_day_id or "", "Sesión libre"),
            "duration_min": duration_min,
            "exercises": exercises_data,
            "notes": session.notes,
        })

    metrics = list(
        db.execute(
            select(BodyMetric)
            .where(
                BodyMetric.user_id == user_id,
                BodyMetric.measured_at >= since,
                BodyMetric.deleted_at.is_(None),
            )
            .order_by(BodyMetric.measured_at)
        ).scalars()
    )

    context = _build_context(session_data, metrics)

    if not settings.gemini_api_key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY no configurada en las variables de entorno del servidor.")

    try:
        from google import genai
        from google.genai import types as genai_types
    except ImportError as e:
        raise HTTPException(status_code=503, detail=f"Librería google-genai no instalada: {e}") from e

    system = (
        "Eres un entrenador personal experto con conocimiento en periodización y fisiología del ejercicio. "
        "Analiza los datos de entrenamiento y proporciona un informe en español. "
        "Sé conciso pero específico. Usa los nombres exactos de los ejercicios de los datos. "
        "No inventes datos que no estén en el contexto. "
        "Si hay pocos datos, indícalo pero da igualmente recomendaciones útiles."
    )
    prompt = (
        f"{context}\n\n"
        "Proporciona un informe con estas secciones (usa ## para los títulos):\n"
        "## Resumen de la semana\n"
        "## Comparación con semana anterior\n"
        "## Tendencias del mes\n"
        "## Recomendaciones\n\n"
        "Incluye 3-5 recomendaciones específicas y accionables. "
        "Responde solo con el informe, sin introducción previa."
    )

    client = genai.Client(api_key=settings.gemini_api_key)
    last_exc: Exception | None = None
    for attempt in range(3):
        if attempt:
            time.sleep(2 ** attempt)  # 2s, 4s
        try:
            response = client.models.generate_content(
                model="gemini-1.5-flash",
                contents=prompt,
                config=genai_types.GenerateContentConfig(
                    system_instruction=system,
                    max_output_tokens=1500,
                ),
            )
            break
        except Exception as e:
            last_exc = e
            if "503" not in str(e) and "UNAVAILABLE" not in str(e):
                raise HTTPException(status_code=502, detail=f"Error llamando a Gemini: {e}") from e
    else:
        raise HTTPException(status_code=502, detail=f"Gemini no disponible tras 3 intentos: {last_exc}") from last_exc

    return {"summary": response.text}


def _build_context(sessions: list[dict[str, Any]], metrics: list[Any]) -> str:
    lines = ["=== DATOS DE ENTRENAMIENTO (últimas semanas) ==="]

    if not sessions:
        lines.append("\nSin sesiones registradas en el período.")
    else:
        for s in sessions:
            dur = f" ({s['duration_min']} min)" if s["duration_min"] else ""
            lines.append(f"\n📅 {s['date']} — {s['day_name']}{dur}")
            for ex in s["exercises"]:
                note = f" [{ex['notes']}]" if ex.get("notes") else ""
                lines.append(f"  • {ex['name']} ({ex['muscle']}): {ex['sets']}{note}")
            if s.get("notes"):
                lines.append(f"  📝 {s['notes']}")

    if metrics:
        lines.append("\n\n=== MEDICIONES CORPORALES ===")
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
