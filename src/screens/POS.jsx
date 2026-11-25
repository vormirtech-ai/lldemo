import { useState } from 'preact/hooks';
import { db, getSettings, nextNumber, audit, getCurrentUser } from '../db.js';
import { can } from '../auth.js';
import { computeTotals } from '../calc.js';
import { money, uid, fmtDateTime, todayISO, normalizePhone } from '../format.js';
import { useLive, TopBar, Btn, Badge, Empty, Input, Num, Field, Select, Modal, Check, toast, confirmDialog } from '../ui.jsx';
import { useCategories } from './docparts.jsx';
import { PdfPreview } from '../PdfPreview.jsx';
import { buildReceiptPdf } from '../pdf/receiptPdf.js';
import { METHODS } from './Bills.jsx';

const TYPES = [{ value: 'dine-in', label: 'Dine-in' }, { value: 'takeaway', label: 'Takeaway' }, { value: 'delivery', label: 'Delivery' }, { value: 'catering', label: 'Catering order' }];

function blankOrder(s) {
  return { id: null, type: s.dineInEnabled ? 'dine-in' : 'takeaway', tableId: '', tableName: '', customerName: '', customerPhone: '', address: '', lines: [], discount: { type: 'amount', value: 0 }, applyTax: !!s.posTaxEnabled, taxes: s.taxes.map((t) => ({ ...t })), roundOff: !!s.roundOff, status: 'New', payments: [] };
}

export function POS({ user, settings }) {
  const [tab, setTab] = useState('order');
  const [order, setOrder] = useState(() => blankOrder(settings));
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [pay, setPay] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [tablesOpen, setTablesOpen] = useState(false);
  const cats = useCategories();
  const items = useLive(() => db.items.toArray(), [], []);
  const tables = useLive(() => db.diningTables.toArray(), [], []);
  const open = useLive(() => db.orders.where('status').equals('Open').toArray(), [], []);
  const history = useLive(() => db.orders.orderBy('createdAt').reverse().limit(200).toArray(), [], []);
  const t = computeTotals(order);

  const f = q.trim().toLowerCase();
  const catSort = (id) => cats.find((c) => c.id === id)?.sort ?? 99;
  const shown = items.filter((i) => !i.archived && (cat === 'all' || i.categoryId === cat) && (!f || i.name.toLowerCase().includes(f))).sort((a, b) => catSort(a.categoryId) - catSort(b.categoryId) || (a.sort ?? 0) - (b.sort ?? 0));
  const add = (i) => setOrder((o) => {
    const lines = [...o.lines];
    const ex = lines.find((l) => l.itemId === i.id && !l.note);
    if (ex) ex.qty += 1; else lines.push({ id: uid(), itemId: i.id, name: i.name, qty: 1, rate: Number(i.rate) || 0, note: '', categoryName: cats.find((c) => c.id === i.categoryId)?.name || '' });
    return { ...o, lines };
  });
  const updLine = (id, patch) => setOrder((o) => ({ ...o, lines: o.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)).filter((l) => l.qty > 0) }));
  const discOk = can(user, 'discount.unlimited') || !t.subtotal || (t.discount / t.subtotal) * 100 <= (Number(settings.cashierMaxDiscountPct) || 0) + 1e-9;

  const persist = async (patch = {}) => {
    const s = await getSettings();
    if (!order.lines.length) throw new Error('Add items first');
    if (order.type === 'dine-in' && settings.dineInEnabled && !order.tableId) throw new Error('Select a table');
    if (!discOk) throw new Error(`Discount above ${settings.cashierMaxDiscountPct}% needs a manager`);
    return db.transaction('rw', db.orders, db.counters, db.audit, async () => {
      const rec = { ...order, ...patch, totals: computeTotals(order), grandTotal: computeTotals(order).grandTotal, updatedAt: Date.now() };
      if (!rec.id) {
        rec.id = uid(); rec.number = await nextNumber('order', s, todayISO()); rec.createdAt = Date.now(); rec.createdBy = getCurrentUser()?.name || '';
        if (rec.status === 'New') rec.status = 'Open';
        await db.orders.add(rec);
        await audit('create', 'order', rec.id, `${rec.number} ${rec.type}`);
      } else {
        const prev = await db.orders.get(rec.id);
        if (prev?.status === 'Paid') throw new Error('Order already paid');
        await db.orders.put(rec);
      }
      return rec;
    });
  };
  const hold = async () => { try { const r = await persist({ status: 'Open' }); toast(`Order ${r.number} saved as open`); setOrder(blankOrder(settings)); } catch (e) { toast(e.message, 'error'); } };
  const finishPay = async (payments) => {
    const r = await persist({ status: 'Paid', payments, paidAt: Date.now() });
    await audit('pay', 'order', r.id, `${r.number}: ${payments.map((p) => p.method + ' ' + p.amount).join(', ')}`);
    setPay(false); setOrder(blankOrder(settings)); setReceipt(r); toast(`Paid — ${r.number}`);
  };
  const cancelOpen = async (o) => {
    if (!(await confirmDialog(`Cancel open order ${o.number}?`, { danger: true, ok: 'Cancel order' }))) return;
    await db.orders.update(o.id, { status: 'Cancelled', cancelledAt: Date.now() }); await audit('cancel', 'order', o.id, o.number);
  };
  const occupied = new Set(open.filter((o) => o.tableId).map((o) => o.tableId));

  return (
    <>
      <TopBar title="POS">
        <div class="chips">
          <button class={'chip' + (tab === 'order' ? ' on' : '')} onClick={() => setTab('order')}>{order.id ? 'Editing ' + order.number : 'New order'}</button>
          <button class={'chip' + (tab === 'open' ? ' on' : '')} onClick={() => setTab('open')}>Open ({open.length})</button>
          <button class={'chip' + (tab === 'history' ? ' on' : '')} onClick={() => setTab('history')}>History</button>
        </div>
      </TopBar>
      <div class="content">
        {tab === 'order' && (
          <div class="pos">
            <div>
              <Input placeholder="Search items" value={q} onInput={setQ} />
              <div class="chips mt">
                <button class={'chip' + (cat === 'all' ? ' on' : '')} onClick={() => setCat('all')}>All</button>
                {cats.filter((c) => !c.archived).map((c) => <button class={'chip' + (cat === c.id ? ' on' : '')} onClick={() => setCat(c.id)}>{c.name}</button>)}
              </div>
              <div class="pos-items mt">
                {shown.map((i) => <button class="pos-tile" onClick={() => add(i)}><span class="n">{i.name}</span><span class="p">{Number(i.rate) > 0 ? money(i.rate) : <span class="tiny muted">set price</span>}</span></button>)}
              </div>
              {!shown.length && <Empty title="No items">Add items in Menu.</Empty>}
            </div>
            <div class="pos-cart card" id="cart">
              <div class="grid g2">
                <Field label="Order type"><Select value={order.type} onChange={(v) => setOrder({ ...order, type: v })} options={TYPES.filter((x) => x.value !== 'dine-in' || settings.dineInEnabled)} /></Field>
                {order.type === 'dine-in'
                  ? <Field label="Table"><Select value={order.tableId} onChange={(v) => setOrder({ ...order, tableId: v, tableName: tables.find((x) => x.id === v)?.name || '' })} options={[{ value: '', label: tables.length ? 'Select table' : 'No tables — add' }, ...tables.filter((x) => x.active !== false).map((x) => ({ value: x.id, label: x.name + (occupied.has(x.id) && x.id !== order.tableId ? ' (busy)' : '') }))]} /></Field>
                  : <Field label="Customer name"><Input value={order.customerName} onInput={(v) => setOrder({ ...order, customerName: v })} /></Field>}
              </div>
              {order.type !== 'dine-in' && <div class="grid g2 mt">
                <Field label="Phone"><Input type="tel" value={order.customerPhone} onInput={(v) => setOrder({ ...order, customerPhone: v })} /></Field>
                {order.type === 'delivery' && <Field label="Address"><Input value={order.address} onInput={(v) => setOrder({ ...order, address: v })} /></Field>}
              </div>}
              {order.type === 'dine-in' && can(user, 'menu.edit') && <Btn class="sm mt" onClick={() => setTablesOpen(true)}>Manage tables</Btn>}
              <div class="mt">
                {!order.lines.length && <div class="empty small">Tap items to add them.</div>}
                {order.lines.map((l) => (
                  <div style="padding:8px 0;border-bottom:1px dashed var(--line)">
                    <div class="row" style="flex-wrap:nowrap">
                      <div style="flex:1;min-width:0"><b class="small">{l.name}</b><div class="tiny muted">{money(l.rate)} each</div></div>
                      <div class="qty"><button onClick={() => updLine(l.id, { qty: l.qty - 1 })}>−</button><span>{l.qty}</span><button onClick={() => updLine(l.id, { qty: l.qty + 1 })}>+</button></div>
                      <b style="width:84px;text-align:right" class="small">{money(l.qty * l.rate)}</b>
                    </div>
                    <div class="row mt" style="flex-wrap:nowrap;margin-top:6px">
                      <input class="input" style="min-height:34px;font-size:13px" placeholder="Note (e.g. less spicy)" value={l.note} onInput={(e) => updLine(l.id, { note: e.currentTarget.value })} />
                      {(can(user, 'menu.price') || !(Number(l.rate) > 0)) && <input class="input num" style="min-height:34px;max-width:90px;font-size:13px" type="number" title="Rate" value={l.rate} onInput={(e) => updLine(l.id, { rate: Number(e.currentTarget.value) || 0 })} />}
                    </div>
                  </div>
                ))}
              </div>
              <div class="grid g2 mt">
                <Field label="Discount"><Select value={order.discount.type} onChange={(v) => setOrder({ ...order, discount: { ...order.discount, type: v } })} options={[{ value: 'amount', label: '₹ Amount' }, { value: 'percent', label: '% Percent' }]} /></Field>
                <Field label="&nbsp;" error={!discOk ? 'Needs manager' : ''}><Num value={order.discount.value} onInput={(v) => setOrder({ ...order, discount: { ...order.discount, value: v } })} /></Field>
              </div>
              <Check checked={order.applyTax} onChange={(v) => setOrder({ ...order, applyTax: v })} label="Apply tax" />
              <div class="totals mt">
                <div class="tr"><span>Subtotal</span><b>{money(t.subtotal)}</b></div>
                {t.discount > 0 && <div class="tr"><span>Discount</span><b>− {money(t.discount)}</b></div>}
                {t.taxLines.map((x) => <div class="tr"><span>{x.name} {x.rate}%</span><b>{money(x.amount)}</b></div>)}
                {t.roundOff !== 0 && <div class="tr"><span>Round off</span><b>{money(t.roundOff)}</b></div>}
                <div class="tr grand"><span>Total</span><span>{money(t.grandTotal)}</span></div>
              </div>
              <div class="grid g2 mt">
                <Btn onClick={hold} disabled={!order.lines.length}>{order.id ? 'Update open' : 'Hold / KOT'}</Btn>
                <Btn kind="primary" disabled={!order.lines.length || !can(user, 'pos.pay')} onClick={() => setPay(true)}>Pay {money(t.grandTotal)}</Btn>
              </div>
              {(order.lines.length > 0 || order.id) && <Btn kind="ghost" class="sm mt" onClick={() => setOrder(blankOrder(settings))}>Clear</Btn>}
              {!can(user, 'pos.pay') && <div class="tiny muted mt">Your role can take orders; a cashier collects payment.</div>}
            </div>
          </div>
        )}
        {tab === 'open' && (
          <div class="list">
            {open.map((o) => (
              <div class="item">
                <div class="grow"><div class="main-t">{o.number} • {o.type === 'dine-in' ? o.tableName : o.customerName || o.type}</div><div class="small muted">{o.lines.length} items • {fmtDateTime(o.createdAt)} • {o.createdBy}</div></div>
                <div class="amt">{money(o.grandTotal)}</div>
                <Btn class="sm" onClick={() => { setOrder(o); setTab('order'); }}>Open</Btn>
                <Btn class="sm danger" kind="ghost" onClick={() => cancelOpen(o)}>Cancel</Btn>
              </div>
            ))}
            {!open.length && <Empty title="No open orders" />}
          </div>
        )}
        {tab === 'history' && (
          <div class="list">
            {history.filter((o) => o.status !== 'Open').map((o) => (
              <div class="item" onClick={() => o.status === 'Paid' && setReceipt(o)}>
                <div class="grow"><div class="row" style="gap:8px"><span class="main-t">{o.number}</span><Badge s={o.status} /></div><div class="small muted">{TYPES.find((x) => x.value === o.type)?.label} {o.tableName ? '• ' + o.tableName : ''} • {fmtDateTime(o.paidAt || o.createdAt)} • {(o.payments || []).map((p) => p.method).join(', ')}</div></div>
                <div class="amt">{money(o.grandTotal)}</div>
              </div>
            ))}
            {!history.filter((o) => o.status !== 'Open').length && <Empty title="No orders yet" />}
          </div>
        )}
      </div>
      {tab === 'order' && order.lines.length > 0 && <a href="#" onClick={(e) => { e.preventDefault(); document.getElementById('cart')?.scrollIntoView({ behavior: 'smooth' }); }} class="btn primary show-phone" style="position:fixed;left:12px;right:12px;bottom:80px;z-index:35">View cart • {order.lines.reduce((a, l) => a + l.qty, 0)} items • {money(t.grandTotal)}</a>}
      {pay && <PayModal total={t.grandTotal} onClose={() => setPay(false)} onPay={finishPay} />}
      {receipt && <PdfPreview title={`Receipt ${receipt.number}`} build={async () => buildReceiptPdf(receipt, await getSettings())} fileName={`Receipt_${receipt.number.replace(/\W+/g, '-')}.pdf`}
        phone={normalizePhone(receipt.customerPhone)} message={`Receipt ${receipt.number} — ${money(receipt.grandTotal)}. Thank you!`} docType="order" docId={receipt.id} onClose={() => setReceipt(null)} />}
      {tablesOpen && <TablesModal tables={tables} occupied={occupied} onClose={() => setTablesOpen(false)} />}
    </>
  );
}

function PayModal({ total, onClose, onPay }) {
  const [rows, setRows] = useState([{ method: 'Cash', amount: total }]);
  const [tendered, setTendered] = useState('');
  const [busy, setBusy] = useState(false);
  const sum = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const diff = Math.round((sum - total) * 100) / 100;
  const cashRow = rows.find((r) => r.method === 'Cash');
  const change = cashRow && Number(tendered) > Number(cashRow.amount) ? Number(tendered) - Number(cashRow.amount) : 0;
  const submit = async () => { if (busy) return; setBusy(true); try { await onPay(rows.filter((r) => Number(r.amount) > 0).map((r) => ({ method: r.method, amount: Number(r.amount) }))); } catch (e) { toast(e.message, 'error'); setBusy(false); } };
  return (
    <Modal title={`Collect ${money(total)}`} size="narrow" onClose={onClose} footer={<><Btn onClick={onClose}>Back</Btn><Btn kind="primary" disabled={diff !== 0 || busy} onClick={submit}>{busy ? 'Saving…' : 'Complete payment'}</Btn></>}>
      <div class="row">{METHODS.slice(0, 3).map((m) => <Btn class="sm" onClick={() => setRows([{ method: m, amount: total }])}>{m} full</Btn>)}<Btn class="sm" onClick={() => setRows([...rows, { method: 'UPI', amount: Math.max(0, Math.round((total - sum) * 100) / 100) }])}>Split</Btn></div>
      {rows.map((r, i) => (
        <div class="row mt" style="flex-wrap:nowrap">
          <select class="input" value={r.method} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, method: e.currentTarget.value } : x)))}>{METHODS.map((m) => <option>{m}</option>)}</select>
          <input class="input num" type="number" inputMode="decimal" value={r.amount} onInput={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.currentTarget.value } : x)))} />
          {rows.length > 1 && <Btn class="icon danger" kind="ghost" icon="trash" onClick={() => setRows(rows.filter((_, j) => j !== i))} />}
        </div>
      ))}
      {cashRow && <Field label="Cash tendered (for change)" class="mt"><Num value={tendered} onInput={setTendered} /></Field>}
      {change > 0 && <div class="notice ok mt">Return change: <b>{money(change)}</b></div>}
      {diff !== 0 && <div class="err mt">{diff > 0 ? `Over by ${money(diff)}` : `Short by ${money(-diff)}`}</div>}
    </Modal>
  );
}

function TablesModal({ tables, occupied, onClose }) {
  const [name, setName] = useState('');
  const [seats, setSeats] = useState(4);
  const addT = async () => { if (!name.trim()) return; const id = uid(); await db.diningTables.put({ id, name: name.trim(), seats: Number(seats) || 0, active: true }); await audit('create', 'table', id, name); setName(''); };
  return (
    <Modal title="Tables" onClose={onClose}>
      <div class="row" style="flex-wrap:nowrap"><Input placeholder="Table name (e.g. T1)" value={name} onInput={setName} /><input class="input num" style="max-width:90px" type="number" value={seats} onInput={(e) => setSeats(e.currentTarget.value)} title="Seats" /><Btn kind="primary" onClick={addT}>Add</Btn></div>
      <div class="list mt">
        {tables.map((t) => (
          <div class="item" style="cursor:default">
            <div class="grow"><input class="input" style="min-height:36px" value={t.name} onChange={(e) => db.diningTables.update(t.id, { name: e.currentTarget.value })} /><div class="tiny muted mt">{t.seats} seats • {occupied.has(t.id) ? 'Occupied' : t.active === false ? 'Disabled' : 'Free'}</div></div>
            <Btn class="sm" onClick={() => db.diningTables.update(t.id, { active: t.active === false })}>{t.active === false ? 'Enable' : 'Disable'}</Btn>
          </div>
        ))}
      </div>
    </Modal>
  );
}
