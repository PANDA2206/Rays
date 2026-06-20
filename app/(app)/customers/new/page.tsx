'use client';

// Add Project — ported from the "Add Project" section of Home.py.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createProject, addInstallment, getEpcs } from '@/lib/db';
import { formatCurrency, num } from '@/lib/format';

interface DraftInst {
  no: number;
  amount: number;
  due_date: string;
  status: 'pending' | 'paid';
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function AddProjectPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [execOpts, setExecOpts] = useState<string[]>(['Voltedge']);

  // customer + site
  const [f, setF] = useState({
    name: '', mobile: '', altMobile: '', email: '', aadhar: '', elecBill: '',
    addr: '', village: '', taluka: '', district: '', pin: '', latlng: '',
    createdDate: todayStr(), exec: 'Voltedge', size: '', conn: 'On-Grid',
    statusDisp: 'Active', notes: '',
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  // payment
  const [payMode, setPayMode] = useState<'CASH' | 'LOAN'>('CASH');
  const [cost, setCost] = useState('');
  const [advance, setAdvance] = useState('');
  const [subsidy, setSubsidy] = useState('');
  const [subsidyStatus, setSubsidyStatus] = useState<'pending' | 'disbursed'>('pending');
  const [bankLoan, setBankLoan] = useState('');
  const [bankQuot, setBankQuot] = useState('');

  // installments (separate lists for cash / bank)
  const [draftInsts, setDraftInsts] = useState<DraftInst[]>([]);
  const [bankInsts, setBankInsts] = useState<DraftInst[]>([]);
  const [iAmt, setIAmt] = useState('');
  const [iDue, setIDue] = useState(todayStr());
  const [iStatus, setIStatus] = useState<'pending' | 'paid'>('pending');

  useEffect(() => {
    getEpcs().then((rows) => {
      const opts = ['Voltedge', ...rows.map((e) => e.name).filter((n) => n && n.toLowerCase() !== 'voltedge')];
      setExecOpts(opts);
    });
  }, []);

  const instList = payMode === 'LOAN' ? bankInsts : draftInsts;
  const setInstList = payMode === 'LOAN' ? setBankInsts : setDraftInsts;

  const subCounted = subsidyStatus === 'disbursed' ? num(subsidy) : 0;
  const instPaidSum = instList.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
  const balance = num(cost) - num(advance) - subCounted - instPaidSum;
  const dueColor = balance >= 0 ? '#22c55e' : '#ef4444';

  const addInst = () => {
    const amt = num(iAmt);
    if (amt <= 0) {
      setError('Enter an installment amount.');
      return;
    }
    if (payMode === 'LOAN' && num(bankLoan) > 0) {
      const used = bankInsts.reduce((s, i) => s + i.amount, 0);
      if (used + amt > num(bankLoan) + 0.001) {
        setError(`Exceeds bank loan. Remaining: ${formatCurrency(num(bankLoan) - used)}`);
        return;
      }
    }
    setError('');
    setInstList((p) => [...p, { no: p.length + 1, amount: amt, due_date: iDue, status: iStatus }]);
    setIAmt('');
  };

  const removeInst = (idx: number) =>
    setInstList((p) => p.filter((_, i) => i !== idx).map((it, i) => ({ ...it, no: i + 1 })));

  const save = async () => {
    if (!f.name.trim()) {
      setError('Customer name is required.');
      return;
    }
    setSaving(true);
    setError('');
    const status = f.statusDisp === 'Completed' ? 'completed' : 'in_progress';
    try {
      const result = await createProject({
        customer_name: f.name.trim(),
        mobile: f.mobile,
        alt_mobile: f.altMobile,
        email: f.email,
        aadhar_number: f.aadhar,
        electricity_bill_id: f.elecBill,
        location: f.addr,
        installation_address: f.addr,
        village: f.village,
        taluka: f.taluka,
        district: f.district,
        pincode: f.pin,
        longitude_latitude: f.latlng,
        execution_partner: f.exec,
        system_size_kwp: num(f.size),
        connection_type: f.conn,
        project_status: status,
        payment_mode: payMode,
        total_cost: num(cost),
        amount_paid: num(cost) - balance,
        advance_amount: num(advance),
        subsidy_amount: num(subsidy),
        subsidy_status: subsidyStatus,
        bank_loan_amount: payMode === 'LOAN' ? num(bankLoan) : 0,
        bank_quotation_amount: payMode === 'LOAN' ? num(bankQuot) : 0,
        balance,
        net_payable: num(cost) - num(subsidy),
        notes: f.notes,
        created_at: f.createdDate,
      });
      if (!result) {
        setError('Project was NOT saved — check the database columns and try again.');
        setSaving(false);
        return;
      }
      for (const inst of [...draftInsts, ...bankInsts]) {
        await addInstallment({
          project_id: result.id,
          installment_no: inst.no,
          amount: inst.amount,
          due_date: inst.due_date,
          status: inst.status,
        });
      }
      router.push('/customers');
    } catch (e) {
      setError(`Save failed: ${(e as Error).message}`);
      setSaving(false);
    }
  };

  const bankUsed = bankInsts.reduce((s, i) => s + i.amount, 0);
  const bankRem = num(bankLoan) - bankUsed;

  return (
    <div>
      <div className="mb-4">
        <div className="text-xl font-extrabold">Add New Solar Project / Customer</div>
        <div className="text-slate-500 text-sm">Enter customer and project details to create a new solar EPC project</div>
      </div>

      {error && (
        <div className="mb-3 p-2.5 rounded-lg text-sm" style={{ background: '#450a0a', color: '#fca5a5' }}>
          ❌ {error}
        </div>
      )}

      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-4">
        {/* LEFT */}
        <div className="space-y-3">
          <Section n={1} title="Customer Information">
            <div className="grid grid-cols-3 gap-2">
              <Field label="Customer Name *" value={f.name} onChange={(v) => set('name', v)} placeholder="Enter full name" />
              <Field label="Mobile Number *" value={f.mobile} onChange={(v) => set('mobile', v)} placeholder="+91 mobile number" />
              <Field label="Alternative Mobile" value={f.altMobile} onChange={(v) => set('altMobile', v)} placeholder="+91 alternate" />
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <Field label="Email Address" value={f.email} onChange={(v) => set('email', v)} placeholder="Enter email" />
              <Field label="Aadhar Number" value={f.aadhar} onChange={(v) => set('aadhar', v)} placeholder="Aadhar number" />
              <Field label="Electricity Bill ID" value={f.elecBill} onChange={(v) => set('elecBill', v)} placeholder="Bill ID" />
            </div>
          </Section>

          <Section n={2} title="Site Information">
            <Field label="Installation Address *" value={f.addr} onChange={(v) => set('addr', v)} placeholder="Enter complete installation address" />
            <div className="grid grid-cols-3 gap-2 mt-2">
              <Field label="Village / Locality" value={f.village} onChange={(v) => set('village', v)} placeholder="Village" />
              <Field label="Taluka" value={f.taluka} onChange={(v) => set('taluka', v)} placeholder="Taluka" />
              <Field label="District" value={f.district} onChange={(v) => set('district', v)} placeholder="District" />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Field label="Pincode" value={f.pin} onChange={(v) => set('pin', v)} placeholder="Pincode" />
              <Field label="Longitude, Latitude" value={f.latlng} onChange={(v) => set('latlng', v)} placeholder="e.g. 72.8, 21.1" />
            </div>
            <div className="mt-2">
              <label className="ve-label">📅 Created Date</label>
              <input className="ve-input" type="date" value={f.createdDate} onChange={(e) => set('createdDate', e.target.value)} />
            </div>
          </Section>
        </div>

        {/* RIGHT */}
        <div className="space-y-3">
          <div className="ve-card">
            <label className="ve-label uppercase">Execution Partner</label>
            <select className="ve-input" value={f.exec} onChange={(e) => set('exec', e.target.value)}>
              {execOpts.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>

          <Section n={3} title="Project Information">
            <div className="grid grid-cols-2 gap-2">
              <Field label="System Size (kWp) *" value={f.size} onChange={(v) => set('size', v)} placeholder="0" type="number" />
              <div>
                <label className="ve-label">Connection Type *</label>
                <select className="ve-input" value={f.conn} onChange={(e) => set('conn', e.target.value)}>
                  <option>On-Grid</option>
                  <option>Off-Grid</option>
                  <option>Hybrid</option>
                </select>
              </div>
            </div>
            <div className="mt-2">
              <label className="ve-label">Project Status</label>
              <select className="ve-input" value={f.statusDisp} onChange={(e) => set('statusDisp', e.target.value)}>
                <option>Active</option>
                <option>Completed</option>
              </select>
            </div>
          </Section>

          {/* payment mode */}
          <div>
            <label className="ve-label uppercase">Payment Mode</label>
            <div className="grid grid-cols-2 gap-2">
              <button className={`ve-btn ${payMode === 'CASH' ? 've-btn-primary' : ''}`} onClick={() => setPayMode('CASH')}>CASH</button>
              <button className={`ve-btn ${payMode === 'LOAN' ? 've-btn-primary' : ''}`} onClick={() => setPayMode('LOAN')}>LOAN</button>
            </div>
          </div>

          <Field label="TOTAL PROJECT COST (₹)" value={cost} onChange={setCost} placeholder="0" type="number" />
          <Field label="ADVANCE AMOUNT (₹)" value={advance} onChange={setAdvance} placeholder="0" type="number" />

          <div>
            <label className="ve-label uppercase">Subsidy Amount (₹)</label>
            <div className="grid grid-cols-[1.4fr_0.8fr_0.9fr] gap-2">
              <input className="ve-input" type="number" value={subsidy} onChange={(e) => setSubsidy(e.target.value)} placeholder="0" />
              <button className={`ve-btn ${subsidyStatus === 'pending' ? 've-btn-primary' : ''}`} onClick={() => setSubsidyStatus('pending')}>Pending</button>
              <button className={`ve-btn ${subsidyStatus === 'disbursed' ? 've-btn-primary' : ''}`} onClick={() => setSubsidyStatus('disbursed')}>Disbursed</button>
            </div>
          </div>

          {payMode === 'LOAN' && (
            <>
              <Field label="BANK LOAN AMOUNT (₹)" value={bankLoan} onChange={setBankLoan} placeholder="0" type="number" />
              <Field label="BANK QUOTATION AMOUNT (₹)" value={bankQuot} onChange={setBankQuot} placeholder="0" type="number" />
            </>
          )}

          {/* due amount */}
          <div className="rounded-lg p-3" style={{ background: '#0f172a', borderLeft: `3px solid ${dueColor}` }}>
            <div className="text-slate-500 text-[0.68rem] uppercase">Due Amount (auto)</div>
            <div className="text-lg font-extrabold" style={{ color: dueColor }}>{formatCurrency(balance)}</div>
            <div className="text-slate-500 text-[0.68rem]">
              Cost − Advance − Subsidy − Paid Installments · {subsidyStatus === 'disbursed' ? 'incl. subsidy' : 'subsidy pending — excluded'}
            </div>
          </div>

          <div>
            <label className="ve-label">Notes</label>
            <textarea className="ve-input" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Any additional notes…" />
          </div>

          {/* installments */}
          <div className="rounded-lg p-3" style={{ background: '#1e293b' }}>
            <div className="font-bold text-[0.85rem] uppercase">
              {payMode === 'LOAN' ? '🏦 Add Installment From Bank Side' : '🏛️ Add Installments From Customer Side'}
            </div>
            <div className="text-slate-500 text-[0.72rem]">{payMode === 'LOAN' ? '(mostly 2 — 70% & 30%)' : '(mostly 3)'}</div>
          </div>

          {payMode === 'LOAN' && num(bankLoan) > 0 && (
            <div className="text-[0.72rem] text-slate-400">
              Installments: <b>{formatCurrency(bankUsed)}</b> / Bank Loan {formatCurrency(num(bankLoan))} ·{' '}
              {Math.abs(bankRem) < 0.01 ? (
                <b style={{ color: '#22c55e' }}>✓ Tallied</b>
              ) : bankRem < 0 ? (
                <b style={{ color: '#ef4444' }}>⚠ Exceeds loan</b>
              ) : (
                <b style={{ color: '#f59e0b' }}>Remaining {formatCurrency(bankRem)}</b>
              )}
            </div>
          )}

          {instList.map((inst, i) => (
            <div key={i} className="grid grid-cols-[0.4fr_1.2fr_1.2fr_0.8fr_0.5fr] items-center gap-1 text-[0.8rem]">
              <span className="text-slate-400">#{inst.no}</span>
              <span className="font-semibold">{formatCurrency(inst.amount)}</span>
              <span className="text-slate-500">{inst.due_date}</span>
              <span style={{ color: inst.status === 'paid' ? '#22c55e' : '#f59e0b' }}>
                {inst.status[0].toUpperCase() + inst.status.slice(1)}
              </span>
              <button className="ve-btn px-2 py-1" onClick={() => removeInst(i)}>🗑️</button>
            </div>
          ))}

          <div className="ve-card space-y-2">
            <div className="text-slate-500 text-xs">+ Add Installment #{instList.length + 1} — Amount &amp; Date</div>
            <div className="grid grid-cols-[1.4fr_1fr] gap-2">
              <input className="ve-input" type="number" value={iAmt} onChange={(e) => setIAmt(e.target.value)} placeholder="Amount (₹)" />
              <input className="ve-input" type="date" value={iDue} onChange={(e) => setIDue(e.target.value)} />
            </div>
            <select className="ve-input" value={iStatus} onChange={(e) => setIStatus(e.target.value as 'pending' | 'paid')}>
              <option value="pending">pending</option>
              <option value="paid">paid</option>
            </select>
            <button className="ve-btn w-full" onClick={addInst}>➕ Add Installment</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[3fr_1fr] gap-2 mt-4">
        <button className="ve-btn ve-btn-primary" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : '💾  SAVE Project'}
        </button>
        <button className="ve-btn" onClick={() => router.push('/customers')}>Cancel</button>
      </div>
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="ve-card" style={{ background: '#0d1a2e', borderColor: '#16304d' }}>
      <div className="flex items-center gap-2 pb-2">
        <div className="w-5.5 h-5.5 rounded-full flex items-center justify-center text-[0.7rem] font-bold text-white" style={{ background: '#dc2626', width: 22, height: 22 }}>
          {n}
        </div>
        <span className="font-bold">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="ve-label">{label}</label>
      <input className="ve-input" type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
