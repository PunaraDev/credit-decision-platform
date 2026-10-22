from django.test import TestCase
from rest_framework.test import APIClient

from .models import User
from .security import hash_password

PW = "Str0ngPassw0rd!"


class AuthTests(TestCase):
    def setUp(self):
        self.c = APIClient()
        self.admin = User.objects.create(tenant_id="t1", username="admin", full_name="Admin", role="Administrator", password=hash_password(PW), must_change_password=False)
        User.objects.create(tenant_id="t1", username="officer", full_name="Officer", role="Marketing Officer", password=hash_password(PW))

    def login(self, u="admin", p=PW):
        return self.c.post("/api/v1/auth/login", {"username": u, "password": p}, format="json")

    def test_login_verify_logout_revokes_token(self):
        r = self.login(); self.assertEqual(r.status_code, 200)
        tok = r.json()["accessToken"]
        v = self.c.get("/api/v1/auth/verify", HTTP_AUTHORIZATION=f"Bearer {tok}")
        self.assertEqual((v.status_code, v["X-User-Role"], v["X-Tenant-Id"]), (200, "Administrator", "t1"))
        h = dict(HTTP_X_USER_ID=str(self.admin.id), HTTP_X_USER_ROLE="Administrator", HTTP_X_TENANT_ID="t1", HTTP_AUTHORIZATION=f"Bearer {tok}")
        self.assertEqual(self.c.post("/api/v1/auth/logout", **h).status_code, 200)
        self.assertEqual(self.c.get("/api/v1/auth/verify", HTTP_AUTHORIZATION=f"Bearer {tok}").status_code, 401)

    def test_bad_password_is_generic_and_locks_after_five(self):
        for _ in range(5):
            r = self.login(p="wrong")
            self.assertEqual(r.json()["error"]["message"], "Invalid username or password")
        self.assertEqual(self.login().status_code, 423)  # correct password still refused while locked

    def test_unknown_user_looks_identical(self):
        self.assertEqual(self.login("nobody").json()["error"]["message"], "Invalid username or password")

    def test_tampered_or_missing_token_rejected(self):
        self.assertEqual(self.c.get("/api/v1/auth/verify").status_code, 401)
        self.assertEqual(self.c.get("/api/v1/auth/verify", HTTP_AUTHORIZATION="Bearer abc.def.ghi").status_code, 401)

    def test_user_admin_requires_administrator_and_enforces_policy(self):
        hdr = lambda role: dict(HTTP_X_USER_ID=str(self.admin.id), HTTP_X_USER_ROLE=role, HTTP_X_TENANT_ID="t1")
        body = {"username": "newuser", "fullName": "New User", "role": "Valuer", "password": "Passw0rdXYZ12"}
        self.assertEqual(self.c.post("/api/v1/auth/users", body, format="json", **hdr("Valuer")).status_code, 403)
        self.assertEqual(self.c.post("/api/v1/auth/users", {**body, "password": "short1"}, format="json", **hdr("Administrator")).status_code, 400)
        self.assertEqual(self.c.post("/api/v1/auth/users", body, format="json", **hdr("Administrator")).status_code, 201)
        self.assertEqual(self.c.post("/api/v1/auth/users", body, format="json", **hdr("Administrator")).status_code, 409)

    def test_role_change_revokes_sessions(self):
        tok = self.login("officer").json()["accessToken"]
        uid = User.objects.get(username="officer").id
        self.c.patch(f"/api/v1/auth/users/{uid}", {"role": "Valuer"}, format="json", HTTP_X_USER_ID=str(self.admin.id), HTTP_X_USER_ROLE="Administrator", HTTP_X_TENANT_ID="t1")
        self.assertEqual(self.c.get("/api/v1/auth/verify", HTTP_AUTHORIZATION=f"Bearer {tok}").status_code, 401)

    def test_change_password_policy_and_flag(self):
        u = User.objects.get(username="officer")
        tok = self.login("officer").json()["accessToken"]
        h = dict(HTTP_X_USER_ID=str(u.id), HTTP_X_USER_ROLE=u.role, HTTP_X_TENANT_ID="t1", HTTP_AUTHORIZATION=f"Bearer {tok}")
        bad = self.c.post("/api/v1/auth/change-password", {"current": PW, "new": "alllettersss"}, format="json", **h)
        self.assertEqual(bad.status_code, 400)
        ok = self.c.post("/api/v1/auth/change-password", {"current": PW, "new": "NewPassw0rd99"}, format="json", **h)
        self.assertEqual(ok.status_code, 200)
        u.refresh_from_db(); self.assertFalse(u.must_change_password)

    def test_first_login_password_change_is_enforced_at_the_gateway_check(self):
        tok = self.login("officer").json()["accessToken"]  # officer.must_change_password is True
        auth = dict(HTTP_AUTHORIZATION=f"Bearer {tok}")
        self.assertEqual(self.c.get("/api/v1/auth/verify", HTTP_X_ORIGINAL_URI="/api/v1/applications", **auth).status_code, 403)
        self.assertEqual(self.c.get("/api/v1/auth/verify", HTTP_X_ORIGINAL_URI="/api/v1/auth/change-password", **auth).status_code, 200)
