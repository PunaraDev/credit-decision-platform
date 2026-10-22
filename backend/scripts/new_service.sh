#!/usr/bin/env bash
# Usage: scripts/new_service.sh <service-name> <port> <django-app>
# Scaffolds a Django service wired to the shared library, per-service Postgres DB and Docker build.
set -euo pipefail
S=$1; PORT=$2; A=$3
mkdir -p services/$S/config services/$S/$A
cat > services/$S/manage.py <<EOF
#!/usr/bin/env python
import os, sys

if __name__ == "__main__":
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)
EOF
touch services/$S/config/__init__.py services/$S/$A/__init__.py
cat > services/$S/config/wsgi.py <<EOF
import os
from django.core.wsgi import get_wsgi_application
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
application = get_wsgi_application()
EOF
cat > services/$S/config/settings.py <<EOF
import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
DEBUG = os.environ.get("DJANGO_DEBUG", "0") == "1"
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-change-me")
if not DEBUG and SECRET_KEY == "dev-only-change-me":
    raise ImproperlyConfigured("Set DJANGO_SECRET_KEY when DJANGO_DEBUG=0")
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "*").split(",")

INSTALLED_APPS = ["django.contrib.contenttypes", "django.contrib.auth", "rest_framework", "$A"]
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
        "NAME": os.environ.get("POSTGRES_DB", "$S"),
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
EOF
cat > services/$S/requirements.txt <<EOF
Django==5.1.1
djangorestframework==3.15.2
gunicorn==23.0.0
psycopg[binary]==3.2.1
requests==2.32.3
PyJWT==2.9.0
EOF
cat > services/$S/Dockerfile <<EOF
# Build context is ./backend  (see infrastructure/docker-compose.yml)
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /srv
COPY shared /srv/shared
RUN pip install --no-cache-dir /srv/shared
COPY services/$S/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/$S /srv/app
WORKDIR /srv/app
RUN useradd -r -u 10001 app && mkdir -p /data/uploads && chown -R app /data /srv/app
USER app
EXPOSE $PORT
CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn config.wsgi:application -b 0.0.0.0:$PORT --workers 3 --timeout 60 --access-logfile -"]
EOF
echo "scaffolded $S"
