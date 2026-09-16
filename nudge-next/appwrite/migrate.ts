/**
 * Idempotent Appwrite provisioner.
 *
 * Creates the `crm` database, all 24 domain collections + billing_webhook_events,
 * their attributes, and indexes from `appwrite/schema/*`. Designed to be
 * re-run safely: every create is wrapped in a 409-tolerant `ok()` helper, and
 * indexes are only created after their referenced attributes report
 * `status === 'available'` (polled via getCollection).
 *
 * Run:  pnpm appwrite:setup   (alias for `tsx appwrite/migrate.ts`)
 *
 * Requires env: NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID,
 *               APPWRITE_API_KEY, APPWRITE_DATABASE_ID (default "crm").
 *
 * `documentSecurity: true` on every collection — workers use the API key
 * (bypass permissions by design); per-doc Team permissions are attached at
 * write time for defense-in-depth.
 */

import { Client, Databases } from "node-appwrite";

import { ALL_COLLECTIONS } from "./schema/index";
import type {
  Attribute,
  CollectionDefinition,
  IndexDef,
} from "./schema/_types";

// ── Config ────────────────────────────────────────────────────────────────
const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || "crm";
const DATABASE_NAME = "crm";

function requireEnv(): void {
  const missing: string[] = [];
  if (!ENDPOINT) missing.push("NEXT_PUBLIC_APPWRITE_ENDPOINT");
  if (!PROJECT_ID) missing.push("NEXT_PUBLIC_APPWRITE_PROJECT_ID");
  if (!API_KEY) missing.push("APPWRITE_API_KEY");
  if (missing.length) {
    throw new Error(
      `Missing required env for provisioning: ${missing.join(", ")}`,
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Run an idempotent create; swallow 409 (already exists). */
async function ok<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    const res = await fn();
    console.log(`  + created   ${label}`);
    return res;
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 409) {
      console.log(`  = exists    ${label}`);
      return null;
    }
    const type = (err as { type?: string })?.type;
    const message = (err as { message?: string })?.message ?? String(err);
    console.error(`  ! FAILED    ${label} — [${code ?? "?"}/${type ?? "?"}] ${message}`);
    throw err;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll getCollection until all given attribute keys report `available`.
 * Appwrite builds attributes asynchronously; index creation referencing a
 * still-`processing` attribute will fail.
 */
async function waitForAttributes(
  databases: Databases,
  collectionId: string,
  keys: string[],
  { timeoutMs = 120_000, intervalMs = 1_000 } = {},
): Promise<void> {
  if (keys.length === 0) return;
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const coll = await databases.getCollection(DATABASE_ID, collectionId);
    const byKey = new Map(
      (coll.attributes as unknown as Array<{ key: string; status: string }>).map((a) => [
        a.key,
        a.status,
      ]),
    );
    const pending = keys.filter((k) => byKey.get(k) !== "available");
    if (pending.length === 0) return;
    const failed = keys.filter((k) => byKey.get(k) === "failed");
    if (failed.length) {
      throw new Error(
        `Attributes failed to build on ${collectionId}: ${failed.join(", ")}`,
      );
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out waiting for attributes on ${collectionId}: ${pending.join(", ")}`,
      );
    }
    await sleep(intervalMs);
  }
}

// ── Attribute + index creation ───────────────────────────────────────────

async function createAttribute(
  databases: Databases,
  collectionId: string,
  a: Attribute,
): Promise<void> {
  const required = a.required ?? false;
  const array = a.array ?? false;
  const label = `attr ${collectionId}.${a.key}`;

  // Appwrite: a `required` attribute cannot also carry a default.
  const defaultable = !required;

  switch (a.type) {
    case "string":
      await ok(label, () =>
        databases.createStringAttribute(
          DATABASE_ID,
          collectionId,
          a.key,
          a.size,
          required,
          defaultable ? (a.default ?? undefined) : undefined,
          array,
        ),
      );
      break;
    case "email":
      await ok(label, () =>
        databases.createEmailAttribute(
          DATABASE_ID,
          collectionId,
          a.key,
          required,
          defaultable ? (a.default ?? undefined) : undefined,
          array,
        ),
      );
      break;
    case "integer":
      await ok(label, () =>
        databases.createIntegerAttribute(
          DATABASE_ID,
          collectionId,
          a.key,
          required,
          a.min,
          a.max,
          defaultable ? (a.default ?? undefined) : undefined,
          array,
        ),
      );
      break;
    case "float":
      await ok(label, () =>
        databases.createFloatAttribute(
          DATABASE_ID,
          collectionId,
          a.key,
          required,
          a.min,
          a.max,
          defaultable ? (a.default ?? undefined) : undefined,
          array,
        ),
      );
      break;
    case "boolean":
      await ok(label, () =>
        databases.createBooleanAttribute(
          DATABASE_ID,
          collectionId,
          a.key,
          required,
          defaultable ? (a.default ?? undefined) : undefined,
          array,
        ),
      );
      break;
    case "datetime":
      await ok(label, () =>
        databases.createDatetimeAttribute(
          DATABASE_ID,
          collectionId,
          a.key,
          required,
          defaultable ? (a.default ?? undefined) : undefined,
          array,
        ),
      );
      break;
    case "enum":
      await ok(label, () =>
        databases.createEnumAttribute(
          DATABASE_ID,
          collectionId,
          a.key,
          a.elements,
          required,
          defaultable ? (a.default ?? undefined) : undefined,
          array,
        ),
      );
      break;
    default: {
      const _exhaustive: never = a;
      throw new Error(`Unknown attribute type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/** `$createdAt`/`$updatedAt` are built-in — index them without creating attrs. */
const SYSTEM_ATTRS = new Set(["$id", "$createdAt", "$updatedAt"]);

async function createIndex(
  databases: Databases,
  collectionId: string,
  idx: IndexDef,
): Promise<void> {
  const orders = idx.orders ?? idx.attributes.map(() => "ASC" as const);
  await ok(`index ${collectionId}.${idx.key}`, () =>
    databases.createIndex(
      DATABASE_ID,
      collectionId,
      idx.key,
      idx.type as unknown as Parameters<Databases["createIndex"]>[3],
      idx.attributes,
      orders,
    ),
  );
}

// ── Per-collection provisioning ──────────────────────────────────────────

async function provisionCollection(
  databases: Databases,
  def: CollectionDefinition,
): Promise<void> {
  console.log(`\n▸ ${def.id}${def.naturalKey ? `  (natural-key: ${def.naturalKey})` : ""}`);

  await ok(`collection ${def.id}`, () =>
    databases.createCollection(
      DATABASE_ID,
      def.id,
      def.name,
      undefined, // permissions: API key handles access; per-doc Team perms set at write time
      def.documentSecurity,
      true, // enabled
    ),
  );

  for (const a of def.attributes) {
    await createAttribute(databases, def.id, a);
  }

  // Wait for every non-system attribute referenced by an index to be available.
  const indexedKeys = Array.from(
    new Set(
      def.indexes
        .flatMap((i) => i.attributes)
        .filter((k) => !SYSTEM_ATTRS.has(k)),
    ),
  );
  if (indexedKeys.length) {
    console.log(`  … waiting for ${indexedKeys.length} attribute(s) to build`);
    await waitForAttributes(databases, def.id, indexedKeys);
  }

  for (const idx of def.indexes) {
    await createIndex(databases, def.id, idx);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  requireEnv();

  const client = new Client()
    .setEndpoint(ENDPOINT as string)
    .setProject(PROJECT_ID as string)
    .setKey(API_KEY as string);

  const databases = new Databases(client);

  console.log(
    `Provisioning Appwrite database "${DATABASE_ID}" on ${ENDPOINT} ` +
      `(${ALL_COLLECTIONS.length} collections)\n`,
  );

  await ok(`database ${DATABASE_ID}`, () =>
    databases.create(DATABASE_ID, DATABASE_NAME, true),
  );

  for (const def of ALL_COLLECTIONS) {
    await provisionCollection(databases, def);
  }

  console.log(`\n✓ Provisioning complete — ${ALL_COLLECTIONS.length} collections ready.`);
}

main().catch((err) => {
  console.error("\n✗ Provisioning failed:", err);
  process.exit(1);
});
