"""
Heuristic Engagement Predictor for Nudge.

Uses the 17 real fields from the live cohort API to estimate
open rate and click rate per customer and per segment.

No ML training required — fast, transparent, glass-box scoring.
Weights are grounded in digital marketing benchmarks.
"""
from collections import Counter
from typing import Any

# ── Constants ─────────────────────────────────────────────────────────────────

TIER1_CITIES = {
    "Delhi", "Mumbai", "Bangalore", "Bengaluru",
    "Hyderabad", "Chennai", "Pune", "Kolkata",
}

HIGH_ENGAGEMENT_HOURS = {8, 9, 12, 13, 18, 19, 20}   # IST send-time peaks
NIGHT_HOURS           = {0, 1, 2, 3, 4, 5}            # penalty window


# ── Core scoring function ─────────────────────────────────────────────────────

def calculate_engagement_score(
    customer_profile: dict[str, Any],
    variant: dict[str, Any],
    send_time: str,
) -> dict[str, Any]:
    """
    Predict open rate and click rate for one customer × one variant.

    Args:
        customer_profile: Raw cohort row (from DB or API response).
        variant: Dict with keys: subject (str|None), body (str),
                 has_emoji (bool), has_url (bool).
        send_time: String in format 'DD:MM:YY HH:MM:SS' IST.

    Returns:
        {
            open_rate:      float [0, 0.40],
            click_rate:     float [0, 0.20],
            weighted_score: float  (click*0.70 + open*0.30),
            confidence:     'High' | 'Medium' | 'Low',
            signals_fired:  list[str]   # for Glass-Box dashboard
        }
    """
    signals: list[str] = []

    # ── Parse send hour ───────────────────────────────────────────────────────
    try:
        send_hour = int(send_time.split(" ")[1].split(":")[0])
    except (IndexError, ValueError):
        send_hour = -1

    # ── Extract cohort fields (safe .get with defaults) ───────────────────────
    age              = _int(customer_profile.get("Age") or customer_profile.get("age"))
    gender           = str(customer_profile.get("Gender") or customer_profile.get("gender") or "").strip()
    monthly_income   = _int(customer_profile.get("Monthly_Income") or customer_profile.get("monthly_income"))
    credit_score     = _int(customer_profile.get("Credit score") or customer_profile.get("credit_score"))
    kyc_status       = str(customer_profile.get("KYC status") or customer_profile.get("kyc_status") or "N").strip()
    app_installed    = str(customer_profile.get("App_Installed") or customer_profile.get("app_installed") or "N").strip()
    existing_cust    = str(customer_profile.get("Existing Customer") or customer_profile.get("existing_customer") or "N").strip()
    social_active    = str(customer_profile.get("Social_Media_Active") or customer_profile.get("social_media_active") or "N").strip()
    occ_type         = str(customer_profile.get("Occupation type") or customer_profile.get("occupation_type") or "").strip()
    city             = str(customer_profile.get("City") or customer_profile.get("city") or "").strip()

    subject          = str(variant.get("subject") or "")
    body             = str(variant.get("body") or "")
    has_emoji        = bool(variant.get("has_emoji", False))
    has_url          = bool(variant.get("has_url", False))

    # ══════════════════════════════════════════════════════════════════════════
    # OPEN RATE
    # ══════════════════════════════════════════════════════════════════════════
    open_score = 0.06  # base

    # Customer signals
    if app_installed == "Y":
        open_score += 0.10
        signals.append("app_installed=Y (+0.10 open)")

    if existing_cust == "Y":
        open_score += 0.08
        signals.append("existing_customer=Y (+0.08 open)")

    if kyc_status == "Y":
        open_score += 0.06
        signals.append("kyc_status=Y (+0.06 open)")

    if social_active == "Y":
        open_score += 0.05
        signals.append("social_media_active=Y (+0.05 open)")

    if gender.lower() == "female":
        open_score += 0.03
        signals.append("gender=Female (+0.03 open)")

    if age is not None and 25 <= age <= 45:
        open_score += 0.02
        signals.append(f"age={age} in 25-45 (+0.02 open)")

    if occ_type.lower() == "full-time":
        open_score += 0.02
        signals.append("occupation_type=Full-time (+0.02 open)")

    if city in TIER1_CITIES:
        open_score += 0.02
        signals.append(f"city={city} Tier-1 (+0.02 open)")

    if monthly_income is not None and monthly_income > 300_000:
        open_score += 0.015
        signals.append(f"monthly_income={monthly_income}>300k (+0.015 open)")

    if credit_score is not None and credit_score > 650:
        open_score += 0.01
        signals.append(f"credit_score={credit_score}>650 (+0.01 open)")

    # Send-time signals
    if send_hour in HIGH_ENGAGEMENT_HOURS:
        open_score += 0.03
        signals.append(f"send_hour={send_hour} peak (+0.03 open)")
    elif send_hour in NIGHT_HOURS:
        open_score -= 0.02
        signals.append(f"send_hour={send_hour} night (-0.02 open)")

    # Content signals
    if _has_emoji_in_text(subject):
        open_score += 0.02
        signals.append("emoji_in_subject (+0.02 open)")

    if 30 <= len(subject) <= 60:
        open_score += 0.01
        signals.append(f"subject_len={len(subject)} optimal (+0.01 open)")
    elif len(subject) > 100:
        open_score -= 0.01
        signals.append(f"subject_len={len(subject)} too_long (-0.01 open)")

    open_score = round(min(0.40, max(0.0, open_score)), 4)

    # ══════════════════════════════════════════════════════════════════════════
    # CLICK RATE  (separate model, lower ceiling)
    # ══════════════════════════════════════════════════════════════════════════
    click_score = 0.03  # base

    if has_url:
        click_score += 0.08
        signals.append("has_url=True (+0.08 click)")

    if existing_cust == "Y":
        click_score += 0.06
        signals.append("existing_customer=Y (+0.06 click)")

    if social_active == "Y":
        click_score += 0.04
        signals.append("social_media_active=Y (+0.04 click)")

    if kyc_status == "Y":
        click_score += 0.04
        signals.append("kyc_status=Y (+0.04 click)")

    if monthly_income is not None and monthly_income > 400_000:
        click_score += 0.03
        signals.append(f"monthly_income={monthly_income}>400k (+0.03 click)")

    if age is not None and 18 <= age <= 35:
        click_score += 0.02
        signals.append(f"age={age} in 18-35 (+0.02 click)")

    if app_installed == "Y":
        click_score += 0.02
        signals.append("app_installed=Y (+0.02 click)")

    if has_emoji:
        click_score += 0.015
        signals.append("has_emoji=True (+0.015 click)")

    if 0 < len(body) < 400:
        click_score += 0.01
        signals.append(f"body_len={len(body)}<400 concise (+0.01 click)")

    if city in TIER1_CITIES:
        click_score += 0.01
        signals.append(f"city={city} Tier-1 (+0.01 click)")

    click_score = round(min(0.20, max(0.0, click_score)), 4)

    # ── Derived metrics ───────────────────────────────────────────────────────
    weighted = round(click_score * 0.70 + open_score * 0.30, 4)

    if open_score > 0.20:
        confidence = "High"
    elif open_score > 0.12:
        confidence = "Medium"
    else:
        confidence = "Low"

    return {
        "open_rate":      open_score,
        "click_rate":     click_score,
        "weighted_score": weighted,
        "confidence":     confidence,
        "signals_fired":  signals,
    }


# ── Segment-level aggregation ─────────────────────────────────────────────────

def score_segment(
    customer_profiles: list[dict[str, Any]],
    variant: dict[str, Any],
    send_time: str,
) -> dict[str, Any]:
    """
    Score an entire segment and return aggregate statistics.

    Args:
        customer_profiles: List of raw cohort dicts for customers in the segment.
        variant: Same variant dict as calculate_engagement_score.
        send_time: Same format as calculate_engagement_score.

    Returns:
        {
            mean_open_rate, mean_click_rate, mean_weighted_score,
            confidence,
            top_signals: list of (signal_str, count) for the 5 most common signals,
            sample_size: int
        }
    """
    if not customer_profiles:
        return {
            "mean_open_rate": 0.0,
            "mean_click_rate": 0.0,
            "mean_weighted_score": 0.0,
            "confidence": "Low",
            "top_signals": [],
            "sample_size": 0,
        }

    all_signals: list[str] = []
    total_open = total_click = total_weighted = 0.0

    for profile in customer_profiles:
        result = calculate_engagement_score(profile, variant, send_time)
        total_open    += result["open_rate"]
        total_click   += result["click_rate"]
        total_weighted += result["weighted_score"]
        all_signals.extend(result["signals_fired"])

    n = len(customer_profiles)
    mean_open     = round(total_open / n, 4)
    mean_click    = round(total_click / n, 4)
    mean_weighted = round(total_weighted / n, 4)

    if mean_open > 0.20:
        confidence = "High"
    elif mean_open > 0.12:
        confidence = "Medium"
    else:
        confidence = "Low"

    top_signals = Counter(all_signals).most_common(5)

    return {
        "mean_open_rate":      mean_open,
        "mean_click_rate":     mean_click,
        "mean_weighted_score": mean_weighted,
        "confidence":          confidence,
        "top_signals":         top_signals,
        "sample_size":         n,
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _int(val: Any) -> int | None:
    """Safely coerce to int."""
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _has_emoji_in_text(text: str) -> bool:
    """Check if string contains at least one emoji character."""
    return any(ord(c) > 127 for c in text)
