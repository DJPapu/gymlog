"""
Tests de la lógica de progresión.
Mismos casos de test que el frontend (progression.ts).
"""
import pytest
from app.services.progression import (
    ProgressionInput,
    ProgressionResult,
    SessionHistory,
    SetData,
    suggest_progression,
)


def _inp(rep_min=8, rep_max=12, target_rpe=8.0, target_weight_kg=40.0, increment=2.5) -> ProgressionInput:
    return ProgressionInput(
        rep_min=rep_min,
        rep_max=rep_max,
        target_rpe=target_rpe,
        target_weight_kg=target_weight_kg,
        weight_increment_kg=increment,
    )


def _set(reps=10, weight=40.0, rpe=8.0, completed=True, warmup=False) -> SetData:
    return SetData(reps=reps, weight_kg=weight, rpe=rpe, completed=completed, is_warmup=warmup)


def _session(*sets: SetData, date="2026-01-01T10:00:00") -> SessionHistory:
    return SessionHistory(sets=list(sets), started_at=date)


# ── Primera vez ─────────────────────────────────────────────────────────────

def test_no_history_returns_first():
    result = suggest_progression(_inp(), [])
    assert result.direction == "first"
    assert result.weight_kg == 40.0
    assert result.reps == 8


def test_no_completed_sets_returns_first():
    session = _session(_set(completed=False), _set(completed=False))
    result = suggest_progression(_inp(), [session])
    assert result.direction == "first"


# ── Subir peso ───────────────────────────────────────────────────────────────

def test_all_at_max_rpe_ok_goes_up():
    session = _session(_set(reps=12, weight=40.0, rpe=7.5))
    result = suggest_progression(_inp(), [session])
    assert result.direction == "up"
    assert result.weight_kg == 42.5
    assert result.reps == 8


def test_all_at_max_no_rpe_target_goes_up():
    inp = _inp(target_rpe=None)
    session = _session(_set(reps=12, weight=40.0, rpe=9.5))
    result = suggest_progression(inp, [session])
    assert result.direction == "up"


def test_all_at_max_rpe_exactly_at_target_goes_up():
    session = _session(_set(reps=12, weight=40.0, rpe=8.0))
    result = suggest_progression(_inp(), [session])
    assert result.direction == "up"


# ── Mismo peso ───────────────────────────────────────────────────────────────

def test_in_range_not_max_stays_same_plus_rep():
    session = _session(_set(reps=10, weight=40.0, rpe=7.0))
    result = suggest_progression(_inp(), [session])
    assert result.direction == "same"
    assert result.weight_kg == 40.0
    assert result.reps == 11


def test_in_range_not_max_caps_at_rep_max():
    session = _session(_set(reps=11, weight=40.0, rpe=7.0))
    result = suggest_progression(_inp(), [session])
    assert result.direction == "same"
    assert result.reps == 12  # capped at rep_max


def test_all_at_max_rpe_too_high_stays_same():
    # RPE > target + 1 → no sube aunque llegó al máximo
    session = _session(_set(reps=12, weight=40.0, rpe=10.0))
    result = suggest_progression(_inp(target_rpe=8.0), [session])
    assert result.direction == "same"
    assert result.weight_kg == 40.0


def test_below_min_first_time_stays_same():
    session = _session(_set(reps=5, weight=40.0, rpe=8.0))
    result = suggest_progression(_inp(), [session])
    assert result.direction == "same"
    assert result.weight_kg == 40.0


# ── Bajar peso ───────────────────────────────────────────────────────────────

def test_below_min_two_sessions_drops_weight():
    s1 = _session(_set(reps=5, weight=40.0, rpe=8.0), date="2026-01-08T10:00:00")
    s2 = _session(_set(reps=6, weight=40.0, rpe=8.0), date="2026-01-01T10:00:00")
    result = suggest_progression(_inp(), [s1, s2])
    assert result.direction == "down"
    assert result.weight_kg < 40.0


def test_rpe_too_high_two_sessions_drops_weight():
    s1 = _session(_set(reps=10, weight=40.0, rpe=10.0), date="2026-01-08T10:00:00")
    s2 = _session(_set(reps=10, weight=40.0, rpe=9.5), date="2026-01-01T10:00:00")
    result = suggest_progression(_inp(target_rpe=8.0), [s1, s2])
    assert result.direction == "down"


def test_drop_rounds_to_increment():
    # 40 * 0.9 = 36 → redondeado al 2.5 más cercano = 35.0
    s1 = _session(_set(reps=5, weight=40.0), date="2026-01-08T10:00:00")
    s2 = _session(_set(reps=5, weight=40.0), date="2026-01-01T10:00:00")
    result = suggest_progression(_inp(), [s1, s2])
    assert result.direction == "down"
    assert result.weight_kg % 2.5 == 0.0


# ── Calentamientos ignorados ─────────────────────────────────────────────────

def test_warmup_sets_ignored():
    # Solo tiene series de calentamiento: como si no hubiera historial
    session = _session(_set(reps=12, weight=40.0, warmup=True))
    result = suggest_progression(_inp(), [session])
    assert result.direction == "first"


def test_warmup_mixed_with_effective():
    warmup = _set(reps=15, weight=20.0, warmup=True)
    effective = _set(reps=12, weight=40.0, rpe=7.0)
    session = _session(warmup, effective)
    result = suggest_progression(_inp(), [session])
    # El calentamiento no debe contaminar: solo cuenta la serie efectiva
    assert result.direction == "up"
    assert result.weight_kg == 42.5
