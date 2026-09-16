"""
AI auto-reply for the WhatsApp inbox.

Generates a short, on-brand support/sales reply from the tenant's bot config
(persona prompt + pasted knowledge base) and recent conversation history. Uses
Ollama when available and falls back to a safe canned reply otherwise, so the
inbox never goes silent.
"""
from __future__ import annotations

import logging
import os

from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_ollama import ChatOllama

logger = logging.getLogger(__name__)

DEFAULT_PROMPT = (
    "You are a helpful WhatsApp assistant for a business. Answer customer questions "
    "concisely and politely, help capture leads (ask for name, need, and contact "
    "preference when relevant), and offer to connect a human if you are unsure."
)


def _llm():
    return ChatOllama(
        model=os.environ.get("OLLAMA_MODEL", "mistral:latest"),
        base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
        temperature=0.4,
        num_predict=300,
    )


def _fallback_reply(user_text: str, business: str | None, handoff: bool) -> str:
    base = (
        f"Thanks for messaging {business or 'us'}! 🙏 We've noted your query: "
        f"\"{(user_text or '').strip()[:120]}\". "
        "Could you share a bit more so we can help?"
    )
    if handoff:
        base += " You can also type 'agent' to talk to a person."
    return base


def generate_bot_reply(bot, history: list[dict], user_text: str, business: str | None = None) -> str:
    """
    history: list of {"sender": "customer"|"bot"|"agent", "text": str} oldest→newest.
    Returns the reply text (always returns something).
    """
    system = (bot.prompt or DEFAULT_PROMPT) if bot else DEFAULT_PROMPT
    if bot and bot.knowledge:
        system += f"\n\nBusiness knowledge / FAQ:\n{bot.knowledge[:4000]}"
    if bot and bot.handoff_enabled:
        system += "\n\nIf the user asks for a human or you cannot help, tell them you'll connect a human agent."

    msgs = [SystemMessage(content=system)]
    for h in history[-8:]:
        if h.get("sender") == "customer":
            msgs.append(HumanMessage(content=h.get("text") or ""))
        else:
            msgs.append(AIMessage(content=h.get("text") or ""))
    msgs.append(HumanMessage(content=user_text or ""))

    try:
        resp = _llm().invoke(msgs)
        text = (resp.content or "").strip()
        if not text:
            raise ValueError("empty reply")
        return text[:1000]
    except Exception as exc:
        logger.warning("[bot] LLM unavailable (%s) — using fallback reply", exc)
        return _fallback_reply(user_text, business, bool(bot and bot.handoff_enabled))


def wants_human(text: str) -> bool:
    t = (text or "").lower()
    return any(k in t for k in ("agent", "human", "representative", "talk to someone", "speak to"))


# Intent → keywords for lightweight lead / booking-enquiry capture.
_INTENTS = {
    "booking": ("book", "appointment", "schedule", "slot", "reserve", "site visit", "visit"),
    "pricing": ("price", "pricing", "cost", "quote", "how much", "rate", "fees"),
    "order": ("order", "buy", "purchase", "delivery", "checkout"),
    "interest": ("interested", "demo", "enquiry", "enquire", "inquiry", "details", "brochure"),
}


def detect_intent(text: str) -> str | None:
    """Return a coarse lead intent if the message looks like a sales/booking enquiry."""
    t = (text or "").lower()
    for intent, kws in _INTENTS.items():
        if any(k in t for k in kws):
            return intent
    return None
