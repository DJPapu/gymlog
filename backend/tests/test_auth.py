from tests.conftest import TEST_USER_A, make_token


def test_health_no_auth(client):
    r = client.get("/health")
    assert r.status_code == 200


def test_reject_no_token(client):
    r = client.get("/exercises/")
    assert r.status_code in (401, 403)  # HTTPBearer returns 401 or 403 depending on FastAPI version


def test_reject_invalid_token(client):
    r = client.get("/exercises/", headers={"Authorization": "Bearer token-invalido"})
    assert r.status_code == 401


def test_reject_wrong_secret(client):
    bad_token = make_token(TEST_USER_A, secret="wrong-secret")
    r = client.get("/exercises/", headers={"Authorization": f"Bearer {bad_token}"})
    assert r.status_code == 401


def test_accept_valid_token(client):
    from tests.conftest import auth
    r = client.get("/exercises/", headers=auth())
    assert r.status_code == 200
