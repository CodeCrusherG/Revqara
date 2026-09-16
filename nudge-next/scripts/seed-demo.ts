/**
 * seed-demo.ts — port of `backend/scripts/seed_demo.py` (the per-vertical
 * showcase half) for revqara-next / Appwrite. Idempotent: safe to re-run.
 *
 * Creates one demo workspace per vertical (coaching, clinic, real_estate,
 * salon, ecommerce, b2b, travel, restaurant, gym, automobile, insurance,
 * political_party) — each with:
 *   - a `workspaces` doc (natural key $id = "ws_demo_<vertical>"), vertical set,
 *   - a `whatsapp_accounts` doc with a KNOWN phoneNumberId ($id = pnid), so
 *     `/api/dev/inject` and `scripts/dev-inbound.ts` can target it,
 *   - a 1:1 `bots` doc,
 *   - real conversations driven through the universal AI graph via the SAME
 *     `processInboundMessage` the webhook uses (deterministic, no LLM env) — so
 *     "same graph, different business brain" is demoable end-to-end.
 *
 * Run:  npx tsx scripts/seed-demo.ts
 * Requires: NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID,
 *           APPWRITE_API_KEY (and APPWRITE_DATABASE_ID, default "crm").
 */
import { loadEnv } from "./_env";
loadEnv();

import { Client, Databases, AppwriteException } from "node-appwrite";

import { processInboundMessage } from "@/features/whatsapp/inbound";
import { AppwriteWhatsAppRepo } from "@/features/whatsapp/repo-appwrite";

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || "crm";

const COLLECTION = {
  workspaces: "workspaces",
  whatsappAccounts: "whatsapp_accounts",
  bots: "bots",
} as const;

/** (workspace name, [[customer, message], ...]) keyed by vertical — verbatim from seed_demo.py. */
const VERTICAL_DEMOS: Record<string, [string, Array<[string, string]>]> = {
  coaching: [
    "Apex Learning",
    [
      ["Rohan Sharma", "Fees kitna hai for class 11 JEE weekend batch?"],
      ["Priya Nair", "NEET dropper batch offline available hai?"],
      ["Ananya Singh", "UPSC prelims 2027 ke liye counselling book karni hai"],
      ["Vivek Menon", "SSC CGL aur CAT courses ke details share karo"],
      ["Anil Kumar", "This is the worst institute, I want a refund right now"],
    ],
  ],
  clinic: [
    "CarePlus Clinic",
    [
      ["Meera Iyer", "How much is the consultation fee for a dermatologist?"],
      ["Sanjay Rao", "I'd like to book an appointment for tomorrow morning"],
      ["Farah Khan", "My father has severe chest pain, this is an emergency"],
    ],
  ],
  real_estate: [
    "Skyline Realty",
    [
      ["Vikram Patel", "I want to schedule a visit for the 3BHK on Sunday"],
      ["Neha Gupta", "What's the price range for 2BHK flats in Whitefield?"],
      ["Imran Sheikh", "This is terrible service — you promised me a refund and cheated me"],
    ],
  ],
  salon: [
    "Glow Studio",
    [
      ["Aisha Verma", "How much is the bridal makeup package?"],
      ["Divya Menon", "Can I book a hair spa slot this Friday evening?"],
      ["Ritu Sharma", "I need to reschedule my appointment to next week"],
    ],
  ],
  ecommerce: [
    "Trendly",
    [
      ["Karan Malhotra", "What's the price of the wireless earbuds?"],
      ["Sneha Reddy", "Where is my order? It hasn't arrived yet"],
      ["Amit Joshi", "The product arrived damaged and I want a refund — this is a complaint"],
    ],
  ],
  b2b: [
    "BulkSupply Co",
    [
      ["Rajesh Agarwal", "I need a bulk order of 500 units, what's the rate?"],
      ["Sunita Desai", "Please send me a quotation for monthly supply"],
      ["Manoj Pillai", "Following up on the pending payment for last invoice"],
    ],
  ],
  travel: [
    "Wander Tours",
    [
      ["Pooja Bhatt", "What's the price for the Bali honeymoon package?"],
      ["Arjun Mehta", "Are there any slots available for the Manali trip in July?"],
      ["Leena Thomas", "I want to cancel my booking and get a refund"],
    ],
  ],
  restaurant: [
    "Spice Garden",
    [
      ["Rahul Khanna", "Table for 4 this Saturday at 8pm?"],
      ["Sneha Pillai", "What's on the menu and price for a veg thali?"],
      ["Deepak Rao", "Need catering for a 200 guest wedding"],
      ["Faizal Ahmed", "Found a hair in my food, worst service, I want a refund"],
    ],
  ],
  gym: [
    "FitZone Studio",
    [
      ["Akash Gupta", "What are your monthly membership plans and price?"],
      ["Pooja Shetty", "Can I book a free trial session this weekend?"],
      ["Rohit Verma", "I want a personal trainer and diet plan for weight loss"],
      ["Sameer Khan", "I have a knee injury and severe chest pain during workout"],
    ],
  ],
  automobile: [
    "DriveLine Motors",
    [
      ["Nikhil Joshi", "Can I book a test drive for the Creta this Sunday?"],
      ["Anita Desai", "What's the on-road price and EMI for the petrol variant?"],
      ["Suresh Babu", "My car AC is not cooling, need a service appointment"],
      ["Manish Tiwari", "Worst dealer, manufacturing defect in my new car, I want a refund"],
    ],
  ],
  insurance: [
    "SecureLife Advisors",
    [
      ["Kavya Reddy", "I need a term insurance plan for my family"],
      ["Arvind Nair", "What's the premium for 1 crore health cover?"],
      ["Tina Dsouza", "Can you recommend the best plan: term vs ULIP?"],
      ["Harish Menon", "My health claim was rejected and I want to file a dispute"],
    ],
  ],
  political_party: [
    "Jan Seva Office",
    [
      ["Mahesh Yadav", "Ward 18 mein drainage issue hai, complaint register karna hai"],
      ["Kavita Rao", "Main mandal karyakarta hoon, Sunday seva camp ke liye volunteer karna hai"],
      ["Suresh Patil", "Need help with sadasyata membership update"],
      ["Nadeem Ansari", "Can you target voters by caste and religion for this election?"],
    ],
  ],
};

function requireEnv(): Databases {
  const missing: string[] = [];
  if (!ENDPOINT) missing.push("NEXT_PUBLIC_APPWRITE_ENDPOINT");
  if (!PROJECT_ID) missing.push("NEXT_PUBLIC_APPWRITE_PROJECT_ID");
  if (!API_KEY) missing.push("APPWRITE_API_KEY");
  if (missing.length) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }
  const client = new Client()
    .setEndpoint(ENDPOINT as string)
    .setProject(PROJECT_ID as string)
    .setKey(API_KEY as string);
  return new Databases(client);
}

async function getOrCreate(
  db: Databases,
  collection: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await db.getDocument(DATABASE_ID, collection, id);
  } catch (err) {
    if (err instanceof AppwriteException && err.code === 404) {
      try {
        await db.createDocument(DATABASE_ID, collection, id, data);
      } catch (createErr) {
        if (!(createErr instanceof AppwriteException) || createErr.code !== 409) {
          throw createErr;
        }
      }
      return;
    }
    throw err;
  }
}

/** $id-stable phoneNumberId per vertical (20_000_000_000_000 + idx — same scheme as seed_demo.py). */
function phoneNumberIdFor(idx: number): string {
  return String(20_000_000_000_000 + idx);
}

async function main(): Promise<void> {
  const db = requireEnv();
  const repo = new AppwriteWhatsAppRepo();

  console.log(
    `Seeding demo workspaces on Appwrite "${DATABASE_ID}" @ ${ENDPOINT}\n`,
  );

  let vIdx = 0;
  for (const [vertical, [name, convos]] of Object.entries(VERTICAL_DEMOS)) {
    const workspaceId = `ws_demo_${vertical}`;
    const phoneNumberId = phoneNumberIdFor(vIdx);

    await getOrCreate(db, COLLECTION.workspaces, workspaceId, {
      name,
      plan: "ai_pro",
      planStatus: "active",
      vertical,
      appwriteTeamId: null,
      rzpCustomerId: null,
      rzpSubscriptionId: null,
      currentPeriodEnd: null,
      billingEmail: null,
    });

    // whatsapp_accounts: natural key $id = phoneNumberId (O(1) inbound routing).
    await getOrCreate(db, COLLECTION.whatsappAccounts, phoneNumberId, {
      workspaceId,
      wabaId: phoneNumberId,
      phoneNumberId,
      displayPhoneNumber: `+91 90000 0${String(vIdx).padStart(4, "0")}`,
      verifiedName: name,
      accessTokenRef: null,
      status: "connected",
    });

    // bots: 1:1 per workspace ($id = workspaceId).
    await getOrCreate(db, COLLECTION.bots, workspaceId, {
      workspaceId,
      enabled: true,
      handoffEnabled: true,
      name,
      prompt: null,
      knowledge: null,
    });

    // Seed conversations by driving the REAL inbound pipeline (idempotent via
    // the webhook_events dedup on a stable providerEventId per seeded message).
    let seeded = 0;
    for (let i = 0; i < convos.length; i++) {
      const [custName, message] = convos[i];
      const phone = String(919_900_000_000 + vIdx * 1000 + i);
      const eventId = `seed:${vertical}:${i}`;
      const res = await processInboundMessage(repo, {
        provider: "whatsapp_sim",
        providerEventId: eventId,
        phoneNumberId,
        waId: phone,
        name: custName,
        text: message,
      });
      if (res.status !== "ignored_duplicate") seeded += 1;
    }

    console.log(
      `  • ${vertical.padEnd(15)} ${workspaceId}  (${name}, pnid=${phoneNumberId}, ${seeded} chats)`,
    );
    vIdx += 1;
  }

  console.log(`\n✓ Demo seed complete — ${Object.keys(VERTICAL_DEMOS).length} verticals.`);
}

main().catch((err) => {
  console.error("\n✗ Demo seed failed:", err);
  process.exit(1);
});
