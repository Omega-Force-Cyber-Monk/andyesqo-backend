/** Minimal CSV writer for the "Export" buttons. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s =
      v instanceof Date
        ? v.toISOString()
        : typeof v === 'object'
          ? JSON.stringify(v)
          : String(v as string | number | boolean);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(',')),
  ].join('\n');
}
