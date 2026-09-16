"""workspace vertical pack

Adds workspaces.vertical so each tenant runs an industry-tuned pack on the
universal AI graph.

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-06-17 03:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("workspaces", sa.Column("vertical", sa.String(), nullable=False, server_default="custom"))


def downgrade() -> None:
    op.drop_column("workspaces", "vertical")
