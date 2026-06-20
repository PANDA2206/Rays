'use client';

// Overview page — ported from the "Overview" section of Home.py.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  getProjects,
  getAllInstallments,
  getProjectSteps,
  getActivityLogs,
  getAppUsers,
} from '@/lib/db';
import type { Project, Installment, ProjectStep, ActivityLog, AppUser } from '@/lib/types';
import { formatCurrency, num, timeOfDay, timeAgo, STATUS_COLORS, STATUS_LABELS } from '@/lib/format';
import { StatCard } from '@/components/ui';
import { Donut, HBars } from '@/components/Charts';
import { Spinner } from '@/components/ui';

const ACTIVE_STATES = ['in_progress', 'planning', 'approved', 'on_hold'];

export default function OverviewPage() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [installments, setInstallments] = useState<
    Pick<Installment, 'project_id' | 'due_date' | 'status' | 'amount'>[]
  >([]);
  const [steps, setSteps] = useState<ProjectStep[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [allLogs, setAllLogs] = useState<ActivityLog[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [pr, inst, lg] = await Promise.all([
          getProjects(),
          getAllInstallments(),
          getActivityLogs(6),
        ]);
        setProjects(pr);
        setInstallments(inst);
        setLogs(lg);
        // load steps for all active projects so the (due-date-ordered) queue
        // always has stage/next-action data regardless of which 8 surface.
        const activeIds = pr
          .filter((p) => !['completed', 'cancelled'].includes(p.project_status))
          .map((p) => p.id);
        const st = await getProjectSteps(activeIds.length ? activeIds : pr.slice(0, 8).map((p) => p.id));
        setSteps(st);
        if (isAdmin) {
          const [us, al] = await Promise.all([getAppUsers(), getActivityLogs(500)]);
          setUsers(us);
          setAllLogs(al);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [isAdmin]);

  if (loading) return <Spinner />;

  // ── stats ──
  const total = projects.length;
  const active = projects.filter((p) => ACTIVE_STATES.includes(p.project_status)).length;
  const completed = projects.filter((p) => p.project_status === 'completed').length;
  const mon = new Date().toISOString().slice(0, 7);
  const completedMonth =
    projects.filter(
      (p) =>
        p.project_status === 'completed' &&
        String(p.updated_at || p.created_at || '').slice(0, 7) === mon
    ).length || completed;
  const subsidyPending = projects.filter(
    (p) => num(p.subsidy_amount) > 0 && (p.subsidy_status || 'pending') !== 'disbursed'
  ).length;
  const subsidyDisbursed = projects.filter(
    (p) => (p.subsidy_status || '').toLowerCase() === 'disbursed'
  ).length;
  const totalCost = projects.reduce((s, p) => s + num(p.total_cost), 0);
  const totalPaid = projects.reduce((s, p) => s + num(p.amount_paid), 0);
  const balanceDue = projects.reduce((s, p) => s + num(p.balance), 0);
  const compPct = total ? Math.round((completed / total) * 1000) / 10 : 0;

  // earliest pending installment due date per project
  const today = new Date().toISOString().slice(0, 10);
  const dueByProj: Record<string, string> = {};
  for (const i of installments) {
    if (i.status === 'pending' && i.due_date && i.project_id) {
      const d = String(i.due_date).slice(0, 10);
      if (!dueByProj[i.project_id] || d < dueByProj[i.project_id]) dueByProj[i.project_id] = d;
    }
  }

  // status counts for donut
  const statusCounts: Record<string, number> = {};
  for (const p of projects) {
    statusCounts[p.project_status] = (statusCounts[p.project_status] || 0) + 1;
  }
  const donutSlices = Object.entries(statusCounts).map(([s, v]) => ({
    label: STATUS_LABELS[s] ?? s,
    value: v,
    color: STATUS_COLORS[s] ?? '#94a3b8',
  }));

  // priority queue — active projects, ordered by soonest due date first (most
  // urgent at the top); projects with no due date fall to the bottom.
  const active_projects = projects.filter(
    (p) => !['completed', 'cancelled'].includes(p.project_status)
  );
  const queue = [...active_projects]
    .sort((a, b) => {
      const da = dueByProj[a.id];
      const db = dueByProj[b.id];
      if (da && db) return da.localeCompare(db);
      if (da) return -1;
      if (db) return 1;
      return 0; // keep the created_at order from getProjects()
    })
    .slice(0, 8);

  // current stage (in-progress step) and next action (first pending step)
  const stageByProj: Record<string, string> = {};
  const nextActionByProj: Record<string, string> = {};
  for (const p of queue) {
    const ps = steps.filter((s) => s.project_id === p.id).sort((a, b) => a.step_no - b.step_no);
    const cur = ps.find((s) => s.status === 'in_progress') || ps.find((s) => s.status === 'pending');
    if (cur) stageByProj[p.id] = cur.step_name;
    const firstPending = ps.find((s) => s.status === 'pending');
    if (firstPending) nextActionByProj[p.id] = firstPending.step_name;
  }

  // employee performance (admin)
  const empUsers = users.filter((u) => u.status === 'approved' && u.role !== 'admin');
  const pendingCount = users.filter((u) => u.status === 'pending').length;
  const byEmail: Record<string, { actions: number; projects: Set<string>; last: string | null }> = {};
  for (const lg of allLogs) {
    const em = lg.user_email;
    if (!em) continue;
    if (!byEmail[em]) byEmail[em] = { actions: 0, projects: new Set(), last: null };
    byEmail[em].actions += 1;
    if (lg.project_name) byEmail[em].projects.add(lg.project_name);
    if (!byEmail[em].last) byEmail[em].last = lg.created_at ?? null;
  }
  const perfRows = empUsers
    .map((u) => {
      const d = byEmail[u.email ?? ''] ?? { actions: 0, projects: new Set(), last: null };
      return {
        employee: u.name || u.email || '',
        code: u.employee_code || '-',
        actions: d.actions,
        touched: d.projects.size,
        last: d.last ? timeAgo(d.last) : '—',
      };
    })
    .sort((a, b) => b.actions - a.actions);

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-[2fr_1.35fr] gap-4">
        {/* left: stat cards + status chart */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon="💼" iconBg="#2563eb" value={active} label="Active Projects" sub="In Progress" />
            <StatCard icon="✅" iconBg="#16a34a" value={completedMonth} label="Completed" sub="This month" />
            <StatCard icon="🏛️" iconBg="#16a34a" value={subsidyDisbursed} label="Subsidy Disbursed" sub="Received" />
            <StatCard icon="⏳" iconBg="#f59e0b" value={subsidyPending} label="Subsidy" sub="Pending" />
          </div>

          {donutSlices.length > 0 && (
            <div className="ve-card">
              <div className="font-bold text-[0.9rem] text-slate-200 mb-2">📊 PROJECTS BY STATUS</div>
              <Donut slices={donutSlices} centerTop={String(total)} centerBottom="Total" size={200} />
            </div>
          )}
        </div>

        {/* right: recent activity */}
        <div className="ve-card">
          <div className="font-bold text-[0.9rem] text-slate-200 mb-3">📋 RECENT ACTIVITY</div>
          {logs.length === 0 ? (
            <div className="text-slate-600 text-sm">No recent activity.</div>
          ) : (
            <div className="space-y-1">
              {logs.map((lg, i) => {
                const dot = ['#22c55e', '#3b82f6', '#f59e0b', '#22c55e', '#8b5cf6', '#ef4444'][i % 6];
                return (
                  <div key={i} className="flex gap-2.5 items-start py-1.5">
                    <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: dot }} />
                    <div>
                      <span className="text-slate-400 text-[0.72rem]">{timeOfDay(lg.created_at)}</span>
                      <div className="text-slate-300 text-[0.78rem]">
                        {lg.action}
                        {lg.project_name ? ` for ${lg.project_name}` : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* priority queue */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="font-bold text-[0.95rem] text-slate-200">🗂️ MY PRIORITY QUEUE</div>
          <button onClick={() => router.push('/customers')} className="ve-btn text-xs">
            View All Projects ›
          </button>
        </div>
        <div className="ve-panel overflow-hidden">
          <div className="grid grid-cols-[1.2fr_1.5fr_1.3fr_1.5fr_1.5fr_1fr_0.4fr] px-3.5 py-2.5 text-[0.68rem] font-bold text-slate-500 uppercase" style={{ background: '#0f1b2e' }}>
            <span>Project ID</span><span>Customer</span><span>Mobile</span><span>Current Stage</span><span>Next Action</span><span>Due Date</span><span />
          </div>
          {queue.length === 0 ? (
            <div className="p-4 text-slate-500 text-sm">No projects yet. Add one in Add Project.</div>
          ) : (
            queue.map((p) => {
              const code = p.project_code?.trim() || '-';
              const stage = stageByProj[p.id] || STATUS_LABELS[p.project_status] || '—';
              // Next action = the next pending workflow step (or '—' when none)
              const nxt = nextActionByProj[p.id] || '—';
              const due = dueByProj[p.id] || '—';
              return (
                <div key={p.id} className="grid grid-cols-[1.2fr_1.5fr_1.3fr_1.5fr_1.5fr_1fr_0.4fr] px-3.5 py-2.5 items-center text-[0.78rem]" style={{ borderTop: '1px solid #1e293b' }}>
                  <span className="text-blue-400 font-semibold">{code}</span>
                  <span>{p.customer_name}</span>
                  <span className="text-slate-400">📞 {p.mobile || '-'}</span>
                  <span>{stage}</span>
                  <span className="text-slate-300">{nxt}</span>
                  <span style={{ color: due === today ? '#ef4444' : due !== '—' ? '#f59e0b' : '#64748b', fontWeight: due === today ? 700 : 400 }}>
                    {due === today ? 'Today' : due}
                  </span>
                  <button onClick={() => router.push(`/projects/${p.id}`)} title="Open project">📂</button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* admin insights */}
      {isAdmin && (
        <div className="space-y-4 pt-2">
          <hr style={{ borderColor: '#16304d' }} />
          <div className="text-lg font-bold">🛡️ Admin Insights</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon="💰" iconBg="#2563eb" value={formatCurrency(totalCost)} label="Total Project Value" sub={`${total} projects`} />
            <StatCard icon="✅" iconBg="#16a34a" value={formatCurrency(totalPaid)} label="Amount Received" sub={`Collection ${totalCost ? Math.round((totalPaid / totalCost) * 1000) / 10 : 0}%`} />
            <StatCard icon="⏳" iconBg="#dc2626" value={formatCurrency(balanceDue)} label="Outstanding Due" sub="to be collected" />
            <StatCard icon="📈" iconBg="#a78bfa" value={`${compPct}%`} label="Completion Rate" sub={`${completed} done`} />
          </div>

          <div className="font-bold">👷 Employee Performance</div>
          {pendingCount > 0 && (
            <div className="p-3 rounded-lg text-sm" style={{ background: '#422006', color: '#fbbf24' }}>
              🔔 {pendingCount} user(s) awaiting approval — see the Users page.
            </div>
          )}
          {perfRows.length === 0 ? (
            <div className="text-slate-500 text-sm">No approved employees yet.</div>
          ) : (
            <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4">
              <div className="ve-panel overflow-hidden">
                <div className="grid grid-cols-[2fr_1fr_1fr_1.2fr_1.2fr] px-3 py-2 text-[0.68rem] font-bold text-slate-500 uppercase" style={{ background: '#0f1b2e' }}>
                  <span>Employee</span><span>Code</span><span>Actions</span><span>Projects</span><span>Last Active</span>
                </div>
                {perfRows.map((r, i) => (
                  <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1.2fr_1.2fr] px-3 py-2 text-[0.78rem] items-center" style={{ borderTop: '1px solid #1e293b' }}>
                    <span className="truncate">{r.employee}</span>
                    <span className="text-slate-400">{r.code}</span>
                    <span>{r.actions}</span>
                    <span>{r.touched}</span>
                    <span className="text-slate-400">{r.last}</span>
                  </div>
                ))}
              </div>
              <div className="ve-card">
                <HBars items={perfRows.slice(0, 8).map((r) => ({ label: r.employee, value: r.actions }))} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
