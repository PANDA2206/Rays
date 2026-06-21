'use client';

// Inventory management — items, stock in/out (with base+GST), expenses,
// live quantity tally, valuation, low-stock alerts and date-filtered gross profit.

import { useEffect, useMemo, useState } from 'react';
import {
  getInventoryItems,
  createInventoryItem,
  deleteInventoryItem,
  updateInventoryItem,
  getInventoryMovements,
  createInventoryMovement,
  deleteInventoryMovement,
  getInventoryExpenses,
  createInventoryExpense,
  deleteInventoryExpense,
  getProjects,
} from '@/lib/db';
import type {
  InventoryItem,
  InventoryMovement,
  InventoryItemStock,
  InventoryExpense,
} from '@/lib/types';
import { formatCurrency, num } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { StatCard, Spinner } from '@/components/ui';
import { HBars } from '@/components/Charts';

const UNITS = ['pcs', 'm', 'kg', 'set', 'roll', 'L', 'box', 'unit'];
const EXPENSE_CATS = ['Transport', 'Labour', 'Light Bill', 'Rent', 'Petrol', 'Other'];
const todayStr = () => new Date().toISOString().slice(0, 10);

/** base + its GST */
const grossOf = (base: number, gstPct: number) => base + (base * gstPct) / 100;
const moveValue = (m: InventoryMovement) => grossOf(num(m.base_amount), num(m.gst_pct));

type Tab = 'item' | 'in' | 'out' | 'expense' | null;

export default function InventoryPage() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [moves, setMoves] = useState<InventoryMovement[]>([]);
  const [expenses, setExpenses] = useState<InventoryExpense[]>([]);
  const [customers, setCustomers] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const reload = async () => {
    const [its, mvs, exp] = await Promise.all([
      getInventoryItems(),
      getInventoryMovements(),
      getInventoryExpenses(),
    ]);
    setItems(its);
    setMoves(mvs);
    setExpenses(exp);
  };

  useEffect(() => {
    (async () => {
      await reload();
      const pr = await getProjects();
      setCustomers(Array.from(new Set(pr.map((p) => p.customer_name).filter(Boolean))).sort());
      setLoading(false);
    })();
  }, []);

  const stock: InventoryItemStock[] = useMemo(() => {
    return items.map((it) => {
      const mv = moves.filter((m) => m.item_id === it.id);
      const qtyIn = mv.filter((m) => m.type === 'in').reduce((s, m) => s + num(m.quantity), 0);
      const qtyOut = mv.filter((m) => m.type === 'out').reduce((s, m) => s + num(m.quantity), 0);
      const qty = qtyIn - qtyOut;
      const stockValue = qty * num(it.unit_cost);
      const low = qty <= num(it.reorder_level);
      return { ...it, qtyIn, qtyOut, qty, stockValue, low };
    });
  }, [items, moves]);

  const itemById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);

  if (loading) return <Spinner />;

  const inRange = (d?: string | null) => {
    if (!from && !to) return true;
    if (!d) return false;
    const ds = String(d).slice(0, 10);
    if (from && ds < from) return false;
    if (to && ds > to) return false;
    return true;
  };

  // top cards (all-time)
  const totalStockValue = stock.reduce((s, i) => s + i.stockValue, 0);
  const lowCount = stock.filter((i) => i.low).length;
  const totalPurchasedAll = moves.filter((m) => m.type === 'in').reduce((s, m) => s + moveValue(m), 0);
  const totalSalesAll = moves.filter((m) => m.type === 'out').reduce((s, m) => s + moveValue(m), 0);

  // gross profit (date-filtered)
  const fMoves = moves.filter((m) => inRange(m.movement_date));
  const sales = fMoves.filter((m) => m.type === 'out').reduce((s, m) => s + moveValue(m), 0);
  const purchases = fMoves.filter((m) => m.type === 'in').reduce((s, m) => s + moveValue(m), 0);
  const movExpenses = fMoves.reduce((s, m) => s + num(m.expense), 0);
  const fExpenses = expenses.filter((e) => inRange(e.expense_date));
  const expEntries = fExpenses.reduce((s, e) => s + num(e.amount) + num(e.tax), 0);
  const expensesTotal = movExpenses + expEntries;
  const grossProfit = sales - purchases - expensesTotal;

  // line-by-line breakdown for the selected range (newest first)
  type Detail = { date: string; kind: string; label: string; amount: number; color: string };
  const details: Detail[] = [];
  for (const m of fMoves) {
    const nm = itemById[m.item_id]?.name || '—';
    if (m.type === 'out') details.push({ date: m.movement_date || '-', kind: 'Sale', label: `${nm}${m.party ? ` · ${m.party}` : ''}`, amount: moveValue(m), color: '#22c55e' });
    else details.push({ date: m.movement_date || '-', kind: 'Purchase', label: `${nm}${m.party ? ` · ${m.party}` : ''}`, amount: -moveValue(m), color: '#3b82f6' });
    if (num(m.expense) > 0) details.push({ date: m.movement_date || '-', kind: 'Expense', label: `${nm} transport/expense`, amount: -num(m.expense), color: '#f59e0b' });
  }
  for (const e of fExpenses) {
    details.push({ date: e.expense_date || '-', kind: 'Expense', label: `${e.category || 'Expense'}${e.description ? ` · ${e.description}` : ''}`, amount: -(num(e.amount) + num(e.tax)), color: '#f59e0b' });
  }
  details.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  // stock value by category
  const byCat: Record<string, number> = {};
  for (const s of stock) {
    const c = s.category || 'Uncategorised';
    byCat[c] = (byCat[c] || 0) + s.stockValue;
  }
  const catBars = Object.entries(byCat)
    .map(([label, value]) => ({ label, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);

  const expensesAllTotal = expenses.reduce((s, e) => s + num(e.amount) + num(e.tax), 0);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-lg font-bold">📦 Inventory Management</div>
        <div className="text-slate-500 text-sm">
          Stock quantities, valuation, purchases, sales, expenses and gross profit.
        </div>
      </div>

      {/* summary — money cards are admin-only */}
      <div className={`grid grid-cols-2 ${isAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-2'} gap-3`}>
        <StatCard icon="📦" iconBg="#2563eb" value={items.length} label="Items" sub="in catalogue" />
        {isAdmin && <StatCard icon="💰" iconBg="#16a34a" value={formatCurrency(totalStockValue)} label="Stock Value" sub="remaining on hand" />}
        {isAdmin && <StatCard icon="🛒" iconBg="#a78bfa" value={formatCurrency(totalPurchasedAll)} label="Total Purchased" sub="incl. GST" />}
        {isAdmin && <StatCard icon="📤" iconBg="#f97316" value={formatCurrency(totalSalesAll)} label="Total Sales" sub="incl. GST" />}
        <StatCard icon="⚠️" iconBg={lowCount ? '#dc2626' : '#334155'} value={lowCount} label="Low Stock" sub="at/below reorder" />
      </div>

      {lowCount > 0 && (
        <div className="p-3 rounded-lg text-sm" style={{ background: '#450a0a', color: '#fca5a5' }}>
          ⚠️ {lowCount} item(s) at or below reorder level:{' '}
          <b>{stock.filter((s) => s.low).map((s) => s.name).join(', ')}</b>
        </div>
      )}

      {/* gross profit panel — admin only */}
      {isAdmin && (
      <div className="ve-card" style={{ background: '#0d1a2e', borderColor: '#16304d' }}>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="font-bold text-slate-200">📈 Gross Profit</div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">From</span>
            <input className="ve-input py-1" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-slate-500">To</span>
            <input className="ve-input py-1" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            {(from || to) && <button className="ve-btn px-2 py-1" onClick={() => { setFrom(''); setTo(''); }}>Clear</button>}
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <GpFig label="Sales (Stock Out)" value={sales} color="#22c55e" />
          <GpFig label="Purchases (Stock In)" value={purchases} color="#3b82f6" sign="−" />
          <GpFig label="Expenses" value={expensesTotal} color="#f59e0b" sign="−" />
          <GpFig label="Gross Profit" value={grossProfit} color={grossProfit >= 0 ? '#22c55e' : '#ef4444'} big />
        </div>
        <div className="text-slate-600 text-[0.7rem] mt-2">
          Gross Profit = Sales − Purchases − Expenses{from || to ? ` · ${from || '…'} to ${to || '…'}` : ' · all time'}
        </div>

        {(from || to) && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid #16304d' }}>
            <div className="text-slate-400 text-xs font-semibold mb-1.5">Breakdown for selected dates ({details.length})</div>
            {details.length === 0 ? (
              <div className="text-slate-600 text-xs">No entries in this date range.</div>
            ) : (
              <div className="overflow-x-auto" style={{ maxHeight: 260, overflowY: 'auto' }}>
                <table className="w-full text-[0.74rem]">
                  <thead>
                    <tr className="text-slate-500 text-left">
                      {['Date', 'Type', 'Detail', 'Amount'].map((h) => <th key={h} className="px-2 py-1 font-bold">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {details.map((d, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #1e293b' }}>
                        <td className="px-2 py-1 text-slate-400 whitespace-nowrap">{d.date}</td>
                        <td className="px-2 py-1"><span style={{ color: d.color }}>{d.kind}</span></td>
                        <td className="px-2 py-1 text-slate-300">{d.label}</td>
                        <td className="px-2 py-1 font-semibold" style={{ color: d.amount >= 0 ? '#22c55e' : '#ef4444' }}>
                          {d.amount >= 0 ? '+' : '−'}{formatCurrency(Math.abs(d.amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* actions */}
      <div className="flex gap-2 flex-wrap">
        <button className={`ve-btn ${tab === 'item' ? 've-btn-primary' : ''}`} onClick={() => setTab(tab === 'item' ? null : 'item')}>➕ Add Item</button>
        <button className={`ve-btn ${tab === 'in' ? 've-btn-primary' : ''}`} onClick={() => setTab(tab === 'in' ? null : 'in')}>📥 Stock In (Purchase)</button>
        <button className={`ve-btn ${tab === 'out' ? 've-btn-primary' : ''}`} onClick={() => setTab(tab === 'out' ? null : 'out')}>📤 Stock Out (Issue/Sell)</button>
        <button className={`ve-btn ${tab === 'expense' ? 've-btn-primary' : ''}`} onClick={() => setTab(tab === 'expense' ? null : 'expense')}>🧾 Add Expense</button>
      </div>

      {tab === 'item' && <AddItemForm onDone={async () => { setTab(null); await reload(); }} />}
      {tab === 'in' && <StockInForm items={items} onDone={async () => { setTab(null); await reload(); }} />}
      {tab === 'out' && <StockOutForm items={items} stock={stock} customers={customers} onDone={async () => { setTab(null); await reload(); }} />}
      {tab === 'expense' && <AddExpenseForm onDone={async () => { setTab(null); await reload(); }} />}

      {/* stock table + category (category value chart is admin-only) */}
      <div className={`grid gap-4 ${isAdmin ? 'lg:grid-cols-[2.4fr_1fr]' : ''}`}>
        <div>
          <div className="font-bold text-slate-200 mb-2">📋 Current Stock</div>
          {stock.length === 0 ? (
            <div className="ve-card text-slate-400 text-sm">No items yet. Add one with “Add Item”.</div>
          ) : (
            <div className="ve-panel overflow-x-auto">
              <table className="w-full text-[0.78rem]">
                <thead>
                  <tr className="text-slate-500 text-left" style={{ background: '#0f1b2e' }}>
                    {['Item', 'Category', 'Unit', 'In', 'Out', 'Remaining', 'Unit Cost', 'Stock Value', 'Status', ''].map((h) => (
                      <th key={h} className="px-2 py-2 font-bold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stock.map((s) => (
                    <tr key={s.id} style={{ borderTop: '1px solid #1e293b' }}>
                      <td className="px-2 py-1.5 font-semibold">{s.name}</td>
                      <td className="px-2 py-1.5 text-slate-400">{s.category || '-'}</td>
                      <td className="px-2 py-1.5 text-slate-400">{s.unit}</td>
                      <td className="px-2 py-1.5 text-green-400">{s.qtyIn}</td>
                      <td className="px-2 py-1.5 text-orange-400">{s.qtyOut}</td>
                      <td className="px-2 py-1.5 font-bold" style={{ color: s.low ? '#ef4444' : '#f1f5f9' }}>{s.qty}</td>
                      <td className="px-2 py-1.5">{formatCurrency(num(s.unit_cost))}</td>
                      <td className="px-2 py-1.5 font-semibold">{formatCurrency(s.stockValue)}</td>
                      <td className="px-2 py-1.5">
                        {s.low ? <span className="ve-badge" style={{ background: '#dc2626' }}>LOW</span> : <span className="ve-badge" style={{ background: '#16a34a' }}>OK</span>}
                      </td>
                      <td className="px-2 py-1.5"><EditItemButton item={s} onChanged={reload} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {isAdmin && (
          <div>
            <div className="font-bold text-slate-200 mb-2">💸 Stock Value by Category</div>
            <div className="ve-card">
              {catBars.length === 0 ? <div className="text-slate-500 text-sm">No stock yet.</div> : <HBars items={catBars} color="#22c55e" />}
            </div>
          </div>
        )}
      </div>

      {/* expenses */}
      <div>
        <div className="font-bold text-slate-200 mb-2">🧾 Expenses</div>
        {expenses.length === 0 ? (
          <div className="ve-card text-slate-400 text-sm">No expenses yet. Use “Add Expense”.</div>
        ) : (
          <div className="ve-panel overflow-x-auto">
            <table className="w-full text-[0.78rem]">
              <thead>
                <tr className="text-slate-500 text-left" style={{ background: '#0f1b2e' }}>
                  {['Date', 'Category', 'Description', 'Amount', 'Tax', 'Total', ''].map((h) => (
                    <th key={h} className="px-2 py-2 font-bold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} style={{ borderTop: '1px solid #1e293b' }}>
                    <td className="px-2 py-1.5 text-slate-400">{e.expense_date || '-'}</td>
                    <td className="px-2 py-1.5">{e.category || '-'}</td>
                    <td className="px-2 py-1.5 text-slate-300">{e.description || '-'}</td>
                    <td className="px-2 py-1.5">{formatCurrency(num(e.amount))}</td>
                    <td className="px-2 py-1.5">{formatCurrency(num(e.tax))}</td>
                    <td className="px-2 py-1.5 font-semibold text-orange-400">{formatCurrency(num(e.amount) + num(e.tax))}</td>
                    <td className="px-2 py-1.5"><button title="Delete expense" onClick={async () => { await deleteInventoryExpense(e.id); await reload(); }}>🗑️</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-slate-400 text-sm mt-1">Total Expenses (all time): <b style={{ color: '#f59e0b' }}>{formatCurrency(expensesAllTotal)}</b></div>
      </div>

      {/* movements */}
      <div>
        <div className="font-bold text-slate-200 mb-2">🔄 Stock Movements</div>
        {moves.length === 0 ? (
          <div className="ve-card text-slate-400 text-sm">No movements yet.</div>
        ) : (
          <div className="ve-panel overflow-x-auto">
            <table className="w-full text-[0.78rem]">
              <thead>
                <tr className="text-slate-500 text-left" style={{ background: '#0f1b2e' }}>
                  {['Date', 'Item', 'Type', 'Qty', 'Base', 'GST%', 'Value', 'Expense', 'Supplier / Issued To', 'Ref', ''].map((h) => (
                    <th key={h} className="px-2 py-2 font-bold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {moves.slice(0, 150).map((m) => {
                  const it = itemById[m.item_id];
                  const isIn = m.type === 'in';
                  return (
                    <tr key={m.id} style={{ borderTop: '1px solid #1e293b' }}>
                      <td className="px-2 py-1.5 text-slate-400">{m.movement_date || '-'}</td>
                      <td className="px-2 py-1.5">{it?.name || '—'}</td>
                      <td className="px-2 py-1.5">
                        <span className="ve-badge" style={{ background: isIn ? '#16a34a' : '#f97316' }}>{isIn ? 'IN' : 'OUT'}</span>
                        {m.source === 'epc_sale' && <span className="ml-1 text-[0.6rem] text-violet-400">EPC</span>}
                      </td>
                      <td className="px-2 py-1.5">{num(m.quantity)} {it?.unit}</td>
                      <td className="px-2 py-1.5">{formatCurrency(num(m.base_amount))}</td>
                      <td className="px-2 py-1.5">{num(m.gst_pct)}%</td>
                      <td className="px-2 py-1.5 font-semibold">{formatCurrency(moveValue(m))}</td>
                      <td className="px-2 py-1.5 text-amber-400">{num(m.expense) ? formatCurrency(num(m.expense)) : '-'}</td>
                      <td className="px-2 py-1.5">{m.party || '-'}</td>
                      <td className="px-2 py-1.5 text-slate-400">{m.reference || '-'}</td>
                      <td className="px-2 py-1.5"><button title="Delete movement" onClick={async () => { await deleteInventoryMovement(m.id); await reload(); }}>🗑️</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function GpFig({ label, value, color, sign, big }: { label: string; value: number; color: string; sign?: string; big?: boolean }) {
  return (
    <div className="rounded-lg p-3" style={{ background: '#0a1322', border: '1px solid #1e293b' }}>
      <div className="text-slate-500 text-[0.68rem] uppercase">{label}</div>
      <div className={`font-extrabold ${big ? 'text-xl' : 'text-base'}`} style={{ color }}>
        {sign}{formatCurrency(value)}
      </div>
    </div>
  );
}

// ── forms ─────────────────────────────────────────────────────────────────────

function AddItemForm({ onDone }: { onDone: () => Promise<void> }) {
  const [v, setV] = useState({ name: '', category: '', unit: 'pcs', unit_cost: '', reorder_level: '', opening_qty: '' });
  const [busy, setBusy] = useState(false);
  const s = (k: keyof typeof v, val: string) => setV((p) => ({ ...p, [k]: val }));

  const submit = async () => {
    if (!v.name.trim()) return;
    setBusy(true);
    const item = await createInventoryItem({
      name: v.name.trim(),
      category: v.category.trim() || null,
      unit: v.unit,
      unit_cost: num(v.unit_cost),
      reorder_level: num(v.reorder_level),
    });
    if (item && num(v.opening_qty) > 0) {
      await createInventoryMovement({
        item_id: item.id,
        type: 'in',
        quantity: num(v.opening_qty),
        base_amount: num(v.unit_cost) * num(v.opening_qty),
        unit_price: num(v.unit_cost),
        party: 'Opening stock',
        source: 'manual',
        movement_date: todayStr(),
      });
    }
    setBusy(false);
    await onDone();
  };

  return (
    <div className="ve-card space-y-2">
      <div className="font-semibold text-sm">➕ Add Inventory Item</div>
      <div className="grid md:grid-cols-3 gap-2">
        <Labeled label="Item Name *"><input className="ve-input" value={v.name} onChange={(e) => s('name', e.target.value)} placeholder="e.g. Solar Panel 550W" /></Labeled>
        <Labeled label="Category"><input className="ve-input" value={v.category} onChange={(e) => s('category', e.target.value)} placeholder="Panels / Cables / Structure…" /></Labeled>
        <Labeled label="Unit"><select className="ve-input" value={v.unit} onChange={(e) => s('unit', e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></Labeled>
        <Labeled label="Unit Cost (₹)"><input className="ve-input" type="number" value={v.unit_cost} onChange={(e) => s('unit_cost', e.target.value)} placeholder="0" /></Labeled>
        <Labeled label="Reorder Level"><input className="ve-input" type="number" value={v.reorder_level} onChange={(e) => s('reorder_level', e.target.value)} placeholder="0" /></Labeled>
        <Labeled label="Opening Stock Qty (optional)"><input className="ve-input" type="number" value={v.opening_qty} onChange={(e) => s('opening_qty', e.target.value)} placeholder="0" /></Labeled>
      </div>
      <button className="ve-btn ve-btn-primary w-full" disabled={busy} onClick={submit}>💾 Save Item</button>
    </div>
  );
}

function StockInForm({ items, onDone }: { items: InventoryItem[]; onDone: () => Promise<void> }) {
  const [v, setV] = useState({ item_id: '', quantity: '', basePerUnit: '', gst: '0', expense: '', party: '', reference: '', date: todayStr(), note: '' });
  const [busy, setBusy] = useState(false);
  const s = (k: keyof typeof v, val: string) => setV((p) => ({ ...p, [k]: val }));

  const qty = num(v.quantity);
  const base = qty * num(v.basePerUnit); // total base = qty × per-unit
  const gstPct = num(v.gst);
  const total = grossOf(base, gstPct);
  const landedPerUnit = qty > 0 ? total / qty : 0;

  const submit = async () => {
    if (!v.item_id || qty <= 0) return;
    setBusy(true);
    await createInventoryMovement({
      item_id: v.item_id,
      type: 'in',
      quantity: qty,
      base_amount: base,
      gst_pct: gstPct,
      expense: num(v.expense),
      unit_price: landedPerUnit,
      party: v.party || null,
      reference: v.reference || null,
      note: v.note || null,
      source: 'manual',
      movement_date: v.date,
    });
    if (base > 0) await updateInventoryItem(v.item_id, { unit_cost: landedPerUnit });
    setBusy(false);
    await onDone();
  };

  return (
    <div className="ve-card space-y-2">
      <div className="font-semibold text-sm">📥 Stock In (Purchase / Receive)</div>
      <div className="grid md:grid-cols-3 gap-2">
        <Labeled label="Item *">
          <select className="ve-input" value={v.item_id} onChange={(e) => s('item_id', e.target.value)}>
            <option value="">— Select item —</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Labeled>
        <Labeled label="Quantity *"><input className="ve-input" type="number" value={v.quantity} onChange={(e) => s('quantity', e.target.value)} placeholder="0" /></Labeled>
        <Labeled label="Base Amount / Unit (₹)"><input className="ve-input" type="number" value={v.basePerUnit} onChange={(e) => s('basePerUnit', e.target.value)} placeholder="0" /></Labeled>
        <Labeled label="GST %"><input className="ve-input" type="number" value={v.gst} onChange={(e) => s('gst', e.target.value)} placeholder="0" /></Labeled>
        <Labeled label="Transport / Expense (₹)"><input className="ve-input" type="number" value={v.expense} onChange={(e) => s('expense', e.target.value)} placeholder="0" /></Labeled>
        <Labeled label="Supplier"><input className="ve-input" value={v.party} onChange={(e) => s('party', e.target.value)} placeholder="Supplier name" /></Labeled>
        <Labeled label="Invoice / Ref"><input className="ve-input" value={v.reference} onChange={(e) => s('reference', e.target.value)} placeholder="Invoice no" /></Labeled>
        <Labeled label="Date"><input className="ve-input" type="date" value={v.date} onChange={(e) => s('date', e.target.value)} /></Labeled>
      </div>
      <div className="text-slate-500 text-xs">
        Base total ({qty || 0} × {formatCurrency(num(v.basePerUnit))}): <b className="text-slate-300">{formatCurrency(base)}</b>
        {' '}· incl GST <b className="text-slate-300">{formatCurrency(total)}</b>
        {qty > 0 && <> · per-unit cost <b className="text-slate-300">{formatCurrency(landedPerUnit)}</b></>}
      </div>
      <button className="ve-btn ve-btn-primary w-full" disabled={busy} onClick={submit}>📥 Add Stock</button>
    </div>
  );
}

function StockOutForm({ items, stock, customers, onDone }: { items: InventoryItem[]; stock: InventoryItemStock[]; customers: string[]; onDone: () => Promise<void> }) {
  const [v, setV] = useState({ item_id: '', quantity: '', base: '', gst: '0', expense: '', party: '', reference: '', date: todayStr(), note: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const s = (k: keyof typeof v, val: string) => setV((p) => ({ ...p, [k]: val }));
  const avail = stock.find((x) => x.id === v.item_id)?.qty ?? 0;

  const submit = async () => {
    if (!v.item_id || num(v.quantity) <= 0) return;
    if (num(v.quantity) > avail) { setErr(`Only ${avail} in stock.`); return; }
    setErr('');
    setBusy(true);
    await createInventoryMovement({
      item_id: v.item_id,
      type: 'out',
      quantity: num(v.quantity),
      base_amount: num(v.base),
      gst_pct: num(v.gst),
      expense: num(v.expense),
      party: v.party || null,
      reference: v.reference || null,
      note: v.note || null,
      source: 'manual',
      movement_date: v.date,
    });
    setBusy(false);
    await onDone();
  };

  return (
    <div className="ve-card space-y-2">
      <div className="font-semibold text-sm">📤 Stock Out (Issue to project / Sell)</div>
      {err && <div className="text-red-400 text-xs">❌ {err}</div>}
      <div className="grid md:grid-cols-3 gap-2">
        <Labeled label="Item *">
          <select className="ve-input" value={v.item_id} onChange={(e) => s('item_id', e.target.value)}>
            <option value="">— Select item —</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Labeled>
        <Labeled label={`Quantity * ${v.item_id ? `(avail ${avail})` : ''}`}><input className="ve-input" type="number" value={v.quantity} onChange={(e) => s('quantity', e.target.value)} placeholder="0" /></Labeled>
        <Labeled label="Issued To (project / customer)">
          <input className="ve-input" list="inv-cust" value={v.party} onChange={(e) => s('party', e.target.value)} placeholder="Customer / purpose" />
          <datalist id="inv-cust">{customers.map((c) => <option key={c} value={c} />)}</datalist>
        </Labeled>
        <Labeled label="Sale Base (₹, if sold)"><input className="ve-input" type="number" value={v.base} onChange={(e) => s('base', e.target.value)} placeholder="0" /></Labeled>
        <Labeled label="GST %"><input className="ve-input" type="number" value={v.gst} onChange={(e) => s('gst', e.target.value)} placeholder="0" /></Labeled>
        <Labeled label="Transport / Expense (₹)"><input className="ve-input" type="number" value={v.expense} onChange={(e) => s('expense', e.target.value)} placeholder="0" /></Labeled>
        <Labeled label="Reference"><input className="ve-input" value={v.reference} onChange={(e) => s('reference', e.target.value)} placeholder="Project ID / note" /></Labeled>
        <Labeled label="Date"><input className="ve-input" type="date" value={v.date} onChange={(e) => s('date', e.target.value)} /></Labeled>
      </div>
      <button className="ve-btn ve-btn-primary w-full" disabled={busy} onClick={submit}>📤 Issue Stock</button>
    </div>
  );
}

function AddExpenseForm({ onDone }: { onDone: () => Promise<void> }) {
  const [v, setV] = useState({ category: 'Transport', description: '', amount: '', tax: '', date: todayStr() });
  const [busy, setBusy] = useState(false);
  const s = (k: keyof typeof v, val: string) => setV((p) => ({ ...p, [k]: val }));

  const submit = async () => {
    if (num(v.amount) <= 0 && !v.description.trim()) return;
    setBusy(true);
    await createInventoryExpense({
      category: v.category,
      description: v.description.trim() || null,
      amount: num(v.amount),
      tax: num(v.tax),
      expense_date: v.date,
    });
    setBusy(false);
    await onDone();
  };

  return (
    <div className="ve-card space-y-2">
      <div className="font-semibold text-sm">🧾 Add Expense</div>
      <div className="grid md:grid-cols-3 gap-2">
        <Labeled label="Category">
          <select className="ve-input" value={v.category} onChange={(e) => s('category', e.target.value)}>{EXPENSE_CATS.map((c) => <option key={c}>{c}</option>)}</select>
        </Labeled>
        <Labeled label="Description"><input className="ve-input" value={v.description} onChange={(e) => s('description', e.target.value)} placeholder="e.g. Tempo to site" /></Labeled>
        <Labeled label="Date"><input className="ve-input" type="date" value={v.date} onChange={(e) => s('date', e.target.value)} /></Labeled>
        <Labeled label="Amount (₹)"><input className="ve-input" type="number" value={v.amount} onChange={(e) => s('amount', e.target.value)} placeholder="0" /></Labeled>
        <Labeled label="Tax (₹)"><input className="ve-input" type="number" value={v.tax} onChange={(e) => s('tax', e.target.value)} placeholder="0" /></Labeled>
      </div>
      <button className="ve-btn ve-btn-primary w-full" disabled={busy} onClick={submit}>🧾 Add Expense</button>
    </div>
  );
}

function EditItemButton({ item, onChanged }: { item: InventoryItem; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({
    name: item.name,
    category: item.category || '',
    unit_cost: String(num(item.unit_cost)),
    reorder_level: String(num(item.reorder_level)),
  });
  const s = (k: keyof typeof v, val: string) => setV((p) => ({ ...p, [k]: val }));

  return (
    <div className="relative">
      <div className="flex gap-1">
        <button title="Edit item" onClick={() => setOpen((o) => !o)}>✏️</button>
        <button title="Delete item (and its movements)" onClick={async () => { await deleteInventoryItem(item.id); await onChanged(); }}>🗑️</button>
      </div>
      {open && (
        <div className="absolute right-0 z-20 mt-1 p-2 rounded-lg space-y-1" style={{ background: '#0d1a2e', border: '1px solid #16304d', width: 220 }}>
          <input className="ve-input" value={v.name} onChange={(e) => s('name', e.target.value)} placeholder="Name" />
          <input className="ve-input" value={v.category} onChange={(e) => s('category', e.target.value)} placeholder="Category" />
          <input className="ve-input" type="number" value={v.unit_cost} onChange={(e) => s('unit_cost', e.target.value)} placeholder="Unit cost" />
          <input className="ve-input" type="number" value={v.reorder_level} onChange={(e) => s('reorder_level', e.target.value)} placeholder="Reorder level" />
          <div className="flex gap-1">
            <button
              className="ve-btn ve-btn-primary px-2 py-1 flex-1"
              onClick={async () => {
                await updateInventoryItem(item.id, {
                  name: v.name.trim() || item.name,
                  category: v.category.trim() || null,
                  unit_cost: num(v.unit_cost),
                  reorder_level: num(v.reorder_level),
                });
                setOpen(false);
                await onChanged();
              }}
            >
              Save
            </button>
            <button className="ve-btn px-2 py-1" onClick={() => setOpen(false)}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="ve-label">{label}</label>
      {children}
    </div>
  );
}
