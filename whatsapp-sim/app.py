"""
WhatsApp Cloud API Simulator
============================

A self-contained, **offline** mock of Meta's *WhatsApp Cloud API*, written in
pure Python / FastAPI. It lets the Nudge backend (which talks to WhatsApp
through the `pywa` client) run end-to-end with **zero external dependencies** —
no Meta account, no credentials, no network egress.

It plays both sides of the Cloud API:

1. **Outbound (Graph API send endpoint).**
   `POST /v{version}/{phone_id}/messages` accepts exactly the payload `pywa`
   emits (text or interactive button messages) and returns the Meta-shaped
   ``{"messaging_product", "contacts": [...], "messages": [{"id": "wamid..."}]}``
   response.

2. **Inbound (webhook events).**
   Immediately after accepting a send, the simulator *schedules* the lifecycle
   webhooks Meta would deliver back to the business webhook:

   * ``sent`` → ``delivered`` status receipts (always),
   * a ``read`` status receipt (with a content-sensitive probability), and
   * an ``interactive.button_reply`` inbound message (a CTA "click", only if the
     message was read).

   Every webhook envelope is signed with ``HMAC-SHA256`` and delivered with the
   ``X-Hub-Signature-256`` header, exactly like Meta — so `pywa`'s signature
   validation passes and it cannot tell the events from real ones.

The read receipt becomes the campaign **EO** (engagement-open) metric and the
button tap becomes **EC** (engagement-click). Engagement is derived from the
message content (length, emoji, URL, CTA button) and seeded by the message id,
so the optimisation loop sees a *meaningful, reproducible* signal: concise,
emoji-rich, CTA-driven copy genuinely earns higher read/click rates.

Envelope schema mirrors the WhatsApp Cloud API webhook payloads
(https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples)
and is kept compatible with Graph API v25 (`contacts[].user_id`).

Browse the live API docs at ``/docs``.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import os
import random
import time
import uuid

import httpx
from fastapi import FastAPI, Path, Request
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("whatsapp-sim")


# ──────────────────────────────────────────────────────────────────────────────
# Configuration (env-driven)
# ──────────────────────────────────────────────────────────────────────────────

class Settings:
    """Runtime configuration, all overridable via environment variables."""

    #: Business webhook the simulator delivers inbound events to (the pywa endpoint).
    WEBHOOK_URL: str = os.environ.get(
        "WA_WEBHOOK_URL", "http://localhost:8000/api/whatsapp/webhook"
    )
    #: Meta App Secret — MUST match the backend's app_secret so signatures validate.
    APP_SECRET: str = os.environ.get("WA_APP_SECRET", "campaignx_sim_secret")
    #: Business identity echoed in webhook envelopes.
    PHONE_NUMBER_ID: str = os.environ.get("WA_PHONE_NUMBER_ID", "1144783542054931")
    DISPLAY_NUMBER: str = os.environ.get("WA_DISPLAY_NUMBER", "918091715374")
    WABA_ID: str = os.environ.get("WA_WABA_ID", "1543168170860436")

    #: Delays (seconds) before each webhook fires — kept small for snappy demos.
    DELAY_DELIVERED: float = float(os.environ.get("WA_DELAY_DELIVERED", "0.15"))
    DELAY_READ: float = float(os.environ.get("WA_DELAY_READ", "0.45"))
    DELAY_CLICK: float = float(os.environ.get("WA_DELAY_CLICK", "0.8"))

    #: Base engagement rates (before content adjustments).
    BASE_DELIVERED_RATE: float = float(os.environ.get("WA_BASE_DELIVERED_RATE", "0.98"))
    BASE_READ_RATE: float = float(os.environ.get("WA_BASE_READ_RATE", "0.55"))
    BASE_CLICK_RATE: float = float(os.environ.get("WA_BASE_CLICK_RATE", "0.22"))

    #: HTTP timeout for delivering a webhook back to the business.
    WEBHOOK_TIMEOUT: float = float(os.environ.get("WA_WEBHOOK_TIMEOUT", "15"))


settings = Settings()


# ──────────────────────────────────────────────────────────────────────────────
# Engagement model — content-sensitive, deterministic per message
# ──────────────────────────────────────────────────────────────────────────────

def _has_emoji(text: str) -> bool:
    return any(ord(c) > 127 for c in text)


def _has_url(text: str) -> bool:
    return "http://" in text or "https://" in text


def engagement_probabilities(body: str, has_button: bool) -> tuple[float, float, float]:
    """
    Derive (delivered, read, click) probabilities from message content.

    The weights reward exactly what the Optimizer agent is told to chase:
    concise copy, an emoji hook, a visible URL, and a clear CTA. This keeps the
    optimisation loop honest — better creative measurably lifts the numbers.
    """
    body = body or ""
    delivered = settings.BASE_DELIVERED_RATE

    read = settings.BASE_READ_RATE
    if _has_emoji(body):
        read += 0.08
    if 20 <= len(body) <= 300:
        read += 0.12
    elif len(body) > 600:
        read -= 0.10
    if _has_url(body):
        read += 0.05
    read = max(0.20, min(0.95, read))

    click = settings.BASE_CLICK_RATE
    if _has_url(body):
        click += 0.15
    if has_button:
        click += 0.12
    if _has_emoji(body):
        click += 0.05
    if 0 < len(body) < 400:
        click += 0.05
    click = max(0.03, min(0.75, click))

    return delivered, read, click


# ──────────────────────────────────────────────────────────────────────────────
# Webhook envelope builders (Meta-shaped, Graph API v25 compatible)
# ──────────────────────────────────────────────────────────────────────────────

def _ts() -> str:
    return str(int(time.time()))


def _contact(recipient: str) -> dict:
    """A v25 contact block — note the required ``user_id`` (bsuid)."""
    return {
        "profile": {"name": f"Contact {recipient[-4:]}"},
        "wa_id": recipient,
        "user_id": f"BSUID{recipient}",
    }


def status_envelope(wamid: str, status: str, recipient: str, tracker: str | None, phone_number_id: str) -> dict:
    """A delivery/read status receipt (``statuses[]`` envelope)."""
    status_obj = {
        "id": wamid,
        "status": status,
        "timestamp": _ts(),
        "recipient_id": recipient,
        "conversation": {"id": f"CONV{recipient}", "origin": {"type": "marketing"}},
        "pricing": {"billable": True, "pricing_model": "CBP", "category": "marketing"},
    }
    if tracker:
        status_obj["biz_opaque_callback_data"] = tracker
    return {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": settings.WABA_ID,
            "changes": [{
                "field": "messages",
                "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {
                        "display_phone_number": settings.DISPLAY_NUMBER,
                        "phone_number_id": phone_number_id,
                    },
                    "contacts": [_contact(recipient)],
                    "statuses": [status_obj],
                },
            }],
        }],
    }


def button_reply_envelope(recipient: str, button_id: str, title: str, context_wamid: str, phone_number_id: str) -> dict:
    """An inbound ``interactive.button_reply`` event — the CTA "click"."""
    return {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": settings.WABA_ID,
            "changes": [{
                "field": "messages",
                "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {
                        "display_phone_number": settings.DISPLAY_NUMBER,
                        "phone_number_id": phone_number_id,
                    },
                    "contacts": [_contact(recipient)],
                    "messages": [{
                        "from": recipient,
                        "id": f"wamid.IN{uuid.uuid4().hex[:18]}",
                        "timestamp": _ts(),
                        "type": "interactive",
                        "context": {
                            "from": settings.DISPLAY_NUMBER,
                            "id": context_wamid,
                        },
                        "interactive": {
                            "type": "button_reply",
                            "button_reply": {"id": button_id, "title": title},
                        },
                    }],
                },
            }],
        }],
    }


# ──────────────────────────────────────────────────────────────────────────────
# Signing + delivery
# ──────────────────────────────────────────────────────────────────────────────

def sign(raw: bytes) -> str:
    """``sha256=<hex>`` HMAC signature, identical to Meta's X-Hub-Signature-256."""
    return "sha256=" + hmac.new(settings.APP_SECRET.encode(), raw, hashlib.sha256).hexdigest()


async def deliver(payload: dict) -> None:
    """Sign and POST one webhook envelope to the business webhook URL."""
    import json

    raw = json.dumps(payload, separators=(",", ":")).encode()
    headers = {"Content-Type": "application/json", "X-Hub-Signature-256": sign(raw)}
    try:
        async with httpx.AsyncClient(timeout=settings.WEBHOOK_TIMEOUT) as client:
            resp = await client.post(settings.WEBHOOK_URL, content=raw, headers=headers)
            logger.info("webhook → %s [%s]", settings.WEBHOOK_URL, resp.status_code)
    except Exception as exc:  # pragma: no cover - best-effort delivery
        logger.warning("webhook delivery failed: %s", exc)


async def run_engagement_lifecycle(
    wamid: str,
    recipient: str,
    tracker: str | None,
    body: str,
    button_id: str | None,
    phone_number_id: str,
) -> None:
    """
    Simulate one recipient's engagement timeline and fire the webhooks.

    Every webhook is stamped with ``phone_number_id`` (the number the campaign
    was sent from) so the backend can route the event to the owning tenant.
    Deterministic per ``wamid`` so reports are reproducible across runs.
    """
    rng = random.Random(int(hashlib.sha256(wamid.encode()).hexdigest(), 16) & 0xFFFFFFFF)
    p_delivered, p_read, p_click = engagement_probabilities(body, has_button=bool(button_id))

    await asyncio.sleep(settings.DELAY_DELIVERED)
    if rng.random() <= p_delivered:
        await deliver(status_envelope(wamid, "delivered", recipient, tracker, phone_number_id))
    else:
        # Undelivered → report a failure (invalid number / not on WhatsApp).
        await deliver(status_envelope(wamid, "failed", recipient, tracker, phone_number_id))
        return

    await asyncio.sleep(max(0.0, settings.DELAY_READ - settings.DELAY_DELIVERED))
    if rng.random() > p_read:
        return  # delivered but not read
    await deliver(status_envelope(wamid, "read", recipient, tracker, phone_number_id))

    if button_id and rng.random() <= p_click:
        await asyncio.sleep(max(0.0, settings.DELAY_CLICK - settings.DELAY_READ))
        await deliver(button_reply_envelope(recipient, button_id, "Explore", wamid, phone_number_id))


# ──────────────────────────────────────────────────────────────────────────────
# FastAPI app
# ──────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="WhatsApp Cloud API Simulator",
    version="1.0.0",
    description=__doc__,
    contact={"name": "Nudge Strategic Labs"},
)


class HealthResponse(BaseModel):
    status: str
    webhook_url: str
    phone_number_id: str


@app.get("/", tags=["meta"], summary="Service banner")
def root():
    """Human-friendly landing payload. See ``/docs`` for the full API."""
    return {
        "service": "WhatsApp Cloud API Simulator",
        "docs": "/docs",
        "send_endpoint": f"/v25.0/{settings.PHONE_NUMBER_ID}/messages",
        "webhook_target": settings.WEBHOOK_URL,
    }


@app.get("/health", response_model=HealthResponse, tags=["meta"], summary="Health check")
def health():
    """Liveness probe used by docker-compose / Render."""
    return HealthResponse(
        status="ok",
        webhook_url=settings.WEBHOOK_URL,
        phone_number_id=settings.PHONE_NUMBER_ID,
    )


def text_inbound_envelope(business_pnid: str, customer: str, name: str, text: str) -> dict:
    """An inbound customer text message webhook (the start of a conversation)."""
    return {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": settings.WABA_ID,
            "changes": [{
                "field": "messages",
                "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {
                        "display_phone_number": settings.DISPLAY_NUMBER,
                        "phone_number_id": business_pnid,
                    },
                    "contacts": [{
                        "profile": {"name": name or f"Customer {customer[-4:]}"},
                        "wa_id": customer,
                        "user_id": f"BSUID{customer}",
                    }],
                    "messages": [{
                        "from": customer,
                        "id": f"wamid.IN{uuid.uuid4().hex[:18]}",
                        "timestamp": _ts(),
                        "type": "text",
                        "text": {"body": text},
                    }],
                },
            }],
        }],
    }


class InboundRequest(BaseModel):
    phone_number_id: str
    from_: str = Field(alias="from")
    name: str | None = None
    text: str


@app.post("/sim/inbound", tags=["simulator"], summary="Fabricate an inbound customer message")
async def sim_inbound(req: InboundRequest):
    """
    Test helper: deliver a signed inbound text-message webhook as if a customer
    messaged the business number `phone_number_id`. Drives the inbox + AI bot.
    """
    env = text_inbound_envelope(req.phone_number_id, req.from_, req.name or "", req.text)
    await deliver(env)
    return {"ok": True, "delivered_to": settings.WEBHOOK_URL}


@app.post(
    "/v{version}/{phone_id}/messages",
    tags=["cloud-api"],
    summary="Send a WhatsApp message (Graph API mock)",
)
async def send_message(
    request: Request,
    version: str = Path(..., description="Graph API version, e.g. 25.0", examples=["25.0"]),
    phone_id: str = Path(..., description="Business phone number id"),
):
    """
    Mock of ``POST https://graph.facebook.com/v{version}/{phone_id}/messages``.

    Accepts the WhatsApp Cloud API send payload (text or interactive button
    message), allocates a ``wamid``, and schedules the inbound engagement
    webhooks (delivered → read → optional click). Returns the standard Meta send
    response so `pywa` parses it transparently.
    """
    payload = await request.json()
    recipient = str(payload.get("to", "")) or "0"

    # Extract the human-visible body + any CTA button id, for the engagement model.
    msg_type = payload.get("type")
    if msg_type == "text":
        body = (payload.get("text") or {}).get("body", "")
        button_id = None
    elif msg_type == "interactive":
        interactive = payload.get("interactive") or {}
        body = (interactive.get("body") or {}).get("text", "")
        button_id = None
        action = interactive.get("action") or {}
        for btn in action.get("buttons", []) or []:
            reply = btn.get("reply") or {}
            if reply.get("id"):
                button_id = reply["id"]
                break
    else:
        body = ""
        button_id = None

    tracker = payload.get("biz_opaque_callback_data")
    wamid = f"wamid.SIM{uuid.uuid4().hex}"
    logger.info("send from phone_number_id=%s → %s", phone_id, recipient)

    # Fire-and-forget the recipient's engagement lifecycle, stamped with the
    # sending number (phone_id from the URL) so the backend routes by tenant.
    asyncio.create_task(
        run_engagement_lifecycle(wamid, recipient, tracker, body, button_id, phone_id)
    )

    return {
        "messaging_product": "whatsapp",
        "contacts": [{"input": recipient, "wa_id": recipient}],
        "messages": [{"id": wamid, "message_status": "accepted"}],
    }
