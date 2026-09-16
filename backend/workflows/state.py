"""
Shared LangGraph state object passed between all agent nodes.

Status lifecycle:
  profiling → planning → generating → pending_approval
  → approved → executing → monitoring → optimizing → generating (loop)
  or → rejected (terminal on explicit user rejection)
"""
from typing import TypedDict, Any


class CampaignState(TypedDict, total=False):
    # ── Identity ──────────────────────────────────────────────
    campaign_id:  str
    brief:        str           # original brief + any rejection feedback addendum
    status:       str           # mirrors CampaignStatus enum values

    # ── Data flow ─────────────────────────────────────────────
    customer_profiles:    list[dict]   # enriched rows from Profiler
    segment_taxonomy:     dict         # {label: {criteria, customer_ids, count}}
    segments:             list[dict]   # Planner output: A/B groups with send_time
    variants:             list[dict]   # Generator output: {subject, body, ...}

    # ── Predictions & metrics ─────────────────────────────────
    ml_predictions:       dict         # {segment_id: {open_rate, click_rate, ...}}
    api_metrics:          dict         # Analyst output: real EO/EC from /get_report

    # ── Optimization loop ─────────────────────────────────────
    next_strategy:        str          # Optimizer instruction for Generator (iter 2+)
    optimization_history: list[dict]  # [{iteration, winner, changes_made, ...}]

    # ── Transparency ──────────────────────────────────────────
    agent_logs:           list[dict]   # in-memory copy of AgentLog rows
    iteration:            int          # optimization loop counter (starts at 1)
