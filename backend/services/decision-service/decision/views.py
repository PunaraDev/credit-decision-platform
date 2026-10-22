from rest_framework.response import Response
from rest_framework.views import APIView

from creditcommon.permissions import roles_allowed

from . import engine
from .policy import POLICY
from .models import AssessmentRecord
from .serializers import AssessRequest, ScheduleRequest


class AssessView(APIView):
    """POST /api/v1/decisions/assess  Run the rules-based assessment and persist it."""
    permission_classes = [roles_allowed("Marketing Officer", "Credit Officer", "Credit Approver")]

    def post(self, request):
        s = AssessRequest(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        crib = d.get("crib") or {}
        result = engine.assess(engine.Inputs(
            income=d["income"], obligations=d["obligations"], collateral_value=d["collateralValue"], net_facility=d["netFacility"],
            capitalized_charges=d["capitalizedCharges"], down_payment=d["downPayment"], lump_sum=d["lumpSum"], tenor=d["tenor"],
            requested_rate=d["requestedRate"], screening_clear=d["screeningClear"], years_of_service=d["yearsOfService"], guarantor=d["guarantor"],
            crib_status=crib.get("status", "idle"), crib_score=crib.get("score"), crib_arrears=crib.get("arrears", False),
        ))
        AssessmentRecord.objects.create(
            tenant_id=request.ctx.tenant_id, application_id=d["applicationId"], model_version=result["modelVersion"],
            inputs=request.data, result=result, created_by=request.ctx.user_id, correlation_id=request.ctx.correlation_id,
        )
        return Response(result)


class ScheduleView(APIView):
    """POST /api/v1/decisions/schedule  Reducing-balance repayment schedule."""

    def post(self, request):
        s = ScheduleRequest(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        rows = engine.schedule(d["principal"], d["annualRate"], d["months"], d["balloon"])
        return Response({"installment": engine.pmt(d["principal"], d["annualRate"], d["months"], d["balloon"]), "rows": rows})


class HistoryView(APIView):
    """GET /api/v1/decisions/history/<application_id>  Past assessments for explanation and audit."""

    def get(self, request, application_id):
        qs = AssessmentRecord.objects.filter(tenant_id=request.ctx.tenant_id, application_id=application_id)[:20]
        return Response([{"id": str(r.id), "createdAt": r.created_at, "by": r.created_by, "result": r.result} for r in qs])


class PolicyView(APIView):
    """GET /api/v1/decisions/policy  The active, versioned policy parameters (read-only)."""

    def get(self, request):
        return Response({**POLICY, "risk_adjustments": [{"minScore": m, "adjustment": a} for m, a in POLICY["risk_adjustments"]]})
