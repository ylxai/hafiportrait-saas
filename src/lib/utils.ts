import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import crypto from "crypto"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateClientToken(): string {
  return crypto.randomBytes(8).toString("hex")
}

export function generateKodeBooking(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = crypto.randomBytes(2).toString("hex").toUpperCase()
  return `EV-${timestamp}-${random}`
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
