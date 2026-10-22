import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DEBUG = os.environ.get("DJANGO_DEBUG", "0") == "1"
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-change-me")
if not DEBUG and SECRET_KEY == "dev-only-change-me":
    from django.core.exceptions import ImproperlyConfigured
    raise ImproperlyConfigured("Set DJANGO_SECRET_KEY when DJANGO_DEBUG=0")
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "*").split(",")

INSTALLED_APPS = [
    "django.contrib.contenttypes", "django.contrib.auth",
    "rest_framework", "workflow",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "creditcommon.context.RequestContextMiddleware",
]
ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
TEMPLATES = []

# Each service owns its database. Falls back to SQLite for local runs and tests.
if os.environ.get("POSTGRES_HOST"):
    DATABASES = {"default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB", "workflow-service"),
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

PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8080")
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", str(BASE_DIR / "uploads")))
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "10"))
REVIEW_LINK_DAYS = int(os.environ.get("REVIEW_LINK_DAYS", "7"))
ENFORCE_MAKER_CHECKER = os.environ.get("ENFORCE_MAKER_CHECKER", "1") == "1"

# Customer review links use the lender's mailbox; credentials stay on the server.
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = os.environ.get("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
if EMAIL_HOST.endswith("gmail.com"):
    EMAIL_HOST_PASSWORD = EMAIL_HOST_PASSWORD.replace(" ", "")  # Google shows an App Password in groups of four; the spaces are not part of it
EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "1") == "1"
EMAIL_USE_SSL = os.environ.get("EMAIL_USE_SSL", "0") == "1"
EMAIL_TIMEOUT = int(os.environ.get("EMAIL_TIMEOUT", "10"))
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "") or EMAIL_HOST_USER
# TESTING ONLY. Links that point to localhost are normally not emailed or texted, because a customer's phone cannot open them.
# Set to 1 only to try the flow on your own computer, where you open the link yourself. Keep it 0 in real use.
REVIEW_ALLOW_LOCAL_LINKS = os.environ.get("REVIEW_ALLOW_LOCAL_LINKS", "0") == "1"
