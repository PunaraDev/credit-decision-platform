from __future__ import annotations

import copy
import hashlib
import logging
import secrets
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from django.conf import settings
from django.utils import timezone
from django.db import transaction

from creditcommon.errors import DomainError

from . import clients, rules
from .models import Application, AuditEvent, FileAsset, ReviewToken
from .rules import CLIENT_KEYS, EDIT_ROLES, GATES, STAGES, g, num
from .review_email import send_review_email
from .review_sms import send_review_sms

ADMIN = "Administrator"
logger = logging.getLogger(__name__)


# ---------- helpers ----------
def audit(app: Application, ctx, action: str, detail: str = ""):
    AuditEvent.objects.create(application=app, actor=ctx.user_id, role=ctx.role, action=action, detail=detail, correlation_id=ctx.correlation_id)


def require_role(ctx, allowed: set[str], what: str):
    if ctx.role != ADMIN and ctx.role not in allowed:
        raise DomainError("forbidden", f"Role '{ctx.role}' cannot {what}", status=403)


def require_reached(app: Application, step: int):
    if step > app.current_step:
        raise DomainError("stage_locked", f"Stage {step} is locked until stage {app.current_step} is completed", status=409)


def touch(app: Application):
    app.version += 1
    app.save()


def stage(app: Application, step: int) -> dict:
    return app.stages.setdefault(STAGES[step], {})


def invalidate(app: Application, from_step: int, ctx, reason: str):
    """A material change to stage N invalidates stage N completion and everything that depends on it."""
    if not any(s >= from_step for s in app.completed_steps) and not app.stages.get("assessment"):
        return
    app.completed_steps = [s for s in app.completed_steps if s < from_step]
    app.current_step = min(app.current_step, from_step)
    if from_step <= 5:
        app.stages["assessment"] = {}
    if from_step <= 6:
        cf = g(app.stages, "confirmation", "confirmation")
        if isinstance(cf, dict):
            cf.update(customerAccepted=False, officerConfirmed=False)
    app.status = "In Progress"
    audit(app, ctx, f"Stages {from_step}+ invalidated", reason)


def details_hash(cust: dict) -> str:
    return hashlib.sha256("|".join(str(cust.get(k, "")).strip() for k in rules.REVIEW_FIELDS).encode()).hexdigest()


def withdraw_customer_permission(app: Application, ctx, reason: str):
    """The customer's permission applies to the details they confirmed. If those details change, the permission, the bureau and screening
    results obtained under it, and any open link are withdrawn, and the customer must confirm again."""
    on, sc = app.stages.setdefault("onboarding", {}), stage(app, 2)
    consent = on.setdefault("consent", {})
    for k in rules.CUSTOMER_CONSENT_KEYS:
        consent.pop(k, None)
    on["crib"] = {"status": "idle"}
    sc["screening"] = {"status": "idle", "adjudication": ""}
    sc["fourN"] = {"status": "idle"}
    sc["submission"] = {"submitted": False}
    app.review_tokens.filter(revoked=False).update(revoked=True)
    audit(app, ctx, "Customer permission withdrawn", reason)


def create_review_link(app: Application, ctx):
    app.review_tokens.filter(used_at__isnull=True, revoked=False).update(revoked=True)
    raw = secrets.token_urlsafe(32)
    exp = timezone.now() + timedelta(days=settings.REVIEW_LINK_DAYS)
    ReviewToken.objects.create(application=app, token_hash=hashlib.sha256(raw.encode()).hexdigest(), expires_at=exp)
    link = f"{settings.PUBLIC_BASE_URL.rstrip('/')}/#/review/{raw}"
    stage(app, 2)["fourN"] = {
        "status": "sent", "correlationId": f"4N-{raw[:8]}", "link": link,
        "sentAt": timezone.now().isoformat(), "expiresAt": exp.isoformat(),
        "emailDelivery": {"status": "pending"}, "smsDelivery": {"status": "pending"},
    }
    # Commit the token before sending it. Failed delivery must not undo a valid stage completion.
    transaction.on_commit(lambda: deliver_review_link(app.pk, link, ctx))


def _safe_send(fn, what: str) -> dict:
    try:
        return fn()
    except Exception as exc:  # one channel failing must never become a 500 or leave the screen stuck on "Sending"
        logger.warning("Review %s failed unexpectedly: %s", what, exc.__class__.__name__)
        return {"status": "failed", "attemptedAt": timezone.now().isoformat(), "message": f"The {what} could not be sent. Please try again."}


def deliver_review_link(app_id, link: str, ctx):
    """Send the link by email and by SMS (in parallel, outside any database lock), then record each result. A failed channel never blocks the other."""
    app = Application.objects.get(pk=app_id)
    review = stage(app, 2).get("fourN", {})
    if review.get("link") != link or review.get("status") != "sent":
        return  # superseded or already submitted
    customer, expires = g(app.stages, "onboarding", "customer", default={}), review["expiresAt"]
    senders = {"emailDelivery": lambda: send_review_email(customer, app.reference, link, expires),
               "smsDelivery": lambda: send_review_sms(customer, app.reference, link, expires, ctx)}
    todo = {k: fn for k, fn in senders.items() if review.get(k, {}).get("status") == "pending"}
    if not todo:
        return
    with ThreadPoolExecutor(max_workers=len(todo)) as pool:
        futures = {k: pool.submit(_safe_send, fn, "email" if k == "emailDelivery" else "text message") for k, fn in todo.items()}
    results = {k: f.result() for k, f in futures.items()}
    with transaction.atomic():
        app = Application.objects.select_for_update().get(pk=app_id)
        review = stage(app, 2).get("fourN", {})
        if review.get("link") != link or review.get("status") != "sent":
            return  # replaced or submitted while we were sending
        names = {"emailDelivery": "email", "smsDelivery": "text message"}
        for key, res in results.items():
            if review.get(key, {}).get("status") != "pending":
                continue
            review[key] = res
            audit(app, ctx, f"Customer review {names[key]} sent" if res["status"] == "sent" else f"Customer review {names[key]} not sent", res["message"])
        touch(app)


# ---------- commands ----------
@transaction.atomic
def create_application(ctx, product: str, idem: str = "") -> tuple[Application, bool]:
    require_role(ctx, {"Customer", "Marketing Officer"}, "create applications")
    if product not in ("Vehicle Lease", "Vehicle Loan"):
        raise DomainError("invalid_product", "Product must be Vehicle Lease or Vehicle Loan", status=400)
    if idem:
        prior = Application.objects.filter(tenant_id=ctx.tenant_id, idempotency_key=idem).first()
        if prior:
            return prior, False
    seq = Application.objects.filter(tenant_id=ctx.tenant_id).count() + 1
    app = Application.objects.create(
        tenant_id=ctx.tenant_id, branch=ctx.branch, zone=ctx.zone, reference=f"APP-{__import__('datetime').date.today().year}-{seq:05d}", product=product, idempotency_key=idem, created_by=ctx.user_id,
        stages={"facility": {"facility": {"product": product}},
                "documents": {"documents": [{"key": k, "label": l, "mandatory": m, "status": "missing", "version": 0} for k, l, m in rules.DOC_TEMPLATE]}},
    )
    audit(app, ctx, "Application created", product)
    return app, True


@transaction.atomic
def save_stage(app: Application, step: int, payload: dict, ctx) -> Application:
    app = Application.objects.select_for_update().get(pk=app.pk)
    require_reached(app, step)
    require_role(ctx, EDIT_ROLES[step] | ({"Valuer"} if step == 3 else set()), f"edit stage {step}")
    allowed = CLIENT_KEYS[step]
    bad = set(payload) - allowed
    if bad:
        raise DomainError("forbidden_fields", f"These fields are system-owned or not editable here: {', '.join(sorted(bad))}", status=403)
    st = stage(app, step)
    old_contact = (g(st, "customer", "email", default=""), g(st, "customer", "mobile", default=""))
    for key, value in payload.items():
        if not isinstance(value, dict):
            raise DomainError("invalid_payload", f"'{key}' must be an object", status=400)
        if key == "valuation":
            if ctx.role not in {"Valuer", "Marketing Officer", ADMIN}:
                raise DomainError("forbidden", "Only valuers can edit valuation notes", status=403)
            value = {k: v for k, v in value.items() if k in rules.VALUATION_CLIENT_KEYS}
            cur = st.get("valuation", {})
            if "deduction" in value:
                value["deduction"] = max(0, min(num(value["deduction"]), num(cur.get("marketValue"))))
        if key == "consent":
            value = {k: v for k, v in value.items() if k in rules.CONSENT_CLIENT_KEYS}
        if key == "confirmation":
            value = {k: v for k, v in value.items() if k in rules.CONFIRMATION_CLIENT_KEYS}
        if key == "supplier":
            value = {k: v for k, v in value.items() if k not in rules.SUPPLIER_SERVER_KEYS}
        st[key] = {**st.get(key, {}), **value}
    confirmed = g(app.stages, "screening", "fourN", "detailsHash")
    if step == 1 and "customer" in payload and confirmed and confirmed != details_hash(st.get("customer", {})):
        withdraw_customer_permission(app, ctx, "Details the customer confirmed were changed")
    elif step == 1 and "customer" in payload and old_contact != (g(st, "customer", "email", default=""), g(st, "customer", "mobile", default="")) and g(app.stages, "screening", "fourN", "link"):
        withdraw_customer_permission(app, ctx, "Customer email address or mobile number changed")
    if any(s >= step for s in app.completed_steps):
        invalidate(app, step, ctx, f"Edited {', '.join(payload)}")
    if app.status == "Draft":
        app.status = "In Progress"
    audit(app, ctx, f"Stage {step} saved", ", ".join(payload))
    touch(app)
    return app


@transaction.atomic
def run_integration(app: Application, name: str, ctx) -> Application:
    app = Application.objects.select_for_update().get(pk=app.pk)
    step_of = {"erp": 1, "crib": 2, "screening": 2, "fourn": 2, "valuation": 3}  # CRIB and screening run on stage 2, after the customer's permission
    if name not in step_of:
        raise DomainError("unknown_integration", f"Unknown integration '{name}'", status=404)
    step = step_of[name]
    require_reached(app, step)
    require_role(ctx, {1: {"Customer", "Marketing Officer"}, 2: {"Compliance Officer", "Marketing Officer"}, 3: {"Marketing Officer", "Valuer"}}[step], f"run {name}")
    on, sc, co = app.stages.setdefault("onboarding", {}), stage(app, 2), stage(app, 3)
    cust = on.setdefault("customer", {})
    idem = f"{app.id}:{name}:{app.version}"
    if name == "erp":
        r = clients.integration("erp", {"nic": cust.get("nic", "")}, ctx, idem)
        if r.get("found"):
            on["erp"] = {"status": "found", "customerId": r["customerId"], "clientCode": r["customerId"], "existingFacilities": r.get("facilities", 0)}
            for k, v in (r.get("profile") or {}).items():  # prefill only what the officer has not already typed
                if not str(cust.get(k, "")).strip():
                    cust[k] = v
        else:
            on["erp"] = {"status": "new"}
    elif name == "crib":
        if not rules.customer_permission(app.stages):
            raise DomainError("consent_missing", "The customer has not given permission for the CRIB inquiry. Send the review link and wait for the customer to submit.", status=409)
        on["crib"] = clients.integration("crib", {"nic": cust.get("nic", "")}, ctx, idem)
        if ctx.role == "Marketing Officer" and not app.assigned_to:
            app.assigned_to = ctx.user_id
    elif name == "screening":
        if not rules.customer_permission(app.stages):
            raise DomainError("consent_missing", "The customer has not given permission for customer screening. Send the review link and wait for the customer to submit.", status=409)
        r = clients.integration("screening", {"name": cust.get("fullName", "")}, ctx, idem)
        sc["screening"] = {**r, "ranAt": __import__("datetime").datetime.now().isoformat(), "adjudication": ""}
    elif name == "fourn":
        if not (cust.get("fullName") and cust.get("mobile") and rules.NIC.match(str(cust.get("nic", "")))):
            raise DomainError("details_incomplete", "The customer's name, mobile number and a valid NIC are needed before a link can be sent", status=409)
        if rules.customer_permission(app.stages):
            raise DomainError("already_submitted", "The customer has already given permission and submitted", status=409)
        create_review_link(app, ctx)
    elif name == "valuation":
        c = co.get("collateral", {})
        if not (c.get("vehicleNo") and c.get("make") and c.get("yom")):
            raise DomainError("incomplete_collateral", "Vehicle number, make and year are required", status=409)
        r = clients.integration("valuation", {"vehicleNo": c["vehicleNo"], "make": c["make"], "model": c.get("model", ""), "yom": str(c["yom"])}, ctx, idem)
        co["valuation"] = {**co.get("valuation", {}), "status": "reported", "deduction": 0, "officerDecision": None, **r}
        co["qa"] = {"status": "pending", "comment": ""}
    if any(s >= step for s in app.completed_steps):
        invalidate(app, step, ctx, f"{name} re-run")
    audit(app, ctx, f"Integration: {name}")
    touch(app)
    return app


@transaction.atomic
def run_assessment(app: Application, ctx) -> Application:
    require_reached(app, 5)
    require_role(ctx, EDIT_ROLES[5], "run the credit assessment")
    s = app.stages
    f, cust, crib = g(s, "facility", "facility", default={}), g(s, "onboarding", "customer", default={}), g(s, "onboarding", "crib", default={})
    payload = {
        "applicationId": str(app.id), "income": num(cust.get("netIncome")),
        "obligations": num(cust.get("existingObligations")) + num(crib.get("commitment")), "collateralValue": rules.final_market_value(s),
        "netFacility": num(f.get("netFacility")), "capitalizedCharges": num(f.get("capitalizedCharges")), "downPayment": num(f.get("downPayment")),
        "lumpSum": num(f.get("lumpSum")), "tenor": int(num(f.get("tenor"))), "requestedRate": num(f.get("requestedRate")),
        "screeningClear": g(s, "screening", "screening", "status") == "clear", "yearsOfService": num(cust.get("yearsOfService")),
        "guarantor": f.get("guarantor") == "Yes", "crib": {"status": crib.get("status", "idle"), "score": crib.get("score"), "arrears": bool(crib.get("arrears"))},
    }
    d = clients.assess(payload, ctx)
    auto = d["outcome"] == "Approve" and not d["needsApprover"]
    s["assessment"] = {"decision": d, "approval": {"status": "approved", "by": "System (within auto-approval limit)", "comment": ""} if auto else {"status": "pending", "comment": ""}}
    app.status = "In Progress"
    audit(app, ctx, "Credit assessment run", f"{d['outcome']} score {d['score']} {d['modelVersion']}")
    touch(app)
    return app


def _approval(app, ctx, status, comment):
    d = g(app.stages, "assessment", "decision")
    if not d:
        raise DomainError("no_assessment", "Run the credit assessment first", status=409)
    if status == "approved" and d["outcome"] in ("Decline", "Compliance hold"):
        raise DomainError("policy_stop", f"Cannot approve a '{d['outcome']}' outcome", status=409)
    if status == "rejected" and len(comment.strip()) < 5:
        raise DomainError("comment_required", "A reason is required to reject", status=400)
    app.stages["assessment"]["approval"] = {"status": status, "by": ctx.user_id, "comment": comment}
    app.status = "Declined" if status == "rejected" else "In Progress"


@transaction.atomic
def do_action(app: Application, action: str, body: dict, ctx) -> Application:
    app = Application.objects.select_for_update().get(pk=app.pk)
    comment = str(body.get("comment", ""))
    S = app.stages
    if action == "advance":
        step = app.current_step
        require_role(ctx, EDIT_ROLES[step], f"complete stage {step}")
        if step in app.completed_steps and step == 7:
            raise DomainError("already_completed", "Application is already completed", status=409)
        errors = GATES[step](S)
        if errors:
            raise DomainError("gate_failed", f"Stage {step} cannot be completed", errors, status=422)
        if step == 1 and not rules.customer_permission(S):
            create_review_link(app, ctx)
        if step == 2 and ctx.role == "Marketing Officer":
            app.assigned_to = ctx.user_id  # the marketing officer who continues the application after the customer's submission
        app.completed_steps = sorted(set(app.completed_steps) | {step})
        app.current_step = min(7, step + 1)
        app.status = "Completed" if step == 7 else "In Progress"
        audit(app, ctx, f"Stage {step} completed")
    elif action in ("approve", "reject"):
        require_reached(app, 5)
        require_role(ctx, {"Credit Approver"}, "approve or reject credit")
        A = S.get("assessment") or {}
        rr = A.get("rateRequest") or {}
        if rr.get("status") == "pending":
            if action == "approve":
                d = A.get("decision") or {}
                sched = clients.schedule({"principal": d["financed"], "annualRate": rr["rate"], "months": int(num(g(S, "facility", "facility", "tenor"))),
                                          "balloon": num(g(S, "facility", "facility", "lumpSum"))}, ctx)
                inst = sched["installment"]
                A["rate"] = {"mode": "special", "rate": rr["rate"], "installment": inst, "totalPayable": inst * int(num(g(S, "facility", "facility", "tenor"))) + num(g(S, "facility", "facility", "lumpSum")),
                             "by": ctx.user_id, "at": timezone.now().isoformat()}
                A["rateRequest"] = {**rr, "status": "approved", "decidedBy": ctx.user_id, "decisionNote": comment}
                if (A.get("approval") or {}).get("status") != "approved" and d.get("outcome") not in ("Decline", "Compliance hold"):
                    A["approval"] = {"status": "approved", "by": ctx.user_id, "comment": comment}
                audit(app, ctx, "Special rate approved", f"{rr['rate']}% {comment}")
            else:
                if len(comment.strip()) < 5:
                    raise DomainError("comment_required", "A reason is required to reject", status=400)
                A["rateRequest"] = {**rr, "status": "rejected", "decidedBy": ctx.user_id, "decisionNote": comment}
                audit(app, ctx, "Special rate rejected", comment)
        else:
            _approval(app, ctx, "approved" if action == "approve" else "rejected", comment)
            audit(app, ctx, f"Credit {action}d", comment)
    elif action in ("valuation_accept", "valuation_reject"):
        require_reached(app, 3)
        require_role(ctx, {"Marketing Officer", "Valuer"}, "decide on the valuation")
        co = S.get("collateral") or {}
        v = co.get("valuation") or {}
        if v.get("status") != "reported":
            raise DomainError("no_valuation", "No valuation report to decide on", status=409)
        if action == "valuation_accept":
            v["officerDecision"] = "accepted"
        else:  # declined: clear the report so a new one can be requested
            co["valuation"] = {**v, "status": "idle", "officerDecision": None, "marketValue": 0, "forcedSaleValue": 0, "deduction": 0}
            co["qa"] = {"status": "pending", "comment": ""}
        audit(app, ctx, f"Valuation {'accepted' if action == 'valuation_accept' else 'declined'} by officer")
    elif action in ("rate_accept", "special_rate_request"):
        require_reached(app, 5)
        require_role(ctx, {"Marketing Officer", "Credit Officer"}, "decide on the rate")
        A = S.get("assessment") or {}
        d = A.get("decision")
        if not d or d.get("outcome") in ("Decline", "Compliance hold"):
            raise DomainError("no_eligible_decision", "There is no eligible decision to price", status=409)
        if action == "rate_accept":
            if (A.get("rateRequest") or {}).get("status") == "pending":
                raise DomainError("request_pending", "A special rate request is awaiting approval", status=409)
            A["rate"] = {"mode": "ai", "rate": d["approvedRate"], "installment": d["installment"], "totalPayable": d["totalPayable"], "by": ctx.user_id, "at": timezone.now().isoformat()}
            audit(app, ctx, "AI rate accepted", f"{d['approvedRate']}%")
        else:
            rate = num(body.get("rate"))
            if not 0 < rate < d["approvedRate"]:
                raise DomainError("invalid_rate", f"A special rate must be above 0 and below the AI rate of {d['approvedRate']}%", status=400)
            if len(comment.strip()) < 10:
                raise DomainError("comment_required", "Explain the reason for the special rate (at least 10 characters)", status=400)
            A.pop("rate", None)
            A["rateRequest"] = {"status": "pending", "rate": rate, "comment": comment, "by": ctx.user_id, "at": timezone.now().isoformat()}
            audit(app, ctx, "Special rate requested", f"{rate}% {comment}")
        S["assessment"] = A
    elif action == "adjudicate_screening":
        require_role(ctx, {"Compliance Officer"}, "adjudicate screening")
        if len(comment.strip()) < 10:
            raise DomainError("comment_required", "Adjudication note must be at least 10 characters", status=400)
        S.setdefault("screening", {}).setdefault("screening", {}).update(status="clear", adjudication=comment)
        audit(app, ctx, "Screening match cleared", comment)
    elif action in ("qa_approve", "qa_reject", "qa_revaluation"):
        require_reached(app, 3)
        require_role(ctx, {"QA Officer"}, "perform valuation QA")
        if g(S, "collateral", "valuation", "status") != "reported":
            raise DomainError("no_valuation", "No valuation report to review", status=409)
        if g(S, "collateral", "valuation", "officerDecision") != "accepted":
            raise DomainError("officer_pending", "The officer must accept the valuation before QA review", status=409)
        status = {"qa_approve": "approved", "qa_reject": "rejected", "qa_revaluation": "revaluation"}[action]
        if status != "approved" and len(comment.strip()) < 5:
            raise DomainError("comment_required", "A comment is required", status=400)
        S["collateral"]["qa"] = {"status": status, "reviewer": ctx.user_id, "comment": comment}
        if status == "revaluation":
            S["collateral"]["valuation"]["status"] = "idle"
        audit(app, ctx, f"Valuation QA: {status}", comment)
    elif action == "run_supplier_checks":
        require_reached(app, 6)
        require_role(ctx, {"Operations Officer", "Marketing Officer"}, "run supplier checks")
        sp = g(S, "confirmation", "supplier", default={})
        dup = Application.objects.filter(tenant_id=app.tenant_id, stages__confirmation__supplier__invoiceNo=sp.get("invoiceNo", "\0")).exclude(pk=app.pk).exists()
        if dup:
            raise DomainError("duplicate_invoice", "This invoice number is already used on another application", status=409)
        sp.update(duplicateInvoiceCheck=True, eligibilityCheck=True, beneficiaryVerified=True)  # eligibility/beneficiary: mock until connectors exist
        audit(app, ctx, "Supplier checks passed")
    elif action in ("customer_accept", "officer_confirm"):
        require_reached(app, 6)
        cf = S.setdefault("confirmation", {}).setdefault("confirmation", {})
        if action == "customer_accept":
            require_role(ctx, {"Customer", "Marketing Officer"}, "record customer acceptance")
            cf.update(customerAccepted=True, acceptedBy=ctx.user_id)
        else:
            require_role(ctx, {"Operations Officer", "Marketing Officer"}, "confirm as checker")
            if getattr(settings, "ENFORCE_MAKER_CHECKER", not settings.DEBUG) and ctx.user_id == app.created_by:
                raise DomainError("maker_checker", "The checker must be a different user from the maker", status=403)
            cf.update(officerConfirmed=True, officerBy=ctx.user_id)
        audit(app, ctx, action.replace("_", " ").capitalize())
    else:
        raise DomainError("unknown_action", f"Unknown action '{action}'", status=400)
    touch(app)
    return app


@transaction.atomic
def document_action(app: Application, body: dict, ctx) -> Application:
    require_reached(app, 7)
    docs = g(app.stages, "documents", "documents", default=[])
    d = next((x for x in docs if x["key"] == body.get("key")), None)
    if not d:
        raise DomainError("unknown_document", "Unknown document key", status=404)
    act = body.get("action")
    if act == "upload":
        require_role(ctx, EDIT_ROLES[7], "upload documents")
        if not body.get("fileName"):
            raise DomainError("invalid_payload", "fileName is required", status=400)
        fid = body.get("fileId")
        if fid and not FileAsset.objects.filter(id=fid, application=app, tenant_id=app.tenant_id).exists():
            raise DomainError("unknown_file", "File not found for this application", status=404)
        d.update(status="uploaded", fileName=body["fileName"], fileId=fid, version=d["version"] + 1, reason=None)
    elif act in ("verify", "reject"):
        require_role(ctx, {"Operations Officer"}, "verify documents")
        if d["status"] != "uploaded":
            raise DomainError("invalid_state", "Only uploaded documents can be reviewed", status=409)
        if act == "reject" and not body.get("reason"):
            raise DomainError("comment_required", "A rejection reason is required", status=400)
        d.update(status="verified" if act == "verify" else "rejected", reviewer=ctx.user_id, reason=body.get("reason"))
    else:
        raise DomainError("unknown_action", "action must be upload, verify or reject", status=400)
    audit(app, ctx, f"Document {act}", f"{d['label']} v{d['version']}")
    touch(app)
    return app


def to_json(app: Application) -> dict:
    return {"id": str(app.id), "reference": app.reference, "product": app.product, "status": app.status, "currentStep": app.current_step,
            "completed": app.completed_steps, "stages": copy.deepcopy(app.stages), "version": app.version, "assignedTo": app.assigned_to,
            "createdAt": app.created_at, "updatedAt": app.updated_at}


def summary(app: Application) -> dict:
    S = app.stages
    cust, f = g(S, "onboarding", "customer", default={}), g(S, "facility", "facility", default={})
    col, val = g(S, "collateral", "collateral", default={}), g(S, "collateral", "valuation", default={})
    dec, appr = g(S, "assessment", "decision", default={}), g(S, "assessment", "approval", default={})
    docs = g(S, "documents", "documents", default=[])
    guar = f.get("guarantor") == "Yes"
    req = [d for d in docs if d["mandatory"] or (d["key"] == "guarantor" and guar)]
    return {
        "customerName": cust.get("fullName", ""), "nic": cust.get("nic", ""), "mobile": cust.get("mobile", ""), "district": cust.get("district", ""),
        "erp": g(S, "onboarding", "erp", "status"), "erpCustomerId": g(S, "onboarding", "erp", "customerId"),
        "cribStatus": g(S, "onboarding", "crib", "status"), "cribScore": g(S, "onboarding", "crib", "score"), "cribCommitment": g(S, "onboarding", "crib", "commitment"),
        "screening": g(S, "screening", "screening", "status"), "riskClass": g(S, "screening", "cdd", "riskClass"), "fourN": g(S, "screening", "fourN", "status"),
        "vehicle": " ".join(x for x in (col.get("make"), col.get("model"), col.get("yom")) if x), "vehicleNo": col.get("vehicleNo", ""),
        "valuation": val.get("status"), "marketValue": val.get("marketValue"), "qa": g(S, "collateral", "qa", "status"),
        "netFacility": num(f.get("netFacility")), "tenor": f.get("tenor"), "product": f.get("product") or app.product,
        "outcome": dec.get("outcome"), "trafficLight": dec.get("trafficLight"), "finalRate": g(S, "assessment", "rate", "rate"), "rateRequest": g(S, "assessment", "rateRequest", "status"), "score": dec.get("score"), "approvedRate": dec.get("approvedRate"), "installment": dec.get("installment"), "approval": appr.get("status"),
        "docsVerified": sum(1 for d in req if d["status"] == "verified"), "docsRequired": len(req),
        "docsPending": sum(1 for d in req if d["status"] == "uploaded"),
    }


# ---------- files ----------
MAGIC = {b"%PDF": "application/pdf", b"\xff\xd8\xff": "image/jpeg", b"\x89PNG": "image/png", b"PK\x03\x04": "application/zip"}
EXT = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".zip": "application/zip"}


@transaction.atomic
def store_file(app: Application, upload, label: str, ctx) -> FileAsset:
    import os
    require_role(ctx, set().union(*EDIT_ROLES.values()) | {"Valuer"}, "upload files")
    if upload.size > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise DomainError("file_too_large", f"Files are limited to {settings.MAX_UPLOAD_MB} MB", status=413)
    ext = os.path.splitext(upload.name)[1].lower()
    head = upload.read(8); upload.seek(0)
    kind = next((t for m, t in MAGIC.items() if head.startswith(m)), None)
    if ext not in EXT or kind != EXT[ext]:
        raise DomainError("file_type_not_allowed", "Only PDF, JPG, PNG or ZIP files whose content matches their extension are accepted", status=415)
    fid = __import__("uuid").uuid4()
    folder = settings.UPLOAD_DIR / app.tenant_id / str(app.id)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{fid}{ext}"
    h = hashlib.sha256()
    with open(path, "wb") as out:
        for chunk in upload.chunks():
            h.update(chunk); out.write(chunk)
    a = FileAsset.objects.create(id=fid, tenant_id=app.tenant_id, application=app, label=label[:64], original_name=os.path.basename(upload.name)[:255], content_type=kind,
                                 size=upload.size, sha256=h.hexdigest(), storage_path=str(path), uploaded_by=ctx.user_id)
    audit(app, ctx, "File uploaded", f"{label}: {a.original_name}")
    return a


# ---------- customer review portal ----------
def _live_token(raw: str) -> ReviewToken:
    t = ReviewToken.objects.select_related("application").filter(token_hash=hashlib.sha256(raw.encode()).hexdigest()).first()
    if not t or t.revoked or t.expires_at <= timezone.now():
        raise DomainError("link_invalid", "This link is invalid or has expired. Please ask your officer for a new one.", status=404)
    return t


def mask(v: str, keep: int = 3) -> str:
    return v[:keep] + "*" * max(0, len(v) - keep - 2) + v[-2:] if len(v) > keep + 2 else "***"


def review_view(raw: str) -> dict:
    t = _live_token(raw); S = t.application.stages
    cust = g(S, "onboarding", "customer", default={})
    # Nothing from the bureau or screening is shown here: neither has been run yet, because they need the permission given on this page.
    return {"customerName": cust.get("fullName"), "nic": mask(cust.get("nic", "")), "mobile": mask(cust.get("mobile", ""), 3), "address": cust.get("address"),
            "employer": cust.get("employer"), "monthlyIncome": num(cust.get("netIncome")), "product": t.application.product, "reference": t.application.reference,
            "alreadyConfirmed": bool(t.used_at)}


@transaction.atomic
def review_confirm(raw: str, body: dict, ip: str) -> dict:
    t = _live_token(raw)
    if t.used_at:
        raise DomainError("already_confirmed", "These details were already confirmed", status=409)
    typed = str(body.get("typedName", "")).strip()
    if not (body.get("confirm") and body.get("cribConsent") and body.get("screeningConsent")) or len(typed) < 3:
        raise DomainError("confirmation_required", "Tick all three declarations and type your full name", status=400)
    app = Application.objects.select_for_update().get(pk=t.application_id)
    now = timezone.now().isoformat()
    on, sc = app.stages.setdefault("onboarding", {}), app.stages.setdefault("screening", {})
    # The customer's permission is recorded here and only here. Staff cannot write these fields.
    on.setdefault("consent", {}).update(cribInquiry=True, screeningCheck=True, customerConsentAt=now, customerConsentBy=typed, customerConsentIp=ip)
    sc["fourN"] = {**sc.get("fourN", {}), "status": "submitted", "confirmedAt": now, "confirmedBy": typed, "ip": ip, "detailsHash": details_hash(on.get("customer", {}))}
    sc["submission"] = {"submitted": True, "submittedAt": now, "snapshotId": f"SNAP-{app.version}"}
    t.used_at = timezone.now(); t.save(update_fields=["used_at"])
    AuditEvent.objects.create(application=app, actor="customer (review link)", role="Customer", action="Customer authorised CRIB inquiry and customer screening, and submitted",
                              detail=f"signed '{typed}', ip {ip}. The marketing officer can now continue")
    touch(app)
    return {"ok": True}


def walr(app: Application) -> dict:
    """Weighted average lending rate (weighted by financed amount) of rates agreed in the same branch and zone.
    RG = rates accepted as recommended by the AI engine; UR = special rates approved outside the AI recommendation."""
    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    items = []
    for a in Application.objects.filter(tenant_id=app.tenant_id).only("stages", "branch", "zone"):
        rate, dec = g(a.stages, "assessment", "rate"), g(a.stages, "assessment", "decision")
        if rate and dec:
            items.append((a, rate, dec["financed"], __import__("datetime").datetime.fromisoformat(rate["at"])))

    def avg(sel):
        tot = sum(w for _, _, w, _ in sel)
        return round(sum(r["rate"] * w for _, r, w, _ in sel) / tot, 2) if tot else 0.0

    out = {}
    for key, cut in (("currentMonth", month_start), ("last30Days", now - timedelta(days=30))):
        out[key] = {}
        for level in ("branch", "zone"):
            sel = [x for x in items if x[3] >= cut and getattr(x[0], level) == getattr(app, level)]
            out[key][level] = {"overall": avg(sel), "rg": avg([x for x in sel if x[1]["mode"] == "ai"]), "ur": avg([x for x in sel if x[1]["mode"] == "special"]), "count": len(sel)}
    out["branch"], out["zone"] = app.branch, app.zone
    return out
