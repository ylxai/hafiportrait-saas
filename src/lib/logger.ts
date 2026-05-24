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
 *   - `level`     : 'debug' | 'info' | 'warn' | 'error'
 *   - `event`     : nama event (snake/dot-case)
 *   - `time`      : ISO timestamp
 *   - `requestId` : auto-injected from AsyncLocalStorage when running
 *                   inside a request scope (Sprint 3 / Task 3.1).
 *                   Caller can override by passing it in the context.
 *   - `...ctx`    : context tambahan (dimerge ke root)
 *
 * Error di-serialize ke `{ message, name, stack }` agar tidak hilang saat JSON.stringify.
 *
 * Edge-runtime safety: this module is imported by Edge-rendered code
 * paths transitively. We therefore guard the `node:async_hooks`
 * import — the Edge build does not expose it. When unavailable, the
 * logger simply emits without a `requestId` field; the middleware
 * still echoes the header back, so client-side tracing remains
 * intact.
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

/**
 * Lazy-loaded `getRequestId` resolver. We do NOT statically import
 * `@/lib/request-context` because that pulls in `node:async_hooks`,
 * which crashes the Edge runtime build. The dynamic require is gated
 * by an environment check and memoised so the cost is paid once per
 * process.
 */
type GetRequestIdFn = () => string | undefined;
let cachedGetRequestId: GetRequestIdFn | null | undefined;

function resolveGetRequestId(): GetRequestIdFn | null {
  if (cachedGetRequestId !== undefined) {
    return cachedGetRequestId;
  }

  // The Edge runtime sets `EdgeRuntime` on `globalThis`. When present,
  // skip the require() entirely — `node:async_hooks` would throw.
  if (typeof (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime !== 'undefined') {
    cachedGetRequestId = null;
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@/lib/request-context') as {
      getRequestId?: GetRequestIdFn;
    };
    cachedGetRequestId = mod.getRequestId ?? null;
  } catch {
    cachedGetRequestId = null;
  }
  return cachedGetRequestId;
}

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

  const normalized = normalizeContext(ctx);

  // Auto-inject requestId from the ALS scope unless the caller
  // already provided one. Outside a request scope (boot, scheduled
  // jobs, scripts) the field is omitted rather than emitted as
  // `null` so log filters stay simple.
  let requestId: string | undefined;
  if (typeof normalized.requestId === 'string') {
    requestId = normalized.requestId;
  } else {
    const getRequestId = resolveGetRequestId();
    requestId = getRequestId?.();
  }

  const payload: Record<string, unknown> = {
    level,
    event,
    time: new Date().toISOString(),
    ...(requestId ? { requestId } : {}),
    ...normalized,
  };

  // The spread above lets caller-supplied `requestId` win, which is
  // intentional: webhook handlers replay an upstream requestId by
  // passing it explicitly. Re-assert it here in case the spread
  // overwrote with `undefined`.
  if (requestId && payload.requestId === undefined) {
    payload.requestId = requestId;
  }

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
