/**
 * Declarative collection-definition types consumed by appwrite/migrate.ts.
 *
 * One file per collection exports a `CollectionDefinition`. The provisioner
 * walks these and creates the database / collection / attributes / indexes
 * idempotently. Keep these pure data (no node-appwrite imports) so the schema
 * is portable (migrate, docs, tests).
 */

export type AttributeType =
  | "string"
  | "integer"
  | "float"
  | "boolean"
  | "datetime"
  | "enum"
  | "email";

interface AttributeBase {
  key: string;
  /** Appwrite requires `required=false` when a default is supplied. */
  required?: boolean;
  /** Array attribute (String[] / Integer[] …). Filterable by membership. */
  array?: boolean;
  /** Human note (not sent to Appwrite). */
  note?: string;
}

export interface StringAttribute extends AttributeBase {
  type: "string" | "email";
  /** Max length. Use generous sizes for `…Json` attrs (8k…1M). */
  size: number;
  default?: string | null;
}

export interface IntegerAttribute extends AttributeBase {
  type: "integer";
  min?: number;
  max?: number;
  default?: number | null;
}

export interface FloatAttribute extends AttributeBase {
  type: "float";
  min?: number;
  max?: number;
  default?: number | null;
}

export interface BooleanAttribute extends AttributeBase {
  type: "boolean";
  default?: boolean | null;
}

export interface DatetimeAttribute extends AttributeBase {
  type: "datetime";
  default?: string | null;
}

export interface EnumAttribute extends AttributeBase {
  type: "enum";
  elements: string[];
  default?: string | null;
}

export type Attribute =
  | StringAttribute
  | IntegerAttribute
  | FloatAttribute
  | BooleanAttribute
  | DatetimeAttribute
  | EnumAttribute;

export type IndexType = "key" | "unique" | "fulltext";

export interface IndexDef {
  key: string;
  type: IndexType;
  attributes: string[];
  /** Per-attribute order; defaults to ASC for all. */
  orders?: ("ASC" | "DESC")[];
}

export interface CollectionDefinition {
  /** Collection `$id`. */
  id: string;
  /** Human name (Appwrite collection name). */
  name: string;
  attributes: Attribute[];
  indexes: IndexDef[];
  /**
   * Whether `$id` is a natural key (caller supplies a deterministic id rather
   * than ID.unique()). Documented here; enforced at write sites, not in the
   * provisioner.
   */
  naturalKey?: string;
  /**
   * documentSecurity is true for every collection (§3). Collection-level
   * permissions are left to the API key (workers bypass perms by design);
   * per-doc Team permissions are attached at write time (defense-in-depth).
   */
  documentSecurity: boolean;
}

/** Convenience builders to keep schema files terse and consistent. */
export const attr = {
  string: (
    key: string,
    size: number,
    opts: Partial<Omit<StringAttribute, "key" | "type" | "size">> = {},
  ): StringAttribute => ({ key, type: "string", size, ...opts }),
  email: (
    key: string,
    opts: Partial<Omit<StringAttribute, "key" | "type" | "size">> = {},
  ): StringAttribute => ({ key, type: "email", size: 320, ...opts }),
  integer: (
    key: string,
    opts: Partial<Omit<IntegerAttribute, "key" | "type">> = {},
  ): IntegerAttribute => ({ key, type: "integer", ...opts }),
  float: (
    key: string,
    opts: Partial<Omit<FloatAttribute, "key" | "type">> = {},
  ): FloatAttribute => ({ key, type: "float", ...opts }),
  boolean: (
    key: string,
    opts: Partial<Omit<BooleanAttribute, "key" | "type">> = {},
  ): BooleanAttribute => ({ key, type: "boolean", ...opts }),
  datetime: (
    key: string,
    opts: Partial<Omit<DatetimeAttribute, "key" | "type">> = {},
  ): DatetimeAttribute => ({ key, type: "datetime", ...opts }),
  enum: (
    key: string,
    elements: string[],
    opts: Partial<Omit<EnumAttribute, "key" | "type" | "elements">> = {},
  ): EnumAttribute => ({ key, type: "enum", elements, ...opts }),
};

/** Common JSON string sizes. */
export const JSON_SIZE = {
  small: 8_192,
  medium: 65_536,
  large: 262_144,
  xlarge: 1_000_000,
} as const;
