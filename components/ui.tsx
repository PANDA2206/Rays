'use client';

import { STATUS_COLORS, STATUS_LABELS } from '@/lib/format';

export function StatCard({
  icon,
  iconBg,
  value,
  label,
  sub,
}: {
  icon: string;
  iconBg: string;
  value: React.ReactNode;
  label: string;
  sub?: string;
}) {
  return (
    <div className="ve-card flex items-center gap-3.5">
      <div
        className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center text-xl"
        style={{ background: iconBg }}
      >
        {icon}
      </div>
      <div className="leading-tight">
        <div className="text-2xl font-extrabold text-slate-100">{value}</div>
        <div className="text-sm text-slate-300">{label}</div>
        {sub && <div className="text-[0.68rem] text-slate-500">{sub}</div>}
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const isCompleted = status === 'completed';
  const isCancelled = status === 'cancelled';
  const bg = isCompleted ? '#16a34a' : isCancelled ? '#dc2626' : '#2563eb';
  const label = isCompleted ? 'COMPLETED' : isCancelled ? 'CANCELLED' : 'ACTIVE';
  return (
    <span className="ve-badge" style={{ background: bg }}>
      {label}
    </span>
  );
}

export function StatusDot({ status }: { status: string }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full"
      style={{ background: STATUS_COLORS[status] ?? '#94a3b8' }}
      title={STATUS_LABELS[status] ?? status}
    />
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="font-bold text-[0.95rem] text-slate-200 mb-2">{children}</div>;
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="text-center text-slate-400 py-16">
      <div className="text-3xl mb-2 animate-pulse">⚡</div>
      {label}
    </div>
  );
}
