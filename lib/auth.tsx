'use client';

// ── Auth context (ported from streamlit_app/modules/auth.py) ──────────────────
// Direct Google OAuth using the SAME credentials as the Streamlit app (no
// Supabase Auth). The signed-in identity is kept in localStorage (like Streamlit's
// session_state); we then mirror the user into `app_users` and load their role +
// approval status, exactly like load_user_from_db() did.

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';
import type { AppUser, UserRole, UserStatus } from './types';

const ADMIN_EMAIL = 'voltedgeenergysolutions011@gmail.com';
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
const IDENTITY_KEY = 've_identity';

export interface SessionIdentity {
  email: string;
  name: string;
  picture: string;
}

// ── localStorage helpers (shared with the OAuth callback page) ────────────────
export function storeIdentity(identity: SessionIdentity) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  }
}
function readIdentity(): SessionIdentity | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    return raw ? (JSON.parse(raw) as SessionIdentity) : null;
  } catch {
    return null;
  }
}
function clearIdentity() {
  if (typeof window !== 'undefined') localStorage.removeItem(IDENTITY_KEY);
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
  signInWithGoogle: () => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

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
    // Handle the Google OAuth redirect: Google returns to the bare origin with
    // ?code=... (same pattern as the Streamlit app). Exchange it, then clean the URL.
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      if (code) {
        try {
          const res = await fetch('/api/auth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, redirect_uri: window.location.origin }),
          });
          const data = await res.json();
          if (res.ok && !data.error) {
            storeIdentity({ email: data.email, name: data.name, picture: data.picture });
          }
        } catch {
          // ignore — falls through to login screen
        }
        window.history.replaceState({}, '', window.location.origin + '/');
      }
    }

    const id = readIdentity();
    if (!id) {
      setIdentity(null);
      setAppUser(null);
      setLoading(false);
      return;
    }
    setIdentity(id);
    const u = await loadOrCreateAppUser(id);
    setAppUser(u);
    setLoading(false);
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const signInWithGoogle = useCallback(() => {
    const redirectUri = window.location.origin;
    const state = Math.random().toString(36).slice(2);
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
      state,
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }, []);

  const signOut = useCallback(async () => {
    clearIdentity();
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

/** Current identity for activity logging (reads localStorage). */
export function currentIdentity(): SessionIdentity | null {
  return readIdentity();
}
