import uuid
from django.db import models
from django.utils import timezone


class User(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=64, db_index=True)
    username = models.CharField(max_length=64)
    full_name = models.CharField(max_length=128)
    email = models.EmailField(blank=True)
    role = models.CharField(max_length=32)
    branch = models.CharField(max_length=64, blank=True)
    zone = models.CharField(max_length=64, blank=True)
    password = models.CharField(max_length=256)
    is_active = models.BooleanField(default=True)
    must_change_password = models.BooleanField(default=True)
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    last_login = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["full_name"]
        constraints = [models.UniqueConstraint(fields=["username"], name="uniq_username")]

    @property
    def locked(self) -> bool:
        return bool(self.locked_until and self.locked_until > timezone.now())

    def public(self) -> dict:
        return {"id": str(self.id), "username": self.username, "fullName": self.full_name, "email": self.email, "role": self.role, "branch": self.branch, "zone": self.zone,
                "isActive": self.is_active, "mustChangePassword": self.must_change_password, "lastLogin": self.last_login, "tenantId": self.tenant_id}


class Session(models.Model):
    """One row per login. Logout and admin actions revoke it, which invalidates the JWT immediately."""
    jti = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sessions")
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    ip = models.CharField(max_length=64, blank=True)
    user_agent = models.CharField(max_length=256, blank=True)


class LoginEvent(models.Model):
    """Append-only security log: successes, failures, lockouts, logouts."""
    at = models.DateTimeField(auto_now_add=True)
    username = models.CharField(max_length=64)
    outcome = models.CharField(max_length=24)
    ip = models.CharField(max_length=64, blank=True)

    class Meta:
        ordering = ["-at"]
