import re
import uuid
from datetime import timedelta

import jwt
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.utils import timezone

from creditcommon.errors import DomainError

from .models import Session, User


def validate_password(pw: str, username: str = ""):
    problems = []
    if len(pw) < 10:
        problems.append("at least 10 characters")
    if not re.search(r"[A-Za-z]", pw) or not re.search(r"\d", pw):
        problems.append("letters and numbers")
    if username and username.lower() in pw.lower():
        problems.append("must not contain the username")
    if problems:
        raise DomainError("weak_password", "Password needs: " + ", ".join(problems), status=400)


def hash_password(pw: str) -> str:
    return make_password(pw)


def issue_token(user: User, ip: str = "", ua: str = "") -> tuple[str, Session]:
    exp = timezone.now() + timedelta(hours=settings.SESSION_HOURS)
    s = Session.objects.create(user=user, expires_at=exp, ip=ip[:64], user_agent=ua[:256])
    payload = {"sub": str(user.id), "tid": user.tenant_id, "role": user.role, "jti": str(s.jti), "iat": int(timezone.now().timestamp()), "exp": int(exp.timestamp())}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256"), s


def read_token(raw: str) -> dict:
    try:
        return jwt.decode(raw, settings.JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise DomainError("invalid_token", "Session is invalid or expired", status=401)


def active_session(claims: dict) -> tuple[User, Session]:
    s = Session.objects.select_related("user").filter(jti=uuid.UUID(claims["jti"])).first()
    if not s or s.revoked_at or s.expires_at <= timezone.now() or not s.user.is_active:
        raise DomainError("session_revoked", "Session is no longer active", status=401)
    return s.user, s


def bearer(request) -> str:
    h = request.headers.get("Authorization", "")
    return h[7:] if h.lower().startswith("bearer ") else ""


__all__ = ["check_password", "hash_password", "validate_password", "issue_token", "read_token", "active_session", "bearer"]
