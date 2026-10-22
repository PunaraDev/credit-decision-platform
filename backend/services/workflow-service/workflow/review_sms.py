"""SMS delivery of the customer's secure link, through the integration service's SMS gateway. Same rules and result shape as review_email.py."""
import re

from django.utils import timezone
from django.utils.dateparse import parse_datetime

from creditcommon.errors import DomainError

from . import clients
from .review_email import customer_can_open_link


def to_e164_lk(raw) -> str | None:
    """0771234567, 077 123 4567, 94771234567 and 0094771234567 all become +94771234567. Anything else returns None."""
    d = re.sub(r"[\s\-()]", "", str(raw or ""))
    if d.startswith("+94"):
        d = d[3:]
    elif d.startswith("0094"):
        d = d[4:]
    elif d.startswith("94") and len(d) == 11:
        d = d[2:]
    elif d.startswith("0"):
        d = d[1:]
    return "+94" + d if re.fullmatch(r"[1-9]\d{8}", d) else None


def send_review_sms(customer: dict, reference: str, link: str, expires_at: str, ctx) -> dict:
    raw = str(customer.get("mobile") or "").strip()
    to = to_e164_lk(raw)
    result = {"recipient": to or raw, "attemptedAt": timezone.now().isoformat()}

    def failed(status, message):
        return {**result, "status": status, "message": message}

    if not raw:
        return failed("missing_mobile", "Add the customer's mobile number on stage 1, then send again.")
    if not to:
        return failed("invalid_mobile", "Correct the customer's mobile number on stage 1 (a Sri Lankan number such as 0771234567), then send again.")
    if not customer_can_open_link(link):
        return failed("invalid_link", "The review website address is not customer-accessible. Ask your administrator to configure the public website address.")

    # No identity, income, bureau or screening data in the text message.
    until = timezone.localtime(parse_datetime(expires_at)).strftime("%d %b %Y")
    message = f"OriginIQ: Review your details and give permission for application {reference}: {link} (valid until {until}, do not share)"
    try:
        r = clients.integration("sms", {"to": to, "message": message}, ctx)
    except DomainError as e:
        if "connector_not_configured" in str(e.details):
            return failed("not_configured", "SMS sending is not configured. Ask your administrator to set up the SMS provider.")
        return failed("failed", "The text message could not be sent. Please try again, or share the link another way.")
    except Exception:  # never expose provider or network details
        return failed("failed", "The text message could not be sent. Please try again, or share the link another way.")
    if r.get("simulated"):
        return {**result, "status": "simulated", "message": "SMS is in sandbox mode, so nothing was sent to the phone. Share the link another way, or ask your administrator to switch on the SMS provider."}
    return {**result, "status": "sent", "sentAt": timezone.now().isoformat(), "message": "Text message accepted by the SMS provider."}
