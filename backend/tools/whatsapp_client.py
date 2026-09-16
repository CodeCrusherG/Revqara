"""
pywa WhatsApp client integration.

Owns the singleton `pywa.WhatsApp` client used to send campaign messages and to
receive engagement webhooks. The client's outbound base URL is redirected to the
local **WhatsApp Cloud API Simulator**, so the whole system runs offline with no
Meta credentials and no external network calls.

Two webhook handlers translate simulator events into campaign metrics:
  * ``on_message_status`` — a ``read`` receipt marks the message read  → **EO**.
  * ``on_callback_button`` — a CTA button tap marks the message clicked → **EC**.

Both events carry the tracker ``"{broadcast_id}:{customer_id}"`` (sent as
``biz_opaque_callback_data`` / button ``callback_data``), which uniquely
identifies the ``WhatsAppMessage`` row to update.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime

import httpx

from db.database import SessionLocal
from db.models import WhatsAppAccount, WhatsAppMessage

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────
WA_SIM_URL       = os.environ.get("WA_SIM_URL", "http://whatsapp-sim:9000")
WA_API_VERSION   = os.environ.get("WA_API_VERSION", "25.0")
WA_PHONE_ID      = os.environ.get("WA_PHONE_NUMBER_ID", "1144783542054931")
WA_TOKEN         = os.environ.get("WA_TOKEN", "SIMULATED_TOKEN")
WA_APP_SECRET    = os.environ.get("WA_APP_SECRET", "campaignx_sim_secret")
WA_APP_ID        = os.environ.get("WA_APP_ID", "000000000000000")
WA_VERIFY_TOKEN  = os.environ.get("WA_VERIFY_TOKEN", "campaignx_verify")
WA_WEBHOOK_PATH  = os.environ.get("WA_WEBHOOK_PATH", "/api/whatsapp/webhook")
WA_CTA_TITLE     = os.environ.get("WA_CTA_TITLE", "Explore")

_client = None  # module-level singleton


def _sim_base_url() -> "httpx.URL":
    return httpx.URL(f"{WA_SIM_URL.rstrip('/')}/v{WA_API_VERSION}/")


def _build_client(server=None):
    """Construct a pywa client, redirected at the simulator. `server` mounts webhooks."""
    from pywa import WhatsApp

    wa = WhatsApp(
        phone_id=WA_PHONE_ID,
        token=WA_TOKEN,
        session=httpx.Client(),
        server=server,
        webhook_endpoint=WA_WEBHOOK_PATH,
        verify_token=WA_VERIFY_TOKEN,
        app_id=WA_APP_ID,
        app_secret=WA_APP_SECRET,
        api_version=float(WA_API_VERSION),
        # Multi-tenant: one app receives webhooks for MANY tenant numbers, so we
        # must NOT filter out events whose phone_number_id isn't this client's.
        filter_updates=False,
    )
    # Redirect outbound Graph API calls to the local simulator (pywa hardcodes
    # graph.facebook.com in GraphAPI.__init__, so we override after construction).
    wa.api._session.base_url = _sim_base_url()
    return wa


def init_whatsapp(server) -> "object":
    """
    Build the singleton client mounted on the given FastAPI/Flask `server`
    (registers the webhook routes) and wire up the engagement handlers.
    Call once at application startup.
    """
    global _client
    if _client is not None:
        return _client

    wa = _build_client(server=server)
    _register_handlers(wa)
    _client = wa
    logger.info(
        "pywa client initialised — sending via %s, webhook at %s",
        _sim_base_url(), WA_WEBHOOK_PATH,
    )
    return wa


def get_whatsapp_client():
    """
    Return the singleton client. If the app never initialised one (e.g. a
    standalone script), lazily build a send-only client (no webhook server).
    """
    global _client
    if _client is None:
        logger.warning("pywa client not initialised by app — building send-only client")
        _client = _build_client(server=None)
    return _client


# ── Webhook handlers ────────────────────────────────────────────────────────────

def _route_workspace(db, update) -> str | None:
    """
    Resolve the owning workspace for an inbound event by its phone_number_id
    (the number the event arrived on) — the multi-tenant routing key. Returns
    None for the shared default number (unconnected workspaces).
    """
    pnid = getattr(getattr(update, "metadata", None), "phone_number_id", None)
    if not pnid:
        return None
    acct = db.query(WhatsAppAccount).filter(WhatsAppAccount.phone_number_id == pnid).first()
    return acct.workspace_id if acct else None


def _register_handlers(wa) -> None:
    from pywa import types

    @wa.on_message_status
    def _on_status(_, status: "types.MessageStatus"):
        tracker = status.tracker
        if not tracker:
            return
        name = status.status.name  # SENT | DELIVERED | READ | FAILED | ...
        db = SessionLocal()
        try:
            _route_workspace(db, status)  # route by phone_number_id (multi-tenant)
            row = db.query(WhatsAppMessage).filter(WhatsAppMessage.tracker == tracker).first()
            if not row:
                return
            if not row.wamid:
                row.wamid = status.id
            if name == "READ":
                row.status = "read"
            elif name == "DELIVERED" and row.status == "sent":
                row.status = "delivered"
            elif name == "FAILED":
                row.status = "failed"
            db.commit()
        finally:
            db.close()

    @wa.on_callback_button
    def _on_click(_, btn: "types.CallbackButton"):
        tracker = btn.data
        if not tracker:
            return
        db = SessionLocal()
        try:
            row = db.query(WhatsAppMessage).filter(WhatsAppMessage.tracker == tracker).first()
            if not row:
                return
            row.clicked = True
            if row.status in ("sent", "delivered"):
                row.status = "read"  # a click implies the message was read
            db.commit()
        finally:
            db.close()

    @wa.on_message
    def _on_message(client, msg: "types.Message"):
        """Inbound customer message → delegate to the hardened, idempotent service."""
        from services.inbound import process_inbound_message
        from tools.wa_provider import PROVIDER

        pnid = getattr(getattr(msg, "metadata", None), "phone_number_id", None)
        wa_id = getattr(getattr(msg, "from_user", None), "wa_id", None)
        if not wa_id:
            return
        name = getattr(getattr(msg, "from_user", None), "name", None)
        text = getattr(msg, "text", None)
        # The wamid uniquely identifies this delivery — our idempotency key.
        provider_event_id = getattr(msg, "id", None) or f"{pnid}:{wa_id}:{hash((wa_id, text))}"

        db = SessionLocal()
        try:
            process_inbound_message(
                db, provider=PROVIDER, provider_event_id=provider_event_id,
                phone_number_id=pnid, wa_id=wa_id, name=name, text=text,
            )
        except Exception as exc:  # pragma: no cover
            logger.warning("[inbox] inbound processing failed: %s", exc)
        finally:
            db.close()
