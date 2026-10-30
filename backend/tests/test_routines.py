from tests.conftest import TEST_USER_A, TEST_USER_B, auth

ROUTINE = {"name": "Mi rutina PPL"}
DAY = {"name": "Día A – Empuje", "position": 0}
EXERCISE_PAYLOAD = {
    "name": "Sentadilla",
    "equipment": "barbell",
    "primary_muscle": "cuádriceps",
    "movement_pattern": "squat",
}


def _create_routine(client):
    return client.post("/routines/", json=ROUTINE, headers=auth()).json()


def _create_day(client, routine_id):
    return client.post(f"/routines/{routine_id}/days", json=DAY, headers=auth()).json()


def _create_exercise(client):
    return client.post("/exercises/", json=EXERCISE_PAYLOAD, headers=auth()).json()


def test_create_and_list_routines(client):
    _create_routine(client)
    r = client.get("/routines/", headers=auth())
    assert r.status_code == 200
    assert any(rt["name"] == ROUTINE["name"] for rt in r.json())


def test_user_isolation(client):
    """Usuario B no ve las rutinas de usuario A."""
    _create_routine(client)
    r = client.get("/routines/", headers=auth(TEST_USER_B))
    names = [rt["name"] for rt in r.json()]
    assert ROUTINE["name"] not in names


def test_delete_routine_forbidden_other_user(client):
    rt_id = _create_routine(client)["id"]
    r = client.delete(f"/routines/{rt_id}", headers=auth(TEST_USER_B))
    assert r.status_code == 403


def test_create_day_and_add_exercise(client):
    rt_id = _create_routine(client)["id"]
    day_id = _create_day(client, rt_id)["id"]
    ex_id = _create_exercise(client)["id"]

    rde_payload = {"exercise_id": ex_id, "target_sets": 3, "rep_min": 6, "rep_max": 10}
    r = client.post(f"/routines/{rt_id}/days/{day_id}/exercises", json=rde_payload, headers=auth())
    assert r.status_code == 201
    assert r.json()["exercise_id"] == ex_id


def test_soft_delete_day(client):
    rt_id = _create_routine(client)["id"]
    day_id = _create_day(client, rt_id)["id"]
    r = client.delete(f"/routines/{rt_id}/days/{day_id}", headers=auth())
    assert r.status_code == 204
    r2 = client.get(f"/routines/{rt_id}/days", headers=auth())
    assert not any(d["id"] == day_id for d in r2.json())
