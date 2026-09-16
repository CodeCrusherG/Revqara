"""whatsapp_messages

Adds the whatsapp_messages table that tracks each outbound WhatsApp message and
its engagement lifecycle (delivered / read / clicked), populated by the pywa
webhook handlers.

Revision ID: a1b2c3d4e5f6
Revises: 39fc150e3505
Create Date: 2026-06-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "39fc150e3505"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "whatsapp_messages",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("broadcast_id", sa.String(), nullable=False),
        sa.Column("campaign_id", sa.String(), nullable=True),
        sa.Column("customer_id", sa.String(), nullable=False),
        sa.Column("wa_id", sa.String(), nullable=True),
        sa.Column("wamid", sa.String(), nullable=True),
        sa.Column("tracker", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("clicked", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_whatsapp_messages_broadcast_id"), "whatsapp_messages", ["broadcast_id"], unique=False)
    op.create_index(op.f("ix_whatsapp_messages_campaign_id"), "whatsapp_messages", ["campaign_id"], unique=False)
    op.create_index(op.f("ix_whatsapp_messages_customer_id"), "whatsapp_messages", ["customer_id"], unique=False)
    op.create_index(op.f("ix_whatsapp_messages_wamid"), "whatsapp_messages", ["wamid"], unique=False)
    op.create_index(op.f("ix_whatsapp_messages_tracker"), "whatsapp_messages", ["tracker"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_whatsapp_messages_tracker"), table_name="whatsapp_messages")
    op.drop_index(op.f("ix_whatsapp_messages_wamid"), table_name="whatsapp_messages")
    op.drop_index(op.f("ix_whatsapp_messages_customer_id"), table_name="whatsapp_messages")
    op.drop_index(op.f("ix_whatsapp_messages_campaign_id"), table_name="whatsapp_messages")
    op.drop_index(op.f("ix_whatsapp_messages_broadcast_id"), table_name="whatsapp_messages")
    op.drop_table("whatsapp_messages")
