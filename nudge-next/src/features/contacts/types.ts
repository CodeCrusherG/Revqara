/**
 * Contact domain types (serializable, safe to import from client components).
 * Mirrors the `contacts` Appwrite collection (see appwrite/schema/contacts.ts)
 * plus the UX shape of frontend/src/pages/ContactsPage.jsx.
 */

export type OptInStatus = "opted_in" | "opted_out" | "unknown";

export interface Contact {
  id: string;
  fullName: string | null;
  whatsappNumber: string;
  email: string | null;
  city: string | null;
  gender: string | null;
  age: number | null;
  occupationType: string | null;
  monthlyIncome: number | null;
  existingCustomer: string | null;
  tags: string[];
  optInStatus: OptInStatus;
  optInSource: string | null;
  optInAt: string | null;
  createdAt: string;
}

export interface ContactListResult {
  contacts: Contact[];
  /** Total matched (for the active query) — used for usage/plan display. */
  total: number;
}

export interface CreateContactInput {
  fullName?: string | null;
  whatsappNumber: string;
  email?: string | null;
  city?: string | null;
  gender?: string | null;
  age?: number | null;
  occupationType?: string | null;
  monthlyIncome?: number | null;
  existingCustomer?: string | null;
  tags?: string[];
}

export interface UpdateContactInput {
  fullName?: string | null;
  email?: string | null;
  city?: string | null;
  monthlyIncome?: number | null;
  existingCustomer?: string | null;
  tags?: string[];
}

export interface CsvImportResult {
  created: number;
  updated: number;
  skipped: number;
}
