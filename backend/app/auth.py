from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import settings

_bearer = HTTPBearer()

_DEV_TOKEN = "dev-local-user"
_DEV_USER_ID = "local-user-dev"


def verify_jwt(credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)]) -> str:
    """Validates Supabase JWT and returns the user_id (sub claim).
    En desarrollo (sin SUPABASE_JWT_SECRET), acepta el token 'dev-local-user'."""
    token = credentials.credentials

    if not settings.supabase_jwt_secret:
        if token == _DEV_TOKEN:
            return _DEV_USER_ID
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Modo dev: usa el token 'dev-local-user'",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
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
