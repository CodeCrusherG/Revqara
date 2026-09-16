"""
WhatsApp CRM contact book (synthetic, deterministic).

Replaces the old external "customer cohort" endpoint. Generates a stable book of
1,000 WhatsApp subscribers with the *exact* field names the downstream agents
already expect (so the Profiler/Planner/Predictor need no changes), plus a
``WhatsApp_Number`` for each contact.

Everything is seeded, so the same contact book — and the same phone numbers — are
produced on every run and in every process (backend + simulator agree).
"""
from __future__ import annotations

import random

COHORT_SIZE = 1000

# Distributions grounded in the original BFSI cohort shape.
_CITIES = [
    "Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Pune", "Kolkata",
    "Ahmedabad", "Jaipur", "Lucknow", "Bhopal", "Kochi", "Indore", "Nagpur",
    "Surat", "Coimbatore", "Patna", "Visakhapatnam",
]
_OCCUPATIONS = [
    "Software Engineer", "Teacher", "Doctor", "Business Owner", "Accountant",
    "Sales Executive", "Consultant", "Designer", "Banker", "Civil Servant",
]
_OCC_TYPES = ["Full-time", "Part-time", "Self-employed", "Contract"]
_GENDERS = ["Male", "Female"]
_MARITAL = ["Single", "Married", "Divorced"]
_YN = ["Y", "N"]
_FIRST = ["Aarav", "Vivaan", "Aditya", "Diya", "Saanvi", "Ananya", "Ishaan",
          "Kabir", "Riya", "Aisha", "Rohan", "Neha", "Arjun", "Priya", "Karan",
          "Sneha", "Rahul", "Pooja", "Amit", "Meera"]
_LAST = ["Sharma", "Verma", "Patel", "Reddy", "Nair", "Iyer", "Gupta", "Singh",
         "Khan", "Das", "Bose", "Mehta", "Joshi", "Rao", "Kapoor"]


def whatsapp_number(customer_id: str) -> str:
    """
    Deterministic E.164-style Indian WhatsApp number for a customer_id.

    ``CUST0001`` → ``919900000001``. Same mapping is used when sending and when
    reporting, so events always tie back to the right contact.
    """
    digits = "".join(ch for ch in customer_id if ch.isdigit()) or "0"
    return f"9199{int(digits):08d}"


def _make_contact(index: int) -> dict:
    """Build one synthetic CRM contact with the canonical cohort field names."""
    rng = random.Random(1000 + index)
    cid = f"CUST{index:04d}"
    age = rng.randint(21, 65)
    gender = rng.choice(_GENDERS)
    city = rng.choice(_CITIES)
    income = rng.choice([35000, 55000, 80000, 120000, 180000, 250000, 400000, 600000])
    first = rng.choice(_FIRST)
    last = rng.choice(_LAST)
    full_name = f"{first} {last}"
    return {
        "customer_id": cid,
        "Full_name": full_name,
        "email": f"{first.lower()}.{last.lower()}{index}@example.com",
        "WhatsApp_Number": whatsapp_number(cid),
        "Age": age,
        "Gender": gender,
        "Marital_Status": rng.choice(_MARITAL),
        "Family_Size": rng.randint(1, 6),
        "Dependent count": rng.randint(0, 4),
        "Occupation": rng.choice(_OCCUPATIONS),
        "Occupation type": rng.choice(_OCC_TYPES),
        "Monthly_Income": income,
        "KYC status": "Y" if rng.random() < 0.75 else "N",
        "City": city,
        "Kids_in_Household": rng.randint(0, 3),
        "App_Installed": "Y" if rng.random() < 0.6 else "N",
        "Existing Customer": "Y" if rng.random() < 0.45 else "N",
        "Credit score": rng.randint(550, 820),
        "Social_Media_Active": "Y" if rng.random() < 0.7 else "N",
    }


def generate_cohort(size: int = COHORT_SIZE) -> list[dict]:
    """Return the full deterministic WhatsApp CRM contact book."""
    return [_make_contact(i) for i in range(1, size + 1)]
