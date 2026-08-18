'use client';

// Project Detail — ported from streamlit_app/modules/project_detail.py.

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getProjectById,
  getOrCreateSteps,
  getOrCreateDocs,
  getInstallments,
  getProjectNotes,
  getProjectLogs,
  getEpcs,
  updateProject,
  updateStep,
  updateDoc,
  addInstallment,
  updateInstallment,
  deleteInstallment,
  recalcProjectFinancials,
  sumPaid,
  countableInstallments,
  addProjectNote,
  deleteProjectNote,
  deleteProject,
  logActivity,
} from '@/lib/db';
import { useAuth } from '@/lib/auth';
import type {
  Project,
  ProjectStep,
  ProjectDocument,
  Installment,
  ProjectNote,
  ActivityLog,
} from '@/lib/types';
import { formatCurrency, num } from '@/lib/format';
import { Spinner } from '@/components/ui';

// Indexed by position, so this order must track DEFAULT_STEPS in lib/db.ts
// (🧪 Meter Testing sits at #6, ahead of 🔧 fabrication and ⚡ installation).
const STEP_ICONS = ['📐', '📋', '🖥️', '🏦', '🏛️', '🧪', '🔧', '⚡', '📑', '🌐', '🔌', '⚙️', '🎁', '📦'];

const fmtDate = (v?: string | null) => {
  if (!v) return '-';
  try {
    return new Date(String(v).replace('Z', '+00:00')).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  } catch {
    return String(v).slice(0, 10);
  }
};
const fmtDateTime = (v?: string | null) => {
  if (!v) return '-';
  try {
    return new Date(String(v).replace('Z', '+00:00')).toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(v).slice(0, 16);
  }
};

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [steps, setSteps] = useState<ProjectStep[]>([]);
  const [docs, setDocs] = useState<ProjectDocument[]>([]);
  const [insts, setInsts] = useState<Installment[]>([]);
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [epcNames, setEpcNames] = useState<string[]>(['Voltedge']);

  const load = useCallback(async () => {
    const p = await getProjectById(id);
    if (!p) {
      router.push('/customers');
      return;
    }
    setProject(p);
    const [s, d, i, n, l, epcs] = await Promise.all([
      getOrCreateSteps(id),
      getOrCreateDocs(id),
      getInstallments(id),
      getProjectNotes(id),
      getProjectLogs(id),
      getEpcs(),
    ]);
    setSteps(s);
    setDocs(d);
    setInsts(i);
    setNotes(n);
    setLogs(l);
    setEpcNames([
      'Voltedge',
      ...epcs.map((e) => e.name).filter((nm) => nm && nm.toLowerCase() !== 'voltedge'),
    ]);
    setLoading(false);
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !project) return <Spinner />;

  const doneSteps = steps.filter((s) => s.status === 'completed').length;
  const progress = steps.length ? Math.round((doneSteps / steps.length) * 100) : 0;
  const curStage =
    steps.find((s) => s.status === 'in_progress') ||
    steps.find((s) => s.status === 'pending') ||
    (steps.length ? steps[steps.length - 1] : null);

  return (
    <div className="space-y-3">
      {/* top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-sm">Edit Customers</span>
          <span className="text-slate-600">›</span>
          <span className="font-extrabold text-blue-400">📂 PROJECT DETAILS</span>
        </div>
        <button className="ve-btn" onClick={() => router.push('/customers')}>← Back</button>
      </div>
      <div className="text-slate-500 text-xs">Last updated: {fmtDateTime(project.updated_at || project.created_at)}</div>

      {/* summary | subsidy */}
      <div className="grid lg:grid-cols-[1.75fr_1fr] gap-3">
        <Card title="📑 PROJECT SUMMARY">
          <div className="flex gap-4 items-center">
            <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1">
              <ProjectIdField project={project} isAdmin={isAdmin} onSaved={load} />
              <KV label="Customer Name" value={project.customer_name || '-'} />
              <KV label="Last Updated On" value={fmtDateTime(project.updated_at || project.created_at)} />
              <KV label="Current Stage" value={curStage ? `#${curStage.step_no} · ${curStage.step_name}` : '-'} />
            </div>
            <ProgressDonut progress={progress} />
          </div>
        </Card>
        <SubsidyCard project={project} onSaved={load} />
      </div>

      {/* customer | project info */}
      <div className="grid md:grid-cols-2 gap-3">
        <CustomerInfo project={project} onSaved={load} />
        <ProjectInfo project={project} epcNames={epcNames} onSaved={load} />
      </div>

      {/* workflow */}
      <Card title="🛠️ PROJECT WORKFLOW & MILESTONES">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {steps.map((step, i) => {
            const st = step.status;
            const ring = st === 'completed' ? '#22c55e' : st === 'in_progress' ? '#3b82f6' : '#475569';
            const badge = st === 'completed' ? '#16a34a' : st === 'in_progress' ? '#2563eb' : '#1e293b';
            const lbl = st === 'completed' ? '✓ Completed' : st === 'in_progress' ? '● In Progress' : 'Pending';
            const lblClr = st === 'completed' ? '#22c55e' : st === 'in_progress' ? '#3b82f6' : '#ef4444';
            return (
              <div key={step.id} className="text-center rounded-lg p-2.5" style={{ flex: '0 0 100px', border: `1px solid ${st === 'pending' ? '#1e293b' : ring}`, background: '#0b1626' }}>
                <div className="mx-auto mb-1.5 rounded-full text-white text-[0.66rem] font-bold flex items-center justify-center" style={{ width: 24, height: 24, background: badge, border: `2px solid ${ring}` }}>
                  {step.step_no}
                </div>
                <div className="text-base mb-0.5">{STEP_ICONS[i] ?? '•'}</div>
                <div className="text-[0.58rem] font-bold text-slate-300 leading-tight min-h-[26px]">{step.step_name}</div>
                <div className="text-[0.54rem] text-slate-500 my-0.5">{fmtDate(step.end_date || step.start_date)}</div>
                <span className="text-[0.6rem] font-bold" style={{ color: lblClr }}>{lbl}</span>
              </div>
            );
          })}
        </div>
        <StepUpdater steps={steps} project={project} onSaved={load} />
      </Card>

      {/* bottom grid */}
      <div className="grid lg:grid-cols-[2.1fr_1.2fr_1.2fr] gap-3">
        <Financials project={project} installments={insts} isAdmin={isAdmin} onSaved={load} />
        <div className="space-y-3">
          <Documents docs={docs} project={project} onSaved={load} />
          <InternalNotes notes={notes} project={project} onSaved={load} />
        </div>
        <Timeline logs={logs} />
      </div>

      {/* admin-only danger zone */}
      {isAdmin && <DangerZone project={project} />}
    </div>
  );
}

function DangerZone({ project }: { project: Project }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const del = async () => {
    setBusy(true);
    await deleteProject(project.id, project.customer_name);
    router.push('/customers');
  };

  return (
    <div className="rounded-xl p-4 mt-2" style={{ background: '#1a0a0a', border: '1px solid #7f1d1d' }}>
      <div className="font-bold text-sm mb-1" style={{ color: '#ef4444' }}>⚠️ Danger Zone (Admin)</div>
      <div className="text-slate-400 text-xs mb-3">
        Deleting this project permanently removes it and all its installments, steps, documents and notes. This cannot be undone.
      </div>
      {!confirming ? (
        <button className="ve-btn" style={{ borderColor: '#7f1d1d', color: '#ef4444' }} onClick={() => setConfirming(true)}>
          🗑️ Delete this project
        </button>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-slate-300">Delete <b>{project.customer_name}</b> permanently?</span>
          <button className="ve-btn ve-btn-primary" disabled={busy} onClick={del}>{busy ? 'Deleting…' : 'Yes, delete'}</button>
          <button className="ve-btn" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// ── building blocks ───────────────────────────────────────────────────────────

function Card({ title, children, note }: { title: string; children: React.ReactNode; note?: boolean }) {
  return (
    <div
      className="rounded-xl p-4"
      style={note ? { background: '#1c1708', border: '1px solid #a16207', borderLeft: '4px solid #f59e0b' } : { background: '#0d1a2e', border: '1px solid #16304d' }}
    >
      <div className="font-bold text-slate-200 mb-3 text-[0.92rem]">{title}</div>
      {children}
    </div>
  );
}

function KV({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="mb-2">
      <div className="text-slate-500 text-[0.68rem] uppercase tracking-wide">{label}</div>
      <div className="font-semibold text-[0.9rem] mt-0.5" style={{ color: color ?? '#f1f5f9' }}>{value}</div>
    </div>
  );
}

function ProgressDonut({ progress }: { progress: number }) {
  return (
    <div className="flex flex-col items-center">
      <div className="rounded-full flex items-center justify-center" style={{ width: 104, height: 104, background: `conic-gradient(#22c55e ${progress}%, #1e293b 0)` }}>
        <div className="rounded-full flex flex-col items-center justify-center" style={{ width: 78, height: 78, background: '#0d1a2e' }}>
          <div className="text-lg font-extrabold text-slate-100">{progress}%</div>
          <div className="text-[0.55rem] text-slate-500">Complete</div>
        </div>
      </div>
      <div className="text-slate-500 text-[0.6rem] mt-1.5">Overall Progress</div>
    </div>
  );
}

function Toggle({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button className="text-slate-400 text-xs hover:text-slate-200" onClick={() => setOpen((o) => !o)}>
        {open ? '▾' : '▸'} {label}
      </button>
      {open && <div className="mt-2 space-y-2">{children}</div>}
    </div>
  );
}

function statusPill(status?: string | null) {
  const s = (status || '').toLowerCase();
  if (s === 'completed') return <span className="ve-badge" style={{ background: '#16a34a22', color: '#22c55e', border: '1px solid #16a34a' }}>Completed</span>;
  if (s === 'cancelled' || s === 'rejected') return <span className="ve-badge" style={{ background: '#dc262622', color: '#ef4444', border: '1px solid #dc2626' }}>Cancelled</span>;
  return <span className="ve-badge" style={{ background: '#2563eb22', color: '#3b82f6', border: '1px solid #2563eb' }}>In Progress</span>;
}

// ── Subsidy ───────────────────────────────────────────────────────────────────
function SubsidyCard({ project, onSaved }: { project: Project; onSaved: () => Promise<void> }) {
  const isDisb = (project.subsidy_status || 'pending').toLowerCase() === 'disbursed';
  const [amt, setAmt] = useState(String(num(project.subsidy_amount)));
  const [applied, setApplied] = useState(!!project.subsidy_applied_date);
  const [disb, setDisb] = useState(isDisb);

  // Subsidy is tracked for information only. The government pays it directly to
  // the customer, so it is never money we received — recording it must not touch
  // amount_paid, balance, or create an installment.
  const save = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const payload: Partial<Project> = { subsidy_amount: num(amt) };
    if (applied) payload.subsidy_applied_date = project.subsidy_applied_date || today;

    if (disb) {
      payload.subsidy_status = 'disbursed';
      payload.subsidy_disbursed_date = project.subsidy_disbursed_date || today;
    } else {
      payload.subsidy_status = applied ? 'applied' : 'pending';
    }

    await updateProject(project.id, payload);
    await logActivity({
      action: 'Subsidy updated' + (disb ? ' → disbursed' : ''),
      entity_type: 'project',
      project_id: project.id,
      project_name: project.customer_name,
    });
    await onSaved();
  };

  return (
    <Card title="🏛️ SUBSIDY INFORMATION">
      <KV label="Amount Expected" value={formatCurrency(num(project.subsidy_amount))} color="#f59e0b" />
      <KV label="Applied" value={project.subsidy_applied_date ? `✅ Yes (${fmtDate(project.subsidy_applied_date)})` : '❌ No'} />
      <KV label="Disbursed" value={isDisb ? `✅ Yes (${fmtDate(project.subsidy_disbursed_date)})` : '❌ Not yet'} />
      <Toggle label="✏️ Update Subsidy">
        <input className="ve-input" type="number" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="Subsidy amount (₹)" />
        <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={applied} onChange={(e) => setApplied(e.target.checked)} /> Applied for subsidy</label>
        <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={disb} onChange={(e) => setDisb(e.target.checked)} /> Disbursed</label>
        <button className="ve-btn ve-btn-primary w-full" onClick={save}>💾 Save Subsidy</button>
      </Toggle>
    </Card>
  );
}

// ── Customer info ─────────────────────────────────────────────────────────────
function CustomerInfo({ project, onSaved }: { project: Project; onSaved: () => Promise<void> }) {
  // Customer name is intentionally NOT editable here — it's locked after creation.
  const [v, setV] = useState({
    mobile: project.mobile || '',
    alt_mobile: project.alt_mobile || '',
    email: project.email || '',
    aadhar_number: project.aadhar_number || '',
    pan_number: project.pan_number || '',
    electricity_bill_id: project.electricity_bill_id || '',
  });
  const s = (k: keyof typeof v, val: string) => setV((p) => ({ ...p, [k]: val }));
  const save = async () => {
    await updateProject(project.id, v);
    await logActivity({ action: 'Edited customer info', entity_type: 'project', project_id: project.id, project_name: project.customer_name });
    await onSaved();
  };
  return (
    <Card title="👤 CUSTOMER INFORMATION">
      <div className="grid grid-cols-3 gap-x-4">
        <KV label="Customer Name 🔒" value={project.customer_name || '-'} />
        <KV label="Mobile Number" value={project.mobile || '-'} />
        <KV label="Email" value={project.email || '-'} />
        <KV label="Alternate Mobile" value={project.alt_mobile || '-'} />
        <KV label="Aadhar Number" value={project.aadhar_number || '-'} />
        <KV label="PAN Number" value={project.pan_number || '-'} />
      </div>
      <Toggle label="✏️ Edit Customer Information">
        <div className="text-[0.7rem] text-slate-500">🔒 Customer name is locked and cannot be changed.</div>
        {(Object.keys(v) as (keyof typeof v)[]).map((k) => (
          <input key={k} className="ve-input" value={v[k]} placeholder={k.replace(/_/g, ' ')} onChange={(e) => s(k, e.target.value)} />
        ))}
        <button className="ve-btn ve-btn-primary w-full" onClick={save}>💾 Save</button>
      </Toggle>
    </Card>
  );
}

// ── Project ID (editable: settable once by anyone; only admins can change it after) ──
function ProjectIdField({ project, isAdmin, onSaved }: { project: Project; isAdmin: boolean; onSaved: () => Promise<void> }) {
  const current = project.project_code?.trim() || '';
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(current);
  const [busy, setBusy] = useState(false);

  // already set → only admins may change it; blank → anyone may set it once
  const canEdit = current === '' || isAdmin;

  const save = async () => {
    const code = val.trim();
    if (!code) return;
    setBusy(true);
    await updateProject(project.id, { project_code: code });
    await logActivity({ action: `Set Project ID → ${code}`, entity_type: 'project', project_id: project.id, project_name: project.customer_name });
    setEditing(false);
    setBusy(false);
    await onSaved();
  };

  return (
    <div className="mb-2">
      <div className="text-slate-500 text-[0.68rem] uppercase tracking-wide">Project ID</div>
      {editing ? (
        <div className="flex gap-1 mt-1">
          <input className="ve-input py-1 text-sm" value={val} onChange={(e) => setVal(e.target.value)} placeholder="e.g. EPC-2026-001" />
          <button className="ve-btn ve-btn-primary px-2 py-1" disabled={busy} onClick={save}>Save</button>
          <button className="ve-btn px-2 py-1" onClick={() => { setEditing(false); setVal(current); }}>✕</button>
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-semibold text-[0.9rem]" style={{ color: '#f97316' }}>{current || '-'}</span>
          {canEdit && (
            <button className="text-slate-500 hover:text-slate-300 text-xs" onClick={() => setEditing(true)} title={current ? 'Edit Project ID' : 'Set Project ID'}>
              ✏️
            </button>
          )}
        </div>
      )}
      {current !== '' && !isAdmin && (
        <div className="text-[0.62rem] text-slate-600 mt-0.5">Locked — only an admin can change it.</div>
      )}
    </div>
  );
}

// ── Project info ──────────────────────────────────────────────────────────────
function ProjectInfo({ project, epcNames, onSaved }: { project: Project; epcNames: string[]; onSaved: () => Promise<void> }) {
  const [v, setV] = useState({
    system_size_kwp: String(num(project.system_size_kwp)),
    connection_type: project.connection_type || 'On-Grid',
    execution_partner: project.execution_partner || '',
    discom: project.discom || 'MSEDCL',
    bank_name: project.bank_name || '',
    loan_status: project.loan_status || '—',
    pstat: project.project_status === 'completed' ? 'Completed' : project.project_status === 'cancelled' ? 'Cancelled' : 'Active',
  });
  const s = (k: keyof typeof v, val: string) => setV((p) => ({ ...p, [k]: val }));
  const save = async () => {
    const map: Record<string, string> = { Active: 'in_progress', Completed: 'completed', Cancelled: 'cancelled' };
    await updateProject(project.id, {
      system_size_kwp: num(v.system_size_kwp),
      connection_type: v.connection_type,
      execution_partner: v.execution_partner,
      discom: v.discom,
      bank_name: v.bank_name,
      loan_status: v.loan_status,
      project_status: map[v.pstat],
    });
    await logActivity({ action: 'Edited project info', entity_type: 'project', project_id: project.id, project_name: project.customer_name });
    await onSaved();
  };
  return (
    <Card title="📋 PROJECT INFORMATION">
      <div className="grid grid-cols-3 gap-x-4">
        <KV label="System Size (kWp)" value={`${num(project.system_size_kwp)} kWp`} />
        <KV label="Connection Type" value={project.connection_type || '-'} />
        <KV label="Execution Partner" value={project.execution_partner || '-'} />
        <KV label="Discom" value={project.discom || 'MSEDCL'} />
        <KV label="Project Created On 🔒" value={fmtDate(project.created_at)} />
        <KV label="Project Status" value={statusPill(project.project_status)} />
      </div>
      <Toggle label="✏️ Edit Project Information">
        <div className="grid grid-cols-2 gap-2">
          <input className="ve-input" type="number" value={v.system_size_kwp} onChange={(e) => s('system_size_kwp', e.target.value)} placeholder="System Size" />
          <select className="ve-input" value={v.connection_type} onChange={(e) => s('connection_type', e.target.value)}>
            <option>On-Grid</option><option>Off-Grid</option><option>Hybrid</option>
          </select>
          <select className="ve-input" value={v.execution_partner} onChange={(e) => s('execution_partner', e.target.value)}>
            <option value="">— Execution Partner —</option>
            {(v.execution_partner && !epcNames.includes(v.execution_partner)
              ? [v.execution_partner, ...epcNames]
              : epcNames
            ).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <input className="ve-input" value={v.discom} onChange={(e) => s('discom', e.target.value)} placeholder="Discom" />
          <input className="ve-input" value={v.bank_name} onChange={(e) => s('bank_name', e.target.value)} placeholder="Bank Name" />
          <select className="ve-input" value={v.loan_status} onChange={(e) => s('loan_status', e.target.value)}>
            {['—', 'Applied', 'Approved', 'Disbursed', 'Rejected'].map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
        <select className="ve-input" value={v.pstat} onChange={(e) => s('pstat', e.target.value)}>
          <option>Active</option><option>Completed</option><option>Cancelled</option>
        </select>
        <button className="ve-btn ve-btn-primary w-full" onClick={save}>💾 Save</button>
      </Toggle>
    </Card>
  );
}

// ── Step updater ──────────────────────────────────────────────────────────────
function StepUpdater({ steps, project, onSaved }: { steps: ProjectStep[]; project: Project; onSaved: () => Promise<void> }) {
  const [idx, setIdx] = useState(0);
  const [status, setStatus] = useState('pending');
  const [sd, setSd] = useState('');
  const [ed, setEd] = useState('');
  const sel = steps[idx];

  useEffect(() => {
    if (sel) setStatus(sel.status);
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!sel?.id) return;
    const payload: Partial<ProjectStep> = {
      status,
      progress_percent: status === 'completed' ? 100 : status === 'in_progress' ? 50 : 0,
    };
    if (sd) payload.start_date = sd;
    if (ed) payload.end_date = ed;
    await updateStep(sel.id, payload);
    await logActivity({ action: `Workflow updated to ${sel.step_name} (${status})`, entity_type: 'step', project_id: project.id, project_name: project.customer_name });
    await onSaved();
  };

  return (
    <Toggle label="📈 Update Progress / Step Status">
      <select className="ve-input" value={idx} onChange={(e) => setIdx(Number(e.target.value))}>
        {steps.map((s, i) => (
          <option key={s.id} value={i}>{s.step_no}. {s.step_name}</option>
        ))}
      </select>
      <div className="grid grid-cols-3 gap-2">
        <select className="ve-input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">pending</option>
          <option value="in_progress">in_progress</option>
          <option value="completed">completed</option>
        </select>
        <input className="ve-input" type="date" value={sd} onChange={(e) => setSd(e.target.value)} />
        <input className="ve-input" type="date" value={ed} onChange={(e) => setEd(e.target.value)} />
      </div>
      <button className="ve-btn ve-btn-primary w-full" onClick={save}>💾 Update Step</button>
    </Toggle>
  );
}

// ── Financials ────────────────────────────────────────────────────────────────
const PAYMENT_TYPES = ['Advance Payment', 'Installment'];

function Financials({
  project,
  installments,
  isAdmin,
  onSaved,
}: {
  project: Project;
  installments: Installment[];
  isAdmin: boolean;
  onSaved: () => Promise<void>;
}) {
  const total = num(project.total_cost);
  // Subsidy rows are dropped entirely; of what remains, only paid rows count.
  const rows = countableInstallments(installments);
  const received = sumPaid(installments);
  const pending = rows.filter((i) => (i.status || '').toLowerCase() !== 'paid');
  const pendingSum = pending.reduce((s, i) => s + num(i.amount), 0);
  const due = total - received;
  const recPct = total ? Math.round((received / total) * 1000) / 10 : 0;
  const duePct = total ? Math.round((due / total) * 1000) / 10 : 0;
  const isLoan = (project.payment_mode || '').toUpperCase() === 'LOAN';

  const [ptype, setPtype] = useState(PAYMENT_TYPES[0]);
  const [amt, setAmt] = useState('');
  const [pdate, setPdate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (num(amt) <= 0) return;
    setBusy(true);
    const existing = await getInstallments(project.id);
    const nextNo = Math.max(0, ...existing.map((e) => e.installment_no ?? 0)) + 1;
    await addInstallment({ project_id: project.id, installment_no: nextNo, amount: num(amt), due_date: pdate, status: 'paid', payment_type: ptype });
    await recalcProjectFinancials(project.id, total);
    await logActivity({ action: `Payment: ${ptype}`, entity_type: 'installment', project_id: project.id, project_name: project.customer_name, details: `${formatCurrency(num(amt))} · ${pdate}` });
    setAmt('');
    setBusy(false);
    await onSaved();
  };

  return (
    <Card title="💰 FINANCIAL PROGRESS">
      <div className="grid grid-cols-2 gap-x-4">
        <TotalCostField project={project} isAdmin={isAdmin} onSaved={onSaved} />
        <KV label="Received Amount" value={`${formatCurrency(received)} (${recPct}%)`} color="#22c55e" />
        <KV label="Due Amount" value={`${formatCurrency(due)} (${duePct}%)`} color="#ef4444" />
        <KV label="Payment Mode" value={isLoan ? `Loan · ${project.loan_status || '—'}` : 'Cash'} />
      </div>
      {rows.length > 0 && (
        <div className="mt-2 pt-2" style={{ borderTop: '1px solid #16304d' }}>
          <div className="text-slate-500 text-[0.66rem] uppercase mb-1">Received breakdown</div>
          {rows.map((i) => (
            <InstallmentRow key={i.id} inst={i} project={project} total={total} isAdmin={isAdmin} onSaved={onSaved} />
          ))}
          {pendingSum > 0 && (
            <div className="text-[0.66rem] text-slate-500 mt-1.5 pt-1.5" style={{ borderTop: '1px dashed #16304d' }}>
              {pending.length} pending {pending.length === 1 ? 'installment' : 'installments'} totalling{' '}
              <b style={{ color: '#f59e0b' }}>{formatCurrency(pendingSum)}</b> — not counted as received until marked paid.
            </div>
          )}
        </div>
      )}
      <Toggle label="➕ Add Payment / Installment">
        <div className="grid grid-cols-3 gap-2">
          <select className="ve-input" value={ptype} onChange={(e) => setPtype(e.target.value)}>
            {PAYMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <input className="ve-input" type="number" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="Amount (₹)" />
          <input className="ve-input" type="date" value={pdate} onChange={(e) => setPdate(e.target.value)} />
        </div>
        <button className="ve-btn ve-btn-primary w-full" disabled={busy} onClick={add}>
          {busy ? 'Saving…' : '💾 Add Payment'}
        </button>
      </Toggle>
    </Card>
  );
}

/** Total Project Cost — read-only for employees, inline-editable for admins.
 *  Changing it re-derives Due from the installments that exist. */
function TotalCostField({ project, isAdmin, onSaved }: { project: Project; isAdmin: boolean; onSaved: () => Promise<void> }) {
  const total = num(project.total_cost);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(total));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const next = num(val);
    if (next < 0) return;
    setBusy(true);
    await updateProject(project.id, { total_cost: next });
    await recalcProjectFinancials(project.id, next);
    await logActivity({
      action: 'Total project cost updated',
      entity_type: 'project',
      project_id: project.id,
      project_name: project.customer_name,
      details: `${formatCurrency(total)} → ${formatCurrency(next)}`,
    });
    setEditing(false);
    setBusy(false);
    await onSaved();
  };

  return (
    <div className="mb-2">
      <div className="text-slate-500 text-[0.68rem] uppercase tracking-wide">Total Project Cost</div>
      {editing ? (
        <div className="flex gap-1 mt-1">
          <input className="ve-input py-1 text-sm" type="number" value={val} autoFocus onChange={(e) => setVal(e.target.value)} />
          <button className="ve-btn ve-btn-primary px-2 py-1" disabled={busy} onClick={save}>{busy ? '…' : 'Save'}</button>
          <button className="ve-btn px-2 py-1" disabled={busy} onClick={() => { setEditing(false); setVal(String(total)); }}>✕</button>
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-semibold text-[0.9rem]" style={{ color: '#3b82f6' }}>{formatCurrency(total)}</span>
          {isAdmin && (
            <button className="text-slate-500 hover:text-slate-300 text-xs" onClick={() => setEditing(true)} title="Edit total project cost">✏️</button>
          )}
        </div>
      )}
    </div>
  );
}

/** One row of the received breakdown. Admins can edit or delete it; either way
 *  Received and Due are re-derived from what is left. */
function InstallmentRow({
  inst,
  project,
  total,
  isAdmin,
  onSaved,
}: {
  inst: Installment;
  project: Project;
  total: number;
  isAdmin: boolean;
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState({
    payment_type: inst.payment_type || 'Installment',
    amount: String(num(inst.amount)),
    due_date: (inst.due_date || '').slice(0, 10),
    status: (inst.status || 'paid').toLowerCase() === 'paid' ? 'paid' : 'pending',
  });

  const save = async () => {
    setBusy(true);
    await updateInstallment(inst.id, {
      payment_type: v.payment_type,
      amount: num(v.amount),
      due_date: v.due_date || null,
      status: v.status,
    });
    await recalcProjectFinancials(project.id, total);
    await logActivity({
      action: 'Payment edited',
      entity_type: 'installment',
      project_id: project.id,
      project_name: project.customer_name,
      details: `${formatCurrency(num(inst.amount))} → ${formatCurrency(num(v.amount))}`,
    });
    setEditing(false);
    setBusy(false);
    await onSaved();
  };

  const del = async () => {
    setBusy(true);
    await deleteInstallment(inst.id);
    await recalcProjectFinancials(project.id, total);
    await logActivity({
      action: 'Payment deleted',
      entity_type: 'installment',
      project_id: project.id,
      project_name: project.customer_name,
      details: `${inst.payment_type || 'Installment'} · ${formatCurrency(num(inst.amount))}`,
    });
    setBusy(false);
    await onSaved();
  };

  const isPaid = (inst.status || '').toLowerCase() === 'paid';

  if (editing) {
    return (
      <div className="grid grid-cols-[1fr_1fr_1fr_0.8fr_auto_auto] gap-1 py-1 items-center">
        <select className="ve-input py-1 text-xs" value={v.payment_type} onChange={(e) => setV((p) => ({ ...p, payment_type: e.target.value }))}>
          {(PAYMENT_TYPES.includes(v.payment_type) ? PAYMENT_TYPES : [v.payment_type, ...PAYMENT_TYPES]).map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input className="ve-input py-1 text-xs" type="number" value={v.amount} onChange={(e) => setV((p) => ({ ...p, amount: e.target.value }))} />
        <input className="ve-input py-1 text-xs" type="date" value={v.due_date} onChange={(e) => setV((p) => ({ ...p, due_date: e.target.value }))} />
        <select className="ve-input py-1 text-xs" value={v.status} onChange={(e) => setV((p) => ({ ...p, status: e.target.value }))} title="Only paid counts as received">
          <option value="paid">paid</option>
          <option value="pending">pending</option>
        </select>
        <button className="ve-btn ve-btn-primary px-2 py-1 text-xs" disabled={busy} onClick={save}>{busy ? '…' : 'Save'}</button>
        <button className="ve-btn px-2 py-1 text-xs" disabled={busy} onClick={() => setEditing(false)}>✕</button>
      </div>
    );
  }

  return (
    <div className="text-[0.72rem] text-slate-400 py-0.5 flex items-center gap-1.5">
      <span className="text-slate-300">{inst.payment_type || 'Installment'}</span> ·{' '}
      <span className="font-semibold" style={{ color: isPaid ? '#4ade80' : '#f59e0b' }}>{formatCurrency(num(inst.amount))}</span> ·{' '}
      <span className="text-slate-500">{fmtDate(inst.due_date)}</span>
      {!isPaid && <span className="ve-badge" style={{ background: '#f59e0b22', color: '#f59e0b', fontSize: '0.6rem' }}>pending</span>}
      {isAdmin && !confirming && (
        <span className="ml-auto flex gap-1.5">
          <button className="text-slate-600 hover:text-slate-300" onClick={() => setEditing(true)} title="Edit this payment">✏️</button>
          <button className="text-slate-600 hover:text-red-400" onClick={() => setConfirming(true)} title="Delete this payment">🗑️</button>
        </span>
      )}
      {isAdmin && confirming && (
        <span className="ml-auto flex gap-1.5 items-center">
          <span className="text-red-400">Delete?</span>
          <button className="text-red-400 font-bold" disabled={busy} onClick={del}>Yes</button>
          <button className="text-slate-400" disabled={busy} onClick={() => setConfirming(false)}>No</button>
        </span>
      )}
    </div>
  );
}

// ── Documents ─────────────────────────────────────────────────────────────────
function Documents({ docs, project, onSaved }: { docs: ProjectDocument[]; project: Project; onSaved: () => Promise<void> }) {
  const toggle = async (doc: ProjectDocument) => {
    const next = doc.status === 'uploaded' ? 'pending' : 'uploaded';
    await updateDoc(doc.id, next);
    await logActivity({ action: `Document '${doc.doc_name}' → ${next}`, entity_type: 'document', project_id: project.id, project_name: project.customer_name });
    await onSaved();
  };
  return (
    <Card title="📄 DOCUMENTS CHECKLIST">
      {docs.map((doc, i) => {
        const up = doc.status === 'uploaded';
        return (
          <div key={doc.id} className="flex justify-between items-center py-1.5" style={{ borderBottom: '1px solid #16304d' }}>
            <span className="text-slate-300 text-[0.78rem]">{i + 1}. {doc.doc_name}</span>
            <button className="ve-badge" style={{ background: up ? '#16a34a22' : '#dc262622', color: up ? '#22c55e' : '#ef4444' }} onClick={() => toggle(doc)} title="Toggle status">
              {up ? 'Uploaded' : 'Pending'}
            </button>
          </div>
        );
      })}
    </Card>
  );
}

// ── Internal notes ────────────────────────────────────────────────────────────
function InternalNotes({ notes, project, onSaved }: { notes: ProjectNote[]; project: Project; onSaved: () => Promise<void> }) {
  const [note, setNote] = useState('');
  const [action, setAction] = useState('');
  const latest = notes[0];
  const save = async () => {
    if (!note.trim()) return;
    await addProjectNote(project.id, note.trim(), action.trim());
    await logActivity({ action: 'Added note', entity_type: 'note', project_id: project.id, project_name: project.customer_name, details: note.trim().slice(0, 150) });
    setNote('');
    setAction('');
    await onSaved();
  };
  const del = async (nid: string) => {
    await deleteProjectNote(nid);
    await logActivity({ action: 'Deleted note', entity_type: 'note', project_id: project.id, project_name: project.customer_name });
    await onSaved();
  };
  return (
    <Card title="📝 INTERNAL NOTES" note>
      {latest ? (
        <div>
          <div className="text-[0.86rem] leading-relaxed font-medium" style={{ color: '#fef3c7' }}>{latest.note}</div>
          {latest.next_action && (
            <div className="mt-2 pl-2.5 text-[0.8rem]" style={{ borderLeft: '3px solid #f59e0b', color: '#fbbf24' }}>Next: {latest.next_action}</div>
          )}
          <div className="text-[0.68rem] mt-2" style={{ color: '#a16207' }}>Last note added: {fmtDateTime(latest.created_at)}</div>
        </div>
      ) : (
        <div className="text-[0.82rem]" style={{ color: '#a16207' }}>No notes yet — add one below.</div>
      )}
      <Toggle label="➕ Add / Edit Note">
        <textarea className="ve-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" />
        <input className="ve-input" value={action} onChange={(e) => setAction(e.target.value)} placeholder="Next Action" />
        <button className="ve-btn ve-btn-primary w-full" onClick={save}>💾 Save Note</button>
        {notes.length > 0 && (
          <div className="space-y-1 pt-1">
            {notes.map((n) => (
              <div key={n.id} className="flex justify-between items-start gap-2">
                <div>
                  <div className="text-[0.8rem] text-slate-300">{(n.note || '').slice(0, 80)}</div>
                  <div className="text-[0.66rem] text-slate-500">{fmtDateTime(n.created_at)}</div>
                </div>
                <button onClick={() => del(n.id)} title="Delete note">🗑️</button>
              </div>
            ))}
          </div>
        )}
      </Toggle>
    </Card>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────
function Timeline({ logs }: { logs: ActivityLog[] }) {
  return (
    <Card title="🕐 PROJECT TIMELINE">
      {logs.length === 0 ? (
        <div className="text-slate-600 text-[0.82rem]">No activity recorded yet.</div>
      ) : (
        logs.map((lg, i) => (
          <div key={i} className="relative pl-3.5 pb-3" style={{ borderLeft: '2px solid #2563eb' }}>
            <div className="absolute rounded-full" style={{ left: -5, top: 2, width: 8, height: 8, background: '#3b82f6' }} />
            <div className="text-[0.68rem] text-slate-400">{fmtDateTime(lg.created_at)}</div>
            <div className="text-[0.78rem] text-slate-200">{lg.action}</div>
            <div className="text-[0.66rem] text-slate-500">{lg.user_name || ''}</div>
          </div>
        ))
      )}
    </Card>
  );
}
