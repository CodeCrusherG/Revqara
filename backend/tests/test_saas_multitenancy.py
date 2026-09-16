"""
v0.5 SaaS multitenancy: membership, RBAC, lead assignment, invites.

Endpoint functions are exercised by direct calls (passing a synthesized
AuthContext), matching the style of test_leads_api. The auth/permission layer is
exercised through the real dependencies (get_auth_context, require_permission)
so the enforcement — not just the happy path — is covered.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from auth.deps import AuthContext, get_auth_context, require_permission
from auth.rbac import (
    P_TEAM_MANAGE, P_LEADS_ASSIGN, has_permission, can_manage_role,
)
from auth.security import create_access_token
from db.models import (
    Lead, SalesTeam, SalesTeamMember, User, WorkspaceMember,
)


# ── helpers ──────────────────────────────────────────────────────────────────

def _add_user(db, ws, email, role="owner", *, with_membership=True, status="active"):
    u = User(workspace_id=ws.id, email=email, password_hash="x", full_name=email.split("@")[0], role=role)
    db.add(u)
    db.flush()
    if with_membership:
        db.add(WorkspaceMember(workspace_id=ws.id, user_id=u.id, role=role, status=status))
        db.flush()
    return u


def _ctx(db, ws, user, role):
    m = (db.query(WorkspaceMember)
         .filter(WorkspaceMember.workspace_id == ws.id, WorkspaceMember.user_id == user.id).first())
    return AuthContext(user=user, workspace=ws, role=role, membership=m)


def _creds(user, ws_id):
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=create_access_token(user.id, ws_id))


def _lead(db, ws, *, assigned_user=None, assigned_team=None, name="L"):
    lead = Lead(workspace_id=ws.id, name=name, phone="91900", intent="price_query",
                source="bot", status="new",
                assigned_to_user_id=(assigned_user.id if assigned_user else None),
                assigned_to_team_id=(assigned_team.id if assigned_team else None))
    db.add(lead)
    db.flush()
    return lead


# ── RBAC unit logic ──────────────────────────────────────────────────────────

def test_permission_matrix():
    assert has_permission("owner", P_TEAM_MANAGE)
    assert has_permission("admin", P_TEAM_MANAGE)
    assert not has_permission("manager", P_TEAM_MANAGE)
    assert has_permission("manager", P_LEADS_ASSIGN)
    assert not has_permission("agent", P_LEADS_ASSIGN)
    assert not has_permission("viewer", P_LEADS_ASSIGN)


def test_can_manage_role_hierarchy():
    assert can_manage_role("owner", "admin")
    assert can_manage_role("owner", "owner")
    assert not can_manage_role("admin", "owner")   # only owners manage owners
    assert not can_manage_role("manager", "agent")  # manager lacks team.manage
    assert not can_manage_role("agent", "agent")


# ── active-workspace resolution (the real enforcement) ───────────────────────

def test_token_resolves_member_workspace(make_workspace, db):
    ws, _ = make_workspace("coaching")
    owner = _add_user(db, ws, "owner@a.com", "owner")
    ctx = get_auth_context(_creds(owner, ws.id), db)
    assert ctx.workspace.id == ws.id and ctx.role == "owner"


def test_non_member_workspace_token_denied(make_workspace, db):
    wsA, _ = make_workspace("coaching")
    wsB, _ = make_workspace("clinic")
    userA = _add_user(db, wsA, "a@a.com", "owner")
    # userA forges a token pointing at wsB, where they have no membership.
    with pytest.raises(HTTPException) as exc:
        get_auth_context(_creds(userA, wsB.id), db)
    assert exc.value.status_code == 403


def test_disabled_member_denied(make_workspace, db):
    ws, _ = make_workspace("coaching")
    u = _add_user(db, ws, "dis@a.com", "agent", status="disabled")
    with pytest.raises(HTTPException) as exc:
        get_auth_context(_creds(u, ws.id), db)
    assert exc.value.status_code == 403


def test_legacy_user_without_membership_is_owner(make_workspace, db):
    ws, _ = make_workspace("coaching")
    u = _add_user(db, ws, "legacy@a.com", "owner", with_membership=False)
    ctx = get_auth_context(_creds(u, ws.id), db)  # no membership row, but own workspace
    assert ctx.role == "owner"


# ── require_permission dependency ────────────────────────────────────────────

def test_require_permission_enforced(make_workspace, db):
    ws, _ = make_workspace("coaching")
    owner = _add_user(db, ws, "o@a.com", "owner")
    agent = _add_user(db, ws, "ag@a.com", "agent")
    dep = require_permission(P_TEAM_MANAGE)
    assert dep(ctx=_ctx(db, ws, owner, "owner")).role == "owner"
    with pytest.raises(HTTPException) as exc:
        dep(ctx=_ctx(db, ws, agent, "agent"))
    assert exc.value.status_code == 403


# ── lead scoping by role ─────────────────────────────────────────────────────

def test_cross_workspace_leads_isolated(make_workspace, db):
    from api.leads import list_leads
    wsA, _ = make_workspace("coaching")
    wsB, _ = make_workspace("clinic")
    ownerA = _add_user(db, wsA, "oa@a.com", "owner")
    _lead(db, wsA, name="A1")
    _lead(db, wsB, name="B1")
    out = list_leads(ctx=_ctx(db, wsA, ownerA, "owner"), db=db)
    names = {l["name"] for l in out}
    assert names == {"A1"}  # never sees wsB's lead


def test_agent_sees_only_assigned_leads(make_workspace, db):
    from api.leads import list_leads
    ws, _ = make_workspace("coaching")
    agent = _add_user(db, ws, "agent@a.com", "agent")
    other = _add_user(db, ws, "other@a.com", "agent")
    team = SalesTeam(workspace_id=ws.id, name="Team A")
    db.add(team); db.flush()
    db.add(SalesTeamMember(workspace_id=ws.id, team_id=team.id, user_id=agent.id)); db.flush()

    _lead(db, ws, assigned_user=agent, name="mine")
    _lead(db, ws, assigned_team=team, name="myteam")
    _lead(db, ws, assigned_user=other, name="theirs")
    _lead(db, ws, name="unassigned")

    out = list_leads(ctx=_ctx(db, ws, agent, "agent"), db=db)
    assert {l["name"] for l in out} == {"mine", "myteam"}


def test_manager_sees_all_leads(make_workspace, db):
    from api.leads import list_leads
    ws, _ = make_workspace("coaching")
    manager = _add_user(db, ws, "mgr@a.com", "manager")
    agent = _add_user(db, ws, "ag@a.com", "agent")
    _lead(db, ws, assigned_user=agent, name="x")
    _lead(db, ws, name="y")
    out = list_leads(ctx=_ctx(db, ws, manager, "manager"), db=db)
    assert {l["name"] for l in out} == {"x", "y"}


# ── lead assignment ──────────────────────────────────────────────────────────

def test_assign_lead_to_user_clears_needs_human(make_workspace, db):
    from api.leads import assign_lead, AssignIn
    from db.models import LeadAssignment
    ws, _ = make_workspace("coaching")
    manager = _add_user(db, ws, "mgr@a.com", "manager")
    agent = _add_user(db, ws, "ag@a.com", "agent")
    lead = _lead(db, ws, name="hot")
    lead.needs_human = True
    db.flush()

    out = assign_lead(lead.id, AssignIn(user_id=agent.id), ctx=_ctx(db, ws, manager, "manager"), db=db)
    assert out["assigned_to_user_id"] == agent.id
    assert out["needs_human"] is False
    audit = db.query(LeadAssignment).filter(LeadAssignment.lead_id == lead.id, LeadAssignment.status == "active").all()
    assert len(audit) == 1 and audit[0].assigned_by_user_id == manager.id


def test_reassign_supersedes_prior_assignment(make_workspace, db):
    from api.leads import assign_lead, AssignIn
    from db.models import LeadAssignment
    ws, _ = make_workspace("coaching")
    mgr = _add_user(db, ws, "m@a.com", "manager")
    a1 = _add_user(db, ws, "a1@a.com", "agent")
    a2 = _add_user(db, ws, "a2@a.com", "agent")
    lead = _lead(db, ws)
    assign_lead(lead.id, AssignIn(user_id=a1.id), ctx=_ctx(db, ws, mgr, "manager"), db=db)
    assign_lead(lead.id, AssignIn(user_id=a2.id), ctx=_ctx(db, ws, mgr, "manager"), db=db)
    active = db.query(LeadAssignment).filter(LeadAssignment.lead_id == lead.id, LeadAssignment.status == "active").all()
    assert len(active) == 1 and active[0].assigned_to_user_id == a2.id


def test_assign_rejects_nonmember_user(make_workspace, db):
    from api.leads import assign_lead, AssignIn
    ws, _ = make_workspace("coaching")
    wsB, _ = make_workspace("clinic")
    mgr = _add_user(db, ws, "m@a.com", "manager")
    outsider = _add_user(db, wsB, "out@b.com", "owner")
    lead = _lead(db, ws)
    with pytest.raises(HTTPException) as exc:
        assign_lead(lead.id, AssignIn(user_id=outsider.id), ctx=_ctx(db, ws, mgr, "manager"), db=db)
    assert exc.value.status_code == 400


def test_unassign_clears_assignee(make_workspace, db):
    from api.leads import assign_lead, unassign_lead, AssignIn
    ws, _ = make_workspace("coaching")
    mgr = _add_user(db, ws, "m@a.com", "manager")
    agent = _add_user(db, ws, "a@a.com", "agent")
    lead = _lead(db, ws)
    assign_lead(lead.id, AssignIn(user_id=agent.id), ctx=_ctx(db, ws, mgr, "manager"), db=db)
    out = unassign_lead(lead.id, ctx=_ctx(db, ws, mgr, "manager"), db=db)
    assert out["assigned_to_user_id"] is None


# ── invites ──────────────────────────────────────────────────────────────────

def test_invite_create_and_accept_once(make_workspace, db):
    from api.team import create_invite, accept_invite, InviteIn
    ws, _ = make_workspace("coaching")
    owner = _add_user(db, ws, "owner@a.com", "owner")
    # The invitee already has an account (their own workspace).
    wsB, _ = make_workspace("clinic")
    invitee = _add_user(db, wsB, "newbie@x.com", "owner")

    res = create_invite(InviteIn(email="newbie@x.com", role="agent"), ctx=_ctx(db, ws, owner, "owner"), db=db)
    token = res["token"]

    invitee_ctx = _ctx(db, wsB, invitee, "owner")
    ok = accept_invite(token, ctx=invitee_ctx, db=db)
    assert ok["workspace"]["role"] == "agent"
    member = (db.query(WorkspaceMember)
              .filter(WorkspaceMember.workspace_id == ws.id, WorkspaceMember.user_id == invitee.id).first())
    assert member and member.role == "agent"

    # Single-use: a second accept fails.
    with pytest.raises(HTTPException) as exc:
        accept_invite(token, ctx=invitee_ctx, db=db)
    assert exc.value.status_code == 404


def test_invite_email_mismatch_denied(make_workspace, db):
    from api.team import create_invite, accept_invite, InviteIn
    ws, _ = make_workspace("coaching")
    owner = _add_user(db, ws, "owner@a.com", "owner")
    wsB, _ = make_workspace("clinic")
    wrong = _add_user(db, wsB, "wrong@x.com", "owner")
    res = create_invite(InviteIn(email="intended@x.com", role="agent"), ctx=_ctx(db, ws, owner, "owner"), db=db)
    with pytest.raises(HTTPException) as exc:
        accept_invite(res["token"], ctx=_ctx(db, wsB, wrong, "owner"), db=db)
    assert exc.value.status_code == 403


def test_invite_role_above_inviter_denied(make_workspace, db):
    from api.team import create_invite, InviteIn
    ws, _ = make_workspace("coaching")
    manager = _add_user(db, ws, "mgr@a.com", "manager")
    # Manager has no team.manage, so even though we bypass the dependency, the
    # can_manage_role guard inside the handler still rejects inviting an admin.
    with pytest.raises(HTTPException) as exc:
        create_invite(InviteIn(email="x@x.com", role="admin"), ctx=_ctx(db, ws, manager, "manager"), db=db)
    assert exc.value.status_code == 403


# ── team management guards ───────────────────────────────────────────────────

def test_cannot_remove_last_owner(make_workspace, db):
    from api.team import remove_member
    ws, _ = make_workspace("coaching")
    owner = _add_user(db, ws, "owner@a.com", "owner")
    m = db.query(WorkspaceMember).filter_by(workspace_id=ws.id, user_id=owner.id).first()
    with pytest.raises(HTTPException) as exc:
        remove_member(m.id, ctx=_ctx(db, ws, owner, "owner"), db=db)
    assert exc.value.status_code == 400


def test_disable_member_then_blocks_access(make_workspace, db):
    from api.team import update_member, MemberPatch
    ws, _ = make_workspace("coaching")
    owner = _add_user(db, ws, "owner@a.com", "owner")
    agent = _add_user(db, ws, "ag@a.com", "agent")
    m = db.query(WorkspaceMember).filter_by(workspace_id=ws.id, user_id=agent.id).first()
    update_member(m.id, MemberPatch(status="disabled"), ctx=_ctx(db, ws, owner, "owner"), db=db)
    with pytest.raises(HTTPException) as exc:
        get_auth_context(_creds(agent, ws.id), db)
    assert exc.value.status_code == 403


# ── workspace switching ──────────────────────────────────────────────────────

def test_switch_to_member_workspace_ok(make_workspace, db):
    from api.workspaces import switch_workspace
    wsA, _ = make_workspace("coaching")
    wsB, _ = make_workspace("clinic")
    user = _add_user(db, wsA, "u@a.com", "owner")
    db.add(WorkspaceMember(workspace_id=wsB.id, user_id=user.id, role="manager", status="active"))
    db.flush()
    out = switch_workspace(wsB.id, ctx=_ctx(db, wsA, user, "owner"), db=db)
    assert out["workspace"]["id"] == wsB.id and out["workspace"]["role"] == "manager"
    assert out["access_token"]


def test_switch_to_nonmember_workspace_denied(make_workspace, db):
    from api.workspaces import switch_workspace
    wsA, _ = make_workspace("coaching")
    wsB, _ = make_workspace("clinic")
    user = _add_user(db, wsA, "u@a.com", "owner")
    with pytest.raises(HTTPException) as exc:
        switch_workspace(wsB.id, ctx=_ctx(db, wsA, user, "owner"), db=db)
    assert exc.value.status_code == 403


# ── AI handoff marks the lead for a human ────────────────────────────────────

def test_handoff_marks_lead_needs_human(make_workspace, send_inbound, db):
    ws, acct = make_workspace("coaching")
    res = send_inbound(acct, "Worst institute, refund chahiye right now")
    assert res["handoff"] is True
    lead = db.query(Lead).filter(Lead.id == res["lead_id"]).first()
    assert lead.needs_human is True
    assert lead.assigned_to_user_id is None  # stays assignable
