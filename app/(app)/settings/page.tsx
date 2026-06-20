'use client';

// Settings — ported from the "Settings" section of Home.py.

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { getProjects } from '@/lib/db';
import { StatCard } from '@/components/ui';

const ACTIVE_STATES = ['in_progress', 'planning', 'approved', 'on_hold'];

export default function SettingsPage() {
  const { identity, employeeCode, role, status, signOut } = useAuth();
  const [total, setTotal] = useState(0);
  const [active, setActive] = useState(0);

  useEffect(() => {
    getProjects().then((pr) => {
      setTotal(pr.length);
      setActive(pr.filter((p) => ACTIVE_STATES.includes(p.project_status)).length);
    });
  }, []);

  return (
    <div className="max-w-3xl">
      <div className="mb-3">
        <div className="text-xl font-extrabold">SETTINGS</div>
        <div className="text-slate-500 text-sm">Manage your profile and account settings.</div>
      </div>

      <div className="ve-card">
        <div className="flex items-center gap-2 mb-4">
          <span>👤</span>
          <span className="font-bold text-slate-200 tracking-wide">PROFILE INFORMATION</span>
        </div>
        <div className="flex gap-6 items-start">
          {identity?.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={identity.picture} alt="" className="w-28 h-28 rounded-xl object-cover" />
          ) : (
            <div className="w-28 h-28 rounded-xl flex items-center justify-center text-5xl font-extrabold text-white" style={{ background: '#16a34a' }}>
              {(identity?.name?.[0] ?? 'U').toUpperCase()}
            </div>
          )}
          <div className="flex-1 space-y-3">
            <Info label="Name" value={identity?.name ?? 'N/A'} />
            <Info label="Email" value={identity?.email ?? 'N/A'} valueColor="#3b82f6" />
            <Info label="Employee ID" value={employeeCode} />
            <div>
              <div className="text-slate-500 text-[0.68rem] uppercase">Role</div>
              <span
                className="ve-badge mt-1 inline-block"
                style={
                  role === 'admin'
                    ? { background: '#dc262622', color: '#ef4444', border: '1px solid #dc2626' }
                    : { background: '#2563eb22', color: '#3b82f6', border: '1px solid #2563eb' }
                }
              >
                {role === 'admin' ? '🔴 Admin' : '🔵 Employee'}
              </span>
            </div>
            <div>
              <div className="text-slate-500 text-[0.68rem] uppercase">Status</div>
              <span className="ve-badge mt-1 inline-block" style={{ background: '#16a34a22', color: '#22c55e', border: '1px solid #16a34a' }}>
                ✓ {status[0].toUpperCase() + status.slice(1)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <StatCard icon="💼" iconBg="#2563eb" value={total} label="Projects Assigned" />
        <StatCard icon="📊" iconBg="#16a34a" value={active} label="Active Projects" />
      </div>

      <div className="ve-card mt-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl" style={{ background: '#dc262622' }}>🚪</div>
          <div>
            <div className="font-bold text-sm">Logout</div>
            <div className="text-slate-500 text-xs">Sign out from your account</div>
          </div>
        </div>
        <button className="ve-btn" onClick={signOut}>🚪 Sign Out</button>
      </div>

      <div className="text-center mt-8 pt-3" style={{ borderTop: '1px solid #1e293b' }}>
        <div className="text-blue-400 font-bold text-sm">VoltEdge ERP v2.0</div>
        <div className="text-slate-600 text-xs">© 2026 VoltEdge Energy Solutions. All rights reserved.</div>
      </div>
    </div>
  );
}

function Info({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <div className="text-slate-500 text-[0.68rem] uppercase">{label}</div>
      <div className="font-semibold" style={{ color: valueColor ?? '#f1f5f9' }}>{value}</div>
    </div>
  );
}
