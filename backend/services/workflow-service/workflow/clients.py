"""HTTP clients for sibling services. Kept in one module so tests can patch it and so retries/circuit-breaking can be added in one place."""
import requests
from django.conf import settings

from creditcommon.errors import DomainError

TIMEOUT = 10
INTEGRATION_PATHS = {
    "erp": "/api/v1/integrations/erp/search", "crib": "/api/v1/integrations/crib/inquiry", "screening": "/api/v1/integrations/screening/run",
    "fourn": "/api/v1/integrations/fourn/send", "valuation": "/api/v1/integrations/valuation/request", "sms": "/api/v1/integrations/sms/send",
}


def _post(base: str, path: str, payload: dict, ctx, idem: str = ""):
    headers = {"X-Tenant-Id": ctx.tenant_id, "X-User-Id": ctx.user_id, "X-User-Role": ctx.role, "X-Correlation-Id": ctx.correlation_id}
    if idem:
        headers["Idempotency-Key"] = idem
    try:
        r = requests.post(base + path, json=payload, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as exc:
        raise DomainError("upstream_unavailable", f"Service call failed: {exc.__class__.__name__}", status=502)
    if r.status_code >= 400:
        raise DomainError("upstream_error", "Upstream service rejected the request", [r.text[:300]], status=502)
    return r.json()


def integration(name: str, payload: dict, ctx, idem: str = ""):
    return _post(settings.SERVICE_URLS["integration"], INTEGRATION_PATHS[name], payload, ctx, idem)


def assess(payload: dict, ctx):
    return _post(settings.SERVICE_URLS["decision"], "/api/v1/decisions/assess", payload, ctx)


def schedule(payload: dict, ctx):
    return _post(settings.SERVICE_URLS["decision"], "/api/v1/decisions/schedule", payload, ctx)
