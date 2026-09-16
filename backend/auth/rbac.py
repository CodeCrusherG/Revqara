"""
Role-based access control for workspace members.

Five roles, highest → lowest privilege. Each maps to a set of permission
strings; ``owner`` implicitly has every permission. Permissions are checked at
the API boundary via ``auth.deps.require_permission``.

    owner    full control incl. billing, delete workspace, manage admins
    admin    manage team, campaigns, templates, settings
    manager  view all leads, assign leads, see reports
    agent    handle only leads/conversations assigned to them
    viewer   read-only
"""
from __future__ import annotations

# Privilege rank — used to stop a member from managing someone above them.
ROLE_RANK = {"owner": 4, "admin": 3, "manager": 2, "agent": 1, "viewer": 0}
ROLES = tuple(ROLE_RANK.keys())

# Permission catalogue (granular capabilities used by endpoints).
P_BILLING        = "billing.manage"
P_WORKSPACE_EDIT = "workspace.edit"
P_WORKSPACE_DEL  = "workspace.delete"
P_TEAM_MANAGE    = "team.manage"          # invite/remove members, change roles, sales teams
P_CAMPAIGNS      = "campaigns.manage"
P_TEMPLATES      = "templates.manage"
P_SETTINGS       = "settings.manage"      # vertical, WhatsApp numbers, bot
P_CONTACTS       = "contacts.manage"
P_LEADS_VIEW_ALL = "leads.view_all"       # see every lead in the workspace
P_LEADS_ASSIGN   = "leads.assign"         # assign/reassign leads
P_REPORTS        = "reports.view"

# Per-role grants. ``owner`` is handled specially (all permissions).
ROLE_PERMISSIONS: dict[str, set[str]] = {
    "owner": set(),  # special-cased to "everything" in has_permission
    "admin": {
        P_TEAM_MANAGE, P_CAMPAIGNS, P_TEMPLATES, P_SETTINGS, P_CONTACTS,
        P_LEADS_VIEW_ALL, P_LEADS_ASSIGN, P_REPORTS,
    },
    "manager": {
        P_LEADS_VIEW_ALL, P_LEADS_ASSIGN, P_REPORTS, P_CONTACTS,
    },
    "agent": set(),       # only their assigned leads/conversations (no view_all)
    "viewer": {P_REPORTS},  # read-only dashboards
}


def has_permission(role: str | None, permission: str) -> bool:
    """True if ``role`` is granted ``permission`` (owner has all)."""
    if role == "owner":
        return True
    return permission in ROLE_PERMISSIONS.get(role or "", set())


def can_view_all_leads(role: str | None) -> bool:
    return has_permission(role, P_LEADS_VIEW_ALL)


def can_assign_leads(role: str | None) -> bool:
    return has_permission(role, P_LEADS_ASSIGN)


def can_manage_role(actor_role: str | None, target_role: str | None) -> bool:
    """An actor may set/manage a member only at or below their own rank, and
    only owners may grant or manage the ``owner`` role."""
    if not has_permission(actor_role, P_TEAM_MANAGE):
        return False
    if target_role == "owner" and actor_role != "owner":
        return False
    return ROLE_RANK.get(actor_role or "", -1) >= ROLE_RANK.get(target_role or "", 99)
