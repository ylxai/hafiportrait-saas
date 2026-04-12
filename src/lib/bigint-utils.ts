/**
 * BigInt utility functions for safe type conversion and validation
 * All functions handle edge cases and provide null-safety
 */

/**
 * Safely convert an unknown value to BigInt
 * Handles null, undefined, number, string, and bigint types
 * @param value - The value to convert
 * @returns BigInt value or null if conversion fails
 */
export function safeBigInt(value: unknown): bigint | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (Number.isNaN(value) || !Number.isFinite(value)) return null;
    return BigInt(Math.floor(value));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    try {
      return BigInt(trimmed);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Convert BigInt to string for JSON serialization
 * Returns null if value is null/undefined
 * @param value - BigInt value to serialize
 * @returns String representation or null
 */
export function serializeBigInt(value: bigint | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value.toString();
}

/**
 * Safely add two BigInt values, handling nulls
 * @param a - First value (can be null)
 * @param b - Second value (can be null)
 * @returns Sum or null if both inputs are null
 */
export function safeBigIntAdd(a: bigint | null, b: bigint | null): bigint | null {
  if (a === null && b === null) return null;
  const valA = a ?? BigInt(0);
  const valB = b ?? BigInt(0);
  return valA + valB;
}

/**
 * Safely subtract two BigInt values, handling nulls
 * @param a - First value (can be null)
 * @param b - Second value (can be null)
 * @returns Difference or null if both inputs are null
 */
export function safeBigIntSubtract(a: bigint | null, b: bigint | null): bigint | null {
  if (a === null && b === null) return null;
  const valA = a ?? BigInt(0);
  const valB = b ?? BigInt(0);
  return valA - valB;
}

/**
 * Compare two BigInt values, handling nulls
 * null is treated as 0
 * @param a - First value
 * @param b - Second value
 * @returns -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareBigInt(a: bigint | null, b: bigint | null): number {
  const valA = a ?? BigInt(0);
  const valB = b ?? BigInt(0);
  if (valA < valB) return -1;
  if (valA > valB) return 1;
  return 0;
}

/**
 * Convert bytes to human-readable format
 * Uses BigInt for precision with large values
 * @param bytes - Size in bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string (e.g., "1.50 GB")
 */
export function formatBytes(bytes: bigint | number, decimals: number = 2): string {
  const bigBytes = typeof bytes === 'number' ? BigInt(Math.floor(bytes)) : bytes;
  
  if (bigBytes === BigInt(0)) return '0 B';
  
  const k = BigInt(1024);
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  
  // Find appropriate size unit
  let i = 0;
  let value = bigBytes;
  
  while (value >= k && i < sizes.length - 1) {
    value = value / k;
    i++;
  }
  
  // Convert to number for decimal formatting
  const numValue = Number(value);
  const dm = decimals < 0 ? 0 : decimals;
  
  return `${numValue.toFixed(dm)} ${sizes[i]}`;
}

/**
 * Parse a human-readable size string to BigInt bytes
 * @param sizeStr - String like "10MB", "1.5 GB", "1024"
 * @returns BigInt bytes or null if parsing fails
 */
export function parseSizeToBytes(sizeStr: string): bigint | null {
  const trimmed = sizeStr.trim().toUpperCase();
  const match = trimmed.match(/^(\d+\.?\d*)\s*(B|KB|MB|GB|TB|PB)?$/);
  
  if (!match) return null;
  
  const num = parseFloat(match[1]);
  const unit = match[2] || 'B';
  
  if (Number.isNaN(num) || num < 0) return null;
  
  const multipliers: Record<string, bigint> = {
    B: BigInt(1),
    KB: BigInt(1024),
    MB: BigInt(1024) ** BigInt(2),
    GB: BigInt(1024) ** BigInt(3),
    TB: BigInt(1024) ** BigInt(4),
    PB: BigInt(1024) ** BigInt(5),
  };
  
  const multiplier = multipliers[unit];
  if (!multiplier) return null;
  
  // Handle decimals by multiplying first
  if (match[1].includes('.')) {
    const [whole, fraction] = match[1].split('.');
    const wholePart = BigInt(whole);
    const fractionPart = BigInt(fraction.padEnd(3, '0').slice(0, 3)); // 3 decimal places
    const fractionDivisor = BigInt(10) ** BigInt(fraction.length);
    
    return (wholePart * multiplier) + ((fractionPart * multiplier) / fractionDivisor);
  }
  
  return BigInt(match[1]) * multiplier;
}