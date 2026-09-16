"""saas tenancy + contacts + lists + campaign targeting

Adds workspaces, users, contacts, contact_lists, contact_list_members; scopes
campaigns and customer_profiles to a workspace; adds campaign targeting.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-17 00:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workspaces",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("plan", sa.String(), nullable=False),
        sa.Column("plan_status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("workspace_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=True),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_workspace_id"), "users", ["workspace_id"], unique=False)

    op.create_table(
        "contacts",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("workspace_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("full_name", sa.String(), nullable=True),
        sa.Column("whatsapp_number", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("gender", sa.String(), nullable=True),
        sa.Column("city", sa.String(), nullable=True),
        sa.Column("occupation_type", sa.String(), nullable=True),
        sa.Column("monthly_income", sa.Integer(), nullable=True),
        sa.Column("credit_score", sa.Integer(), nullable=True),
        sa.Column("kyc_status", sa.String(), nullable=True),
        sa.Column("app_installed", sa.String(), nullable=True),
        sa.Column("existing_customer", sa.String(), nullable=True),
        sa.Column("social_media_active", sa.String(), nullable=True),
        sa.Column("attributes", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "whatsapp_number", name="uq_workspace_whatsapp"),
    )
    op.create_index(op.f("ix_contacts_workspace_id"), "contacts", ["workspace_id"], unique=False)

    op.create_table(
        "contact_lists",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("workspace_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_contact_lists_workspace_id"), "contact_lists", ["workspace_id"], unique=False)

    op.create_table(
        "contact_list_members",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("list_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("contact_id", sa.UUID(as_uuid=False), nullable=False),
        sa.ForeignKeyConstraint(["list_id"], ["contact_lists.id"]),
        sa.ForeignKeyConstraint(["contact_id"], ["contacts.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("list_id", "contact_id", name="uq_list_contact"),
    )
    op.create_index(op.f("ix_contact_list_members_list_id"), "contact_list_members", ["list_id"], unique=False)
    op.create_index(op.f("ix_contact_list_members_contact_id"), "contact_list_members", ["contact_id"], unique=False)

    # Campaign targeting + tenancy
    op.add_column("campaigns", sa.Column("workspace_id", sa.UUID(as_uuid=False), nullable=True))
    op.add_column("campaigns", sa.Column("name", sa.String(), nullable=True))
    op.add_column("campaigns", sa.Column("target_list_id", sa.UUID(as_uuid=False), nullable=True))
    op.create_index(op.f("ix_campaigns_workspace_id"), "campaigns", ["workspace_id"], unique=False)
    op.create_foreign_key("fk_campaigns_workspace", "campaigns", "workspaces", ["workspace_id"], ["id"])
    op.create_foreign_key("fk_campaigns_target_list", "campaigns", "contact_lists", ["target_list_id"], ["id"])

    # CustomerProfile tenancy + real number; relax the global-unique customer_id.
    op.add_column("customer_profiles", sa.Column("workspace_id", sa.UUID(as_uuid=False), nullable=True))
    op.add_column("customer_profiles", sa.Column("whatsapp_number", sa.String(), nullable=True))
    op.create_index(op.f("ix_customer_profiles_workspace_id"), "customer_profiles", ["workspace_id"], unique=False)
    op.drop_index("ix_customer_profiles_customer_id", table_name="customer_profiles")
    op.create_index(op.f("ix_customer_profiles_customer_id"), "customer_profiles", ["customer_id"], unique=False)
    op.create_foreign_key("fk_customer_profiles_workspace", "customer_profiles", "workspaces", ["workspace_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_customer_profiles_workspace", "customer_profiles", type_="foreignkey")
    op.drop_index(op.f("ix_customer_profiles_customer_id"), table_name="customer_profiles")
    op.create_index("ix_customer_profiles_customer_id", "customer_profiles", ["customer_id"], unique=True)
    op.drop_index(op.f("ix_customer_profiles_workspace_id"), table_name="customer_profiles")
    op.drop_column("customer_profiles", "whatsapp_number")
    op.drop_column("customer_profiles", "workspace_id")

    op.drop_constraint("fk_campaigns_target_list", "campaigns", type_="foreignkey")
    op.drop_constraint("fk_campaigns_workspace", "campaigns", type_="foreignkey")
    op.drop_index(op.f("ix_campaigns_workspace_id"), table_name="campaigns")
    op.drop_column("campaigns", "target_list_id")
    op.drop_column("campaigns", "name")
    op.drop_column("campaigns", "workspace_id")

    op.drop_table("contact_list_members")
    op.drop_table("contact_lists")
    op.drop_table("contacts")
    op.drop_table("users")
    op.drop_table("workspaces")
