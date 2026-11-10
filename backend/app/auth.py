from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

_bearer = HTTPBearer()

_DEV_TOKEN = "dev-local-user"


def verify_token(credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)]) -> str:
    """Verifica el token estático y devuelve el user_id fijo.
    Con API_SECRET configurado: exige ese valor exacto.
    Sin API_SECRET (modo dev): acepta el token 'dev-local-user'."""
    token = credentials.credentials

    if settings.api_secret:
        if token == settings.api_secret:
            return settings.fixed_user_id
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Modo dev sin API_SECRET configurado
    if token == _DEV_TOKEN:
        return settings.fixed_user_id
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Modo dev: usa el token 'dev-local-user'",
        headers={"WWW-Authenticate": "Bearer"},
    )


CurrentUser = Annotated[str, Depends(verify_token)]
