'use client';

// The quotation document itself — what gets printed.
//
// Each <Sheet> is one printed page. Everything here is plain HTML and inline
// styles on a white background, because it is printed, not viewed in the app's
// dark theme. Nothing is stored: this renders from props and goes straight to
// the printer.

import { formatCurrency } from '@/lib/format';
import type { QuotationLine } from '@/lib/types';

export interface QuotationData {
  customerName: string;
  location: string;
  quotationDate: string;
  phase: '1ph' | '3ph' | string;
  sizeKw: number;
  lines: QuotationLine[];
  basicAmount: number;
  gstPct: number;
  subsidy: number;
  tariff: number;
  /** [{ month: 'Aug-26', units: 648, amount: 28990 }] */
  usage: { month: string; units: number; amount: number }[];
  contactName: string;
  contactMobile: string;
  contactEmail: string;
}

/**
 * The six sections a bill of materials is organised into, matching the Sr No
 * column of the printed quotation. Shared with the builder so the form groups
 * rows exactly the way the customer will see them.
 */
export const SR_GROUPS: { sr: string; label: string }[] = [
  { sr: 'I',   label: 'Solar Panels' },
  { sr: 'II',  label: 'Inverter' },
  { sr: 'III', label: 'Electrical & Balance of System' },
  { sr: 'IV',  label: 'Structure & Mounting' },
  { sr: 'V',   label: 'Metering' },
  { sr: 'VI',  label: 'Liaisoning & Services' },
];

export const srLabel = (sr: string) =>
  SR_GROUPS.find((g) => g.sr === sr.trim().toUpperCase())?.label ?? 'Other';

/** Units generated per kW per day — 5 kW yields 9,000 units a year. */
export const UNITS_PER_KW_PER_DAY = 5;

export function computeTotals(d: QuotationData) {
  const gst = (d.basicAmount * d.gstPct) / 100;
  const finalCost = d.basicAmount + gst;
  const netCost = finalCost - d.subsidy;

  const daily = d.sizeKw * UNITS_PER_KW_PER_DAY;
  const monthly = daily * 30;
  const yearly = monthly * 12;

  const annualSavings = yearly * d.tariff;
  const payback = annualSavings > 0 ? netCost / annualSavings : 0;

  return { gst, finalCost, netCost, daily, monthly, yearly, annualSavings, payback };
}

const NAVY = '#1f3864';

/**
 * The name customers see on a quotation.
 *
 * Deliberately not the selected firm: the firm switcher decides whose books a
 * job belongs to, which is internal accounting. Quotations always go out under
 * the Voltedge brand, matching the logo.
 */
const BRAND = 'VOLTEDGE ENERGY SOLUTIONS';

function Sheet({
  children, last, bg, flow,
}: {
  children: React.ReactNode; last?: boolean; bg?: string;
  /** Let this sheet run onto extra pages instead of being clipped to one. */
  flow?: boolean;
}) {
  return (
    <section
      className={`qt-sheet${flow ? ' qt-sheet--flow' : ''}`}
      style={{
        ...(bg
          ? {
              backgroundImage: `linear-gradient(rgba(6,20,40,.45), rgba(6,20,40,.45)), url(${bg})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              WebkitPrintColorAdjust: 'exact',
              printColorAdjust: 'exact',
            }
          : {}),
        width: '297mm',
        minHeight: '210mm',
        backgroundColor: '#fff',
        color: '#111',
        padding: '14mm 16mm',
        margin: '0 auto 10mm',
        boxSizing: 'border-box',
        breakAfter: last ? 'auto' : 'page',
        fontFamily: 'Calibri, Segoe UI, Arial, sans-serif',
        boxShadow: '0 0 0 1px #d7dce5',
      }}
    >
      {children}
    </section>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ color: NAVY, fontSize: '22pt', fontWeight: 800, textDecoration: 'underline', margin: '0 0 8mm' }}>
      {children}
    </h2>
  );
}

/** Plain <img>: printed pages want the file as-is, not a responsive srcset. */
function Photo({ src, alt, maxH = '150mm' }: { src: string; alt: string; maxH?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      style={{
        // capped so a tall image can never push a sheet onto a second page
        width: '100%', maxHeight: maxH, height: 'auto',
        objectFit: 'contain', display: 'block', margin: '0 auto', borderRadius: '2mm',
      }}
    />
  );
}

function Bullets({ items }: { items: [string, string][] }) {
  return (
    <div style={{ display: 'grid', gap: '5mm' }}>
      {items.map(([head, rest]) => (
        <div key={head} style={{ display: 'flex', gap: '4mm', alignItems: 'flex-start' }}>
          <span style={{ color: '#f0a500', fontWeight: 900, fontSize: '13pt', lineHeight: 1 }}>✓</span>
          <p style={{ margin: 0, fontSize: '12pt', lineHeight: 1.45 }}>
            <b>{head}:</b> {rest}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function QuotationDoc({ data }: { data: QuotationData }) {
  const t = computeTotals(data);
  const phaseLabel = data.phase === '1ph' ? '1 Ph' : '3 Ph';
  const usageTotalUnits = data.usage.reduce((s, u) => s + (Number(u.units) || 0), 0);
  const usageTotalAmount = data.usage.reduce((s, u) => s + (Number(u.amount) || 0), 0);

  // how far each Sr No cell spans; null where the row above already covers it
  const srSpan: (number | null)[] = data.lines.map((l, i) => {
    if (i > 0 && data.lines[i - 1].sr === l.sr) return null;
    let n = 1;
    while (i + n < data.lines.length && data.lines[i + n].sr === l.sr) n += 1;
    return n;
  });

  const th: React.CSSProperties = {
    border: '1px solid #8ea9c1', background: '#bdd7ee', padding: '2mm',
    fontWeight: 700, fontSize: '10.5pt', textAlign: 'center',
  };
  const td: React.CSSProperties = {
    border: '1px solid #8ea9c1', padding: '1.6mm 2mm', fontSize: '10pt', textAlign: 'center',
  };

  return (
    <div className="qt-doc">
      {/* ── 1. Cover ─────────────────────────────────────────────────── */}
      <Sheet bg="/quotation/cover.jpg">
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ color: '#c9a800', fontSize: '30pt', fontWeight: 900, margin: 0, letterSpacing: '0.5pt', textShadow: '0 2px 6px rgba(0,0,0,.55)' }}>
            {BRAND}
          </h1>
          <div style={{ fontSize: '14pt', fontWeight: 700, color: '#fff', marginTop: '2mm', textShadow: '0 2px 5px rgba(0,0,0,.6)' }}>
            MNRE APPROVED SOLAR VENDOR
          </div>
          <div style={{ margin: '8mm 0', display: 'flex', justifyContent: 'center' }}>
            {/* the mark is navy-on-transparent, so it needs a light panel to read
                against the photo — and a plain <img> so it always prints */}
            <div
              style={{
                background: 'rgba(255,255,255,.94)',
                padding: '5mm 9mm',
                borderRadius: '4mm',
                boxShadow: '0 2mm 6mm rgba(0,0,0,.35)',
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="VOLTEDGE Energy Solutions" style={{ width: '78mm', height: 'auto', display: 'block' }} />
            </div>
          </div>
          <div style={{ background: NAVY, color: '#fff', display: 'inline-block', padding: '3mm 8mm', fontSize: '26pt', fontWeight: 800 }}>
            Rooftop Solar System Quotation
          </div>
        </div>
        <div style={{ marginTop: '12mm', fontSize: '15pt', fontWeight: 700, lineHeight: 2, color: '#fff', textShadow: '0 2px 5px rgba(0,0,0,.7)' }}>
          <div>Project Name: {data.customerName || '—'}</div>
          <div>Project Location: {data.location || '—'}</div>
          <div>Quotation Date: {data.quotationDate}</div>
          <div>
            <span style={{ background: '#ffff00', padding: '0 2mm' }}>
              System Size: {phaseLabel} {data.sizeKw} KW
            </span>
          </div>
        </div>
      </Sheet>

      {/* ── 2. Bill of materials ─────────────────────────────────────── */}
      <Sheet flow>
        <h2 style={{ ...th, fontSize: '13pt', margin: '0 0 0' }}>
          {data.sizeKw}KW {phaseLabel}-ON GRID ROOF TOP SOLAR SYSTEM
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Sr No', 'Item', 'Technical Specification', 'Make', 'Qty', 'Unit'].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l, i) => (
              <tr key={i}>
                {srSpan[i] !== null && (
                  <td style={{ ...td, fontWeight: 700 }} rowSpan={srSpan[i] as number}>{l.sr}</td>
                )}
                <td style={{ ...td, textAlign: 'left' }}>{l.item}</td>
                <td style={{ ...td, textAlign: 'left' }}>{l.spec}</td>
                <td style={td}>{l.make}</td>
                <td style={td}>{l.qty}</td>
                <td style={td}>{l.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Sheet>

      {/* ── 3. Financial proposal ────────────────────────────────────── */}
      <Sheet>
        <Title>FINANCIAL PROPOSAL:-</Title>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8mm' }}>
          <tbody>
            {[
              ['BASIC AMOUNT ( I+II+III+IV+V+VI)', formatCurrency(data.basicAmount, 2)],
              [`GST (${data.gstPct}%)`, formatCurrency(t.gst, 2)],
              ['FINAL PROJECT COST', formatCurrency(t.finalCost, 2)],
            ].map(([k, v]) => (
              <tr key={k}>
                <td style={{ ...td, textAlign: 'left', background: '#ddd9c3', fontWeight: 700, width: '50%' }}>{k}</td>
                <td style={{ ...td, background: '#ddd9c3', fontWeight: 700 }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8mm' }}>
          <thead>
            <tr>
              <th style={{ ...th, background: '#fce4d6' }}>Project Summary for</th>
              <th style={{ ...th, background: '#fce4d6' }}>{data.sizeKw}KW</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['System Cost', formatCurrency(t.finalCost, 2)],
              ['Subsidy', data.subsidy > 0 ? formatCurrency(data.subsidy, 2) : '-'],
              ['Net System Cost', formatCurrency(t.netCost, 2)],
              ['Annual Unit Generation', t.yearly.toLocaleString('en-IN')],
              ['Electricity Tarrif', formatCurrency(data.tariff, 2)],
              ['Annual Savings', formatCurrency(t.annualSavings, 2)],
            ].map(([k, v]) => (
              <tr key={k}>
                <td style={{ ...td, textAlign: 'left', background: '#ddebf7', fontWeight: 700 }}>{k}</td>
                <td style={{ ...td, background: '#ddebf7', fontWeight: 700 }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ border: '1px solid #999', padding: '3mm 5mm', display: 'inline-block', marginBottom: '4mm' }}>
          <b>Payback Period (years) =</b>{' '}
          <span style={{ display: 'inline-block', textAlign: 'center', borderBottom: '1px solid #000', padding: '0 4mm' }}>
            Net System Cost
          </span>{' '}
          / Annual Net Savings
        </div>
        <div style={{ background: '#ffff00', display: 'inline-block', padding: '2mm 6mm', fontWeight: 800, fontSize: '13pt' }}>
          Payback Period (years) = {t.payback.toFixed(1)} Years
        </div>
      </Sheet>

      {/* ── 4. Generation ────────────────────────────────────────────── */}
      <Sheet>
        <Title>Estimated Generation Report :-</Title>
        <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', margin: '18mm 0' }}>
          {[
            ['☀️', t.daily.toLocaleString('en-IN'), 'DAILY UNITS (KWH)'],
            ['📅', t.monthly.toLocaleString('en-IN'), 'MONTHLY UNITS (KWH)'],
            ['📈', t.yearly.toLocaleString('en-IN'), 'YEARLY UNITS (KWH)'],
          ].map(([icon, val, lbl]) => (
            <div key={lbl}>
              <div style={{ fontSize: '26pt' }}>{icon}</div>
              <div style={{ fontSize: '34pt', fontWeight: 800, color: NAVY }}>{val}</div>
              <div style={{ fontSize: '11pt', fontWeight: 700, color: '#666' }}>{lbl}</div>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', color: '#666', fontSize: '11pt' }}>
          *Generation varies based on weather conditions and shadow-free area
        </p>
      </Sheet>

      {/* ── 5. Usage pattern (only if entered) ───────────────────────── */}
      {data.usage.length > 0 && (
        <Sheet>
          <Title>Customer 12 Months Usage Pattern:-</Title>
          <table style={{ width: '70%', borderCollapse: 'collapse', margin: '0 auto' }}>
            <tbody>
              {data.usage.map((u, i) => (
                <tr key={i}>
                  <td style={{ ...td, fontSize: '12pt' }}>{u.month}</td>
                  <td style={{ ...td, fontSize: '12pt' }}>{u.units}</td>
                  <td style={{ ...td, fontSize: '12pt', textAlign: 'right' }}>{formatCurrency(u.amount, 2)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...td, fontWeight: 800, border: 'none' }}>TOTAL 12 MONTHS</td>
                <td style={{ ...td, fontWeight: 800, border: 'none' }}>{usageTotalUnits}</td>
                <td style={{ ...td, fontWeight: 800, border: 'none', textAlign: 'right' }}>
                  {formatCurrency(usageTotalAmount, 2)}
                </td>
              </tr>
            </tbody>
          </table>
        </Sheet>
      )}

      {/* ── 6. Customer scope ────────────────────────────────────────── */}
      <Sheet>
        <Title>Customer Scope</Title>
        <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '8mm', alignItems: 'center' }}>
        <Bullets
          items={[
            ['Rooftop Access', 'Providing safe and shadow-free access to the roof for material transport and installation.'],
            ['Meter Panel', 'Ensuring space availability for meter installation near the main distribution board.'],
            ['Approvals', 'Society NOC (if applicable) or building permission.'],
            ['Space Availability', 'Approximately 100 sq. ft. per kW of shadow-free area.'],
            ['Documentation', 'Providing valid Aadhar Card, Latest Electricity Bill, and Passport Photo.'],
            ['Internet', 'Wi-Fi connection for remote monitoring setup.'],
          ]}
        />
        <Photo src="/quotation/customer-scope.jpg" alt="Installation team at work" />
        </div>
      </Sheet>

      {/* ── 7. Vendor scope ──────────────────────────────────────────── */}
      <Sheet>
        <Title>Our Scope of Work (Vendor)</Title>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: '8mm', alignItems: 'center' }}>
        <Photo src="/quotation/system-diagram.jpg" alt="System schematic" />
        <Bullets
          items={[
            ['End-to-End Supply', 'Procurement and delivery of all high-quality solar components (Panels, Inverter, Structure, Wiring).'],
            ['Professional Installation', 'Skilled mounting of structures and panels ensuring stability and safety.'],
            ['Liaisoning', 'Complete assistance with MSEDCL / DISCOM for Net-Metering application and approvals.'],
            ['Commissioning', 'Testing the system, setting up the inverter, and connecting to the grid.'],
            ['Quality Check', 'Earthing resistance test and system performance verification.'],
            ['After-Sales Support', '3 years free local service support for maintenance and troubleshooting.'],
          ]}
        />
        </div>
      </Sheet>

      {/* ── 8. Terms ─────────────────────────────────────────────────── */}
      <Sheet>
        <Title>Terms &amp; Conditions</Title>
        <ul style={{ fontSize: '12pt', lineHeight: 1.7, paddingLeft: '6mm' }}>
          <li>Timeline: Installation will be completed within <b>50 to 60 working days</b> from the date of material delivery/advance payment.</li>
          <li>Brand Assurance: We guarantee the supply of quoted brands. In case of unavailability, an equivalent or better brand will be provided with prior consent.</li>
          <li>Warranty: Warranties are directly provided by the respective manufacturers. We assist in claiming them.</li>
          <li>Civil Work: Any extra civil work (elevated structure foundation, cable trenching) will be charged extra at actuals.</li>
          <li>Validity: This quotation is valid for <b>7 Days</b> from the date of issue.</li>
          <li>Generation: Solar generation figures are estimates and depend on sunlight availability.</li>
          <li>Subsidy will be directly credited to the customer&rsquo;s bank account within <b>15 to 30 Days</b> post complete system installation, so any payment should not be held for that reason.</li>
        </ul>
      </Sheet>

      {/* ── 9. Payment schedule ──────────────────────────────────────── */}
      <Sheet>
        <Title>Payment Schedule</Title>
        <Photo src="/quotation/payment-schedule.jpg" alt="50% advance, 40% before installation, 10% on commissioning" maxH="150mm" />
      </Sheet>

      {/* ── Why choose us ────────────────────────────────────────────── */}
      <Sheet>
        <Photo src="/quotation/why-choose-us.jpg" alt="Why choose us" maxH="180mm" />
      </Sheet>

      {/* ── Accomplished sites ───────────────────────────────────────── */}
      <Sheet>
        <Title>OUR ACCOMPLISHED SITES:</Title>
        <Photo src="/quotation/site-kalwan.jpg" alt="1.3 MW Kalwan industrial project" maxH="150mm" />
        <div style={{ textAlign: 'center', fontWeight: 800, fontSize: '15pt', marginTop: '4mm' }}>
          1.3 MW KALWAN INDUSTRIAL PROJECT
        </div>
      </Sheet>

      <Sheet>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10mm', alignItems: 'center' }}>
          <div>
            <Photo src="/quotation/site-residential.jpg" alt="8 kW residential installation" maxH="140mm" />
            <div style={{ textAlign: 'center', fontWeight: 800, fontSize: '14pt', marginTop: '3mm' }}>8KW RESIDENTIAL</div>
          </div>
          <div>
            <div style={{ textAlign: 'center', fontWeight: 800, fontSize: '14pt', marginBottom: '3mm' }}>12 KW COMMERCIAL</div>
            <Photo src="/quotation/site-commercial.jpg" alt="12 kW commercial installation" maxH="140mm" />
          </div>
        </div>
      </Sheet>

      {/* ── 10. Contact ──────────────────────────────────────────────── */}
      <Sheet last bg="/quotation/cover.jpg">
        <div style={{ textAlign: 'center', paddingTop: '20mm', color: '#fff', textShadow: '0 2px 6px rgba(0,0,0,.7)' }}>
          <h1 style={{ fontSize: '40pt', margin: '0 0 12mm', color: '#fff' }}>Thank You!</h1>
          <div style={{ fontSize: '14pt', lineHeight: 1.9, textAlign: 'left', maxWidth: '150mm', margin: '0 auto' }}>
            <div>For Further Discussion Please Contact on below Details</div>
            <div>Name: {data.contactName}</div>
            <div>Mob No: {data.contactMobile}</div>
            <div>Email: {data.contactEmail}</div>
          </div>
          <div style={{ marginTop: '10mm', display: 'inline-block' }}>
            <span style={{ background: '#2222cc', color: '#fff', padding: '1mm 3mm', fontSize: '14pt' }}>
              We look forward to serve you as our
            </span>
            <span style={{ background: '#ffff00', color: '#0a7d24', padding: '1mm 3mm', fontSize: '14pt', fontWeight: 800 }}>
              Go Green Customer
            </span>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
