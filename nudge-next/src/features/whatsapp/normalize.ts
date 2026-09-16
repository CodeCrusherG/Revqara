/**
 * Phone-number normalization — a 1:1 port of `_normalize_phone` from
 * `backend/services/inbound.py`:
 *
 *     digits = re.sub(r"\D", "", s);  return digits or s
 *
 * Keep digits only (drop +, spaces, dashes) so the same number always matches
 * the same contact. Falls back to the original string when stripping leaves it
 * empty (e.g. a non-numeric handle), and passes null/empty through unchanged.
 */
export function normalizePhone(
  s: string | null | undefined,
): string | null | undefined {
  if (!s) return s;
  const digits = s.replace(/\D/g, "");
  return digits || s;
}
