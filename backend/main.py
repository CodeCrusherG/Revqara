"""
FastAPI application entry point for Nudge.

Features:
    - CORS configured for localhost and OrbStack frontend hosts
    - GET /health — checks DB connectivity
    - Mounts campaign and approval routers
"""
import os
import logging
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from db.database import engine, SessionLocal
from db.models import Campaign, CampaignStatus
from api import campaigns, approval, analytics, auth, contacts, billing, whatsapp_accounts, inbox, templates, leads, verticals, workspaces, team, sales_teams
from tools.whatsapp_client import init_whatsapp
from workflows.langgraph_flow import run_campaign_workflow

logger = logging.getLogger(__name__)
SCHEDULER_INTERVAL = int(os.environ.get("WA_SCHEDULER_INTERVAL", "20"))
OUTBOX_INTERVAL = int(os.environ.get("WA_OUTBOX_INTERVAL", "3"))
SYNC_INTERVAL = int(os.environ.get("WA_SYNC_INTERVAL", "300"))


def _outbox_loop():
    """Drain the outbound message outbox with retry/backoff."""
    from tools.outbox import process_outbox
    while True:
        try:
            db = SessionLocal()
            try:
                process_outbox(db)
            finally:
                db.close()
        except Exception as exc:  # pragma: no cover
            logger.warning("[outbox] loop error: %s", exc)
        time.sleep(OUTBOX_INTERVAL)


def _sync_loop():
    """Periodic reconciliation (stuck sends, lead consistency, campaign stats)."""
    from services.sync import run_all_syncs
    while True:
        time.sleep(SYNC_INTERVAL)
        try:
            db = SessionLocal()
            try:
                run_all_syncs(db)
            finally:
                db.close()
        except Exception as exc:  # pragma: no cover
            logger.warning("[sync] loop error: %s", exc)


def _scheduler_loop():
    """Launch scheduled campaigns whose send time has arrived. (Production would
    use a real job queue; this in-process poller keeps the demo self-contained.)"""
    while True:
        try:
            db = SessionLocal()
            try:
                due = (db.query(Campaign)
                       .filter(Campaign.status == CampaignStatus.scheduled,
                               Campaign.scheduled_at <= datetime.utcnow())
                       .all())
                for c in due:
                    cid, brief = c.id, c.brief
                    c.status = CampaignStatus.profiling
                    db.commit()
                    logger.info("[Scheduler] launching scheduled campaign %s", cid)
                    threading.Thread(target=run_campaign_workflow, args=(cid, brief), daemon=True).start()
            finally:
                db.close()
        except Exception as exc:  # pragma: no cover
            logger.warning("[Scheduler] loop error: %s", exc)
        time.sleep(SCHEDULER_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    # Verify DB connection on startup
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    threading.Thread(target=_scheduler_loop, daemon=True).start()
    threading.Thread(target=_outbox_loop, daemon=True).start()
    threading.Thread(target=_sync_loop, daemon=True).start()
    yield
    engine.dispose()


app = FastAPI(
    title="Nudge Backend",
    description="AI multi-agent campaign automation system",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_origin_regex=".*",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── WhatsApp (pywa) ─────────────────────────────────────────────────────────────
# Mounts the webhook routes (GET challenge + POST events) on this app and wires
# the read→EO / click→EC engagement handlers. Outbound sends are redirected to
# the local WhatsApp Cloud API Simulator, so no external calls are ever made.
init_whatsapp(app)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router, prefix="/api", tags=["auth"])
app.include_router(contacts.router, prefix="/api", tags=["contacts"])
app.include_router(billing.router, prefix="/api", tags=["billing"])
app.include_router(whatsapp_accounts.router, prefix="/api", tags=["whatsapp"])
app.include_router(inbox.router, prefix="/api", tags=["inbox"])
app.include_router(templates.router, prefix="/api", tags=["templates"])
app.include_router(leads.router, prefix="/api", tags=["leads"])
app.include_router(verticals.router, prefix="/api", tags=["verticals"])
app.include_router(workspaces.router, prefix="/api", tags=["workspaces"])
app.include_router(team.router, prefix="/api", tags=["team"])
app.include_router(sales_teams.router, prefix="/api", tags=["sales-teams"])
app.include_router(campaigns.router, prefix="/api", tags=["campaigns"])
app.include_router(approval.router, prefix="/api", tags=["approval"])
app.include_router(analytics.router, prefix="/api", tags=["analytics"])


# ── Health check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
def health_check():
    """Returns 200 OK with DB connectivity status."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as exc:
        db_status = f"error: {exc}"
    return {"status": "ok", "db": db_status}
