#!/usr/bin/env python3
"""End-to-end check of a running stack through the gateway (default http://localhost:8080).

Needs the identity users to exist: ADMIN_PASSWORD and SEED_DEMO_USERS=1 (see .env.example).
  E2E_BASE, E2E_ADMIN_PASSWORD, E2E_DEMO_PASSWORD override the defaults.
"""
import os
import sys
import time
import uuid

import requests

BASE = os.environ.get("E2E_BASE", "http://localhost:8080") + "/api/v1"
ADMIN_PW = os.environ.get("E2E_ADMIN_PASSWORD", "ChangeMe-Start-2026")
DEMO_PW = os.environ.get("E2E_DEMO_PASSWORD", "ChangeMe-Staff-2026")
NEW_PW = "E2e-Strong-Pass-2026"


class S:
    def __init__(self, user, pw):
        self.s = requests.Session()
        r = self.login(user, pw)
        if r.status_code != 200:  # already changed on a previous run
            r = self.login(user, NEW_PW); pw = NEW_PW
        r.raise_for_status()
        d = r.json(); self.h = {"Authorization": f"Bearer {d['accessToken']}"}; self.user = d["user"]
        if d["user"]["mustChangePassword"]:
            c = self.s.post(f"{BASE}/auth/change-password", json={"current": pw, "new": NEW_PW}, headers=self.h)
            assert c.status_code == 200, c.text

    def login(self, user, pw):
        for _ in range(12):  # the gateway rate-limits logins (10/min); back off instead of failing
            r = self.s.post(f"{BASE}/auth/login", json={"username": user, "password": pw})
            if r.status_code != 503:
                return r
            time.sleep(7)
        return r

    def call(self, m, path, expect=200, **kw):
        r = self.s.request(m, BASE + path, headers={**self.h, **kw.pop("headers", {})}, **kw)
        assert r.status_code == expect, f"{m} {path} -> {r.status_code} (expected {expect}): {r.text[:300]}"
        return r.json() if r.headers.get("content-type", "").startswith("application/json") else r


ok = lambda msg: print(f"  ok  {msg}")

CUSTOMER = dict(fullName="Masilamani Sasikala", initials="M. S.", nic="199957702612", dob="1999-03-17", gender="Female", mobile="0771234567", address="12 Lake Road, Batticaloa",
                district="Batticaloa", province="Eastern Province", maritalStatus="Single", residenceType="Owned", employmentStatus="Employed", employer="Eastern Tours",
                yearsOfService="4", grossIncome="1100000", netIncome="1000000", monthlyExpenses="220000", existingObligations="0", bank="Commercial Bank", accountNo="8001234567",
                idFront="nic-front.pdf", idBack="nic-back.pdf", addressProof="bill.pdf", incomeProof="payslip.pdf")
CONSENT = dict(privacyNotice=True, dataProcessing=True, cribInquiry=True, identityVerification=True, channel="Branch")
COLLATERAL = dict(vehicleNo="CAB-4521", engineNo="K10B-8821345", chassisNo="MH55S-221044", firstRegistration="2018-06-14", make="SUZUKI", model="WAGON R FZ", yom="2018",
                  engineCapacity="1000", owner="Lanka Motor Traders", seller="Lanka Motor Traders", crAttached=True, photosAttached=True, encumbrance=False)
FACILITY = dict(sector="TOURISM", subSector="Other tourism related activities", purpose="PERSONAL USE", subPurpose="Personal mobility", netFacility="3000000", tenor="48",
                downPayment="2000000", capitalizedCharges="0", lumpSum="0", requestedRate="10", guarantor="No", product="Vehicle Lease", vat="No")
SUPPLIER = dict(supplierId="SUP-1", name="Lanka Motor Traders (Pvt) Ltd", regNo="PV 1", address="45 Galle Road, Colombo", contact="0112345678", bank="Sampath Bank",
                accountNo="1020304050", accountName="Lanka Motor Traders (Pvt) Ltd", invoiceNo=f"INV-{uuid.uuid4().hex[:8]}", invoiceDate="2026-10-05", purchasePrice="5000000", deliveryDate="2026-10-25")


def main():
    print("Identity")
    anon = requests.get(f"{BASE}/applications"); assert anon.status_code == 401; ok("API without a token is rejected (401)")
    bad = requests.post(f"{BASE}/auth/login", json={"username": "admin", "password": "wrong-password"}); assert bad.status_code == 401; ok("wrong password rejected")
    admin = S("admin", ADMIN_PW); assert admin.user["role"] == "Administrator"; ok("admin login + forced password change")
    users = {u["username"]: u for u in admin.call("get", "/auth/users")}; assert "marketing" in users, "run with SEED_DEMO_USERS=1"; ok(f"admin lists {len(users)} users")
    s = {n: S(n, DEMO_PW) for n in ("marketing", "compliance", "qa", "creditofficer", "approver", "operations", "customer")}; ok("role users signed in")
    s["marketing"].call("get", "/auth/users", expect=403); ok("non-admin cannot list users")

    print("Application journey")
    mk, co, qa, cr, op = s["marketing"], s["compliance"], s["qa"], s["creditofficer"], s["operations"]
    a = mk.call("post", "/applications", expect=201, json={"product": "Vehicle Lease"}, headers={"Idempotency-Key": str(uuid.uuid4())}); A = f"/applications/{a['id']}"; ok(a["reference"])
    mk.call("patch", f"{A}/onboarding", json={"consent": CONSENT, "customer": CUSTOMER})
    mk.call("post", f"{A}/integrations/erp"); mk.call("post", f"{A}/integrations/crib"); mk.call("post", f"{A}/transitions", json={"action": "advance"}); ok("stage 1 (consent, KYC, ERP, CRIB)")
    co.call("post", f"{A}/integrations/screening"); co.call("post", f"{A}/screening", json={"cdd": {"sourceOfIncome": "Salary", "transactionPurpose": "Personal vehicle", "riskClass": "Low"}})
    link = mk.call("post", f"{A}/integrations/fourn")["stages"]["screening"]["fourN"]["link"]; token = link.rsplit("/", 1)[1]
    pub = requests.get(f"{BASE}/public/review/{token}"); assert pub.status_code == 200 and pub.json()["customerName"], pub.text; ok("customer review link opens without login (masked NIC: %s)" % pub.json()["nic"])
    assert requests.post(f"{BASE}/public/review/{token}", json={"confirm": True, "typedName": "Masilamani Sasikala"}).status_code == 200
    assert requests.post(f"{BASE}/public/review/{token}", json={"confirm": True, "typedName": "Masilamani Sasikala"}).status_code == 409; ok("customer confirmed; link is one-time")
    mk.call("post", f"{A}/transitions", json={"action": "submit"}); mk.call("post", f"{A}/transitions", json={"action": "accept"}); mk.call("post", f"{A}/transitions", json={"action": "advance"}); ok("stage 2 (screening, CDD, customer review, handoff)")
    mk.call("post", f"{A}/valuations", json={"collateral": COLLATERAL}); mk.call("post", f"{A}/integrations/valuation")
    qa.call("post", f"{A}/transitions", expect=409, json={"action": "qa_approve"})  # the officer must confirm the market value first
    mk.call("post", f"{A}/transitions", json={"action": "valuation_accept"})
    mk.call("post", f"{A}/transitions", expect=422, json={"action": "advance"}); qa.call("post", f"{A}/transitions", json={"action": "qa_approve"}); mk.call("post", f"{A}/transitions", json={"action": "advance"}); ok("stage 3 (collateral, valuation, QA gate)")
    mk.call("patch", f"{A}/facility", json={"facility": FACILITY}); mk.call("post", f"{A}/transitions", json={"action": "advance"}); ok("stage 4 (facility)")
    d = cr.call("post", f"{A}/assessments")["stages"]["assessment"]; pr = mk.call("get", f"{A}/pricing"); assert pr["approvedRate"] >= pr["floorRate"]
    ok(f"stage 5 (decision {d['decision']['outcome']}, score {d['decision']['score']}, rate {pr['approvedRate']}%, rental {round(pr['installment']):,})")
    cr.call("post", f"{A}/transitions", expect=422, json={"action": "advance"})  # a rate must be accepted first
    ai = pr["approvedRate"]; sp = round(ai - 1.5, 2)
    cr.call("post", f"{A}/transitions", expect=400, json={"action": "special_rate_request", "rate": ai + 1, "comment": "must be below the AI rate"})
    cr.call("post", f"{A}/transitions", json={"action": "special_rate_request", "rate": sp, "comment": "Payroll customer with strong history"})
    cr.call("post", f"{A}/transitions", expect=422, json={"action": "advance"}); s["approver"].call("post", f"{A}/transitions", json={"action": "approve", "comment": "Approved"})
    ra = cr.call("get", A)["stages"]["assessment"]["rate"]; assert ra["mode"] == "special" and ra["rate"] == sp; ok(f"special rate {sp}% approved by a credit approver (AI rate was {ai}%)")
    w = cr.call("get", f"{A}/walr"); assert w["currentMonth"]["branch"]["ur"] == sp, w; ok(f"WALR reflects it (UR {w['currentMonth']['branch']['ur']}%, branch {w['branch']!r})")
    cr.call("post", f"{A}/transitions", json={"action": "advance"})
    mk.call("post", f"{A}/confirmations", json={"supplier": SUPPLIER, "confirmation": {"insurance": True, "acceptanceChannel": "Branch"}})
    op.call("post", f"{A}/transitions", json={"action": "run_supplier_checks"}); mk.call("post", f"{A}/transitions", json={"action": "customer_accept"})
    mk.call("post", f"{A}/transitions", expect=403, json={"action": "officer_confirm"}); op.call("post", f"{A}/transitions", json={"action": "officer_confirm"}); op.call("post", f"{A}/transitions", json={"action": "advance"}); ok("stage 6 (supplier, checks, maker-checker)")
    pdf = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
    for k in ("nic", "income", "crib", "cr", "valuation", "invoice", "agreement", "insurance"):
        f = op.call("post", f"{A}/files", expect=201, files={"file": (f"{k}.pdf", pdf, "application/pdf")}, data={"label": k})
        op.call("post", f"{A}/documents", json={"action": "upload", "key": k, "fileName": f["name"], "fileId": f["id"]}); op.call("post", f"{A}/documents", json={"action": "verify", "key": k})
    dl = op.s.get(f"{BASE}/files/{f['id']}", headers=op.h); assert dl.content == pdf; ok("files stored and downloaded byte-for-byte")
    done = op.call("post", f"{A}/transitions", json={"action": "advance"}); assert done["status"] == "Completed"; ok("stage 7 -> application Completed")
    assert len(mk.call("get", f"{A}/timeline")) > 25; ok("audit timeline recorded")

    print("Security")
    c = s["customer"]; spoof = c.call("get", A, expect=404, headers={"X-User-Role": "Administrator"}); ok("customer cannot read others' applications, spoofed role header ignored")
    requests.post(f"{BASE}/integrations/crib/inquiry", json={"nic": CUSTOMER["nic"]}, headers=mk.h).status_code == 404 or sys.exit("adapters must not be exposed")
    ok("integration adapters are not reachable from the browser")
    mk.call("post", "/auth/logout"); assert requests.get(f"{BASE}/applications", headers=mk.h).status_code == 401; ok("logout revokes the token immediately")
    print("\nALL CHECKS PASSED")


if __name__ == "__main__":
    main()
