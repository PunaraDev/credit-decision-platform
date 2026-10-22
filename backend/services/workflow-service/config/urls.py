from django.http import JsonResponse
from django.urls import include, path

urlpatterns = [
    path("health", lambda r: JsonResponse({"status": "ok", "service": "workflow-service"})),
    path("api/v1/", include("workflow.urls")),
]
