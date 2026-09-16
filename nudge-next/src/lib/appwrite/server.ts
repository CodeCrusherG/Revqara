import "server-only";

/**
 * `createServerClient()` — per-request Appwrite clients.
 *
 * Returns:
 *   - `admin`   : API-key client (bypasses permissions; the default for RSC
 *                 reads and Server Actions, where tenancy is query-injected).
 *   - `session` : a JWT-scoped client (acts AS a user, honours doc permissions)
 *                 built from a short-lived Appwrite JWT. Used only where we want
 *                 permission-enforced access (e.g. surfacing realtime / direct
 *                 client handoffs). Pass a JWT via `forSession(jwt)`.
 *
 * Server-only. UI reaches Appwrite exclusively through `features/*`.
 */

import { Client, Databases, Storage } from "node-appwrite";

import { publicEnv } from "@/lib/env";
import {
  adminClient,
  adminDatabases,
  adminStorage,
} from "@/lib/appwrite/admin";

function baseClient(): Client {
  const endpoint = publicEnv.NEXT_PUBLIC_APPWRITE_ENDPOINT;
  const project = publicEnv.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
  if (!endpoint || !project) {
    throw new Error(
      "Appwrite is not configured: set NEXT_PUBLIC_APPWRITE_ENDPOINT and NEXT_PUBLIC_APPWRITE_PROJECT_ID.",
    );
  }
  return new Client().setEndpoint(endpoint).setProject(project);
}

export interface ServerClients {
  /** API-key admin client (bypasses permissions). */
  client: Client;
  databases: Databases;
  storage: Storage;
  /** Build a session-scoped (permission-honouring) client from an Appwrite JWT. */
  forSession: (jwt: string) => SessionClients;
}

export interface SessionClients {
  client: Client;
  databases: Databases;
  storage: Storage;
}

export function createServerClient(): ServerClients {
  const forSession = (jwt: string): SessionClients => {
    const client = baseClient().setJWT(jwt);
    return {
      client,
      databases: new Databases(client),
      storage: new Storage(client),
    };
  };

  return {
    client: adminClient(),
    databases: adminDatabases(),
    storage: adminStorage(),
    forSession,
  };
}
