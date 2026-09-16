"""
Convert a downloaded Kaggle CSV into a Nudge-ready contacts CSV.

Most public customer/marketing datasets have demographics (age, city, income…)
but no phone numbers — so this script maps the columns Nudge understands and
**synthesizes a WhatsApp number per row** when one isn't present.

    python sample_data/kaggle_to_nudge.py <input.csv> [output.csv]

The output header uses Nudge's importer aliases; any unrecognised columns are
preserved and land in each contact's `attributes`. Import the result via
Contacts → Import CSV in the app.
"""
import csv
import sys

# Source-header (lowercased) → Nudge field.
ALIASES = {
    "full_name": "full_name", "name": "full_name", "customer_name": "full_name", "fullname": "full_name",
    "whatsapp_number": "whatsapp_number", "whatsapp": "whatsapp_number", "phone": "whatsapp_number",
    "phone_number": "whatsapp_number", "mobile": "whatsapp_number", "number": "whatsapp_number", "msisdn": "whatsapp_number",
    "email": "email", "email_address": "email",
    "age": "age", "gender": "gender", "sex": "gender",
    "city": "city", "region": "city", "location": "city",
    "income": "monthly_income", "monthly_income": "monthly_income", "annual_income": "monthly_income",
    "balance": "monthly_income",
    "credit_score": "credit_score", "creditscore": "credit_score",
    "occupation_type": "occupation_type", "job": "occupation_type", "occupation": "occupation_type",
    "kyc_status": "kyc_status",
}


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    inp = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "sample_data/nudge_from_kaggle.csv"

    with open(inp, newline="", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.DictReader(f)
        src_cols = reader.fieldnames or []
        rows = list(reader)

    has_phone = any(ALIASES.get(c.strip().lower()) == "whatsapp_number" for c in src_cols)

    # Output columns: mapped Nudge fields first, then passthrough extras.
    mapped = {}
    extras = []
    for c in src_cols:
        norm = ALIASES.get(c.strip().lower())
        if norm:
            mapped[c] = norm
        else:
            extras.append(c)
    out_fields = []
    for v in ["full_name", "whatsapp_number", "email", "age", "gender", "city",
              "occupation_type", "monthly_income", "credit_score", "kyc_status"]:
        if v in mapped.values() or (v == "whatsapp_number" and not has_phone) or v == "full_name":
            if v not in out_fields:
                out_fields.append(v)
    out_fields += [c for c in extras if c not in out_fields]

    written = 0
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=out_fields, extrasaction="ignore")
        w.writeheader()
        for i, row in enumerate(rows, start=1):
            rec = {}
            for src, val in row.items():
                norm = mapped.get(src)
                if norm:
                    rec[norm] = val
                elif src in extras:
                    rec[src] = val
            if not has_phone or not rec.get("whatsapp_number"):
                rec["whatsapp_number"] = f"9199{i:08d}"
            if not rec.get("full_name"):
                rec["full_name"] = f"Customer {i}"
            w.writerow(rec)
            written += 1

    print(f"Converted {written} rows → {out}")
    print(f"Mapped columns: {mapped or '(none — synthesized numbers/names)'}")
    print("Now import it in the app: Contacts → Import CSV")


if __name__ == "__main__":
    main()
