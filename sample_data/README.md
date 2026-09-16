# Demo & practice data for Nudge

Two ways to get realistic contacts into Nudge.

## A) Use the ready-made sample (no setup)

`nudge_contacts_sample.csv` — **500 synthetic contacts** already in Nudge's import
format (names, WhatsApp numbers, age, gender, city, income, KYC, etc.).

1. Log in → **Contacts → Import CSV** → pick `nudge_contacts_sample.csv`.
2. Build a list under **Contact Lists**, then launch a targeted campaign.

Regenerate / resize it any time:

```bash
python sample_data/generate_sample.py 1000 sample_data/nudge_contacts_sample.csv
```

## A2) Real Kaggle consumers (already wired)

`nudge_customers_kaggle.csv` — **2,216 real consumers** transformed from Kaggle's
[Customer Personality Analysis](https://www.kaggle.com/datasets/imakash3011/customer-personality-analysis)
dataset. Real income, age (from birth year), education, marital status, kids,
recency, and category spend are preserved (extra fields land in each contact's
`attributes`); name / number / city / gender are synthesized for the WhatsApp
contact layer.

Reproduce it:

```bash
# (downloaded mirror lives in sample_data/kaggle/customer_personality.csv)
python sample_data/prep_customer_personality.py \
    sample_data/kaggle/customer_personality.csv \
    sample_data/nudge_customers_kaggle.csv
# then Contacts → Import CSV
```

The live demo workspace is already seeded with these 2,216 consumers plus a
**"High-income (Kaggle)"** list (real `monthly_income > 75k`) you can target.

## B) Pull a real dataset from Kaggle, then convert

### 1. Set up the Kaggle CLI (one-time)

```bash
pip install kaggle
# kaggle.com → Account → Settings → "Create New Token" → downloads kaggle.json
mkdir -p ~/.kaggle && mv ~/Downloads/kaggle.json ~/.kaggle/ && chmod 600 ~/.kaggle/kaggle.json
```

### 2. Download a dataset

Good fits for WhatsApp marketing (customer demographics + behaviour):

| Dataset | Slug | Why |
|---|---|---|
| Synthetic Customer Data | `nickkrikota/synthetic-customer-data` | Faker-generated customers/subscriptions — fully synthetic |
| Marketing Sales Dataset | `abdelfattahibrahim/marketing-sales-dataset` | 60k rows of marketing/behaviour features |
| Customer Segmentation Data | `ravalsmit/customer-segmentation-data` | Demographics for segmentation |
| Customer Segmentation (Marketing) | `fahmidachowdhury/customer-segmentation-data-for-marketing-analysis` | Age/income/spend for targeting |
| Sales & Customer Insights | `imranalishahh/sales-and-customer-insights` | Customer behaviour + sales |
| Customer Personality Analysis | `imakash3011/customer-personality-analysis` | Classic marketing-campaign practice set |

```bash
kaggle datasets download -d nickkrikota/synthetic-customer-data -p sample_data --unzip
```

### 3. Convert to Nudge format and import

```bash
python sample_data/kaggle_to_nudge.py sample_data/<the-file>.csv sample_data/nudge_from_kaggle.csv
```

The converter maps recognised columns (name, age, gender, city, income, job, …),
**synthesizes a WhatsApp number** for each row (real datasets rarely include
phone numbers), and preserves any extra columns as contact `attributes`. Then
import `nudge_from_kaggle.csv` via **Contacts → Import CSV**.

> Note: synthesized numbers are for **demo/practice only** — they're not real
> people, so nothing is ever delivered to a real phone (the app sends through the
> offline WhatsApp Cloud API simulator).
