"""
Transform the Kaggle "Customer Personality Analysis" dataset into a Nudge-ready
contacts CSV.

Real attributes (income, age-from-birth-year, education, marital status, kids,
recency, total spend, web behaviour) are preserved; the contact layer WhatsApp
needs (name, number, city, gender) is synthesized, since the public dataset is
anonymised.

    python sample_data/prep_customer_personality.py \
        sample_data/kaggle/customer_personality.csv \
        sample_data/nudge_customers_kaggle.csv
"""
import csv
import random
import sys

CITIES = ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Pune", "Kolkata",
          "Ahmedabad", "Jaipur", "Lucknow", "Kochi", "Indore", "Nagpur", "Surat"]
FIRST = ["Aarav", "Vivaan", "Aditya", "Diya", "Saanvi", "Ananya", "Ishaan", "Kabir", "Riya",
         "Aisha", "Rohan", "Neha", "Arjun", "Priya", "Karan", "Sneha", "Rahul", "Pooja", "Amit", "Meera"]
LAST = ["Sharma", "Verma", "Patel", "Reddy", "Nair", "Iyer", "Gupta", "Singh", "Khan", "Das", "Mehta", "Joshi", "Rao"]

HEADER = ["full_name", "whatsapp_number", "age", "gender", "city", "monthly_income",
          "existing_customer", "app_installed", "social_media_active",
          "education", "marital_status", "kids", "recency_days", "total_spend"]


def _int(v, default=0):
    try:
        return int(float(str(v).strip()))
    except (TypeError, ValueError):
        return default


def main():
    inp = sys.argv[1] if len(sys.argv) > 1 else "sample_data/kaggle/customer_personality.csv"
    out = sys.argv[2] if len(sys.argv) > 2 else "sample_data/nudge_customers_kaggle.csv"
    rng = random.Random(7)

    with open(inp, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    written = 0
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=HEADER)
        w.writeheader()
        for r in rows:
            cid = _int(r.get("ID"))
            income = _int(r.get("Income"))
            if income <= 0:
                continue
            age = max(18, min(90, 2024 - _int(r.get("Year_Birth"), 1985)))
            web_visits = _int(r.get("NumWebVisitsMonth"))
            web_purch = _int(r.get("NumWebPurchases"))
            spend = sum(_int(r.get(c)) for c in
                        ["MntWines", "MntFruits", "MntMeatProducts", "MntFishProducts", "MntSweetProducts", "MntGoldProds"])
            first, last = rng.choice(FIRST), rng.choice(LAST)
            w.writerow({
                "full_name": f"{first} {last}",
                "whatsapp_number": f"9198{cid:08d}",
                "age": age,
                "gender": rng.choice(["Male", "Female"]),
                "city": rng.choice(CITIES),
                "monthly_income": income,
                "existing_customer": "Y",
                "app_installed": "Y" if web_purch >= 3 else "N",
                "social_media_active": "Y" if web_visits >= 5 else "N",
                "education": (r.get("Education") or "").strip(),
                "marital_status": (r.get("Marital_Status") or "").strip(),
                "kids": _int(r.get("Kidhome")) + _int(r.get("Teenhome")),
                "recency_days": _int(r.get("Recency")),
                "total_spend": spend,
            })
            written += 1
    print(f"Transformed {written} real consumers → {out}")


if __name__ == "__main__":
    main()
