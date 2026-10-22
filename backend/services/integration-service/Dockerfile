# Build context is ./backend  (see infrastructure/docker-compose.yml)
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /srv
COPY shared /srv/shared
RUN pip install --no-cache-dir /srv/shared
COPY services/integration-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/integration-service /srv/app
WORKDIR /srv/app
RUN useradd -r -u 10001 app && mkdir -p /data/uploads && chown -R app /data /srv/app
USER app
EXPOSE 8003
CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn config.wsgi:application -b 0.0.0.0:8003 --workers 3 --timeout 60 --access-logfile -"]
