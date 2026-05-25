/**
 * Normalize an email for storage and lookup.
 *
 * Trims surrounding whitespace and lowercases the address so equality
 * checks treat "  Foo@Example.com  " and "foo@example.com" as the same
 * identity. Used by the auth providers to keep cross-table guards
 * (User vs. Client) consistent with how rows are created/queried.
 *
 * Note: this is intentionally a syntactic normalization only — it does
 * not perform RFC 5321/5322 validation or local-part case folding for
 * providers that treat the local part as case-sensitive. That is fine
 * for our use case because Prisma's @unique index on email is itself
 * case-sensitive, and we already lower-case on write.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
