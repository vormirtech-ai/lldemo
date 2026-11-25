// Shared editing panels used by the (separate) Quotation and Bill editors.
import { useMemo, useState } from 'preact/hooks';
import { db } from '../db.js';
import { can } from '../auth.js';
import { computeTotals } from '../calc.js';
import { money, qtyFmt, uid, displayPhone } from '../format.js';
import { useLive, Field, Input, Num, Area, Select, Check, Btn, Modal, Icon, Badge } from '../ui.jsx';
import { snapshotLineFromItem } from '../repo.js';
import { groupLines } from '../pdf/groups.js';

export const UNITS = ['Plate', 'Pax', 'Nos', 'Kg', 'Litre', 'Counter', 'Cup', 'Bottle', 'Person', 'Lot', 'Trip', 'Hour', 'Day'];
export const TIME_LABELS = ['Breakfast', 'Lunch', 'Hi-Tea', 'Dinner', 'Reception', 'Event'];

export function useCategories() {
  return useLive(() => db.categories.orderBy('sort').toArray(), [], []);
}

// ---------- Client ----------
export function ClientSection({ doc, set, locked, showGstin }) {
  const [pick, setPick] = useState(false);
  const c = doc.client;
  const sameWa = !c.whatsapp || c.whatsapp === c.phone;
  return (
    <div class="card">
      <div class="card-title"><h3>Client</h3>{!locked && <Btn class="sm" icon="search" onClick={() => setPick(true)}>Pick existing</Btn>}</div>
      <div class="grid g2">
        <Field label="Client / host name *"><Input value={c.name} disabled={locked} onInput={(v) => set((d) => { d.client.name = v; })} /></Field>
        <Field label="Mobile number *"><Input type="tel" inputMode="tel" value={c.phone} disabled={locked} onInput={(v) => set((d) => { const wasSame = !d.client.whatsapp || d.client.whatsapp === d.client.phone; d.client.phone = v; if (wasSame) d.client.whatsapp = v; })} /></Field>
        <Field label="WhatsApp number (with country code)" hint={sameWa ? 'Same as mobile' : ''}><Input type="tel" inputMode="tel" value={c.whatsapp} disabled={locked} onInput={(v) => set((d) => { d.client.whatsapp = v; })} /></Field>
        <Field label="Email (optional)"><Input type="email" value={c.email} disabled={locked} onInput={(v) => set((d) => { d.client.email = v; })} /></Field>
        <Field label="Address" class={showGstin ? '' : 'span2'} style={showGstin ? '' : 'grid-column:1/-1'}><Input value={c.address} disabled={locked} onInput={(v) => set((d) => { d.client.address = v; })} /></Field>
        {showGstin && <Field label="Client GSTIN (optional)"><Input value={c.gstin} disabled={locked} onInput={(v) => set((d) => { d.client.gstin = v.toUpperCase(); })} /></Field>}
      </div>
      {pick && <ClientPicker onClose={() => setPick(false)} onPick={(cl) => { set((d) => { d.clientId = cl.id; d.client = { name: cl.name, phone: cl.phone, whatsapp: cl.whatsapp, email: cl.email, address: cl.address, gstin: cl.gstin || '' }; }); setPick(false); }} />}
    </div>
  );
}

function ClientPicker({ onClose, onPick }) {
  const [q, setQ] = useState('');
  const list = useLive(() => db.clients.orderBy('name').toArray(), [], []);
  const f = q.trim().toLowerCase();
  const shown = list.filter((c) => !f || c.name.toLowerCase().includes(f) || (c.phone || '').includes(f) || (c.whatsapp || '').includes(f)).slice(0, 60);
  return (
    <Modal title="Pick client" onClose={onClose}>
      <Input placeholder="Search name or number" value={q} onInput={setQ} autoFocus />
      <div class="list mt">
        {shown.map((c) => <div class="item" onClick={() => onPick(c)}><div class="grow"><div class="main-t">{c.name}</div><div class="small muted">{displayPhone(c.whatsapp || c.phone)} {c.address ? '• ' + c.address : ''}</div></div></div>)}
        {!shown.length && <div class="empty small">No clients found. Type the details in the form instead.</div>}
      </div>
    </Modal>
  );
}

// ---------- Event ----------
export function EventSection({ doc, set, locked, forBill }) {
  const e = doc.event;
  const u = (k) => (v) => set((d) => { d.event[k] = v; });
  return (
    <div class="card">
      <div class="card-title"><h3>Event</h3></div>
      <div class="grid g3">
        <Field label="Occasion / event type"><Input value={e.type} disabled={locked} placeholder="Wedding reception" onInput={u('type')} /></Field>
        {!forBill && <Field label="Menu title (PDF heading)"><Input value={e.menuTitle} disabled={locked} placeholder="Dinner Menu" onInput={u('menuTitle')} /></Field>}
        <Field label="Guests (pax)"><Num value={e.guests} disabled={locked} onInput={(v) => set((d) => { d.event.guests = v; if (d.package && (!d.package.pax || d.package.pax === Number(e.guests))) d.package.pax = v; })} /></Field>
        <Field label="Event date"><Input type="date" value={e.date} disabled={locked} onInput={u('date')} /></Field>
        <Field label="Meal / time label"><Select value={e.timeLabel || 'Dinner'} disabled={locked} onChange={u('timeLabel')} options={TIME_LABELS} /></Field>
        <Field label="Time"><Input type="time" value={e.time} disabled={locked} onInput={u('time')} /></Field>
        <Field label="Venue / address" style="grid-column:1/-1"><Input value={e.venue} disabled={locked} placeholder="Raj Celebration • Gorewada Ring Road" onInput={u('venue')} /></Field>
        {!forBill && <Field label="Menu subtitle (optional, italic line under heading)" style="grid-column:1/-1"><Input value={e.menuSubtitle} disabled={locked} placeholder="An elegant journey of Indian classics…" onInput={u('menuSubtitle')} /></Field>}
      </div>
    </div>
  );
}

// ---------- Lines ----------
export function LinesEditor({ doc, set, user, locked, title = 'Menu & services' }) {
  const [picker, setPicker] = useState(false);
  const [custom, setCustom] = useState(null);
  const cats = useCategories();
  const canPrice = can(user, 'menu.price') || can(user, 'bill.create');
  const guests = Number(doc.event?.guests) || 0;
  const groups = useMemo(() => groupLines(doc.lines), [doc.lines]);
  const idx = (id) => doc.lines.findIndex((l) => l.id === id);
  const upd = (id, k, v) => set((d) => { const i = d.lines.findIndex((l) => l.id === id); if (i >= 0) d.lines[i][k] = v; });
  const del = (id) => set((d) => { d.lines = d.lines.filter((l) => l.id !== id); });
  const move = (id, dir) => set((d) => {
    const i = d.lines.findIndex((l) => l.id === id);
    const cat = d.lines[i].category?.name;
    let j = i + dir;
    while (j >= 0 && j < d.lines.length && d.lines[j].category?.name !== cat) j += dir;
    if (j < 0 || j >= d.lines.length) return;
    [d.lines[i], d.lines[j]] = [d.lines[j], d.lines[i]];
  });
  return (
    <div class="card">
      <div class="card-title">
        <h3>{title} <span class="muted small">({doc.lines.length})</span></h3>
        {!locked && <div class="row">
          {guests > 0 && doc.lines.length > 0 && <Btn class="sm" onClick={() => set((d) => { d.lines.forEach((l) => { if ((l.category?.kind || 'menu') === 'menu') l.qty = guests; }); })}>Qty = {guests} guests</Btn>}
          <Btn class="sm" icon="plus" onClick={() => setCustom({ id: uid(), name: '', description: '', diet: '', unit: 'Plate', qty: guests || 1, rate: 0, note: '', categoryId: '' })}>Custom item</Btn>
          <Btn class="sm" kind="primary" icon="plus" onClick={() => setPicker(true)}>Add from menu</Btn>
        </div>}
      </div>
      {!doc.lines.length && <div class="empty small">No items yet. Tap <b>Add from menu</b> to pick dishes and services.</div>}
      {groups.map((g) => (
        <div>
          <div class="cat-h" style={{ color: g.accent || 'var(--navy)' }}>{g.name}</div>
          {g.lines.map((l) => (
            <div class="line">
              <div class="lt">
                <div class="nm">
                  {locked ? l.name : <input class="input" style="min-height:38px;font-weight:700" value={l.name} onInput={(e) => upd(l.id, 'name', e.currentTarget.value)} />}
                </div>
                {l.diet && <Badge s={l.diet}>{l.diet === 'veg' ? 'Veg' : 'Non-veg'}</Badge>}
                {!locked && <>
                  <Btn class="sm icon" kind="ghost" icon="up" title="Move up" onClick={() => move(l.id, -1)} />
                  <Btn class="sm icon" kind="ghost" icon="down" title="Move down" onClick={() => move(l.id, 1)} />
                  <Btn class="sm icon" kind="ghost" icon="edit" title="Edit details" onClick={() => setCustom({ ...l, categoryId: l.categoryId || '' })} />
                  <Btn class="sm icon danger" kind="ghost" icon="trash" title="Remove" onClick={() => del(l.id)} />
                </>}
              </div>
              {l.description && <div class="ld">{l.description}</div>}
              <div class="lf">
                <Field label="Qty"><Num value={l.qty} disabled={locked} onInput={(v) => upd(l.id, 'qty', v)} /></Field>
                <Field label="Unit"><Select value={l.unit} disabled={locked} onChange={(v) => upd(l.id, 'unit', v)} options={[...new Set([l.unit || 'Plate', ...UNITS])]} /></Field>
                <Field label="Rate ₹" hint={Number(l.rate) > 0 ? '' : 'Included'}><Num value={l.rate} disabled={locked || !canPrice} onInput={(v) => upd(l.id, 'rate', v)} /></Field>
                <div class="amtcell right"><div class="tiny muted">Amount</div><b>{Number(l.rate) > 0 ? money((Number(l.qty) || 0) * (Number(l.rate) || 0)) : '—'}</b></div>
              </div>
              {(l.note || !locked) && <input class="input mt" style="min-height:36px;font-size:13px" placeholder="Note / modifier (optional)" disabled={locked} value={l.note || ''} onInput={(e) => upd(l.id, 'note', e.currentTarget.value)} />}
            </div>
          ))}
        </div>
      ))}
      {picker && <CatalogPicker cats={cats} lines={doc.lines} guests={guests} onClose={() => setPicker(false)}
        onAdd={(item, cat) => set((d) => { d.lines.push(snapshotLineFromItem(item, cat, (cat?.kind || 'menu') === 'menu' ? (guests || 1) : 1)); })}
        onRemove={(itemId) => set((d) => { const i = d.lines.findIndex((l) => l.itemId === itemId); if (i >= 0) d.lines.splice(i, 1); })} />}
      {custom && <CustomLine line={custom} cats={cats} canPrice={canPrice} isNew={idx(custom.id) < 0} onClose={() => setCustom(null)} onSave={(l) => {
        const cat = cats.find((c) => c.id === l.categoryId);
        const full = { ...l, category: cat ? { name: cat.name, subtitle: cat.subtitle, accent: cat.accent, kind: cat.kind, sort: cat.sort } : l.category || null };
        set((d) => { const i = d.lines.findIndex((x) => x.id === l.id); if (i >= 0) d.lines[i] = full; else d.lines.push(full); });
        setCustom(null);
      }} />}
    </div>
  );
}

function CatalogPicker({ cats, lines, guests, onClose, onAdd, onRemove }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const items = useLive(() => db.items.toArray(), [], []);
  const f = q.trim().toLowerCase();
  const added = new Set(lines.map((l) => l.itemId));
  const shown = items.filter((i) => !i.archived && (cat === 'all' || i.categoryId === cat) && (!f || i.name.toLowerCase().includes(f) || (i.description || '').toLowerCase().includes(f)))
    .sort((a, b) => (cats.find((c) => c.id === a.categoryId)?.sort ?? 99) - (cats.find((c) => c.id === b.categoryId)?.sort ?? 99) || (a.sort ?? 0) - (b.sort ?? 0));
  return (
    <Modal title="Add from menu catalogue" size="wide" onClose={onClose} footer={<><span class="small muted" style="margin-right:auto">{added.size} selected • tap again to remove</span><Btn kind="primary" onClick={onClose}>Done</Btn></>}>
      <Input placeholder="Search dishes & services" value={q} onInput={setQ} />
      <div class="chips mt">
        <button class={'chip' + (cat === 'all' ? ' on' : '')} onClick={() => setCat('all')}>All</button>
        {cats.filter((c) => !c.archived).map((c) => <button class={'chip' + (cat === c.id ? ' on' : '')} onClick={() => setCat(c.id)}>{c.name}</button>)}
      </div>
      <div class="pick-grid mt">
        {shown.map((i) => {
          const c = cats.find((x) => x.id === i.categoryId);
          const on = added.has(i.id);
          return (
            <button class={'pick' + (on ? ' on' : '')} onClick={() => (on ? onRemove(i.id) : onAdd(i, c))}>
              <div class="row" style="gap:6px"><span class="pn" style="flex:1">{i.name}</span>{on && <Icon name="check" size={18} />}</div>
              <div class="tiny muted">{c?.name} {Number(i.rate) > 0 ? '• ' + money(i.rate) + ' / ' + (i.unit || '') : ''}</div>
              {i.description && <div class="pd">{i.description}</div>}
            </button>
          );
        })}
      </div>
      {!shown.length && <div class="empty small">Nothing matches. Add it as a custom item or create it in Menu.</div>}
    </Modal>
  );
}

function CustomLine({ line, cats, canPrice, isNew, onClose, onSave }) {
  const [l, setL] = useState(line);
  const u = (k) => (v) => setL({ ...l, [k]: v });
  return (
    <Modal title={isNew ? 'Custom item' : 'Edit item'} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={!l.name?.trim()} onClick={() => onSave(l)}>{isNew ? 'Add item' : 'Save'}</Btn></>}>
      <div class="grid g2">
        <Field label="Item name *" style="grid-column:1/-1"><Input value={l.name} onInput={u('name')} autoFocus /></Field>
        <Field label="Category / section"><Select value={l.categoryId} onChange={u('categoryId')} options={[{ value: '', label: 'Other Items' }, ...cats.filter((c) => !c.archived).map((c) => ({ value: c.id, label: c.name }))]} /></Field>
        <Field label="Veg / Non-veg"><Select value={l.diet} onChange={u('diet')} options={[{ value: '', label: '—' }, { value: 'veg', label: 'Vegetarian' }, { value: 'nonveg', label: 'Non-vegetarian' }]} /></Field>
        <Field label="Description" style="grid-column:1/-1"><Area value={l.description} onInput={u('description')} /></Field>
        <Field label="Qty"><Num value={l.qty} onInput={u('qty')} /></Field>
        <Field label="Unit"><Select value={l.unit} onChange={u('unit')} options={[...new Set([l.unit || 'Plate', ...UNITS])]} /></Field>
        <Field label="Rate ₹ (0 = included)"><Num value={l.rate} disabled={!canPrice} onInput={u('rate')} /></Field>
        <Field label="Note"><Input value={l.note} onInput={u('note')} /></Field>
      </div>
      <p class="tiny muted">This changes only this document. The permanent menu is edited in Menu.</p>
    </Modal>
  );
}

// ---------- Pricing ----------
export function PricingSection({ doc, set, locked, settings, user, isQuote }) {
  const canDisc = can(user, 'discount.unlimited');
  const t = computeTotals(doc);
  const discPct = t.subtotal ? (t.discount / t.subtotal) * 100 : 0;
  const overLimit = !canDisc && discPct > (Number(settings.cashierMaxDiscountPct) || 0) + 1e-9;
  return (
    <div class="card">
      <div class="card-title"><h3>Pricing</h3></div>
      <Check checked={doc.package?.enabled} onChange={(v) => !locked && set((d) => { d.package.enabled = v; if (v && !d.package.pax) d.package.pax = Number(d.event?.guests) || 0; })} label="Per-plate package price (menu items show as included)" />
      {doc.package?.enabled && (
        <div class="grid g3">
          <Field label="Package label" style="grid-column:1/-1"><Input value={doc.package.label} disabled={locked} onInput={(v) => set((d) => { d.package.label = v; })} /></Field>
          <Field label="Rate per plate ₹"><Num value={doc.package.rate} disabled={locked} onInput={(v) => set((d) => { d.package.rate = v; })} /></Field>
          <Field label={isQuote ? 'Pax (estimated)' : 'Pax (actual)'}><Num value={doc.package.pax} disabled={locked} onInput={(v) => set((d) => { d.package.pax = v; })} /></Field>
          <div class="field"><span>Package amount</span><div class="input num" style="display:flex;align-items:center;justify-content:flex-end;background:var(--cream-2)">{money(t.packageTotal)}</div></div>
        </div>
      )}
      <div class="grid g2 mt">
        <Field label="Discount type"><Select value={doc.discount.type} disabled={locked} onChange={(v) => set((d) => { d.discount.type = v; })} options={[{ value: 'amount', label: 'Amount (₹)' }, { value: 'percent', label: 'Percent (%)' }]} /></Field>
        <Field label="Discount" error={overLimit ? `Your role allows up to ${settings.cashierMaxDiscountPct}% discount. Ask a manager.` : ''}><Num value={doc.discount.value} disabled={locked} onInput={(v) => set((d) => { d.discount.value = v; })} /></Field>
      </div>
      <div class="mt">
        <div class="row"><b class="small">Additional charges</b><span class="spacer" />{!locked && <Btn class="sm" icon="plus" onClick={() => set((d) => { d.charges.push({ label: '', amount: 0 }); })}>Add charge</Btn>}</div>
        {(doc.charges || []).map((c, i) => (
          <div class="row mt" style="flex-wrap:nowrap">
            <input class="input" placeholder="e.g. Live counter setup, Transport" disabled={locked} value={c.label} onInput={(e) => set((d) => { d.charges[i].label = e.currentTarget.value; })} />
            <input class="input num" style="max-width:130px" type="number" inputMode="decimal" disabled={locked} value={c.amount} onInput={(e) => set((d) => { d.charges[i].amount = Number(e.currentTarget.value) || 0; })} />
            {!locked && <Btn class="icon danger" kind="ghost" icon="trash" onClick={() => set((d) => { d.charges.splice(i, 1); })} />}
          </div>
        ))}
      </div>
      <div class="mt">
        <Check checked={doc.applyTax} onChange={(v) => !locked && set((d) => { d.applyTax = v; })} label={`Apply tax (${(doc.taxes || []).map((x) => `${x.name} ${x.rate}%`).join(' + ') || 'none set'})`} />
        {doc.applyTax && !locked && <div class="row">{(doc.taxes || []).map((x, i) => (
          <label class="field" style="width:120px"><span>{x.name} %</span><input class="input num" type="number" step="any" value={x.rate} onInput={(e) => set((d) => { d.taxes[i].rate = Number(e.currentTarget.value) || 0; })} /></label>
        ))}<span class="tiny muted">Defaults come from Settings → Tax</span></div>}
        <Check checked={doc.roundOff} onChange={(v) => !locked && set((d) => { d.roundOff = v; })} label="Round off grand total to nearest rupee" />
        {isQuote && <Check checked={doc.showRates} onChange={(v) => !locked && set((d) => { d.showRates = v; })} label="Show item-wise rates inside the menu section of the PDF" />}
        {!isQuote && doc.package?.enabled && <Check checked={doc.listIncluded} onChange={(v) => !locked && set((d) => { d.listIncluded = v; })} label="List every included dish as a separate row on the bill" />}
      </div>
    </div>
  );
}

export function discountAllowed(doc, user, settings) {
  if (can(user, 'discount.unlimited')) return true;
  const t = computeTotals(doc);
  const pct = t.subtotal ? (t.discount / t.subtotal) * 100 : 0;
  return pct <= (Number(settings.cashierMaxDiscountPct) || 0) + 1e-9;
}

export function TotalsView({ doc, label = 'Grand total', extra }) {
  const t = computeTotals(doc);
  return (
    <div class="totals">
      {t.packageTotal > 0 && <div class="tr"><span>Package ({qtyFmt(doc.package.pax)} × {money(doc.package.rate)})</span><b>{money(t.packageTotal)}</b></div>}
      {t.itemsTotal > 0 && <div class="tr"><span>Items</span><b>{money(t.itemsTotal)}</b></div>}
      <div class="tr"><span>Subtotal</span><b>{money(t.subtotal)}</b></div>
      {t.discount > 0 && <div class="tr" style="color:var(--maroon)"><span>Discount</span><b>− {money(t.discount)}</b></div>}
      {(doc.charges || []).filter((c) => Number(c.amount)).map((c) => <div class="tr"><span>{c.label || 'Charge'}</span><b>{money(c.amount)}</b></div>)}
      {t.taxLines.map((x) => <div class="tr"><span>{x.name} @ {x.rate}%</span><b>{money(x.amount)}</b></div>)}
      {t.roundOff !== 0 && <div class="tr"><span>Round off</span><b>{money(t.roundOff)}</b></div>}
      <div class="tr grand"><span>{label}</span><span>{money(t.grandTotal)}</span></div>
      {extra}
    </div>
  );
}

export function TermsSection({ doc, set, locked, fields }) {
  return (
    <div class="card">
      <div class="card-title"><h3>Terms & notes</h3><span class="tiny muted">One point per line</span></div>
      <div class={'grid ' + (fields.length > 2 ? 'g2' : '')}>
        {fields.map(([k, label]) => <Field label={label}><Area value={doc[k]} disabled={locked} onInput={(v) => set((d) => { d[k] = v; })} /></Field>)}
      </div>
    </div>
  );
}

export function useDocState(initial) {
  const [doc, setDoc] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const set = (fn) => { setDoc((d) => { const c = structuredClone(d); fn(c); return c; }); setDirty(true); };
  return [doc, set, (d) => { setDoc(d); setDirty(false); }, dirty];
}
