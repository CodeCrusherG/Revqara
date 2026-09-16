"""
Generate a realistic, ready-to-import synthetic contacts CSV for Nudge.

No external dependencies. Produces a file whose header matches Nudge's CSV
importer (Contacts → Import CSV), including a couple of extra columns to show
how unknown columns are captured into a contact's `attributes`.

    python sample_data/generate_sample.py [rows] [outfile]
"""
import csv
import random
import sys

CITIES = ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Pune", "Kolkata",
          "Ahmedabad", "Jaipur", "Lucknow", "Bhopal", "Kochi", "Indore", "Nagpur", "Surat"]
OCC_TYPES = ["Full-time", "Part-time", "Self-employed", "Contract"]
SEGMENTS = ["new", "active", "at_risk", "vip", "dormant"]
FIRST = ["Aarav", "Vivaan", "Aditya", "Diya", "Saanvi", "Ananya", "Ishaan", "Kabir", "Riya",
         "Aisha", "Rohan", "Neha", "Arjun", "Priya", "Karan", "Sneha", "Rahul", "Pooja", "Amit", "Meera"]
LAST = ["Sharma", "Verma", "Patel", "Reddy", "Nair", "Iyer", "Gupta", "Singh", "Khan", "Das",
        "Bose", "Mehta", "Joshi", "Rao", "Kapoor"]

HEADER = ["full_name", "whatsapp_number", "email", "age", "gender", "city",
          "occupation_type", "monthly_income", "credit_score", "kyc_status",
          "app_installed", "existing_customer", "social_media_active",
          "segment", "lifetime_value"]


def make_row(i: int, rng: random.Random) -> dict:
    first, last = rng.choice(FIRST), rng.choice(LAST)
    income = rng.choice([35000, 55000, 80000, 120000, 180000, 250000, 400000, 600000])
    return {
        "full_name": f"{first} {last}",
        "whatsapp_number": f"9199{i:08d}",
        "email": f"{first.lower()}.{last.lower()}{i}@example.com",
        "age": rng.randint(21, 65),
        "gender": rng.choice(["Male", "Female"]),
        "city": rng.choice(CITIES),
        "occupation_type": rng.choice(OCC_TYPES),
        "monthly_income": income,
        "credit_score": rng.randint(550, 820),
        "kyc_status": "Y" if rng.random() < 0.75 else "N",
        "app_installed": "Y" if rng.random() < 0.6 else "N",
        "existing_customer": "Y" if rng.random() < 0.45 else "N",
        "social_media_active": "Y" if rng.random() < 0.7 else "N",
        "segment": rng.choice(SEGMENTS),                      # extra → contact.attributes
        "lifetime_value": round(income * rng.uniform(0.2, 4.0)),  # extra → contact.attributes
    }


def main():
    rows = int(sys.argv[1]) if len(sys.argv) > 1 else 500
    out = sys.argv[2] if len(sys.argv) > 2 else "sample_data/nudge_contacts_sample.csv"
    rng = random.Random(42)
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=HEADER)
        w.writeheader()
        for i in range(1, rows + 1):
            w.writerow(make_row(i, rng))
    print(f"Wrote {rows} contacts → {out}")


if __name__ == "__main__":
    main()
