/**
 * Marketing copy for the 12 vertical specialists — a pure, public data module
 * (NO `server-only`, NO Appwrite/Clerk imports) so it is safe in statically
 * prerendered (marketing) routes and client components alike.
 *
 * Ported from:
 *  - frontend/src/lib/demoVerticals.js (label, tagline, pipeline, captures, prompts)
 *  - COACHING_CENTER_SPECIALIST.md / POLITICAL_PARTY_SPECIALIST.md (specialist pitch)
 *  - SALES.md (positioning lines, "wow" framing)
 *
 * Icons are referenced by lucide name (string) so this module stays free of any
 * React/runtime import; the rendering layer maps the name to a lucide component.
 */

/** Lucide icon names used by the vertical grid (resolved at render time). */
export type VerticalIconName =
  | "GraduationCap"
  | "Stethoscope"
  | "Building2"
  | "Scissors"
  | "ShoppingBag"
  | "Truck"
  | "Plane"
  | "Landmark"
  | "UtensilsCrossed"
  | "Dumbbell"
  | "Car"
  | "ShieldCheck";

export interface MarketingVertical {
  /** Stable slug — matches lib/config VERTICAL_SLUGS + the ai-graph pack key. */
  slug: string;
  /** Human label (parity with demoVerticals.js). */
  label: string;
  /** Lucide icon name. */
  icon: VerticalIconName;
  /** One-line value prop for the grid card. */
  tagline: string;
  /** Productised specialist name (e.g. "CoachingOps"). */
  specialist: string;
  /** Pipeline summary string (arrow-separated stages). */
  pipeline: string;
  /** Fields the AI auto-captures for this vertical. */
  captures: string[];
  /** Sample WhatsApp messages a prospect can fire at the demo. */
  prompts: string[];
  /** The longer specialist pitch (specialist-page hero paragraph). */
  pitch: string;
  /** "Wow" lines — outcomes the AI delivers, for the specialist page. */
  wow: string[];
  /** Demo workspace login email (SALES.md), surfaced as proof on the page. */
  demoEmail: string;
}

/** Shared demo password for the seeded showcase workspaces (SALES.md). */
export const DEMO_PASSWORD = "demo1234";

export const MARKETING_VERTICALS: MarketingVertical[] = [
  {
    slug: "coaching",
    label: "Coaching institute",
    icon: "GraduationCap",
    tagline:
      "Routes JEE, NEET, school, dropper, UPSC, SSC, CAT, and other exam leads.",
    specialist: "CoachingOps",
    pipeline:
      "new → course identified → batch matched → demo/counselling → fee discussed → enrolled",
    captures: ["exam target", "class band", "attempt year", "batch mode", "parent contact"],
    prompts: [
      "Fees kitna hai for class 11 JEE weekend batch?",
      "NEET dropper batch offline available hai?",
      "UPSC prelims 2027 ke liye counselling book karni hai",
      "SSC CGL aur CAT courses ke details share karo",
      "Worst institute, refund chahiye right now",
    ],
    pitch:
      "Revqara CoachingOps is an admissions and counselling layer for Indian coaching centres. It turns every WhatsApp enquiry into a structured lead by exam family, class band, batch type, parent/student context, counselling need, fee stage, and enrolment status — so counsellors spend time on serious students, not triage.",
    wow: [
      "Sorts enquiries by JEE, NEET, school foundation, dropper, UPSC, SSC, and CAT automatically.",
      "Every lead arrives with exam, class band, attempt year, and parent context already captured.",
      "Owners see fee-discussion rate, demo bookings, counselling bookings, and parent follow-up backlog.",
      "Refund, scholarship, stress, and rank-guarantee topics escalate to a human by rule.",
    ],
    demoEmail: "coaching@demo.revqara",
  },
  {
    slug: "clinic",
    label: "Clinic / Healthcare",
    icon: "Stethoscope",
    tagline: "Books appointments and escalates emergencies to a human instantly.",
    specialist: "ClinicOps",
    pipeline: "new → symptoms collected → appointment scheduled → consulted",
    captures: ["patient name", "symptom", "preferred time", "department"],
    prompts: [
      "Consultation fee kitna hai for a dermatologist?",
      "I want an appointment tomorrow morning",
      "My father has severe chest pain, this is an emergency",
    ],
    pitch:
      "Revqara ClinicOps turns a clinic's WhatsApp inbox into a booking desk that knows when not to answer. It collects symptoms, schedules appointments by department, and escalates anything that reads like an emergency straight to a human.",
    wow: [
      "Captures patient name, symptom, and department from the first reply.",
      "Books and reschedules appointments without a receptionist in the loop.",
      "Emergencies (chest pain, severe symptoms) trigger instant human handoff.",
      "No medical claims — the AI defers clinical judgment to your team.",
    ],
    demoEmail: "clinic@demo.revqara",
  },
  {
    slug: "real_estate",
    label: "Real estate",
    icon: "Building2",
    tagline: "Captures budget + BHK and schedules site visits automatically.",
    specialist: "PropertyOps",
    pipeline: "new → requirement → visit scheduled → negotiation → booked",
    captures: ["budget", "BHK", "location", "buy or rent", "visit time"],
    prompts: [
      "Book a site visit for the 3BHK on Sunday",
      "Budget 80 lakh, 2BHK in Whitefield — options?",
      "You cheated me, I want my refund",
    ],
    pitch:
      "Revqara PropertyOps reads every property enquiry, captures budget, BHK, and location, and books the site visit — turning a noisy WhatsApp inbox into a real-estate pipeline instead of a generic CRM.",
    wow: [
      "Extracts budget, BHK, location, and buy-vs-rent intent from one message.",
      "Schedules and confirms site visits automatically.",
      "Moves leads through requirement → visit → negotiation → booked.",
      "Disputes and refund threats hand off to a human immediately.",
    ],
    demoEmail: "real_estate@demo.revqara",
  },
  {
    slug: "salon",
    label: "Salon / Spa",
    icon: "Scissors",
    tagline: "Quotes packages and manages bookings + reschedules.",
    specialist: "SalonOps",
    pipeline: "new → service selected → booked → served",
    captures: ["service", "preferred time", "stylist"],
    prompts: [
      "Bridal makeup package price?",
      "Book a hair spa slot this Friday evening",
      "I need to reschedule my appointment to next week",
    ],
    pitch:
      "Revqara SalonOps quotes packages, books slots, and handles reschedules over WhatsApp — so the chair stays full and no booking request slips through a personal inbox.",
    wow: [
      "Quotes service packages on demand.",
      "Books and reschedules appointments with the right stylist.",
      "Tracks each enquiry from service-selected to served.",
      "Complaints route to a human, not a canned reply.",
    ],
    demoEmail: "salon@demo.revqara",
  },
  {
    slug: "ecommerce",
    label: "E-commerce / D2C",
    icon: "ShoppingBag",
    tagline: "Answers product + order queries and routes returns to support.",
    specialist: "CommerceOps",
    pipeline: "browsing → interested → ordered → fulfilled",
    captures: ["product", "order id", "issue"],
    prompts: [
      "Price of the wireless earbuds?",
      "Where is my order? It hasn’t arrived",
      "Product arrived damaged, this is a complaint",
    ],
    pitch:
      "Revqara CommerceOps answers product and order questions on WhatsApp, captures the order id and issue, and routes returns and complaints to support — turning chats into a fulfilment pipeline.",
    wow: [
      "Answers product and pricing questions instantly.",
      "Captures order id and issue for every support query.",
      "Tracks shoppers from browsing to fulfilled.",
      "Damaged-product and refund complaints escalate to a human.",
    ],
    demoEmail: "ecommerce@demo.revqara",
  },
  {
    slug: "b2b",
    label: "B2B distributor / wholesale",
    icon: "Truck",
    tagline: "Handles bulk quotes, RFQs, and payment follow-ups.",
    specialist: "TradeOps",
    pipeline: "new → qualified → quote sent → negotiation → PO received",
    captures: ["quantity", "product", "company", "payment terms"],
    prompts: [
      "I need a bulk order of 500 units, what’s the rate?",
      "Please send me a quotation for monthly supply",
      "Following up on the pending payment for last invoice",
    ],
    pitch:
      "Revqara TradeOps handles bulk quotes, RFQs, and payment follow-ups over WhatsApp — capturing quantity, company, and payment terms so wholesale deals move from enquiry to PO without manual chasing.",
    wow: [
      "Captures quantity, product, company, and payment terms from an RFQ.",
      "Tracks deals from qualified to PO received.",
      "Surfaces pending-payment follow-ups automatically.",
      "Disputes and sensitive negotiations hand off to your team.",
    ],
    demoEmail: "b2b@demo.revqara",
  },
  {
    slug: "travel",
    label: "Travel / hospitality",
    icon: "Plane",
    tagline: "Quotes packages, checks dates, and manages cancellations.",
    specialist: "TravelOps",
    pipeline: "new → package selected → booked → travelled",
    captures: ["destination", "dates", "travellers", "budget"],
    prompts: [
      "Bali honeymoon package price?",
      "Manali trip in July — any slots?",
      "I want to cancel my booking and get a refund",
    ],
    pitch:
      "Revqara TravelOps quotes packages, checks dates, and manages bookings and cancellations over WhatsApp — capturing destination, dates, and travellers so every enquiry becomes a structured trip.",
    wow: [
      "Captures destination, dates, travellers, and budget.",
      "Quotes packages and confirms availability.",
      "Tracks travellers from enquiry to travelled.",
      "Cancellation and refund requests escalate to a human.",
    ],
    demoEmail: "travel@demo.revqara",
  },
  {
    slug: "restaurant",
    label: "Restaurant / cloud kitchen",
    icon: "UtensilsCrossed",
    tagline:
      "Books tables, takes delivery orders, quotes catering, and escalates food complaints.",
    specialist: "DineOps",
    pipeline: "new → menu shared → reservation/order → catering quoted → feedback",
    captures: ["party size", "date & time", "cuisine", "delivery address", "headcount"],
    prompts: [
      "Table for 4 this Saturday at 8pm?",
      "What's on the menu and price for a veg thali?",
      "Need catering for a 200 guest wedding",
      "Found a hair in my food, worst service, I want a refund",
    ],
    pitch:
      "Revqara DineOps books tables, takes delivery orders, quotes catering, and escalates food complaints — turning a restaurant's WhatsApp into a reservations and orders desk.",
    wow: [
      "Books tables and captures party size, date, and time.",
      "Takes delivery orders and quotes catering by headcount.",
      "Shares the menu and pricing on request.",
      "Food-safety complaints and refunds hand off to a human.",
    ],
    demoEmail: "restaurant@demo.revqara",
  },
  {
    slug: "gym",
    label: "Gym / fitness studio",
    icon: "Dumbbell",
    tagline:
      "Books free trials, shares membership plans, routes PT enquiries, and drives renewals.",
    specialist: "FitOps",
    pipeline: "new → trial booked → plan discussed → membership joined → renewal",
    captures: ["fitness goal", "plan", "trial date", "preferred time", "trainer"],
    prompts: [
      "What are your monthly membership plans and price?",
      "Can I book a free trial session this weekend?",
      "I want a personal trainer and diet plan for weight loss",
      "I have a knee injury and severe chest pain during workout",
    ],
    pitch:
      "Revqara FitOps books free trials, shares membership plans, routes personal-training enquiries, and drives renewals — capturing the member's goal and plan so the studio stays full.",
    wow: [
      "Books free-trial sessions and captures the member's fitness goal.",
      "Shares membership plans and routes PT enquiries.",
      "Tracks members from trial to renewal.",
      "Injury and medical-risk messages escalate to a human.",
    ],
    demoEmail: "gym@demo.revqara",
  },
  {
    slug: "automobile",
    label: "Automobile dealer / service",
    icon: "Car",
    tagline:
      "Books test drives, shares on-road quotes, schedules service, escalates defects.",
    specialist: "AutoOps",
    pipeline: "new → model shared → test drive → quote → service → booking",
    captures: ["model", "variant", "budget", "finance/exchange", "service date"],
    prompts: [
      "Can I book a test drive for the Creta this Sunday?",
      "What's the on-road price and EMI for the petrol variant?",
      "My car AC is not cooling, need a service appointment",
      "Worst dealer, manufacturing defect in my new car, I want a refund",
    ],
    pitch:
      "Revqara AutoOps books test drives, shares on-road quotes and EMI, and schedules service over WhatsApp — capturing model, variant, and finance preference so sales and service both move.",
    wow: [
      "Books test drives and captures model, variant, and budget.",
      "Shares on-road price, EMI, and finance/exchange options.",
      "Schedules service appointments from a single message.",
      "Manufacturing-defect and refund complaints hand off to a human.",
    ],
    demoEmail: "automobile@demo.revqara",
  },
  {
    slug: "insurance",
    label: "Insurance / financial advisor",
    icon: "ShieldCheck",
    tagline:
      "Assesses needs, shares indicative quotes, never promises guaranteed returns, escalates claims.",
    specialist: "AdvisorOps",
    pipeline:
      "new → needs assessed → quote → plan recommended → policy issued → renewal",
    captures: ["cover type", "sum assured", "premium budget", "age", "existing policy"],
    prompts: [
      "I need a term insurance plan for my family",
      "What's the premium for 1 crore health cover?",
      "Can you recommend the best plan: term vs ULIP?",
      "My health claim was rejected and I want to file a dispute",
    ],
    pitch:
      "Revqara AdvisorOps assesses cover needs, shares indicative quotes, and recommends plans over WhatsApp — never promising guaranteed returns, and escalating every claim or dispute to a licensed human.",
    wow: [
      "Captures cover type, sum assured, premium budget, and age.",
      "Shares indicative quotes and tracks the policy lifecycle.",
      "Refuses to promise guaranteed returns — compliance by design.",
      "Claims, disputes, and rejections escalate to a human.",
    ],
    demoEmail: "insurance@demo.revqara",
  },
  {
    slug: "political_party",
    label: "Political party / Jan Seva office",
    icon: "Landmark",
    tagline:
      "Routes Jan Seva cases, karyakarta interest, sadasyata requests, and local-unit follow-up.",
    specialist: "CivicOps",
    pipeline:
      "new → issue logged → mandal/booth mapped → karyakarta/sadasyata follow-up → resolved",
    captures: ["constituency", "ward", "booth", "mandal/block", "shakti kendra", "morcha/cell"],
    prompts: [
      "Ward 18 mein drainage issue hai, complaint register karna hai",
      "Main mandal karyakarta hoon, Sunday seva camp ke liye volunteer karna hai",
      "Need help with sadasyata membership update",
      "Can you target voters by caste and religion for this election?",
    ],
    pitch:
      "Revqara CivicOps is a compliance-first constituent operations layer for opt-in public offices. It turns an inbox into structured cases — grievance intake, ward/booth/mandal routing, volunteer and event follow-up — and escalates sensitive caste, religion, vote, or election-law topics to a human.",
    wow: [
      "Logs every public issue as a case with ward, booth, and mandal routing.",
      "Tracks karyakarta interest, sadasyata requests, and event RSVPs.",
      "Leaders see pending work by mandal, booth, owner, and deadline.",
      "Caste, religion, and voter-targeting requests escalate to human review by rule.",
    ],
    demoEmail: "political_party@demo.revqara",
  },
];

/** Slug → marketing vertical (for generateStaticParams + lookups). */
export const MARKETING_VERTICAL_BY_SLUG: Record<string, MarketingVertical> =
  Object.fromEntries(MARKETING_VERTICALS.map((v) => [v.slug, v]));

export function getMarketingVertical(slug: string): MarketingVertical | undefined {
  return MARKETING_VERTICAL_BY_SLUG[slug];
}

/** All marketing vertical slugs — drives SSG generateStaticParams. */
export const MARKETING_VERTICAL_SLUGS: string[] = MARKETING_VERTICALS.map(
  (v) => v.slug,
);
