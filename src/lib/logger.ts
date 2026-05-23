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
 */

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
}

export const logger = {
  debug: (event: string, ctx?: LogContext) => emit('debug', event, ctx),
  info: (event: string, ctx?: LogContext) => emit('info', event, ctx),
  warn: (event: string, ctx?: LogContext) => emit('warn', event, ctx),
  error: (event: string, ctx?: LogContext) => emit('error', event, ctx),
};
