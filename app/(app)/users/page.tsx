'use client';

// Users (admin) — ported from the "Users" section of Home.py.

import { useEffect, useState } from 'react';
import { getAppUsers, updateAppUser, getActivityLogs } from '@/lib/db';
import type { AppUser, ActivityLog } from '@/lib/types';
import { timeAgo } from '@/lib/format';
import { Spinner } from '@/components/ui';

const ADMIN_EMAIL = 'voltedgeenergysolutions011@gmail.com';

export default function UsersPage() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [logUser, setLogUser] = useState('All Employees');
  const [logType, setLogType] = useState('All Actions');
  const [logLimit, setLogLimit] = useState(25);

  const reload = async () => setUsers(await getAppUsers());

  useEffect(() => {
    (async () => {
      await reload();
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const email = logUser === 'All Employees' ? undefined : logUser.split('(').pop()?.replace(')', '');
    getActivityLogs(logLimit, email).then(setLogs);
  }, [logUser, logLimit, users]);

  if (loading) return <Spinner />;

  const pending = users.filter((u) => u.status === 'pending');
  const approved = users.filter((u) => u.status === 'approved');
  const rejected = users.filter((u) => u.status === 'rejected');

  const act = async (id: string, data: Partial<AppUser>) => {
    await updateAppUser(id, data);
    await reload();
  };

  const filteredLogs =
    logType === 'All Actions' ? logs : logs.filter((l) => l.entity_type === logType);
  const uniqueUsers = new Set(filteredLogs.map((l) => l.user_email)).size;
  const projectActions = filteredLogs.filter((l) => l.entity_type === 'project').length;
  const stepActions = filteredLogs.filter((l) => l.entity_type === 'step').length;

  return (
    <div className="space-y-4">
      <div className="text-lg font-bold">👤 User Management</div>

      {/* pending */}
      {pending.length > 0 ? (
        <div>
          <div className="font-bold mb-2">🔔 Pending Approvals ({pending.length})</div>
          <div className="space-y-1">
            {pending.map((u) => (
              <div key={u.id} className="grid grid-cols-[2fr_2.5fr_1.2fr_1.2fr] gap-2 items-center ve-card py-2">
                <span className="font-semibold">{u.name || 'Unknown'}</span>
                <span className="text-slate-400 text-sm">{u.email}</span>
                <button className="ve-btn ve-btn-primary" onClick={() => act(u.id!, { status: 'approved', role: 'employee' })}>✅ Approve</button>
                <button className="ve-btn" onClick={() => act(u.id!, { status: 'rejected' })}>❌ Reject</button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-2.5 rounded-lg text-sm" style={{ background: '#052e16', color: '#22c55e' }}>✅ No pending approvals</div>
      )}

      {/* approved */}
      <div>
        <div className="font-bold mb-2">Approved Users ({approved.length})</div>
        <div className="space-y-1">
          {approved.map((u) => (
            <div key={u.id} className="grid grid-cols-[2fr_2.5fr_1.2fr_1.2fr] gap-2 items-center ve-card py-2">
              <span className="font-semibold">{u.name || 'Unknown'} <span className="text-slate-500 text-xs">{u.employee_code}</span></span>
              <span className="text-slate-400 text-sm">{u.email}</span>
              <select
                className="ve-input"
                value={u.role}
                onChange={(e) => act(u.id!, { role: e.target.value })}
                disabled={u.email === ADMIN_EMAIL}
              >
                <option value="employee">employee</option>
                <option value="admin">admin</option>
              </select>
              {u.email !== ADMIN_EMAIL ? (
                <button className="ve-btn" onClick={() => act(u.id!, { status: 'rejected' })}>🚫 Revoke</button>
              ) : (
                <span className="text-slate-600 text-xs text-center">—</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* rejected */}
      {rejected.length > 0 && (
        <details className="ve-card">
          <summary className="cursor-pointer font-semibold">Rejected Users ({rejected.length})</summary>
          <div className="space-y-1 mt-2">
            {rejected.map((u) => (
              <div key={u.id} className="grid grid-cols-[2fr_2.5fr_1.2fr_1.2fr] gap-2 items-center py-1.5">
                <span>{u.name}</span>
                <span className="text-slate-400 text-sm">{u.email}</span>
                <span className="text-slate-500 text-sm">Rejected</span>
                <button className="ve-btn" onClick={() => act(u.id!, { status: 'approved', role: 'employee' })}>🔁 Re-approve</button>
              </div>
            ))}
          </div>
        </details>
      )}

      <hr style={{ borderColor: '#1e293b' }} />

      {/* activity log */}
      <div className="text-lg font-bold">🕐 Employee Activity Log</div>
      <div className="grid md:grid-cols-[2fr_2fr_1fr] gap-2">
        <select className="ve-input" value={logUser} onChange={(e) => setLogUser(e.target.value)}>
          <option>All Employees</option>
          {approved
            .filter((u) => u.email !== ADMIN_EMAIL)
            .map((u) => (
              <option key={u.id}>{`${u.name || ''} (${u.email})`}</option>
            ))}
        </select>
        <select className="ve-input" value={logType} onChange={(e) => setLogType(e.target.value)}>
          {['All Actions', 'project', 'step', 'note', 'document', 'installment'].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select className="ve-input" value={logLimit} onChange={(e) => setLogLimit(Number(e.target.value))}>
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      {filteredLogs.length > 0 ? (
        <>
          <div className="grid grid-cols-4 gap-3">
            <Metric label="Total Actions" value={filteredLogs.length} />
            <Metric label="Active Users" value={uniqueUsers} />
            <Metric label="Project Changes" value={projectActions} />
            <Metric label="Step Updates" value={stepActions} />
          </div>
          <div className="ve-panel divide-y" style={{ borderColor: '#334155' }}>
            {filteredLogs.map((lg, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-2.5" style={{ borderTop: i ? '1px solid #334155' : 'none' }}>
                <span className="text-lg">{ICONS[lg.entity_type ?? ''] ?? '⚡'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    <span className="font-bold text-slate-100">{lg.user_name || 'Unknown'}</span>
                    <span className="text-slate-400 text-xs ml-2">{lg.user_email}</span>
                  </div>
                  <div className="text-slate-300 text-sm">
                    {lg.action}
                    {lg.project_name ? ` · ${lg.project_name}` : ''}
                  </div>
                  {lg.details && <div className="text-slate-600 text-xs truncate">{lg.details}</div>}
                </div>
                <span className="text-slate-600 text-xs whitespace-nowrap">{timeAgo(lg.created_at)}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-slate-500 text-sm">No activity logs found for the selected filter.</div>
      )}
    </div>
  );
}

const ICONS: Record<string, string> = {
  project: '📁', step: '🔧', note: '📝', document: '📄', installment: '💳', user: '👤',
};

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="ve-card" style={{ borderLeft: '3px solid #dc2626' }}>
      <div className="text-slate-400 text-xs">{label}</div>
      <div className="text-2xl font-extrabold">{value}</div>
    </div>
  );
}
