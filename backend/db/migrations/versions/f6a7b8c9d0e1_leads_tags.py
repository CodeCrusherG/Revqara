"""leads + contact tags

Adds the leads table (captured sales/booking enquiries) and a tags column on
contacts.

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-06-17 02:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("contacts", sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.create_table(
        "leads",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("workspace_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("conversation_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("contact_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("intent", sa.String(), nullable=True),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"]),
        sa.ForeignKeyConstraint(["contact_id"], ["contacts.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_leads_workspace_id"), "leads", ["workspace_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_leads_workspace_id"), table_name="leads")
    op.drop_table("leads")
    op.drop_column("contacts", "tags")
