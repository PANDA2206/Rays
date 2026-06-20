'use client';

// Gates protected content behind login + admin approval, mirroring the
// authenticated / pending / rejected screens in Home.py.

import { useAuth } from '@/lib/auth';
import Image from 'next/image';

function CenterBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background:
          'radial-gradient(1200px 600px at 50% -10%, #102036 0%, #0a1322 60%)',
      }}
    >
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, authenticated, status, identity, signInWithGoogle, signOut, refresh } =
    useAuth();

  if (loading) {
    return (
      <CenterBox>
        <div className="text-center text-slate-400">
          <div className="text-4xl mb-3 animate-pulse">⚡</div>
          Loading…
        </div>
      </CenterBox>
    );
  }

  // ── Not logged in → login screen ──
  if (!authenticated) {
    return (
      <CenterBox>
        <div className="text-center pt-6 pb-4">
          <Image
            src="/logo.png"
            alt="VOLTEDGE"
            width={340}
            height={120}
            priority
            className="mx-auto w-full max-w-[300px] h-auto"
          />
          <div className="text-slate-400 mt-4 text-base tracking-wide">
            Solar Project Management Dashboard
          </div>
        </div>
        <button onClick={signInWithGoogle} className="ve-btn w-full py-3 text-base mt-4">
          <span>🔐</span> Sign in with Google
        </button>
      </CenterBox>
    );
  }

  // ── Pending approval ──
  if (status === 'pending') {
    return (
      <CenterBox>
        <div className="text-center py-5">
          <div className="text-2xl font-bold">👋 Hi, {identity?.name}!</div>
          <div
            className="my-4 p-5 rounded-xl text-left"
            style={{ background: '#1e293b', borderLeft: '4px solid #f59e0b' }}
          >
            <div className="text-lg font-bold" style={{ color: '#f59e0b' }}>
              ⏳ Awaiting Admin Approval
            </div>
            <div className="text-slate-400 mt-2 text-sm">
              Your account request has been sent to the admin. You&apos;ll be able to access the
              dashboard once approved.
            </div>
          </div>
          <div className="text-slate-500 text-xs">Signed in as: {identity?.email}</div>
          <div className="flex gap-2 mt-5">
            <button onClick={refresh} className="ve-btn flex-1">
              🔄 Refresh Status
            </button>
            <button onClick={signOut} className="ve-btn flex-1">
              🚪 Sign Out
            </button>
          </div>
        </div>
      </CenterBox>
    );
  }

  // ── Rejected ──
  if (status === 'rejected') {
    return (
      <CenterBox>
        <div className="text-center py-10">
          <div className="text-3xl">🚫</div>
          <div className="text-xl font-bold my-2" style={{ color: '#ef4444' }}>
            Access Denied
          </div>
          <div className="text-slate-500 text-sm">
            Your access request was rejected. Please contact the admin.
          </div>
          <button onClick={signOut} className="ve-btn w-full mt-5">
            🚪 Sign Out
          </button>
        </div>
      </CenterBox>
    );
  }

  // ── Approved → app ──
  return <>{children}</>;
}
