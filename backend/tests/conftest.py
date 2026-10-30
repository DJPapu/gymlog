"""
Test fixtures usando SQLite en memoria (una única conexión para evitar el problema
de que cada conexión a :memory: crea una BD distinta).
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session

from app.db import get_db
from app.main import app
from app.models import Base  # side-effect: registers all table metadata

TEST_JWT_SECRET = "test-secret-for-tests-only"
TEST_USER_A = "user-a-uuid-1234"
TEST_USER_B = "user-b-uuid-5678"


@pytest.fixture(scope="session")
def connection():
    """Single SQLite in-memory connection shared across all tests."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    conn = engine.connect()
    Base.metadata.create_all(bind=conn)
    yield conn
    conn.close()
    engine.dispose()


@pytest.fixture()
def db_session(connection):
    """Each test gets its own transaction that rolls back at the end."""
    trans = connection.begin_nested()
    session = Session(bind=connection)

    @event.listens_for(session, "after_transaction_end")
    def restart_savepoint(s, transaction):
        if transaction.nested and not transaction._parent.nested:
            s.expire_all()

    yield session
    session.close()
    trans.rollback()


@pytest.fixture()
def client(db_session, monkeypatch):
    monkeypatch.setattr("app.config.settings.supabase_jwt_secret", TEST_JWT_SECRET)

    def override_db():
        yield db_session

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def make_token(user_id: str, secret: str = TEST_JWT_SECRET) -> str:
    from jose import jwt
    return jwt.encode({"sub": user_id}, secret, algorithm="HS256")


def auth(user_id: str = TEST_USER_A) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(user_id)}"}
