from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from creditcommon.permissions import roles_allowed

from .adapters import get_adapter, send_sms
from .models import IntegrationEvent


class Base(APIView):
    adapter_name = ""
    operation = ""
    permission_classes = [roles_allowed("Customer", "Marketing Officer", "Compliance Officer", "Valuer", "Credit Officer")]
    serializer: type[serializers.Serializer]

    def call(self, adapter, data):
        raise NotImplementedError

    def loggable(self, data):
        """What is written to the audit log. Override when the request holds a secret."""
        return data

    def post(self, request):
        s = self.serializer(data=request.data)
        s.is_valid(raise_exception=True)
        key = request.headers.get("Idempotency-Key", "")
        ctx = request.ctx
        if key:
            prior = IntegrationEvent.objects.filter(tenant_id=ctx.tenant_id, idempotency_key=key, adapter=self.adapter_name, status="ok").first()
            if prior:
                return Response(prior.response)
        result = self.call(get_adapter(), s.validated_data)
        IntegrationEvent.objects.create(tenant_id=ctx.tenant_id, adapter=self.adapter_name, operation=self.operation, idempotency_key=key,
                                        request=self.loggable(s.validated_data), response=result, correlation_id=ctx.correlation_id)
        return Response(result)


class NicS(serializers.Serializer):
    nic = serializers.RegexField(r"^(\d{9}[VvXx]|\d{12})$")


class ErpSearch(Base):
    adapter_name, operation, serializer = "erp", "search", NicS
    def call(self, a, d): return a.erp_search(d["nic"])


class CribInquiry(Base):
    adapter_name, operation, serializer = "crib", "inquiry", NicS
    def call(self, a, d): return a.crib_inquiry(d["nic"])  # caller (workflow-service) must have verified CRIB consent first


class ScreeningRun(Base):
    class S(serializers.Serializer):
        name = serializers.CharField(min_length=2)
    adapter_name, operation, serializer = "screening", "run", S
    permission_classes = [roles_allowed("Compliance Officer", "Marketing Officer")]
    def call(self, a, d): return a.screening(d["name"])


class FourNSend(Base):
    class S(serializers.Serializer):
        appId = serializers.CharField()
    adapter_name, operation, serializer = "fourn", "send", S
    def call(self, a, d): return a.fourn_send(d["appId"])


class SmsSend(Base):
    class S(serializers.Serializer):
        to = serializers.RegexField(r"^\+94[1-9]\d{8}$")
        message = serializers.CharField(max_length=480)
    adapter_name, operation, serializer = "sms", "send", S
    permission_classes = [roles_allowed("Customer", "Marketing Officer", "Compliance Officer")]
    def call(self, a, d): return send_sms(d["to"], d["message"])
    def loggable(self, d): return {"to": d["to"][:6] + "******" + d["to"][-2:], "message": "[not logged: it contains the customer's secure link]"}


class ValuationRequest(Base):
    class S(serializers.Serializer):
        vehicleNo = serializers.CharField()
        make = serializers.CharField()
        model = serializers.CharField(allow_blank=True, default="")
        yom = serializers.CharField()
    adapter_name, operation, serializer = "valuation", "request", S
    permission_classes = [roles_allowed("Marketing Officer", "Valuer")]
    def call(self, a, d): return a.valuation(d["vehicleNo"], d["make"], d["model"], d["yom"])


class ModeView(APIView):
    """GET /api/v1/integrations/mode  Lets the UI show whether results are simulated."""

    def get(self, request):
        from django.conf import settings
        return Response({"mode": settings.INTEGRATION_MODE})
