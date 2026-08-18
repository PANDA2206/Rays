'use client';

// Quotation builder — fill the form, watch the document build, print to PDF.
//
// Nothing here is saved. Only the TEMPLATES (the standard bills of materials)
// live in the database; the quotation itself exists for as long as this tab is
// open and leaves as a PDF.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  getQuotationTemplates,
  saveQuotationTemplate,
  getInventoryStock,
} from '@/lib/db';
import type { QuotationTemplate, QuotationLine, InventoryItemStock } from '@/lib/types';
import { formatCurrency, num } from '@/lib/format';
import { useFirm } from '@/lib/firm';
import { Spinner, ItemOptions } from '@/components/ui';
import QuotationDoc, {
  computeTotals,
  UNITS_PER_KW_PER_DAY,
  SR_GROUPS,
  srLabel,
  type QuotationData,
} from '@/components/QuotationDoc';

const todayStr = () => new Date().toISOString().slice(0, 10);
const dmy = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}-${m}-${y}` : iso;
};

const BLANK_LINE: QuotationLine = { sr: 'III', item: '', spec: '', make: '', qty: '', unit: 'Nos', rate: '' };

// What a fresh quotation starts as. Named so the initial template pick can use
// them without making the load effect depend on live form state — re-running it
// on every keystroke would wipe a bill of materials you had already edited.
const DEFAULT_PHASE = '3ph' as const;
const DEFAULT_KW = '5';

export default function QuotationPage() {
  const { firmName, firmId } = useFirm();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<QuotationTemplate[]>([]);
  const [stock, setStock] = useState<InventoryItemStock[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // ── the quotation being built ───────────────────────────────────────────
  const [customerName, setCustomerName] = useState('');
  const [location, setLocation] = useState('');
  const [quotationDate, setQuotationDate] = useState(todayStr());
  const [phase, setPhase] = useState<'1ph' | '3ph'>(DEFAULT_PHASE);
  const [sizeKw, setSizeKw] = useState(DEFAULT_KW);
  const [lines, setLines] = useState<QuotationLine[]>([]);
  const [basicAmount, setBasicAmount] = useState('');
  const [gstPct, setGstPct] = useState('5');
  const [subsidy, setSubsidy] = useState('');
  const [tariff, setTariff] = useState('10');
  const [usage, setUsage] = useState<{ month: string; units: string; amount: string }[]>([]);
  const [contactName, setContactName] = useState('Prathmesh Deshmukh');
  const [contactMobile, setContactMobile] = useState('+91 7385117211');
  const [contactEmail, setContactEmail] = useState('voltedgeenergysolution@gmail.com');

  useEffect(() => {
    (async () => {
      const [tpl, st] = await Promise.all([getQuotationTemplates(), getInventoryStock()]);
      setTemplates(tpl);
      setStock(st.filter((s) => !firmId || s.firm_id === firmId));
      // start from whichever template fits the *default* phase/size
      const kw = num(DEFAULT_KW);
      const first =
        tpl.find((t) => t.phase === DEFAULT_PHASE && kw > num(t.min_kw) - 0.001 && kw <= num(t.max_kw)) ??
        tpl.find((t) => t.phase === DEFAULT_PHASE) ??
        null;
      if (first) {
        setTemplateId(first.id);
        setLines(first.lines.map((l) => ({ ...l })));
      }
      setLoading(false);
    })();
  }, [firmId]);

  // Suggest the template matching the chosen phase and size, until lines are edited.
  const suggested = useMemo(() => {
    const kw = num(sizeKw);
    return templates.find(
      (t) => t.phase === phase && kw > num(t.min_kw) - 0.001 && kw <= num(t.max_kw)
    ) ?? templates.find((t) => t.phase === phase) ?? null;
  }, [templates, phase, sizeKw]);

  const applyTemplate = (t: QuotationTemplate | null) => {
    if (!t) return;
    setTemplateId(t.id);
    setLines(t.lines.map((l) => ({ ...l })));
  };

  const data: QuotationData = {
    customerName,
    location,
    quotationDate: dmy(quotationDate),
    phase,
    sizeKw: num(sizeKw),
    lines,
    basicAmount: num(basicAmount),
    gstPct: num(gstPct),
    subsidy: num(subsidy),
    tariff: num(tariff),
    usage: usage
      .filter((u) => u.month.trim())
      .map((u) => ({ month: u.month, units: num(u.units), amount: num(u.amount) })),
    contactName,
    contactMobile,
    contactEmail,
  };
  const totals = computeTotals(data);

  // ── inventory helpers ───────────────────────────────────────────────────
  const addFromInventory = (id: string) => {
    const it = stock.find((s) => s.id === id);
    if (!it) return;
    // slot it after the last row of the same section, so groups stay together
    const row: QuotationLine = {
      sr: 'III', item: it.name, spec: it.category || '', make: '', qty: '1', unit: it.unit || 'Nos', rate: '',
    };
    setLines((p) => {
      const last = p.map((l) => l.sr).lastIndexOf(row.sr);
      if (last === -1) return [...p, row];
      return [...p.slice(0, last + 1), row, ...p.slice(last + 1)];
    });
  };

  /**
   * What each product costs us, as a band across every batch we hold of it.
   *
   * A product bought twice sits in stock at two rates; when pricing a quotation
   * you want to see both, so you can decide whether to sell at the cheapest
   * batch (no margin) or the dearest (margin built in). Keyed by lowercased
   * product name. Screen only — this never reaches the customer's PDF.
   */
  const priceBands = useMemo(() => {
    const m = new Map<string, { min: number; max: number; batches: number; qty: number }>();
    for (const it of stock) {
      const key = it.name.trim().toLowerCase();
      const cost = num(it.unit_cost);
      const cur = m.get(key);
      if (!cur) m.set(key, { min: cost, max: cost, batches: 1, qty: it.qty });
      else {
        cur.min = Math.min(cur.min, cost);
        cur.max = Math.max(cur.max, cost);
        cur.batches += 1;
        cur.qty += it.qty;
      }
    }
    return m;
  }, [stock]);

  const bandFor = (item: string) => priceBands.get(item.trim().toLowerCase());

  /**
   * What the quoted kit costs us, low and high.
   *
   * Stocked items contribute their batch range; anything we do not carry
   * contributes the rate typed on that row. Rows with neither are counted as
   * missing, so the total is never quietly understated.
   */
  const internalCost = useMemo(() => {
    let low = 0;
    let high = 0;
    let missing = 0;
    for (const l of lines) {
      const q = Number(l.qty);
      const mul = Number.isFinite(q) && q > 0 ? q : 1;
      const b = bandFor(l.item);
      if (b) {
        low += b.min * mul;
        high += b.max * mul;
      } else if (String(l.rate ?? '').trim() !== '' && num(l.rate) > 0) {
        low += num(l.rate) * mul;
        high += num(l.rate) * mul;
      } else {
        missing += 1;
      }
    }
    return { low, high, missing };
  }, [lines, priceBands]); // eslint-disable-line react-hooks/exhaustive-deps

  const setLine = (i: number, k: keyof QuotationLine, v: string) =>
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));

  if (loading) return <Spinner />;

  const noTemplates = templates.length === 0;

  return (
    <div>
      {/* everything in here is hidden when printing */}
      <div className="qt-screen-only">
        <div className="mb-3">
          <div className="text-lg font-bold">
            🧾 Quotation Builder
            <span className="ve-badge ml-2 align-middle" style={{ background: '#16304d', color: '#93c5fd', fontWeight: 700 }}>
              {firmName}
            </span>
          </div>
          <div className="text-slate-500 text-sm">
            Built here and downloaded as PDF. Nothing is saved to the database.
          </div>
        </div>

        {noTemplates && (
          <div className="mb-3 p-3 rounded-lg text-sm" style={{ background: '#1c1708', color: '#fbbf24' }}>
            ⚠️ No templates found — run <b>migration_quotation_templates.sql</b> in Supabase. You can still
            build a quotation by adding rows manually.
          </div>
        )}

        <div className="grid xl:grid-cols-[1fr_1.25fr] gap-4 items-start">
          {/* ── form ──────────────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="ve-card space-y-2">
              <div className="font-semibold text-sm">1 · Customer &amp; System</div>
              <div className="grid grid-cols-2 gap-2">
                <L label="Customer Name"><input className="ve-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Mr Naveen Munod" /></L>
                <L label="Location"><input className="ve-input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Malegaon" /></L>
                <L label="Quotation Date"><input className="ve-input" type="date" value={quotationDate} onChange={(e) => setQuotationDate(e.target.value)} /></L>
                <L label="Phase">
                  <select className="ve-input" value={phase} onChange={(e) => setPhase(e.target.value as '1ph' | '3ph')}>
                    <option value="1ph">1 Phase</option>
                    <option value="3ph">3 Phase</option>
                  </select>
                </L>
                <L label="System Size (kW)"><input className="ve-input" type="number" value={sizeKw} onChange={(e) => setSizeKw(e.target.value)} /></L>
                <L label="Template">
                  <select
                    className="ve-input"
                    value={templateId}
                    onChange={(e) => applyTemplate(templates.find((t) => t.id === e.target.value) ?? null)}
                  >
                    <option value="">— none —</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </L>
              </div>
              {suggested && suggested.id !== templateId && (
                <button className="ve-btn w-full" onClick={() => applyTemplate(suggested)}>
                  ↻ Use suggested template: <b>{suggested.name}</b>
                </button>
              )}
            </div>

            {/* ── BOM ─────────────────────────────────────────────── */}
            <div className="ve-card space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm">2 · Bill of Materials ({lines.length})</div>
                <select
                  className="ve-input py-1 text-xs"
                  style={{ width: 210 }}
                  value=""
                  onChange={(e) => e.target.value && setLines((p) => [...p, { ...BLANK_LINE, sr: e.target.value }])}
                >
                  <option value="">+ Add row to section…</option>
                  {SR_GROUPS.map((g) => <option key={g.sr} value={g.sr}>{g.sr} · {g.label}</option>)}
                </select>
              </div>

              <L label="Add from inventory">
                <select className="ve-input" value="" onChange={(e) => e.target.value && addFromInventory(e.target.value)}>
                  <option value="">— pick a stock item —</option>
                  <ItemOptions items={stock} />
                </select>
              </L>

              <div className="overflow-x-auto" style={{ maxHeight: 380, overflowY: 'auto' }}>
                <table className="w-full text-[0.7rem]">
                  <thead className="sticky top-0" style={{ background: '#0d1a2e' }}>
                    <tr className="text-slate-500 text-left">
                      {['Item', 'Specification', 'Make', 'Qty', 'Unit', 'Our cost', ''].map((h) => (
                        <th key={h} className="px-1 py-1 font-bold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => {
                      const newGroup = i === 0 || lines[i - 1].sr !== l.sr;
                      const band = bandFor(l.item);
                      return (
                        <Fragment key={i}>
                          {newGroup && (
                            <tr>
                              <td colSpan={7} className="pt-2 pb-1">
                                <div
                                  className="text-[0.66rem] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded inline-block"
                                  style={{ background: '#16304d', color: '#93c5fd' }}
                                >
                                  {l.sr} · {srLabel(l.sr)}
                                </div>
                              </td>
                            </tr>
                          )}
                          <tr>
                            {(['item', 'spec', 'make', 'qty', 'unit'] as const).map((k) => (
                              <td key={k} className="px-0.5 py-0.5">
                                <input
                                  className="ve-input py-0.5 text-[0.7rem]"
                                  style={{ minWidth: k === 'item' || k === 'spec' ? 120 : 58 }}
                                  value={l[k]}
                                  onChange={(e) => setLine(i, k, e.target.value)}
                                />
                              </td>
                            ))}
                            <td className="px-0.5 whitespace-nowrap">
                              {band ? (
                                <PriceBand band={band} qty={l.qty} />
                              ) : (
                                <input
                                  className="ve-input py-0.5 text-[0.68rem]"
                                  style={{ width: 82 }}
                                  type="number"
                                  placeholder="rate ₹"
                                  title="Not in stock — type what this costs us, per unit"
                                  value={l.rate ?? ''}
                                  onChange={(e) => setLine(i, 'rate', e.target.value)}
                                />
                              )}
                            </td>
                            <td className="px-0.5 whitespace-nowrap">
                              <select
                                className="ve-input py-0.5 text-[0.62rem]"
                                style={{ width: 52 }}
                                value={l.sr}
                                title="Section"
                                onChange={(e) => setLine(i, 'sr', e.target.value)}
                              >
                                {SR_GROUPS.map((g) => <option key={g.sr} value={g.sr}>{g.sr}</option>)}
                              </select>
                              <button className="ml-1" title="Remove row" onClick={() => setLines((p) => p.filter((_, x) => x !== i))}>🗑️</button>
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div
                className="text-[0.72rem] rounded-lg px-3 py-2"
                style={{ background: '#0a1322', border: '1px dashed #334155', color: '#94a3b8' }}
              >
                🔒 <b>Our cost for this kit</b> —{' '}
                {internalCost.low === internalCost.high ? (
                  <b style={{ color: '#93c5fd' }}>{formatCurrency(internalCost.low)}</b>
                ) : (
                  <>
                    cheapest batches <b style={{ color: '#22c55e' }}>{formatCurrency(internalCost.low)}</b> ·
                    dearest batches <b style={{ color: '#f59e0b' }}>{formatCurrency(internalCost.high)}</b>
                  </>
                )}
                {internalCost.missing > 0 && (
                  <span style={{ color: '#f59e0b' }}>
                    {' '}· ⚠ {internalCost.missing} row(s) have no cost — type a rate on them
                  </span>
                )}
                <div className="text-slate-600 mt-0.5">
                  Your floor. Price above it to make margin. Visible to you only — never on the customer&rsquo;s PDF.
                </div>
              </div>
            </div>

            {/* ── money ───────────────────────────────────────────── */}
            <div className="ve-card space-y-2">
              <div className="font-semibold text-sm">3 · Pricing</div>
              <div className="grid grid-cols-2 gap-2">
                <L label="Basic Amount (₹)">
                  <input className="ve-input" type="number" value={basicAmount} onChange={(e) => setBasicAmount(e.target.value)} placeholder="228571.43" />
                </L>
                <L label="GST %"><input className="ve-input" type="number" value={gstPct} onChange={(e) => setGstPct(e.target.value)} /></L>
                <L label="Subsidy (₹)"><input className="ve-input" type="number" value={subsidy} onChange={(e) => setSubsidy(e.target.value)} placeholder="0" /></L>
                <L label="Electricity Tariff (₹/unit)"><input className="ve-input" type="number" value={tariff} onChange={(e) => setTariff(e.target.value)} /></L>
              </div>
              {internalCost.high > 0 && (
                <div
                  className="text-[0.72rem] rounded-lg px-3 py-2"
                  style={{ background: '#0a1322', border: '1px dashed #334155' }}
                >
                  <div style={{ color: '#94a3b8' }}>
                    Kit costs us{' '}
                    <b style={{ color: '#22c55e' }}>{formatCurrency(internalCost.low)}</b>
                    {internalCost.high !== internalCost.low && (
                      <> – <b style={{ color: '#f59e0b' }}>{formatCurrency(internalCost.high)}</b></>
                    )}{' '}
                    — quote above this.
                    <button
                      className="ve-btn px-2 py-0.5 text-[0.66rem] ml-2"
                      onClick={() => setBasicAmount(String(Math.round(internalCost.high)))}
                      title="Start from cost, then raise it"
                    >
                      use {formatCurrency(internalCost.high)}
                    </button>
                  </div>
                  {num(basicAmount) > 0 && (
                    <div className="mt-1">
                      {num(basicAmount) >= internalCost.high ? (
                        <span style={{ color: '#22c55e' }}>
                          ▲ Margin <b>{formatCurrency(num(basicAmount) - internalCost.high)}</b>{' '}
                          ({Math.round(((num(basicAmount) - internalCost.high) / internalCost.high) * 100)}% over dearest cost)
                        </span>
                      ) : (
                        <span style={{ color: '#ef4444' }}>
                          ▼ Below cost by <b>{formatCurrency(internalCost.high - num(basicAmount))}</b> — you would lose money
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="text-[0.72rem] text-slate-400 leading-relaxed">
                GST <b>{formatCurrency(totals.gst, 2)}</b> · Final <b style={{ color: '#22c55e' }}>{formatCurrency(totals.finalCost, 2)}</b> · Net{' '}
                <b>{formatCurrency(totals.netCost, 2)}</b><br />
                {num(sizeKw)} kW × {UNITS_PER_KW_PER_DAY} units/day = <b>{totals.daily}</b>/day ·{' '}
                <b>{totals.yearly.toLocaleString('en-IN')}</b>/year · savings{' '}
                <b>{formatCurrency(totals.annualSavings)}</b> · payback{' '}
                <b style={{ color: '#f59e0b' }}>{totals.payback.toFixed(1)} yrs</b>
              </div>
            </div>

            {/* ── usage ───────────────────────────────────────────── */}
            <div className="ve-card space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm">4 · 12-Month Usage <span className="text-slate-500 font-normal">(optional)</span></div>
                <div className="flex gap-1">
                  <button className="ve-btn px-2 py-1 text-xs" onClick={() => setUsage(lastTwelveMonths())}>Fill months</button>
                  <button className="ve-btn px-2 py-1 text-xs" onClick={() => setUsage([])}>Clear</button>
                </div>
              </div>
              {usage.length === 0 ? (
                <div className="text-slate-600 text-xs">Empty — that page is left out of the PDF.</div>
              ) : (
                <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
                  {usage.map((u, i) => (
                    <div key={i} className="grid grid-cols-3 gap-1 mb-1">
                      <input className="ve-input py-0.5 text-xs" value={u.month} onChange={(e) => setUsage((p) => p.map((x, n) => (n === i ? { ...x, month: e.target.value } : x)))} />
                      <input className="ve-input py-0.5 text-xs" type="number" placeholder="units" value={u.units} onChange={(e) => setUsage((p) => p.map((x, n) => (n === i ? { ...x, units: e.target.value } : x)))} />
                      <input className="ve-input py-0.5 text-xs" type="number" placeholder="₹" value={u.amount} onChange={(e) => setUsage((p) => p.map((x, n) => (n === i ? { ...x, amount: e.target.value } : x)))} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── contact ─────────────────────────────────────────── */}
            <div className="ve-card space-y-2">
              <div className="font-semibold text-sm">5 · Contact on last page</div>
              <input className="ve-input" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Name" />
              <div className="grid grid-cols-2 gap-2">
                <input className="ve-input" value={contactMobile} onChange={(e) => setContactMobile(e.target.value)} placeholder="Mobile" />
                <input className="ve-input" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Email" />
              </div>
            </div>

            <button className="ve-btn ve-btn-primary w-full text-base py-3" onClick={() => window.print()}>
              ⬇️ Download PDF
            </button>
            <div className="text-slate-600 text-[0.7rem] text-center">
              Opens your print dialog — choose <b>Save as PDF</b>, and set Layout to <b>Landscape</b>.
            </div>

            <button className="ve-btn w-full" onClick={() => setShowTemplateEditor((s) => !s)}>
              {showTemplateEditor ? '▾' : '▸'} Edit saved templates
            </button>
            {showTemplateEditor && (
              <TemplateEditor
                templates={templates}
                onSaved={async () => setTemplates(await getQuotationTemplates())}
              />
            )}
          </div>

          {/* ── live preview ──────────────────────────────────────── */}
          <div>
            <div className="text-slate-400 text-xs mb-1 font-semibold">Preview — this is what prints</div>
            <div
              className="rounded-lg p-3 overflow-auto"
              style={{ background: '#334155', maxHeight: '78vh' }}
            >
              <div style={{ transform: 'scale(0.42)', transformOrigin: 'top left', width: '238%' }}>
                <QuotationDoc data={data} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* the real, unscaled document — only visible to the printer */}
      <div className="qt-print-only" ref={printRef}>
        <QuotationDoc data={data} />
      </div>

      <style jsx global>{`
        .qt-print-only { display: none; }
        @media print {
          .qt-screen-only { display: none !important; }
          .qt-print-only { display: block !important; }

          /* the sidebar and the welcome/logout bar are app furniture, not the
             document — without this they print on top of the cover page */
          .app-chrome, aside, header, nav { display: none !important; }

          /* strip the shell's own spacing so the sheets start at the paper edge */
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          body * { visibility: visible; }
          main { padding: 0 !important; margin: 0 !important; max-width: none !important; }

          /* Each sheet is exactly one page. A fixed height plus hidden overflow
             is what stops a few millimetres of spill becoming a blank page —
             which is what produced the empty pages after the cover and the
             sites. Photos are capped to match. */
          .qt-sheet {
            width: 297mm !important;
            height: 210mm !important;
            min-height: 0 !important;
            overflow: hidden !important;
            margin: 0 !important;
            box-shadow: none !important;
            break-after: page;
            page-break-after: always;
          }
          /* the bill of materials may legitimately need a second page for a
             long kit, so it grows instead of clipping */
          .qt-sheet--flow {
            height: auto !important;
            min-height: 210mm !important;
            overflow: visible !important;
          }

          /* no trailing blank page after the last sheet */
          .qt-sheet:last-child {
            break-after: auto;
            page-break-after: auto;
          }

          @page { size: A4 landscape; margin: 0; }
        }
      `}</style>
    </div>
  );
}

/** The cost band we hold this product at. Blank when it isn't a stock item. */
function PriceBand({
  band,
  qty,
}: {
  band?: { min: number; max: number; batches: number; qty: number };
  qty: string;
}) {
  if (!band) return <span className="text-slate-700 text-[0.65rem]">—</span>;
  const q = Number(qty);
  const mul = Number.isFinite(q) && q > 0 ? q : 1;
  const same = band.min === band.max;
  return (
    <span
      className="text-[0.62rem] px-1.5 py-0.5 rounded"
      style={{ background: '#0a1322', border: '1px dashed #334155', color: '#94a3b8' }}
      title={`${band.batches} batch(es) in stock · ${band.qty} on hand${mul > 1 ? ` · ×${mul}` : ''}`}
    >
      {same ? (
        <b style={{ color: '#93c5fd' }}>{formatCurrency(band.min * mul)}</b>
      ) : (
        <>
          <b style={{ color: '#22c55e' }}>{formatCurrency(band.min * mul)}</b>
          <span className="text-slate-600"> – </span>
          <b style={{ color: '#f59e0b' }}>{formatCurrency(band.max * mul)}</b>
        </>
      )}
    </span>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="ve-label">{label}</label>
      {children}
    </div>
  );
}

/** Last 12 months, newest first, as empty rows to type into. */
function lastTwelveMonths() {
  const out: { month: string; units: string; amount: string }[] = [];
  const d = new Date();
  for (let i = 0; i < 12; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({
      month: `${m.toLocaleString('en-US', { month: 'short' })}-${String(m.getFullYear()).slice(2)}`,
      units: '',
      amount: '',
    });
  }
  return out;
}

/** Edit the stored bills of materials, so standard kit changes without a deploy. */
function TemplateEditor({
  templates,
  onSaved,
}: {
  templates: QuotationTemplate[];
  onSaved: () => Promise<void>;
}) {
  const [id, setId] = useState(templates[0]?.id ?? '');
  const tpl = templates.find((t) => t.id === id);

  if (!tpl) return <div className="ve-card text-slate-500 text-sm">No templates to edit.</div>;

  return (
    <div className="ve-card space-y-2">
      <select className="ve-input" value={id} onChange={(e) => setId(e.target.value)}>
        {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      {/* keyed on the template, so switching gives a fresh draft with no effect */}
      <TemplateLines key={tpl.id} tpl={tpl} onSaved={onSaved} />
    </div>
  );
}

function TemplateLines({ tpl, onSaved }: { tpl: QuotationTemplate; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<QuotationLine[]>(() => tpl.lines.map((l) => ({ ...l })));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async () => {
    setBusy(true);
    await saveQuotationTemplate(tpl.id, { lines: draft });
    await onSaved();
    setBusy(false);
    setMsg('Saved.');
  };

  return (
    <>
      <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
        {draft.map((l, i) => (
          <div key={i} className="grid grid-cols-[34px_1fr_1fr_70px_50px_44px_20px] gap-1 mb-1">
            {(['sr', 'item', 'spec', 'make', 'qty', 'unit'] as const).map((k) => (
              <input
                key={k}
                className="ve-input py-0.5 text-[0.68rem]"
                value={l[k]}
                onChange={(e) => setDraft((p) => p.map((x, n) => (n === i ? { ...x, [k]: e.target.value } : x)))}
              />
            ))}
            <button title="Remove" onClick={() => setDraft((p) => p.filter((_, n) => n !== i))}>🗑️</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button className="ve-btn px-2 py-1 text-xs" onClick={() => setDraft((p) => [...p, { ...BLANK_LINE }])}>+ Row</button>
        <button className="ve-btn ve-btn-primary flex-1" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : '💾 Save template'}
        </button>
      </div>
      {msg && <div className="text-green-400 text-xs">{msg}</div>}
    </>
  );
}
