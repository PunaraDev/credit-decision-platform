import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
DEBUG = os.environ.get("DJANGO_DEBUG", "0") == "1"
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-change-me")
if not DEBUG and SECRET_KEY == "dev-only-change-me":
    raise ImproperlyConfigured("Set DJANGO_SECRET_KEY when DJANGO_DEBUG=0")
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "*").split(",")

INSTALLED_APPS = ["django.contrib.contenttypes", "django.contrib.auth", "rest_framework", "identity"]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "creditcommon.context.RequestContextMiddleware",
]
ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
TEMPLATES = []

# Each service owns its database. SQLite is used only when POSTGRES_HOST is not set (local tests).
if os.environ.get("POSTGRES_HOST"):
    DATABASES = {"default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB", "identity-service"),
        "USER": os.environ.get("POSTGRES_USER", "credit"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "credit"),
        "HOST": os.environ["POSTGRES_HOST"],
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
        "CONN_MAX_AGE": 60,
    }}
else:
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
TIME_ZONE = "Asia/Colombo"
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["creditcommon.permissions.HasContext"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "EXCEPTION_HANDLER": "creditcommon.errors.exception_handler",
    "UNAUTHENTICATED_USER": None,
}
SERVICE_URLS = {
    "decision": os.environ.get("DECISION_SERVICE_URL", "http://localhost:8002"),
    "integration": os.environ.get("INTEGRATION_SERVICE_URL", "http://localhost:8003"),
}

JWT_SECRET = os.environ.get("JWT_SECRET", SECRET_KEY)
SESSION_HOURS = int(os.environ.get("SESSION_HOURS", "8"))
LOCKOUT_ATTEMPTS = int(os.environ.get("LOCKOUT_ATTEMPTS", "5"))
LOCKOUT_MINUTES = int(os.environ.get("LOCKOUT_MINUTES", "15"))
DEFAULT_TENANT_ID = os.environ.get("DEFAULT_TENANT_ID", "00000000-0000-0000-0000-000000000001")
PASSWORD_HASHERS = ["django.contrib.auth.hashers.PBKDF2PasswordHasher"]
