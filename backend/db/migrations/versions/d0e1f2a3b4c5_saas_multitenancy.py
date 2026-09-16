"""v0.5 SaaS multitenancy: members, invites, sales teams, lead assignment

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-06-17

Turns demo-grade single-user workspaces into a production SaaS tenancy model:
  - workspace_members  : who can access a workspace, and with what role
  - workspace_invites  : pending role-scoped invitations
  - sales_teams        : named agent groups leads can route to
  - sales_team_members : team membership
  - lead_assignments   : append-only assignment audit trail
  - leads.{assigned_to_user_id, assigned_to_team_id, needs_human} : current state

Data migration: every existing user becomes an 'owner' member of their
workspace, so all current logins (and demo accounts) keep full access.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "d0e1f2a3b4c5"
down_revision = "c9d0e1f2a3b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workspace_members",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=False), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=False), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", sa.String(), nullable=False, server_default="agent"),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("workspace_id", "user_id", name="uq_workspace_member"),
    )
    op.create_index("ix_workspace_members_workspace_id", "workspace_members", ["workspace_id"])
    op.create_index("ix_workspace_members_user_id", "workspace_members", ["user_id"])

    op.create_table(
        "workspace_invites",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=False), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False, server_default="agent"),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("invited_by_user_id", UUID(as_uuid=False), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_workspace_invites_workspace_id", "workspace_invites", ["workspace_id"])
    op.create_index("ix_workspace_invites_email", "workspace_invites", ["email"])
    op.create_index("ix_workspace_invites_token_hash", "workspace_invites", ["token_hash"])

    op.create_table(
        "sales_teams",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=False), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("workspace_id", "name", name="uq_sales_team_name"),
    )
    op.create_index("ix_sales_teams_workspace_id", "sales_teams", ["workspace_id"])

    op.create_table(
        "sales_team_members",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=False), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("team_id", UUID(as_uuid=False), sa.ForeignKey("sales_teams.id"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=False), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("team_id", "user_id", name="uq_sales_team_member"),
    )
    op.create_index("ix_sales_team_members_workspace_id", "sales_team_members", ["workspace_id"])
    op.create_index("ix_sales_team_members_team_id", "sales_team_members", ["team_id"])
    op.create_index("ix_sales_team_members_user_id", "sales_team_members", ["user_id"])

    op.create_table(
        "lead_assignments",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=False), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("lead_id", UUID(as_uuid=False), sa.ForeignKey("leads.id"), nullable=False),
        sa.Column("assigned_to_user_id", UUID(as_uuid=False), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("assigned_to_team_id", UUID(as_uuid=False), sa.ForeignKey("sales_teams.id"), nullable=True),
        sa.Column("assigned_by_user_id", UUID(as_uuid=False), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_lead_assignments_workspace_id", "lead_assignments", ["workspace_id"])
    op.create_index("ix_lead_assignments_lead_id", "lead_assignments", ["lead_id"])
    op.create_index("ix_lead_assignments_assigned_to_user_id", "lead_assignments", ["assigned_to_user_id"])
    op.create_index("ix_lead_assignments_assigned_to_team_id", "lead_assignments", ["assigned_to_team_id"])

    # Lead: current-assignee + needs-human columns.
    op.add_column("leads", sa.Column("assigned_to_user_id", UUID(as_uuid=False), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("leads", sa.Column("assigned_to_team_id", UUID(as_uuid=False), sa.ForeignKey("sales_teams.id"), nullable=True))
    op.add_column("leads", sa.Column("needs_human", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index("ix_leads_assigned_to_user_id", "leads", ["assigned_to_user_id"])
    op.create_index("ix_leads_assigned_to_team_id", "leads", ["assigned_to_team_id"])

    # Backfill: every existing user becomes an owner member of their workspace,
    # so all current logins (including seeded demo accounts) retain full access.
    op.execute(
        """
        INSERT INTO workspace_members (id, workspace_id, user_id, role, status, created_at)
        SELECT gen_random_uuid(), u.workspace_id, u.id,
               COALESCE(NULLIF(u.role, ''), 'owner'), 'active', NOW()
        FROM users u
        WHERE NOT EXISTS (
            SELECT 1 FROM workspace_members m
            WHERE m.workspace_id = u.workspace_id AND m.user_id = u.id
        )
        """
    )


def downgrade() -> None:
    op.drop_index("ix_leads_assigned_to_team_id", table_name="leads")
    op.drop_index("ix_leads_assigned_to_user_id", table_name="leads")
    op.drop_column("leads", "needs_human")
    op.drop_column("leads", "assigned_to_team_id")
    op.drop_column("leads", "assigned_to_user_id")
    op.drop_table("lead_assignments")
    op.drop_table("sales_team_members")
    op.drop_table("sales_teams")
    op.drop_table("workspace_invites")
    op.drop_table("workspace_members")
