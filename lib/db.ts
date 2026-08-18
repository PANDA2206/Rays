// ── Data-access layer (ported from streamlit_app/modules/supabase_client.py) ──
import { supabase } from './supabase';
import type {
  Project,
  Installment,
  ProjectStep,
  ProjectDocument,
  ProjectNote,
  ActivityLog,
  AppUser,
  Epc,
  EpcTransaction,
  EpcProjectFee,
  Firm,
  InventoryItem,
  InventoryItemStock,
  InventoryMovement,
  InventoryExpense,
} from './types';

// Meter Testing runs at #6, ahead of fabrication/installation; the three steps it
// overtakes shift down to 7-9. Existing projects are renumbered by
// supabase/migration_subsidy_and_steps.sql (keyed on step_name, so status/dates follow).
const DEFAULT_STEPS: [number, string][] = [
  [1, 'Survey & Engineering'],
  [2, 'Document Collection'],
  [3, 'National Portal Application'],
  [4, 'Loan Approval'],
  [5, 'MSEDCL Application'],
  [6, 'Meter Testing'],
  [7, 'Structure Fabrication'],
  [8, 'Electrical Installation'],
  [9, 'Release Order Application'],
  [10, 'National Portal Installation Details'],
  [11, 'Net Meter Installation'],
  [12, 'Project Commissioning'],
  [13, 'Subsidy Process'],
  [14, 'Project Handover'],
];

const DEFAULT_DOCS = ['WCR', 'ANNEXURE I', 'DCR CERTIFICATE', 'NET METER AGREEMENT', 'DATA SHEET', 'SITE PHOTOS'];

// ── Activity logging ─────────────────────────────────────────────────────────

export async function logActivity(entry: Partial<ActivityLog>): Promise<void> {
  try {
    const sess = await getSessionUser();
    await supabase.from('activity_logs').insert({
      user_email: sess?.email ?? '',
      user_name: sess?.name ?? '',
      user_picture: sess?.picture ?? '',
      action: entry.action ?? '',
      entity_type: entry.entity_type ?? null,
      project_id: entry.project_id ? String(entry.project_id) : null,
      project_name: entry.project_name ?? null,
      details: entry.details ?? null,
    });
  } catch {
    // logging must never break the app
  }
}

export async function getActivityLogs(limit = 50, userEmail?: string): Promise<ActivityLog[]> {
  try {
    let q = supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (userEmail) q = q.eq('user_email', userEmail);
    const { data } = await q;
    return data ?? [];
  } catch {
    return [];
  }
}

// Lightweight reader of the current session identity for logging (localStorage,
// set by the Google OAuth callback — see lib/auth.tsx).
async function getSessionUser(): Promise<{ email: string; name: string; picture: string } | null> {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('ve_identity');
    return raw ? (JSON.parse(raw) as { email: string; name: string; picture: string }) : null;
  } catch {
    return null;
  }
}

// ── Projects ─────────────────────────────────────────────────────────────────

export async function getProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getProjectById(id: string): Promise<Project | null> {
  const { data, error } = await supabase.from('projects').select('*').eq('id', id);
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function createProject(data: Partial<Project>): Promise<Project | null> {
  const { data: rows, error } = await supabase.from('projects').insert(data).select();
  if (error) throw error;
  const result = rows?.[0] ?? null;
  if (result) {
    await logActivity({
      action: 'Created project',
      entity_type: 'project',
      project_id: result.id,
      project_name: result.customer_name,
      details: `Status: ${result.project_status} | Size: ${result.system_size_kwp} kWp`,
    });
  }
  return result;
}

export async function updateProject(id: string, data: Partial<Project>): Promise<Project | null> {
  const { data: rows, error } = await supabase
    .from('projects')
    .update(data)
    .eq('id', id)
    .select();
  if (error) throw error;
  const result = rows?.[0] ?? null;
  if (result) {
    const changed = Object.entries(data)
      .filter(([k]) => k !== 'updated_at')
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    await logActivity({
      action: 'Updated project',
      entity_type: 'project',
      project_id: id,
      project_name: result.customer_name,
      details: changed.slice(0, 200),
    });
  }
  return result;
}

// ── Installments ─────────────────────────────────────────────────────────────

export async function getInstallments(projectId: string): Promise<Installment[]> {
  const { data } = await supabase
    .from('installments')
    .select('*')
    .eq('project_id', projectId)
    .order('installment_no', { ascending: true });
  return data ?? [];
}

export async function getAllInstallments(): Promise<Installment[]> {
  const { data } = await supabase.from('installments').select('*');
  return (data ?? []) as Installment[];
}

export async function updateInstallment(id: string, data: Partial<Installment>): Promise<void> {
  await supabase.from('installments').update(data).eq('id', id);
}

export async function deleteInstallment(id: string): Promise<void> {
  await supabase.from('installments').delete().eq('id', id);
}

/**
 * Installment rows that represent customer money.
 *
 * Subsidy rows are excluded outright. The old build wrote a paid installment
 * with payment_type='Subsidy' whenever a subsidy was marked disbursed, and
 * those rows still sit in the database on existing projects. Filtering them
 * here means subsidy is out of every calculation immediately, whether or not
 * the cleanup migration has been run yet.
 */
export function countableInstallments(installments: Installment[]): Installment[] {
  return installments.filter((i) => (i.payment_type || '').toLowerCase() !== 'subsidy');
}

/** Money actually in hand: only installments marked paid. A pending installment
 *  is a promise, not a payment, so it must not reduce what is still due. */
export function sumPaid(installments: Installment[]): number {
  return countableInstallments(installments)
    .filter((i) => (i.status || '').toLowerCase() === 'paid')
    .reduce((s, i) => s + Number(i.amount || 0), 0);
}

/**
 * Single source of truth for a project's money: re-derives amount_paid and
 * balance from the installment rows that actually exist. Call after ANY
 * installment add/edit/delete, or after the total cost changes.
 *
 * Subsidy is deliberately NOT part of this — it is paid to the customer by the
 * government, never to us, so it must not inflate what we have received.
 * Writes directly (not via updateProject) to avoid an activity-log entry for
 * every recalculation.
 */
export async function recalcProjectFinancials(projectId: string, totalCost: number): Promise<number> {
  const received = sumPaid(await getInstallments(projectId));
  await supabase
    .from('projects')
    .update({ amount_paid: received, balance: totalCost - received })
    .eq('id', projectId);
  return received;
}

export async function addInstallment(row: Partial<Installment>): Promise<void> {
  try {
    const { error } = await supabase.from('installments').insert(row);
    if (error) throw error;
  } catch {
    // retry without payment_type column (older schemas)
    const { payment_type, ...rest } = row;
    void payment_type;
    await supabase.from('installments').insert(rest);
  }
}

// ── Project steps ────────────────────────────────────────────────────────────

export async function getProjectSteps(projectIds: string[]): Promise<ProjectStep[]> {
  if (!projectIds.length) return [];
  const { data } = await supabase
    .from('project_steps')
    .select('project_id,step_no,step_name,status')
    .in('project_id', projectIds)
    .order('step_no', { ascending: true });
  return data ?? [];
}

/** Fetch steps for one project, seeding the 14 default steps if none exist. */
export async function getOrCreateSteps(projectId: string): Promise<ProjectStep[]> {
  const { data } = await supabase
    .from('project_steps')
    .select('*')
    .eq('project_id', projectId)
    .order('step_no', { ascending: true });
  let rows = (data ?? []) as ProjectStep[];
  if (rows.length === 0) {
    await supabase.from('project_steps').insert(
      DEFAULT_STEPS.map(([n, name]) => ({
        project_id: projectId,
        step_no: n,
        step_name: name,
        status: 'pending',
        progress_percent: 0,
      }))
    );
    const { data: seeded } = await supabase
      .from('project_steps')
      .select('*')
      .eq('project_id', projectId)
      .order('step_no', { ascending: true });
    rows = (seeded ?? []) as ProjectStep[];
  } else {
    const existingNos = new Set(rows.map((r) => r.step_no));
    const missing = DEFAULT_STEPS.filter(([n]) => !existingNos.has(n));
    if (missing.length) {
      await supabase.from('project_steps').insert(
        missing.map(([n, name]) => ({
          project_id: projectId,
          step_no: n,
          step_name: name,
          status: 'pending',
          progress_percent: 0,
        }))
      );
      const { data: refreshed } = await supabase
        .from('project_steps')
        .select('*')
        .eq('project_id', projectId)
        .order('step_no', { ascending: true });
      rows = (refreshed ?? []) as ProjectStep[];
    }
  }
  return rows;
}

export async function updateStep(id: string, payload: Partial<ProjectStep>): Promise<void> {
  await supabase.from('project_steps').update(payload).eq('id', id);
}

/** Fetch documents for one project, seeding the default checklist if none exist. */
export async function getOrCreateDocs(projectId: string): Promise<ProjectDocument[]> {
  const { data } = await supabase.from('project_documents').select('*').eq('project_id', projectId);
  let rows = (data ?? []) as ProjectDocument[];
  if (rows.length === 0) {
    await supabase
      .from('project_documents')
      .insert(DEFAULT_DOCS.map((d) => ({ project_id: projectId, doc_name: d, status: 'pending' })));
    const { data: seeded } = await supabase
      .from('project_documents')
      .select('*')
      .eq('project_id', projectId);
    rows = (seeded ?? []) as ProjectDocument[];
  }
  return rows;
}

export async function updateDoc(id: string, status: string): Promise<void> {
  await supabase.from('project_documents').update({ status }).eq('id', id);
}

export async function getProjectNotes(projectId: string): Promise<ProjectNote[]> {
  const { data } = await supabase
    .from('project_notes')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  return (data ?? []) as ProjectNote[];
}

export async function addProjectNote(projectId: string, note: string, nextAction: string): Promise<void> {
  await supabase.from('project_notes').insert({ project_id: projectId, note, next_action: nextAction });
}

export async function deleteProjectNote(id: string): Promise<void> {
  await supabase.from('project_notes').delete().eq('id', id);
}

export async function getProjectLogs(projectId: string, limit = 6): Promise<ActivityLog[]> {
  try {
    const { data } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return data ?? [];
  } catch {
    return [];
  }
}

// ── App users ────────────────────────────────────────────────────────────────

export async function getAppUsers(): Promise<AppUser[]> {
  const { data } = await supabase.from('app_users').select('*');
  return data ?? [];
}

export async function updateAppUser(id: string, data: Partial<AppUser>): Promise<void> {
  await supabase.from('app_users').update(data).eq('id', id);
}

// ── EPC ──────────────────────────────────────────────────────────────────────

export async function getEpcs(): Promise<Epc[]> {
  const { data } = await supabase.from('epcs').select('*').order('created_at', { ascending: false });
  return data ?? [];
}

export async function getEpcTransactions(epcId?: string): Promise<EpcTransaction[]> {
  let q = supabase.from('epc_transactions').select('*');
  if (epcId) q = q.eq('epc_id', epcId);
  const { data } = await q.order('created_at', { ascending: false });
  return data ?? [];
}

export async function createEpc(data: Partial<Epc>): Promise<Epc | null> {
  const { data: rows } = await supabase.from('epcs').insert(data).select();
  return rows?.[0] ?? null;
}

export async function createEpcTransaction(data: Partial<EpcTransaction>): Promise<EpcTransaction | null> {
  const { data: rows } = await supabase.from('epc_transactions').insert(data).select();
  return (rows?.[0] as EpcTransaction) ?? null;
}

export async function updateEpc(id: string, data: Partial<Epc>): Promise<void> {
  await supabase.from('epcs').update(data).eq('id', id);
}

export async function deleteEpc(id: string): Promise<void> {
  await supabase.from('epcs').delete().eq('id', id);
}

export async function deleteEpcTransaction(id: string): Promise<void> {
  // also remove any inventory stock-out + expense this sale generated
  await supabase.from('inventory_movements').delete().eq('source', 'epc_sale').eq('source_ref', id);
  await supabase.from('inventory_expenses').delete().eq('source', 'epc_sale').eq('source_ref', id);
  await supabase.from('epc_transactions').delete().eq('id', id);
}

// ── EPC project fees ─────────────────────────────────────────────────────────

export async function getEpcProjectFees(epcId: string): Promise<EpcProjectFee[]> {
  const { data } = await supabase
    .from('epc_project_fees')
    .select('*')
    .eq('epc_id', epcId)
    .order('fee_date', { ascending: false });
  return (data ?? []) as EpcProjectFee[];
}

export async function createEpcProjectFee(data: Partial<EpcProjectFee>): Promise<void> {
  await supabase.from('epc_project_fees').insert(data);
}

export async function deleteEpcProjectFee(id: string): Promise<void> {
  await supabase.from('epc_project_fees').delete().eq('id', id);
}

// ── Delete a project (admin) — cascades to steps/docs/notes/installments via FK ──
export async function deleteProject(id: string, name?: string | null): Promise<void> {
  await supabase.from('projects').delete().eq('id', id);
  await logActivity({ action: 'Deleted project', entity_type: 'project', project_id: id, project_name: name ?? null });
}

// ── Inventory ────────────────────────────────────────────────────────────────

export async function getInventoryItems(): Promise<InventoryItem[]> {
  const { data } = await supabase.from('inventory_items').select('*').order('name', { ascending: true });
  const rows = (data ?? []) as InventoryItem[];
  // Batches of the same product sit together, oldest purchase first. Sorted here
  // rather than in the query so it still works before the v3 migration adds the column.
  return rows.sort((a, b) => {
    const n = (a.name || '').localeCompare(b.name || '');
    if (n !== 0) return n;
    return String(a.purchase_date || a.created_at || '').localeCompare(
      String(b.purchase_date || b.created_at || '')
    );
  });
}

/**
 * Items with their live quantities folded in (in − out), so a batch can be
 * labelled with how much of it is actually left. Used anywhere an item is
 * picked for sale or issue, not just on the inventory page.
 */
export async function getInventoryStock(): Promise<InventoryItemStock[]> {
  const [items, moves] = await Promise.all([getInventoryItems(), getInventoryMovements()]);
  return items.map((it) => {
    const mv = moves.filter((m) => m.item_id === it.id);
    const qtyIn = mv.filter((m) => m.type === 'in').reduce((s, m) => s + Number(m.quantity || 0), 0);
    const qtyOut = mv.filter((m) => m.type === 'out').reduce((s, m) => s + Number(m.quantity || 0), 0);
    const qty = qtyIn - qtyOut;
    return {
      ...it,
      qtyIn,
      qtyOut,
      qty,
      stockValue: qty * Number(it.unit_cost || 0),
      low: qty <= Number(it.reorder_level || 0),
    };
  });
}

export async function createInventoryItem(data: Partial<InventoryItem>): Promise<InventoryItem | null> {
  const { data: rows } = await supabase.from('inventory_items').insert(data).select();
  return (rows?.[0] as InventoryItem) ?? null;
}

export async function updateInventoryItem(id: string, data: Partial<InventoryItem>): Promise<void> {
  await supabase.from('inventory_items').update(data).eq('id', id);
}

export async function deleteInventoryItem(id: string): Promise<void> {
  await supabase.from('inventory_items').delete().eq('id', id);
}

export async function getInventoryMovements(): Promise<InventoryMovement[]> {
  const { data } = await supabase
    .from('inventory_movements')
    .select('*')
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false });
  return (data ?? []) as InventoryMovement[];
}

export async function createInventoryMovement(data: Partial<InventoryMovement>): Promise<void> {
  await supabase.from('inventory_movements').insert(data);
}

export async function deleteInventoryMovement(id: string): Promise<void> {
  await supabase.from('inventory_movements').delete().eq('id', id);
}

export async function getInventoryExpenses(): Promise<InventoryExpense[]> {
  const { data } = await supabase
    .from('inventory_expenses')
    .select('*')
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false });
  return (data ?? []) as InventoryExpense[];
}

export async function createInventoryExpense(data: Partial<InventoryExpense>): Promise<void> {
  await supabase.from('inventory_expenses').insert(data);
}

export async function deleteInventoryExpense(id: string): Promise<void> {
  await supabase.from('inventory_expenses').delete().eq('id', id);
}

/** Marks the partner row that stands for "this firm did the work itself". */
export const IN_HOUSE_SUFFIX = '(in-house)';

export function isInHouse(epc: { name?: string | null }): boolean {
  return (epc.name || '').toLowerCase().includes(IN_HOUSE_SUFFIX);
}

/**
 * Give a firm its own in-house partner row if it hasn't got one.
 *
 * The name is derived from the firm, never hardcoded — each firm's in-house row
 * must carry that firm's name, or opening the page under one firm would create
 * another firm's row inside it.
 */
export async function ensureInHouseEpc(
  epcs: Epc[],
  firmId?: string | null,
  firmName?: string | null
): Promise<void> {
  if (!firmId || !firmName) return;
  const mine = epcs.filter((e) => e.firm_id === firmId);
  if (mine.some(isInHouse)) return;
  try {
    await supabase.from('epcs').insert({
      name: `${firmName} ${IN_HOUSE_SUFFIX}`,
      personal_amount: 0,
      gst_received: 0,
      firm_id: firmId,
    });
  } catch {
    // ignore
  }
}

// ── Firms ────────────────────────────────────────────────────────────────────

export async function getFirms(): Promise<Firm[]> {
  const { data } = await supabase.from('firms').select('*').order('name', { ascending: true });
  return (data ?? []) as Firm[];
}
