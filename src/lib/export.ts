/**
 * CSV Export Utility
 * Minimal implementation for exporting data to CSV
 */

export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  columns?: { key: keyof T; label: string }[]
) {
  if (data.length === 0) {
    throw new Error('No data to export');
  }

  // Determine columns
  const cols = columns || Object.keys(data[0]).map(key => ({ key: key as keyof T, label: key }));

  // Create CSV header
  const header = cols.map(col => escapeCSV(col.label)).join(',');

  // Create CSV rows
  const rows = data.map(row =>
    cols.map(col => {
      const value = row[col.key];
      return escapeCSV(formatValue(value));
    }).join(',')
  );

  // Combine header and rows
  const csv = [header, ...rows].join('\n');

  // Trigger download
  downloadCSV(csv, filename);
}

function escapeCSV(value: string): string {
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}
