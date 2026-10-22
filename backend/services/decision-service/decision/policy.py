"""Illustrative lending policy. Replace with the lender's approved matrix; keep it versioned and loaded per tenant/product."""
POLICY = {
    "version": "rules-v1.0 (illustrative)",
    "base_rate": 18.5,
    "max_rate": 28.0,
    "auto_approve_limit": 5_000_000,
    "max_ltv": 90,
    "max_dsr": 60,
    "min_tenor": 6,
    "max_tenor": 84,
    "risk_adjustments": [(80, 0.0), (70, 1.5), (60, 3.0), (50, 4.5)],  # (min score, rate adjustment)
}
