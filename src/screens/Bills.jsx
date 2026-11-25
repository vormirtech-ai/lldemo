import { useEffect, useState } from 'preact/hooks';
import { db, getSettings, audit } from '../db.js';
import { can } from '../auth.js';
import { computeTotals, paymentSummary } from '../calc.js';
import { money, fmtDate, todayISO, normalizePhone, uid, displayPhone } from '../format.js';
import { useLive, go, TopBar, Btn, Badge, Empty, Input, Num, Field, Select, Modal, toast, confirmDialog, promptDialog } from '../ui.jsx';
import { blankBill, saveBill, finalizeBill, voidBill, addPayment, voidPayment, billDisplayStatus, refreshBillPaymentCache } from '../repo.js';
import { ClientSection, EventSection, LinesEditor, PricingSection, TotalsView, TermsSection, useDocState, discountAllowed } from './docparts.jsx';
import { PdfPreview } from '../PdfPreview.jsx';
import { buildInvoicePdf } from '../pdf/invoicePdf.js';
import { safeFileName } from '../pdf/common.js';

const FILTERS = ['All', 'Draft', 'Unpaid', 'Partially Paid', 'Paid', 'Void'];
export const METHODS = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque', 'Other'];

export function BillList({ user }) {
  const [q, setQ] = useState('');
  const [st, setSt] = useState('All');
  const list = useLive(() => db.invoices.orderBy('updatedAt').reverse().toArray(), [], null);
  if (!list) return null;
  const f = q.trim().toLowerCase();
  const shown = list.filter((x) => (st === 'All' || billDisplayStatus(x) === st) && (!f || [x.number, x.quotationNumber, x.client?.name, x.client?.phone, x.client?.whatsapp, x.event?.venue].join(' ').toLowerCase().includes(f)));
  return (
    <>
      <TopBar title="Final bills">{can(user, 'bill.create') && <Btn kind="primary" icon="plus" onClick={() => go('/bills/new')}>New<span class="hide-phone">&nbsp;bill</span></Btn>}</TopBar>
      <div class="content">
        <Input placeholder="Search bill no., quotation no., client, phone" value={q} onInput={setQ} />
        <div class="chips mt">{FILTERS.map((s) => <button class={'chip' + (st === s ? ' on' : '')} onClick={() => setSt(s)}>{s}</button>)}</div>
        <div class="list mt">
          {shown.map((x) => {
            const ds = billDisplayStatus(x);
            return (
              <a class="item" href={'#/bills/' + x.id}>
                <div class="grow">
                  <div class="row" style="gap:8px"><span class="main-t">{x.client?.name || '—'}</span>{x.demo && <span class="demo-tag">DEMO</span>}<Badge s={ds} /></div>
                  <div class="small muted ellipsis">{x.number || 'Draft (no number yet)'} • {fmtDate(x.invoiceDate)} {x.quotationNumber ? '• from ' + x.quotationNumber : ''}</div>
                </div>
                <div class="amt">{money(x.grandTotal)}{x.status === 'Finalized' && x.balance > 0 && <div class="tiny" style="color:var(--maroon)">Due {money(x.balance)}</div>}</div>
              </a>
            );
          })}
          {!shown.length && <Empty title="No bills">{list.length ? 'Try a different filter.' : 'Create a bill from an accepted quotation, or a standalone bill.'}</Empty>}
        </div>
      </div>
    </>
  );
}

export function BillEditor({ id, user, settings }) {
  const [doc, set, reset, dirty] = useDocState(null);
  const [preview, setPreview] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [editFinal, setEditFinal] = useState(false);
  const [saving, setSaving] = useState(false);
  const payments = useLive(() => (doc?.id ? db.payments.where('invoiceId').equals(doc.id).toArray() : Promise.resolve([])), [doc?.id], []);
  useEffect(() => {
    (async () => {
      if (id === 'new') reset(await blankBill());
      else { const b = await db.invoices.get(id); if (!b) { toast('Bill not found', 'error'); go('/bills'); return; } reset(b); }
    })();
  }, [id]);
  if (!doc) return null;
  const isNew = !doc.id;
  const finalized = doc.status === 'Finalized';
  const locked = doc.status === 'Void' || (finalized && !editFinal) || !can(user, 'bill.create');
  const t = computeTotals(doc);
  const ps = paymentSummary(t.grandTotal, payments);

  const validate = () => {
    if (!doc.client.name.trim()) return 'Enter the client name';
    if (!normalizePhone(doc.client.whatsapp || doc.client.phone)) return 'Enter the client mobile/WhatsApp number';
    if (!doc.lines.length && !doc.package.enabled) return 'Add at least one item';
    if (!discountAllowed(doc, user, settings)) return `Discount above ${settings.cashierMaxDiscountPct}% needs a manager`;
    if (finalized && t.grandTotal < ps.paid) return `Total cannot be less than amount already paid (${money(ps.paid)})`;
    return '';
  };
  const save = async () => {
    const e = validate();
    if (e) { toast(e, 'error'); return null; }
    setSaving(true);
    try {
      const saved = await saveBill(doc, { allowFinalEdit: editFinal });
      if (finalized) await refreshBillPaymentCache(saved.id);
      reset(await db.invoices.get(saved.id));
      setEditFinal(false);
      toast('Bill saved');
      if (isNew) history.replaceState(null, '', '#/bills/' + saved.id);
      return saved;
    } catch (err) { toast(err.message, 'error'); return null; } finally { setSaving(false); }
  };
  const finalize = async () => {
    const s = dirty || isNew ? await save() : doc;
    if (!s) return;
    if (!(await confirmDialog(`Finalize this bill for ${money(computeTotals(s).grandTotal)}?\nIt gets a permanent bill number and is locked against changes.`, { ok: 'Finalize bill' }))) return;
    try { const f = await finalizeBill(s.id); await refreshBillPaymentCache(f.id); reset(await db.invoices.get(f.id)); toast('Finalized as ' + f.number); } catch (e) { toast(e.message, 'error'); }
  };
  const startEditFinal = async () => {
    if (!(await confirmDialog('Edit a finalized bill? The change is recorded in the audit log under your name.', { ok: 'Edit bill' }))) return;
    await audit('unlock-finalized', 'invoice', doc.id, doc.number);
    setEditFinal(true);
  };
  const doVoid = async () => {
    const reason = await promptDialog('Reason for voiding this bill', { title: 'Void bill', ok: 'Void bill' });
    if (reason === null) return;
    await voidBill(doc.id, reason); reset(await db.invoices.get(doc.id)); toast('Bill voided');
  };
  const del = async () => {
    if (!(await confirmDialog('Delete this draft bill?', { danger: true, ok: 'Delete' }))) return;
    await db.transaction('rw', db.invoices, db.quotations, db.audit, async () => {
      await db.invoices.delete(doc.id);
      if (doc.quotationId) await db.quotations.update(doc.quotationId, { status: 'Accepted', convertedInvoiceId: null });
      await audit('delete', 'invoice', doc.id, 'draft');
    });
    toast('Draft deleted'); go('/bills');
  };
  const openPreview = async () => { const s = dirty || isNew ? await save() : doc; if (s) setPreview(true); };
  const phone = normalizePhone(doc.client.whatsapp || doc.client.phone);
  const title = (doc.title || settings.invoiceTitle || 'Final Bill');
  const message = `Assalamu Alaikum ${doc.client.name},\nPlease find attached ${title.toLowerCase()} ${doc.number || ''} for ${money(t.grandTotal)}.${ps.balance > 0 && finalized ? ` Balance due: ${money(ps.balance)}.` : ''}\n— ${[settings.brandLine1, settings.brandLine2].filter(Boolean).join(' ')}`;

  return (
    <>
      <TopBar title={isNew ? 'New bill' : doc.number ? `Bill ${doc.number}` : 'Draft bill'} back="/bills">
        {!isNew && <Badge s={billDisplayStatus({ ...doc, paymentStatus: ps.status })} />}
        {!locked && <Btn kind="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : editFinal ? 'Save changes' : dirty || isNew ? 'Save draft' : 'Saved'}</Btn>}
      </TopBar>
      <div class="content">
        {doc.demo && <div class="notice mb">This is <b>DEMO</b> data for testing. Delete it before going live.</div>}
        {doc.quotationId && <div class="notice info mb">Created from quotation <a href={'#/quotes/' + doc.quotationId}>{doc.quotationNumber}</a>. Change quantities, add extras and record payments here — the quotation stays unchanged.</div>}
        {doc.status === 'Void' && <div class="notice mb">This bill is <b>VOID</b>{doc.voidReason ? ': ' + doc.voidReason : ''}.</div>}
        {editFinal && <div class="notice mb">Editing a finalized bill. Bill number stays the same; changes are audited.</div>}
        <div class="split">
          <div class="stack">
            <ClientSection doc={doc} set={set} locked={locked} showGstin />
            <EventSection doc={doc} set={set} locked={locked} forBill />
            <div class="card">
              <div class="card-title"><h3>Bill</h3></div>
              <div class="grid g3">
                <label class="field"><span>Bill date</span><input class="input" type="date" disabled={locked} value={doc.invoiceDate} onInput={(e) => set((d) => { d.invoiceDate = e.currentTarget.value; })} /></label>
                <label class="field"><span>Due date</span><input class="input" type="date" disabled={locked} value={doc.dueDate} onInput={(e) => set((d) => { d.dueDate = e.currentTarget.value; })} /></label>
                <Field label="Heading"><Select value={doc.title || settings.invoiceTitle} disabled={locked} onChange={(v) => set((d) => { d.title = v; })} options={['FINAL BILL', 'TAX INVOICE', 'INVOICE']} /></Field>
              </div>
            </div>
            <LinesEditor doc={doc} set={set} user={user} locked={locked} title="Items actually served / charged" />
            <PricingSection doc={doc} set={set} locked={locked} settings={settings} user={user} />
            <TermsSection doc={doc} set={set} locked={locked} fields={[['terms', 'Terms'], ['notes', 'Notes']]} />
          </div>
          <div class="sticky stack">
            <div class="card">
              <div class="card-title"><h3>Amount</h3></div>
              <TotalsView doc={doc} extra={finalized && <>
                <div class="tr mt"><span>Paid</span><b>{money(ps.paid)}</b></div>
                <div class={'tr bal' + (ps.balance <= 0 ? ' ok' : '')}><span>{ps.balance > 0 ? 'Balance due' : ps.balance < 0 ? 'Excess paid' : 'Paid in full'}</span><span>{money(Math.abs(ps.balance))}</span></div>
              </>} />
            </div>
            <div class="card stack">
              {doc.status === 'Draft' && can(user, 'bill.create') && <Btn kind="gold" icon="check" style="width:100%" onClick={finalize}>Finalize bill</Btn>}
              <Btn kind="wa" icon="wa" style="width:100%" onClick={openPreview}>Preview & share {doc.status === 'Draft' ? 'draft' : 'bill'} PDF</Btn>
              {finalized && can(user, 'payment.add') && ps.balance > 0 && <Btn kind="primary" icon="plus" style="width:100%" onClick={() => setPayOpen(true)}>Record payment</Btn>}
              {finalized && !editFinal && can(user, 'bill.editFinal') && <Btn icon="edit" style="width:100%" onClick={startEditFinal}>Edit finalized bill</Btn>}
              {finalized && can(user, 'bill.void') && <Btn class="danger" style="width:100%" onClick={doVoid}>Void bill</Btn>}
              {doc.status === 'Draft' && !isNew && can(user, 'record.delete') && <Btn class="danger" icon="trash" style="width:100%" onClick={del}>Delete draft</Btn>}
              {doc.status === 'Draft' && <div class="tiny muted">Drafts have no bill number. Finalize to number, lock and take payments.</div>}
              {phone && <div class="tiny muted">WhatsApp: {displayPhone(phone)}</div>}
            </div>
            {finalized || doc.status === 'Void' ? <PaymentsCard payments={payments} user={user} /> : null}
          </div>
        </div>
      </div>
      {payOpen && <PaymentModal balance={ps.balance} onClose={() => setPayOpen(false)} onSave={async (p) => { await addPayment(doc.id, p); reset(await db.invoices.get(doc.id)); toast('Payment recorded'); setPayOpen(false); }} />}
      {preview && <PdfPreview title={`${title} ${doc.number || '(draft)'}`} build={async () => buildInvoicePdf(doc, payments, await getSettings())}
        fileName={safeFileName(`${title}_${doc.number || 'DRAFT'}_${doc.client.name}`) + '.pdf'} phone={phone} message={message}
        docType="invoice" docId={doc.id} onClose={() => setPreview(false)} onShared={async () => { await db.invoices.update(doc.id, { sentAt: Date.now() }); await audit('sent', 'invoice', doc.id, 'confirmed by user'); }} />}
    </>
  );
}

function PaymentsCard({ payments, user }) {
  const sorted = [...payments].sort((a, b) => (a.date > b.date ? -1 : 1));
  const doVoid = async (p) => {
    const reason = await promptDialog(`Void payment of ${money(p.amount)} on ${fmtDate(p.date)}? Reason:`, { title: 'Void payment', ok: 'Void payment' });
    if (reason === null) return;
    await voidPayment(p.id, reason); toast('Payment voided');
  };
  return (
    <div class="card">
      <div class="card-title"><h3>Payments</h3></div>
      {!sorted.length && <div class="small muted">No payments yet.</div>}
      <div class="list">
        {sorted.map((p) => (
          <div class="row" style={'padding:8px 0;border-bottom:1px dashed var(--line);' + (p.voided ? 'opacity:.5;text-decoration:line-through' : '')}>
            <div class="grow" style="flex:1"><b>{money(p.amount)}</b> <span class="small muted">{p.method}</span><div class="tiny muted">{fmtDate(p.date)} {p.reference ? '• ' + p.reference : ''} {p.notes ? '• ' + p.notes : ''} {p.createdBy ? '• by ' + p.createdBy : ''}</div></div>
            {!p.voided && can(user, 'payment.void') && <Btn class="sm danger" kind="ghost" onClick={() => doVoid(p)}>Void</Btn>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PaymentModal({ balance, onClose, onSave }) {
  const [p, setP] = useState({ id: uid(), date: todayISO(), amount: balance > 0 ? balance : '', method: 'UPI', reference: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try { await onSave(p); } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title="Record payment" size="narrow" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Save payment'}</Btn></>}>
      <div class="stack">
        <div class="notice info">Balance due: <b>{money(balance)}</b></div>
        <Field label="Amount ₹"><Num value={p.amount} onInput={(v) => setP({ ...p, amount: v })} autoFocus /></Field>
        <div class="grid g2">
          <Field label="Date"><input class="input" type="date" value={p.date} onInput={(e) => setP({ ...p, date: e.currentTarget.value })} /></Field>
          <Field label="Method"><Select value={p.method} onChange={(v) => setP({ ...p, method: v })} options={METHODS} /></Field>
        </div>
        <Field label="Reference (UTR / cheque no.)"><Input value={p.reference} onInput={(v) => setP({ ...p, reference: v })} /></Field>
        <Field label="Notes"><Input value={p.notes} onInput={(v) => setP({ ...p, notes: v })} /></Field>
        {err && <div class="err">{err}</div>}
      </div>
    </Modal>
  );
}
