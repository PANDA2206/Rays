'use client';

// Admin Reports & Analytics — ported from streamlit_app/modules/reports.py.

import { useEffect, useMemo, useState } from 'react';
import { getProjects, getAllInstallments, getProjectSteps, getEpcs, getEpcTransactions } from '@/lib/db';
import type { Project, Epc, EpcTransaction, ProjectStep, Installment } from '@/lib/types';
import { formatCurrency, num } from '@/lib/format';
import { HBars } from '@/components/Charts';
import { Spinner } from '@/components/ui';
import { useFirm } from '@/lib/firm';

export default function ReportPage() {
  const { matches, firmId, firmName, isAll } = useFirm();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [insts, setInsts] = useState<Installment[]>([]);
  const [showStatement, setShowStatement] = useState(false);
  const [steps, setSteps] = useState<ProjectStep[]>([]);
  const [epcs, setEpcs] = useState<Epc[]>([]);
  const [etx, setEtx] = useState<EpcTransaction[]>([]);

  useEffect(() => {
    (async () => {
      const pr = await getProjects();
      setProjects(pr.filter(matches));
      setInsts(await getAllInstallments());
      setSteps(await getProjectSteps(pr.map((p) => p.id)));
      const e = await getEpcs();
      setEpcs(e.filter(matches));
      setEtx(await getEpcTransactions());
      setLoading(false);
    })();
  }, [firmId, isAll]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spinner />;
  if (projects.length === 0)
    return (
      <div>
        <div className="text-lg font-bold mb-2">📊 Admin Reports &amp; Analytics</div>
        <div className="ve-card text-slate-400 text-sm">No project data yet.</div>
      </div>
    );

  const total = projects.length;
  const totalCost = projects.reduce((s, p) => s + num(p.total_cost), 0);
  const totalPaid = projects.reduce((s, p) => s + num(p.amount_paid), 0);
  const balance = projects.reduce((s, p) => s + num(p.balance), 0);
  const collRate = totalCost ? Math.round((totalPaid / totalCost) * 1000) / 10 : 0;
  const active = projects.filter((p) => ['in_progress', 'planning', 'approved', 'on_hold'].includes(p.project_status)).length;
  const completed = projects.filter((p) => p.project_status === 'completed').length;

  const subExpected = projects.reduce((s, p) => s + num(p.subsidy_amount), 0);
  const subDisbAmt = projects.filter((p) => (p.subsidy_status || '').toLowerCase() === 'disbursed').reduce((s, p) => s + num(p.subsidy_amount), 0);
  const subPendAmt = subExpected - subDisbAmt;
  const subDisbCnt = projects.filter((p) => (p.subsidy_status || '').toLowerCase() === 'disbursed').length;
  const subPendCnt = projects.filter((p) => num(p.subsidy_amount) > 0 && (p.subsidy_status || '').toLowerCase() !== 'disbursed').length;

  // partner performance
  const pa: Record<string, { count: number; value: number; recv: number }> = {};
  for (const p of projects) {
    const ep = p.execution_partner || '—';
    if (!pa[ep]) pa[ep] = { count: 0, value: 0, recv: 0 };
    pa[ep].count += 1;
    pa[ep].value += num(p.total_cost);
    pa[ep].recv += num(p.amount_paid);
  }
  const partners = Object.keys(pa);

  // monthly
  const newByMonth: Record<string, number> = {};
  for (const p of projects) {
    const m = String(p.created_at || '').slice(0, 7);
    if (m) newByMonth[m] = (newByMonth[m] || 0) + 1;
  }
  const collByMonth: Record<string, number> = {};
  for (const i of insts) {
    if (i.status === 'paid' && i.due_date) {
      const m = String(i.due_date).slice(0, 7);
      collByMonth[m] = (collByMonth[m] || 0) + num(i.amount);
    }
  }
  const months = Array.from(new Set([...Object.keys(newByMonth), ...Object.keys(collByMonth)])).sort().slice(-12);

  // pipeline
  const byProj: Record<string, ProjectStep[]> = {};
  for (const s of steps) {
    (byProj[s.project_id] ||= []).push(s);
  }
  const stageCount: Record<string, number> = {};
  for (const pid of Object.keys(byProj)) {
    const slist = byProj[pid].sort((a, b) => (a.step_no || 0) - (b.step_no || 0));
    const cur = slist.find((s) => s.status === 'in_progress') || slist.find((s) => s.status === 'pending');
    const key = cur ? cur.step_name || '—' : '✅ Completed';
    stageCount[key] = (stageCount[key] || 0) + 1;
  }

  // EPC GST summary
  const gstRows = epcs.map((e) => {
    const pg = etx.filter((t) => t.epc_id === e.id).reduce((s, t) => s + (num(t.purchase_base) * num(t.purchase_gst_pct)) / 100, 0);
    const sg = etx.filter((t) => t.epc_id === e.id).reduce((s, t) => s + (num(t.sale_base) * num(t.sale_gst_pct)) / 100, 0);
    const pend = sg - pg;
    const recv = num(e.gst_received);
    return { epc: e.name, pg, sg, pend, recv, bal: pend - recv };
  });

  // financial summary by status
  const byStatus: Record<string, { count: number; cost: number; paid: number; bal: number }> = {};
  for (const p of projects) {
    const st = p.project_status;
    if (!byStatus[st]) byStatus[st] = { count: 0, cost: 0, paid: 0, bal: 0 };
    byStatus[st].count += 1;
    byStatus[st].cost += num(p.total_cost);
    byStatus[st].paid += num(p.amount_paid);
    byStatus[st].bal += num(p.balance);
  }

  const exportReport = () => {
    const cols = ['customer_name', 'project_code', 'execution_partner', 'system_size_kwp', 'project_status', 'total_cost', 'amount_paid', 'balance', 'subsidy_amount', 'subsidy_status'];
    const header = cols.join(',') + '\n';
    const body = projects
      .map((p) => cols.map((c) => `"${(p as unknown as Record<string, unknown>)[c] ?? ''}"`).join(','))
      .join('\n');
    downloadCsv('voltedge_admin_report.csv', header + body);
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-lg font-bold">📊 Admin Reports &amp; Analytics <span className="ve-badge ml-2 align-middle" style={{ background: '#16304d', color: '#93c5fd', fontWeight: 700 }}>{firmName}</span></div>
        <div className="text-slate-500 text-sm">Company-wide financials, pipeline, subsidies and execution-partner performance.</div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Total Project Value" value={formatCurrency(totalCost)} sub={`${total} projects`} color="#3b82f6" />
        <Kpi
          label="Amount Received"
          value={formatCurrency(totalPaid)}
          sub={`Collection ${collRate}% · click for statement`}
          color="#22c55e"
          onClick={() => setShowStatement((s) => !s)}
          active={showStatement}
        />
        <Kpi label="Outstanding Due" value={formatCurrency(balance)} sub="to be collected" color="#ef4444" />
        <Kpi label="Avg Project Value" value={formatCurrency(total ? totalCost / total : 0)} sub="per project" color="#a78bfa" />
        <Kpi label="Active Projects" value={String(active)} sub="in pipeline" color="#3b82f6" />
        <Kpi label="Completed" value={String(completed)} sub={`${total ? Math.round((completed / total) * 1000) / 10 : 0}% of all`} color="#22c55e" />
        <Kpi label="Subsidy Disbursed" value={formatCurrency(subDisbAmt)} sub={`${subDisbCnt} projects`} color="#22c55e" />
        <Kpi label="Subsidy Pending" value={formatCurrency(subPendAmt)} sub={`${subPendCnt} projects`} color="#f59e0b" />
      </div>

      {showStatement && (
        <ReceiptStatement projects={projects} insts={insts} />
      )}

      <Panel title="Execution Partner Performance">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-slate-400 text-xs mb-2">Projects per Partner</div>
            <HBars items={partners.map((e) => ({ label: e, value: pa[e].count }))} color="#8b5cf6" />
          </div>
          <div>
            <div className="text-slate-400 text-xs mb-2">Value Received per Partner</div>
            <HBars items={partners.map((e) => ({ label: e, value: Math.round(pa[e].recv) }))} color="#22c55e" />
          </div>
        </div>
      </Panel>

      <Panel title="Monthly — New Projects & Collections">
        {months.length === 0 ? (
          <div className="text-slate-500 text-sm">Not enough dated data for monthly trends yet.</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="text-slate-400 text-xs mb-2">New Projects / month</div>
              <HBars items={months.map((m) => ({ label: m, value: newByMonth[m] || 0 }))} color="#3b82f6" />
            </div>
            <div>
              <div className="text-slate-400 text-xs mb-2">Collections / month (₹)</div>
              <HBars items={months.map((m) => ({ label: m, value: Math.round(collByMonth[m] || 0) }))} color="#22c55e" />
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Pipeline — Projects by Current Stage">
        {Object.keys(stageCount).length === 0 ? (
          <div className="text-slate-500 text-sm">No workflow data yet.</div>
        ) : (
          <HBars items={Object.entries(stageCount).map(([l, v]) => ({ label: l, value: v }))} color="#f59e0b" />
        )}
      </Panel>

      <Panel title="EPC GST Summary">
        {gstRows.length === 0 ? (
          <div className="text-slate-500 text-sm">No EPC data yet — add EPCs in the EPC Partners page.</div>
        ) : (
          <Table
            head={['EPC', 'Purchase GST', 'Sales GST', 'GST Pending', 'Received', 'Balance']}
            rows={gstRows.map((r) => [r.epc ?? '-', formatCurrency(r.pg), formatCurrency(r.sg), formatCurrency(r.pend), formatCurrency(r.recv), formatCurrency(r.bal)])}
          />
        )}
      </Panel>

      <Panel title="Financial Summary by Status">
        <Table
          head={['Status', 'Count', 'Total Cost', 'Amount Paid', 'Balance']}
          rows={Object.entries(byStatus).map(([st, d]) => [st, String(d.count), formatCurrency(d.cost), formatCurrency(d.paid), formatCurrency(d.bal)])}
        />
        <button className="ve-btn w-full mt-3" onClick={exportReport}>⬇️ Export Full Project Report (CSV)</button>
      </Panel>
    </div>
  );
}

/**
 * Bank-statement style ledger of every payment actually received, so the
 * "Amount Received" figure can be tallied line by line. Filterable by execution
 * partner (EPC) and by date. Subsidy rows are excluded for the same reason they
 * are excluded everywhere: that money never reached us.
 */
function ReceiptStatement({ projects, insts }: { projects: Project[]; insts: Installment[] }) {
  const [epcFilter, setEpcFilter] = useState('All');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const projById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);

  const rows = useMemo(() => {
    const out = insts
      .filter((i) => (i.status || '').toLowerCase() === 'paid')
      .filter((i) => (i.payment_type || '').toLowerCase() !== 'subsidy')
      .map((i) => {
        const p = projById[i.project_id];
        return {
          id: i.id,
          date: String(i.due_date || '').slice(0, 10),
          customer: p?.customer_name || '(unknown project)',
          epc: p?.execution_partner || '—',
          type: i.payment_type || 'Installment',
          amount: num(i.amount),
        };
      })
      .filter((r) => (epcFilter === 'All' ? true : r.epc === epcFilter))
      .filter((r) => (from ? r.date >= from : true))
      .filter((r) => (to ? r.date <= to : true));
    // newest first, like a bank statement
    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return out;
  }, [insts, projById, epcFilter, from, to]);

  const shownTotal = rows.reduce((s, r) => s + r.amount, 0);

  // every partner that actually has a received payment, plus any on projects
  const epcOptions = useMemo(
    () => Array.from(new Set(projects.map((p) => p.execution_partner || '—'))).sort(),
    [projects]
  );

  const exportCsv = () => {
    const header = 'Date,Customer,EPC Partner,Type,Amount\n';
    const body = rows
      .map((r) => [r.date, r.customer, r.epc, r.type, r.amount].map((x) => `"${x ?? ''}"`).join(','))
      .join('\n');
    downloadCsv('voltedge_received_statement.csv', header + body + `\n\nTotal,,,,${shownTotal.toFixed(2)}\n`);
  };

  return (
    <Panel title="🧾 Amount Received — Statement">
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div>
          <label className="ve-label">EPC Partner</label>
          <select className="ve-input" value={epcFilter} onChange={(e) => setEpcFilter(e.target.value)}>
            <option value="All">All partners</option>
            {epcOptions.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div>
          <label className="ve-label">From</label>
          <input className="ve-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="ve-label">To</label>
          <input className="ve-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {(epcFilter !== 'All' || from || to) && (
          <button className="ve-btn" onClick={() => { setEpcFilter('All'); setFrom(''); setTo(''); }}>Clear</button>
        )}
        <button className="ve-btn ml-auto" onClick={exportCsv}>⬇️ Export CSV</button>
      </div>

      <div className="text-slate-400 text-sm mb-2">
        {rows.length} {rows.length === 1 ? 'entry' : 'entries'} · total{' '}
        <b style={{ color: '#22c55e' }}>{formatCurrency(shownTotal)}</b>
      </div>

      {rows.length === 0 ? (
        <div className="text-slate-500 text-sm">No payments received for this filter.</div>
      ) : (
        <div className="overflow-x-auto" style={{ maxHeight: 460, overflowY: 'auto' }}>
          <table className="w-full text-[0.78rem]">
            <thead>
              <tr className="text-slate-500 text-left" style={{ background: '#0f1b2e' }}>
                {['Date', 'Customer', 'EPC Partner', 'Type', 'Amount'].map((h) => (
                  <th key={h} className="px-2 py-2 font-bold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid #1e293b' }}>
                  <td className="px-2 py-1.5 text-slate-400 whitespace-nowrap">{r.date || '-'}</td>
                  <td className="px-2 py-1.5 font-semibold">{r.customer}</td>
                  <td className="px-2 py-1.5 text-slate-300">{r.epc}</td>
                  <td className="px-2 py-1.5 text-slate-400">{r.type}</td>
                  <td className="px-2 py-1.5 font-semibold" style={{ color: '#22c55e' }}>{formatCurrency(r.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #16304d' }}>
                <td className="px-2 py-2 font-bold text-slate-300" colSpan={4}>Total</td>
                <td className="px-2 py-2 font-extrabold" style={{ color: '#22c55e' }}>{formatCurrency(shownTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Panel>
  );
}

function Kpi({
  label, value, sub, color, onClick, active,
}: {
  label: string; value: string; sub: string; color: string;
  onClick?: () => void; active?: boolean;
}) {
  const card = (
    <>
      <div className="text-slate-500 text-[0.7rem] uppercase tracking-wide">{label}</div>
      <div className="text-xl font-extrabold mt-1" style={{ color }}>{value}</div>
      <div className="text-slate-500 text-[0.7rem]">{sub}</div>
    </>
  );
  if (!onClick) {
    return (
      <div className="ve-card" style={{ background: '#0d1a2e', borderColor: '#16304d' }}>{card}</div>
    );
  }
  return (
    <button
      onClick={onClick}
      className="ve-card text-left w-full transition-colors hover:brightness-125 cursor-pointer"
      style={{ background: '#0d1a2e', borderColor: active ? color : '#16304d' }}
      title="Open the received-payments statement"
    >
      {card}
    </button>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ve-card">
      <div className="font-bold mb-3">{title}</div>
      {children}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[0.8rem]">
        <thead>
          <tr className="text-slate-500 text-left">
            {head.map((h) => (
              <th key={h} className="px-2 py-1.5 font-bold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: '1px solid #1e293b' }}>
              {r.map((c, j) => (
                <td key={j} className="px-2 py-1.5 whitespace-nowrap">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
