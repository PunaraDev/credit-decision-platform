.PHONY: up down logs test e2e
up:      ; docker compose --env-file .env -f infrastructure/docker-compose.yml up --build -d
down:    ; docker compose --env-file .env -f infrastructure/docker-compose.yml down
logs:    ; docker compose --env-file .env -f infrastructure/docker-compose.yml logs -f --tail=100
test:
	@for s in identity workflow decision integration; do (cd backend/services/$$s-service && DJANGO_SECRET_KEY=test PYTHONPATH=../../shared python manage.py test --noinput) || exit 1; done
# Needs a running stack with SEED_DEMO_USERS=1. Set E2E_ADMIN_PASSWORD / E2E_DEMO_PASSWORD to the values in .env
e2e:     ; python3 backend/scripts/e2e.py
