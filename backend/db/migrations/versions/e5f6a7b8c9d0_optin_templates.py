"""contact opt-in + message templates

Adds WhatsApp consent fields to contacts and a templates table (the compliance
layer: opt-in + approved templates).

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-06-17 02:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("contacts", sa.Column("opt_in_status", sa.String(), nullable=False, server_default="unknown"))
    op.add_column("contacts", sa.Column("opt_in_source", sa.String(), nullable=True))
    op.add_column("contacts", sa.Column("opt_in_at", sa.DateTime(), nullable=True))

    op.create_table(
        "templates",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("workspace_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("language", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "name", name="uq_template_workspace_name"),
    )
    op.create_index(op.f("ix_templates_workspace_id"), "templates", ["workspace_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_templates_workspace_id"), table_name="templates")
    op.drop_table("templates")
    op.drop_column("contacts", "opt_in_at")
    op.drop_column("contacts", "opt_in_source")
    op.drop_column("contacts", "opt_in_status")
