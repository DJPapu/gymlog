from tests.conftest import TEST_USER_A, TEST_USER_B, auth

EXERCISE_PAYLOAD = {
    "name": "Press de pecho en máquina",
    "equipment": "machine",
    "primary_muscle": "pectoral",
    "movement_pattern": "push",
    "weight_increment_kg": 5.0,
    "default_rep_range": "8-12",
}


def test_create_exercise(client):
    r = client.post("/exercises/", json=EXERCISE_PAYLOAD, headers=auth())
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == EXERCISE_PAYLOAD["name"]
    assert data["created_by"] == TEST_USER_A


def test_list_exercises(client):
    client.post("/exercises/", json=EXERCISE_PAYLOAD, headers=auth())
    r = client.get("/exercises/", headers=auth())
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_get_exercise(client):
    create_r = client.post("/exercises/", json=EXERCISE_PAYLOAD, headers=auth())
    ex_id = create_r.json()["id"]
    r = client.get(f"/exercises/{ex_id}", headers=auth(TEST_USER_B))  # otro usuario puede ver catálogo
    assert r.status_code == 200


def test_update_exercise(client):
    ex_id = client.post("/exercises/", json=EXERCISE_PAYLOAD, headers=auth()).json()["id"]
    r = client.put(f"/exercises/{ex_id}", json={**EXERCISE_PAYLOAD, "name": "Nuevo nombre"}, headers=auth())
    assert r.status_code == 200
    assert r.json()["name"] == "Nuevo nombre"


def test_soft_delete_exercise(client):
    ex_id = client.post("/exercises/", json=EXERCISE_PAYLOAD, headers=auth()).json()["id"]
    r = client.delete(f"/exercises/{ex_id}", headers=auth())
    assert r.status_code == 204
    r2 = client.get(f"/exercises/{ex_id}", headers=auth())
    assert r2.status_code == 404
