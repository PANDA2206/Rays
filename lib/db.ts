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
} from './types';

const DEFAULT_STEPS: [number, string][] = [
  [1, 'Survey & Engineering'],
  [2, 'Document Collection'],
  [3, 'National Portal Application'],
  [4, 'Loan Approval'],
  [5, 'MSEDCL Application'],
  [6, 'Structure Fabrication'],
  [7, 'Electrical Installation'],
  [8, 'Release Order Application'],
  [9, 'Meter Testing'],
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

export async function getAllInstallments(): Promise<
  Pick<Installment, 'project_id' | 'due_date' | 'status' | 'amount'>[]
> {
  const { data } = await supabase.from('installments').select('project_id,due_date,status,amount');
  return data ?? [];
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

export async function createEpcTransaction(data: Partial<EpcTransaction>): Promise<void> {
  await supabase.from('epc_transactions').insert(data);
}

export async function updateEpc(id: string, data: Partial<Epc>): Promise<void> {
  await supabase.from('epcs').update(data).eq('id', id);
}

export async function deleteEpc(id: string): Promise<void> {
  await supabase.from('epcs').delete().eq('id', id);
}

export async function deleteEpcTransaction(id: string): Promise<void> {
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

export async function ensureVoltedgeEpc(epcs: Epc[]): Promise<void> {
  if (!epcs.some((e) => (e.name || '').toLowerCase() === 'voltedge')) {
    try {
      await supabase.from('epcs').insert({ name: 'Voltedge', personal_amount: 0, gst_received: 0 });
    } catch {
      // ignore
    }
  }
}
