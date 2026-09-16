"""
ORM models for Nudge.

All 6 tables:
  - CustomerProfile
  - Campaign
  - Segment
  - Variant
  - AgentLog
  - ApiCallLog
"""
import uuid
import enum
from datetime import datetime, date
from sqlalchemy import (
    Column, String, Text, Integer, Float, Boolean, Enum,
    DateTime, Date, ForeignKey, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from db.database import Base


def _uuid():
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Workspace  — the tenant / account. All data is scoped to a workspace.
# ---------------------------------------------------------------------------
class Workspace(Base):
    __tablename__ = "workspaces"

    id          = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    name        = Column(String, nullable=False)
    plan        = Column(String, nullable=False, default="free")   # "free" | "pro"
    plan_status = Column(String, nullable=False, default="active") # active | canceled
    vertical    = Column(String, nullable=False, default="custom") # industry vertical pack
    created_at  = Column(DateTime, default=datetime.utcnow)

    users = relationship("User", back_populates="workspace", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# User  — a login that belongs to one workspace.
# ---------------------------------------------------------------------------
class User(Base):
    __tablename__ = "users"

    id            = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    workspace_id  = Column(UUID(as_uuid=False), ForeignKey("workspaces.id"), nullable=False, index=True)
    email         = Column(String, nullable=False, unique=True, index=True)
    password_hash = Column(String, nullable=False)
    full_name     = Column(String, nullable=True)
    role          = Column(String, nullable=False, default="owner")
    created_at    = Column(DateTime, default=datetime.utcnow)

    workspace = relationship("Workspace", back_populates="users")


# ---------------------------------------------------------------------------
# WorkspaceMember  — the source of truth for "who can access a workspace, and
# with what role". A User may be a member of many workspaces; User.workspace_id
# remains their default/primary workspace for backward compatibility.
#
# Roles (highest → lowest privilege): owner, admin, manager, agent, viewer.
# ---------------------------------------------------------------------------
class WorkspaceMember(Base):
    __tablename__ = "workspace_members"

    id           = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    workspace_id = Column(UUID(as_uuid=False), ForeignKey("workspaces.id"), nullable=False, index=True)
    user_id      = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    role         = Column(String, nullable=False, default="agent")   # owner|admin|manager|agent|viewer
    status       = Column(String, nullable=False, default="active")  # active|invited|disabled
    created_at   = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_workspace_member"),
    )


# ---------------------------------------------------------------------------
# WorkspaceInvite  — a pending invitation to join a workspace with a role.
# The raw token is shown once to the inviter; only its hash is stored.
# ---------------------------------------------------------------------------
class WorkspaceInvite(Base):
    __tablename__ = "workspace_invites"

    id                 = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    workspace_id       = Column(UUID(as_uuid=False), ForeignKey("workspaces.id"), nullable=False, index=True)
    email              = Column(String, nullable=False, index=True)
    role               = Column(String, nullable=False, default="agent")
    token_hash         = Column(String, nullable=False, index=True)
    invited_by_user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    status             = Column(String, nullable=False, default="pending")  # pending|accepted|revoked|expired
    expires_at         = Column(DateTime, nullable=True)
    accepted_at        = Column(DateTime, nullable=True)
    created_at         = Column(DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------------------
# SalesTeam  + membership  — named groups of agents leads can be routed to.
# ---------------------------------------------------------------------------
class SalesTeam(Base):
    __tablename__ = "sales_teams"

    id           = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    workspace_id = Column(UUID(as_uuid=False), ForeignKey("workspaces.id"), nullable=False, index=True)
    name         = Column(String, nullable=False)
    description  = Column(Text, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("workspace_id", "name", name="uq_sales_team_name"),
    )


class SalesTeamMember(Base):
    __tablename__ = "sales_team_members"

    id           = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    workspace_id = Column(UUID(as_uuid=False), ForeignKey("workspaces.id"), nullable=False, index=True)
    team_id      = Column(UUID(as_uuid=False), ForeignKey("sales_teams.id"), nullable=False, index=True)
    user_id      = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    created_at   = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("team_id", "user_id", name="uq_sales_team_member"),
    )


# ---------------------------------------------------------------------------
# LeadAssignment  — append-only audit trail of who a lead was assigned to and
# when. The Lead row carries the *current* assignee (denormalized) for fast
# filtering; this table keeps the history.
# ---------------------------------------------------------------------------
class LeadAssignment(Base):
    __tablename__ = "lead_assignments"

    id                  = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    workspace_id        = Column(UUID(as_uuid=False), ForeignKey("workspaces.id"), nullable=False, index=True)
    lead_id             = Column(UUID(as_uuid=False), ForeignKey("leads.id"), nullable=False, index=True)
    assigned_to_user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True, index=True)
    assigned_to_team_id = Column(UUID(as_uuid=False), ForeignKey("sales_teams.id"), nullable=True, index=True)
    assigned_by_user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    status              = Column(String, nullable=False, default="active")  # active|reassigned|closed
    created_at          = Column(DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------------------
# WhatsAppAccount  — a WhatsApp number a tenant has connected (their own WABA).
#
# One Meta app/backend, many WABAs: each workspace connects its own number, and
# inbound webhooks are routed to the owning workspace by phone_number_id.
# ---------------------------------------------------------------------------
class WhatsAppAccount(Base):
    __tablename__ = "whatsapp_accounts"

    id                   = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    workspace_id         = Column(UUID(as_uuid=False), ForeignKey("workspaces.id"), nullable=False, index=True)
    waba_id              = Column(String, nullable=True)
    # Globally unique Meta id — the routing key for inbound webhooks.
    phone_number_id      = Column(String, nullable=False, unique=True, index=True)
    display_phone_number = Column(String, nullable=True)
    verified_name        = Column(String, nullable=True)   # business display name
    access_token         = Column(String, nullable=True)   # tenant/system-user token (ref)
    status               = Column(String, nullable=False, default="connected")
    created_at           = Column(DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------------------
# Contact  — a real WhatsApp subscriber in a workspace's CRM.
# ---------------------------------------------------------------------------
class Contact(Base):
    __tablename__ = "contacts"

    id                  = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    workspace_id        = Column(UUID(as_uuid=False), ForeignKey("workspaces.id"), nullable=False, index=True)
    full_name           = Column(String, nullable=True)
    whatsapp_number     = Column(String, nullable=False)   # E.164-style digits
    email               = Column(String, nullable=True)
    # Optional CRM/demographic fields the engagement predictor understands.
    age                 = Column(Integer, nullable=True)
    gender              = Column(String, nullable=True)
    city                = Column(String, nullable=True)
    occupation_type     = Column(String, nullable=True)
    monthly_income      = Column(Integer, nullable=True)
    credit_score        = Column(Integer, nullable=True)
    kyc_status          = Column(String, nullable=True)
    app_installed       = Column(String, nullable=True)
    existing_customer   = Column(String, nullable=True)
    social_media_active = Column(String, nullable=True)
    # Arbitrary extra columns from a CSV import.
    attributes          = Column(JSONB, nullable=True)
    tags                = Column(JSONB, nullable=True)   # list[str] — segment/label tags
    # WhatsApp consent — marketing may only go to opted-in contacts.
    opt_in_status       = Column(String, nullable=False, default="unknown")  # opted_in | opted_out | unknown
    opt_in_source       = Column(String, nullable=True)   # import | manual | inbound_message
    opt_in_at           = Column(DateTime, nullable=True)
    created_at          = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("workspace_id", "whatsapp_number", name="uq_workspace_whatsapp"),
    )


# ---------------------------------------------------------------------------
# Template  — a pre-approved WhatsApp message template (required for
# business-initiated messages outside the 24-hour service window).
# ---------------------------------------------------------------------------
class Template(Base):
    __tablename__ = "templates"

    id           = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    workspace_id = Column(UUID(as_uuid=False), ForeignKey("workspaces.id"), nullable=False, index=True)
    name         = Column(String, nullable=False)
    category     = Column(String, nullable=False, default="marketing")  # marketing|utility|authentication|service
    language     = Column(String, nullable=False, default="en")
    body         = Column(Text, nullable=False)
    status       = Column(String, nullable=False, default="draft")      # draft|pending|approved|rejected
    created_at   = Column(DateTime, default=datetime.utcnow)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("workspace_id", "name", name="uq_template_workspace_name"),
    )


# ---------------------------------------------------------------------------
# ContactList  + membership  — named audiences a campaign can target.
# ---------------------------------------------------------------------------
class ContactList(Base):
    __tablename__ = "contact_lists"

    id           = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    workspace_id = Column(UUID(as_uuid=False), ForeignKey("workspaces.id"), nullable=False, index=True)
    name         = Column(String, nullable=False)
    description  = Column(Text, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)


class ContactListMember(Base):
    __tablename__ = "contact_list_members"

    id         = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    list_id    = Column(UUID(as_uuid=False), ForeignKey("contact_lists.id"), nullable=False, index=True)
    contact_id = Column(UUID(as_uuid=False), ForeignKey("contacts.id"), nullable=False, index=True)

    __table_args__ = (
        UniqueConstraint("list_id", "contact_id", name="uq_list_contact"),
    )


# ---------------------------------------------------------------------------
# Bot  — per-workspace AI auto-reply config for the WhatsApp inbox.
# ---------------------------------------------------------------------------
class Bot(Base):
    __tablename__ = "bots"

    id              = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    workspace_id    = Column(UUID(as_uuid=False), ForeignKey("workspaces.id"), nullable=False, unique=True, index=True)
    enabled         = Column(Boolean, nullable=False, default=True)
    handoff_enabled = Column(Boolean, nullable=False, default=True)
    name            = Column(String, nullable=True)
    prompt          = Column(Text, nullable=True)        # business persona / instructions
    knowledge       = Column(Text, nullable=True)        # FAQ / pasted knowledge base
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ---------------------------------------------------------------------------
# Conversation  — a 1:1 thread between a tenant's number and one customer.
# ---------------------------------------------------------------------------
class Conversation(Base):
    __tablename__ = "conversations"

    id              = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    workspace_id    = Column(UUID(as_uuid=False), ForeignKey("workspaces.id"), nullable=False, index=True)
    phone_number_id = Column(String, nullable=False)     # the business number it arrived on
    customer_wa_id  = Column(String, nullable=False)     # customer's WhatsApp number
    customer_name   = Column(String, nullable=True)
    contact_id      = Column(UUID(as_uuid=False), ForeignKey("contacts.id"), nullable=True)
    status          = Column(String, nullable=False, default="open")   # open | closed
    auto_reply      = Column(Boolean, nullable=False, default=True)     # off = human takeover
    unread          = Column(Boolean, nullable=False, default=True)
    last_inbound_at = Column(DateTime, nullable=True)    # drives the 24h service window
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("workspace_id", "phone_number_id", "customer_wa_id", name="uq_conversation"),
    )


# ---------------------------------------------------------------------------
# InboxMessage  — one message in a conversation (inbound or outbound).
# ---------------------------------------------------------------------------
class InboxMessage(Base):
    __tablename__ = "inbox_messages"

    id              = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    workspace_id    = Column(UUID(as_uuid=False), ForeignKey("workspaces.id"), nullable=False, index=True)
    conversation_id = Column(UUID(as_uuid=False), ForeignKey("conversations.id"), nullable=False, index=True)
    direction       = Column(String, nullable=False)    # inbound | outbound
    sender          = Column(String, nullable=False)    # customer | bot | agent
    text            = Column(Text, nullable=True)
    wamid           = Column(String, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------------------
# Lead  — a captured sales/booking enquiry from a conversation.
# ---------------------------------------------------------------------------
class Lead(Base):
    __tablename__ = "leads"

    id              = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    workspace_id    = Column(UUID(as_uuid=False), ForeignKey("workspaces.id"), nullable=False, index=True)
    conversation_id = Column(UUID(as_uuid=False), ForeignKey("conversations.id"), nullable=True)
    contact_id      = Column(UUID(as_uuid=False), ForeignKey("contacts.id"), nullable=True)
    name            = Column(String, nullable=True)
    phone           = Column(String, nullable=True)
    intent          = Column(String, nullable=True)     # e.g. "booking", "pricing", "order"
    details         = Column(Text, nullable=True)        # the customer's message / captured info
    source          = Column(String, nullable=False, default="bot")   # bot | agent
    status          = Column(String, nullable=False, default="new")   # new|qualified|won|lost
    # Current assignee (denormalized; LeadAssignment holds the history).
    assigned_to_user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True, index=True)
    assigned_to_team_id = Column(UUID(as_uuid=False), ForeignKey("sales_teams.id"), nullable=True, index=True)
    # Set when the AI hands off — the lead awaits a human and is assignable.
    needs_human     = Column(Boolean, nullable=False, default=False)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ---------------------------------------------------------------------------
# Campaign status enum
# ---------------------------------------------------------------------------
class CampaignStatus(str, enum.Enum):
    profiling        = "profiling"
    planning         = "planning"
    generating       = "generating"
    pending_approval = "pending_approval"
    approved         = "approved"
    executing        = "executing"
    monitoring       = "monitoring"
    optimizing       = "optimizing"
    completed        = "completed"
    rejected         = "rejected"
    scheduled        = "scheduled"


# ---------------------------------------------------------------------------
# CustomerProfile
# ---------------------------------------------------------------------------
class CustomerProfile(Base):
    __tablename__ = "customer_profiles"

    id                 = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    # Owning workspace (multi-tenant). Profiles are a per-campaign-run materialisation
    # of the workspace's targeted contacts.
    workspace_id       = Column(UUID(as_uuid=False), ForeignKey("workspaces.id"), nullable=True, index=True)
    # Core identifier (the Contact id this profile was materialised from).
    customer_id        = Column(String, nullable=False, index=True)
    # Contact
    email              = Column(String, nullable=True)   # cohort 'email'
    full_name          = Column(String, nullable=True)   # cohort 'Full_name'
    whatsapp_number    = Column(String, nullable=True)   # real recipient number
    # Demographics
    age                = Column(Integer, nullable=True)
    gender             = Column(String, nullable=True)
    marital_status     = Column(String, nullable=True)
    family_size        = Column(Integer, nullable=True)
    dependent_count    = Column(Integer, nullable=True)
    kids_in_household  = Column(Integer, nullable=True)
    city               = Column(String, nullable=True)
    # Financial / Behavioural
    occupation         = Column(String, nullable=True)
    occupation_type    = Column(String, nullable=True)   # Full-time / Part-time
    monthly_income     = Column(Integer, nullable=True)
    credit_score       = Column(Integer, nullable=True)
    kyc_status         = Column(String, nullable=True)   # 'Y' | 'N'
    app_installed      = Column(String, nullable=True)   # 'Y' | 'N'
    existing_customer  = Column(String, nullable=True)   # 'Y' | 'N'
    social_media_active= Column(String, nullable=True)   # 'Y' | 'N'
    # Catch-all: full raw cohort object in case schema changes server-side
    raw_data           = Column(JSONB, nullable=True)
    # LLM-assigned segment tags from Profiler agent
    segment_tags       = Column(JSONB, nullable=True)
    created_at         = Column(DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------------------
# Campaign
# ---------------------------------------------------------------------------
class Campaign(Base):
    __tablename__ = "campaigns"

    id               = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    workspace_id     = Column(UUID(as_uuid=False), ForeignKey("workspaces.id"), nullable=True, index=True)
    name             = Column(String, nullable=True)
    brief            = Column(Text, nullable=False)
    # Optional contact list to target; NULL targets all workspace contacts.
    target_list_id   = Column(UUID(as_uuid=False), ForeignKey("contact_lists.id"), nullable=True)
    # Optional approved template to send (instead of AI free-text), and an
    # optional future send time (NULL = send on approval).
    template_id      = Column(UUID(as_uuid=False), ForeignKey("templates.id"), nullable=True)
    scheduled_at     = Column(DateTime, nullable=True)
    status           = Column(Enum(CampaignStatus), default=CampaignStatus.profiling, nullable=False)
    state_checkpoint = Column(JSONB, nullable=True)   # serialised LangGraph state
    rejection_feedback = Column(Text, nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    segments  = relationship("Segment", back_populates="campaign", cascade="all, delete-orphan")
    agent_logs= relationship("AgentLog", back_populates="campaign", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# Segment
# ---------------------------------------------------------------------------
class Segment(Base):
    __tablename__ = "segments"

    id                  = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    campaign_id         = Column(UUID(as_uuid=False), ForeignKey("campaigns.id"), nullable=False, index=True)
    label               = Column(String, nullable=False)         # e.g. "Segment A – High-Value"
    criteria            = Column(JSONB, nullable=True)           # LLM-generated criteria dict
    customer_ids        = Column(JSONB, nullable=True)           # list of customer_id strings
    send_time           = Column(String, nullable=True)          # "DD:MM:YY HH:MM:SS" IST
    predicted_open_rate = Column(Float, nullable=True)
    predicted_click_rate= Column(Float, nullable=True)

    campaign = relationship("Campaign", back_populates="segments")
    variants = relationship("Variant", back_populates="segment", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# Variant
# ---------------------------------------------------------------------------
class Variant(Base):
    __tablename__ = "variants"

    id                  = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    segment_id          = Column(UUID(as_uuid=False), ForeignKey("segments.id"), nullable=False, index=True)
    external_campaign_id= Column(String, nullable=True)   # UUID returned by /api/v1/send_campaign
    subject             = Column(Text, nullable=True)     # max 200 chars, text+emojis only
    body                = Column(Text, nullable=False)    # 1–5000 chars
    has_emoji           = Column(Boolean, default=False)
    has_url             = Column(Boolean, default=False)
    font_styles         = Column(JSONB, nullable=True)
    sent_count          = Column(Integer, default=0)
    open_count          = Column(Integer, default=0)      # count(EO='Y')
    click_count         = Column(Integer, default=0)      # count(EC='Y')

    segment = relationship("Segment", back_populates="variants")


# ---------------------------------------------------------------------------
# AgentLog  — every LLM call writes a row
# ---------------------------------------------------------------------------
class AgentLog(Base):
    __tablename__ = "agent_logs"

    id              = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    campaign_id     = Column(UUID(as_uuid=False), ForeignKey("campaigns.id"), nullable=False, index=True)
    agent_name      = Column(String, nullable=False)
    step            = Column(Integer, nullable=True)
    input_payload   = Column(JSONB, nullable=True)
    output_payload  = Column(JSONB, nullable=True)
    llm_reasoning   = Column(Text, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)

    campaign = relationship("Campaign", back_populates="agent_logs")


# ---------------------------------------------------------------------------
# WhatsAppMessage  — one outbound WhatsApp message + its engagement lifecycle
#
# Written by the send_campaign tool, updated by the pywa webhook handlers when
# the simulator delivers `read` receipts (→ EO) and button-tap "clicks" (→ EC).
# ---------------------------------------------------------------------------
class WhatsAppMessage(Base):
    __tablename__ = "whatsapp_messages"

    id           = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    # The id returned by send_campaign and stored on Variant.external_campaign_id.
    broadcast_id = Column(String, nullable=False, index=True)
    # Internal Nudge campaign uuid (for traceability / joins).
    campaign_id  = Column(String, nullable=True, index=True)
    customer_id  = Column(String, nullable=False, index=True)
    wa_id        = Column(String, nullable=True)   # recipient WhatsApp number
    wamid        = Column(String, nullable=True, index=True)   # message id from the Cloud API
    # tracker == f"{broadcast_id}:{customer_id}" — round-trips on read + click webhooks.
    tracker      = Column(String, nullable=False, index=True)
    status       = Column(String, default="sent", nullable=False)  # sent|delivered|read|failed
    clicked      = Column(Boolean, default=False, nullable=False)
    replied      = Column(Boolean, default=False, nullable=False)   # customer replied to this campaign
    created_at   = Column(DateTime, default=datetime.utcnow)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ---------------------------------------------------------------------------
# WebhookEvent  — inbound provider event log for idempotency / dedup.
#
# Every inbound WhatsApp event (message, status, button) is recorded here BEFORE
# it is processed. A duplicate (same provider + provider_event_id) is detected by
# the unique constraint and ignored, so retries / double-delivery never create
# duplicate leads, replies, tags, or pipeline moves.
# ---------------------------------------------------------------------------
class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    id                = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    workspace_id      = Column(UUID(as_uuid=False), nullable=True, index=True)  # set once routed
    provider          = Column(String, nullable=False)   # whatsapp_sim | whatsapp_cloud
    provider_event_id = Column(String, nullable=False)   # wamid / status id — dedup key
    message_id        = Column(String, nullable=True)
    payload           = Column(JSONB, nullable=True)
    status            = Column(String, nullable=False, default="received")  # received|processing|processed|failed|ignored_duplicate
    error             = Column(Text, nullable=True)
    created_at        = Column(DateTime, default=datetime.utcnow)
    processed_at      = Column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint("provider", "provider_event_id", name="uq_webhook_provider_event"),
    )


# ---------------------------------------------------------------------------
# AiTrace  — per-message audit log of what the AI graph decided.
#
# One row per processed inbound message. Honest by construction: deterministic
# fallbacks store confidence=NULL with confidence_source="deterministic" rather
# than a fabricated number.
# ---------------------------------------------------------------------------
class AiTrace(Base):
    __tablename__ = "ai_traces"

    id                 = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    workspace_id       = Column(UUID(as_uuid=False), ForeignKey("workspaces.id"), nullable=False, index=True)
    contact_id         = Column(UUID(as_uuid=False), nullable=True)
    lead_id            = Column(UUID(as_uuid=False), nullable=True)
    conversation_id    = Column(UUID(as_uuid=False), nullable=True, index=True)
    inbound_message_id = Column(UUID(as_uuid=False), nullable=True)
    vertical           = Column(String, nullable=True)
    intent             = Column(String, nullable=True)
    confidence         = Column(Float, nullable=True)    # NULL when not honestly available
    confidence_source  = Column(String, nullable=True)   # llm | deterministic | rule | unknown
    extracted_fields   = Column(JSONB, nullable=True)
    stage_before       = Column(String, nullable=True)
    stage_after        = Column(String, nullable=True)
    tags_added         = Column(JSONB, nullable=True)
    next_action        = Column(String, nullable=True)
    handoff_required   = Column(Boolean, nullable=False, default=False)
    handoff_reason     = Column(String, nullable=True)
    fallback_used      = Column(Boolean, nullable=False, default=False)
    model_used         = Column(String, nullable=True)
    graph_version      = Column(String, nullable=True)
    error              = Column(Text, nullable=True)
    created_at         = Column(DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------------------
# MessageOutbox  — durable outbound send queue (transactional outbox pattern).
#
# The AI graph never sends WhatsApp messages as a fragile side effect; it
# enqueues a row here. A worker sends pending rows with retry/backoff and marks
# them dead after max_attempts. The (workspace_id, idempotency_key) unique
# constraint guarantees the same reply is never sent twice.
# ---------------------------------------------------------------------------
class MessageOutbox(Base):
    __tablename__ = "message_outbox"

    id                  = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    workspace_id        = Column(UUID(as_uuid=False), ForeignKey("workspaces.id"), nullable=False, index=True)
    contact_id          = Column(UUID(as_uuid=False), nullable=True)
    conversation_id     = Column(UUID(as_uuid=False), nullable=True, index=True)
    inbox_message_id    = Column(UUID(as_uuid=False), nullable=True)  # InboxMessage to stamp with wamid
    channel             = Column(String, nullable=False, default="whatsapp")
    payload             = Column(JSONB, nullable=False)   # {to, text, sender}
    idempotency_key     = Column(String, nullable=False)
    status              = Column(String, nullable=False, default="pending")  # pending|sending|sent|failed|dead
    attempts            = Column(Integer, nullable=False, default=0)
    max_attempts        = Column(Integer, nullable=False, default=5)
    next_attempt_at     = Column(DateTime, nullable=True)
    provider_message_id = Column(String, nullable=True)
    last_error          = Column(Text, nullable=True)
    created_at          = Column(DateTime, default=datetime.utcnow)
    sent_at             = Column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint("workspace_id", "idempotency_key", name="uq_outbox_idem"),
    )


# ---------------------------------------------------------------------------
# SyncRun  — a reconciliation job run (status / consistency / analytics).
# Provider-agnostic so the simulator and the real WhatsApp Cloud API both fit.
# ---------------------------------------------------------------------------
class SyncRun(Base):
    __tablename__ = "sync_runs"

    id           = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    workspace_id = Column(UUID(as_uuid=False), nullable=True, index=True)
    sync_type    = Column(String, nullable=False)   # message_status | contacts | campaigns | full_workspace
    cursor       = Column(JSONB, nullable=True)
    status       = Column(String, nullable=False, default="running")  # running | success | failed
    stats        = Column(JSONB, nullable=True)      # job-specific counters
    started_at   = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    error        = Column(Text, nullable=True)


# ---------------------------------------------------------------------------
# ApiCallLog  — rate-limit tracker (100 calls/day per endpoint)
# ---------------------------------------------------------------------------
class ApiCallLog(Base):
    __tablename__ = "api_call_logs"

    id         = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    endpoint   = Column(String, nullable=False)
    date_utc   = Column(Date, nullable=False, default=date.today)
    call_count = Column(Integer, default=0, nullable=False)

    __table_args__ = (
        UniqueConstraint("endpoint", "date_utc", name="uq_endpoint_date"),
    )
