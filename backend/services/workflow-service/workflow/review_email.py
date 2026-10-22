"""Email delivery of the customer's secure link. Mobile delivery is in review_sms.py."""
import ipaddress
import logging
from smtplib import SMTPAuthenticationError, SMTPException, SMTPRecipientsRefused, SMTPSenderRefused
from urllib.parse import urlsplit

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.mail import BadHeaderError, send_mail
from django.core.validators import validate_email
from django.utils import timezone


logger = logging.getLogger(__name__)


def explain_mail_error(exc: Exception) -> str:
    """A safe, specific reason for the officer. Never includes the provider's own text, which can contain account details."""
    if isinstance(exc, SMTPAuthenticationError):
        return "The mailbox login was rejected. Check EMAIL_HOST_USER and use a Google App Password (2-Step Verification must be on), not the normal Gmail password."
    if isinstance(exc, SMTPSenderRefused):
        return "The mail server refused the sender address. DEFAULT_FROM_EMAIL must be the same mailbox that logs in."
    if isinstance(exc, SMTPRecipientsRefused):
        return "The mail server refused the customer's email address. Check it on stage 1."
    if isinstance(exc, SMTPException):
        return "The mail server did not accept the message. Ask your administrator to check the mailbox settings, then retry."
    if isinstance(exc, OSError):
        return "The mail server could not be reached. Check EMAIL_HOST and EMAIL_PORT, and that the server has internet access (port 587 must not be blocked)."
    return "The email could not be sent. Ask your administrator to check the mailbox settings, then retry."


def customer_can_open_link(link: str) -> bool:
    """False for localhost, loopback, non-http(s) and credential-bearing addresses: a customer's phone cannot open them. Shared by email and SMS."""
    try:
        url = urlsplit(link)
        host = (url.hostname or "").lower()
        loopback = host == "localhost" or host.endswith(".localhost")
        try:
            address = ipaddress.ip_address(host)
            loopback = loopback or address.is_loopback or address.is_unspecified
        except ValueError:
            pass
        if loopback and settings.REVIEW_ALLOW_LOCAL_LINKS:
            loopback = False  # testing only, see settings.py
        return url.scheme in ("http", "https") and bool(host) and not loopback and not url.username and not url.password
    except ValueError:
        return False


def send_review_email(customer: dict, reference: str, link: str, expires_at: str) -> dict:
    recipient = str(customer.get("email") or "").strip()
    result = {"recipient": recipient, "attemptedAt": timezone.now().isoformat()}

    def failed(status, message):
        return {**result, "status": status, "message": message}

    if not recipient:
        return failed("missing_email", "Add the customer's email address on stage 1, then send the email again.")
    try:
        validate_email(recipient)
    except ValidationError:
        return failed("invalid_email", "Correct the customer's email address on stage 1, then send the email again.")
    if not all((settings.EMAIL_HOST, settings.EMAIL_HOST_USER, settings.EMAIL_HOST_PASSWORD, settings.DEFAULT_FROM_EMAIL)):
        return failed("not_configured", "Email sending is not configured. Ask your administrator to configure the sender mailbox.")
    if not customer_can_open_link(link):
        return failed("invalid_link", "The review website address is not customer-accessible. Ask your administrator to configure the public website address.")

    # Avoid putting identity, income, bureau or screening data into email.
    message = (
        f"Please review your details for application {reference} and give permission "
        "for the CRIB inquiry and customer screening.\n\n"
        f"Open your secure link:\n{link}\n\n"
        f"This link expires at {expires_at}. You can submit it once. "
        "Keep it private and do not forward it.\n\n"
        "If you did not request this application, contact your officer.\n\nOriginIQ"
    )
    try:
        sent = send_mail(
            f"Review your application {reference} – OriginIQ", message,
            settings.DEFAULT_FROM_EMAIL, [recipient], fail_silently=False,
        )
    except (SMTPException, OSError, BadHeaderError, ValueError) as exc:
        # Provider exceptions can include credentials or message content, so they are never shown. The class name is safe, and goes to the server log.
        logger.warning("Review email failed: %s", exc.__class__.__name__)
        return failed("failed", explain_mail_error(exc))
    if sent != 1:
        return failed("failed", "The email provider did not accept the message. Please retry.")
    return {**result, "status": "sent", "sentAt": timezone.now().isoformat(),
            "message": "Email accepted by the mail server. Ask the customer to check their inbox and spam folder."}
