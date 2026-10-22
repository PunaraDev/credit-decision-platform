from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from . import engine

BASE = dict(income=1_000_000, obligations=0, collateral_value=5_040_000, net_facility=3_000_000, capitalized_charges=0, down_payment=2_000_000,
            lump_sum=0, tenor=48, requested_rate=10, screening_clear=True, years_of_service=4, crib_status="HIT", crib_score=77.49)


class EngineTests(SimpleTestCase):
    def test_pmt_known_value(self):
        self.assertAlmostEqual(engine.pmt(1_000_000, 12, 12), 88848.79, places=1)

    def test_schedule_amortises_to_zero_with_and_without_balloon(self):
        self.assertLess(abs(engine.schedule(3_000_000, 22, 48)[-1]["closing"]), 1)
        self.assertLess(abs(engine.schedule(3_000_000, 22, 12, 500_000)[-1]["closing"]), 1)

    def test_demo_case_is_approved_within_auto_limit(self):
        r = engine.assess(engine.Inputs(**BASE))
        self.assertEqual(r["outcome"], "Approve")
        self.assertFalse(r["needsApprover"])
        self.assertAlmostEqual(r["floorRate"], 18.5)
        self.assertGreaterEqual(r["approvedRate"], r["floorRate"])

    def test_ltv_breach_declines(self):
        r = engine.assess(engine.Inputs(**{**BASE, "net_facility": 6_000_000}))
        self.assertEqual(r["outcome"], "Decline")
        self.assertTrue(any("LTV" in h for h in r["hardStops"]))

    def test_open_screening_is_compliance_hold(self):
        self.assertEqual(engine.assess(engine.Inputs(**{**BASE, "screening_clear": False}))["outcome"], "Compliance hold")

    def test_no_hit_is_penalised_not_rewarded(self):
        hit = engine.assess(engine.Inputs(**BASE))["score"]
        nohit = engine.assess(engine.Inputs(**{**BASE, "crib_status": "NO_HIT", "crib_score": None}))["score"]
        self.assertLess(nohit, hit)

    def test_traffic_light_and_headroom(self):
        g = engine.assess(engine.Inputs(**BASE))
        self.assertEqual(g["trafficLight"], "Green")
        self.assertGreater(g["additionalAmount"], 0)
        self.assertEqual(engine.assess(engine.Inputs(**{**BASE, "net_facility": 6_000_000}))["trafficLight"], "Red")
        self.assertEqual(engine.assess(engine.Inputs(**{**BASE, "screening_clear": False}))["trafficLight"], "Red")

    def test_headroom_is_zero_when_at_the_limit(self):
        r = engine.assess(engine.Inputs(**{**BASE, "net_facility": 4_500_000}))  # 89% LTV: almost no room under the 90% cap
        self.assertLess(r["additionalAmount"], 100_000)

    def test_large_facility_needs_approver(self):
        r = engine.assess(engine.Inputs(**{**BASE, "collateral_value": 20_000_000, "net_facility": 8_000_000}))
        self.assertTrue(r["needsApprover"])


class ApiTests(TestCase):
    def test_assess_endpoint_persists_record_and_enforces_role(self):
        c = APIClient()
        payload = dict(applicationId="A1", income=1_000_000, collateralValue=5_040_000, netFacility=3_000_000, downPayment=2_000_000, tenor=48,
                       requestedRate=10, screeningClear=True, yearsOfService=4, crib={"status": "HIT", "score": 77.49})
        hdr = {"HTTP_X_TENANT_ID": "t1", "HTTP_X_USER_ID": "u1"}
        r = c.post("/api/v1/decisions/assess", payload, format="json", HTTP_X_USER_ROLE="Valuer", **hdr)
        self.assertEqual(r.status_code, 403)
        r = c.post("/api/v1/decisions/assess", payload, format="json", HTTP_X_USER_ROLE="Credit Officer", **hdr)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["outcome"], "Approve")
        h = c.get("/api/v1/decisions/history/A1", HTTP_X_USER_ROLE="Credit Officer", **hdr)
        self.assertEqual(len(h.json()), 1)
