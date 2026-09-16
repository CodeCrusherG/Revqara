# Local development

How to run Nudge directly on your machine (backend + frontend + simulator),
outside of `docker compose`. For the all-Docker path, use `docker compose up`.

## 1. Infrastructure (Postgres + simulator)

Postgres and the WhatsApp simulator run as containers. Postgres is published on
host port **5434** (container `cx-pg`):

```bash
docker compose up -d db whatsapp-sim
docker ps   # confirm cx-pg is up and mapping 0.0.0.0:5434->5432
```

> Ollama (the optional LLM) runs on the host: `ollama serve`. The graph works
> without it — it falls back to deterministic, vertical-aware behavior.

## 2. Environment

The base `.env` holds Docker-network values (service hostnames `db` /
`whatsapp-sim`, in-container Postgres creds). To run the backend on your host,
layer a local override on top:

```bash
cp .env.local.example .env.local   # one-time; .env.local is gitignored
```

`.env.local` repoints Postgres to `localhost:5434` (password `secret`), the
simulator to `localhost:9000`, and Ollama to `localhost:11434`.

## 3. Backend (FastAPI on :8000)

Source `.env` then `.env.local` so the local values win, and run uvicorn:

```bash
cd backend
set -a
source ../.env
source ../.env.local
set +a

../.backend-venv/bin/uvicorn main:app --reload --port 8000
```

- API docs: http://localhost:8000/docs
- `--reload` picks up code changes automatically (the `.env`-only run does not).

## 4. Frontend (Vite on :5173)

```bash
cd frontend
npm install      # first time
npm run dev      # http://localhost:5173
```

Production build check: `npx vite build`.

## 5. Demo data

Seed cross-vertical demo conversations and leads (idempotent):

```bash
cd backend
set -a; source ../.env; source ../.env.local; set +a
../.backend-venv/bin/python scripts/seed_demo.py
```

This creates one demo workspace per vertical (coaching, clinic, real_estate,
salon, ecommerce, b2b, travel, political_party) with representative WhatsApp
conversations so the "same graph, different business brain" story is easy to
show.

## Running the backend tests

The hardening suite (idempotency, vertical transitions, handoffs, opt-out,
outbox retry/idempotency, tenant scoping) runs against Postgres but rolls back
every test, so it never pollutes data:

```bash
cd backend
set -a; source ../.env; source ../.env.local; set +a
PYTHONPATH=. ../.backend-venv/bin/python -m pytest
```

## Demo login

- Email: `demo@campaignx.app`
- Password: `demo1234`

## Common gotchas

| Symptom | Cause | Fix |
| --- | --- | --- |
| `could not translate host name "db"` | `.env.local` not sourced | source it after `.env` |
| `role "campaignx" does not exist` | hitting a different Postgres on `:5432` | use `POSTGRES_PORT=5434` |
| `password authentication failed` | base `.env` password used | `.env.local` sets `POSTGRES_PASSWORD=secret` |
| backend ignores code edits | started without `--reload` | add `--reload` |
