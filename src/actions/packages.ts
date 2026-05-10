'use server';

/**
 * Server Actions for the admin "Packages" feature.
 *
 * Companion to `src/actions/clients.ts`. Both modules let the admin UI
 * mutate via React Server Actions instead of REST routes — see the
 * file-level comment in `clients.ts` for the broader rationale.
 *
 * Packages are a simpler resource than clients: no auth-related fields,
 * no cascade cleanup, no `BigInt` columns. Mostly pure CRUD plus a
 * convenient bulk-toggle for the "Aktifkan / Nonaktifkan" admin button.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { prisma } from '@/lib/db';
import { packageSchema, packageUpdateSchema } from '@/lib/api/validation';
import { logger } from '@/lib/logger';

// Shape returned to the admin UI. Aligns with `Package` model except
// that `Date`s are flattened to ISO strings so the value remains
// JSON-serialisable across the React Server Action boundary.
export type AdminPackage = {
  id: string;
  nama: string;
  description: string | null;
  price: number;
  duration: number | null;
  fitur: string[];
  maxSelection: number;
  maxDownload: number;
  isActive: boolean;
  createdAt: string;
};

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

async function requireAdmin(): Promise<ActionResult<true>> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { success: false, error: 'Unauthorized' };
  }
  return { success: true, data: true };
}

const idSchema = z.string().min(1, 'Package id required');

const bulkIdsSchema = z
  .array(z.string().min(1))
  .min(1, 'At least one ID required')
  .max(100, 'Maximum 100 IDs per request');

// Match the `Prisma.PackageUpdateManyInput` shape via runtime inference.
// We can't import the namespace type directly because the project
// generates the Prisma client without engine namespaces (`--no-engine`).
type PackageUpdateData = Parameters<typeof prisma.package.update>[0]['data'];
type PackageCreateData = Parameters<typeof prisma.package.create>[0]['data'];

function toAdminPackage(row: {
  id: string;
  nama: string;
  description: string | null;
  price: number;
  duration: number | null;
  fitur: string[];
  maxSelection: number;
  maxDownload: number;
  isActive: boolean;
  createdAt: Date;
}): AdminPackage {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Create a new package. Re-uses `packageSchema` from `validation.ts`
 * so behaviour is identical to the REST POST endpoint.
 */
export async function createPackage(
  input: unknown,
): Promise<ActionResult<{ package: AdminPackage }>> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  const parsed = packageSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return {
      success: false,
      error: first.path.length > 0
        ? `${first.path.join('.')}: ${first.message}`
        : first.message,
    };
  }

  try {
    const created = await prisma.package.create({
      data: parsed.data as PackageCreateData,
    });
    revalidatePath('/admin/packages');
    return { success: true, data: { package: toAdminPackage(created) } };
  } catch (e) {
    logger.error('action.packages.create.failed', { err: e });
    return { success: false, error: 'Failed to create package' };
  }
}

/**
 * Update an existing package. `packageUpdateSchema` is a `partial()` of
 * `packageSchema` — every field is optional so the admin UI can use
 * the same schema for "edit dialog" submits and one-off "toggle
 * isActive" PATCHes.
 */
export async function updatePackage(input: {
  id: string;
} & Record<string, unknown>): Promise<ActionResult<{ package: AdminPackage }>> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  const idParsed = idSchema.safeParse(input.id);
  if (!idParsed.success) {
    return { success: false, error: 'Package id required' };
  }

  const { id: _id, ...rest } = input;
  void _id;
  const parsed = packageUpdateSchema.safeParse(rest);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return {
      success: false,
      error: first.path.length > 0
        ? `${first.path.join('.')}: ${first.message}`
        : first.message,
    };
  }

  try {
    const updated = await prisma.package.update({
      where: { id: idParsed.data },
      data: parsed.data as PackageUpdateData,
    });
    revalidatePath('/admin/packages');
    return { success: true, data: { package: toAdminPackage(updated) } };
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'P2025') {
      return { success: false, error: 'Package not found' };
    }
    logger.error('action.packages.update.failed', { id: input.id, err: e });
    return { success: false, error: 'Failed to update package' };
  }
}

/**
 * Delete a single package. No cascade implications (Event keeps
 * `packageId` nullable in the schema) so this is a pure
 * `prisma.package.delete`.
 */
export async function deletePackage(
  rawId: string,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  const idParsed = idSchema.safeParse(rawId);
  if (!idParsed.success) {
    return { success: false, error: 'Package id required' };
  }
  const id = idParsed.data;

  try {
    await prisma.package.delete({ where: { id } });
    revalidatePath('/admin/packages');
    return { success: true, data: { id } };
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'P2025') {
      return { success: false, error: 'Package not found' };
    }
    logger.error('action.packages.delete.failed', { id, err: e });
    return { success: false, error: 'Failed to delete package' };
  }
}

/**
 * Bulk-delete packages.
 */
export async function deletePackagesBulk(
  rawIds: string[],
): Promise<ActionResult<{ deleted: number }>> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  const parsed = bulkIdsSchema.safeParse(rawIds);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }
  const ids = parsed.data;

  try {
    const result = await prisma.package.deleteMany({ where: { id: { in: ids } } });
    revalidatePath('/admin/packages');
    return { success: true, data: { deleted: result.count } };
  } catch (e) {
    logger.error('action.packages.delete_bulk.failed', { count: ids.length, err: e });
    return { success: false, error: 'Failed to delete packages' };
  }
}

/**
 * Bulk-toggle the `isActive` flag. Mirrors the legacy REST behaviour:
 * if all selected packages are currently active, flip them to inactive;
 * otherwise flip them all to active. We resolve the new state on the
 * server so two admins clicking simultaneously can't disagree about
 * what "toggle" should mean.
 */
export async function toggleActivePackagesBulk(
  rawIds: string[],
): Promise<ActionResult<{ updated: number; isActive: boolean }>> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  const parsed = bulkIdsSchema.safeParse(rawIds);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }
  const ids = parsed.data;

  try {
    const current = await prisma.package.findMany({
      where: { id: { in: ids } },
      select: { isActive: true },
    });
    const allActive = current.every((p) => p.isActive);
    const newIsActive = !allActive;

    const result = await prisma.package.updateMany({
      where: { id: { in: ids } },
      data: { isActive: newIsActive },
    });
    revalidatePath('/admin/packages');
    return {
      success: true,
      data: { updated: result.count, isActive: newIsActive },
    };
  } catch (e) {
    logger.error('action.packages.toggle_bulk.failed', { count: ids.length, err: e });
    return { success: false, error: 'Failed to toggle packages' };
  }
}
