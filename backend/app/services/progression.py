"""
Lógica de sugerencia de progresión (doble progresión).
Función pura: sin dependencias de BD, testeada independientemente.
Misma lógica que frontend/src/lib/progression.ts.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal


@dataclass
class SetData:
    reps: int | None
    weight_kg: float | None
    rpe: float | None
    completed: bool
    is_warmup: bool


@dataclass
class SessionHistory:
    sets: list[SetData]
    started_at: str  # ISO datetime


@dataclass
class ProgressionInput:
    rep_min: int
    rep_max: int
    target_rpe: float | None
    target_weight_kg: float | None
    weight_increment_kg: float


@dataclass
class ProgressionResult:
    weight_kg: float
    reps: int
    direction: Literal["up", "same", "down", "first"]
    reason: str


def suggest_progression(
    input: ProgressionInput,
    history: list[SessionHistory],  # ordenado desc: history[0] = más reciente
) -> ProgressionResult:
    fallback = input.target_weight_kg or input.weight_increment_kg

    if not history:
        return ProgressionResult(
            weight_kg=fallback, reps=input.rep_min,
            direction="first", reason="Primera vez con este ejercicio.",
        )

    effective = [
        s for s in history[0].sets
        if not s.is_warmup and s.completed and s.weight_kg is not None
    ]

    if not effective:
        return ProgressionResult(
            weight_kg=fallback, reps=input.rep_min,
            direction="first", reason="Sin series completadas la última vez.",
        )

    last_weight = max(s.weight_kg for s in effective)  # type: ignore[type-var]
    reps_arr = [s.reps or 0 for s in effective]
    rpe_vals = [s.rpe for s in effective if s.rpe is not None]
    avg_rpe = sum(rpe_vals) / len(rpe_vals) if rpe_vals else None

    prefix = (
        f"{_fmt_date(history[0].started_at)}: "
        f"{_fmt_summary(len(effective), reps_arr, last_weight)}"
        f"{_fmt_rpe(avg_rpe)}"
    )

    all_at_max = all((s.reps or 0) >= input.rep_max for s in effective)
    any_below_min = any((s.reps or 0) < input.rep_min for s in effective)
    rpe_too_high = (
        input.target_rpe is not None
        and avg_rpe is not None
        and avg_rpe > input.target_rpe + 1
    )
    rpe_ok = input.target_rpe is None or avg_rpe is None or avg_rpe <= input.target_rpe

    # Subir peso
    if all_at_max and rpe_ok:
        new_weight = _round(last_weight + input.weight_increment_kg, input.weight_increment_kg)
        return ProgressionResult(
            weight_kg=new_weight, reps=input.rep_min,
            direction="up",
            reason=f"{prefix} → Completaste el máximo. ↑ Subís a {new_weight} kg.",
        )

    # Por debajo del mínimo o RPE excesivo
    if any_below_min or rpe_too_high:
        two_in_a_row = len(history) >= 2 and _session_failed(history[1], input)
        if two_in_a_row:
            new_weight = _round(last_weight * 0.9, input.weight_increment_kg)
            return ProgressionResult(
                weight_kg=new_weight, reps=input.rep_min,
                direction="down",
                reason=f"{prefix} → 2 sesiones sin completar el objetivo. ↓ Bajás a {new_weight} kg.",
            )
        return ProgressionResult(
            weight_kg=last_weight, reps=input.rep_min,
            direction="same",
            reason=f"{prefix} → No se completó el objetivo. Mismo peso.",
        )

    # En rango pero sin llegar al máximo → +1 rep
    next_reps = min(max(reps_arr) + 1, input.rep_max)
    return ProgressionResult(
        weight_kg=last_weight, reps=next_reps,
        direction="same",
        reason=f"{prefix} → Mismo peso, intenta {next_reps} reps.",
    )


def _session_failed(session: SessionHistory, input: ProgressionInput) -> bool:
    prev = [s for s in session.sets if not s.is_warmup and s.completed]
    if any((s.reps or 0) < input.rep_min for s in prev):
        return True
    rpe_vals = [s.rpe for s in prev if s.rpe is not None]
    avg = sum(rpe_vals) / len(rpe_vals) if rpe_vals else None
    return input.target_rpe is not None and avg is not None and avg > input.target_rpe + 1


def _round(value: float, increment: float) -> float:
    return round(round(value / increment) * increment, 4)


def _fmt_date(iso: str) -> str:
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        days_es = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
        months_es = ["", "ene", "feb", "mar", "abr", "may", "jun",
                     "jul", "ago", "sep", "oct", "nov", "dic"]
        return f"{days_es[dt.weekday()]} {dt.day} {months_es[dt.month]}"
    except Exception:
        return iso[:10]


def _fmt_summary(sets: int, reps_arr: list[int], weight: float) -> str:
    unique = list(dict.fromkeys(reps_arr))
    reps_str = str(unique[0]) if len(unique) == 1 else "/".join(str(r) for r in reps_arr)
    return f"{sets}×{reps_str} @ {weight} kg"


def _fmt_rpe(avg: float | None) -> str:
    if avg is None:
        return ""
    return f" · RPE {int(avg) if avg % 1 == 0 else avg:.1f}"
