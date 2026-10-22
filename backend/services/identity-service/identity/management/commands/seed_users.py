import os
import secrets

from django.conf import settings
from django.core.management.base import BaseCommand

from identity.models import User
from identity.security import hash_password, validate_password

DEMO = [("marketing", "Marketing Officer", "Marketing Officer"), ("compliance", "Compliance Officer", "Compliance Officer"), ("valuer", "Valuer", "Valuer"),
        ("qa", "QA Officer", "QA Officer"), ("creditofficer", "Credit Officer", "Credit Officer"), ("approver", "Credit Approver", "Credit Approver"),
        ("operations", "Operations Officer", "Operations Officer"), ("customer", "Customer (sample)", "Customer")]


class Command(BaseCommand):
    help = "Create the first administrator (ADMIN_PASSWORD) and, optionally, one sample user per role (SEED_DEMO_USERS=1)."

    def handle(self, *a, **kw):
        pw = os.environ.get("ADMIN_PASSWORD") or secrets.token_urlsafe(12) + "9a"
        generated = not os.environ.get("ADMIN_PASSWORD")
        validate_password(pw, "admin")
        if not User.objects.filter(username="admin").exists():
            User.objects.create(tenant_id=settings.DEFAULT_TENANT_ID, username="admin", full_name="System Administrator", role="Administrator", branch="Head Office", zone="Western", password=hash_password(pw), must_change_password=True)
            self.stdout.write(self.style.SUCCESS(f"Created admin. {'Generated password: ' + pw if generated else 'Password taken from ADMIN_PASSWORD.'} (change required at first login)"))
        if os.environ.get("SEED_DEMO_USERS") == "1":
            dpw = os.environ.get("DEMO_USER_PASSWORD") or pw
            for username, name, role in DEMO:
                if not User.objects.filter(username=username).exists():
                    User.objects.create(tenant_id=settings.DEFAULT_TENANT_ID, username=username, full_name=name, role=role, branch="Colombo Main", zone="Western", password=hash_password(dpw), must_change_password=True)
            self.stdout.write("Sample users ensured (one per role).")
