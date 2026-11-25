import { useState } from 'preact/hooks';
import { db, fyLabel } from '../db.js';
import { money, num, todayISO, fmtDate, addDaysISO, qtyFmt } from '../format.js';
import { useLive, TopBar, Btn, Stat, Field, downloadBlob } from '../ui.jsx';

function range(preset) {
  const t = todayISO();
  const [y, m] = t.split('-').map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  switch (preset) {
    case 'today': return [t, t];
    case '7d': return [addDaysISO(t, -6), t];
    case 'month': return [`${y}-${pad(m)}-01`, t];
    case 'lastmonth': { const d = new Date(y, m - 2, 1); const e = new Date(y, m - 1, 0); return [`${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`, `${e.getFullYear()}-${pad(e.getMonth() + 1)}-${pad(e.getDate())}`]; }
    case 'fy': { const s = Number(fyLabel(t).slice(0, 4)); return [`${s}-04-01`, t]; }
    default: return [t, t];
  }
}
const isoOfTs = (ts) => { const d = new Date(ts); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

function toCSV(rows) {
  return rows.map((r) => r.map((c) => { const s = String(c ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n');
}
function exportCSV(name, rows) { downloadBlob(new Blob(['﻿' + toCSV(rows)], { type: 'text/csv' }), name + '.csv'); }

function Table({ title, head, rows, file, numeric = [] }) {
  return (
    <div class="card">
      <div class="card-title"><h3>{title}</h3><Btn class="sm" icon="download" disabled={!rows.length} onClick={() => exportCSV(file, [head, ...rows])}>CSV</Btn></div>
      <div class="tablewrap">
        <table class="t"><thead><tr>{head.map((h, i) => <th class={numeric.includes(i) ? 'num' : ''}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr>{r.map((c, i) => <td class={numeric.includes(i) ? 'num' : ''}>{typeof c === 'number' ? num(c) : c}</td>)}</tr>)}</tbody></table>
        {!rows.length && <div class="empty small">No data for this period.</div>}
      </div>
    </div>
  );
}

export function Reports() {
  const [preset, setPreset] = useState('month');
  const [custom, setCustom] = useState(range('month'));
  const [from, to] = preset === 'custom' ? custom : range(preset);
  const r = useLive(async () => {
    const [quotes, bills, pays, orders] = await Promise.all([db.quotations.toArray(), db.invoices.toArray(), db.payments.toArray(), db.orders.toArray()]);
    const inR = (d) => d && d >= from && d <= to;
    const fin = bills.filter((b) => b.status === 'Finalized' && inR(b.invoiceDate));
    const pos = orders.filter((o) => o.status === 'Paid' && inR(isoOfTs(o.paidAt || o.createdAt)));
    const pIn = pays.filter((p) => !p.voided && inR(p.date));
    const qIn = quotes.filter((q) => inR(q.quoteDate));
    const billed = fin.reduce((a, b) => a + b.grandTotal, 0);
    const posTotal = pos.reduce((a, o) => a + o.grandTotal, 0);
    const collections = pIn.reduce((a, p) => a + Number(p.amount), 0) + posTotal;
    const decided = qIn.filter((q) => ['Accepted', 'Converted', 'Rejected', 'Expired'].includes(q.status));
    const won = qIn.filter((q) => ['Accepted', 'Converted'].includes(q.status));
    const conv = decided.length ? Math.round((won.length / decided.length) * 1000) / 10 : 0;
    const allFin = bills.filter((b) => b.status === 'Finalized');
    const outstanding = allFin.reduce((a, b) => a + Math.max(0, b.balance ?? b.grandTotal), 0);

    // Sales by date
    const byDate = new Map();
    const addD = (d, k, v) => { const row = byDate.get(d) || { bills: 0, pos: 0 }; row[k] += v; byDate.set(d, row); };
    fin.forEach((b) => addD(b.invoiceDate, 'bills', b.grandTotal));
    pos.forEach((o) => addD(isoOfTs(o.paidAt || o.createdAt), 'pos', o.grandTotal));
    const salesByDate = [...byDate.entries()].sort().map(([d, v]) => [fmtDate(d), v.bills, v.pos, v.bills + v.pos]);

    // Item / category sales (actual billed lines + package + POS lines, before bill-level discount/tax)
    const items = new Map(), catsM = new Map();
    const addI = (name, cat, qty, amt) => {
      if (!(amt > 0)) return;
      const it = items.get(name) || { cat, qty: 0, amt: 0 }; it.qty += qty; it.amt += amt; items.set(name, it);
      catsM.set(cat, (catsM.get(cat) || 0) + amt);
    };
    fin.forEach((b) => {
      if (b.package?.enabled) addI(b.package.label || 'Per-plate package', 'Packages', Number(b.package.pax) || 0, (Number(b.package.pax) || 0) * (Number(b.package.rate) || 0));
      (b.lines || []).forEach((l) => addI(l.name, l.category?.name || 'Other', Number(l.qty) || 0, (Number(l.qty) || 0) * (Number(l.rate) || 0)));
    });
    pos.forEach((o) => o.lines.forEach((l) => addI(l.name, l.categoryName || 'POS', l.qty, l.qty * l.rate)));
    const itemRows = [...items.entries()].filter(([, v]) => v.amt > 0).sort((a, b) => b[1].amt - a[1].amt).map(([n, v]) => [n, v.cat, qtyFmt(v.qty), v.amt]);
    const catRows = [...catsM.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([c, v]) => [c, v]);

    const eventRows = fin.filter((b) => b.event?.date).map((b) => [fmtDate(b.event.date), b.client?.name, b.event.type || b.event.menuTitle || '', String(b.event.guests || ''), b.number, b.grandTotal, b.paid || 0, Math.max(0, b.balance ?? b.grandTotal)]);

    const byMethod = new Map();
    pIn.forEach((p) => byMethod.set(p.method, (byMethod.get(p.method) || 0) + Number(p.amount)));
    pos.forEach((o) => (o.payments || []).forEach((p) => byMethod.set(p.method + ' (POS)', (byMethod.get(p.method + ' (POS)') || 0) + Number(p.amount))));
    const methodRows = [...byMethod.entries()].sort((a, b) => b[1] - a[1]).map(([m, v]) => [m, v]);

    const dueRows = allFin.filter((b) => (b.balance ?? b.grandTotal) > 0).sort((a, b) => (a.dueDate > b.dueDate ? 1 : -1)).map((b) => [b.number, b.client?.name, fmtDate(b.invoiceDate), fmtDate(b.dueDate), b.grandTotal, b.paid || 0, b.balance ?? b.grandTotal, b.dueDate < todayISO() ? 'Overdue' : '']);

    const tax = new Map(); let taxable = 0;
    [...fin.map((b) => b.totals), ...pos.map((o) => o.totals)].forEach((t) => { if (!t) return; if (t.taxLines.length) taxable += t.taxable; t.taxLines.forEach((x) => tax.set(`${x.name} @ ${x.rate}%`, (tax.get(`${x.name} @ ${x.rate}%`) || 0) + x.amount)); });
    const taxRows = [['Taxable value', taxable], ...[...tax.entries()]];

    return { billed, posTotal, collections, conv, decided: decided.length, won: won.length, quoteValue: qIn.reduce((a, q) => a + q.grandTotal, 0), quoteCount: qIn.length, outstanding, salesByDate, itemRows, catRows, eventRows, methodRows, dueRows, taxRows };
  }, [from, to], null);

  return (
    <>
      <TopBar title="Reports" />
      <div class="content">
        <div class="chips">{[['today', 'Today'], ['7d', '7 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['fy', 'This FY'], ['custom', 'Custom']].map(([k, l]) => <button class={'chip' + (preset === k ? ' on' : '')} onClick={() => setPreset(k)}>{l}</button>)}</div>
        {preset === 'custom' && <div class="row mt"><Field label="From"><input class="input" type="date" value={custom[0]} onInput={(e) => setCustom([e.currentTarget.value, custom[1]])} /></Field><Field label="To"><input class="input" type="date" value={custom[1]} onInput={(e) => setCustom([custom[0], e.currentTarget.value])} /></Field></div>}
        <p class="small muted">{fmtDate(from, 'D MMMM YYYY')} – {fmtDate(to, 'D MMMM YYYY')}</p>
        {r && <>
          <div class="grid g4">
            <Stat accent k="Actual revenue" v={money(r.billed + r.posTotal)} s={`Bills ${money(r.billed)} • POS ${money(r.posTotal)}`} />
            <Stat k="Collections" v={money(r.collections)} s="Payments received + POS" />
            <Stat k="Outstanding dues" v={money(r.outstanding)} s="All finalized bills" />
            <Stat k="Quotation conversion" v={r.conv + '%'} s={`${r.won} won of ${r.decided} decided`} />
          </div>
          <div class="notice info mt">Quotations in this period: {r.quoteCount}, worth {money(r.quoteValue)} — <b>estimates, not revenue</b>. Revenue counts only finalized bills and paid POS orders.</div>
          <div class="mt">
            <Table title="Sales by date" head={['Date', 'Bills', 'POS', 'Total']} rows={r.salesByDate} numeric={[1, 2, 3]} file={`sales_${from}_${to}`} />
            <div class="grid g2 mt" style="align-items:start">
              <Table title="Category sales" head={['Category', 'Amount']} rows={r.catRows} numeric={[1]} file={`category_sales_${from}_${to}`} />
              <Table title="Payment collection" head={['Method', 'Amount']} rows={r.methodRows} numeric={[1]} file={`collections_${from}_${to}`} />
            </div>
            <div class="mt"><Table title="Item sales" head={['Item', 'Category', 'Qty', 'Amount']} rows={r.itemRows} numeric={[2, 3]} file={`item_sales_${from}_${to}`} /></div>
            <div class="mt"><Table title="Event revenue" head={['Event date', 'Client', 'Event', 'Guests', 'Bill', 'Total', 'Paid', 'Balance']} rows={r.eventRows} numeric={[5, 6, 7]} file={`event_revenue_${from}_${to}`} /></div>
            <div class="mt"><Table title="Outstanding dues (all time)" head={['Bill', 'Client', 'Bill date', 'Due', 'Total', 'Paid', 'Balance', '']} rows={r.dueRows} numeric={[4, 5, 6]} file="outstanding_dues" /></div>
            <div class="mt"><Table title="Tax summary" head={['Head', 'Amount']} rows={r.taxRows} numeric={[1]} file={`tax_summary_${from}_${to}`} /></div>
            <p class="tiny muted">Item/category figures are line amounts before bill-level discounts, charges and taxes.</p>
          </div>
        </>}
      </div>
    </>
  );
}
