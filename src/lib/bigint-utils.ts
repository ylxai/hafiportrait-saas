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
export function serializeBigInt<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle BigInt directly
  if (typeof obj === 'bigint') {
    return String(obj) as T;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => serializeBigInt(item)) as T;
  }

  // Handle objects
  if (typeof obj === 'object') {
    const serialized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'bigint') {
        serialized[key] = String(value);
      } else if (value !== null && typeof value === 'object') {
        serialized[key] = serializeBigInt(value);
      } else {
        serialized[key] = value;
      }
    }
    
    return serialized as T;
  }

  // Primitive types (string, number, boolean)
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
 * Type guard to check if value is BigInt
 */
export function isBigInt(value: unknown): value is bigint {
  return typeof value === 'bigint';
}

/**
 * Safely convert BigInt to number (with overflow check)
 * Throws error if BigInt exceeds Number.MAX_SAFE_INTEGER
 * 
 * @example
 * const size = bigIntToNumber(1024n); // 1024
 * bigIntToNumber(9007199254740992n); // throws Error
 */
export function bigIntToNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(`BigInt value ${value} exceeds safe integer range`);
  }
  return Number(value);
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
