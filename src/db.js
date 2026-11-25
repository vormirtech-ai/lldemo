import Dexie from 'dexie';
import { DEFAULT_CATEGORIES, DEFAULT_ITEMS, DEFAULT_SETTINGS } from './seed.js';
import { uid, todayISO } from './format.js';

export const db = new Dexie('catering_pos');

// Relational layout (IndexedDB). Foreign keys: items.categoryId -> categories.id,
// quotations.clientId / invoices.clientId -> clients.id, invoices.quotationId -> quotations.id,
// payments.invoiceId -> invoices.id, orders.tableId -> diningTables.id.
db.version(1).stores({
  settings: 'id',
  users: 'id, name, role',
  categories: 'id, sort, kind',
  items: 'id, categoryId, name, archived',
  clients: 'id, name, phone',
  quotations: 'id, &number, clientId, status, quoteDate, eventDate, updatedAt',
  invoices: 'id, number, clientId, status, invoiceDate, eventDate, quotationId, updatedAt',
  payments: 'id, invoiceId, date',
  orders: 'id, &number, status, createdAt, tableId',
  diningTables: 'id, name',
  counters: 'key',
  audit: '++seq, ts, entity, entityId, userId',
  shares: '++seq, docType, docId, ts'
});

export async function ensureSeed() {
  await db.transaction('rw', db.settings, db.categories, db.items, async () => {
    const s = await db.settings.get('main');
    if (!s) await db.settings.put({ ...DEFAULT_SETTINGS });
    if ((await db.categories.count()) === 0) {
      const ids = {};
      let sort = 0;
      for (const c of DEFAULT_CATEGORIES) {
        const id = uid();
        ids[c.key] = id;
        await db.categories.put({ id, name: c.name, subtitle: c.subtitle, accent: c.accent, kind: c.kind, sort: sort++, archived: 0 });
      }
      let i = 0;
      for (const [ck, name, description, diet, unit] of DEFAULT_ITEMS) {
        await db.items.put({ id: uid(), categoryId: ids[ck], name, description, diet, unit, rate: 0, archived: 0, sort: i++, image: '' });
      }
    }
  });
}

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await db.settings.get('main')) };
}

// Indian financial year label for a date, e.g. 2026-11-25 -> "2026-27"
export function fyLabel(iso = todayISO()) {
  const [y, m] = iso.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

// Allocate the next number in a sequence. Must be called inside a transaction
// that includes db.counters so two documents can never get the same number.
export async function nextNumber(kind, settings, dateISO) {
  const prefix = { quote: settings.quotePrefix, bill: settings.billPrefix, order: settings.orderPrefix }[kind] || '';
  const fy = settings.numberByFY ? fyLabel(dateISO) : '';
  const key = `${kind}:${fy}`;
  const row = (await db.counters.get(key)) || { key, value: 0 };
  row.value += 1;
  await db.counters.put(row);
  const pad = kind === 'order' ? 5 : 4;
  return `${prefix}${fy ? fy + '/' : ''}${String(row.value).padStart(pad, '0')}`;
}

let currentUser = null;
export const setCurrentUser = (u) => { currentUser = u; };
export const getCurrentUser = () => currentUser;

export async function audit(action, entity, entityId, details = '') {
  try {
    await db.audit.add({
      ts: Date.now(), action, entity, entityId,
      userId: currentUser?.id || '', userName: currentUser?.name || 'system',
      details: typeof details === 'string' ? details : JSON.stringify(details)
    });
  } catch (e) { console.error('audit failed', e); }
}

// ---------- Backup / restore ----------
const BACKUP_TABLES = ['settings', 'users', 'categories', 'items', 'clients', 'quotations', 'invoices', 'payments', 'orders', 'diningTables', 'counters', 'audit', 'shares'];

export async function exportBackup() {
  const out = { app: 'catering-pos', version: 1, exportedAt: new Date().toISOString(), data: {} };
  for (const t of BACKUP_TABLES) out.data[t] = await db.table(t).toArray();
  return out;
}

export async function importBackup(json) {
  if (!json || json.app !== 'catering-pos' || !json.data) throw new Error('This file is not a Catering POS backup.');
  await db.transaction('rw', BACKUP_TABLES.map((t) => db.table(t)), async () => {
    for (const t of BACKUP_TABLES) {
      await db.table(t).clear();
      if (Array.isArray(json.data[t])) await db.table(t).bulkPut(json.data[t]);
    }
  });
}
