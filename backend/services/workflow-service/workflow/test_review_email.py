from smtplib import SMTPAuthenticationError, SMTPException, SMTPRecipientsRefused, SMTPSenderRefused
from threading import Barrier
from unittest import mock

from django.core import mail
from django.db import transaction
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from . import clients
from .models import Application, ReviewToken
from .tests import CONSENT, CUSTOMER, FAKE_INTEGRATIONS, who


@mock.patch("workflow.services.send_review_sms", new=lambda *args: {"status": "simulated", "message": "Sandbox: no SMS sent"})
@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    EMAIL_HOST="smtp.gmail.com", EMAIL_HOST_USER="sender@example.com",
    EMAIL_HOST_PASSWORD="test-only", DEFAULT_FROM_EMAIL="sender@example.com",
    PUBLIC_BASE_URL="https://credit.example.com",
)
class ReviewEmailTests(TestCase):
    def setUp(self):
        self.c = APIClient()
        self.headers = who("Marketing Officer")
        self.customer = {**CUSTOMER, "email": "customer@example.com"}
        r = self.c.post("/api/v1/applications", {"product": "Vehicle Lease"}, format="json", **self.headers)
        self.url = f"/api/v1/applications/{r.json()['id']}"
        self.c.patch(f"{self.url}/onboarding", {"customer": self.customer, "consent": CONSENT}, format="json", **self.headers)
        with mock.patch.object(clients, "integration", return_value=FAKE_INTEGRATIONS["erp"]):
            self.c.post(f"{self.url}/integrations/erp", {}, format="json", **self.headers)

    def command(self, path, body):
        with self.captureOnCommitCallbacks(execute=True):
            r = self.c.post(f"{self.url}/{path}", body, format="json", **self.headers)
        self.assertEqual(r.status_code, 200, r.content)
        return self.c.get(self.url, **self.headers).json()

    def review(self):
        return self.c.get(self.url, **self.headers).json()["stages"]["screening"]["fourN"]

    def test_stage_one_automatically_emails_saved_customer_after_commit(self):
        with self.captureOnCommitCallbacks(execute=True) as callbacks:
            response = self.c.post(f"{self.url}/transitions", {"action": "advance"}, format="json", **self.headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(len(callbacks), 1)
        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        review = self.review()
        self.assertEqual(email.to, [self.customer["email"]])
        self.assertIn(review["link"], email.body)
        self.assertNotIn(self.customer["nic"], email.body)
        self.assertNotIn(self.customer["netIncome"], email.body)
        self.assertEqual(review["emailDelivery"]["status"], "sent")
        raw = review["link"].rsplit("/", 1)[1]
        self.assertEqual(APIClient().get(f"/api/v1/public/review/{raw}").status_code, 200)
        self.c.get(self.url, **self.headers)
        self.c.patch(f"{self.url}/screening", {"cdd": {"riskClass": "Low"}}, format="json", **self.headers)
        self.assertEqual(len(mail.outbox), 1)  # polls and autosaves never resend

    def test_resend_replaces_previous_link(self):
        self.command("transitions", {"action": "advance"})
        old = self.review()["link"].rsplit("/", 1)[1]
        self.command("integrations/fourn", {})
        self.assertEqual(len(mail.outbox), 2)
        self.assertEqual(APIClient().get(f"/api/v1/public/review/{old}").status_code, 404)
        self.assertNotEqual(self.review()["link"].rsplit("/", 1)[1], old)

    def test_failed_smtp_does_not_undo_stage_completion_and_can_retry(self):
        with mock.patch("workflow.review_email.send_mail", side_effect=SMTPAuthenticationError(535, b"secret provider details")):
            app = self.command("transitions", {"action": "advance"})
        self.assertEqual(app["currentStep"], 2)
        self.assertEqual(self.review()["emailDelivery"]["status"], "failed")
        self.assertNotIn("secret", str(self.review()["emailDelivery"]))
        self.assertEqual(ReviewToken.objects.filter(revoked=False).count(), 1)
        self.command("integrations/fourn", {})
        self.assertEqual(self.review()["emailDelivery"]["status"], "sent")
        self.assertEqual(len(mail.outbox), 1)

    def test_mail_errors_explain_failures_without_logging_provider_details(self):
        from .review_email import send_review_email
        cases = (
            (SMTPAuthenticationError(535, b"provider-secret"), "The mailbox login was rejected."),
            (SMTPSenderRefused(550, b"provider-secret", "private@example.com"), "The mail server refused the sender address."),
            (SMTPRecipientsRefused({"private@example.com": (550, b"provider-secret")}), "The mail server refused the customer's email address."),
            (SMTPException("provider-secret"), "The mail server did not accept the message."),
            (OSError("provider-secret"), "The mail server could not be reached."),
            (ValueError("provider-secret"), "The email could not be sent."),
        )
        for error, prefix in cases:
            with self.subTest(error=type(error).__name__), \
                 mock.patch("workflow.review_email.send_mail", side_effect=error), \
                 self.assertLogs("workflow.review_email", level="WARNING") as logs:
                result = send_review_email(self.customer, "APP-TEST", "https://credit.example.com/#/review/test", "2026-10-29T10:00:00+00:00")
                self.assertEqual(result["status"], "failed")
                self.assertTrue(result["message"].startswith(prefix))
                self.assertNotIn("provider-secret", str(result) + str(logs.output))
                self.assertNotIn("private@example.com", str(result) + str(logs.output))
                self.assertIn(type(error).__name__, str(logs.output))

    def test_missing_configuration_is_not_reported_as_sent(self):
        with self.settings(EMAIL_HOST_PASSWORD=""):
            self.command("transitions", {"action": "advance"})
        self.assertEqual(self.review()["emailDelivery"]["status"], "not_configured")
        self.assertEqual(len(mail.outbox), 0)

    def test_localhost_link_is_not_emailed_to_customer(self):
        with self.settings(PUBLIC_BASE_URL="http://localhost:8080"):
            self.command("transitions", {"action": "advance"})
        self.assertEqual(self.review()["emailDelivery"]["status"], "invalid_link")
        self.assertEqual(len(mail.outbox), 0)

    def test_invalid_and_missing_email_do_not_call_provider(self):
        for email, status in (("not-an-email", "invalid_email"), ("", "missing_email")):
            with self.subTest(email=email):
                self.c.patch(f"{self.url}/onboarding", {"customer": {"email": email}}, format="json", **self.headers)
                self.command("transitions", {"action": "advance"})
                self.assertEqual(self.review()["emailDelivery"]["status"], status)
        self.assertEqual(len(mail.outbox), 0)

    def test_changed_email_revokes_old_recipient_link(self):
        self.command("transitions", {"action": "advance"})
        raw = self.review()["link"].rsplit("/", 1)[1]
        self.c.patch(f"{self.url}/onboarding", {"customer": {"email": "corrected@example.com"}}, format="json", **self.headers)
        self.assertEqual(APIClient().get(f"/api/v1/public/review/{raw}").status_code, 404)
        self.command("transitions", {"action": "advance"})
        self.assertEqual(mail.outbox[-1].to, ["corrected@example.com"])

    def test_changed_mobile_revokes_link_and_new_link_uses_corrected_number(self):
        self.command("transitions", {"action": "advance"})
        raw = self.review()["link"].rsplit("/", 1)[1]
        self.c.patch(f"{self.url}/onboarding", {"customer": {"mobile": "0779876543"}}, format="json", **self.headers)
        self.assertEqual(APIClient().get(f"/api/v1/public/review/{raw}").status_code, 404)
        with mock.patch("workflow.services.send_review_sms", return_value={"status": "simulated", "message": "Sandbox: no SMS sent"}) as sms:
            self.command("transitions", {"action": "advance"})
        self.assertEqual(sms.call_args.args[0]["mobile"], "0779876543")
        self.assertNotEqual(self.review()["link"].rsplit("/", 1)[1], raw)

    def test_sms_failure_does_not_block_email(self):
        with mock.patch("workflow.services.send_review_sms", return_value={"status": "failed", "message": "SMS unavailable"}):
            self.command("transitions", {"action": "advance"})
        self.assertEqual(self.review()["emailDelivery"]["status"], "sent")
        self.assertEqual(self.review()["smsDelivery"]["status"], "failed")
        self.assertEqual(len(mail.outbox), 1)

    def test_email_failure_does_not_block_sms(self):
        with mock.patch("workflow.services.send_review_email", return_value={"status": "failed", "message": "Mail unavailable"}), \
             mock.patch("workflow.services.send_review_sms", return_value={"status": "sent", "message": "SMS accepted"}):
            self.command("transitions", {"action": "advance"})
        self.assertEqual(self.review()["emailDelivery"]["status"], "failed")
        self.assertEqual(self.review()["smsDelivery"]["status"], "sent")

    def test_unexpected_channel_exceptions_are_recorded_without_a_500(self):
        for index, broken in enumerate(("emailDelivery", "smsDelivery")):
            with self.subTest(channel=broken), \
                 mock.patch("workflow.services.send_review_email", return_value={"status": "sent", "message": "Email accepted"},
                            side_effect=RuntimeError("provider-secret") if broken == "emailDelivery" else None), \
                 mock.patch("workflow.services.send_review_sms", return_value={"status": "sent", "message": "SMS accepted"},
                            side_effect=RuntimeError("provider-secret") if broken == "smsDelivery" else None), \
                 self.assertLogs("workflow.services", level="WARNING") as logs:
                self.command("transitions" if index == 0 else "integrations/fourn", {"action": "advance"} if index == 0 else {})
                review = self.review()
                other = "smsDelivery" if broken == "emailDelivery" else "emailDelivery"
                self.assertEqual(review[broken]["status"], "failed")
                self.assertIn("attemptedAt", review[broken])
                self.assertEqual(review[other]["status"], "sent")
                self.assertNotIn("provider-secret", str(review) + str(logs.output))

    def test_delivery_channels_run_in_parallel_and_are_not_sent_twice(self):
        from .services import deliver_review_link
        from types import SimpleNamespace
        barrier = Barrier(2)

        def sender(*args):
            barrier.wait(timeout=5)
            return {"status": "sent", "message": "Provider accepted"}

        with mock.patch("workflow.services.send_review_email", side_effect=sender) as email, \
             mock.patch("workflow.services.send_review_sms", side_effect=sender) as sms:
            app = self.command("transitions", {"action": "advance"})
            deliver_review_link(app["id"], self.review()["link"], SimpleNamespace())
        email.assert_called_once()
        sms.assert_called_once()
        self.assertEqual(self.review()["emailDelivery"]["status"], "sent")
        self.assertEqual(self.review()["smsDelivery"]["status"], "sent")

    def test_rollback_never_sends_email(self):
        with self.captureOnCommitCallbacks(execute=True) as callbacks:
            with transaction.atomic():
                self.c.post(f"{self.url}/transitions", {"action": "advance"}, format="json", **self.headers)
                transaction.set_rollback(True)
        self.assertEqual(callbacks, [])
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(Application.objects.get().current_step, 1)

    def test_unauthorized_role_cannot_send_link_and_submitted_links_cannot_resend(self):
        self.command("transitions", {"action": "advance"})
        denied = self.c.post(f"{self.url}/integrations/fourn", {}, format="json", **who("Valuer"))
        self.assertEqual(denied.status_code, 403)
        raw = self.review()["link"].rsplit("/", 1)[1]
        response = APIClient().post(f"/api/v1/public/review/{raw}", {
            "confirm": True, "cribConsent": True, "screeningConsent": True, "typedName": CUSTOMER["fullName"],
        }, format="json")
        self.assertEqual(response.status_code, 200)
        rejected = self.c.post(f"{self.url}/integrations/fourn", {}, format="json", **self.headers)
        self.assertEqual(rejected.status_code, 409)
        self.assertEqual(len(mail.outbox), 1)
