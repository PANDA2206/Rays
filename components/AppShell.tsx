'use client';

// Sidebar + header shell, ported from render_sidebar()/render_header() in Home.py.

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useFirm, ALL_FIRMS } from '@/lib/firm';

interface NavItem {
  label: string;
  icon: string;
  href: string;
  adminOnly?: boolean;
  sub?: boolean;
}

const NAV: NavItem[] = [
  { label: 'Overview', icon: '🏠', href: '/' },
  { label: 'Customer List', icon: '☰', href: '/customers', sub: true },
  { label: 'Add Project', icon: '＋', href: '/customers/new', sub: true },
  { label: 'Report', icon: '📊', href: '/report', adminOnly: true },
  { label: 'EPC Partners', icon: '🏭', href: '/epc', adminOnly: true },
  { label: 'Users', icon: '👤', href: '/users', adminOnly: true },
  { label: 'Settings', icon: '⚙️', href: '/settings' },
  { label: 'Inventory', icon: '📦', href: '/inventory' }, // NAV[7]
];

/**
 * Which firm you are working in. Everything on every page — and everything
 * saved from it — belongs to the firm picked here. "All firms" is offered only
 * on Reports, because it is a read-only combined view with nothing to save into.
 */
function FirmSwitcher() {
  const pathname = usePathname();
  const { firms, selected, setSelected, loading, isAll } = useFirm();
  const onReport = pathname.startsWith('/report');

  // leaving Reports while on the combined view drops back to a real firm
  useEffect(() => {
    if (!onReport && isAll && firms.length) setSelected(firms[0].id);
  }, [onReport, isAll, firms, setSelected]);

  if (loading) return <div className="px-2 pb-3 text-[0.7rem] text-slate-600">Loading firms…</div>;

  if (!firms.length) {
    return (
      <div className="px-2 pb-3 text-[0.68rem]" style={{ color: '#fbbf24' }}>
        ⚠️ No firms found — run the firms migration.
      </div>
    );
  }

  return (
    <div className="px-1 pb-3">
      <div className="text-[0.62rem] text-slate-500 font-bold uppercase tracking-wide mb-1">
        Working under
      </div>
      <select
        className="w-full rounded-lg px-2 py-1.5 text-[0.78rem] font-semibold"
        style={{
          background: isAll ? '#1c1708' : '#0d1a2e',
          border: `1px solid ${isAll ? '#a16207' : '#16304d'}`,
          color: isAll ? '#fbbf24' : '#f1f5f9',
        }}
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        {firms.map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
        {onReport && <option value={ALL_FIRMS}>★ All firms (combined)</option>}
      </select>
    </div>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const { isAdmin, identity, employeeCode, role, signOut } = useAuth();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <aside
      className="hidden md:flex flex-col w-[260px] shrink-0 h-screen sticky top-0 px-3 py-4"
      style={{ background: '#0a1322', borderRight: '1px solid #1e293b' }}
    >
      <div className="px-1 pb-4 text-center">
        <Image
          src="/logo.png"
          alt="VOLTEDGE"
          width={215}
          height={70}
          className="mx-auto w-full max-w-[200px] h-auto"
        />
      </div>

      <FirmSwitcher />

      <nav className="flex flex-col gap-1">
        <NavLink item={NAV[0]} active={isActive('/')} />

        <div className="text-[0.7rem] text-slate-500 font-bold uppercase px-3 pt-3 pb-1">
          Edit Customers
        </div>
        <NavLink item={NAV[1]} active={isActive('/customers') && pathname === '/customers'} />
        <NavLink item={NAV[2]} active={pathname === '/customers/new'} />

        <div className="h-2" />
        <NavLink item={NAV[7]} active={isActive('/inventory')} />

        {isAdmin && (
          <>
            <div className="h-2" />
            <NavLink item={NAV[3]} active={isActive('/report')} />
            <NavLink item={NAV[4]} active={isActive('/epc')} />
            <NavLink item={NAV[5]} active={isActive('/users')} />
          </>
        )}
        <NavLink item={NAV[6]} active={isActive('/settings')} />
      </nav>

      <div className="mt-auto pt-4">
        <hr style={{ borderColor: '#1e293b' }} />
        <div className="flex items-center gap-3 px-2 pt-3">
          {identity?.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={identity.picture}
              alt=""
              className="w-11 h-11 rounded-full object-cover"
            />
          ) : (
            <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-white text-lg" style={{ background: '#16a34a' }}>
              {(identity?.name?.[0] ?? 'U').toUpperCase()}
            </div>
          )}
          <div className="leading-tight">
            <div className="font-bold text-sm text-slate-100">{employeeCode}</div>
            <div className="text-xs text-slate-400">{role === 'admin' ? 'Admin' : 'Engineer'}</div>
            <div className="text-[0.68rem]" style={{ color: '#22c55e' }}>
              ● Online
            </div>
          </div>
        </div>
        <button
          onClick={signOut}
          className="mt-2 w-full text-left px-3 py-1.5 rounded font-bold text-sm"
          style={{ color: '#ef4444' }}
        >
          ⏻ Logout
        </button>
      </div>
    </aside>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className="flex items-center gap-2 rounded-lg px-3.5 font-semibold text-sm transition-colors"
      style={{
        padding: item.sub ? '7px 14px 7px 26px' : '8px 14px',
        background: active ? 'linear-gradient(90deg,#5b1212,#7f1d1d)' : 'transparent',
        color: active ? '#fca5a5' : '#94a3b8',
        border: active ? '1px solid #b91c1c' : '1px solid transparent',
      }}
    >
      <span>{item.icon}</span>
      <span>{item.label}</span>
    </Link>
  );
}

function Header() {
  const { identity, employeeCode, role, signOut } = useAuth();
  const roleBadge = role === 'admin' ? '🔴 Admin' : '🟡 Employee';
  return (
    <div className="flex items-center justify-between mb-4 pb-3" style={{ borderBottom: '1px solid #1e293b' }}>
      <div className="flex items-center gap-3">
        {identity?.picture && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={identity.picture} alt="" className="w-10 h-10 rounded-full object-cover" />
        )}
        <div className="leading-tight">
          <span className="text-slate-500 text-xs">WELCOME BACK,</span>
          <div>
            <span className="text-2xl font-extrabold">⚡ {employeeCode}</span>
            <span
              className="text-xs ml-2 px-2.5 py-0.5 rounded-full"
              style={{ background: '#1e293b', color: '#94a3b8' }}
            >
              {roleBadge}
            </span>
          </div>
        </div>
      </div>
      <button onClick={signOut} className="ve-btn">
        🚪 Logout
      </button>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen" style={{ background: '#0a1322' }}>
      <Sidebar />
      <main className="flex-1 min-w-0 px-4 sm:px-6 py-4 max-w-[1400px] mx-auto w-full">
        <Header />
        {children}
      </main>
    </div>
  );
}
