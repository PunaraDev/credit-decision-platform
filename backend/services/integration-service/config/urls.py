from django.http import JsonResponse
from django.urls import include, path

urlpatterns = [
    path("health", lambda r: JsonResponse({"status": "ok", "service": "integration-service", "mode": __import__("django.conf").conf.settings.INTEGRATION_MODE})),
    path("api/v1/", include("integrations.urls")),
]
