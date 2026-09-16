"""campaign templates + scheduling + reply tracking

Adds template_id + scheduled_at to campaigns, a 'scheduled' campaign status,
and a 'replied' flag on whatsapp_messages.

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-06-17 03:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # New enum value must be added outside the migration's transaction.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE campaignstatus ADD VALUE IF NOT EXISTS 'scheduled'")

    op.add_column("campaigns", sa.Column("template_id", sa.UUID(as_uuid=False), nullable=True))
    op.add_column("campaigns", sa.Column("scheduled_at", sa.DateTime(), nullable=True))
    op.create_foreign_key("fk_campaigns_template", "campaigns", "templates", ["template_id"], ["id"])

    op.add_column("whatsapp_messages", sa.Column("replied", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("whatsapp_messages", "replied")
    op.drop_constraint("fk_campaigns_template", "campaigns", type_="foreignkey")
    op.drop_column("campaigns", "scheduled_at")
    op.drop_column("campaigns", "template_id")
    # (enum value 'scheduled' is left in place; removing PG enum values is unsafe)
