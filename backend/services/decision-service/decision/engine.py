"""Rules-first credit decision engine. Pure functions: no I/O, fully testable and explainable.

Mirrors frontend/src/lib/finance.ts so the UI preview and the server result agree.
The server result is the one that counts; the UI never decides.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone

from .policy import POLICY


def pmt(principal: float, annual_rate_pct: float, months: int, balloon: float = 0.0) -> float:
    """Level instalment on a reducing-balance facility; balloon is a lump sum due at maturity."""
    if months <= 0 or principal <= 0:
        return 0.0
    r = annual_rate_pct / 1200
    if r == 0:
        return (principal - balloon) / months
    g = (1 + r) ** months
    return (principal - balloon / g) * r / (1 - 1 / g)


def schedule(principal: float, annual_rate_pct: float, months: int, balloon: float = 0.0) -> list[dict]:
    r = annual_rate_pct / 1200
    p = pmt(principal, annual_rate_pct, months, balloon)
    rows, bal = [], principal
    for i in range(1, months + 1):
        interest = bal * r
        prin, inst = p - interest, p
        if i == months:
            inst, prin = p + balloon, bal
        closing = max(0.0, bal - prin)
        rows.append({"n": i, "opening": round(bal, 2), "interest": round(interest, 2), "principal": round(prin, 2),
                     "installment": round(inst, 2), "closing": round(closing, 2)})
        bal = closing
    return rows


def _band(n: float, cuts: list[tuple[float, int]], fallback: int) -> int:
    for limit, value in cuts:
        if n < limit:
            return value
    return fallback


def additional_amount(i: "Inputs", rate: float, financed: float) -> float:
    """Extra financing the customer could still receive inside the LTV and DSR limits at this rate and tenor."""
    by_ltv = i.collateral_value * POLICY["max_ltv"] / 100
    capacity = max(0.0, i.income * POLICY["max_dsr"] / 100 - i.obligations)
    r = rate / 1200
    if i.tenor <= 0:
        return 0.0
    by_dsr = capacity * i.tenor + i.lump_sum if r == 0 else capacity * (1 - (1 + r) ** -i.tenor) / r + i.lump_sum / (1 + r) ** i.tenor
    return max(0.0, min(by_ltv, by_dsr) - financed)


@dataclass
class Inputs:
    income: float
    obligations: float
    collateral_value: float
    net_facility: float
    capitalized_charges: float
    down_payment: float
    lump_sum: float
    tenor: int
    requested_rate: float
    screening_clear: bool
    years_of_service: float = 0
    guarantor: bool = False
    crib_status: str = "idle"  # HIT | NO_HIT | idle
    crib_score: float | None = None
    crib_arrears: bool = False
    factors: list = field(default_factory=list)


def assess(i: Inputs) -> dict:
    financed = i.net_facility + i.capitalized_charges
    factors: list[dict] = []
    hard_stops: list[str] = []
    conditions: list[str] = []
    score = 50

    def add(label: str, impact: int, note: str):
        nonlocal score
        score += impact
        factors.append({"label": label, "impact": impact, "note": note})

    ltv = financed / i.collateral_value * 100 if i.collateral_value > 0 else 999.0
    provisional = pmt(financed, max(i.requested_rate, POLICY["base_rate"]), i.tenor, i.lump_sum)
    dsr = (i.obligations + provisional) / i.income * 100 if i.income > 0 else 999.0

    if i.crib_status == "HIT" and i.crib_score is not None:
        add("Bureau score (CRIB)", round(max(-15, min(20, (i.crib_score - 50) * 0.5))), f"Bureau score {i.crib_score}")
    else:
        add("Bureau history", -5, "No bureau hit; not treated as low risk")
    add("Debt service ratio", _band(dsr, [(30, 15), (40, 8), (50, 0)], -15), f"DSR {dsr:.1f}%")
    add("Loan to value", _band(ltv, [(60, 10), (75, 5), (90, 0)], -10), f"LTV {ltv:.1f}%")
    y = i.years_of_service
    add("Employment stability", 5 if y >= 3 else 2 if y >= 1 else -3, f"{y:g} years of service")
    dp = i.down_payment / i.collateral_value * 100 if i.collateral_value > 0 else 0
    add("Customer contribution", 5 if dp >= 20 else 2 if dp >= 10 else 0, f"Down payment {dp:.0f}% of value")
    if i.crib_arrears:
        add("Bureau arrears", -20, "Arrears reported")
    if i.guarantor:
        add("Guarantor", 3, "Guarantor provided")
    score = max(0.0, min(100.0, round(score, 2)))

    if not i.screening_clear:
        hard_stops.append("Screening not cleared")
    if i.collateral_value <= 0:
        hard_stops.append("Collateral value not approved")
    if ltv > POLICY["max_ltv"]:
        hard_stops.append(f"LTV above policy limit of {POLICY['max_ltv']}%")
    if not POLICY["min_tenor"] <= i.tenor <= POLICY["max_tenor"]:
        hard_stops.append(f"Tenor outside {POLICY['min_tenor']}-{POLICY['max_tenor']} months")
    if i.crib_arrears:
        hard_stops.append("Active arrears in bureau report")

    risk_adj = next((adj for m, adj in POLICY["risk_adjustments"] if score >= m), 6.0)
    floor = min(POLICY["max_rate"], round(POLICY["base_rate"] + risk_adj + (1 if ltv > 80 else 0) + (0.5 if i.tenor > 48 else 0), 2))
    approved = min(POLICY["max_rate"], max(floor, i.requested_rate))

    installment = pmt(financed, approved, i.tenor, i.lump_sum)
    dsr = (i.obligations + installment) / i.income * 100 if i.income > 0 else 999.0
    if dsr > POLICY["max_dsr"]:
        hard_stops.append(f"DSR above policy limit of {POLICY['max_dsr']}%")

    if not i.screening_clear:
        outcome = "Compliance hold"
    elif hard_stops or score < 45:
        outcome = "Decline"
    elif score >= 75 and dsr <= 45 and ltv <= 85:
        outcome = "Approve"
    elif score >= 60:
        outcome = "Conditional approve"
    else:
        outcome = "Manual review"

    if outcome == "Conditional approve":
        conditions.append("Comprehensive insurance with lender noted as interested party")
        if not i.guarantor and dsr > 40:
            conditions.append("Guarantor or additional income evidence")
    if outcome == "Manual review":
        conditions.append("Credit officer review of income and commitments")
    if floor > i.requested_rate:
        conditions.append(f"Requested rate {i.requested_rate:g}% is below the risk-based floor of {floor:g}%")

    traffic = {"Approve": "Green", "Conditional approve": "Amber", "Manual review": "Amber"}.get(outcome, "Red")
    return {
        "trafficLight": traffic, "additionalAmount": round(additional_amount(i, approved, financed)),
        "runAt": datetime.now(timezone.utc).isoformat(), "modelVersion": POLICY["version"], "score": score, "outcome": outcome,
        "approvedRate": approved, "floorRate": floor, "requestedRate": i.requested_rate,
        "ltv": ltv, "dsr": dsr, "installment": installment, "totalPayable": installment * i.tenor + i.lump_sum, "financed": financed,
        "factors": factors, "conditions": conditions, "hardStops": hard_stops,
        "needsApprover": financed > POLICY["auto_approve_limit"] or outcome != "Approve",
    }
