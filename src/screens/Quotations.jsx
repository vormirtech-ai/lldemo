import { useEffect, useState } from 'preact/hooks';
import { db, getSettings, audit } from '../db.js';
import { can } from '../auth.js';
import { money, fmtDate, normalizePhone, displayPhone } from '../format.js';
import { useLive, go, TopBar, Btn, Badge, Empty, Input, toast, confirmDialog } from '../ui.jsx';
import { blankQuotation, saveQuotation, setQuotationStatus, duplicateQuotation, convertQuotationToBill } from '../repo.js';
import { ClientSection, EventSection, LinesEditor, PricingSection, TotalsView, TermsSection, useDocState, discountAllowed } from './docparts.jsx';
import { PdfPreview } from '../PdfPreview.jsx';
import { buildQuotationPdf } from '../pdf/quotationPdf.js';
import { safeFileName } from '../pdf/common.js';

const STATUSES = ['All', 'Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Converted'];

export function QuotationList({ user }) {
  const [q, setQ] = useState('');
  const [st, setSt] = useState('All');
  const list = useLive(() => db.quotations.orderBy('updatedAt').reverse().toArray(), [], null);
  if (!list) return null;
  const f = q.trim().toLowerCase();
  const shown = list.filter((x) => (st === 'All' || x.status === st) && (!f || [x.number, x.client?.name, x.client?.phone, x.client?.whatsapp, x.event?.venue, x.event?.type].join(' ').toLowerCase().includes(f)));
  return (
    <>
      <TopBar title="Quotations">{can(user, 'quote.create') && <Btn kind="primary" icon="plus" onClick={() => go('/quotes/new')}>New<span class="hide-phone">&nbsp;quotation</span></Btn>}</TopBar>
      <div class="content">
        <Input placeholder="Search number, client, phone, venue" value={q} onInput={setQ} />
        <div class="chips mt">{STATUSES.map((s) => <button class={'chip' + (st === s ? ' on' : '')} onClick={() => setSt(s)}>{s} {s !== 'All' ? `(${list.filter((x) => x.status === s).length})` : ''}</button>)}</div>
        <div class="list mt">
          {shown.map((x) => (
            <a class="item" href={'#/quotes/' + x.id}>
              <div class="grow">
                <div class="row" style="gap:8px"><span class="main-t">{x.client?.name || '—'}</span>{x.demo && <span class="demo-tag">DEMO</span>}<Badge s={x.status} /></div>
                <div class="small muted ellipsis">{x.number} • {x.event?.type || x.event?.menuTitle || 'Event'} {x.event?.date ? '• ' + fmtDate(x.event.date) : ''} {x.event?.guests ? '• ' + x.event.guests + ' pax' : ''}</div>
              </div>
              <div class="amt">{money(x.grandTotal)}<div class="tiny muted">estimate</div></div>
            </a>
          ))}
          {!shown.length && <Empty title="No quotations">{list.length ? 'Try a different filter.' : 'Create your first catering proposal.'}</Empty>}
        </div>
      </div>
    </>
  );
}

export function QuotationEditor({ id, user, settings }) {
  const [doc, set, reset, dirty] = useDocState(null);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const invoice = useLive(() => (doc?.convertedInvoiceId ? db.invoices.get(doc.convertedInvoiceId) : Promise.resolve(null)), [doc?.convertedInvoiceId], null);
  useEffect(() => {
    (async () => {
      if (id === 'new') reset(await blankQuotation());
      else { const q = await db.quotations.get(id); if (!q) { toast('Quotation not found', 'error'); go('/quotes'); return; } reset(q); }
    })();
  }, [id]);
  if (!doc) return null;
  const locked = doc.status === 'Converted' || !can(user, 'quote.create');
  const isNew = !doc.id;

  const validate = () => {
    if (!doc.client.name.trim()) return 'Enter the client name';
    if (!normalizePhone(doc.client.whatsapp || doc.client.phone)) return 'Enter the client mobile/WhatsApp number';
    if (!doc.lines.length && !doc.package.enabled) return 'Add at least one menu item or service';
    if ((doc.lines || []).some((l) => !(Number(l.qty) >= 0))) return 'Quantities must be zero or more';
    if (!discountAllowed(doc, user, settings)) return `Discount above ${settings.cashierMaxDiscountPct}% needs a manager`;
    return '';
  };
  const save = async () => {
    const e = validate();
    if (e) { toast(e, 'error'); return null; }
    setSaving(true);
    try {
      const saved = await saveQuotation(doc);
      reset(saved);
      toast(`Saved ${saved.number}`);
      if (isNew) history.replaceState(null, '', '#/quotes/' + saved.id);
      return saved;
    } catch (err) { toast(err.message, 'error'); return null; } finally { setSaving(false); }
  };
  const openPreview = async () => { const s = dirty || isNew ? await save() : doc; if (s) setPreview(true); };
  const status = async (s) => { try { await setQuotationStatus(doc.id, s); reset({ ...doc, status: s }); toast('Marked ' + s); } catch (e) { toast(e.message, 'error'); } };
  const convert = async () => {
    if (dirty) { const s = await save(); if (!s) return; }
    if (!(await confirmDialog(`Create a separate FINAL BILL from ${doc.number}?\nThe quotation is kept unchanged and locked as “Converted”. You can adjust actual quantities, extras and payments on the bill.`, { ok: 'Create bill' }))) return;
    try { const b = await convertQuotationToBill(doc.id); go('/bills/' + b.id); } catch (e) { toast(e.message, 'error'); }
  };
  const dup = async () => { try { const c = await duplicateQuotation(doc.id); toast('Duplicated as ' + c.number); go('/quotes/' + c.id); } catch (e) { toast(e.message, 'error'); } };
  const del = async () => {
    if (!(await confirmDialog(`Delete quotation ${doc.number}? This cannot be undone.`, { danger: true, ok: 'Delete' }))) return;
    await db.quotations.delete(doc.id); await audit('delete', 'quotation', doc.id, doc.number); toast('Deleted'); go('/quotes');
  };
  const phone = normalizePhone(doc.client.whatsapp || doc.client.phone);
  const message = `Assalamu Alaikum ${doc.client.name},\nPlease find attached our quotation ${doc.number} for ${doc.event.type || doc.event.menuTitle || 'your event'}${doc.event.date ? ' on ' + fmtDate(doc.event.date) : ''}.\n— ${[settings.brandLine1, settings.brandLine2].filter(Boolean).join(' ')}`;

  return (
    <>
      <TopBar title={isNew ? 'New quotation' : `Quotation ${doc.number}`} back="/quotes">
        {!isNew && <Badge s={doc.status} />}
        {!locked && <Btn kind="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : dirty || isNew ? 'Save' : 'Saved'}</Btn>}
      </TopBar>
      <div class="content">
        {doc.demo && <div class="notice mb">This is <b>DEMO</b> data for testing. Delete it before going live.</div>}
        {doc.status === 'Converted' && <div class="notice info mb">Converted to bill {invoice?.number || '(draft)'} — this quotation is preserved as sent and is read-only. <a href={'#/bills/' + doc.convertedInvoiceId}>Open bill</a></div>}
        <div class="split">
          <div class="stack">
            <ClientSection doc={doc} set={set} locked={locked} />
            <EventSection doc={doc} set={set} locked={locked} />
            <div class="card">
              <div class="card-title"><h3>Quotation</h3></div>
              <div class="grid g3">
                <label class="field"><span>Quotation date</span><input class="input" type="date" disabled={locked} value={doc.quoteDate} onInput={(e) => set((d) => { d.quoteDate = e.currentTarget.value; })} /></label>
                <label class="field"><span>Valid until</span><input class="input" type="date" disabled={locked} value={doc.validUntil} onInput={(e) => set((d) => { d.validUntil = e.currentTarget.value; })} /></label>
                <div class="field"><span>Number</span><div class="input" style="display:flex;align-items:center;background:var(--cream-2)">{doc.number || 'Assigned on save'}{doc.revision ? ` (rev ${doc.revision})` : ''}</div></div>
              </div>
            </div>
            <LinesEditor doc={doc} set={set} user={user} locked={locked} />
            <PricingSection doc={doc} set={set} locked={locked} settings={settings} user={user} isQuote />
            <TermsSection doc={doc} set={set} locked={locked} fields={[['inclusions', 'Inclusions'], ['exclusions', 'Exclusions'], ['terms', 'Terms & conditions'], ['notes', 'Notes']]} />
          </div>
          <div class="sticky stack">
            <div class="card">
              <div class="card-title"><h3>Estimate</h3><span class="tiny muted">not revenue</span></div>
              <TotalsView doc={doc} label="Estimated total" />
            </div>
            <div class="card stack">
              <Btn kind="wa" icon="wa" style="width:100%" onClick={openPreview}>Preview & share PDF</Btn>
              {!isNew && !locked && <div class="grid g2">
                {['Draft', 'Expired'].includes(doc.status) && <Btn onClick={() => status('Sent')}>Mark sent</Btn>}
                {['Draft', 'Sent', 'Expired'].includes(doc.status) && <Btn icon="check" onClick={() => status('Accepted')}>Accepted</Btn>}
                {['Sent', 'Accepted'].includes(doc.status) && <Btn class="danger" onClick={() => status('Rejected')}>Rejected</Btn>}
                {['Rejected', 'Accepted'].includes(doc.status) && <Btn onClick={() => status('Sent')}>Back to sent</Btn>}
              </div>}
              {!isNew && doc.status !== 'Converted' && can(user, 'bill.create') && <Btn kind="gold" icon="bill" style="width:100%" onClick={convert}>Convert to final bill</Btn>}
              {!isNew && <Btn icon="copy" style="width:100%" onClick={dup}>Duplicate</Btn>}
              {!isNew && can(user, 'record.delete') && doc.status !== 'Converted' && <Btn class="danger" icon="trash" style="width:100%" onClick={del}>Delete</Btn>}
              {phone && <div class="tiny muted">WhatsApp: {displayPhone(phone)}</div>}
            </div>
          </div>
        </div>
      </div>
      {preview && <PdfPreview title={`Quotation ${doc.number}`} build={async () => buildQuotationPdf(doc, await getSettings())}
        fileName={safeFileName(`Quotation_${doc.number}_${doc.client.name}`) + '.pdf'} phone={phone} message={message}
        docType="quotation" docId={doc.id} onClose={() => setPreview(false)}
        onShared={async () => { if (['Draft', 'Expired'].includes(doc.status)) { await setQuotationStatus(doc.id, 'Sent'); reset({ ...doc, status: 'Sent' }); } }} />}
    </>
  );
}
