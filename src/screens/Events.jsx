import { useState } from 'preact/hooks';
import { db, audit } from '../db.js';
import { money, todayISO, fmtDate, fmtTime, displayPhone } from '../format.js';
import { useLive, TopBar, Badge, Empty, Modal, Btn, Field, Area, Input, toast } from '../ui.jsx';

// Events are stored on their quotation / bill (one source of truth, linked both ways).
export function Events({ user }) {
  const [view, setView] = useState('upcoming');
  const [open, setOpen] = useState(null);
  const all = useLive(async () => {
    const [quotes, bills] = await Promise.all([db.quotations.toArray(), db.invoices.toArray()]);
    const billByQuote = new Map(bills.filter((b) => b.quotationId).map((b) => [b.quotationId, b]));
    const out = [];
    for (const q of quotes) {
      if (!q.event?.date || q.status === 'Rejected') continue;
      out.push({ key: 'q' + q.id, quote: q, bill: billByQuote.get(q.id) || null, ev: q.event, client: q.client });
    }
    for (const b of bills) {
      if (b.quotationId || !b.event?.date || b.status === 'Void') continue;
      out.push({ key: 'b' + b.id, quote: null, bill: b, ev: b.event, client: b.client });
    }
    return out.sort((a, b) => (a.ev.date + (a.ev.time || '') > b.ev.date + (b.ev.time || '') ? 1 : -1));
  }, [], null);
  if (!all) return null;
  const today = todayISO();
  const shown = view === 'upcoming' ? all.filter((e) => e.ev.date >= today) : view === 'past' ? all.filter((e) => e.ev.date < today).reverse() : all;
  let lastMonth = '';
  return (
    <>
      <TopBar title="Events" />
      <div class="content">
        <div class="chips">{['upcoming', 'past', 'all'].map((v) => <button class={'chip' + (view === v ? ' on' : '')} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}</div>
        <div class="list mt">
          {shown.map((e) => {
            const month = fmtDate(e.ev.date, 'D MMMM YYYY').split(' ').slice(1).join(' ');
            const header = month !== lastMonth ? (lastMonth = month) : null;
            return (
              <>
                {header && <h3 class="mt">{header}</h3>}
                <div class="item" onClick={() => setOpen(e)}>
                  <div style="text-align:center;min-width:52px"><div class="bold" style="font-size:22px;color:var(--navy)">{e.ev.date.slice(8)}</div><div class="tiny muted">{e.ev.time ? fmtTime(e.ev.time) : e.ev.timeLabel || ''}</div></div>
                  <div class="grow">
                    <div class="main-t ellipsis">{e.client?.name} — {e.ev.type || e.ev.menuTitle || 'Event'}</div>
                    <div class="small muted ellipsis">{e.ev.venue || 'Venue TBD'} • {e.ev.guests || '?'} pax {e.ev.staff ? '• Staff: ' + e.ev.staff : ''}</div>
                  </div>
                  <div class="row" style="gap:6px;flex-direction:column;align-items:flex-end">
                    {e.quote && <Badge s={e.quote.status}>{e.quote.status}</Badge>}
                    {e.bill && <Badge s={e.bill.status === 'Draft' ? 'Draft' : e.bill.paymentStatus || 'Unpaid'}>{e.bill.number ? 'Bill ' + (e.bill.paymentStatus || 'Unpaid') : 'Draft bill'}</Badge>}
                  </div>
                </div>
              </>
            );
          })}
          {!shown.length && <Empty title="No events">Events appear here from quotations and bills that have an event date.</Empty>}
        </div>
      </div>
      {open && <EventModal e={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function EventModal({ e, onClose }) {
  const [staff, setStaff] = useState(e.ev.staff || '');
  const [schedule, setSchedule] = useState(e.ev.schedule || '');
  const save = async () => {
    const patch = (doc) => ({ event: { ...doc.event, staff, schedule } });
    if (e.quote) await db.quotations.update(e.quote.id, patch(e.quote));
    if (e.bill) await db.invoices.update(e.bill.id, patch(e.bill));
    await audit('edit', 'event', (e.quote || e.bill).id, `staff/schedule updated`);
    toast('Event updated'); onClose();
  };
  return (
    <Modal title={`${e.client?.name} — ${fmtDate(e.ev.date, 'D MMMM YYYY')}`} onClose={onClose} footer={<><Btn onClick={onClose}>Close</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
      <div class="stack">
        <div class="small">
          <div><b>{e.ev.type || e.ev.menuTitle}</b> • {e.ev.timeLabel} {e.ev.time ? fmtTime(e.ev.time) : ''}</div>
          <div class="muted">{e.ev.venue} • {e.ev.guests || '?'} guests • {displayPhone(e.client?.whatsapp || e.client?.phone)}</div>
        </div>
        <div class="row">
          {e.quote && <a class="btn sm" href={'#/quotes/' + e.quote.id} onClick={onClose}>Quotation {e.quote.number} • {money(e.quote.grandTotal)}</a>}
          {e.bill && <a class="btn sm" href={'#/bills/' + e.bill.id} onClick={onClose}>{e.bill.number ? 'Bill ' + e.bill.number : 'Draft bill'} • {money(e.bill.grandTotal)}</a>}
        </div>
        <Field label="Assigned staff"><Input value={staff} onInput={setStaff} placeholder="e.g. Imran (chef), 12 waiters, Salim (supervisor)" /></Field>
        <Field label="Schedule & notes"><Area value={schedule} onInput={setSchedule} placeholder={'4:00 PM leave kitchen\n6:00 PM counters ready\n8:00 PM dinner service'} /></Field>
      </div>
    </Modal>
  );
}
