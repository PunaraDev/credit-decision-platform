from django.http import JsonResponse
from django.urls import include, path

urlpatterns = [
    path("health", lambda r: JsonResponse({"status": "ok", "service": "identity-service"})),
    path("api/v1/", include("identity.urls")),
]
