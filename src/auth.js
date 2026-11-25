import { db, audit } from './db.js';
import { uid } from './format.js';

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPin(pin, salt) {
  // Iterated salted hash; PINs are never stored in plain text.
  let h = salt + ':' + pin;
  for (let i = 0; i < 2000; i++) h = await sha256(h);
  return h;
}

export async function createUser({ name, role, pin }) {
  if (!name?.trim()) throw new Error('Name is required');
  if (!/^\d{4,8}$/.test(pin || '')) throw new Error('PIN must be 4–8 digits');
  const salt = uid();
  const user = { id: uid(), name: name.trim(), role, salt, pinHash: await hashPin(pin, salt), active: 1, createdAt: Date.now() };
  await db.users.put(user);
  await audit('create', 'user', user.id, `${user.name} (${role})`);
  return user;
}

export async function setPin(userId, pin) {
  if (!/^\d{4,8}$/.test(pin || '')) throw new Error('PIN must be 4–8 digits');
  const u = await db.users.get(userId);
  const salt = uid();
  await db.users.update(userId, { salt, pinHash: await hashPin(pin, salt) });
  await audit('change-pin', 'user', userId, u?.name);
}

export async function verifyLogin(userId, pin) {
  const u = await db.users.get(userId);
  if (!u || !u.active) return null;
  const h = await hashPin(pin, u.salt);
  return h === u.pinHash ? u : null;
}

// Permission matrix
const P = {
  'settings.edit': ['Owner'],
  'users.manage': ['Owner'],
  'menu.edit': ['Owner', 'Manager'],
  'menu.price': ['Owner', 'Manager'],
  'reports.view': ['Owner', 'Manager'],
  'audit.view': ['Owner', 'Manager'],
  'record.delete': ['Owner', 'Manager'],
  'bill.editFinal': ['Owner', 'Manager'],
  'bill.void': ['Owner', 'Manager'],
  'payment.void': ['Owner', 'Manager'],
  'discount.unlimited': ['Owner', 'Manager'],
  'quote.create': ['Owner', 'Manager', 'Cashier'],
  'bill.create': ['Owner', 'Manager', 'Cashier'],
  'payment.add': ['Owner', 'Manager', 'Cashier'],
  'pos.pay': ['Owner', 'Manager', 'Cashier'],
  'pos.use': ['Owner', 'Manager', 'Cashier', 'Staff'],
  'clients.edit': ['Owner', 'Manager', 'Cashier'],
  'clients.merge': ['Owner', 'Manager'],
  'backup': ['Owner']
};

export const can = (user, perm) => !!user && (P[perm] || []).includes(user.role);
