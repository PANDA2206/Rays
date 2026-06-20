'use client';

// ── Auth context (ported from streamlit_app/modules/auth.py) ──────────────────
// Google sign-in is handled by Supabase Auth (configure the Google provider in
// the Supabase dashboard). On login we mirror the user into `app_users` and load
// their role + approval status, exactly like load_user_from_db() did.

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';
import type { AppUser, UserRole, UserStatus } from './types';

const ADMIN_EMAIL = 'voltedgeenergysolutions011@gmail.com';

interface SessionIdentity {
  email: string;
  name: string;
  picture: string;
}

interface AuthState {
  loading: boolean;
  authenticated: boolean;
  identity: SessionIdentity | null;
  appUser: AppUser | null;
  role: UserRole;
  status: UserStatus;
  employeeCode: string;
  isAdmin: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function identityFromUser(user: {
  email?: string;
  user_metadata?: Record<string, unknown>;
}): SessionIdentity {
  const m = (user.user_metadata ?? {}) as Record<string, string>;
  return {
    email: user.email ?? '',
    name: m.full_name || m.name || user.email || '',
    picture: m.avatar_url || m.picture || '',
  };
}

/** Ensure an app_users row exists for this email, assign a VE-### code, return it. */
async function loadOrCreateAppUser(identity: SessionIdentity): Promise<AppUser | null> {
  if (!identity.email) return null;
  try {
    const { data: rows } = await supabase
      .from('app_users')
      .select('*')
      .eq('email', identity.email);
    let user: AppUser;
    if (rows && rows.length) {
      user = rows[0] as AppUser;
    } else {
      const isAdmin = identity.email === ADMIN_EMAIL;
      const newRow = {
        email: identity.email,
        name: identity.name,
        picture: identity.picture,
        role: isAdmin ? 'admin' : 'employee',
        status: isAdmin ? 'approved' : 'pending',
      };
      const { data: inserted } = await supabase.from('app_users').insert(newRow).select();
      user = (inserted?.[0] as AppUser) ?? (newRow as AppUser);
    }

    // Assign a sequential employee code (VE-001, VE-002, …) if missing.
    if (!user.employee_code) {
      try {
        const { data: allc } = await supabase.from('app_users').select('employee_code');
        const nums: number[] = [];
        for (const r of allc ?? []) {
          const c = String(r.employee_code ?? '').trim();
          if (c.toUpperCase().startsWith('VE-') && /^\d+$/.test(c.slice(3))) {
            nums.push(parseInt(c.slice(3), 10));
          }
        }
        const next = nums.length ? Math.max(...nums) + 1 : 1;
        const code = `VE-${String(next).padStart(3, '0')}`;
        if (user.id) {
          await supabase.from('app_users').update({ employee_code: code }).eq('id', user.id);
        }
        user.employee_code = code;
      } catch {
        user.employee_code = 'VE-' + (user.id ? String(user.id).slice(0, 3).toUpperCase() : '001');
      }
    }
    return user;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState<SessionIdentity | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);

  const hydrate = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setIdentity(null);
      setAppUser(null);
      setLoading(false);
      return;
    }
    const id = identityFromUser(data.user);
    setIdentity(id);
    const u = await loadOrCreateAppUser(id);
    setAppUser(u);
    setLoading(false);
  }, []);

  useEffect(() => {
    hydrate();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setIdentity(null);
        setAppUser(null);
        setLoading(false);
      } else {
        hydrate();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [hydrate]);

  const signInWithGoogle = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        queryParams: { prompt: 'select_account' },
      },
    });
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setIdentity(null);
    setAppUser(null);
  }, []);

  const role = (appUser?.role as UserRole) ?? 'employee';
  const status = (appUser?.status as UserStatus) ?? 'pending';

  const value: AuthState = {
    loading,
    authenticated: !!identity,
    identity,
    appUser,
    role,
    status,
    employeeCode: appUser?.employee_code ?? 'VE-001',
    isAdmin: role === 'admin',
    signInWithGoogle,
    signOut,
    refresh: hydrate,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
