from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from datetime import timedelta
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from creditcommon.context import ROLES
from creditcommon.errors import DomainError
from creditcommon.permissions import roles_allowed

from .models import LoginEvent, Session, User
from .security import active_session, bearer, check_password, hash_password, issue_token, read_token, validate_password


def client_ip(request) -> str:
    return request.headers.get("X-Real-IP") or request.META.get("REMOTE_ADDR", "")


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = str(request.data.get("username", "")).strip().lower()
        password = str(request.data.get("password", ""))
        ip = client_ip(request)
        user = User.objects.filter(username=username).first()
        generic = DomainError("invalid_credentials", "Invalid username or password", status=401)
        if not user:
            LoginEvent.objects.create(username=username[:64], outcome="unknown_user", ip=ip)
            raise generic
        if user.locked:
            LoginEvent.objects.create(username=username, outcome="locked", ip=ip)
            raise DomainError("account_locked", "Too many failed attempts. Try again later.", status=423)
        if not user.is_active or not check_password(password, user.password):
            user.failed_attempts += 1
            if user.failed_attempts >= settings.LOCKOUT_ATTEMPTS:
                user.locked_until = timezone.now() + timedelta(minutes=settings.LOCKOUT_MINUTES)
                user.failed_attempts = 0
            user.save(update_fields=["failed_attempts", "locked_until"])
            LoginEvent.objects.create(username=username, outcome="failed", ip=ip)
            raise generic
        user.failed_attempts, user.locked_until, user.last_login = 0, None, timezone.now()
        user.save(update_fields=["failed_attempts", "locked_until", "last_login"])
        token, session = issue_token(user, ip, request.headers.get("User-Agent", ""))
        LoginEvent.objects.create(username=username, outcome="success", ip=ip)
        return Response({"accessToken": token, "expiresAt": session.expires_at, "user": user.public()})


class VerifyView(APIView):
    """Called by the gateway (nginx auth_request) for every API call. 200 + identity headers, or 401."""
    permission_classes = [AllowAny]

    def get(self, request):
        user, _ = active_session(read_token(bearer(request)))
        uri = request.headers.get("X-Original-URI", "")
        if user.must_change_password and uri and not uri.split("?")[0].startswith(("/api/v1/auth/me", "/api/v1/auth/logout", "/api/v1/auth/change-password")):
            raise DomainError("password_change_required", "You must change your password before continuing", status=403)
        r = HttpResponse(status=200)
        r["X-User-Id"], r["X-User-Role"], r["X-Tenant-Id"] = str(user.id), user.role, user.tenant_id
        r["X-User-Branch"], r["X-User-Zone"] = user.branch, user.zone
        return r


class MeView(APIView):
    def get(self, request):
        user = User.objects.filter(id=request.ctx.user_id, is_active=True).first()
        if not user:
            raise DomainError("unknown_user", "User not found", status=401)
        return Response(user.public())


class LogoutView(APIView):
    def post(self, request):
        claims = read_token(bearer(request))
        Session.objects.filter(jti=claims["jti"], revoked_at__isnull=True).update(revoked_at=timezone.now())
        LoginEvent.objects.create(username=str(claims.get("sub")), outcome="logout", ip=client_ip(request))
        return Response({"ok": True})


class ChangePasswordView(APIView):
    def post(self, request):
        user = User.objects.get(id=request.ctx.user_id)
        if not check_password(str(request.data.get("current", "")), user.password):
            raise DomainError("invalid_credentials", "Current password is incorrect", status=400)
        new = str(request.data.get("new", ""))
        validate_password(new, user.username)
        user.password, user.must_change_password = hash_password(new), False
        user.save(update_fields=["password", "must_change_password"])
        keep = read_token(bearer(request))["jti"]
        user.sessions.filter(revoked_at__isnull=True).exclude(jti=keep).update(revoked_at=timezone.now())  # sign out other devices
        return Response({"ok": True})


class UserList(APIView):
    permission_classes = [roles_allowed()]  # Administrator only

    def get(self, request):
        return Response([u.public() for u in User.objects.filter(tenant_id=request.ctx.tenant_id)])

    def post(self, request):
        d = request.data
        username = str(d.get("username", "")).strip().lower()
        if not username or not str(d.get("fullName", "")).strip():
            raise DomainError("invalid_payload", "Username and full name are required", status=400)
        if d.get("role") not in ROLES:
            raise DomainError("invalid_role", "Unknown role", status=400)
        if User.objects.filter(username=username).exists():
            raise DomainError("duplicate_user", "That username is taken", status=409)
        validate_password(str(d.get("password", "")), username)
        u = User.objects.create(tenant_id=request.ctx.tenant_id, username=username, full_name=d["fullName"].strip(), email=d.get("email", ""), role=d["role"],
                                branch=str(d.get("branch", "")).strip(), zone=str(d.get("zone", "")).strip(), password=hash_password(d["password"]), must_change_password=True)
        return Response(u.public(), status=201)


class UserDetail(APIView):
    permission_classes = [roles_allowed()]

    def patch(self, request, pk):
        u = User.objects.filter(id=pk, tenant_id=request.ctx.tenant_id).first()
        if not u:
            raise DomainError("not_found", "User not found", status=404)
        d = request.data
        if "role" in d:
            if d["role"] not in ROLES:
                raise DomainError("invalid_role", "Unknown role", status=400)
            u.role = d["role"]
        if "fullName" in d:
            u.full_name = str(d["fullName"]).strip()
        for f in ("branch", "zone"):
            if f in d:
                setattr(u, f, str(d[f]).strip())
        if "email" in d:
            u.email = d["email"]
        if "isActive" in d:
            if str(u.id) == request.ctx.user_id and not d["isActive"]:
                raise DomainError("self_deactivate", "You cannot deactivate your own account", status=409)
            u.is_active = bool(d["isActive"])
        if d.get("unlock"):
            u.locked_until, u.failed_attempts = None, 0
        if d.get("password"):
            validate_password(str(d["password"]), u.username)
            u.password, u.must_change_password = hash_password(d["password"]), True
        u.save()
        if "role" in d or d.get("password") or not u.is_active:
            u.sessions.filter(revoked_at__isnull=True).update(revoked_at=timezone.now())  # force re-login with the new rights
        return Response(u.public())


class SecurityLog(APIView):
    permission_classes = [roles_allowed()]

    def get(self, request):
        return Response([{"at": e.at, "username": e.username, "outcome": e.outcome, "ip": e.ip} for e in LoginEvent.objects.all()[:100]])
