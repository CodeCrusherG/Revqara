"""inbox: bots, conversations, inbox_messages

Adds the conversational inbox + AI auto-reply bot tables.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-06-17 01:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bots",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("workspace_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("handoff_enabled", sa.Boolean(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("prompt", sa.Text(), nullable=True),
        sa.Column("knowledge", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", name="uq_bot_workspace"),
    )
    op.create_index(op.f("ix_bots_workspace_id"), "bots", ["workspace_id"], unique=True)

    op.create_table(
        "conversations",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("workspace_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("phone_number_id", sa.String(), nullable=False),
        sa.Column("customer_wa_id", sa.String(), nullable=False),
        sa.Column("customer_name", sa.String(), nullable=True),
        sa.Column("contact_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("auto_reply", sa.Boolean(), nullable=False),
        sa.Column("unread", sa.Boolean(), nullable=False),
        sa.Column("last_inbound_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.ForeignKeyConstraint(["contact_id"], ["contacts.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "phone_number_id", "customer_wa_id", name="uq_conversation"),
    )
    op.create_index(op.f("ix_conversations_workspace_id"), "conversations", ["workspace_id"], unique=False)

    op.create_table(
        "inbox_messages",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("workspace_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("conversation_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("direction", sa.String(), nullable=False),
        sa.Column("sender", sa.String(), nullable=False),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("wamid", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_inbox_messages_workspace_id"), "inbox_messages", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_inbox_messages_conversation_id"), "inbox_messages", ["conversation_id"], unique=False)


def downgrade() -> None:
    op.drop_table("inbox_messages")
    op.drop_table("conversations")
    op.drop_index(op.f("ix_bots_workspace_id"), table_name="bots")
    op.drop_table("bots")
