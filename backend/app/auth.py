from datetime import datetime, timedelta, timezone
from uuid import uuid4
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt import InvalidTokenError
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User

revoked_tokens: set[str] = set()

ALGORITHM = "HS256"
TOKEN_MINUTES = 60
password_hash = PasswordHash.recommended()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def create_access_token(user: User) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_MINUTES)
    return jwt.encode({"sub": str(user.id), "role": user.role, "jti": str(uuid4()), "exp": expires}, settings.jwt_secret, algorithm=ALGORITHM)


def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], db: Annotated[Session, Depends(get_db)]) -> User:
    error = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
        if payload.get("jti") in revoked_tokens:
            raise error
    except (InvalidTokenError, KeyError, TypeError, ValueError):
        raise error
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise error
    return user


def require_analyst(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role not in ("admin", "analyst"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Analyst role required")
    return user


def require_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return user
