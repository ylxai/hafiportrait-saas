/**
 * BigInt Serialization Utilities
 * 
 * Prisma returns BigInt for Int8 fields, but JSON.stringify cannot serialize BigInt.
 * These utilities ensure consistent BigInt handling across all API responses.
 */

/**
 * Recursively converts all BigInt values in an object to strings
 * Safe for nested objects and arrays
 * 
 * @example
 * const data = { fileSize: 1024n, nested: { count: 5n } };
 * const serialized = serializeBigInt(data);
 * // { fileSize: "1024", nested: { count: "5" } }
 */
// Overloads for correct typing: bigint → string; other values → same shape with bigints serialized
export function serializeBigInt(value: bigint): string;
export function serializeBigInt<T>(value: T): T;
export function serializeBigInt(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'bigint') {
    return String(obj);
  }

  // Preserve special object types as-is — recursing into them would corrupt
  // their value. `Date` in particular has no enumerable own properties, so
  // `Object.entries(date)` returns `[]` and the date would be silently
  // serialized to `{}` (regression introduced when wrapping all
  // `successResponse`/`paginatedResponse` payloads).
  if (
    obj instanceof Date ||
    obj instanceof Map ||
    obj instanceof Set ||
    obj instanceof RegExp ||
    obj instanceof ArrayBuffer ||
    ArrayBuffer.isView(obj) ||
    Buffer.isBuffer(obj as Buffer)
  ) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => serializeBigInt(item));
  }

  if (typeof obj === 'object') {
    const serialized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof value === 'bigint') {
        serialized[key] = String(value);
      } else if (value !== null && typeof value === 'object') {
        serialized[key] = serializeBigInt(value);
      } else {
        serialized[key] = value;
      }
    }
    return serialized;
  }

  return obj;
}

/**
 * Safe JSON.stringify that handles BigInt values
 * Converts BigInt to string during serialization
 * 
 * @example
 * const data = { fileSize: 1024n };
 * const json = stringifyWithBigInt(data);
 * // '{"fileSize":"1024"}'
 */
export function stringifyWithBigInt(obj: unknown, space?: string | number): string {
  return JSON.stringify(obj, (_, value) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  }, space);
}

/**
 * Format BigInt as human-readable file size
 * 
 * @example
 * formatBigIntFileSize(1024n); // "1.00 KB"
 * formatBigIntFileSize(1048576n); // "1.00 MB"
 */
export function formatBigIntFileSize(bytes: bigint): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = Number(bytes);
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}
