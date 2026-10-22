import uuid
from django.db import models


class AssessmentRecord(models.Model):
    """Every assessment is stored with inputs, outputs and model version so decisions can be explained and audited later."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=64, db_index=True)
    application_id = models.CharField(max_length=64, db_index=True)
    model_version = models.CharField(max_length=64)
    inputs = models.JSONField()
    result = models.JSONField()
    created_by = models.CharField(max_length=128)
    correlation_id = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
