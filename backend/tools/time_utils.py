"""Utilities for validating and normalizing campaign send times (IST)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

IST_OFFSET = timezone(timedelta(hours=5, minutes=30))
SEND_TIME_FORMAT = "%d:%m:%y %H:%M:%S"


def format_future_ist_time(min_minutes_ahead: int = 30) -> str:
    """Return a valid future send_time string in IST."""
    now_ist = datetime.now(IST_OFFSET)
    future_ist = now_ist + timedelta(minutes=max(min_minutes_ahead, 1))
    return future_ist.strftime(SEND_TIME_FORMAT)


def parse_send_time_ist(send_time: str) -> datetime:
    """Parse a send_time string in expected format as an IST datetime."""
    parsed = datetime.strptime(send_time.strip(), SEND_TIME_FORMAT)
    return parsed.replace(tzinfo=IST_OFFSET)


def normalize_send_time(send_time: str | None, min_minutes_ahead: int = 30) -> str:
    """
    Ensure send_time is valid format and in the future.

    Falls back to a generated future IST timestamp when input is missing,
    placeholder-like, malformed, or not in the future.
    """
    raw = (send_time or "").strip()
    if not raw:
        return format_future_ist_time(min_minutes_ahead)

    upper_raw = raw.upper()
    if "DD:MM:YY" in upper_raw or "HH:MM:SS" in upper_raw:
        return format_future_ist_time(min_minutes_ahead)

    try:
        parsed = parse_send_time_ist(raw)
    except ValueError:
        return format_future_ist_time(min_minutes_ahead)

    now_ist = datetime.now(IST_OFFSET)
    if parsed <= now_ist:
        return format_future_ist_time(min_minutes_ahead)

    return parsed.strftime(SEND_TIME_FORMAT)
