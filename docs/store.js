// On-device database for the cafe's phone/tablet (IndexedDB).
// Everything about customers, visits and points lives here, on the admin's device only.

const DB_NAME = 'cafe-loyalty';
const KEY = 'state';

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const r = db.transaction('kv').objectStore('kv').get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbPut(key, value) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const t = db.transaction('kv', 'readwrite');
    t.objectStore('kv').put(value, key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export const DEFAULT_SETTINGS = {
  cafe_name: 'Our Cafe',
  country_code: '91',
  points_per_visit: 10,
  visit_cooldown_hours: 4,
  reward_threshold: 100,
  reward_name: 'Free coffee',
  points_expiry_days: 0,
  reminder_visits_away: 2,
  reminder_template: 'Hi {{customer_name}}! You are only {{visits_away}} visits away from your next {{reward_name}} at {{cafe_name}} ☕',
  reminder_min_days: 7,
  instagram_url: '',
  wifi_ssid: '',
  wifi_password: '',
};

export let S = null; // the whole database, kept in memory and saved after every change

export async function load() {
  S = (await idbGet(KEY)) || null;
  if (S) S.settings = { ...DEFAULT_SETTINGS, ...S.settings };
  return S;
}
export async function save() { await idbPut(KEY, S); }
export const hasDatabase = () => !!S;

export async function persistStorage() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}

// ---------- ids, time, PINs ----------
export const uid = (n = 8) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
export const nowIso = () => new Date().toISOString();

async function pinHash(pin, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/../g), (h) => parseInt(h, 16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function makePin(pin) {
  if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN must be 4 to 8 digits');
  const salt = uid(16);
  return { salt, hash: await pinHash(pin, salt) };
}
export async function checkPin(pin) {
  const { admin, staff } = S.auth;
  if (admin && (await pinHash(pin, admin.salt)) === admin.hash) return 'admin';
  if (staff && (await pinHash(pin, staff.salt)) === staff.hash) return 'staff';
  return null;
}

export async function createDatabase({ cafe_name, country_code, pin }) {
  S = {
    version: 1,
    createdAt: nowIso(),
    settings: { ...DEFAULT_SETTINGS, cafe_name: cafe_name.trim() || 'Our Cafe', country_code: String(country_code || '').replace(/\D/g, '') },
    auth: { admin: await makePin(pin), staff: null },
    customers: {},   // key: normalized mobile
    visits: [],
    ledger: [],
    badges: [
      { id: uid(4), name: 'First Sip', icon: '☕', description: 'Your first visit', type: 'visits', value: 1, active: true },
      { id: uid(4), name: 'Regular', icon: '⭐', description: '10 visits', type: 'visits', value: 10, active: true },
    ],
    unlocked: {},    // mobile -> { badgeId: date }
    tables: [],
    campaigns: [],
    audit: [],
    lastBackupAt: null,
  };
  audit('admin', 'database.create', { cafe_name });
  await save();
}

export function audit(by, action, details) {
  S.audit.unshift({ at: nowIso(), by, action, details: details ?? null });
  if (S.audit.length > 3000) S.audit.length = 3000;
}

// ---------- customers ----------
export function normalizeMobile(raw) {
  const s = String(raw || '').trim();
  const digits = s.replace(/\D/g, '');
  const cc = S?.settings?.country_code || '';
  let out;
  if (s.startsWith('+')) out = '+' + digits;
  else if (s.startsWith('00')) out = '+' + digits.slice(2);
  else if (cc && digits.length <= 10) out = '+' + cc + digits.replace(/^0+/, '');
  else out = '+' + digits;
  const n = out.length - 1;
  if (n < 8 || n > 15) throw new Error('Please enter a valid mobile number');
  return out;
}

export const balance = (mobile) => S.ledger.reduce((sum, l) => (l.mobile === mobile ? sum + l.delta : sum), 0);
export const visitCount = (mobile) => S.visits.reduce((n, v) => (v.mobile === mobile && !v.voided ? n + 1 : n), 0);
const earned = (mobile) => Math.max(0, S.ledger.reduce((s, l) => (l.mobile === mobile && ['visit', 'void', 'adjust'].includes(l.kind) ? s + l.delta : s), 0));

export function progress(points) {
  const s = S.settings;
  const remaining = Math.max(0, s.reward_threshold - points);
  return {
    reward_name: s.reward_name,
    reward_threshold: s.reward_threshold,
    points_to_reward: remaining,
    visits_to_reward: s.points_per_visit > 0 ? Math.ceil(remaining / s.points_per_visit) : null,
    reward_available: s.reward_threshold > 0 && points >= s.reward_threshold,
    percent: s.reward_threshold > 0 ? Math.max(0, Math.min(100, Math.round((points / s.reward_threshold) * 100))) : 0,
  };
}

export function summary(mobile) {
  const c = S.customers[mobile];
  const points = balance(mobile);
  return { ...c, points, visits: visitCount(mobile), progress: progress(points), badges: unlockedBadges(mobile) };
}

export function unlockedBadges(mobile) {
  const u = S.unlocked[mobile] || {};
  return S.badges.filter((b) => u[b.id]).map((b) => ({ ...b, unlocked_at: u[b.id] }));
}

function unlockBadges(mobile) {
  const v = visitCount(mobile), e = earned(mobile);
  const u = (S.unlocked[mobile] ||= {});
  const fresh = [];
  for (const b of S.badges) {
    if (!b.active || u[b.id]) continue;
    if ((b.type === 'visits' ? v : e) >= b.value) { u[b.id] = nowIso(); fresh.push(b); }
  }
  return fresh;
}

// A scanned customer card. Matches by mobile number, so a customer who signs up again
// on a new phone with the same number keeps their points.
export function findOrPrepare(card) {
  const mobile = normalizeMobile(card.m);
  const existing = S.customers[mobile];
  return { mobile, existing: existing ? summary(mobile) : null, card };
}

export async function addCustomer(card, by) {
  const mobile = normalizeMobile(card.m);
  if (S.customers[mobile]) return mobile;
  S.customers[mobile] = {
    mobile, name: String(card.n || '').slice(0, 60) || 'Customer', ids: [card.i], table: card.t || null,
    createdAt: card.c || nowIso(), addedAt: nowIso(), status: 'active', marketing: !!card.o, lastVisitAt: null, lastContactAt: null,
  };
  audit(by, 'customer.add', { mobile, name: S.customers[mobile].name, table: card.t || null });
  await save();
  return mobile;
}

export async function linkCardId(mobile, id) {
  const c = S.customers[mobile];
  if (c && id && !c.ids.includes(id)) { c.ids.push(id); await save(); }
}

export async function recordVisit(mobile, by) {
  const s = S.settings;
  const c = S.customers[mobile];
  if (!c) throw new Error('Customer not found');
  if (c.status !== 'active') throw new Error('This customer is blocked');
  const last = S.visits.findLast((v) => v.mobile === mobile && !v.voided);
  if (last && s.visit_cooldown_hours > 0) {
    const next = new Date(last.at).getTime() + s.visit_cooldown_hours * 3600e3;
    if (Date.now() < next) throw new Error(`Visit already counted at ${new Date(last.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Next visit can be counted after ${new Date(next).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
  }
  const v = { id: uid(6), mobile, at: nowIso(), points: s.points_per_visit, by, voided: false };
  S.visits.push(v);
  S.ledger.push({ id: uid(6), mobile, at: v.at, delta: s.points_per_visit, kind: 'visit', reason: 'Visit', visit: v.id, by });
  c.lastVisitAt = v.at;
  const fresh = unlockBadges(mobile);
  audit(by, 'visit.record', { mobile, points: s.points_per_visit, badges: fresh.map((b) => b.name) });
  await save();
  return { message: `Visit recorded: +${s.points_per_visit} points`, new_badges: fresh };
}

export async function redeem(mobile, by) {
  const s = S.settings;
  const pts = balance(mobile);
  if (!(s.reward_threshold > 0 && pts >= s.reward_threshold)) throw new Error(`Not enough points (${pts}/${s.reward_threshold})`);
  S.ledger.push({ id: uid(6), mobile, at: nowIso(), delta: -s.reward_threshold, kind: 'redeem', reason: `Redeemed: ${s.reward_name}`, by });
  audit(by, 'reward.redeem', { mobile, reward: s.reward_name, points: -s.reward_threshold });
  await save();
  return { message: `Redeemed ${s.reward_name} (−${s.reward_threshold} points)` };
}

export async function adjust(mobile, delta, reason, by) {
  delta = Math.trunc(Number(delta));
  if (!delta) throw new Error('Enter a non-zero whole number');
  if (!String(reason || '').trim()) throw new Error('A reason is required');
  S.ledger.push({ id: uid(6), mobile, at: nowIso(), delta, kind: 'adjust', reason: reason.trim().slice(0, 200), by });
  if (delta > 0) unlockBadges(mobile);
  audit(by, 'points.adjust', { mobile, delta, reason });
  await save();
}

export async function voidVisit(visitId, reason, by) {
  if (!String(reason || '').trim()) throw new Error('A reason is required');
  const v = S.visits.find((x) => x.id === visitId);
  if (!v || v.voided) throw new Error('Visit not found or already voided');
  v.voided = true; v.voidReason = reason.trim().slice(0, 200);
  S.ledger.push({ id: uid(6), mobile: v.mobile, at: nowIso(), delta: -v.points, kind: 'void', reason: `Visit corrected: ${v.voidReason}`, visit: v.id, by });
  audit(by, 'visit.void', { mobile: v.mobile, reason });
  await save();
}

// Points expire after N days without a visit (0 = never). Runs when the admin app opens.
export async function expirePoints() {
  const days = S.settings.points_expiry_days;
  if (!days) return 0;
  const cutoff = Date.now() - days * 86400e3;
  let n = 0;
  for (const c of Object.values(S.customers)) {
    if (new Date(c.lastVisitAt || c.addedAt).getTime() >= cutoff) continue;
    const b = balance(c.mobile);
    if (b <= 0) continue;
    S.ledger.push({ id: uid(6), mobile: c.mobile, at: nowIso(), delta: -b, kind: 'expire', reason: `Points expired after ${days} days without a visit`, by: 'system' });
    n++;
  }
  if (n) { audit('system', 'points.expire', { customers: n }); await save(); }
  return n;
}

// Data that goes back to the customer's phone in the "update your card" QR.
export function cardUpdate(mobile, cardId) {
  const s = summary(mobile);
  return {
    i: cardId, p: s.points, v: s.visits, at: nowIso(),
    b: s.badges.map((b) => [b.icon, b.name]),
    s: publicSettings(),
  };
}
export function publicSettings() {
  const s = S.settings;
  return { n: s.cafe_name, pv: s.points_per_visit, rt: s.reward_threshold, rn: s.reward_name, ig: s.instagram_url };
}

export const fill = (template, vars) => String(template).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

// ---------- backup ----------
export function exportJson() {
  S.lastBackupAt = nowIso();
  audit('admin', 'backup.export');
  save();
  return JSON.stringify(S);
}
export async function importJson(text) {
  const data = JSON.parse(text);
  if (!data || data.version !== 1 || !data.customers || !data.auth?.admin) throw new Error('This is not a cafe loyalty backup file');
  S = data;
  S.settings = { ...DEFAULT_SETTINGS, ...S.settings };
  audit('admin', 'backup.import', { customers: Object.keys(S.customers).length });
  await save();
}
