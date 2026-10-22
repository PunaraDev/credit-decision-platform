from django.http import JsonResponse
from django.urls import include, path

urlpatterns = [
    path("health", lambda r: JsonResponse({"status": "ok", "service": "decision-service"})),
    path("api/v1/", include("decision.urls")),
]
