import uuid
from django.db import models


class Application(models.Model):
    """Aggregate root for the seven-stage journey. Stage data lives in `stages` keyed by stage name;
    heavy domains (customer master, documents) can be split into their own services without changing the API."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=64, db_index=True)
    reference = models.CharField(max_length=32)
    product = models.CharField(max_length=24)
    status = models.CharField(max_length=32, default="Draft")
    current_step = models.PositiveSmallIntegerField(default=1)
    completed_steps = models.JSONField(default=list)
    stages = models.JSONField(default=dict)
    version = models.PositiveIntegerField(default=1)  # optimistic concurrency; incremented on every write
    idempotency_key = models.CharField(max_length=128, blank=True)
    created_by = models.CharField(max_length=128)
    branch = models.CharField(max_length=64, blank=True)
    zone = models.CharField(max_length=64, blank=True)
    assigned_to = models.CharField(max_length=128, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["tenant_id", "reference"], name="uniq_reference_per_tenant"),
            models.UniqueConstraint(fields=["tenant_id", "idempotency_key"], condition=~models.Q(idempotency_key=""), name="uniq_idem_per_tenant"),
        ]


class AuditEvent(models.Model):
    """Append-only. Updates and deletes are blocked at the model level (add DB-level revoke in production)."""
    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name="events")
    at = models.DateTimeField(auto_now_add=True)
    actor = models.CharField(max_length=128)
    role = models.CharField(max_length=32)
    action = models.CharField(max_length=128)
    detail = models.TextField(blank=True)
    correlation_id = models.CharField(max_length=64, blank=True)

    class Meta:
        ordering = ["-at", "-id"]

    def save(self, *args, **kwargs):
        if self.pk:
            raise PermissionError("Audit events are immutable")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("Audit events are immutable")


class FileAsset(models.Model):
    """Uploaded evidence (KYC, CR, photos, documents). Stored on a volume or object store; metadata and hash kept here."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=64, db_index=True)
    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name="files")
    label = models.CharField(max_length=64)
    original_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=64)
    size = models.PositiveIntegerField()
    sha256 = models.CharField(max_length=64)
    storage_path = models.CharField(max_length=512)
    uploaded_by = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)


class ReviewToken(models.Model):
    """One-time customer review link (the customer's 4N channel). Only the hash is used for lookup."""
    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name="review_tokens")
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    revoked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
