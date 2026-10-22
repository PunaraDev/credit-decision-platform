import uuid
from dataclasses import dataclass

DEV_TENANT = "00000000-0000-0000-0000-000000000001"

ROLES = [
    "Administrator", "Customer", "Marketing Officer", "Compliance Officer", "Valuer", "QA Officer",
    "Credit Officer", "Credit Approver", "Operations Officer",
]


@dataclass(frozen=True)
class Ctx:
    tenant_id: str
    user_id: str
    role: str
    correlation_id: str
    branch: str = ""
    zone: str = ""


class RequestContextMiddleware:
    """Builds request.ctx from headers set by the API gateway after it validates the OIDC token.

    In production the gateway strips any client-supplied X-User-* headers and injects verified values.
    With DEBUG=True missing headers fall back to a development identity so the UI can be exercised without Keycloak.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        from django.conf import settings

        h = request.headers
        dev = settings.DEBUG
        request.ctx = Ctx(
            tenant_id=h.get("X-Tenant-Id") or (DEV_TENANT if dev else ""),
            user_id=h.get("X-User-Id") or ("dev-user" if dev else ""),
            role=h.get("X-User-Role") or ("Administrator" if dev else ""),
            correlation_id=h.get("X-Correlation-Id") or str(uuid.uuid4()),
            branch=h.get("X-User-Branch", ""), zone=h.get("X-User-Zone", ""),
        )
        response = self.get_response(request)
        response["X-Correlation-Id"] = request.ctx.correlation_id
        return response
