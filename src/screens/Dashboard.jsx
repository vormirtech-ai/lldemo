import { db } from '../db.js';
import { can } from '../auth.js';
import { money, todayISO, addDaysISO, fmtDate, fmtTime } from '../format.js';
import { useLive, go, TopBar, Btn, Stat, Badge, Empty } from '../ui.jsx';

export function Dashboard({ user, settings }) {
  const data = useLive(async () => {
    const today = todayISO();
    const startTs = new Date(today + 'T00:00:00').getTime();
    const [quotes, bills, payments, orders] = await Promise.all([db.quotations.toArray(), db.invoices.toArray(), db.payments.toArray(), db.orders.where('createdAt').aboveOrEqual(startTs - 86400000).toArray()]);
    const paidToday = orders.filter((o) => o.status === 'Paid' && (o.paidAt || 0) >= startTs);
    const posToday = paidToday.reduce((a, o) => a + (o.grandTotal || 0), 0);
    const billPaysToday = payments.filter((p) => !p.voided && p.date === today).reduce((a, p) => a + Number(p.amount), 0);
    const billedToday = bills.filter((b) => b.status === 'Finalized' && b.invoiceDate === today).reduce((a, b) => a + b.grandTotal, 0);
    const pending = quotes.filter((q) => ['Draft', 'Sent'].includes(q.status));
    const accepted = quotes.filter((q) => q.status === 'Accepted');
    const fin = bills.filter((b) => b.status === 'Finalized');
    const unpaid = fin.filter((b) => (b.balance ?? b.grandTotal) > 0);
    const outstanding = unpaid.reduce((a, b) => a + (b.balance ?? b.grandTotal), 0);
    const horizon = addDaysISO(today, 30);
    const events = [
      ...quotes.filter((q) => ['Accepted', 'Sent', 'Draft'].includes(q.status) && q.event?.date >= today && q.event?.date <= horizon).map((q) => ({ src: 'quote', id: q.id, doc: q })),
      ...bills.filter((b) => b.status !== 'Void' && b.event?.date >= today && b.event?.date <= horizon).map((b) => ({ src: 'bill', id: b.id, doc: b }))
    ].filter((e, i, arr) => !(e.src === 'quote' && e.doc.convertedInvoiceId && arr.some((x) => x.id === e.doc.convertedInvoiceId)))
      .sort((a, b) => (a.doc.event.date + (a.doc.event.time || '') > b.doc.event.date + (b.doc.event.time || '') ? 1 : -1));
    return { posToday, posCount: paidToday.length, billPaysToday, billedToday, pending, accepted, unpaid, outstanding, events, openOrders: orders.filter((o) => o.status === 'Open').length };
  }, [], null);
  if (!data) return null;
  return (
    <>
      <TopBar title={`Hello, ${user.name.split(' ')[0]}`}>
        <span class="hide-phone small muted">{fmtDate(todayISO(), 'D MMMM YYYY')}</span>
      </TopBar>
      <div class="content">
        <div class="row mb">
          {can(user, 'quote.create') && <Btn kind="primary" icon="quote" onClick={() => go('/quotes/new')}>New quotation</Btn>}
          {can(user, 'bill.create') && <Btn kind="gold" icon="bill" onClick={() => go('/bills/new')}>New bill</Btn>}
          {can(user, 'pos.use') && <Btn icon="pos" onClick={() => go('/pos')}>Open POS{data.openOrders ? ` (${data.openOrders} open)` : ''}</Btn>}
        </div>
        <div class="grid g4">
          <Stat accent k="Today's collections" v={money(data.posToday + data.billPaysToday)} s={`POS ${money(data.posToday)} • Bills ${money(data.billPaysToday)}`} />
          <Stat k="Billed today" v={money(data.billedToday)} s="Finalized bills (actual)" onClick={() => go('/bills')} />
          <Stat k="Pending quotations" v={data.pending.length} s={'Estimates ' + money(data.pending.reduce((a, q) => a + q.grandTotal, 0))} onClick={() => go('/quotes')} />
          <Stat k="Accepted bookings" v={data.accepted.length} s="Waiting to be billed" onClick={() => go('/quotes')} />
          <Stat k="Upcoming events" v={data.events.length} s="Next 30 days" onClick={() => go('/events')} />
          <Stat k="Unpaid bills" v={data.unpaid.length} s="Finalized with balance" onClick={() => go('/bills')} />
          <Stat k="Outstanding balance" v={money(data.outstanding)} s="Across all bills" />
          <Stat k="POS orders today" v={data.posCount} s={money(data.posToday)} onClick={() => go('/pos')} />
        </div>
        <div class="grid g2 mt">
          <div class="card">
            <div class="card-title"><h3>Upcoming events</h3><a class="small" href="#/events">All events</a></div>
            <div class="list">
              {data.events.slice(0, 6).map((e) => (
                <a class="item" href={e.src === 'quote' ? '#/quotes/' + e.id : '#/bills/' + e.id}>
                  <div style="text-align:center;min-width:52px"><div class="bold" style="font-size:20px;color:var(--navy)">{e.doc.event.date.slice(8)}</div><div class="tiny muted">{fmtDate(e.doc.event.date, 'D MMMM YYYY').split(' ')[1]?.slice(0, 3)}</div></div>
                  <div class="grow"><div class="main-t ellipsis">{e.doc.client?.name}</div><div class="small muted ellipsis">{e.doc.event.type || e.doc.event.menuTitle} • {e.doc.event.guests || '?'} pax {e.doc.event.time ? '• ' + fmtTime(e.doc.event.time) : ''}</div></div>
                  <Badge s={e.src === 'quote' ? e.doc.status : 'Finalized'}>{e.src === 'quote' ? e.doc.status : e.doc.number ? 'Billed' : 'Draft bill'}</Badge>
                </a>
              ))}
              {!data.events.length && <Empty title="No events in the next 30 days" />}
            </div>
          </div>
          <div class="card">
            <div class="card-title"><h3>Unpaid bills</h3><a class="small" href="#/bills">All bills</a></div>
            <div class="list">
              {data.unpaid.sort((a, b) => (a.dueDate > b.dueDate ? 1 : -1)).slice(0, 6).map((b) => (
                <a class="item" href={'#/bills/' + b.id}>
                  <div class="grow"><div class="main-t ellipsis">{b.client?.name}</div><div class="small muted">{b.number} • due {fmtDate(b.dueDate)}{b.dueDate < todayISO() ? ' • OVERDUE' : ''}</div></div>
                  <div class="amt" style="color:var(--maroon)">{money(b.balance ?? b.grandTotal)}</div>
                </a>
              ))}
              {!data.unpaid.length && <Empty title="All bills are paid" />}
            </div>
          </div>
        </div>
        <p class="tiny muted mt">Quotation amounts are estimates only. Revenue figures come from finalized bills and POS sales.</p>
      </div>
    </>
  );
}
