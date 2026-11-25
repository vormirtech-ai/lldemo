import { useEffect, useState } from 'preact/hooks';
import { db, audit } from '../db.js';
import { can } from '../auth.js';
import { money, fmtDate, displayPhone, uid } from '../format.js';
import { useLive, go, TopBar, Btn, Badge, Empty, Input, Area, Field, Modal, toast, confirmDialog } from '../ui.jsx';
import { findClientByPhone, mergeClients, billDisplayStatus } from '../repo.js';

export function ClientList({ user }) {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const list = useLive(() => db.clients.orderBy('name').toArray(), [], null);
  if (!list) return null;
  const f = q.trim().toLowerCase();
  const shown = list.filter((c) => !f || [c.name, c.phone, c.whatsapp, c.email, c.address].join(' ').toLowerCase().includes(f));
  return (
    <>
      <TopBar title="Clients">{can(user, 'clients.edit') && <Btn kind="primary" icon="plus" onClick={() => setAdding(true)}>Add</Btn>}</TopBar>
      <div class="content">
        <Input placeholder="Search name, number, address" value={q} onInput={setQ} />
        <div class="list mt">
          {shown.map((c) => (
            <a class="item" href={'#/clients/' + c.id}>
              <div class="grow"><div class="main-t">{c.name}</div><div class="small muted ellipsis">{displayPhone(c.whatsapp || c.phone)} {c.address ? '• ' + c.address : ''}</div></div>
            </a>
          ))}
          {!shown.length && <Empty title="No clients">Clients are added automatically when you save a quotation or bill.</Empty>}
        </div>
      </div>
      {adding && <ClientForm onClose={() => setAdding(false)} onSaved={(id) => go('/clients/' + id)} />}
    </>
  );
}

function ClientForm({ client, onClose, onSaved }) {
  const [c, setC] = useState(client || { name: '', phone: '', whatsapp: '', email: '', address: '', gstin: '', notes: '' });
  const [err, setErr] = useState('');
  const u = (k) => (v) => setC({ ...c, [k]: v });
  const save = async () => {
    if (!c.name.trim()) return setErr('Name is required');
    const dup = await findClientByPhone(c.whatsapp || c.phone, c.id);
    if (dup && !(await confirmDialog(`${dup.name} already uses this number. Save anyway? (You can merge them later.)`, { ok: 'Save anyway' }))) return;
    const id = c.id || uid();
    await db.clients.put({ ...c, id, name: c.name.trim(), updatedAt: Date.now(), createdAt: c.createdAt || Date.now() });
    await audit(c.id ? 'edit' : 'create', 'client', id, c.name);
    toast('Client saved'); onSaved?.(id); onClose();
  };
  return (
    <Modal title={client ? 'Edit client' : 'New client'} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
      <div class="grid g2">
        <Field label="Name *"><Input value={c.name} onInput={u('name')} autoFocus /></Field>
        <Field label="Mobile"><Input type="tel" value={c.phone} onInput={u('phone')} /></Field>
        <Field label="WhatsApp"><Input type="tel" value={c.whatsapp} onInput={u('whatsapp')} /></Field>
        <Field label="Email"><Input type="email" value={c.email} onInput={u('email')} /></Field>
        <Field label="Address" style="grid-column:1/-1"><Input value={c.address} onInput={u('address')} /></Field>
        <Field label="GSTIN"><Input value={c.gstin} onInput={(v) => setC({ ...c, gstin: v.toUpperCase() })} /></Field>
        <Field label="Notes" style="grid-column:1/-1"><Area value={c.notes} onInput={u('notes')} /></Field>
      </div>
      {err && <div class="err">{err}</div>}
    </Modal>
  );
}

export function ClientDetail({ id, user }) {
  const [edit, setEdit] = useState(false);
  const [merge, setMerge] = useState(false);
  const data = useLive(async () => {
    const c = await db.clients.get(id);
    if (!c) return { c: null };
    const [quotes, bills] = await Promise.all([db.quotations.where('clientId').equals(id).toArray(), db.invoices.where('clientId').equals(id).toArray()]);
    const pays = (await Promise.all(bills.map((b) => db.payments.where('invoiceId').equals(b.id).toArray()))).flat();
    const timeline = [
      ...quotes.map((q) => ({ ts: q.createdAt, date: q.quoteDate, kind: 'Quotation', title: `${q.number} — ${q.event?.type || q.event?.menuTitle || ''}`, amt: q.grandTotal, status: q.status, href: '#/quotes/' + q.id })),
      ...bills.map((b) => ({ ts: b.createdAt, date: b.invoiceDate, kind: 'Bill', title: `${b.number || 'Draft'}${b.quotationNumber ? ' (from ' + b.quotationNumber + ')' : ''}`, amt: b.grandTotal, status: billDisplayStatus(b), href: '#/bills/' + b.id })),
      ...pays.map((p) => ({ ts: p.createdAt, date: p.date, kind: 'Payment', title: `${p.method}${p.reference ? ' • ' + p.reference : ''}`, amt: p.amount, status: p.voided ? 'Void' : 'Paid', href: '#/bills/' + p.invoiceId })),
      ...(c.events || [])
    ].sort((a, b) => ((b.date || '') + b.ts > (a.date || '') + a.ts ? 1 : -1));
    const billed = bills.filter((b) => b.status === 'Finalized').reduce((a, b) => a + b.grandTotal, 0);
    const due = bills.filter((b) => b.status === 'Finalized').reduce((a, b) => a + (b.balance ?? b.grandTotal), 0);
    return { c, timeline, billed, due };
  }, [id], null);
  if (!data) return null;
  if (!data.c) return <><TopBar title="Client" back="/clients" /><div class="content"><Empty title="Client not found" /></div></>;
  const { c } = data;
  const del = async () => {
    if (data.timeline.length) return toast('Client has documents — merge instead of deleting', 'error');
    if (!(await confirmDialog(`Delete ${c.name}?`, { danger: true, ok: 'Delete' }))) return;
    await db.clients.delete(c.id); await audit('delete', 'client', c.id, c.name); go('/clients');
  };
  return (
    <>
      <TopBar title={c.name} back="/clients">{can(user, 'clients.edit') && <Btn icon="edit" onClick={() => setEdit(true)}>Edit</Btn>}</TopBar>
      <div class="content">
        <div class="split">
          <div class="card">
            <div class="card-title"><h3>Timeline</h3>
              <div class="row">
                {can(user, 'quote.create') && <Btn class="sm" onClick={() => go('/quotes/new')}>New quotation</Btn>}
              </div>
            </div>
            <div class="list">
              {data.timeline.map((t) => (
                <a class="item" href={t.href}>
                  <div style="min-width:86px" class="small muted">{fmtDate(t.date)}</div>
                  <div class="grow"><div class="main-t small">{t.kind}</div><div class="small muted ellipsis">{t.title}</div></div>
                  <div class="amt">{money(t.amt)}<div><Badge s={t.status} /></div></div>
                </a>
              ))}
              {!data.timeline.length && <Empty title="Nothing yet" />}
            </div>
          </div>
          <div class="stack">
            <div class="card small">
              <div><b>Mobile:</b> {displayPhone(c.phone) || '—'}</div>
              <div><b>WhatsApp:</b> {displayPhone(c.whatsapp || c.phone) || '—'}</div>
              {c.email && <div><b>Email:</b> {c.email}</div>}
              {c.address && <div><b>Address:</b> {c.address}</div>}
              {c.gstin && <div><b>GSTIN:</b> {c.gstin}</div>}
              {c.notes && <div class="mt" style="white-space:pre-line">{c.notes}</div>}
            </div>
            <div class="grid g2"><div class="stat"><div class="k">Billed</div><div class="v" style="font-size:20px">{money(data.billed)}</div></div><div class="stat"><div class="k">Due</div><div class="v" style="font-size:20px;color:var(--maroon)">{money(data.due)}</div></div></div>
            {can(user, 'clients.merge') && <Btn style="width:100%" onClick={() => setMerge(true)}>Merge a duplicate into this client</Btn>}
            {can(user, 'record.delete') && <Btn class="danger" style="width:100%" onClick={del}>Delete client</Btn>}
          </div>
        </div>
      </div>
      {edit && <ClientForm client={c} onClose={() => setEdit(false)} />}
      {merge && <MergeModal keep={c} onClose={() => setMerge(false)} />}
    </>
  );
}

function MergeModal({ keep, onClose }) {
  const [q, setQ] = useState('');
  const list = useLive(() => db.clients.toArray(), [], []);
  const f = q.trim().toLowerCase();
  const shown = list.filter((c) => c.id !== keep.id && (!f || [c.name, c.phone, c.whatsapp].join(' ').toLowerCase().includes(f))).slice(0, 40);
  const doMerge = async (c) => {
    if (!(await confirmDialog(`Move all quotations and bills of “${c.name}” into “${keep.name}” and remove the duplicate?`, { ok: 'Merge' }))) return;
    await mergeClients(keep.id, c.id); toast('Merged'); onClose();
  };
  return (
    <Modal title={`Merge into ${keep.name}`} onClose={onClose}>
      <Input placeholder="Search duplicate client" value={q} onInput={setQ} autoFocus />
      <div class="list mt">{shown.map((c) => <div class="item" onClick={() => doMerge(c)}><div class="grow"><div class="main-t">{c.name}</div><div class="small muted">{displayPhone(c.whatsapp || c.phone)}</div></div></div>)}</div>
    </Modal>
  );
}
