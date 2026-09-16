"""
Quota + agent-logging helpers.

Historically this module also held an OpenAPI→LangChain ``ToolFactory`` that made
live HTTP calls to an external campaign API. That dependency has been removed —
campaigns now run entirely against the local WhatsApp CRM + Cloud API Simulator
(see ``tools/campaign_api_tools.py`` and ``tools/whatsapp_client.py``).

What remains are the DB-only helpers still used across the codebase:
  * a simple per-endpoint **daily-quota meter** (drives the "Strategic Capacity"
    UI; now a purely local, simulated budget), and
  * ``_write_agent_log`` for the glass-box agent trace.
"""
from __future__ import annotations

import os
from datetime import date

from sqlalchemy.orm import Session

from db.models import ApiCallLog, AgentLog

RATE_LIMIT = 100  # simulated calls per endpoint per UTC day


class QuotaExceededException(Exception):
    """Raised when the (simulated) daily quota for an endpoint is reached."""
    pass


def _check_and_increment_quota(db: Session, endpoint: str) -> None:
    """
    Check ApiCallLog for today's count and increment it. Raises
    QuotaExceededException if the simulated daily limit is reached.
    """
    today = date.today()
    row = (
        db.query(ApiCallLog)
        .filter(ApiCallLog.endpoint == endpoint, ApiCallLog.date_utc == today)
        .first()
    )

    if row is None:
        row = ApiCallLog(endpoint=endpoint, date_utc=today, call_count=0)
        db.add(row)
        db.flush()

    if row.call_count >= RATE_LIMIT:
        raise QuotaExceededException(
            f"Simulated daily quota reached for '{endpoint}': {row.call_count}/{RATE_LIMIT} calls today (UTC)."
        )

    row.call_count += 1
    db.commit()


def quota_key_for_endpoint(endpoint_path: str, api_key: str | None = None) -> str:
    """
    Build a quota key scoped by endpoint. The optional key suffix is retained
    for backwards-compatible keys, but the system no longer uses any API key.
    """
    key = api_key if api_key is not None else os.environ.get("WA_APP_SECRET", "")
    suffix = (key[-8:] if key else "local")
    return f"{endpoint_path}::{suffix}"


def _write_agent_log(
    db: Session,
    campaign_id: str | None,
    agent_name: str,
    operation_id: str,
    input_payload: dict,
    output_payload: dict,
) -> None:
    """Persist a tool invocation to AgentLog for the glass-box trace."""
    log = AgentLog(
        campaign_id=campaign_id,
        agent_name=agent_name,
        step=None,
        input_payload=input_payload,
        output_payload=output_payload,
        llm_reasoning=f"Tool invoked: {operation_id}",
    )
    db.add(log)
    db.commit()
