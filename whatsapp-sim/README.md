# WhatsApp Cloud API Simulator

A self-contained, **offline** mock of Meta's **WhatsApp Cloud API**, written in
pure Python + FastAPI. It lets the Nudge backend run its full WhatsApp
campaign loop — send → delivered → read → click — with **no Meta account, no
credentials, and no external network calls**.

> Inspired by [`wa-webhook-sim`](https://github.com/) (Node) and built to pair
> with the [`pywa`](https://github.com/david-lev/pywa) client the backend uses.

## What it does

It plays both halves of the Cloud API:

| Side | Endpoint | Behaviour |
|---|---|---|
| **Outbound** | `POST /v{version}/{phone_id}/messages` | Accepts the exact payload `pywa` sends (text / interactive button), returns the Meta-shaped `{messages:[{id:"wamid…"}]}` response. |
| **Inbound** | _(pushed)_ | Schedules the lifecycle webhooks Meta would send back: `delivered` → `read` status receipts and an `interactive.button_reply` "click", all **HMAC-SHA256 signed** (`X-Hub-Signature-256`). |

The **read receipt** drives the campaign **EO** (open) metric; the **button
tap** drives **EC** (click).

## Content-sensitive engagement

Read/click probabilities are derived from the message itself — concise copy, an
emoji hook, a visible URL, and a CTA button all lift the numbers — and seeded by
the message id, so results are **reproducible** and the optimisation loop gets a
genuine signal. Tune via the `WA_BASE_*` / `WA_DELAY_*` env vars (see
`.env.example`).

## Run

```bash
cp .env.example .env          # point WA_WEBHOOK_URL at your backend webhook
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 9000 --reload
```

Interactive API docs: <http://localhost:9000/docs>

Under docker-compose this service starts automatically as `whatsapp-sim`, with
`WA_WEBHOOK_URL` already pointed at the backend container.

## Why signing matters

`pywa` validates `X-Hub-Signature-256` on every inbound event. The simulator's
`WA_APP_SECRET` **must equal** the backend's `WA_APP_SECRET`, otherwise the
backend rejects the webhooks. Both default to `campaignx_sim_secret`.

Schema reference (the payloads this mirrors):
<https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples>
