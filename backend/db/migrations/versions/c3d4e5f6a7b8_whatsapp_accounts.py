"""per-tenant whatsapp accounts

Adds whatsapp_accounts: each workspace connects its own WhatsApp number (WABA +
phone_number_id), so one backend/Meta app serves many businesses and inbound
webhooks route by phone_number_id.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-06-17 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "whatsapp_accounts",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("workspace_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("waba_id", sa.String(), nullable=True),
        sa.Column("phone_number_id", sa.String(), nullable=False),
        sa.Column("display_phone_number", sa.String(), nullable=True),
        sa.Column("verified_name", sa.String(), nullable=True),
        sa.Column("access_token", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("phone_number_id", name="uq_whatsapp_accounts_phone_number_id"),
    )
    op.create_index(op.f("ix_whatsapp_accounts_workspace_id"), "whatsapp_accounts", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_whatsapp_accounts_phone_number_id"), "whatsapp_accounts", ["phone_number_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_whatsapp_accounts_phone_number_id"), table_name="whatsapp_accounts")
    op.drop_index(op.f("ix_whatsapp_accounts_workspace_id"), table_name="whatsapp_accounts")
    op.drop_table("whatsapp_accounts")
