import { useEffect, useState } from 'preact/hooks';
import { db, getSettings, audit, exportBackup, importBackup } from '../db.js';
import { can, createUser, setPin } from '../auth.js';
import { ROLES } from '../seed.js';
import { fmtDateTime, todayISO, addDaysISO, uid } from '../format.js';
import { useLive, TopBar, Btn, Field, Input, Num, Area, Select, Check, Modal, toast, confirmDialog, promptDialog, downloadBlob } from '../ui.jsx';
import { computeTotals } from '../calc.js';
import { blankQuotation, saveQuotation, setQuotationStatus, convertQuotationToBill, finalizeBill, addPayment, snapshotLineFromItem } from '../repo.js';

const TABS = [['business', 'Business'], ['docs', 'Documents'], ['tax', 'Tax & POS'], ['users', 'Users'], ['data', 'Backup & data'], ['audit', 'Audit log']];

export function SettingsScreen({ user }) {
  const owner = can(user, 'settings.edit');
  const [tab, setTab] = useState(owner ? 'business' : 'me');
  const [s, setS] = useState(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { getSettings().then(setS); }, []);
  if (!s) return null;
  const u = (k) => (v) => { setS((prev) => ({ ...prev, [k]: v })); setDirty(true); };
  const save = async () => { await db.settings.put({ ...s, id: 'main' }); await audit('edit', 'settings', 'main', tab); setDirty(false); toast('Settings saved'); };
  const tabs = owner ? TABS : [['me', 'My account'], ...(can(user, 'audit.view') ? [['audit', 'Audit log']] : [])];
  return (
    <>
      <TopBar title="Settings">{owner && ['business', 'docs', 'tax'].includes(tab) && <Btn kind="primary" disabled={!dirty} onClick={save}>{dirty ? 'Save' : 'Saved'}</Btn>}</TopBar>
      <div class="content">
        <div class="chips mb">{tabs.map(([k, l]) => <button class={'chip' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>)}</div>
        {tab === 'me' && <MyAccount user={user} />}
        {tab === 'business' && <Business s={s} u={u} />}
        {tab === 'docs' && <Docs s={s} u={u} />}
        {tab === 'tax' && <TaxPos s={s} u={u} setS={(x) => { setS(x); setDirty(true); }} />}
        {tab === 'users' && <Users me={user} />}
        {tab === 'data' && <DataTab user={user} />}
        {tab === 'audit' && <AuditLog />}
      </div>
    </>
  );
}

function MyAccount({ user }) {
  const [p1, setP1] = useState('');
  return (
    <div class="card" style="max-width:520px">
      <p>Signed in as <b>{user.name}</b> ({user.role}).</p>
      <Field label="New PIN"><Input type="password" inputMode="numeric" value={p1} onInput={setP1} /></Field>
      <Btn kind="primary" class="mt" onClick={async () => { try { await setPin(user.id, p1); setP1(''); toast('PIN changed'); } catch (e) { toast(e.message, 'error'); } }}>Change PIN</Btn>
    </div>
  );
}

function Business({ s, u }) {
  const onLogo = async (e) => {
    const f = e.currentTarget.files[0];
    if (!f) return;
    const url = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
    const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = url; });
    const max = 600, sc = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    u('logo')(c.toDataURL('image/png'));
    u('logoW')(c.width); u('logoH')(c.height);
  };
  return (
    <div class="stack">
      <div class="card">
        <div class="card-title"><h3>Branding (appears on every PDF)</h3></div>
        <div class="grid g2">
          <Field label="Brand line 1 (gold, large)"><Input value={s.brandLine1} onInput={u('brandLine1')} /></Field>
          <Field label="Brand line 2 (navy)"><Input value={s.brandLine2} onInput={u('brandLine2')} /></Field>
          <Field label="Tagline"><Input value={s.tagline} onInput={u('tagline')} /></Field>
          <Field label="Footer line (every page)"><Input value={s.footerTagline} onInput={u('footerTagline')} /></Field>
          <Field label="Closing line" style="grid-column:1/-1"><Input value={s.closingLine} onInput={u('closingLine')} /></Field>
          <Field label="Logo (optional, shown above the name)">
            <div class="row">{s.logo && <img src={s.logo} style="height:54px;border:1px solid var(--line);border-radius:8px;padding:4px;background:#fff" />}<input type="file" accept="image/*" onChange={onLogo} />{s.logo && <Btn class="sm" onClick={() => u('logo')('')}>Remove</Btn>}</div>
          </Field>
          <div class="field"><span>Brand colours</span><div class="row">{['navy', 'gold', 'maroon', 'green', 'cream'].map((k) => <label class="tiny muted" style="text-align:center"><input type="color" class="swatch" value={s.colors[k]} onInput={(e) => u('colors')({ ...s.colors, [k]: e.currentTarget.value })} /><div>{k}</div></label>)}</div></div>
        </div>
      </div>
      <div class="card">
        <div class="card-title"><h3>Contact & registration</h3></div>
        <div class="grid g2">
          <Field label="Address" style="grid-column:1/-1"><Input value={s.address} onInput={u('address')} /></Field>
          <Field label="Phone"><Input value={s.phone} onInput={u('phone')} /></Field>
          <Field label="Email"><Input value={s.email} onInput={u('email')} /></Field>
          <Field label="GSTIN (tax registration)"><Input value={s.gstin} onInput={(v) => u('gstin')(v.toUpperCase())} /></Field>
          <Field label="FSSAI licence no."><Input value={s.fssai} onInput={u('fssai')} /></Field>
          <Field label="Bank details (shown on unpaid bills)" style="grid-column:1/-1"><Area value={s.bankDetails} onInput={u('bankDetails')} placeholder={'Bank: …\nA/c: …\nIFSC: …'} /></Field>
          <Field label="UPI ID"><Input value={s.upiId} onInput={u('upiId')} /></Field>
        </div>
      </div>
    </div>
  );
}

function Docs({ s, u }) {
  return (
    <div class="stack">
      <div class="card">
        <div class="card-title"><h3>Numbering (separate sequences)</h3></div>
        <div class="grid g3">
          <Field label="Quotation prefix" hint={`e.g. ${s.quotePrefix}${s.numberByFY ? '2026-27/' : ''}0001`}><Input value={s.quotePrefix} onInput={u('quotePrefix')} /></Field>
          <Field label="Bill prefix" hint={`e.g. ${s.billPrefix}${s.numberByFY ? '2026-27/' : ''}0001`}><Input value={s.billPrefix} onInput={u('billPrefix')} /></Field>
          <Field label="POS order prefix"><Input value={s.orderPrefix} onInput={u('orderPrefix')} /></Field>
        </div>
        <Check checked={s.numberByFY} onChange={u('numberByFY')} label="Restart numbering every financial year (April–March)" />
      </div>
      <div class="card">
        <div class="card-title"><h3>Defaults</h3></div>
        <div class="grid g3">
          <Field label="Bill heading"><Select value={s.invoiceTitle} onChange={u('invoiceTitle')} options={['FINAL BILL', 'TAX INVOICE', 'INVOICE']} /></Field>
          <Field label="Quotation valid for (days)"><Num value={s.quoteValidityDays} onInput={u('quoteValidityDays')} /></Field>
          <Field label="Bill due after (days)"><Num value={s.billDueDays} onInput={u('billDueDays')} /></Field>
          <Field label="Date format"><Select value={s.dateFormat} onChange={u('dateFormat')} options={['DD-MM-YYYY', 'DD/MM/YYYY', 'D MMMM YYYY', 'YYYY-MM-DD']} /></Field>
        </div>
        <Check checked={s.showRatesInMenu} onChange={u('showRatesInMenu')} label="New quotations show item-wise rates inside the menu section" />
      </div>
      <div class="card">
        <div class="card-title"><h3>Default text</h3><span class="tiny muted">One point per line</span></div>
        <div class="grid g2">
          <Field label="Quotation inclusions"><Area value={s.quoteInclusions} onInput={u('quoteInclusions')} /></Field>
          <Field label="Quotation exclusions"><Area value={s.quoteExclusions} onInput={u('quoteExclusions')} /></Field>
          <Field label="Quotation terms"><Area value={s.quoteTerms} onInput={u('quoteTerms')} /></Field>
          <Field label="Bill terms"><Area value={s.billTerms} onInput={u('billTerms')} /></Field>
        </div>
      </div>
    </div>
  );
}

function TaxPos({ s, u, setS }) {
  return (
    <div class="stack">
      <div class="card">
        <div class="card-title"><h3>Tax</h3></div>
        <Check checked={s.taxEnabled} onChange={u('taxEnabled')} label="Apply tax by default on new quotations & bills" />
        <div class="list mt">
          {s.taxes.map((t, i) => (
            <div class="row" style="flex-wrap:nowrap">
              <input class="input" value={t.name} placeholder="Tax name (e.g. CGST)" onInput={(e) => setS({ ...s, taxes: s.taxes.map((x, j) => (j === i ? { ...x, name: e.currentTarget.value } : x)) })} />
              <input class="input num" style="max-width:120px" type="number" step="any" value={t.rate} onInput={(e) => setS({ ...s, taxes: s.taxes.map((x, j) => (j === i ? { ...x, rate: Number(e.currentTarget.value) || 0 } : x)) })} />
              <span class="small">%</span>
              <Btn class="icon danger" kind="ghost" icon="trash" onClick={() => setS({ ...s, taxes: s.taxes.filter((_, j) => j !== i) })} />
            </div>
          ))}
        </div>
        <Btn class="sm mt" icon="plus" onClick={() => setS({ ...s, taxes: [...s.taxes, { name: 'GST', rate: 0 }] })}>Add tax</Btn>
        <p class="tiny muted">Tax is applied on (subtotal − discount + charges). Rates are copied into each document so changing them never alters old bills. Confirm the correct GST treatment for your business with your accountant.</p>
        <Check checked={s.roundOff} onChange={u('roundOff')} label="Round off totals to the nearest rupee" />
      </div>
      <div class="card">
        <div class="card-title"><h3>POS & permissions</h3></div>
        <Check checked={s.posTaxEnabled} onChange={u('posTaxEnabled')} label="Apply tax on POS orders by default" />
        <Check checked={s.dineInEnabled} onChange={u('dineInEnabled')} label="Enable dine-in with table management" />
        <Field label="Max discount a Cashier may give (%)" style="max-width:280px"><Num value={s.cashierMaxDiscountPct} onInput={u('cashierMaxDiscountPct')} /></Field>
      </div>
    </div>
  );
}

function Users({ me }) {
  const users = useLive(() => db.users.toArray(), [], []);
  const [add, setAdd] = useState(false);
  const [n, setN] = useState({ name: '', role: 'Cashier', pin: '' });
  const owners = users.filter((x) => x.role === 'Owner' && x.active).length;
  return (
    <div class="card">
      <div class="card-title"><h3>Users & roles</h3><Btn class="sm" kind="primary" icon="plus" onClick={() => setAdd(true)}>Add user</Btn></div>
      <table class="t"><thead><tr><th>Name</th><th>Role</th><th>Status</th><th /></tr></thead><tbody>
        {users.map((x) => (
          <tr>
            <td>{x.name}{x.id === me.id ? ' (you)' : ''}</td>
            <td><select class="input" style="min-height:36px" value={x.role} disabled={x.id === me.id} onChange={async (e) => { await db.users.update(x.id, { role: e.currentTarget.value }); await audit('role', 'user', x.id, `${x.name} → ${e.currentTarget.value}`); }}>{ROLES.map((r) => <option>{r}</option>)}</select></td>
            <td>{x.active ? 'Active' : 'Disabled'}</td>
            <td class="right"><div class="row end">
              <Btn class="sm" onClick={async () => { const p = await promptDialog(`New PIN for ${x.name}`, { type: 'password' }); if (p) { try { await setPin(x.id, p); toast('PIN reset'); } catch (e) { toast(e.message, 'error'); } } }}>Reset PIN</Btn>
              {x.id !== me.id && !(x.role === 'Owner' && owners <= 1 && x.active) && <Btn class="sm" onClick={async () => { await db.users.update(x.id, { active: x.active ? 0 : 1 }); await audit(x.active ? 'disable' : 'enable', 'user', x.id, x.name); }}>{x.active ? 'Disable' : 'Enable'}</Btn>}
            </div></td>
          </tr>
        ))}
      </tbody></table>
      <div class="small muted mt">
        <b>Owner</b>: everything. <b>Manager</b>: prices, reports, unlimited discounts, delete, edit/void finalized bills. <b>Cashier</b>: quotations, bills, payments, POS, limited discount. <b>Staff</b>: take POS orders, view menu & events.
      </div>
      {add && <Modal title="Add user" size="narrow" onClose={() => setAdd(false)} footer={<><Btn onClick={() => setAdd(false)}>Cancel</Btn><Btn kind="primary" onClick={async () => { try { await createUser(n); setAdd(false); setN({ name: '', role: 'Cashier', pin: '' }); toast('User added'); } catch (e) { toast(e.message, 'error'); } }}>Add</Btn></>}>
        <div class="stack">
          <Field label="Name"><Input value={n.name} onInput={(v) => setN({ ...n, name: v })} autoFocus /></Field>
          <Field label="Role"><Select value={n.role} onChange={(v) => setN({ ...n, role: v })} options={ROLES} /></Field>
          <Field label="PIN (4–8 digits)"><Input type="password" inputMode="numeric" value={n.pin} onInput={(v) => setN({ ...n, pin: v })} /></Field>
        </div>
      </Modal>}
    </div>
  );
}

function DataTab({ user }) {
  const shares = useLive(() => db.shares.orderBy('ts').reverse().limit(50).toArray(), [], []);
  const last = useLive(() => db.settings.get('main').then((s) => s?.lastBackupAt), [], null);
  const doExport = async () => {
    const data = await exportBackup();
    downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `catering-pos-backup-${todayISO()}.json`);
    await db.settings.update('main', { lastBackupAt: Date.now() });
    await audit('backup', 'data', '', 'exported');
    toast('Backup downloaded — keep it somewhere safe (Google Drive, email)');
  };
  const doImport = async (e) => {
    const f = e.currentTarget.files[0];
    e.currentTarget.value = '';
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      if (!(await confirmDialog(`Restore backup from ${json.exportedAt || 'unknown date'}?\nALL current data on this device will be replaced.`, { danger: true, ok: 'Replace & restore' }))) return;
      await importBackup(json);
      await audit('restore', 'data', '', f.name);
      toast('Restored. Reloading…');
      setTimeout(() => { sessionStorage.clear(); location.reload(); }, 900);
    } catch (err) { toast(err.message, 'error'); }
  };
  return (
    <div class="stack">
      <div class="card">
        <div class="card-title"><h3>Backup & restore</h3></div>
        <p class="small">All data is stored on this device (works offline). Take a backup regularly and before changing phones. Last backup: <b>{last ? fmtDateTime(last) : 'never'}</b></p>
        <div class="row"><Btn kind="primary" icon="download" onClick={doExport}>Download backup</Btn>
          <label class="btn">Restore from file<input type="file" accept="application/json,.json" style="display:none" onChange={doImport} /></label></div>
      </div>
      <div class="card">
        <div class="card-title"><h3>Demo data</h3></div>
        <p class="small muted">Creates a sample client, quotation (from the reference dinner menu), a bill and a part-payment — all marked DEMO — so you can try every screen. Remove before going live.</p>
        <div class="row"><Btn onClick={loadDemo}>Load demo data</Btn><Btn class="danger" onClick={removeDemo}>Remove demo data</Btn></div>
      </div>
      <div class="card">
        <div class="card-title"><h3>Sharing log</h3></div>
        <table class="t"><thead><tr><th>When</th><th>Document</th><th>Method</th><th>Result</th></tr></thead><tbody>
          {shares.map((x) => <tr><td class="small">{fmtDateTime(x.ts)}</td><td class="small">{x.docType}</td><td class="small">{x.method}</td><td class="small">{x.result}</td></tr>)}
        </tbody></table>
        {!shares.length && <div class="empty small">Nothing shared yet.</div>}
      </div>
    </div>
  );
}

function AuditLog() {
  const [q, setQ] = useState('');
  const rows = useLive(() => db.audit.orderBy('ts').reverse().limit(500).toArray(), [], []);
  const f = q.trim().toLowerCase();
  const shown = rows.filter((r) => !f || [r.action, r.entity, r.userName, r.details].join(' ').toLowerCase().includes(f));
  return (
    <div class="card">
      <Input placeholder="Filter (user, action, number…)" value={q} onInput={setQ} />
      <div class="tablewrap mt"><table class="t"><thead><tr><th>When</th><th>User</th><th>Action</th><th>Record</th><th>Details</th></tr></thead><tbody>
        {shown.map((r) => <tr><td class="small" style="white-space:nowrap">{fmtDateTime(r.ts)}</td><td class="small">{r.userName}</td><td class="small">{r.action}</td><td class="small">{r.entity}</td><td class="small">{r.details}</td></tr>)}
      </tbody></table></div>
    </div>
  );
}

async function loadDemo() {
  if (await db.quotations.filter((q) => q.demo).count()) return toast('Demo data already loaded');
  const cats = await db.categories.orderBy('sort').toArray();
  const items = (await db.items.toArray()).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const byName = (n) => items.find((i) => i.name === n);
  const q = await blankQuotation();
  q.demo = true;
  q.client = { name: '[DEMO] Dr. Enam ur Rahim Sb', phone: '7276115888', whatsapp: '7276115888', email: '', address: 'Nagpur' };
  q.event = { ...q.event, type: 'Dinner Reception', menuTitle: 'Dinner Menu', menuSubtitle: 'An elegant journey of Indian classics, Italian favourites & live culinary artistry', date: addDaysISO(todayISO(), 24), timeLabel: 'Dinner', time: '20:00', venue: 'Raj Celebration • Gorewada Ring Road', guests: 150 };
  q.lines = items.filter((i) => cats.find((c) => c.id === i.categoryId)?.kind === 'menu').map((i) => snapshotLineFromItem(i, cats.find((c) => c.id === i.categoryId), 150));
  const staff = byName('Service Staff (Waiters)');
  if (staff) q.lines.push({ ...snapshotLineFromItem(staff, cats.find((c) => c.id === staff.categoryId), 12), rate: 800 });
  q.package = { enabled: true, rate: 650, pax: 150, label: 'Per-plate dinner package (menu as above)' };
  q.charges = [{ label: 'Live counter setup', amount: 4000 }];
  const saved = await saveQuotation(q);
  await setQuotationStatus(saved.id, 'Accepted');
  const bill = await convertQuotationToBill(saved.id);
  await db.invoices.update(bill.id, { demo: true, package: { ...bill.package, pax: 162 }, lines: [...bill.lines, { id: uid(), name: 'Extra Rabdi Jalebi counter', description: '', diet: 'veg', unit: 'Plate', qty: 40, rate: 60, note: 'added on event day', category: bill.lines.find((l) => l.category?.name === 'Dessert Atelier')?.category || null }] });
  const b2 = await db.invoices.get(bill.id);
  const t = computeTotals(b2);
  await db.invoices.update(bill.id, { totals: t, grandTotal: t.grandTotal });
  await finalizeBill(bill.id);
  await addPayment(bill.id, { id: uid(), date: todayISO(), amount: 50000, method: 'UPI', reference: 'DEMO-UTR-001' });
  toast('Demo data loaded — see Quotations and Bills');
}

async function removeDemo() {
  if (!(await confirmDialog('Delete all DEMO quotations, bills, payments and the demo client?', { danger: true, ok: 'Delete demo data' }))) return;
  await db.transaction('rw', db.quotations, db.invoices, db.payments, db.clients, db.counters, db.audit, async () => {
    const qs = await db.quotations.filter((q) => q.demo).toArray();
    const bs = await db.invoices.filter((b) => b.demo || qs.some((q) => q.id === b.quotationId)).toArray();
    for (const b of bs) await db.payments.where('invoiceId').equals(b.id).delete();
    await db.invoices.bulkDelete(bs.map((b) => b.id));
    await db.quotations.bulkDelete(qs.map((q) => q.id));
    const cl = await db.clients.filter((c) => c.name.startsWith('[DEMO]')).toArray();
    await db.clients.bulkDelete(cl.map((c) => c.id));
    if ((await db.quotations.count()) === 0 && (await db.invoices.count()) === 0) {
      const keys = (await db.counters.toArray()).filter((c) => c.key.startsWith('quote:') || c.key.startsWith('bill:')).map((c) => c.key);
      await db.counters.bulkDelete(keys);
    }
    await audit('delete', 'demo', '', `${qs.length} quotations, ${bs.length} bills`);
  });
  toast('Demo data removed');
}
