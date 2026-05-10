/**
 * Shared Prisma `select` shapes that intentionally exclude sensitive columns
 * before they leave the server.
 *
 * Why this exists:
 *   `Client.password` (bcrypt hash) is required for portal login but must
 *   never appear in API responses. Several admin endpoints used to do
 *   `include: { client: true }` which fetches every column on the row,
 *   including the bcrypt hash. The hash is hard to crack, but exposing it
 *   widens the blast radius of any future XSS in the admin UI and leaks
 *   structural information about our hashing parameters (cost, salt
 *   format). Reviewers from CodeAnt/Gemini correctly flagged this as a
 *   minimum-exposure violation.
 *
 *   This module centralises the safe shape so we have one place to update
 *   when columns are added/removed and so reviewers can grep for stray
 *   `client: true` usages.
 */
import type { Prisma } from '@/generated/prisma';

/**
 * Public-facing client columns. Use this anywhere the response will be
 * serialised back to a browser (admin dashboard, portal, public APIs).
 *
 * Explicitly listing every column avoids the `include: true` foot-gun: a
 * future schema migration that adds a sensitive field will not silently
 * leak through this select.
 */
export const safeClientSelect = {
  id: true,
  nama: true,
  email: true,
  phone: true,
  instagram: true,
  storageQuotaGB: true,
  usedStorage: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClientSelect;

/**
 * Pre-built `include` for callers that previously wrote
 * `include: { client: true }`. Drop-in replacement.
 */
export const safeClientInclude = {
  client: { select: safeClientSelect },
} satisfies Prisma.EventInclude;
