import os
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from creditcommon.errors import DomainError

from . import services
from .models import Application, FileAsset


def visible(request):
    qs = Application.objects.filter(tenant_id=request.ctx.tenant_id)
    # Customer-role users only ever see applications they created; staff roles see the tenant's applications
    return qs.filter(created_by=request.ctx.user_id) if request.ctx.role == "Customer" else qs


def load(request, pk) -> Application:
    return get_object_or_404(visible(request), pk=pk)


class ApplicationList(APIView):
    def get(self, request):
        qs = visible(request)[:300]
        return Response([{**{k: v for k, v in services.to_json(a).items() if k != "stages"}, "summary": services.summary(a)} for a in qs])

    def post(self, request):
        app, created = services.create_application(request.ctx, request.data.get("product", ""), request.headers.get("Idempotency-Key", ""))
        return Response(services.to_json(app), status=201 if created else 200)


class ApplicationDetail(APIView):
    def get(self, request, pk):
        return Response(services.to_json(load(request, pk)))


class StageView(APIView):
    step = 0

    def save(self, request, pk):
        if not isinstance(request.data, dict):
            raise DomainError("invalid_payload", "JSON object expected", status=400)
        return Response(services.to_json(services.save_stage(load(request, pk), self.step, request.data, request.ctx)))

    patch = post = save


class AssessmentView(APIView):
    def post(self, request, pk):
        return Response(services.to_json(services.run_assessment(load(request, pk), request.ctx)))


class WalrView(APIView):
    def get(self, request, pk):
        return Response(services.walr(load(request, pk)))


class PricingView(APIView):
    def get(self, request, pk):
        app = load(request, pk)
        d = (app.stages.get("assessment") or {}).get("decision")
        if not d:
            raise DomainError("no_assessment", "No assessment has been run", status=404)
        return Response({k: d[k] for k in ("approvedRate", "floorRate", "requestedRate", "installment", "totalPayable", "financed", "modelVersion", "score", "outcome")})


class IntegrationView(APIView):
    def post(self, request, pk, name):
        app = services.run_integration(load(request, pk), name, request.ctx)
        app.refresh_from_db()  # includes email delivery recorded after the command committed
        return Response(services.to_json(app))


class TransitionView(APIView):
    def post(self, request, pk):
        app = services.do_action(load(request, pk), str(request.data.get("action", "")), request.data, request.ctx)
        app.refresh_from_db()
        return Response(services.to_json(app))


class DocumentView(APIView):
    def post(self, request, pk):
        return Response(services.to_json(services.document_action(load(request, pk), request.data, request.ctx)))


class TimelineView(APIView):
    def get(self, request, pk):
        app = load(request, pk)
        return Response([{"at": e.at, "actor": e.actor, "role": e.role, "action": e.action, "detail": e.detail, "correlationId": e.correlation_id} for e in app.events.all()[:200]])


class FileUpload(APIView):
    """POST multipart: file + label. Validates size, extension and content signature."""

    def post(self, request, pk):
        up = request.FILES.get("file")
        if not up:
            raise DomainError("invalid_payload", "A 'file' part is required", status=400)
        a = services.store_file(load(request, pk), up, request.data.get("label", "document"), request.ctx)
        return Response({"id": str(a.id), "name": a.original_name, "size": a.size, "contentType": a.content_type, "sha256": a.sha256}, status=201)


class FileDownload(APIView):
    def get(self, request, fid):
        a = get_object_or_404(FileAsset, pk=fid, tenant_id=request.ctx.tenant_id)
        if not os.path.exists(a.storage_path):
            raise DomainError("file_missing", "Stored file is missing", status=404)
        r = FileResponse(open(a.storage_path, "rb"), content_type=a.content_type, as_attachment=True, filename=a.original_name)
        r["X-Content-Type-Options"] = "nosniff"
        return r


class ReviewPublic(APIView):
    """Customer-facing, unauthenticated, token-protected (the customer's 4N review link)."""
    permission_classes = [AllowAny]

    def get(self, request, token):
        return Response(services.review_view(token))

    def post(self, request, token):
        ip = request.headers.get("X-Real-IP") or request.META.get("REMOTE_ADDR", "")
        return Response(services.review_confirm(token, request.data, ip))
