// Business operations. Financial writes run inside Dexie transactions.
import { db, audit, nextNumber, getSettings, getCurrentUser } from './db.js';
import { computeTotals, paymentSummary, toPaise } from './calc.js';
import { uid, todayISO, addDaysISO, normalizePhone } from './format.js';

// ---------- Clients ----------
export async function findClientByPhone(phone, excludeId) {
  const n = normalizePhone(phone);
  if (!n) return null;
  const all = await db.clients.toArray();
  return all.find((c) => c.id !== excludeId && (normalizePhone(c.phone) === n || normalizePhone(c.whatsapp) === n)) || null;
}

export async function upsertClientFromDoc(snapshot, clientId) {
  // Returns client id; reuses an existing client with same phone to avoid duplicates.
  if (!snapshot?.name?.trim()) throw new Error('Client name is required');
  let id = clientId;
  if (!id) {
    const dup = await findClientByPhone(snapshot.whatsapp || snapshot.phone);
    if (dup) id = dup.id;
  }
  const now = Date.now();
  if (id) {
    const c = await db.clients.get(id);
    if (c) {
      await db.clients.update(id, {
        name: snapshot.name.trim(), phone: snapshot.phone || c.phone, whatsapp: snapshot.whatsapp || c.whatsapp,
        email: snapshot.email || c.email, address: snapshot.address || c.address, gstin: snapshot.gstin || c.gstin || '', updatedAt: now
      });
      return id;
    }
  }
  id = uid();
  await db.clients.put({ id, name: snapshot.name.trim(), phone: snapshot.phone || '', whatsapp: snapshot.whatsapp || '', email: snapshot.email || '', address: snapshot.address || '', gstin: snapshot.gstin || '', notes: '', createdAt: now, updatedAt: now });
  await audit('create', 'client', id, snapshot.name);
  return id;
}

export async function mergeClients(keepId, removeId) {
  await db.transaction('rw', db.clients, db.quotations, db.invoices, db.audit, async () => {
    const keep = await db.clients.get(keepId);
    const rem = await db.clients.get(removeId);
    if (!keep || !rem) throw new Error('Client not found');
    await db.quotations.where('clientId').equals(removeId).modify({ clientId: keepId });
    await db.invoices.where('clientId').equals(removeId).modify({ clientId: keepId });
    const notes = [keep.notes, rem.notes].filter(Boolean).join('\n');
    await db.clients.update(keepId, { notes, email: keep.email || rem.email, address: keep.address || rem.address, whatsapp: keep.whatsapp || rem.whatsapp });
    await db.clients.delete(removeId);
    await audit('merge', 'client', keepId, `merged ${rem.name} (${removeId}) into ${keep.name}`);
  });
}

// ---------- Shared doc helpers ----------
export function snapshotLineFromItem(item, cat, qty) {
  return {
    id: uid(), itemId: item.id, name: item.name, description: item.description || '', diet: item.diet || '',
    unit: item.unit || '', rate: Number(item.rate) || 0, qty: qty ?? 1, note: '',
    categoryId: cat?.id || '', category: cat ? { name: cat.name, subtitle: cat.subtitle, accent: cat.accent, kind: cat.kind, sort: cat.sort } : null
  };
}

export async function blankQuotation() {
  const s = await getSettings();
  const d = todayISO();
  return {
    id: null, number: '', status: 'Draft', quoteDate: d, validUntil: addDaysISO(d, s.quoteValidityDays || 15),
    clientId: '', client: { name: '', phone: '', whatsapp: '', email: '', address: '' },
    event: { type: '', menuTitle: 'Dinner Menu', menuSubtitle: '', date: '', timeLabel: 'Dinner', time: '', venue: '', guests: '', staff: '', schedule: '' },
    lines: [], package: { enabled: false, rate: 0, pax: 0, label: 'Per-plate menu package (menu as above)' },
    discount: { type: 'amount', value: 0 }, charges: [], applyTax: !!s.taxEnabled, taxes: s.taxes.map((t) => ({ ...t })), roundOff: !!s.roundOff,
    showRates: !!s.showRatesInMenu, inclusions: s.quoteInclusions, exclusions: s.quoteExclusions, terms: s.quoteTerms, notes: '', revision: 0
  };
}

export async function saveQuotation(q) {
  const s = await getSettings();
  const user = getCurrentUser();
  return db.transaction('rw', db.quotations, db.clients, db.counters, db.audit, async () => {
    const clientId = await upsertClientFromDoc(q.client, q.clientId);
    const totals = computeTotals(q);
    const now = Date.now();
    const rec = { ...q, clientId, totals, grandTotal: totals.grandTotal, eventDate: q.event?.date || '', updatedAt: now };
    if (!rec.id) {
      rec.id = uid();
      rec.number = await nextNumber('quote', s, q.quoteDate);
      rec.createdAt = now; rec.createdBy = user?.name || '';
      await db.quotations.add(rec);
      await audit('create', 'quotation', rec.id, `${rec.number} for ${q.client.name} — ${totals.grandTotal}`);
    } else {
      const prev = await db.quotations.get(rec.id);
      if (prev?.status === 'Converted') throw new Error('This quotation was converted to a bill and is locked. Duplicate it to make changes.');
      if (prev && ['Sent', 'Accepted'].includes(prev.status)) rec.revision = (prev.revision || 0) + 1;
      await db.quotations.put(rec);
      await audit('edit', 'quotation', rec.id, `${rec.number} rev ${rec.revision || 0} — ${totals.grandTotal}`);
    }
    return rec;
  });
}

export async function setQuotationStatus(id, status) {
  const q = await db.quotations.get(id);
  if (!q) return;
  if (q.status === 'Converted') throw new Error('Converted quotations cannot change status.');
  await db.quotations.update(id, { status, updatedAt: Date.now(), ...(status === 'Sent' ? { sentAt: Date.now() } : {}) });
  await audit('status', 'quotation', id, `${q.number}: ${q.status} → ${status}`);
}

export async function duplicateQuotation(id) {
  const q = await db.quotations.get(id);
  const s = await getSettings();
  const copy = { ...structuredClone(q), id: null, number: '', status: 'Draft', quoteDate: todayISO(), validUntil: addDaysISO(todayISO(), s.quoteValidityDays || 15), convertedInvoiceId: null, revision: 0, sentAt: null };
  copy.lines = copy.lines.map((l) => ({ ...l, id: uid() }));
  const saved = await saveQuotation(copy);
  await audit('duplicate', 'quotation', saved.id, `from ${q.number}`);
  return saved;
}

// Mark Draft/Sent quotations past validity as Expired.
export async function expireQuotations() {
  const today = todayISO();
  const list = await db.quotations.where('status').anyOf('Draft', 'Sent').toArray();
  for (const q of list) if (q.validUntil && q.validUntil < today) {
    await db.quotations.update(q.id, { status: 'Expired' });
    await audit('status', 'quotation', q.id, `${q.number}: auto-expired`);
  }
}

// ---------- Bills ----------
export async function blankBill() {
  const s = await getSettings();
  const d = todayISO();
  return {
    id: null, number: null, status: 'Draft', invoiceDate: d, dueDate: addDaysISO(d, s.billDueDays || 0), title: s.invoiceTitle,
    quotationId: null, quotationNumber: '', clientId: '', client: { name: '', phone: '', whatsapp: '', email: '', address: '', gstin: '' },
    event: { type: '', menuTitle: '', date: '', time: '', venue: '', guests: '' },
    lines: [], package: { enabled: false, rate: 0, pax: 0, label: 'Per-plate menu package' }, listIncluded: false,
    discount: { type: 'amount', value: 0 }, charges: [], applyTax: !!s.taxEnabled, taxes: s.taxes.map((t) => ({ ...t })), roundOff: !!s.roundOff,
    terms: s.billTerms, notes: ''
  };
}

// Create a bill from an accepted quotation. The quotation is preserved unchanged
// (only its status/link fields change) and can never produce two bills.
export async function convertQuotationToBill(qid) {
  const s = await getSettings();
  const blank = await blankBill();
  return db.transaction('rw', db.quotations, db.invoices, db.audit, async () => {
    const q = await db.quotations.get(qid);
    if (!q) throw new Error('Quotation not found');
    if (q.convertedInvoiceId) {
      const existing = await db.invoices.get(q.convertedInvoiceId);
      if (existing) return existing;
    }
    const dupe = await db.invoices.where('quotationId').equals(qid).first();
    if (dupe) return dupe;
    if (!['Accepted', 'Sent', 'Draft', 'Expired'].includes(q.status)) throw new Error(`A ${q.status} quotation cannot be billed.`);
    const d = todayISO();
    const bill = {
      ...blank,
      id: uid(), quotationId: q.id, quotationNumber: q.number, clientId: q.clientId, client: { ...q.client },
      event: { ...q.event }, lines: structuredClone(q.lines).map((l) => ({ ...l, id: uid() })), package: { ...q.package },
      discount: { ...q.discount }, charges: structuredClone(q.charges || []), applyTax: q.applyTax, taxes: structuredClone(q.taxes || s.taxes), roundOff: q.roundOff,
      invoiceDate: d, dueDate: addDaysISO(d, s.billDueDays || 0), createdAt: Date.now(), createdBy: getCurrentUser()?.name || '', updatedAt: Date.now()
    };
    bill.totals = computeTotals(bill); bill.grandTotal = bill.totals.grandTotal; bill.eventDate = bill.event.date || '';
    await db.invoices.add(bill);
    await db.quotations.update(q.id, { status: 'Converted', convertedInvoiceId: bill.id, updatedAt: Date.now() });
    await audit('convert', 'quotation', q.id, `${q.number} → draft bill`);
    await audit('create', 'invoice', bill.id, `draft from ${q.number}`);
    return bill;
  });
}

export async function saveBill(b, { allowFinalEdit = false } = {}) {
  const user = getCurrentUser();
  return db.transaction('rw', db.invoices, db.clients, db.audit, async () => {
    if (b.id) {
      const prev = await db.invoices.get(b.id);
      if (prev?.status === 'Void') throw new Error('Void bills cannot be edited.');
      if (prev?.status === 'Finalized' && !allowFinalEdit) throw new Error('This bill is finalized. Use “Edit finalized bill” (manager permission).');
    }
    const clientId = await upsertClientFromDoc(b.client, b.clientId);
    const totals = computeTotals(b);
    const rec = { ...b, clientId, totals, grandTotal: totals.grandTotal, eventDate: b.event?.date || '', updatedAt: Date.now() };
    if (!rec.id) {
      rec.id = uid(); rec.createdAt = Date.now(); rec.createdBy = user?.name || '';
      await db.invoices.add(rec);
      await audit('create', 'invoice', rec.id, `draft for ${b.client.name} — ${totals.grandTotal}`);
    } else {
      await db.invoices.put(rec);
      await audit(rec.status === 'Finalized' ? 'edit-finalized' : 'edit', 'invoice', rec.id, `${rec.number || 'draft'} — ${totals.grandTotal}`);
    }
    return rec;
  });
}

export async function finalizeBill(id) {
  const s = await getSettings();
  return db.transaction('rw', db.invoices, db.counters, db.audit, async () => {
    const b = await db.invoices.get(id);
    if (!b) throw new Error('Bill not found');
    if (b.status !== 'Draft') return b; // already finalized — never re-number
    if (!b.lines.length && !b.package?.enabled) throw new Error('Add at least one item before finalizing.');
    const number = await nextNumber('bill', s, b.invoiceDate);
    await db.invoices.update(id, { status: 'Finalized', number, finalizedAt: Date.now(), updatedAt: Date.now() });
    await audit('finalize', 'invoice', id, `${number} — ${b.grandTotal}`);
    return { ...b, status: 'Finalized', number };
  });
}

export async function voidBill(id, reason) {
  const b = await db.invoices.get(id);
  await db.invoices.update(id, { status: 'Void', voidReason: reason || '', voidedAt: Date.now() });
  await audit('void', 'invoice', id, `${b.number || 'draft'}: ${reason || ''}`);
}

// Payments: client-generated id = idempotency key, so a double tap cannot insert twice.
export async function addPayment(invoiceId, p) {
  return db.transaction('rw', db.invoices, db.payments, db.audit, async () => {
    const inv = await db.invoices.get(invoiceId);
    if (!inv) throw new Error('Bill not found');
    if (inv.status !== 'Finalized') throw new Error('Finalize the bill before recording payments.');
    if (!(toPaise(p.amount) > 0)) throw new Error('Enter an amount greater than zero.');
    if (await db.payments.get(p.id)) return; // duplicate submission
    const pays = await db.payments.where('invoiceId').equals(invoiceId).toArray();
    const before = paymentSummary(inv.grandTotal, pays);
    if (toPaise(p.amount) > toPaise(before.balance) && !p.allowExcess) throw new Error(`Amount exceeds balance due (₹${before.balance}).`);
    await db.payments.add({ id: p.id, invoiceId, date: p.date, amount: Number(p.amount), method: p.method, reference: p.reference || '', notes: p.notes || '', createdAt: Date.now(), createdBy: getCurrentUser()?.name || '' });
    const after = paymentSummary(inv.grandTotal, [...pays, { amount: p.amount }]);
    await db.invoices.update(invoiceId, { paymentStatus: after.status, paid: after.paid, balance: after.balance });
    await audit('payment', 'invoice', invoiceId, `${inv.number}: ${p.method} ${p.amount}`);
  });
}

export async function voidPayment(paymentId, reason) {
  return db.transaction('rw', db.invoices, db.payments, db.audit, async () => {
    const p = await db.payments.get(paymentId);
    if (!p || p.voided) return;
    await db.payments.update(paymentId, { voided: true, voidReason: reason || '', voidedAt: Date.now() });
    const inv = await db.invoices.get(p.invoiceId);
    const pays = await db.payments.where('invoiceId').equals(p.invoiceId).toArray();
    const sum = paymentSummary(inv.grandTotal, pays);
    await db.invoices.update(p.invoiceId, { paymentStatus: sum.status, paid: sum.paid, balance: sum.balance });
    await audit('void-payment', 'invoice', p.invoiceId, `${inv.number}: ${p.amount} (${reason || ''})`);
  });
}

// Refresh cached payment fields (e.g. after a finalized bill is edited)
export async function refreshBillPaymentCache(invoiceId) {
  const inv = await db.invoices.get(invoiceId);
  if (!inv) return;
  const pays = await db.payments.where('invoiceId').equals(invoiceId).toArray();
  const sum = paymentSummary(inv.grandTotal, pays);
  await db.invoices.update(invoiceId, { paymentStatus: sum.status, paid: sum.paid, balance: sum.balance });
}

export function billDisplayStatus(b) {
  if (b.status === 'Draft' || b.status === 'Void') return b.status;
  return b.paymentStatus || 'Unpaid';
}
