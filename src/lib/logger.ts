/**
 * Structured logger ringan untuk aplikasi.
 *
 * Output JSON satu baris per event — mudah di-pipe ke Sentry/Datadog/Loki.
 * Tidak ada dependency baru; bisa di-drop-in untuk `console.error/warn/info`.
 *
 * Pemakaian:
 *   import { logger } from '@/lib/logger';
 *   logger.error('upload.r2.delete_failed', { uploadId, err });
 *
 * Field standar:
 *   - `level`   : 'debug' | 'info' | 'warn' | 'error'
 *   - `event`   : nama event (snake/dot-case)
 *   - `time`    : ISO timestamp
 *   - `...ctx`  : context tambahan (dimerge ke root)
 *
 * Error di-serialize ke `{ message, name, stack }` agar tidak hilang saat JSON.stringify.
 *
 * Auto-forward ke Sentry: setiap `logger.error(...)` otomatis memanggil
 * `Sentry.captureException` dengan tags = `{ event }` dan extras = sisa context.
 * Jika `ctx.err` / `ctx.error` adalah `Error` instance → dipakai sebagai exception
 * utama. Selain itu dibuat synthetic `Error(event)` agar tetap muncul di Sentry
 * dengan stack ke call site logger. Tidak perlu mengubah call site yang ada.
 */
import * as Sentry from '@sentry/nextjs';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogContext = Record<string, unknown>;

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MIN_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel | undefined) ??
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      message: err.message,
      name: err.name,
      stack: err.stack,
      // surface Prisma error code jika ada
      ...('code' in err ? { code: (err as { code?: string }).code } : {}),
    };
  }
  return { message: String(err) };
}

function normalizeContext(ctx?: LogContext): LogContext {
  if (!ctx) return {};
  const out: LogContext = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (v instanceof Error || k === 'err' || k === 'error') {
      out[k] = serializeError(v);
    } else if (typeof v === 'bigint') {
      out[k] = v.toString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

function pickError(ctx?: LogContext): Error | undefined {
  if (!ctx) return undefined;
  for (const key of ['err', 'error', 'cause'] as const) {
    const v = ctx[key];
    if (v instanceof Error) return v;
  }
  return undefined;
}

function forwardToSentry(level: LogLevel, event: string, ctx?: LogContext): void {
  // Hanya level 'error' di-forward ke Sentry untuk hemat quota.
  // `warn`/`info`/`debug` cukup ke stdout (Vercel logs).
  if (level !== 'error') return;
  // Skip jika DSN belum di-set (dev tanpa Sentry) — Sentry SDK no-op,
  // tapi kita hindari overhead pembuatan synthetic Error.
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  const existing = pickError(ctx);
  const exception = existing ?? new Error(event);
  // Untuk synthetic Error, pakai event sebagai name agar grouping di
  // Sentry konsisten per event-name (bukan generic "Error").
  if (!existing) {
    exception.name = event;
  }

  Sentry.captureException(exception, {
    tags: { event, source: 'logger' },
    extra: normalizeContext(ctx),
    level: 'error',
  });
}

function emit(level: LogLevel, event: string, ctx?: LogContext): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[MIN_LEVEL]) return;

  const payload = {
    level,
    event,
    time: new Date().toISOString(),
    ...normalizeContext(ctx),
  };

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }

  forwardToSentry(level, event, ctx);
}

export const logger = {
  debug: (event: string, ctx?: LogContext) => emit('debug', event, ctx),
  info: (event: string, ctx?: LogContext) => emit('info', event, ctx),
  warn: (event: string, ctx?: LogContext) => emit('warn', event, ctx),
  error: (event: string, ctx?: LogContext) => emit('error', event, ctx),
};
