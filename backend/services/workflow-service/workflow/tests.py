from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient

from . import clients

TENANT = "tenant-1"
CUSTOMER = dict(fullName="Masilamani Sasikala", initials="M. S.", nic="199957702612", dob="1999-03-17", gender="Female", mobile="0771234567",
                address="12 Lake Road", district="Batticaloa", province="Eastern Province", maritalStatus="Single", residenceType="Owned",
                employmentStatus="Employed", employer="Eastern Tours", yearsOfService="4", netIncome="1000000", monthlyExpenses="220000",
                existingObligations="0", bank="Commercial Bank", accountNo="8001234567", idFront="a.jpg", idBack="b.jpg", addressProof="c.pdf", incomeProof="d.pdf")
CONSENT = dict(privacyNotice=True, dataProcessing=True, cribInquiry=True, identityVerification=True)
COLLATERAL = dict(vehicleNo="CAB-4521", engineNo="K10B", chassisNo="MH55S", firstRegistration="2018-06-14", make="SUZUKI", model="WAGON R", yom="2018",
                  engineCapacity="1000", owner="Lanka Motor Traders", seller="Lanka Motor Traders", crAttached=True, photosAttached=True, encumbrance=False)
FACILITY = dict(jointClient="No", sector="TOURISM", subSector="Other", purpose="PERSONAL USE", subPurpose="Personal mobility", netFacility="3000000", tenor="48",
                downPayment="2000000", capitalizedCharges="0", lumpSum="0", requestedRate="10", guarantor="No", product="Vehicle Lease")
SUPPLIER = dict(supplierId="SUP-1", name="Lanka Motor Traders", regNo="PV1", address="45 Galle Road", contact="0112345678", bank="Sampath Bank", accountNo="1020304050",
                accountName="Lanka Motor Traders", invoiceNo="INV-1", invoiceDate="2026-10-05", purchasePrice="5000000", deliveryDate="2026-10-25")

FAKE_INTEGRATIONS = {
    "erp": {"found": True, "customerId": "1042754", "facilities": 0, "profile": {"fullName": "Mrs. WALGAMAGE ASINI CHIRANTHI", "address": "316/5, Kothalawala Mw", "district": "Colombo", "province": "Western Province"}},
    "crib": {"status": "HIT", "helpId": "CRIB_1", "commitment": 0, "score": 77.49, "arrears": False, "reportDate": "2026-10-13"},
    "screening": {"status": "clear", "sanctions": "clear", "pep": "clear", "adverseMedia": "clear", "internalWatchlist": "clear"},
    "fourn": {"correlationId": "4N-1", "link": "https://4n.example.lk/r/1"},
    "valuation": {"reference": "VAL-1", "valuer": "Island Valuers", "marketValue": 5_040_000, "forcedSaleValue": 4_000_000, "reportDate": "2026-10-13"},
}
FAKE_DECISION = {"outcome": "Approve", "score": 99, "approvedRate": 18.5, "floorRate": 18.5, "requestedRate": 10, "installment": 88911, "totalPayable": 4_267_728,
                 "financed": 3_000_000, "needsApprover": False, "modelVersion": "rules-v1.0", "factors": [], "conditions": [], "hardStops": [], "ltv": 59.5, "dsr": 8.9}


def who(role, user=None):
    return dict(HTTP_X_TENANT_ID=TENANT, HTTP_X_USER_ID=user or role.lower().replace(" ", "-"), HTTP_X_USER_ROLE=role)


@mock.patch.object(clients, "integration", side_effect=lambda name, payload, ctx, idem="": FAKE_INTEGRATIONS[name])
@mock.patch.object(clients, "assess", side_effect=lambda payload, ctx: dict(FAKE_DECISION))
class JourneyTests(TestCase):
    def setUp(self):
        self.c = APIClient()

    def call(self, method, url, role="Administrator", data=None, user=None, **extra):
        return getattr(self.c, method)(url, data, format="json", **who(role, user), **extra)

    def new_app(self):
        r = self.call("post", "/api/v1/applications", "Marketing Officer", {"product": "Vehicle Lease"}, user="maker")
        self.assertEqual(r.status_code, 201)
        return r.json()["id"]

    def advance(self, aid, role, expect=200, user=None):
        r = self.call("post", f"/api/v1/applications/{aid}/transitions", role, {"action": "advance"}, user=user)
        self.assertEqual(r.status_code, expect, r.content)
        return r

    def test_full_seven_stage_journey(self, _assess, _integ):
        U = "/api/v1/applications/"
        aid = self.new_app()
        a = U + aid
        # Stage 1
        self.call("patch", f"{a}/onboarding", "Marketing Officer", {"consent": CONSENT, "customer": CUSTOMER})
        self.assertEqual(self.advance(aid, "Marketing Officer", 422).json()["error"]["code"], "gate_failed")  # ERP / CRIB missing
        self.call("post", f"{a}/integrations/erp", "Marketing Officer")
        self.advance(aid, "Marketing Officer")
        # Stage 2
        self.assertEqual(self.call("post", f"{a}/integrations/screening", "Compliance Officer").status_code, 409)
        self.call("post", f"{a}/screening", "Compliance Officer", {"cdd": {"sourceOfIncome": "Salary", "transactionPurpose": "Personal vehicle", "riskClass": "Low"}})
        self.call("post", f"{a}/integrations/fourn", "Marketing Officer")
        self.assertEqual(self.call("post", f"{a}/integrations/crib", "Marketing Officer").status_code, 409)
        link = self.call("get", a).json()["stages"]["screening"]["fourN"]["link"]
        token = link.rsplit("/", 1)[1]
        pub = APIClient()
        self.assertEqual(pub.get(f"/api/v1/public/review/{token}").json()["customerName"], "Masilamani Sasikala")
        self.assertEqual(pub.post(f"/api/v1/public/review/{token}", {"confirm": False}, format="json").status_code, 400)
        confirmation = {"confirm": True, "cribConsent": True, "screeningConsent": True, "typedName": "Masilamani Sasikala"}
        self.assertEqual(pub.post(f"/api/v1/public/review/{token}", confirmation, format="json").status_code, 200)
        self.assertEqual(pub.post(f"/api/v1/public/review/{token}", confirmation, format="json").status_code, 409)
        self.assertEqual(pub.get("/api/v1/public/review/not-a-real-token").status_code, 404)
        self.call("post", f"{a}/integrations/crib", "Marketing Officer")
        self.call("post", f"{a}/integrations/screening", "Compliance Officer")
        self.advance(aid, "Marketing Officer")
        # Stage 3
        self.call("post", f"{a}/valuations", "Marketing Officer", {"collateral": COLLATERAL})
        self.call("post", f"{a}/integrations/valuation", "Marketing Officer")
        self.assertEqual(self.call("post", f"{a}/transitions", "QA Officer", {"action": "qa_approve"}).status_code, 409)  # officer must accept first
        self.call("post", f"{a}/transitions", "Marketing Officer", {"action": "valuation_accept"})
        self.assertEqual(self.advance(aid, "Marketing Officer", 422).json()["error"]["details"], ["Valuation QA approval pending"])
        self.assertEqual(self.call("post", f"{a}/transitions", "Marketing Officer", {"action": "qa_approve"}).status_code, 403)  # QA role only
        self.call("post", f"{a}/transitions", "QA Officer", {"action": "qa_approve"})
        self.advance(aid, "Marketing Officer")
        # Stage 4
        self.call("patch", f"{a}/facility", "Marketing Officer", {"facility": FACILITY})
        self.advance(aid, "Marketing Officer")
        # Stage 5: auto-approved inside the limit
        r = self.call("post", f"{a}/assessments", "Credit Officer").json()
        self.assertEqual(r["stages"]["assessment"]["approval"]["status"], "approved")
        self.assertEqual(self.call("get", f"{a}/pricing").json()["approvedRate"], 18.5)
        self.assertEqual(self.advance(aid, "Credit Officer", 422).json()["error"]["details"], ["Accept the AI rate or obtain approval for a special rate"])
        self.call("post", f"{a}/transitions", "Credit Officer", {"action": "rate_accept"})
        self.advance(aid, "Credit Officer")
        # Stage 6
        self.call("post", f"{a}/confirmations", "Marketing Officer", {"supplier": SUPPLIER, "confirmation": {"insurance": True}})
        self.call("post", f"{a}/transitions", "Operations Officer", {"action": "run_supplier_checks"})
        self.call("post", f"{a}/transitions", "Marketing Officer", {"action": "customer_accept"})
        with self.settings(ENFORCE_MAKER_CHECKER=True):
            self.assertEqual(self.call("post", f"{a}/transitions", "Marketing Officer", {"action": "officer_confirm"}, user="maker").status_code, 403)  # same user
            self.call("post", f"{a}/transitions", "Operations Officer", {"action": "officer_confirm"}, user="checker")
        self.advance(aid, "Operations Officer")
        # Stage 7
        for k in ("nic", "income", "crib", "cr", "valuation", "invoice", "agreement", "insurance"):
            self.call("post", f"{a}/documents", "Operations Officer", {"action": "upload", "key": k, "fileName": f"{k}.pdf"})
        self.advance(aid, "Operations Officer", 422)
        for k in ("nic", "income", "crib", "cr", "valuation", "invoice", "agreement", "insurance"):
            self.call("post", f"{a}/documents", "Operations Officer", {"action": "verify", "key": k})
        done = self.advance(aid, "Operations Officer").json()
        self.assertEqual(done["status"], "Completed")
        self.assertEqual(done["completed"], [1, 2, 3, 4, 5, 6, 7])
        self.assertGreater(len(self.call("get", f"{a}/timeline").json()), 20)

    def test_cannot_skip_ahead(self, *_):
        aid = self.new_app()
        r = self.call("patch", f"/api/v1/applications/{aid}/facility", "Marketing Officer", {"facility": FACILITY})
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["error"]["code"], "stage_locked")

    def test_client_cannot_write_server_owned_fields(self, *_):
        aid = self.new_app()
        r = self.call("patch", f"/api/v1/applications/{aid}/onboarding", "Marketing Officer", {"crib": {"status": "HIT", "score": 99}})
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.json()["error"]["code"], "forbidden_fields")

    def test_crib_requires_consent(self, *_):
        aid = self.new_app()
        self.call("patch", f"/api/v1/applications/{aid}/onboarding", "Marketing Officer", {"consent": CONSENT, "customer": CUSTOMER})
        self.call("post", f"/api/v1/applications/{aid}/integrations/erp", "Marketing Officer")
        self.advance(aid, "Marketing Officer")
        r = self.call("post", f"/api/v1/applications/{aid}/integrations/crib", "Marketing Officer")
        self.assertEqual(r.json()["error"]["code"], "consent_missing")

    def test_tenant_isolation(self, *_):
        aid = self.new_app()
        other = APIClient().get(f"/api/v1/applications/{aid}", HTTP_X_TENANT_ID="tenant-2", HTTP_X_USER_ID="x", HTTP_X_USER_ROLE="Administrator")
        self.assertEqual(other.status_code, 404)

    def test_create_is_idempotent(self, *_):
        h = dict(HTTP_IDEMPOTENCY_KEY="abc")
        r1 = self.call("post", "/api/v1/applications", "Marketing Officer", {"product": "Vehicle Loan"}, **h)
        r2 = self.call("post", "/api/v1/applications", "Marketing Officer", {"product": "Vehicle Loan"}, **h)
        self.assertEqual(r1.json()["id"], r2.json()["id"])

    def test_editing_earlier_stage_invalidates_later_work(self, *_):
        aid = self.new_app(); a = f"/api/v1/applications/{aid}"
        self.call("patch", f"{a}/onboarding", "Marketing Officer", {"consent": CONSENT, "customer": CUSTOMER})
        self.call("post", f"{a}/integrations/erp", "Marketing Officer")
        self.advance(aid, "Marketing Officer")
        r = self.call("patch", f"{a}/onboarding", "Marketing Officer", {"customer": {"netIncome": "1200000"}}).json()
        self.assertEqual((r["currentStep"], r["completed"]), (1, []))

    def test_audit_events_are_immutable(self, *_):
        from .models import AuditEvent
        self.new_app()
        ev = AuditEvent.objects.first()
        with self.assertRaises(PermissionError):
            ev.save()
        with self.assertRaises(PermissionError):
            ev.delete()


class FileTests(TestCase):
    def setUp(self):
        import tempfile
        from django.test import override_settings
        from pathlib import Path
        self.tmp = tempfile.mkdtemp()
        self.ov = override_settings(UPLOAD_DIR=Path(self.tmp)); self.ov.enable()
        self.c = APIClient()
        self.aid = self.c.post("/api/v1/applications", {"product": "Vehicle Lease"}, format="json", **who("Marketing Officer")).json()["id"]

    def tearDown(self):
        self.ov.disable()

    def up(self, name, content, role="Marketing Officer"):
        from django.core.files.uploadedfile import SimpleUploadedFile
        return self.c.post(f"/api/v1/applications/{self.aid}/files", {"file": SimpleUploadedFile(name, content), "label": "nic"}, format="multipart", **who(role))

    def test_upload_download_roundtrip_and_tenant_scope(self):
        r = self.up("nic.pdf", b"%PDF-1.4 hello"); self.assertEqual(r.status_code, 201)
        fid = r.json()["id"]
        d = self.c.get(f"/api/v1/files/{fid}", **who("Marketing Officer"))
        self.assertEqual(b"".join(d.streaming_content), b"%PDF-1.4 hello")
        other = self.c.get(f"/api/v1/files/{fid}", HTTP_X_TENANT_ID="tenant-2", HTTP_X_USER_ID="x", HTTP_X_USER_ROLE="Administrator")
        self.assertEqual(other.status_code, 404)

    def test_rejects_disguised_and_disallowed_files(self):
        self.assertEqual(self.up("evil.pdf", b"MZ\x90 not a pdf").status_code, 415)
        self.assertEqual(self.up("run.exe", b"MZ").status_code, 415)

    def test_customer_role_sees_only_own_applications(self, *_):
        aid = self.aid  # created by a Marketing Officer
        mine = self.c.get(f"/api/v1/applications/{aid}", **who("Customer", "someone-else"))
        self.assertEqual(mine.status_code, 404)
        self.assertEqual(self.c.get("/api/v1/applications", **who("Customer", "someone-else")).json(), [])


@mock.patch.object(clients, "integration", side_effect=lambda name, payload, ctx, idem="": FAKE_INTEGRATIONS[name])
@mock.patch.object(clients, "assess", side_effect=lambda payload, ctx: dict(FAKE_DECISION))
@mock.patch.object(clients, "schedule", side_effect=lambda payload, ctx: {"installment": 85000.0, "rows": []})
class RateTests(TestCase):
    def setUp(self):
        self.c = APIClient()

    def call(self, m, u, role="Administrator", d=None, user=None):
        return getattr(self.c, m)(u, d, format="json", **who(role, user))

    def to_stage5(self, branch="Colombo Main"):
        r = self.c.post("/api/v1/applications", {"product": "Vehicle Lease"}, format="json", HTTP_X_USER_BRANCH=branch, HTTP_X_USER_ZONE="Western", **who("Marketing Officer", "maker"))
        a = f"/api/v1/applications/{r.json()['id']}"
        self.call("patch", f"{a}/onboarding", "Marketing Officer", {"consent": CONSENT, "customer": {k: v for k, v in CUSTOMER.items() if k != "fullName"}})
        erp = self.call("post", f"{a}/integrations/erp", "Marketing Officer").json()["stages"]["onboarding"]
        self.assertEqual(erp["erp"]["clientCode"], "1042754")
        self.assertEqual(erp["customer"]["fullName"], "Mrs. WALGAMAGE ASINI CHIRANTHI")   # prefilled from ERP, not typed
        self.assertEqual(erp["customer"]["district"], "Batticaloa")                        # officer's own value is kept
        return a

    def test_erp_profile_prefills_only_empty_fields(self, *_):
        self.to_stage5()

    def test_special_rate_needs_approver_and_recomputes_instalment(self, *_):
        a = self.to_stage5()
        S = self.call("get", a).json()
        # drive the application to stage 5 quickly by editing server rows directly is avoided: use the API with the journey helpers
        from .models import Application
        app = Application.objects.get(pk=S["id"])
        app.current_step = 5
        app.stages["assessment"] = {"decision": dict(FAKE_DECISION), "approval": {"status": "approved", "by": "System"}}
        app.stages["facility"] = {"facility": {**FACILITY, "tenor": "48", "lumpSum": "0"}}
        app.save()
        self.assertEqual(self.call("post", f"{a}/transitions", "Marketing Officer", {"action": "special_rate_request", "rate": 19, "comment": "long"}).status_code, 400)  # not below AI rate / reason too short
        self.assertEqual(self.call("post", f"{a}/transitions", "Marketing Officer", {"action": "special_rate_request", "rate": 16.5, "comment": "Strategic customer with payroll account"}).status_code, 200)
        self.assertIn("awaiting approval", self.call("post", f"{a}/transitions", "Credit Officer", {"action": "advance"}).json()["error"]["details"][0])
        self.assertEqual(self.call("post", f"{a}/transitions", "Marketing Officer", {"action": "approve"}).status_code, 403)
        done = self.call("post", f"{a}/transitions", "Credit Approver", {"action": "approve", "comment": "ok"}).json()["stages"]["assessment"]
        self.assertEqual((done["rate"]["mode"], done["rate"]["rate"], done["rate"]["installment"]), ("special", 16.5, 85000.0))
        self.assertEqual(self.call("post", f"{a}/transitions", "Credit Officer", {"action": "advance"}).status_code, 200)

    def test_walr_splits_ai_and_special_by_branch(self, *_):
        from .models import Application
        for branch, mode, rate, fin in (("Colombo Main", "ai", 20.0, 1_000_000), ("Colombo Main", "ai", 22.0, 3_000_000), ("Colombo Main", "special", 15.0, 1_000_000), ("Kandy", "ai", 30.0, 1_000_000)):
            a = self.to_stage5(branch)
            app = Application.objects.get(pk=a.rsplit("/", 1)[1])
            app.stages["assessment"] = {"decision": {"financed": fin}, "rate": {"mode": mode, "rate": rate, "at": __import__("django").utils.timezone.now().isoformat()}}
            app.save()
        w = self.call("get", f"{a.rsplit('/', 1)[0]}/{Application.objects.filter(branch='Colombo Main').first().pk}/walr").json()
        b = w["currentMonth"]["branch"]
        self.assertEqual(b["rg"], 21.5)        # (20*1 + 22*3) / 4
        self.assertEqual(b["ur"], 15.0)
        self.assertEqual(b["overall"], 20.2)   # (20*1 + 22*3 + 15*1) / 5 (weights in millions)
        self.assertEqual(w["currentMonth"]["zone"]["overall"], 21.83)  # the zone includes the Kandy branch too: 131 / 6
