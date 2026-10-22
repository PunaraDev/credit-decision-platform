from rest_framework.views import exception_handler as drf_handler


class DomainError(Exception):
    """Raised for business-rule violations. Rendered as the standard error contract."""

    def __init__(self, code: str, message: str, details=None, status=409):
        super().__init__(message)
        self.code, self.message, self.details, self.status = code, message, details or [], status


def exception_handler(exc, context):
    from rest_framework.response import Response

    if isinstance(exc, DomainError):
        cid = getattr(getattr(context["request"], "ctx", None), "correlation_id", None)
        return Response({"error": {"code": exc.code, "message": exc.message, "details": exc.details, "correlationId": cid}}, status=exc.status)
    resp = drf_handler(exc, context)
    if resp is not None:
        cid = getattr(getattr(context["request"], "ctx", None), "correlation_id", None)
        resp.data = {"error": {"code": "request_error", "message": "Request could not be processed", "details": resp.data, "correlationId": cid}}
    return resp
