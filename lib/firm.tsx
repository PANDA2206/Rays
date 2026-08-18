'use client';

// ── Which firm you are working in ────────────────────────────────────────────
//
// Everything the app shows and everything it saves belongs to exactly one firm.
// The choice lives here, is set from the sidebar switcher, and survives a
// reload so nobody has to re-pick it every visit.
//
// Reports may additionally show ALL_FIRMS to see the whole business at once.
// That is a read-only view: `firmId` is null there, so any form that needs a
// firm to save into can detect it and refuse rather than guess.

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { getFirms } from './db';
import type { Firm } from './types';

export const ALL_FIRMS = 'all';

const STORAGE_KEY = 've_firm_id';

interface FirmState {
  loading: boolean;
  firms: Firm[];
  /** Selected firm id, or ALL_FIRMS on the combined reports view. */
  selected: string;
  /** The concrete firm id to read/write with — null when viewing all firms. */
  firmId: string | null;
  firmName: string;
  isAll: boolean;
  setSelected: (id: string) => void;
  /** True when a row belongs to the current selection (all firms matches everything). */
  matches: (row: { firm_id?: string | null } | null | undefined) => boolean;
}

const FirmContext = createContext<FirmState | null>(null);

export function FirmProvider({ children }: { children: React.ReactNode }) {
  const [firms, setFirms] = useState<Firm[]>([]);
  const [selected, setSelectedState] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const rows = await getFirms();
      setFirms(rows);
      const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      const valid = saved && (saved === ALL_FIRMS || rows.some((f) => f.id === saved));
      setSelectedState(valid ? saved! : rows[0]?.id ?? '');
      setLoading(false);
    })();
  }, []);

  const setSelected = useCallback((id: string) => {
    setSelectedState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // private mode / storage disabled — selection just won't persist
    }
  }, []);

  const value = useMemo<FirmState>(() => {
    const isAll = selected === ALL_FIRMS;
    const firmId = isAll ? null : selected || null;
    const firmName = isAll
      ? 'All firms'
      : firms.find((f) => f.id === selected)?.name ?? '—';
    return {
      loading,
      firms,
      selected,
      firmId,
      firmName,
      isAll,
      setSelected,
      matches: (row) => (isAll ? true : !!row && row.firm_id === firmId),
    };
  }, [loading, firms, selected, setSelected]);

  return <FirmContext.Provider value={value}>{children}</FirmContext.Provider>;
}

export function useFirm(): FirmState {
  const ctx = useContext(FirmContext);
  if (!ctx) throw new Error('useFirm must be used within <FirmProvider>');
  return ctx;
}
