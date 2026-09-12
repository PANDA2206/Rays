'use client';

// EPC Partners (admin) — ported from streamlit_app/modules/epc.py.

import { useEffect, useMemo, useState } from 'react';
import {
  getEpcs,
  getEpcTransactions,
  createEpc,
  createEpcTransaction,
  updateEpc,
  deleteEpc,
  deleteEpcTransaction,
  ensureInHouseEpc,
  getProjects,
  getEpcProjectFees,
  createEpcProjectFee,
  deleteEpcProjectFee,
  getInventoryStock,
  createInventoryMovement,
  createInventoryExpense,
  logActivity,
} from '@/lib/db';
import type { Epc, EpcTransaction, EpcProjectFee, Project, InventoryItemStock } from '@/lib/types';
import { formatCurrency, num, itemLabel } from '@/lib/format';
import { Spinner, ItemOptions } from '@/components/ui';
import { useFirm } from '@/lib/firm';

const GST_OPTS = [0, 5, 12, 18, 28];
const EXPENSE_CATS = ['Transport', 'Labour', 'Light Bill', 'Rent', 'Petrol', 'Other'];
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function EpcPage() {
  const { matches, firmId, firmName } = useFirm();
  const [loading, setLoading] = useState(true);
  const [epcs, setEpcs] = useState<Epc[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [txns, setTxns] = useState<EpcTransaction[]>([]);
  const [items, setItems] = useState<InventoryItemStock[]>([]);
  const [selName, setSelName] = useState('— Select EPC —');
  const [showAdd, setShowAdd] = useState(false);

  const reloadEpcs = async () => {
    let rows = await getEpcs();
    await ensureInHouseEpc(rows, firmId, firmName);
    rows = await getEpcs();
    setEpcs(rows.filter(matches));
  };

  useEffect(() => {
    (async () => {
      await reloadEpcs();
      setProjects((await getProjects()).filter(matches));
      setItems((await getInventoryStock()).filter(matches));
      setLoading(false);
    })();
  }, [firmId]); // eslint-disable-line react-hooks/exhaustive-deps

  const epc = epcs.find((e) => e.name === selName) ?? null;

  useEffect(() => {
    if (epc) getEpcTransactions(epc.id).then(setTxns);
    else setTxns([]);
  }, [epc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div>
        <div className="text-lg font-bold">🏭 EPC Partners — Funds &amp; GST <span className="ve-badge ml-2 align-middle" style={{ background: '#16304d', color: '#93c5fd', fontWeight: 700 }}>{firmName}</span></div>
        <div className="text-slate-500 text-sm">
          Internal accounting between Rays and execution partners (EPCs). Not linked to customer payments.
        </div>
      </div>

      <div className="grid md:grid-cols-[2fr_1fr] gap-3 items-start">
        <div>
          <label className="ve-label">🔍 Search / Select EPC</label>
          <select className="ve-input" value={selName} onChange={(e) => setSelName(e.target.value)}>
            <option>— Select EPC —</option>
            {epcs.map((e) => (
              <option key={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
        <div>
          <button className="ve-btn w-full" onClick={() => setShowAdd((s) => !s)}>➕ Add New EPC</button>
          {showAdd && (
            <AddEpcForm
              firmId={firmId}
              onAdded={async () => {
                setShowAdd(false);
                await reloadEpcs();
              }}
            />
          )}
        </div>
      </div>

      {!epc ? (
        <div className="ve-card text-slate-400 text-sm">
          Select an EPC above to view its funds, GST and transactions — or add a new one.
        </div>
      ) : (
        <EpcDetail
          epc={epc}
          projects={projects}
          txns={txns}
          items={items}
          onChanged={async () => {
            await reloadEpcs();
            setTxns(await getEpcTransactions(epc.id));
          }}
          onDeleted={async () => {
            setSelName('— Select EPC —');
            await reloadEpcs();
          }}
        />
      )}
    </div>
  );
}

function AddEpcForm({ firmId, onAdded }: { firmId: string | null; onAdded: () => void }) {
  const [v, setV] = useState({ name: '', mobile: '', email: '', address: '', aadhar: '' });
  const s = (k: keyof typeof v, val: string) => setV((p) => ({ ...p, [k]: val }));
  return (
    <div className="ve-card mt-2 space-y-2">
      {(['name', 'mobile', 'email', 'address', 'aadhar'] as const).map((k) => (
        <input key={k} className="ve-input" placeholder={k === 'name' ? 'Name *' : k[0].toUpperCase() + k.slice(1)} value={v[k]} onChange={(e) => s(k, e.target.value)} />
      ))}
      <button
        className="ve-btn ve-btn-primary w-full"
        onClick={async () => {
          if (!v.name.trim()) return;
          await createEpc({ ...v, name: v.name.trim(), personal_amount: 0, gst_received: 0, firm_id: firmId });
          await logActivity({ action: `Added EPC: ${v.name.trim()}`, entity_type: 'user' });
          onAdded();
        }}
      >
        ➕ Add EPC
      </button>
    </div>
  );
}

function EpcDetail({
  epc, projects, txns, items, onChanged, onDeleted,
}: {
  epc: Epc;
  projects: Project[];
  txns: EpcTransaction[];
  items: InventoryItemStock[];
  onChanged: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const systemCredited = projects
    .filter((p) => (p.execution_partner || '') === epc.name)
    .reduce((s, p) => s + num(p.amount_paid), 0);
  const personal = num(epc.personal_amount);

  const purchaseGstTotal = txns.reduce((s, t) => s + (num(t.purchase_base) * num(t.purchase_gst_pct)) / 100, 0);
  const saleGstTotal = txns.reduce((s, t) => s + (num(t.sale_base) * num(t.sale_gst_pct)) / 100, 0);
  // total purchase amount including GST (base + its GST)
  const purchaseWithGst = txns.reduce((s, t) => s + num(t.purchase_base) + (num(t.purchase_base) * num(t.purchase_gst_pct)) / 100, 0);
  const totalFunds = systemCredited + personal - purchaseWithGst;

  const gstPending = saleGstTotal - purchaseGstTotal;
  const gstReceived = num(epc.gst_received);
  const epcBalance = gstPending - gstReceived;

  // project fees received from this EPC
  const [fees, setFees] = useState<EpcProjectFee[]>([]);
  const [feeRefresh, setFeeRefresh] = useState(0);
  useEffect(() => {
    getEpcProjectFees(epc.id).then(setFees);
  }, [epc.id, feeRefresh]);
  const projectFeeTotal = fees.reduce((s, f) => s + num(f.amount), 0);
  const reloadFees = () => setFeeRefresh((x) => x + 1);
  const [showAddFee, setShowAddFee] = useState(false);

  const epcCustomers = useMemo(
    () =>
      Array.from(
        new Set([
          ...projects.filter((p) => (p.execution_partner || '') === epc.name && p.customer_name).map((p) => p.customer_name),
          ...txns.map((t) => t.customer_name).filter(Boolean) as string[],
        ])
      ).sort(),
    [projects, txns, epc.name]
  );

  const [showEdit, setShowEdit] = useState(false);
  const [showAddTxn, setShowAddTxn] = useState(false);

  const exportCsv = () => {
    const header = 'Customer,Purchase Material,Purchase Base,P.GST %,Sale Material,Sale Base,S.GST %\n';
    const body = txns
      .map((t) =>
        [t.customer_name, t.purchase_material, num(t.purchase_base), num(t.purchase_gst_pct), t.sale_material, num(t.sale_base), num(t.sale_gst_pct)]
          .map((x) => `"${x ?? ''}"`)
          .join(',')
      )
      .join('\n');
    const summary = `\n\nGST DETAILS\nPurchase GST Total,${purchaseGstTotal.toFixed(2)}\nSales GST Total,${saleGstTotal.toFixed(2)}\nGST Pending,${gstPending.toFixed(2)}\nTotal GST Received,${gstReceived.toFixed(2)}\nEPC Balance,${epcBalance.toFixed(2)}\n\nFUND DETAILS\nSystem Credited,${systemCredited.toFixed(2)}\nPersonal,${personal.toFixed(2)}\nTotal Funds,${totalFunds.toFixed(2)}\n`;
    downloadCsv(`epc_${epc.name}_ledger.csv`, header + body + summary);
  };

  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-2 gap-3">
        <div className="ve-card" style={{ background: '#0d1a2e', borderColor: '#16304d' }}>
          <div className="font-bold text-slate-200 mb-3">💰 FUND DETAILS</div>
          <KV label="Total System Amount Credited (live)" value={formatCurrency(systemCredited)} color="#3b82f6" />
          <KV label="Total Personal Amount (from EPC)" value={formatCurrency(personal)} color="#a78bfa" />
          <KV label="Total Purchase Amount (with GST)" value={`− ${formatCurrency(purchaseWithGst)}`} color="#ef4444" />
          <hr style={{ borderColor: '#16304d', margin: '6px 0 8px' }} />
          <KV label="Total Funds Available (System + Personal − Purchase)" value={formatCurrency(totalFunds)} color={totalFunds >= 0 ? '#22c55e' : '#ef4444'} />
        </div>
        <div className="ve-card" style={{ background: '#0d1a2e', borderColor: '#16304d' }}>
          <div className="font-bold text-slate-200 mb-3">🧾 GST DETAILS</div>
          <KV label="GST Pending (Sales − Purchase)" value={formatCurrency(gstPending)} color="#f59e0b" />
          <KV label="Total GST Received" value={formatCurrency(gstReceived)} color="#22c55e" />
          <hr style={{ borderColor: '#16304d', margin: '6px 0 8px' }} />
          <KV label="EPC Balance (Pending − Received)" value={formatCurrency(epcBalance)} color={epcBalance > 0 ? '#ef4444' : '#22c55e'} />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button className="ve-btn" onClick={() => setShowEdit((s) => !s)}>✏️ Edit EPC details / funds</button>
        <button className="ve-btn" onClick={() => setShowAddTxn((s) => !s)}>➕ Add Purchase / Sale Entry</button>
        {txns.length > 0 && <button className="ve-btn" onClick={exportCsv}>⬇️ Export Ledger + Summary</button>}
        <button className="ve-btn" onClick={() => setShowAddFee((s) => !s)}>💵 Add Project Fee from EPC</button>
      </div>

      {showEdit && <EditEpcForm epc={epc} onSaved={async () => { setShowEdit(false); await onChanged(); }} onDeleted={onDeleted} />}
      {showAddTxn && (
        <AddTxnForm
          epcId={epc.id}
          epcName={epc.name}
          customers={epcCustomers}
          items={items}
          onAdded={async () => { setShowAddTxn(false); await onChanged(); }}
        />
      )}
      {showAddFee && (
        <AddFeeForm
          epcId={epc.id}
          epcName={epc.name}
          customers={epcCustomers}
          onAdded={async () => { setShowAddFee(false); reloadFees(); }}
        />
      )}

      {/* project fees */}
      <div className="font-bold text-slate-200">💵 PROJECT FEES RECEIVED — {epc.name}</div>
      {fees.length === 0 ? (
        <div className="ve-card text-slate-400 text-sm">No project fees recorded. Use “Add Project Fee from EPC”.</div>
      ) : (
        <div className="ve-panel overflow-x-auto">
          <table className="w-full text-[0.78rem]">
            <thead>
              <tr className="text-slate-500 text-left" style={{ background: '#0f1b2e' }}>
                {['Customer', 'Date', 'Amount', ''].map((h) => (
                  <th key={h} className="px-2 py-2 font-bold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fees.map((f) => (
                <tr key={f.id} style={{ borderTop: '1px solid #1e293b' }}>
                  <td className="px-2 py-1.5">{f.customer_name || '-'}</td>
                  <td className="px-2 py-1.5">{f.fee_date || '-'}</td>
                  <td className="px-2 py-1.5 text-green-400 font-semibold">{formatCurrency(num(f.amount))}</td>
                  <td className="px-2 py-1.5">
                    <button title="Delete fee" onClick={async () => { await deleteEpcProjectFee(f.id); reloadFees(); }}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-slate-400 text-sm">
        Total Project Fee Received from {epc.name}: <b style={{ color: '#22c55e' }}>{formatCurrency(projectFeeTotal)}</b>
      </div>

      {/* ledger */}
      <div className="font-bold text-slate-200">📒 PURCHASE / SALE LEDGER — {epc.name}</div>
      {txns.length === 0 ? (
        <div className="ve-card text-slate-400 text-sm">No transactions yet. Add the first purchase/sale entry above.</div>
      ) : (
        <div className="ve-panel overflow-x-auto">
          <table className="w-full text-[0.78rem]">
            <thead>
              <tr className="text-slate-500 text-left" style={{ background: '#0f1b2e' }}>
                {['Customer', 'Purchase Mat.', 'P.Base', 'P.GST%', 'P.GST', 'P.Invoice', 'Sale Mat.', 'S.Base', 'S.GST%', 'S.GST', 'S.Invoice', ''].map((h) => (
                  <th key={h} className="px-2 py-2 font-bold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => {
                const pGst = (num(t.purchase_base) * num(t.purchase_gst_pct)) / 100;
                const sGst = (num(t.sale_base) * num(t.sale_gst_pct)) / 100;
                return (
                  <tr key={t.id} style={{ borderTop: '1px solid #1e293b' }}>
                    <td className="px-2 py-1.5">{t.customer_name}</td>
                    <td className="px-2 py-1.5">{t.purchase_material}</td>
                    <td className="px-2 py-1.5">{formatCurrency(num(t.purchase_base))}</td>
                    <td className="px-2 py-1.5">{num(t.purchase_gst_pct)}%</td>
                    <td className="px-2 py-1.5">{formatCurrency(pGst)}</td>
                    <td className="px-2 py-1.5 text-slate-400">{t.purchase_invoice_no || '-'}</td>
                    <td className="px-2 py-1.5">{t.sale_material}</td>
                    <td className="px-2 py-1.5">{formatCurrency(num(t.sale_base))}</td>
                    <td className="px-2 py-1.5">{num(t.sale_gst_pct)}%</td>
                    <td className="px-2 py-1.5">{formatCurrency(sGst)}</td>
                    <td className="px-2 py-1.5 text-slate-400">{t.sale_invoice_no || '-'}</td>
                    <td className="px-2 py-1.5">
                      <button
                        title="Delete entry"
                        onClick={async () => { await deleteEpcTransaction(t.id); await onChanged(); }}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {txns.length > 0 && (
        <div className="text-slate-400 text-sm">
          Totals — Purchase GST: <b className="text-slate-300">{formatCurrency(purchaseGstTotal)}</b> · Sales GST:{' '}
          <b className="text-slate-300">{formatCurrency(saleGstTotal)}</b> · GST Pending:{' '}
          <b style={{ color: '#f59e0b' }}>{formatCurrency(gstPending)}</b>
        </div>
      )}
    </div>
  );
}

function EditEpcForm({ epc, onSaved, onDeleted }: { epc: Epc; onSaved: () => Promise<void>; onDeleted: () => Promise<void> }) {
  const [v, setV] = useState({
    personal_amount: String(num(epc.personal_amount)),
    gst_received: String(num(epc.gst_received)),
    mobile: epc.mobile ?? '',
    email: epc.email ?? '',
    address: epc.address ?? '',
    aadhar: epc.aadhar ?? '',
  });
  const s = (k: keyof typeof v, val: string) => setV((p) => ({ ...p, [k]: val }));
  return (
    <div className="ve-card space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="Total Personal Amount (₹)"><input className="ve-input" type="number" value={v.personal_amount} onChange={(e) => s('personal_amount', e.target.value)} /></Labeled>
        <Labeled label="Total GST Received (₹)"><input className="ve-input" type="number" value={v.gst_received} onChange={(e) => s('gst_received', e.target.value)} /></Labeled>
        <Labeled label="Mobile"><input className="ve-input" value={v.mobile} onChange={(e) => s('mobile', e.target.value)} /></Labeled>
        <Labeled label="Email"><input className="ve-input" value={v.email} onChange={(e) => s('email', e.target.value)} /></Labeled>
        <Labeled label="Address"><input className="ve-input" value={v.address} onChange={(e) => s('address', e.target.value)} /></Labeled>
        <Labeled label="Aadhar Card"><input className="ve-input" value={v.aadhar} onChange={(e) => s('aadhar', e.target.value)} /></Labeled>
      </div>
      <div className="flex gap-2">
        <button
          className="ve-btn ve-btn-primary"
          onClick={async () => {
            await updateEpc(epc.id, {
              personal_amount: num(v.personal_amount),
              gst_received: num(v.gst_received),
              mobile: v.mobile,
              email: v.email,
              address: v.address,
              aadhar: v.aadhar,
            });
            await logActivity({ action: `Updated EPC: ${epc.name}`, entity_type: 'user' });
            await onSaved();
          }}
        >
          💾 Save EPC
        </button>
        <button
          className="ve-btn"
          onClick={async () => {
            await deleteEpc(epc.id);
            await logActivity({ action: `Deleted EPC: ${epc.name}`, entity_type: 'user' });
            await onDeleted();
          }}
        >
          🗑️ Delete this EPC
        </button>
      </div>
    </div>
  );
}

function AddTxnForm({
  epcId, epcName, customers, items, onAdded,
}: {
  epcId: string;
  epcName: string;
  customers: string[];
  items: InventoryItemStock[];
  onAdded: () => Promise<void>;
}) {
  const [v, setV] = useState({
    customer: '', purchaseItemId: '', pqty: '', ppct: 5, pinv: '',
    saleItemId: '', sqty: '', sbasePerUnit: '', spct: 5, sinv: '',
    expCat: 'Transport', expAmt: '',
  });
  const [busy, setBusy] = useState(false);
  const s = (k: keyof typeof v, val: string | number) => setV((p) => ({ ...p, [k]: val }));

  const purchaseItem = items.find((i) => i.id === v.purchaseItemId);
  const pbase = num(v.pqty) * num(purchaseItem?.unit_cost); // auto from inventory cost × qty
  const pg = (pbase * v.ppct) / 100;

  const saleItem = items.find((i) => i.id === v.saleItemId);
  const sbase = num(v.sqty) * num(v.sbasePerUnit); // total sale = qty × per-unit
  const sg = (sbase * v.spct) / 100;

  const submit = async () => {
    setBusy(true);
    const row = await createEpcTransaction({
      epc_id: epcId,
      customer_name: v.customer,
      // full batch label, so the ledger keeps showing which batch was used even
      // after the item's rate is changed or the item is deleted
      purchase_material: purchaseItem ? itemLabel(purchaseItem) : '',
      purchase_base: pbase,
      purchase_gst_pct: v.ppct,
      purchase_invoice_no: v.pinv,
      sale_material: saleItem ? itemLabel(saleItem) : '',
      sale_base: sbase,
      sale_gst_pct: v.spct,
      sale_invoice_no: v.sinv,
      sale_item_id: v.saleItemId || null,
      sale_quantity: num(v.sqty),
    });
    // Sale → auto Stock Out in inventory (linked back to this EPC entry)
    if (row && v.saleItemId && num(v.sqty) > 0) {
      await createInventoryMovement({
        item_id: v.saleItemId,
        type: 'out',
        quantity: num(v.sqty),
        base_amount: sbase,
        gst_pct: v.spct,
        party: v.customer || epcName,
        reference: `EPC: ${epcName}${v.sinv ? ` · ${v.sinv}` : ''}`,
        source: 'epc_sale',
        source_ref: row.id,
        movement_date: todayISO(),
      });
    }
    // Sale-side expense (transport/labour/…) → tracked expense, used in gross profit
    if (row && num(v.expAmt) > 0) {
      await createInventoryExpense({
        category: v.expCat,
        description: `EPC sale: ${epcName}${v.customer ? ` · ${v.customer}` : ''}`,
        amount: num(v.expAmt),
        expense_date: todayISO(),
        source: 'epc_sale',
        source_ref: row.id,
      });
    }
    await logActivity({
      action: `EPC entry added (${epcName})`,
      entity_type: 'installment',
      details: `Purchase ${formatCurrency(pbase)} / Sale ${formatCurrency(sbase)}`,
    });
    setBusy(false);
    await onAdded();
  };

  return (
    <div className="ve-card space-y-2">
      <Labeled label="Customer Name">
        <input className="ve-input" list="epc-cust" value={v.customer} onChange={(e) => s('customer', e.target.value)} placeholder="Select or type a customer…" />
        <datalist id="epc-cust">{customers.map((c) => <option key={c} value={c} />)}</datalist>
      </Labeled>

      <div className="font-semibold text-sm">Purchase (Rays buys) — base auto-calculated from stock cost × qty</div>
      <div className="grid grid-cols-5 gap-2">
        <select className="ve-input" value={v.purchaseItemId} onChange={(e) => s('purchaseItemId', e.target.value)}>
          <option value="">— Material (from stock) —</option>
          <ItemOptions items={items} />
        </select>
        <input className="ve-input" type="number" placeholder="Qty" value={v.pqty} onChange={(e) => s('pqty', e.target.value)} />
        <input className="ve-input" value={formatCurrency(pbase)} disabled title="Purchase base = qty × stock unit cost" />
        <select className="ve-input" value={v.ppct} onChange={(e) => s('ppct', Number(e.target.value))}>{GST_OPTS.map((g) => <option key={g} value={g}>{g}%</option>)}</select>
        <input className="ve-input" placeholder="Purchase Invoice No" value={v.pinv} onChange={(e) => s('pinv', e.target.value)} />
      </div>
      {purchaseItem && <div className="text-slate-500 text-[0.7rem]">Stock cost {formatCurrency(num(purchaseItem.unit_cost))}/{purchaseItem.unit} × {v.pqty || 0} = base {formatCurrency(pbase)}</div>}

      <div className="font-semibold text-sm">Sale (Rays sells to EPC) — reduces stock</div>
      <div className="grid grid-cols-5 gap-2">
        <select className="ve-input" value={v.saleItemId} onChange={(e) => s('saleItemId', e.target.value)}>
          <option value="">— Item (from stock) —</option>
          <ItemOptions items={items} />
        </select>
        <input className="ve-input" type="number" placeholder="Qty" value={v.sqty} onChange={(e) => s('sqty', e.target.value)} />
        <input className="ve-input" type="number" placeholder="Sale Base / Unit (₹)" value={v.sbasePerUnit} onChange={(e) => s('sbasePerUnit', e.target.value)} />
        <select className="ve-input" value={v.spct} onChange={(e) => s('spct', Number(e.target.value))}>{GST_OPTS.map((g) => <option key={g} value={g}>{g}%</option>)}</select>
        <input className="ve-input" placeholder="Sale Invoice No" value={v.sinv} onChange={(e) => s('sinv', e.target.value)} />
      </div>
      {saleItem && <div className="text-slate-500 text-[0.7rem]">Sale total {v.sqty || 0} × {formatCurrency(num(v.sbasePerUnit))} = {formatCurrency(sbase)} · Stock Out of {v.sqty || 0} {saleItem.unit} will be recorded.</div>}

      <div className="font-semibold text-sm">Sale Expense (transport / labour / …)</div>
      <div className="grid grid-cols-2 gap-2">
        <select className="ve-input" value={v.expCat} onChange={(e) => s('expCat', e.target.value)}>{EXPENSE_CATS.map((c) => <option key={c}>{c}</option>)}</select>
        <input className="ve-input" type="number" placeholder="Expense Amount (₹)" value={v.expAmt} onChange={(e) => s('expAmt', e.target.value)} />
      </div>

      <div className="text-slate-500 text-xs">
        Total Purchase {formatCurrency(pbase + pg)} · Total Sale {formatCurrency(sbase + sg)} · GST diff {formatCurrency(sg - pg)}
      </div>
      <button className="ve-btn ve-btn-primary w-full" disabled={busy} onClick={submit}>➕ Add Entry</button>
    </div>
  );
}

function AddFeeForm({
  epcId, epcName, customers, onAdded,
}: {
  epcId: string;
  epcName: string;
  customers: string[];
  onAdded: () => Promise<void>;
}) {
  const [customer, setCustomer] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (num(amount) <= 0) return;
    setBusy(true);
    await createEpcProjectFee({ epc_id: epcId, customer_name: customer, fee_date: date, amount: num(amount) });
    await logActivity({
      action: `Project fee from ${epcName}`,
      entity_type: 'installment',
      details: `${customer || '-'} · ${formatCurrency(num(amount))} · ${date}`,
    });
    setBusy(false);
    await onAdded();
  };

  return (
    <div className="ve-card space-y-2">
      <div className="font-semibold text-sm">💵 Add Project Fee received from {epcName}</div>
      <div className="grid grid-cols-3 gap-2">
        <Labeled label="Customer">
          <input className="ve-input" list="epc-fee-cust" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Select or type a customer…" />
          <datalist id="epc-fee-cust">{customers.map((c) => <option key={c} value={c} />)}</datalist>
        </Labeled>
        <Labeled label="Date"><input className="ve-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Labeled>
        <Labeled label="Amount (₹)"><input className="ve-input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></Labeled>
      </div>
      <button className="ve-btn ve-btn-primary w-full" disabled={busy} onClick={submit}>➕ Add Project Fee</button>
    </div>
  );
}

function KV({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="mb-2.5">
      <div className="text-slate-500 text-[0.68rem] uppercase tracking-wide">{label}</div>
      <div className="font-bold mt-0.5" style={{ color }}>{value}</div>
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

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
