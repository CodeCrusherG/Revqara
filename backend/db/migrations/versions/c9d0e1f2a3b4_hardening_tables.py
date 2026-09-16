"""v0.5 backend hardening: webhook_events, ai_traces, message_outbox, sync_runs

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-06-17

Adds the four tables that make Nudge safe for real pilots:
  - webhook_events : inbound idempotency / dedup
  - ai_traces      : per-message AI decision audit log
  - message_outbox : durable outbound send queue (retry + idempotency)
  - sync_runs      : reconciliation job runs
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "c9d0e1f2a3b4"
down_revision = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "webhook_events",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=False), nullable=True),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("provider_event_id", sa.String(), nullable=False),
        sa.Column("message_id", sa.String(), nullable=True),
        sa.Column("payload", JSONB(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="received"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("processed_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("provider", "provider_event_id", name="uq_webhook_provider_event"),
    )
    op.create_index("ix_webhook_events_workspace_id", "webhook_events", ["workspace_id"])

    op.create_table(
        "ai_traces",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=False), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("contact_id", UUID(as_uuid=False), nullable=True),
        sa.Column("lead_id", UUID(as_uuid=False), nullable=True),
        sa.Column("conversation_id", UUID(as_uuid=False), nullable=True),
        sa.Column("inbound_message_id", UUID(as_uuid=False), nullable=True),
        sa.Column("vertical", sa.String(), nullable=True),
        sa.Column("intent", sa.String(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("confidence_source", sa.String(), nullable=True),
        sa.Column("extracted_fields", JSONB(), nullable=True),
        sa.Column("stage_before", sa.String(), nullable=True),
        sa.Column("stage_after", sa.String(), nullable=True),
        sa.Column("tags_added", JSONB(), nullable=True),
        sa.Column("next_action", sa.String(), nullable=True),
        sa.Column("handoff_required", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("handoff_reason", sa.String(), nullable=True),
        sa.Column("fallback_used", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("model_used", sa.String(), nullable=True),
        sa.Column("graph_version", sa.String(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_ai_traces_workspace_id", "ai_traces", ["workspace_id"])
    op.create_index("ix_ai_traces_conversation_id", "ai_traces", ["conversation_id"])

    op.create_table(
        "message_outbox",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=False), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("contact_id", UUID(as_uuid=False), nullable=True),
        sa.Column("conversation_id", UUID(as_uuid=False), nullable=True),
        sa.Column("inbox_message_id", UUID(as_uuid=False), nullable=True),
        sa.Column("channel", sa.String(), nullable=False, server_default="whatsapp"),
        sa.Column("payload", JSONB(), nullable=False),
        sa.Column("idempotency_key", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("next_attempt_at", sa.DateTime(), nullable=True),
        sa.Column("provider_message_id", sa.String(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("workspace_id", "idempotency_key", name="uq_outbox_idem"),
    )
    op.create_index("ix_message_outbox_workspace_id", "message_outbox", ["workspace_id"])
    op.create_index("ix_message_outbox_conversation_id", "message_outbox", ["conversation_id"])
    op.create_index("ix_message_outbox_status", "message_outbox", ["status"])

    op.create_table(
        "sync_runs",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=False), nullable=True),
        sa.Column("sync_type", sa.String(), nullable=False),
        sa.Column("cursor", JSONB(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="running"),
        sa.Column("stats", JSONB(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
    )
    op.create_index("ix_sync_runs_workspace_id", "sync_runs", ["workspace_id"])


def downgrade() -> None:
    op.drop_table("sync_runs")
    op.drop_table("message_outbox")
    op.drop_table("ai_traces")
    op.drop_table("webhook_events")
