import uuid
from django.db import models


class IntegrationEvent(models.Model):
    """Audit log of every outbound call. The idempotency key makes retries safe."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=64, db_index=True)
    adapter = models.CharField(max_length=32)
    operation = models.CharField(max_length=64)
    idempotency_key = models.CharField(max_length=128, blank=True, db_index=True)
    request = models.JSONField()
    response = models.JSONField(null=True)
    status = models.CharField(max_length=16, default="ok")
    correlation_id = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
