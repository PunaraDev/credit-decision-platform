from unittest import mock

from django.test import SimpleTestCase

from creditcommon.errors import DomainError

from .review_email import customer_can_open_link
from .review_sms import send_review_sms, to_e164_lk


class ReviewSmsTests(SimpleTestCase):
    link = "https://credit.example.com/#/review/private-token"
    expires = "2026-10-29T10:00:00+00:00"

    def send(self, customer=None, link=None):
        return send_review_sms({"mobile": "0771234567"} if customer is None else customer,
                               "APP-2026-00001", self.link if link is None else link, self.expires, object())

    def test_sri_lankan_phone_formats_and_invalid_numbers(self):
        for raw in ("0771234567", "077 123 4567", "(077)-123-4567", "94771234567", "0094771234567", "+94771234567"):
            with self.subTest(raw=raw):
                self.assertEqual(to_e164_lk(raw), "+94771234567")
        for raw in (None, "", "invalid", "+44771234567", "077123456", "07712345678", "+940771234567"):
            with self.subTest(raw=raw):
                self.assertIsNone(to_e164_lk(raw))

    def test_link_validator_shared_by_email_and_sms(self):
        self.assertTrue(customer_can_open_link(self.link))
        for link in ("", "not-a-url", "http://localhost:8080", "http://app.localhost", "http://127.0.0.1",
                     "http://0.0.0.0", "http://[::1]", "http://[::]", "http://[", "ftp://example.com", "https://user:secret@example.com"):
            with self.subTest(link=link):
                self.assertFalse(customer_can_open_link(link))

    def test_local_link_override_keeps_other_url_restrictions(self):
        with self.settings(REVIEW_ALLOW_LOCAL_LINKS=True):
            for link in ("http://localhost:8080/#/review/test", "http://127.0.0.1", "http://[::1]"):
                with self.subTest(link=link):
                    self.assertTrue(customer_can_open_link(link))
            for link in ("ftp://localhost", "http://user:secret@localhost", "http://[", "", "not-a-url"):
                with self.subTest(link=link):
                    self.assertFalse(customer_can_open_link(link))

    @mock.patch("workflow.review_sms.clients.integration")
    def test_invalid_mobile_or_link_never_calls_gateway(self, integration):
        self.assertEqual(self.send(customer={})["status"], "missing_mobile")
        self.assertEqual(self.send(customer={"mobile": "123"})["status"], "invalid_mobile")
        self.assertEqual(self.send(link="http://localhost:8080")["status"], "invalid_link")
        integration.assert_not_called()

    @mock.patch("workflow.review_sms.clients.integration", return_value={"status": "sent", "simulated": True})
    def test_sandbox_is_reported_as_simulated(self, integration):
        result = self.send()
        self.assertEqual(result["status"], "simulated")
        self.assertNotIn("sentAt", result)

    @mock.patch("workflow.review_sms.clients.integration", return_value={"status": "sent", "simulated": False})
    def test_provider_acceptance_contains_reference_link_and_no_customer_details(self, integration):
        result = self.send(customer={"mobile": "0771234567", "fullName": "Private Name", "nic": "199957702612", "netIncome": "123456"})
        self.assertEqual(result["status"], "sent")
        self.assertEqual(result["recipient"], "+94771234567")
        self.assertIn("sentAt", result)
        name, payload, _ = integration.call_args.args
        self.assertEqual(name, "sms")
        self.assertEqual(payload["to"], "+94771234567")
        self.assertIn("APP-2026-00001", payload["message"])
        self.assertIn(self.link, payload["message"])
        self.assertIn("29 Oct 2026", payload["message"])
        for private in ("Private Name", "199957702612", "123456"):
            self.assertNotIn(private, payload["message"])

    @mock.patch("workflow.review_sms.clients.integration")
    def test_provider_failures_do_not_expose_secrets(self, integration):
        integration.side_effect = DomainError("upstream_error", "rejected", ['{"error":{"code":"connector_not_configured"}}'])
        self.assertEqual(self.send()["status"], "not_configured")
        for error in (DomainError("upstream_error", "secret-key", ["private-token"]), RuntimeError("private-token")):
            with self.subTest(error=type(error).__name__):
                integration.side_effect = error
                result = self.send()
                self.assertEqual(result["status"], "failed")
                self.assertNotIn("private-token", str(result))
                self.assertNotIn("secret-key", str(result))
