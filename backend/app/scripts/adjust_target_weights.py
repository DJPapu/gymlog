"""
Ajusta target_weight_kg en routine_day_exercises al peso máximo real
ejecutado en la última sesión de cada ejercicio.

Uso:
  uv run python -m app.scripts.adjust_target_weights          # muestra plan + confirma
  uv run python -m app.scripts.adjust_target_weights --apply  # ejecuta sin pedir confirmación
"""
import sys
from datetime import datetime, timezone

from sqlalchemy import func, select, text

from app.db import get_db
from app.models.routine import RoutineDay, RoutineDayExercise, Routine
from app.models.session import Session, SessionExercise, Set
from app.models.exercise import Exercise


def run(apply: bool = False) -> None:
    db = next(get_db())
    try:
        # 1. Para cada exercise_id × user_id: encontrar la última sesión
        #    (session_id con started_at máximo, sin borrar)
        latest_session_subq = (
            select(
                SessionExercise.exercise_id,
                Session.user_id,
                func.max(Session.started_at).label("last_started"),
            )
            .join(Session, Session.id == SessionExercise.session_id)
            .where(Session.deleted_at.is_(None))
            .where(SessionExercise.deleted_at.is_(None))
            .group_by(SessionExercise.exercise_id, Session.user_id)
            .subquery()
        )

        # 2. Unir con sessions para obtener el session_id de esa última sesión
        last_se_subq = (
            select(
                SessionExercise.id.label("se_id"),
                SessionExercise.exercise_id,
                Session.user_id,
            )
            .join(Session, Session.id == SessionExercise.session_id)
            .join(
                latest_session_subq,
                (latest_session_subq.c.exercise_id == SessionExercise.exercise_id)
                & (latest_session_subq.c.user_id == Session.user_id)
                & (latest_session_subq.c.last_started == Session.started_at),
            )
            .where(Session.deleted_at.is_(None))
            .where(SessionExercise.deleted_at.is_(None))
            .subquery()
        )

        # 3. Peso máximo en esos session_exercises (no-calentamiento, completado, con peso)
        max_weight_subq = (
            select(
                last_se_subq.c.exercise_id,
                last_se_subq.c.user_id,
                func.max(Set.weight_kg).label("max_weight"),
            )
            .join(Set, Set.session_exercise_id == last_se_subq.c.se_id)
            .where(Set.is_warmup.is_(False))
            .where(Set.weight_kg.is_not(None))
            .where(Set.deleted_at.is_(None))
            .group_by(last_se_subq.c.exercise_id, last_se_subq.c.user_id)
            .subquery()
        )

        # 4. Obtener todos los routine_day_exercises activos con su user_id
        rdes = (
            db.execute(
                select(
                    RoutineDayExercise,
                    Routine.user_id,
                    Exercise.name.label("ex_name"),
                    max_weight_subq.c.max_weight,
                )
                .join(RoutineDay, RoutineDay.id == RoutineDayExercise.routine_day_id)
                .join(Routine, Routine.id == RoutineDay.routine_id)
                .join(Exercise, Exercise.id == RoutineDayExercise.exercise_id)
                .outerjoin(
                    max_weight_subq,
                    (max_weight_subq.c.exercise_id == RoutineDayExercise.exercise_id)
                    & (max_weight_subq.c.user_id == Routine.user_id),
                )
                .where(RoutineDayExercise.deleted_at.is_(None))
                .where(RoutineDay.deleted_at.is_(None))
                .where(Routine.deleted_at.is_(None))
                .order_by(Routine.user_id, Exercise.name)
            )
            .all()
        )

        # 5. Mostrar plan
        changes = [r for r in rdes if r.max_weight is not None and r.max_weight != r.RoutineDayExercise.target_weight_kg]
        no_data = [r for r in rdes if r.max_weight is None]
        unchanged = [r for r in rdes if r.max_weight is not None and r.max_weight == r.RoutineDayExercise.target_weight_kg]

        print(f"\n{'='*60}")
        print(f"  Ajuste de pesos objetivo — {'SIMULACIÓN' if not apply else 'APLICANDO'}")
        print(f"{'='*60}")

        if changes:
            print(f"\n✏️  {len(changes)} ejercicios a actualizar:\n")
            for r in changes:
                rde = r.RoutineDayExercise
                old = f"{rde.target_weight_kg} kg" if rde.target_weight_kg is not None else "—"
                print(f"  {r.ex_name:<42}  {old:>8}  →  {r.max_weight} kg")
        else:
            print("\n  Sin cambios pendientes.")

        if no_data:
            print(f"\n⚠️  {len(no_data)} ejercicios sin historial (se dejan como están):")
            for r in no_data:
                old = f"{r.RoutineDayExercise.target_weight_kg} kg" if r.RoutineDayExercise.target_weight_kg is not None else "—"
                print(f"  {r.ex_name:<42}  {old}")

        if unchanged:
            print(f"\n✅  {len(unchanged)} ejercicios ya coinciden con el historial.")

        if not changes:
            print("\nNada que hacer.\n")
            return

        # 6. Confirmar o aplicar directamente
        if not apply:
            resp = input("\n¿Aplicar estos cambios? [s/N] ").strip().lower()
            if resp not in ("s", "si", "sí", "y", "yes"):
                print("Cancelado.\n")
                return

        now = datetime.now(timezone.utc).isoformat()
        updated = 0
        for r in changes:
            rde = r.RoutineDayExercise
            db.execute(
                text("UPDATE routine_day_exercises SET target_weight_kg = :w, updated_at = :ts WHERE id = :id"),
                {"w": r.max_weight, "ts": now, "id": rde.id},
            )
            updated += 1

        db.commit()
        print(f"\n✅  {updated} registros actualizados.\n")

    finally:
        db.close()


if __name__ == "__main__":
    apply = "--apply" in sys.argv
    run(apply=apply)
