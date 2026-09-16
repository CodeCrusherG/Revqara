"""
Contacts + Contact Lists API (workspace-scoped).

Endpoints:
  GET    /api/contacts                 list / search contacts
  POST   /api/contacts                 create a contact
  PATCH  /api/contacts/{id}            update a contact
  DELETE /api/contacts/{id}            delete a contact
  POST   /api/contacts/import          CSV upload (multipart)
  POST   /api/contacts/seed-demo       load synthetic demo contacts

  GET    /api/lists                    list contact lists (with counts)
  POST   /api/lists                    create a list
  DELETE /api/lists/{id}               delete a list
  GET    /api/lists/{id}/contacts      contacts in a list
  POST   /api/lists/{id}/members       add contacts to a list  {contact_ids:[...]}
  DELETE /api/lists/{id}/members/{cid} remove a contact from a list
"""
from __future__ import annotations

import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth.deps import get_current_workspace
from db.database import get_db
from db.models import Contact, ContactList, ContactListMember, Workspace
from plans import plan_def, remaining_contact_slots, contact_count
from tools.whatsapp_crm import generate_cohort

router = APIRouter()

# Aliases accepted from CSV headers → Contact fields.
_COLUMN_ALIASES = {
    "full_name": "full_name", "name": "full_name", "fullname": "full_name",
    "whatsapp_number": "whatsapp_number", "whatsapp": "whatsapp_number",
    "phone": "whatsapp_number", "number": "whatsapp_number", "mobile": "whatsapp_number", "msisdn": "whatsapp_number",
    "email": "email",
    "age": "age", "gender": "gender", "city": "city",
    "occupation_type": "occupation_type", "occupation type": "occupation_type",
    "monthly_income": "monthly_income", "monthly income": "monthly_income", "income": "monthly_income",
    "credit_score": "credit_score", "credit score": "credit_score",
    "kyc_status": "kyc_status", "kyc status": "kyc_status", "kyc": "kyc_status",
    "app_installed": "app_installed", "app installed": "app_installed",
    "existing_customer": "existing_customer", "existing customer": "existing_customer",
    "social_media_active": "social_media_active", "social media active": "social_media_active",
}
_INT_FIELDS = {"age", "monthly_income", "credit_score"}


def normalize_number(raw: str) -> str | None:
    digits = "".join(ch for ch in str(raw or "") if ch.isdigit())
    if not digits:
        return None
    if len(digits) == 10:  # bare Indian local number → prepend country code
        digits = "91" + digits
    return digits


def _serialize_contact(c: Contact) -> dict:
    return {
        "id": c.id, "full_name": c.full_name, "whatsapp_number": c.whatsapp_number, "email": c.email,
        "age": c.age, "gender": c.gender, "city": c.city, "occupation_type": c.occupation_type,
        "monthly_income": c.monthly_income, "credit_score": c.credit_score, "kyc_status": c.kyc_status,
        "app_installed": c.app_installed, "existing_customer": c.existing_customer,
        "social_media_active": c.social_media_active, "attributes": c.attributes,
        "tags": c.tags or [],
        "opt_in_status": c.opt_in_status, "opt_in_source": c.opt_in_source,
        "created_at": c.created_at,
    }


def _row_to_kwargs(row: dict) -> tuple[dict, dict]:
    """Map a raw dict to (Contact fields, leftover attributes)."""
    fields: dict = {}
    extras: dict = {}
    for key, value in row.items():
        if value is None or str(value).strip() == "":
            continue
        norm = _COLUMN_ALIASES.get(str(key).strip().lower())
        if norm:
            if norm in _INT_FIELDS:
                try:
                    fields[norm] = int(float(str(value).replace(",", "")))
                except ValueError:
                    continue
            else:
                fields[norm] = str(value).strip()
        else:
            extras[str(key).strip()] = str(value).strip()
    return fields, extras


class ContactIn(BaseModel):
    full_name: str | None = None
    whatsapp_number: str
    email: str | None = None
    age: int | None = None
    gender: str | None = None
    city: str | None = None
    occupation_type: str | None = None
    monthly_income: int | None = None
    credit_score: int | None = None
    kyc_status: str | None = None
    app_installed: str | None = None
    existing_customer: str | None = None
    social_media_active: str | None = None
    attributes: dict | None = None


def _upsert_contact(db: Session, ws_id: str, fields: dict, extras: dict | None, source: str = "import") -> tuple[bool, bool]:
    """Insert or update by (workspace, number). Returns (ok, created).

    On creation the contact is recorded as opted-in: adding/importing a contact
    is the business attesting it holds the contact's consent. Customers can still
    opt out (e.g. by texting STOP), which sets opted_out.
    """
    number = normalize_number(fields.get("whatsapp_number"))
    if not number:
        return False, False
    existing = (
        db.query(Contact)
        .filter(Contact.workspace_id == ws_id, Contact.whatsapp_number == number)
        .first()
    )
    created = existing is None
    contact = existing or Contact(workspace_id=ws_id, whatsapp_number=number)
    for k, v in fields.items():
        if k == "whatsapp_number":
            continue
        setattr(contact, k, v)
    if extras:
        contact.attributes = {**(contact.attributes or {}), **extras}
    if created:
        contact.opt_in_status = "opted_in"
        contact.opt_in_source = source
        contact.opt_in_at = datetime.utcnow()
        db.add(contact)
    return True, created


# ── Contacts ──────────────────────────────────────────────────────────────────

@router.get("/contacts")
def list_contacts(
    q: str | None = None, limit: int = 100, offset: int = 0,
    ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db),
):
    query = db.query(Contact).filter(Contact.workspace_id == ws.id)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter((Contact.full_name.ilike(like)) | (Contact.whatsapp_number.ilike(like)) | (Contact.email.ilike(like)))
    total = query.count()
    rows = query.order_by(Contact.created_at.desc()).offset(offset).limit(min(limit, 500)).all()
    return {"total": total, "contacts": [_serialize_contact(c) for c in rows]}


@router.post("/contacts")
def create_contact(body: ContactIn, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    if remaining_contact_slots(db, ws) < 1:
        raise HTTPException(status_code=402, detail=f"Contact limit reached for the {plan_def(ws.plan)['name']} plan. Upgrade to add more.")
    number = normalize_number(body.whatsapp_number)
    if not number:
        raise HTTPException(status_code=400, detail="A valid WhatsApp number is required.")
    if db.query(Contact).filter(Contact.workspace_id == ws.id, Contact.whatsapp_number == number).first():
        raise HTTPException(status_code=409, detail="A contact with this number already exists.")
    fields = body.model_dump(exclude_none=True)
    extras = fields.pop("attributes", None)
    fields["whatsapp_number"] = number
    _upsert_contact(db, ws.id, fields, extras, source="manual")
    db.commit()
    return {"ok": True}


class TagsIn(BaseModel):
    tags: list[str]


@router.post("/contacts/{contact_id}/tags")
def set_tags(contact_id: str, body: TagsIn, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    c = db.query(Contact).filter(Contact.id == contact_id, Contact.workspace_id == ws.id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contact not found")
    c.tags = [t.strip() for t in body.tags if t.strip()][:20]
    db.commit()
    return {"ok": True, "tags": c.tags}


@router.post("/contacts/{contact_id}/opt-out")
def opt_out(contact_id: str, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    c = db.query(Contact).filter(Contact.id == contact_id, Contact.workspace_id == ws.id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contact not found")
    c.opt_in_status = "opted_out"
    db.commit()
    return {"ok": True, "opt_in_status": c.opt_in_status}


@router.post("/contacts/{contact_id}/opt-in")
def opt_in(contact_id: str, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    c = db.query(Contact).filter(Contact.id == contact_id, Contact.workspace_id == ws.id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contact not found")
    c.opt_in_status = "opted_in"
    c.opt_in_source = "manual"
    c.opt_in_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "opt_in_status": c.opt_in_status}


@router.patch("/contacts/{contact_id}")
def update_contact(contact_id: str, body: ContactIn, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    c = db.query(Contact).filter(Contact.id == contact_id, Contact.workspace_id == ws.id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contact not found")
    data = body.model_dump(exclude_none=True)
    extras = data.pop("attributes", None)
    if "whatsapp_number" in data:
        data["whatsapp_number"] = normalize_number(data["whatsapp_number"]) or c.whatsapp_number
    for k, v in data.items():
        setattr(c, k, v)
    if extras:
        c.attributes = {**(c.attributes or {}), **extras}
    db.commit()
    return _serialize_contact(c)


@router.delete("/contacts/{contact_id}")
def delete_contact(contact_id: str, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    c = db.query(Contact).filter(Contact.id == contact_id, Contact.workspace_id == ws.id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contact not found")
    db.query(ContactListMember).filter(ContactListMember.contact_id == contact_id).delete()
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.post("/contacts/import")
async def import_contacts(
    file: UploadFile = File(...),
    ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db),
):
    raw = (await file.read()).decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(raw))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV appears to be empty or missing a header row.")

    slots = remaining_contact_slots(db, ws)
    created = updated = skipped = 0
    for row in reader:
        fields, extras = _row_to_kwargs(row)
        number = normalize_number(fields.get("whatsapp_number"))
        if not number:
            skipped += 1
            continue
        exists = db.query(Contact).filter(Contact.workspace_id == ws.id, Contact.whatsapp_number == number).first()
        if exists is None and slots <= 0:
            skipped += 1
            continue
        ok, was_created = _upsert_contact(db, ws.id, {**fields, "whatsapp_number": number}, extras)
        if not ok:
            skipped += 1
            continue
        if was_created:
            created += 1
            slots -= 1
        else:
            updated += 1
    db.commit()
    return {"created": created, "updated": updated, "skipped": skipped, "remaining_slots": slots}


@router.post("/contacts/seed-demo")
def seed_demo(count: int = 100, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    """Populate the workspace with synthetic demo contacts (capped by plan + request)."""
    slots = remaining_contact_slots(db, ws)
    target = max(0, min(count, slots, 1000))
    cohort = generate_cohort(target) if target else []
    created = 0
    for rec in cohort:
        ok, was_created = _upsert_contact(db, ws.id, {
            "full_name": rec["Full_name"], "whatsapp_number": rec["WhatsApp_Number"], "email": rec["email"],
            "age": rec["Age"], "gender": rec["Gender"], "city": rec["City"],
            "occupation_type": rec["Occupation type"], "monthly_income": rec["Monthly_Income"],
            "credit_score": rec["Credit score"], "kyc_status": rec["KYC status"],
            "app_installed": rec["App_Installed"], "existing_customer": rec["Existing Customer"],
            "social_media_active": rec["Social_Media_Active"],
        }, None)
        if was_created:
            created += 1
    db.commit()
    return {"created": created, "total_contacts": contact_count(db, ws.id)}


# ── Lists ───────────────────────────────────────────────────────────────────────

class ListIn(BaseModel):
    name: str
    description: str | None = None


class MembersIn(BaseModel):
    contact_ids: list[str]


def _list_count(db: Session, list_id: str) -> int:
    return db.query(ContactListMember).filter(ContactListMember.list_id == list_id).count()


@router.get("/lists")
def list_lists(ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    lists = db.query(ContactList).filter(ContactList.workspace_id == ws.id).order_by(ContactList.created_at.desc()).all()
    return [
        {"id": l.id, "name": l.name, "description": l.description, "created_at": l.created_at, "member_count": _list_count(db, l.id)}
        for l in lists
    ]


@router.post("/lists")
def create_list(body: ListIn, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    max_lists = plan_def(ws.plan)["max_lists"]
    if db.query(ContactList).filter(ContactList.workspace_id == ws.id).count() >= max_lists:
        raise HTTPException(status_code=402, detail=f"List limit reached for the {plan_def(ws.plan)['name']} plan.")
    lst = ContactList(workspace_id=ws.id, name=body.name.strip(), description=body.description)
    db.add(lst)
    db.commit()
    db.refresh(lst)
    return {"id": lst.id, "name": lst.name, "description": lst.description, "member_count": 0}


@router.delete("/lists/{list_id}")
def delete_list(list_id: str, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    lst = db.query(ContactList).filter(ContactList.id == list_id, ContactList.workspace_id == ws.id).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found")
    db.query(ContactListMember).filter(ContactListMember.list_id == list_id).delete()
    db.delete(lst)
    db.commit()
    return {"ok": True}


@router.get("/lists/{list_id}/contacts")
def list_members(list_id: str, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    lst = db.query(ContactList).filter(ContactList.id == list_id, ContactList.workspace_id == ws.id).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found")
    rows = (
        db.query(Contact)
        .join(ContactListMember, ContactListMember.contact_id == Contact.id)
        .filter(ContactListMember.list_id == list_id)
        .all()
    )
    return {"list": {"id": lst.id, "name": lst.name}, "contacts": [_serialize_contact(c) for c in rows]}


@router.post("/lists/{list_id}/members")
def add_members(list_id: str, body: MembersIn, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    lst = db.query(ContactList).filter(ContactList.id == list_id, ContactList.workspace_id == ws.id).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found")
    added = 0
    for cid in body.contact_ids:
        contact = db.query(Contact).filter(Contact.id == cid, Contact.workspace_id == ws.id).first()
        if not contact:
            continue
        exists = db.query(ContactListMember).filter(ContactListMember.list_id == list_id, ContactListMember.contact_id == cid).first()
        if exists:
            continue
        db.add(ContactListMember(list_id=list_id, contact_id=cid))
        added += 1
    db.commit()
    return {"added": added, "member_count": _list_count(db, list_id)}


@router.delete("/lists/{list_id}/members/{contact_id}")
def remove_member(list_id: str, contact_id: str, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    lst = db.query(ContactList).filter(ContactList.id == list_id, ContactList.workspace_id == ws.id).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found")
    db.query(ContactListMember).filter(ContactListMember.list_id == list_id, ContactListMember.contact_id == contact_id).delete()
    db.commit()
    return {"ok": True, "member_count": _list_count(db, list_id)}
