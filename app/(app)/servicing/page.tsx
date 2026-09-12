'use client';

// Servicing — owner dashboard for AMC/post-installation service tracking.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFirm } from '@/lib/firm';
import {
  getProjects,
  getAmcServicesForProjects,
  getAmcServiceLogsForProjects,
  getAmcReminderLogsForProjects,
} from '@/lib/db';
import type { Project, ProjectAmcService, AmcServiceLog, AmcReminderLog } from '@/lib/types';
import {
  AMC_SERVICE_TYPES,
  AMC_SERVICE_LABELS,
  computeAmcStatus,
  queueBucket,
  type AmcServiceType,
  type AmcStatus,
} from '@/lib/amc';
import { StatCard, Spinner } from '@/components/ui';

interface QueueRow {
  project: Project;
  type: AmcServiceType;
  status: AmcStatus;
}

export default function ServicingPage() {
  const router = useRouter();
  const { matches } = useFirm();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [servicesByProject, setServicesByProject] = useState<Record<string, ProjectAmcService[]>>({});
  const [logsByProject, setLogsByProject] = useState<Record<string, AmcServiceLog[]>>({});
  const [remindersByProject, setRemindersByProject] = useState<Record<string, AmcReminderLog[]>>({});
  const [reminderCountThisMonth, setReminderCountThisMonth] = useState(0);
  const [filter, setFilter] = useState<'all' | 'overdue' | 'no_amc' | 'said_yes'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (projectId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  useEffect(() => {
    (async () => {
      const pr = (await getProjects()).filter(matches).filter((p) => p.project_status === 'completed');
      setProjects(pr);
      const ids = pr.map((p) => p.id);
      const [svcRows, logRows, remRows] = await Promise.all([
        getAmcServicesForProjects(ids),
        getAmcServiceLogsForProjects(ids),
        getAmcReminderLogsForProjects(ids),
      ]);

      const svcMap: Record<string, ProjectAmcService[]> = {};
      for (const s of svcRows) (svcMap[s.project_id] ??= []).push(s);
      setServicesByProject(svcMap);

      const logMap: Record<string, AmcServiceLog[]> = {};
      for (const l of logRows) (logMap[l.project_id] ??= []).push(l);
      setLogsByProject(logMap);

      const remMap: Record<string, AmcReminderLog[]> = {};
      for (const r of remRows) (remMap[r.project_id] ??= []).push(r);
      setRemindersByProject(remMap);

      const thisMonth = new Date().toISOString().slice(0, 7);
      setReminderCountThisMonth(remRows.filter((r) => (r.created_at || '').slice(0, 7) === thisMonth).length);

      setLoading(false);
    })();
  }, [matches]);

  if (loading) return <Spinner />;

  // Gap-fill: a project never opened in its Servicing card has zero rows in
  // project_amc_services — treat every missing (project, service_type) pair as
  // "not in AMC" rather than dropping the project from the dashboard.
  const rows: QueueRow[] = [];
  for (const p of projects) {
    const services = servicesByProject[p.id] || [];
    const logs = logsByProject[p.id] || [];
    const reminders = remindersByProject[p.id] || [];
    for (const type of AMC_SERVICE_TYPES) {
      const svc = services.find((s) => s.service_type === type) ?? {
        id: '',
        project_id: p.id,
        service_type: type,
        in_amc: false,
        customer_response: 'none' as const,
        is_recurring: true,
        interval_months: 3,
        created_at: p.created_at,
      };
      const logsForType = logs.filter((l) => l.service_type === type);
      const remindersForType = reminders.filter((r) => r.service_type === type);
      const status = computeAmcStatus(svc, logsForType, remindersForType);
      rows.push({ project: p, type, status });
    }
  }

  const thisMonthStr = new Date().toISOString().slice(0, 7);
  const overdueCount = rows.filter((r) => r.status.code === 'overdue').length;
  const dueThisMonthCount = rows.filter((r) => r.status.code === 'due' && (r.status.dueDate || '').slice(0, 7) === thisMonthStr).length;
  const noAmcCount = rows.filter((r) => r.status.code === 'not_in_amc').length;

  // "All" is a needs-attention set, not every row — comfortably-not-due
  // ('upcoming') rows stay hidden by default, same instinct as the Overview
  // page's priority queue.
  const needsAttention = rows.filter((r) => r.status.code !== 'upcoming');
  const filtered =
    filter === 'all' ? needsAttention : needsAttention.filter((r) => queueBucket(r.status.code) === filter);

  // One row per project by default — a project with several services needing
  // attention would otherwise repeat its name 3x in the queue. Expand to see
  // (and act on) the individual services underneath.
  const severityRank: Record<string, number> = { overdue: 0, declined: 1, reminder_sent: 1, not_scheduled: 2, not_in_amc: 3, due: 4, said_yes: 5, done_once: 6 };
  const groupOrder: string[] = [];
  const groupsById: Record<string, QueueRow[]> = {};
  for (const r of filtered) {
    if (!groupsById[r.project.id]) {
      groupsById[r.project.id] = [];
      groupOrder.push(r.project.id);
    }
    groupsById[r.project.id].push(r);
  }
  const groups = groupOrder.map((pid) => {
    const items = groupsById[pid];
    const worst = [...items].sort((a, b) => (severityRank[a.status.code] ?? 9) - (severityRank[b.status.code] ?? 9))[0];
    return { project: items[0].project, items, worst };
  });

  return (
    <div className="space-y-4">
      <div className="font-extrabold text-blue-400">🛠️ SERVICING</div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon="🚨" iconBg="#dc2626" value={overdueCount} label="Overdue" />
        <StatCard icon="📅" iconBg="#f59e0b" value={dueThisMonthCount} label="Due this month" />
        <StatCard icon="➕" iconBg="#8b5cf6" value={noAmcCount} label="No AMC yet" />
        <StatCard icon="💬" iconBg="#2563eb" value={reminderCountThisMonth} label="Reminders sent" sub="This month" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="font-bold text-[0.95rem] text-slate-200">🗂️ PRIORITY QUEUE</div>
          <div className="flex gap-2">
            <button className={`ve-btn px-3 py-1 ${filter === 'all' ? 've-btn-primary' : ''}`} onClick={() => setFilter('all')}>All</button>
            <button className={`ve-btn px-3 py-1 ${filter === 'overdue' ? 've-btn-primary' : ''}`} onClick={() => setFilter('overdue')}>Overdue</button>
            <button className={`ve-btn px-3 py-1 ${filter === 'no_amc' ? 've-btn-primary' : ''}`} onClick={() => setFilter('no_amc')}>No AMC</button>
            <button className={`ve-btn px-3 py-1 ${filter === 'said_yes' ? 've-btn-primary' : ''}`} onClick={() => setFilter('said_yes')}>Said yes</button>
          </div>
        </div>
        <div className="ve-panel overflow-hidden">
          <div className="grid grid-cols-[2fr_1.3fr_1.3fr_1.5fr_0.6fr] px-3.5 py-2.5 text-[0.68rem] font-bold text-slate-500 uppercase" style={{ background: '#0f1b2e' }}>
            <span>Customer</span><span>Service</span><span>Due / Last Contact</span><span>Status</span><span />
          </div>
          {groups.length === 0 ? (
            <div className="p-4 text-slate-500 text-sm">Nothing needs attention right now.</div>
          ) : (
            groups.map((g) => {
              const isOpen = expanded.has(g.project.id);
              return (
                <div key={g.project.id}>
                  <div
                    className="grid grid-cols-[2fr_1.3fr_1.3fr_1.5fr_0.6fr] px-3.5 py-2.5 items-center text-[0.78rem] cursor-pointer hover:bg-white/[0.02]"
                    style={{ borderTop: '1px solid #1e293b' }}
                    onClick={() => toggleExpanded(g.project.id)}
                  >
                    <span>
                      <span className="text-slate-500 mr-1">{isOpen ? '▾' : '▸'}</span>
                      <span className="font-semibold">{g.project.customer_name}</span>
                      <br />
                      <span className="text-[0.7rem] text-slate-500 pl-3.5">{g.project.system_size_kwp ? `${g.project.system_size_kwp} kW · ` : ''}{g.project.location || ''}</span>
                    </span>
                    <span className="text-slate-400">{g.items.length} service{g.items.length > 1 ? 's' : ''}</span>
                    <span className="text-slate-400">{g.worst.status.dueDate || g.worst.status.lastContactDate || '—'}</span>
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <span className="ve-badge" style={{ background: g.worst.status.color + '22', color: g.worst.status.color, border: `1px solid ${g.worst.status.color}` }}>{g.worst.status.label}</span>
                      {g.items.some((r) => r.status.needsReapproach) && (
                        <span className="ve-badge" style={{ background: '#ef444422', color: '#ef4444', border: '1px solid #ef4444' }}>🚩</span>
                      )}
                    </span>
                    <button onClick={(e) => { e.stopPropagation(); router.push(`/projects/${g.project.id}`); }} title="Open project">📂</button>
                  </div>
                  {isOpen &&
                    g.items.map((r, i) => (
                      <div key={`${r.project.id}-${r.type}-${i}`} className="grid grid-cols-[2fr_1.3fr_1.3fr_1.5fr_0.6fr] px-3.5 py-2 items-center text-[0.76rem]" style={{ borderTop: '1px solid #16304d', background: '#0a1322' }}>
                        <span className="pl-5 text-slate-400">{AMC_SERVICE_LABELS[r.type]}</span>
                        <span />
                        <span className="text-slate-400">{r.status.dueDate || r.status.lastContactDate || '—'}</span>
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <span className="ve-badge" style={{ background: r.status.color + '22', color: r.status.color, border: `1px solid ${r.status.color}` }}>{r.status.label}</span>
                          {r.status.needsReapproach && (
                            <span className="ve-badge" style={{ background: '#ef444422', color: '#ef4444', border: '1px solid #ef4444' }}>🚩</span>
                          )}
                        </span>
                        <span />
                      </div>
                    ))}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
