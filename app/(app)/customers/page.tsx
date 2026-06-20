'use client';

// Customer List — ported from the "Customer List" section of Home.py.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getProjects,
  updateProject,
  getInstallments,
  addInstallment,
  logActivity,
} from '@/lib/db';
import type { Project } from '@/lib/types';
import { num } from '@/lib/format';
import { StatusBadge, Spinner } from '@/components/ui';

const PAGE_SIZE = 20;

export default function CustomerListPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [qePid, setQePid] = useState<string | null>(null);

  const reload = async () => {
    setProjects(await getProjects());
  };

  useEffect(() => {
    (async () => {
      await reload();
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    let rows = [...projects];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) =>
        [
          r.customer_name,
          r.mobile,
          r.project_code,
          r.execution_partner,
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      );
    }
    if (statusFilter === 'Active')
      rows = rows.filter((r) =>
        ['planning', 'approved', 'in_progress', 'on_hold'].includes(r.project_status)
      );
    else if (statusFilter === 'Completed') rows = rows.filter((r) => r.project_status === 'completed');
    else if (statusFilter === 'Cancelled') rows = rows.filter((r) => r.project_status === 'cancelled');

    rows.sort((a, b) =>
      sortDir === 'asc' ? num(a.balance) - num(b.balance) : num(b.balance) - num(a.balance)
    );
    return rows;
  }, [projects, search, statusFilter, sortDir]);

  // reset to page 1 when filters change
  useEffect(() => setPage(1), [search, statusFilter, sortDir]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pg = Math.min(Math.max(1, page), pages);
  const start = (pg - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);

  const qeProj = qePid ? projects.find((p) => p.id === qePid) ?? null : null;

  if (loading) return <Spinner />;

  return (
    <div>
      {/* top bar */}
      <div className="grid md:grid-cols-[1.2fr_2.5fr_1.5fr] gap-3 mb-3">
        <button onClick={() => router.push('/customers/new')} className="ve-btn ve-btn-primary">
          ＋ Add New Project
        </button>
        <input
          className="ve-input"
          placeholder="🔍  Search Customer Name / Mobile / Project ID / EPC Name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="ve-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option>All Status</option>
          <option>Active</option>
          <option>Completed</option>
          <option>Cancelled</option>
        </select>
      </div>

      <div className="text-slate-500 text-sm mb-1.5">Total: {filtered.length} Projects</div>

      <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
        {/* list */}
        <div>
          <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_0.9fr_0.9fr_0.4fr] px-2 pb-1.5 text-[0.7rem] font-bold" style={{ color: '#f97316' }}>
            <span>PROJECT NAME</span>
            <span>PROJECT ID</span>
            <span>MOBILE</span>
            <span>EPC NAME</span>
            <button onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))} className="text-left" style={{ color: '#f97316' }}>
              DUE AMOUNT {sortDir === 'desc' ? '▼' : '▲'}
            </button>
            <span>STATUS</span>
            <span>ACTION</span>
          </div>

          {pageRows.length === 0 ? (
            <div className="ve-card text-slate-500 text-sm">No projects found.</div>
          ) : (
            pageRows.map((row) => (
              <div key={row.id} className="grid grid-cols-[1.6fr_1fr_1fr_1fr_0.9fr_0.9fr_0.4fr] px-2 py-2 items-center" style={{ borderBottom: '1px solid #1e293b' }}>
                <button className="ve-link text-[0.82rem] font-semibold" onClick={() => setQePid(row.id)} title="Quick Edit">
                  {row.customer_name || '(no name)'}
                </button>
                <span className="text-[0.75rem] text-slate-400">{row.project_code?.trim() || '-'}</span>
                <span className="text-[0.75rem]">{row.mobile || '-'}</span>
                <span className="text-[0.75rem] text-slate-500">{row.execution_partner?.trim() || '-'}</span>
                <span className="text-[0.8rem] font-semibold">₹ {num(row.balance).toLocaleString('en-IN')}</span>
                <span><StatusBadge status={row.project_status} /></span>
                <button onClick={() => router.push(`/projects/${row.id}`)} title="Open full details">📂</button>
              </div>
            ))
          )}

          {pages > 1 && (
            <div className="mt-3">
              <div className="text-slate-500 text-xs mb-1">
                Showing {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length} · Page {pg} of {pages}
              </div>
              <div className="flex gap-1 flex-wrap">
                <button className="ve-btn px-3 py-1" disabled={pg <= 1} onClick={() => setPage(pg - 1)}>‹</button>
                {pageWindow(pg, pages).map((n) => (
                  <button key={n} className={`ve-btn px-3 py-1 ${n === pg ? 've-btn-primary' : ''}`} onClick={() => setPage(n)}>
                    {n}
                  </button>
                ))}
                <button className="ve-btn px-3 py-1" disabled={pg >= pages} onClick={() => setPage(pg + 1)}>›</button>
              </div>
            </div>
          )}
        </div>

        {/* quick edit */}
        <QuickEdit project={qeProj} onChanged={reload} />
      </div>
    </div>
  );
}

function pageWindow(pg: number, pages: number): number[] {
  const win = 7;
  let lo = Math.max(1, pg - Math.floor(win / 2));
  const hi = Math.min(pages, lo + win - 1);
  lo = Math.max(1, hi - win + 1);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

function QuickEdit({ project, onChanged }: { project: Project | null; onChanged: () => Promise<void> }) {
  const [notes, setNotes] = useState('');
  const [paid, setPaid] = useState(0);
  const [payType, setPayType] = useState('Advance Payment');
  const [payAmt, setPayAmt] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNotes(String(project?.notes ?? ''));
    if (project) {
      getInstallments(project.id).then((ins) =>
        setPaid(ins.reduce((s, i) => s + num(i.amount), 0))
      );
    }
  }, [project]);

  if (!project) {
    return (
      <div className="ve-card" style={{ borderLeft: '3px solid #f97316' }}>
        <div className="font-bold mb-3">Quick Edit</div>
        <div className="text-center text-slate-600 py-3">
          <div className="text-2xl mb-2">📂</div>
          <div className="text-sm">Choose Project on Left<br />(click project name)</div>
        </div>
      </div>
    );
  }

  const total = num(project.total_cost);
  const due = total - paid;

  const setStatus = async (status: string, label: string) => {
    setBusy(true);
    await updateProject(project.id, { project_status: status });
    await logActivity({ action: `Status → ${label}`, entity_type: 'project', project_id: project.id, project_name: project.customer_name });
    await onChanged();
    setBusy(false);
  };

  const addPayment = async () => {
    const amt = num(payAmt);
    if (amt <= 0) return;
    setBusy(true);
    const existing = await getInstallments(project.id);
    const nextNo = Math.max(0, ...existing.map((e) => e.installment_no ?? 0)) + 1;
    await addInstallment({
      project_id: project.id,
      installment_no: nextNo,
      amount: amt,
      due_date: payDate,
      status: 'paid',
      payment_type: payType,
    });
    const newPaid = paid + amt;
    await updateProject(project.id, { amount_paid: newPaid, balance: total - newPaid });
    await logActivity({
      action: `Payment: ${payType}`,
      entity_type: 'installment',
      project_id: project.id,
      project_name: project.customer_name,
      details: `₹${amt.toLocaleString('en-IN')} · ${payDate}`,
    });
    setPayAmt('');
    await onChanged();
    setPaid(newPaid);
    setBusy(false);
  };

  const save = async () => {
    setBusy(true);
    await updateProject(project.id, { notes });
    await onChanged();
    setBusy(false);
  };

  const cur = project.project_status;
  const isDone = cur === 'completed';
  const isAct = ['planning', 'approved', 'in_progress', 'on_hold'].includes(cur);
  const isCan = cur === 'cancelled';

  return (
    <div className="ve-card" style={{ borderLeft: '3px solid #f97316' }}>
      <div className="font-bold mb-3">Quick Edit</div>
      <div className="font-semibold mb-2" style={{ color: '#f97316' }}>{project.customer_name}</div>

      <div className="ve-label">Status</div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <button className={`ve-btn ${isDone ? 've-btn-primary' : ''}`} disabled={busy} onClick={() => setStatus('completed', 'Completed')}>COMPLETED</button>
        <button className={`ve-btn ${isAct ? 've-btn-primary' : ''}`} disabled={busy} onClick={() => setStatus('in_progress', 'Active')}>ACTIVE</button>
        <button className={`ve-btn ${isCan ? 've-btn-primary' : ''}`} disabled={busy} onClick={() => setStatus('cancelled', 'Cancelled')}>CANCELLED</button>
      </div>

      <div className="ve-label">Notes</div>
      <textarea className="ve-input mb-3" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Enter notes about the project…" />

      <div className="ve-label">Add Payment / Installment</div>
      <div className="text-[0.7rem] text-slate-500 mb-1">
        Received: <b style={{ color: '#22c55e' }}>₹{paid.toLocaleString('en-IN')}</b> · Due:{' '}
        <b style={{ color: '#ef4444' }}>₹{due.toLocaleString('en-IN')}</b>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <select className="ve-input" value={payType} onChange={(e) => setPayType(e.target.value)}>
          <option>Advance Payment</option>
          <option>Installment</option>
          <option>Subsidy</option>
        </select>
        <input className="ve-input" type="number" placeholder="Amount (₹)" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} />
      </div>
      <input className="ve-input mb-2" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
      <button className="ve-btn w-full mb-3" disabled={busy} onClick={addPayment}>➕ Add Payment</button>

      <button className="ve-btn ve-btn-primary w-full" disabled={busy} onClick={save}>💾 Save Changes</button>
    </div>
  );
}
