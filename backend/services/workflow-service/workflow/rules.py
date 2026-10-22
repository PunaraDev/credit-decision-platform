"""Stage definitions, role rules and completion gates. The server is the authority; the UI mirrors these rules for convenience."""
import re

STAGES = {1: "onboarding", 2: "screening", 3: "collateral", 4: "facility", 5: "assessment", 6: "confirmation", 7: "documents"}

EDIT_ROLES = {
    1: {"Customer", "Marketing Officer"}, 2: {"Customer", "Compliance Officer", "Marketing Officer"},
    3: {"Marketing Officer", "Valuer", "QA Officer"}, 4: {"Marketing Officer"},
    5: {"Marketing Officer", "Credit Officer", "Credit Approver"}, 6: {"Marketing Officer", "Operations Officer", "Customer"},
    7: {"Operations Officer", "Marketing Officer", "Customer"},
}
# Top-level keys a client may write per stage. Server-owned keys (erp, crib, screening, valuation, qa, decision, approval...) are only
# written by integrations or actions so a client can never fake a bureau result, valuation or approval.
CLIENT_KEYS = {1: {"consent", "customer"}, 2: {"cdd"}, 3: {"collateral", "valuation"}, 4: {"facility"}, 5: set(), 6: {"supplier", "confirmation"}, 7: set()}
VALUATION_CLIENT_KEYS = {"deduction", "mileage", "defects"}
# Officers record the privacy notice, data processing and identity-verification consents. Permission for the CRIB inquiry and customer screening
# is written only by the customer through the secure review link (cribInquiry, screeningCheck, customerConsent*), never by staff.
CONSENT_CLIENT_KEYS = {"privacyNotice", "dataProcessing", "identityVerification", "thirdPartySharing", "channel", "capturedAt"}
CUSTOMER_CONSENT_KEYS = ("cribInquiry", "screeningCheck", "customerConsentAt", "customerConsentBy", "customerConsentIp")
# What the customer sees and confirms on the review link. If any of these change afterwards, the permission is withdrawn.
REVIEW_FIELDS = ("fullName", "nic", "mobile", "address", "employer", "netIncome")
SUPPLIER_SERVER_KEYS = {"duplicateInvoiceCheck", "eligibilityCheck", "beneficiaryVerified"}
CONFIRMATION_CLIENT_KEYS = {"insurance", "acceptanceChannel", "agreementVersion"}

DOC_TEMPLATE = [
    ("nic", "NIC / passport and address proof", True), ("income", "Income proof and bank statements", True), ("crib", "CRIB report reference", True),
    ("cr", "Vehicle registration / ownership (CR)", True), ("valuation", "Valuation report and photos", True), ("invoice", "Supplier invoice / quotation", True),
    ("agreement", "Facility agreement", True), ("insurance", "Insurance cover note", True), ("guarantor", "Guarantor evidence", False),
]

NIC = re.compile(r"^(\d{9}[VvXx]|\d{12})$")
POLICY = {"min_tenor": 6, "max_tenor": 84, "max_rate": 28}


def num(v) -> float:
    try:
        return float(str(v).replace(",", "")) if v not in (None, "") else 0.0
    except ValueError:
        return 0.0


def g(d: dict, *path, default=None):
    for p in path:
        if not isinstance(d, dict):
            return default
        d = d.get(p)
    return default if d is None else d


def customer_permission(s: dict) -> bool:
    """True once the customer has authorised the CRIB inquiry and customer screening through the review link and submitted."""
    c = g(s, "onboarding", "consent", default={})
    return bool(c.get("cribInquiry") and c.get("screeningCheck") and c.get("customerConsentAt")
                and g(s, "screening", "fourN", "status") == "submitted" and g(s, "screening", "submission", "submitted"))


def final_market_value(stages: dict) -> float:
    v = g(stages, "collateral", "valuation", default={})
    return max(0.0, num(v.get("marketValue")) - num(v.get("deduction")))


def _missing(d: dict, keys: list[str], label: str) -> list[str]:
    return [f"{label}: {k} is required" for k in keys if not str(d.get(k, "")).strip()]


def gate_1(s):
    cons, cust = g(s, "onboarding", "consent", default={}), g(s, "onboarding", "customer", default={})
    e = [f"Consent '{k}' is required" for k in ("privacyNotice", "dataProcessing", "identityVerification") if not cons.get(k)]
    e += _missing(cust, ["fullName", "initials", "dob", "gender", "mobile", "address", "district", "province", "maritalStatus", "residenceType",
                         "employmentStatus", "employer", "yearsOfService", "monthlyExpenses", "bank", "accountNo", "idFront", "idBack", "addressProof", "incomeProof"], "Customer")
    if not NIC.match(str(cust.get("nic", ""))):
        e.append("Customer: valid NIC is required")
    if num(cust.get("netIncome")) <= 0:
        e.append("Customer: verified net income is required")
    if g(s, "onboarding", "erp", "status") not in ("found", "new"):
        e.append("ERP search has not been completed")
    return e


def gate_2(s):
    sc, cdd = g(s, "screening", "screening", default={}), g(s, "screening", "cdd", default={})
    e = [] if customer_permission(s) else ["The customer has not given permission for the CRIB inquiry and screening through the review link"]
    if g(s, "onboarding", "crib", "status") not in ("HIT", "NO_HIT"):
        e.append("CRIB inquiry has not been run")
    if sc.get("status") != "clear":
        e.append("Screening must be clear")
    e += _missing(cdd, ["sourceOfIncome", "transactionPurpose", "riskClass"], "CDD")
    return e


def gate_3(s):
    c, v, qa = g(s, "collateral", "collateral", default={}), g(s, "collateral", "valuation", default={}), g(s, "collateral", "qa", default={})
    e = _missing(c, ["vehicleNo", "engineNo", "chassisNo", "firstRegistration", "make", "model", "yom", "engineCapacity", "owner", "seller"], "Vehicle")
    e += [m for ok, m in ((c.get("crAttached"), "CR is not attached"), (c.get("photosAttached"), "Inspection photos are not attached"),
                          (not c.get("encumbrance"), "Registered encumbrance must be resolved"), (v.get("status") == "reported", "Valuation report not received"),
                          (v.get("officerDecision") == "accepted", "Officer has not accepted the valuation"),
                          (qa.get("status") == "approved", "Valuation QA approval pending")) if not ok]
    return e


def gate_4(s):
    f = g(s, "facility", "facility", default={})
    e = _missing(f, ["sector", "subSector", "purpose", "subPurpose"], "Facility")
    if num(f.get("netFacility")) < 100_000:
        e.append("Net facility must be at least 100,000")
    if not POLICY["min_tenor"] <= num(f.get("tenor")) <= POLICY["max_tenor"]:
        e.append(f"Tenor must be {POLICY['min_tenor']}-{POLICY['max_tenor']} months")
    if not 0 < num(f.get("requestedRate")) <= POLICY["max_rate"]:
        e.append("Requested rate is out of range")
    if f.get("guarantor") == "Yes" and not (f.get("guarantorName") and f.get("guarantorNic")):
        e.append("Guarantor details are required")
    if f.get("jointClient") == "Yes" and not (f.get("jointName") and f.get("jointNic")):
        e.append("Joint client details are required")
    if num(f.get("downPayment")) >= final_market_value(s):
        e.append("Down payment must be below the final market value")
    if f.get("product") == "Vehicle Loan" and num(f.get("lumpSum")) > 0:
        e.append("Lump sum is only supported on leases")
    return e


def gate_5(s):
    d, a = g(s, "assessment", "decision", default={}), g(s, "assessment", "approval", default={})
    if not d:
        return ["Credit assessment has not been run"]
    e = []
    if d.get("outcome") in ("Decline", "Compliance hold"):
        e.append(f"Outcome is '{d['outcome']}'")
    if a.get("status") != "approved":
        e.append("Credit approval is pending")
    rr = g(s, "assessment", "rateRequest", default={})
    if rr.get("status") == "pending":
        e.append("A special rate request is awaiting approval")
    elif not g(s, "assessment", "rate"):
        e.append("Accept the AI rate or obtain approval for a special rate")
    return e


def gate_6(s):
    sp, cf = g(s, "confirmation", "supplier", default={}), g(s, "confirmation", "confirmation", default={})
    e = _missing(sp, ["supplierId", "name", "regNo", "address", "contact", "bank", "accountNo", "accountName", "invoiceNo", "invoiceDate", "deliveryDate"], "Supplier")
    expected = num(g(s, "facility", "facility", "netFacility")) + num(g(s, "facility", "facility", "downPayment"))
    if num(sp.get("purchasePrice")) != expected:
        e.append(f"Purchase price must equal net facility plus down payment ({expected:,.0f})")
    if not all(sp.get(k) for k in SUPPLIER_SERVER_KEYS):
        e.append("Supplier checks have not passed")
    e += [m for k, m in (("insurance", "Insurance not confirmed"), ("customerAccepted", "Customer acceptance missing"), ("officerConfirmed", "Officer confirmation missing")) if not cf.get(k)]
    return e


def gate_7(s):
    docs = g(s, "documents", "documents", default=[])
    guar = g(s, "facility", "facility", "guarantor") == "Yes"
    return [f"{d['label']}: {d['status']}" for d in docs if (d["mandatory"] or (d["key"] == "guarantor" and guar)) and d["status"] != "verified"]


GATES = {1: gate_1, 2: gate_2, 3: gate_3, 4: gate_4, 5: gate_5, 6: gate_6, 7: gate_7}
