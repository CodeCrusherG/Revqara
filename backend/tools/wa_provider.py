"""
Outbound WhatsApp provider abstraction.

A thin seam between the outbox worker and however messages actually leave the
system. Today that's the pywa client (pointed at the local simulator); tomorrow
it can be the real WhatsApp Cloud API or another provider, without touching the
outbox logic.
"""
from __future__ import annotations

import os

# Logical provider name stamped onto webhook_events for inbound dedup grouping.
PROVIDER = os.environ.get("WA_PROVIDER", "whatsapp_sim")


def send_text(to: str, text: str, sender: str | None = None) -> str | None:
    """Send a text message and return the provider message id (wamid)."""
    from tools.whatsapp_client import get_whatsapp_client
    sent = get_whatsapp_client().send_message(to=to, text=text, sender=sender)
    return getattr(sent, "id", None)
