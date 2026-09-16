import "server-only";

/**
 * Server-only Appwrite admin client (API key).
 *
 * This client authenticates with `APPWRITE_API_KEY` and therefore BYPASSES
 * document permissions by design — tenancy is enforced by query-injected
 * `workspaceId` (see lib/appwrite/tenant.ts), not by Appwrite ACLs. Never
 * import this from a client component or expose it to the browser.
 */

import {
  Client,
  Databases,
  Users,
  Teams,
  Storage,
  Query,
  ID,
  Permission,
  Role,
} from "node-appwrite";

import { serverEnv, publicEnv } from "@/lib/env";

let _client: Client | null = null;

function getAdminClient(): Client {
  if (_client) return _client;

  const endpoint = publicEnv.NEXT_PUBLIC_APPWRITE_ENDPOINT;
  const project = publicEnv.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
  const apiKey = serverEnv.APPWRITE_API_KEY;

  if (!endpoint || !project || !apiKey) {
    throw new Error(
      "Appwrite admin client is not configured: set NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID, and APPWRITE_API_KEY.",
    );
  }

  _client = new Client()
    .setEndpoint(endpoint)
    .setProject(project)
    .setKey(apiKey);
  return _client;
}

/** Shared admin SDK service instances (lazy, memoised). */
export const adminClient = (): Client => getAdminClient();
export const adminDatabases = (): Databases => new Databases(getAdminClient());
export const adminUsers = (): Users => new Users(getAdminClient());
export const adminTeams = (): Teams => new Teams(getAdminClient());
export const adminStorage = (): Storage => new Storage(getAdminClient());

// Re-export the SDK value helpers used across features for convenience.
export { Query, ID, Permission, Role };
