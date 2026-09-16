/**
 * Shared application types. Re-exports the per-collection Appwrite model types
 * (Phase 1) and the Clerk role / permission types (Phase 1 / Phase 2).
 */

import type { VerticalSlug, PipelineStage } from "@/lib/config";

export type { VerticalSlug, PipelineStage };

// RBAC roles & permissions (1:1 with backend/auth/rbac.py).
export * from "./roles";

// Appwrite document model types (one per collection).
export * from "./appwrite";
