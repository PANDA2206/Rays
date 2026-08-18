// ── Formatting + small helpers (ported from streamlit_app/modules/utils.py) ──

/** Indian-style currency, e.g. ₹1,80,000 */
export function formatCurrency(value: number | null | undefined, decimals = 0): string {
  const n = Number(value || 0);
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** Compact lakh form, e.g. ₹1.8L */
export function formatLakh(value: number | null | undefined): string {
  const n = Number(value || 0);
  return `₹${(n / 100000).toFixed(1)}L`;
}

export function formatPercent(value: number | null | undefined): string {
  return `${Number(value || 0).toFixed(1)}%`;
}

export function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** "5m ago" style relative time from an ISO string. */
export function timeAgo(tsStr?: string | null): string {
  if (!tsStr) return '-';
  try {
    const ts = new Date(tsStr.replace('Z', '+00:00'));
    const s = Math.floor((Date.now() - ts.getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  } catch {
    return '-';
  }
}

export function timeOfDay(tsStr?: string | null): string {
  if (!tsStr) return '';
  try {
    return new Date(tsStr.replace('Z', '+00:00')).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export const STATUS_COLORS: Record<string, string> = {
  completed: '#22c55e',
  in_progress: '#3b82f6',
  planning: '#f59e0b',
  approved: '#8b5cf6',
  on_hold: '#f97316',
  cancelled: '#ef4444',
};

export const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  in_progress: 'In Progress',
  planning: 'Planning',
  approved: 'Approved',
  on_hold: 'On Hold',
  cancelled: 'Cancelled',
};

/** The date a stock batch was bought, as YYYY-MM-DD. Falls back to when the
 *  item row was created, for items added before purchase_date existed. */
export function itemDate(it: { purchase_date?: string | null; created_at?: string | null }): string {
  const d = it.purchase_date || it.created_at || '';
  return String(d).slice(0, 10);
}

/**
 * How an inventory item is named everywhere it is picked or listed:
 *
 *   ACDB · ₹400 · 30 pcs · 2026-08-18
 *   ACDB · ₹500 · 20 pcs · 2026-08-15
 *
 * The same product bought twice at different rates is two batches. Rate, the
 * quantity still on hand, and the date it was bought are what tell them apart —
 * so all three travel with the name into every dropdown, table and saved EPC
 * entry, and you can see exactly which batch you are selling from.
 *
 * `qty` is the remaining stock; omit it where movement data is not loaded and
 * the label falls back to showing just the unit.
 */
export function itemLabel(it: {
  name: string;
  unit?: string | null;
  unit_cost?: number | null;
  qty?: number | null;
  purchase_date?: string | null;
  created_at?: string | null;
}): string {
  const parts = [it.name, formatCurrency(Number(it.unit_cost || 0))];
  if (it.qty !== undefined && it.qty !== null) {
    parts.push(`${Number(it.qty)}${it.unit ? ` ${it.unit}` : ''}`);
  } else if (it.unit) {
    parts.push(String(it.unit));
  }
  const d = itemDate(it);
  if (d) parts.push(d);
  return parts.join(' · ');
}

/** EPC display id, e.g. EPC-1A2B3C4D */
export function epcDisplayId(p: { project_code?: string | null; id: string }): string {
  return p.project_code || `EPC-${p.id.slice(0, 8).toUpperCase()}`;
}

/** Short project display id, e.g. PRJ-1A2B3C */
export function projectDisplayId(p: { project_code?: string | null; id: string }): string {
  return p.project_code || `PRJ-${p.id.slice(0, 6).toUpperCase()}`;
}
