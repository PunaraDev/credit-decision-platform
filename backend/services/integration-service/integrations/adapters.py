"""Adapter layer. Each external system sits behind a small interface so mocks and real connectors are swappable.

Real connectors (CRIB, ERP, 4N, screening, valuation) must only be added through the lender's authorized
arrangements. The mock adapters return simulated data and label it as such.
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import date


def _h(s: str) -> int:
    return int(hashlib.sha256(s.encode()).hexdigest(), 16) % 10_000_000


class MockAdapter:
    simulated = True

    NAMES = ["Mrs. WALGAMAGE ASINI CHIRANTHI", "Mr. KUMARA PERERA SILVA", "Ms. NADEESHA FERNANDO", "Mr. RAJAN SELVARAJAH", "Mrs. FATHIMA RIZNA HAMEED", "Mr. DILSHAN JAYAWARDENA"]
    PLACES = [("Colombo", "Western Province"), ("Gampaha", "Western Province"), ("Kandy", "Central Province"), ("Galle", "Southern Province"), ("Batticaloa", "Eastern Province"), ("Jaffna", "Northern Province")]

    def erp_search(self, nic: str) -> dict:
        """Sandbox: two thirds of NICs are 'existing ERP clients' with a generated profile; the rest are new customers."""
        h = _h(nic)
        if h % 3 == 0:
            return {"found": False}
        district, province = self.PLACES[h % len(self.PLACES)]
        return {"found": True, "customerId": f"{1000000 + h % 90000}", "facilities": h % 3,
                "profile": {"fullName": self.NAMES[h % len(self.NAMES)], "address": f"{h % 400 + 1}/{h % 9 + 1}, Main Street, {district}", "district": district,
                            "province": province, "mobile": f"07{h % 8}{h % 10_000_000:07d}"[:10]}}

    def crib_inquiry(self, nic: str) -> dict:
        h = _h(nic)
        return {"status": "HIT", "helpId": f"CRIB_{h:07d}", "commitment": (h % 4) * 15000, "score": round(55 + h % 40 + (h % 100) / 100, 2),
                "arrears": False, "reportDate": date.today().isoformat()}

    def screening(self, name: str) -> dict:
        return {"status": "clear", "sanctions": "clear", "pep": "clear", "adverseMedia": "clear", "internalWatchlist": "clear"}

    def fourn_send(self, app_id: str) -> dict:
        i = uuid.uuid4().hex[:8]
        return {"correlationId": f"4N-{i}", "link": f"https://4n.example.lk/review/{i}"}

    def valuation(self, vehicle_no: str, make: str, model: str, yom: str) -> dict:
        age = max(0, date.today().year - int(yom or 2018))
        mv = max(1_500_000, round((6_000_000 - age * 120_000) / 10_000) * 10_000)
        return {"reference": f"VAL-{_h(vehicle_no) % 100000}", "valuer": "Island Valuers (Pvt) Ltd", "marketValue": mv,
                "forcedSaleValue": round(mv * 0.8), "reportDate": date.today().isoformat()}


class LiveAdapter:
    """Calls each provider's gateway over HTTPS. Configure <NAME>_BASE_URL and <NAME>_API_KEY (NAME = ERP, CRIB, SCREENING, VALUATION, FOURN).

    The provider (or a thin mapper you host in front of it) must return the same JSON shapes as MockAdapter.
    Real CRIB/ERP/screening/valuation access requires authorization from each provider and lender.
    """
    simulated = False

    def _post(self, name: str, path: str, payload: dict) -> dict:
        import os
        import requests
        from creditcommon.errors import DomainError
        base, key = os.environ.get(f"{name}_BASE_URL"), os.environ.get(f"{name}_API_KEY", "")
        if not base:
            raise DomainError("connector_not_configured", f"{name} connector is not configured", status=503)
        try:
            r = requests.post(base.rstrip("/") + path, json=payload, headers={"Authorization": f"Bearer {key}"}, timeout=20)
            r.raise_for_status()
            return r.json()
        except requests.RequestException as exc:
            raise DomainError("connector_failed", f"{name} call failed: {exc.__class__.__name__}", status=502)

    def erp_search(self, nic): return self._post("ERP", "/erp/search", {"nic": nic})
    def crib_inquiry(self, nic): return self._post("CRIB", "/crib/inquiry", {"nic": nic})
    def screening(self, name): return self._post("SCREENING", "/screening/run", {"name": name})
    def fourn_send(self, app_id): return self._post("FOURN", "/fourn/send", {"appId": app_id})
    def valuation(self, vehicle_no, make, model, yom): return self._post("VALUATION", "/valuation/request", {"vehicleNo": vehicle_no, "make": make, "model": model, "yom": yom})


def get_adapter():
    from django.conf import settings
    return LiveAdapter() if settings.INTEGRATION_MODE == "live" else MockAdapter()


def send_sms(to: str, message: str) -> dict:
    """Send one text message. `to` is +94XXXXXXXXX. SMS_MODE=sandbox sends nothing and says so; SMS_MODE=notifylk uses https://developer.notify.lk/api-endpoints
    (set NOTIFYLK_USER_ID, NOTIFYLK_API_KEY and your approved NOTIFYLK_SENDER_ID). To use another provider, add a branch here that returns the same shape."""
    import os
    from django.conf import settings
    from creditcommon.errors import DomainError
    mode = settings.SMS_MODE
    if mode == "sandbox":
        return {"status": "sent", "messageId": f"SMS-{uuid.uuid4().hex[:8]}", "simulated": True}
    if mode == "notifylk":
        import requests
        uid, key, sender = (os.environ.get(k, "") for k in ("NOTIFYLK_USER_ID", "NOTIFYLK_API_KEY", "NOTIFYLK_SENDER_ID"))
        if not (uid and key and sender):
            raise DomainError("connector_not_configured", "NOTIFYLK_USER_ID, NOTIFYLK_API_KEY and NOTIFYLK_SENDER_ID must be set", status=503)
        try:
            r = requests.post("https://app.notify.lk/api/v1/send", data={"user_id": uid, "api_key": key, "sender_id": sender, "to": to.lstrip("+"), "message": message}, timeout=15)
            body = r.json()
        except (requests.RequestException, ValueError):
            raise DomainError("connector_failed", "The SMS provider could not be reached", status=502)
        if r.status_code >= 400 or body.get("status") != "success":
            raise DomainError("connector_failed", "The SMS provider did not accept the message", status=502)  # provider text is not passed on
        return {"status": "sent", "messageId": "", "simulated": False}
    raise DomainError("connector_not_configured", f"Unknown SMS_MODE '{mode}'. Use sandbox or notifylk", status=503)
