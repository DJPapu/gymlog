import threading
from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import settings

_bearer = HTTPBearer()

_DEV_TOKEN = "dev-local-user"
_DEV_USER_ID = "local-user-dev"

_jwks_cache: dict | None = None
_jwks_lock = threading.Lock()


def _get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache is not None:
        return _jwks_cache
    with _jwks_lock:
        if _jwks_cache is not None:
            return _jwks_cache
        url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
        resp = httpx.get(url, timeout=10)
        resp.raise_for_status()
        _jwks_cache = resp.json()
    return _jwks_cache


def verify_jwt(credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)]) -> str:
    """Validates Supabase JWT via JWKS and returns the user_id (sub claim).
    En desarrollo (sin SUPABASE_URL), acepta el token 'dev-local-user'."""
    token = credentials.credentials

    if not settings.supabase_url:
        if token == _DEV_TOKEN:
            return _DEV_USER_ID
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Modo dev: usa el token 'dev-local-user'",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        jwks = _get_jwks()
        payload = jwt.decode(
            token,
            jwks,
            algorithms=["ES256", "HS256"],
            options={"verify_aud": False},
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user_id: str | None = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token sin user_id",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user_id


CurrentUser = Annotated[str, Depends(verify_jwt)]
