/**
 * Migration / nudge script untuk backfill password client portal.
 *
 * Konteks:
 *   PR `fix/admin-ux-bugs` mengganti magic-link auth dengan email + password.
 *   `Client.password` kini wajib saat create, tapi row legacy (yang dibuat
 *   sebelum rollout) masih `NULL` — client tersebut tidak bisa login portal
 *   sampai admin men-set password.
 *
 * Mode:
 *   1. (default) DRY-RUN
 *      Daftar client dengan `password IS NULL`, untuk admin nudge manual.
 *      Tidak menyentuh database sama sekali.
 *
 *   2. --generate
 *      Generate temp password acak (12 char base64url) untuk SETIAP client
 *      yang `password IS NULL`, hash dengan bcrypt (cost=10) dan simpan ke
 *      DB. Plaintext ditulis ke STDOUT sebagai CSV agar admin bisa redirect
 *      ke file dan distribusikan ke masing-masing client. Plaintext TIDAK
 *      pernah disimpan di DB / log internal.
 *
 *      Idempotent: client yang sudah punya hash password di-skip.
 *
 *   3. --client <id>
 *      Reset password 1 client (oleh admin), berguna kalau client lupa
 *      password. Generate password baru dan output ke stdout.
 *
 * Contoh penggunaan:
 *   npx tsx scripts/migrate-client-passwords.ts --dry-run
 *   npx tsx scripts/migrate-client-passwords.ts --generate > /tmp/client-creds.csv
 *   npx tsx scripts/migrate-client-passwords.ts --client cmoz12f96002p > /tmp/reset.csv
 *
 * SECURITY:
 *   File CSV yang dihasilkan berisi plaintext password sekali pakai.
 *   - JANGAN commit ke git.
 *   - JANGAN simpan di shared drive tanpa enkripsi.
 *   - Hapus setelah didistribusikan ke masing-masing client.
 *   - Recommend: client diminta change password setelah login pertama
 *     (admin reset via UI).
 */

import { randomBytes } from 'crypto';
import { hash } from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

// Match BCRYPT_ROUNDS yang dipakai di src/app/api/admin/clients/route.ts
// dan src/lib/auth/options.ts dummy hash. Konsistensi penting agar
// bcrypt.compare() running time tetap kira-kira sama.
const BCRYPT_ROUNDS = 10;

// Panjang temp password (base64url chars). 12 char ≈ 72 bits entropy,
// cukup untuk one-time use sebelum client ganti.
const TEMP_PASSWORD_BYTES = 9; // randomBytes(9).toString('base64url') = 12 chars

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--generate') && !args.find((a) => a.startsWith('--client'));
const GENERATE = args.includes('--generate');
const CLIENT_FLAG_INDEX = args.findIndex((a) => a === '--client');
const SINGLE_CLIENT_ID =
  CLIENT_FLAG_INDEX >= 0 ? args[CLIENT_FLAG_INDEX + 1] : undefined;

function generateTempPassword(): string {
  // base64url: alfanumerik + `-` + `_`. URL/CSV-safe, tidak butuh quoting.
  return randomBytes(TEMP_PASSWORD_BYTES).toString('base64url');
}

function csvEscape(value: string): string {
  // RFC 4180-ish escaping. Quote semua field untuk konsistensi karena
  // password bisa berisi `_` atau `-` yang aman, tapi nama / email bisa
  // berisi koma.
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

async function listPending() {
  // STDERR: human-readable; STDOUT bisa dipakai pipe walau di mode dry-run
  // tetap tampil di sini sebagai info.
  console.error('\n=== Client tanpa password (perlu nudge / backfill) ===');

  const clients = await prisma.client.findMany({
    where: { password: null },
    select: { id: true, nama: true, email: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  if (clients.length === 0) {
    console.error('✅ Tidak ada client tanpa password — semua sudah ter-set.');
    return clients;
  }

  console.error(`Ditemukan ${clients.length} client:`);
  for (const c of clients) {
    console.error(
      `  - ${c.nama.padEnd(30)} ${c.email.padEnd(35)} ${c.id} (created ${c.createdAt.toISOString().slice(0, 10)})`
    );
  }
  return clients;
}

async function backfillAll() {
  const pending = await listPending();
  if (pending.length === 0) return;

  console.error('\n=== Generating temp passwords (output CSV ke stdout) ===');
  // CSV header — admin bisa import ke spreadsheet.
  process.stdout.write('email,name,tempPassword\n');

  let updated = 0;
  for (const c of pending) {
    const tempPassword = generateTempPassword();
    const hashed = await hash(tempPassword, BCRYPT_ROUNDS);

    await prisma.client.update({
      where: { id: c.id },
      data: { password: hashed },
    });

    process.stdout.write(
      `${csvEscape(c.email)},${csvEscape(c.nama)},${csvEscape(tempPassword)}\n`
    );
    updated += 1;
  }

  console.error(`\n✅ Berhasil set temp password untuk ${updated} client.`);
  console.error('⚠️  Plaintext password ditulis ke STDOUT.');
  console.error('   Pastikan output sudah di-redirect ke file aman (mis. /tmp/creds.csv).');
  console.error('   Distribusikan ke masing-masing client lalu HAPUS file tsb.');
}

async function resetSingle(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, nama: true, email: true, password: true },
  });

  if (!client) {
    console.error(`❌ Client ${clientId} tidak ditemukan.`);
    process.exit(1);
  }

  const tempPassword = generateTempPassword();
  const hashed = await hash(tempPassword, BCRYPT_ROUNDS);

  await prisma.client.update({
    where: { id: client.id },
    data: { password: hashed },
  });

  console.error(
    `\n=== Reset password untuk ${client.nama} (${client.email}) ===`
  );
  console.error(client.password ? '   (overwrite hash existing)' : '   (backfill, sebelumnya NULL)');

  // CSV ke stdout — konsisten dengan mode --generate.
  process.stdout.write('email,name,tempPassword\n');
  process.stdout.write(
    `${csvEscape(client.email)},${csvEscape(client.nama)},${csvEscape(tempPassword)}\n`
  );

  console.error('\n✅ Selesai. Bagikan password ke client lalu HAPUS file output.');
}

async function main() {
  if (SINGLE_CLIENT_ID) {
    console.error(`🔧 RESET MODE — client ${SINGLE_CLIENT_ID}`);
    await resetSingle(SINGLE_CLIENT_ID);
    return;
  }

  if (GENERATE) {
    console.error('🟢 GENERATE MODE — temp password akan dibuat & disimpan.');
    await backfillAll();
    return;
  }

  if (DRY_RUN) {
    console.error('🟡 DRY-RUN — listing saja, tidak ada perubahan.');
    await listPending();
    console.error('\nGunakan --generate untuk backfill, atau --client <id> untuk reset 1 client.');
    return;
  }
}

main()
  .catch((e) => {
    console.error('❌ Migration error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
