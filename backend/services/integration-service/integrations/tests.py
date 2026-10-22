import os
from unittest import mock

import requests
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import IntegrationEvent

H = {"HTTP_X_TENANT_ID": "t1", "HTTP_X_USER_ID": "u1", "HTTP_X_USER_ROLE": "Marketing Officer"}


class IntegrationTests(TestCase):
    def test_crib_inquiry_is_logged_and_idempotent(self):
        c = APIClient()
        r1 = c.post("/api/v1/integrations/crib/inquiry", {"nic": "199957702612"}, format="json", HTTP_IDEMPOTENCY_KEY="k1", **H)
        r2 = c.post("/api/v1/integrations/crib/inquiry", {"nic": "199957702612"}, format="json", HTTP_IDEMPOTENCY_KEY="k1", **H)
        self.assertEqual(r1.json(), r2.json())
        self.assertEqual(IntegrationEvent.objects.count(), 1)

    def test_invalid_nic_rejected(self):
        r = APIClient().post("/api/v1/integrations/erp/search", {"nic": "123"}, format="json", **H)
        self.assertEqual(r.status_code, 400)
        self.assertIn("error", r.json())

    def test_valuation_role_enforced(self):
        r = APIClient().post("/api/v1/integrations/valuation/request", {"vehicleNo": "CAB-1", "make": "SUZUKI", "yom": "2018"}, format="json",
                             HTTP_X_TENANT_ID="t1", HTTP_X_USER_ID="u", HTTP_X_USER_ROLE="Customer")
        self.assertEqual(r.status_code, 403)


@override_settings(INTEGRATION_MODE="mock", SMS_MODE="sandbox")
class SmsTests(TestCase):
    payload = {"to": "+94771234567", "message": "OriginIQ: https://example.com/#/review/private-token"}

    def send(self, payload=None, **headers):
        return APIClient().post("/api/v1/integrations/sms/send", self.payload if payload is None else payload,
                                format="json", **{**H, **headers})

    @mock.patch("requests.post")
    def test_sandbox_sends_nothing_and_redacts_audit(self, post):
        response = self.send()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["simulated"])
        post.assert_not_called()
        event = IntegrationEvent.objects.get()
        self.assertEqual((event.adapter, event.operation), ("sms", "send"))
        self.assertNotIn(self.payload["to"], str(event.request))
        self.assertNotIn("private-token", str(event.request))
        self.assertIn("[not logged:", event.request["message"])

    @override_settings(SMS_MODE="notifylk")
    @mock.patch.dict(os.environ, {"NOTIFYLK_USER_ID": "test-user", "NOTIFYLK_API_KEY": "test-key", "NOTIFYLK_SENDER_ID": "OriginIQ"})
    @mock.patch("requests.post")
    def test_live_sms_works_with_other_integrations_on_mock_and_is_idempotent(self, post):
        post.return_value.status_code = 200
        post.return_value.json.return_value = {"status": "success", "data": "Sent"}
        first = self.send(HTTP_IDEMPOTENCY_KEY="sms-1")
        second = self.send(HTTP_IDEMPOTENCY_KEY="sms-1")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json(), {"status": "sent", "messageId": "", "simulated": False})
        self.assertEqual(first.json(), second.json())
        post.assert_called_once_with("https://app.notify.lk/api/v1/send", data={
            "user_id": "test-user", "api_key": "test-key", "sender_id": "OriginIQ",
            "to": "94771234567", "message": self.payload["message"],
        }, timeout=15)
        self.assertEqual(IntegrationEvent.objects.count(), 1)

    @mock.patch("requests.post")
    def test_invalid_number_or_message_rejected_before_sending(self, post):
        for payload in (
            {**self.payload, "to": "0771234567"},
            {**self.payload, "to": "+94071234567"},
            {**self.payload, "message": ""},
            {**self.payload, "message": "x" * 481},
        ):
            with self.subTest(payload=payload):
                self.assertEqual(self.send(payload).status_code, 400)
        post.assert_not_called()
        self.assertFalse(IntegrationEvent.objects.exists())

    def test_sms_roles_enforced(self):
        for role in ("Customer", "Marketing Officer", "Compliance Officer", "Administrator"):
            self.assertEqual(self.send(HTTP_X_USER_ROLE=role).status_code, 200)
        for role in ("Valuer", "Credit Officer", "Operations Officer"):
            self.assertEqual(self.send(HTTP_X_USER_ROLE=role).status_code, 403)

    @override_settings(SMS_MODE="notifylk")
    @mock.patch.dict(os.environ, {"NOTIFYLK_USER_ID": "", "NOTIFYLK_API_KEY": "", "NOTIFYLK_SENDER_ID": ""})
    @mock.patch("requests.post")
    def test_missing_credentials_reported_without_sending(self, post):
        response = self.send()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["error"]["code"], "connector_not_configured")
        post.assert_not_called()

    @override_settings(SMS_MODE="notifylk")
    @mock.patch.dict(os.environ, {"NOTIFYLK_USER_ID": "test-user", "NOTIFYLK_API_KEY": "secret-key", "NOTIFYLK_SENDER_ID": "OriginIQ"})
    @mock.patch("requests.post")
    def test_provider_rejection_and_network_failures_are_sanitized(self, post):
        post.return_value.status_code = 200
        post.return_value.json.return_value = {"status": "error", "message": "secret-key"}
        rejected = self.send()
        self.assertEqual(rejected.status_code, 502)
        self.assertNotIn("secret-key", str(rejected.json()))
        post.return_value.status_code = 500
        post.return_value.json.return_value = {"status": "success"}
        self.assertEqual(self.send().status_code, 502)
        post.side_effect = requests.Timeout("private-token")
        failed = self.send()
        self.assertEqual(failed.status_code, 502)
        self.assertNotIn("private-token", str(failed.json()))
        post.side_effect = None
        post.return_value.json.side_effect = ValueError("invalid json")
        self.assertEqual(self.send().status_code, 502)
        self.assertFalse(IntegrationEvent.objects.exists())

    @override_settings(SMS_MODE="unknown")
    @mock.patch("requests.post")
    def test_unknown_sms_mode_is_not_silently_simulated(self, post):
        self.assertEqual(self.send().status_code, 503)
        post.assert_not_called()
