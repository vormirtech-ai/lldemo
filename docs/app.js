// Cafe Loyalty: works entirely in the browser, hosted on GitHub Pages.
// - Customers keep their own card on their phone (localStorage).
// - The cafe's database (customers, visits, points) lives on the admin's phone (IndexedDB, see store.js).
// - Data moves between phones by scanning QR codes at the counter. No server.
import * as db from './store.js';

const app = document.getElementById('app');
const BASE_URL = location.origin + location.pathname.replace(/index\.html$/, '');

// ---------- helpers ----------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const b64u = (s) => { const bytes = new TextEncoder().encode(s); let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); }); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
const isUrl = (s) => /^(https?:)?\/\/|^[\w./-]+\.(png|jpe?g|svg|webp|gif)$/i.test(s || '');
const badgeIcon = (icon) => isUrl(icon) ? `<img src="${esc(icon)}" alt="">` : esc(icon || '☕');
const waDigits = (mobile) => String(mobile).replace(/\D/g, '');

function qrSvg(text) {
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

let toastTimer;
function toast(msg, isErr = false) {
  $('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 4000);
}

function onSubmit(form, handler) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit], button:not([type])');
    const data = Object.fromEntries(new FormData(form));
    $$('input[type=checkbox]', form).forEach((c) => { if (c.name) data[c.name] = c.checked; });
    if (btn) btn.disabled = true;
    try { await handler(data); }
    catch (err) { toast(err.message, true); }
    finally { if (btn) btn.disabled = false; }
  });
}

let cleanups = [];
const onLeave = (fn) => cleanups.push(fn);

// ---------- router ----------
const routes = { '': home, t: joinPage, card: cardPage, u: applyUpdate, r: restoreCard, admin: adminPage };
async function route() {
  cleanups.forEach((fn) => { try { fn(); } catch {} });
  cleanups = [];
  const [name = '', ...args] = location.hash.replace(/^#\/?/, '').split('/').map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  try { await (routes[name] || home)(...args); }
  catch (err) {
    console.error(err);
    app.className = 'wrap';
    app.innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="muted">${esc(err.message)}</p><button onclick="location.reload()">Try again</button></div>`;
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

function shell(inner, { title, wide = false, right = '' } = {}) {
  document.title = title || 'Cafe Loyalty';
  app.className = 'wrap' + (wide ? ' wide' : '');
  app.innerHTML = `
    <header class="topbar">
      <div class="brand"><img src="icon.svg" alt="">${esc(title || 'Cafe Loyalty')}</div>
      <div class="row">${right}</div>
    </header>${inner}`;
}

// ================= CUSTOMER =================
// Card on the customer's phone: { i, n, m, t, c, o, cafe:{n,pv,rt,rn,ig}, p, v, b:[[icon,name]], at }
const myCard = () => ls.get('lc_card');
const cardQrText = (c) => 'LC2:' + b64u(JSON.stringify({ i: c.i, n: c.n, m: c.m, t: c.t, c: c.c, o: c.o ? 1 : 0 }));

function home() {
  if (myCard()) return go('#/card');
  shell(`
    <section class="card loyalty">
      <h1>Loyalty card</h1>
      <p class="muted">Scan the QR code on your table to get your free loyalty card.</p>
    </section>
    <details class="card">
      <summary><b>Already have a card?</b></summary>
      <p class="small muted" style="margin-top:.75rem">Paste your saved card link to open your card on this phone.</p>
      <form id="paste" class="row"><input name="link" placeholder="Paste your card link" style="flex:1"><button type="submit">Open</button></form>
    </details>
    <p class="center small muted"><a href="#/admin">Cafe staff</a></p>`);
  onSubmit($('#paste'), async (d) => {
    const m = String(d.link).match(/#\/r\/([\w-]+)/);
    if (!m) throw new Error('That does not look like a card link');
    restoreCard(m[1]);
  });
}

function joinPage(table, settingsB64) {
  let cafe = {};
  try { cafe = settingsB64 ? JSON.parse(unb64u(settingsB64)) : {}; } catch {}
  const existing = myCard();
  if (existing) {
    // Refresh the cafe info shown on the card from the table QR, then open the card.
    if (cafe.n) ls.set('lc_card', { ...existing, cafe: { ...existing.cafe, ...cafe } });
    return go('#/card');
  }
  shell(`
    <section class="card loyalty">
      <h1>Join ${esc(cafe.n || 'our')} rewards</h1>
      ${cafe.pv ? `<p class="muted">Earn ${esc(cafe.pv)} points every visit.${cafe.rt ? ` Collect ${esc(cafe.rt)} points for a <b>${esc(cafe.rn)}</b>.` : ''}</p>` : ''}
      ${table ? `<p class="small muted">Welcome to ${esc(table)} ☕</p>` : ''}
    </section>
    <form class="card" id="join" novalidate>
      <div class="field"><label for="name">Your name</label><input id="name" name="name" autocomplete="given-name" required maxlength="60"></div>
      <div class="field"><label for="mobile">Mobile number</label><input id="mobile" name="mobile" type="tel" inputmode="tel" autocomplete="tel" required maxlength="20"></div>
      <div class="field"><label class="check"><input type="checkbox" name="accept" aria-label="I agree"> <span class="small">I agree that ${esc(cafe.n || 'the cafe')} keeps my name and mobile number to run my loyalty card. They are used only for this card and never shared or sold.</span></label></div>
      <div class="field"><label class="check"><input type="checkbox" name="offers" aria-label="Send me offers"> <span class="small">Send me reward reminders and occasional offers on WhatsApp/SMS (optional).</span></label></div>
      <div class="field"><button type="submit" class="big">Get my loyalty card</button></div>
    </form>
    <p class="center small muted">Already have a card on another phone? Just sign up again with the same mobile number. Your points stay with your number.</p>`, { title: cafe.n });
  onSubmit($('#join'), async (d) => {
    const name = String(d.name).trim();
    const digits = String(d.mobile).replace(/\D/g, '');
    if (name.length < 2) throw new Error('Please enter your name');
    if (digits.length < 8 || digits.length > 15) throw new Error('Please enter a valid mobile number');
    if (!d.accept) throw new Error('Please tick the box to agree to how we use your details');
    const mobile = String(d.mobile).trim().startsWith('+') ? '+' + digits : digits;
    ls.set('lc_card', { i: db.uid(8), n: name.slice(0, 60), m: mobile, t: table || null, c: new Date().toISOString(), o: !!d.offers, cafe, p: 0, v: 0, b: [], at: null });
    sessionStorage.setItem('lc_new', '1');
    go('#/card');
  });
}

function cardPage() {
  const c = myCard();
  if (!c) return go('#/');
  const cafe = c.cafe || {};
  const isNew = sessionStorage.getItem('lc_new'); sessionStorage.removeItem('lc_new');
  const rt = Number(cafe.rt) || 0, pv = Number(cafe.pv) || 0;
  const remaining = Math.max(0, rt - c.p);
  const visitsAway = pv ? Math.ceil(remaining / pv) : null;
  const pct = rt ? Math.max(0, Math.min(100, Math.round((c.p / rt) * 100))) : 0;
  shell(`
    ${isNew ? `<div class="notice ok" style="margin-bottom:14px">Welcome, ${esc(c.n)}! Show this QR code at the counter. Your first visit adds you to our rewards.</div>` : ''}
    <section class="card loyalty center">
      <div class="muted small">LOYALTY CARD</div>
      <h1 style="margin:.25rem 0 0">${esc(c.n)}</h1>
      <div class="qr-box" aria-label="Your card QR code">${qrSvg(cardQrText(c))}</div>
      <div class="small muted">Show this at the counter on every visit</div>
      <div class="stats">
        <div class="stat"><b>${c.p}</b><span>points</span></div>
        <div class="stat"><b>${c.v}</b><span>visits</span></div>
      </div>
      ${rt ? `<div style="text-align:left;margin-top:14px">
        <div class="row spread small"><span>${c.p >= rt ? `🎉 <b>${esc(cafe.rn)}</b> ready! Ask at the counter.` : `<b>${visitsAway}</b> ${visitsAway === 1 ? 'visit' : 'visits'} to your next ${esc(cafe.rn)}`}</span><span class="muted">${c.p}/${rt}</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div></div>` : ''}
      <div class="small muted" style="margin-top:8px">${c.at ? `Updated ${fmtDateTime(c.at)}` : 'After each visit, scan the code staff show you to update your points.'}</div>
    </section>
    <section class="card"><h2>Badges</h2>
      ${c.b?.length ? `<div class="badges">${c.b.map(([icon, name]) => `<div class="badge"><div class="icon">${badgeIcon(icon)}</div><b class="small">${esc(name)}</b></div>`).join('')}</div>` : '<p class="muted small">Visit us to unlock your first badge.</p>'}
    </section>
    <section class="card">
      <h2>Keep your card safe</h2>
      <p class="small muted">Your card lives in this phone's browser. Save your card link so you can open it again if you clear your browser. On iPhone, also tap <b>Share → Add to Home Screen</b>.</p>
      <div class="row"><button class="secondary" id="copy-link">Copy my card link</button>${navigator.share ? '<button class="secondary" id="share-link">Save / share…</button>' : ''}</div>
    </section>
    ${/^https:\/\//.test(cafe.ig || '') ? `<p class="center"><a class="btn secondary" href="${esc(cafe.ig)}" target="_blank" rel="noopener">Follow us on Instagram</a></p>` : ''}
    <p class="center small muted"><a href="#/admin">Cafe staff</a></p>`, { title: cafe.n });
  const link = BASE_URL + '#/r/' + b64u(JSON.stringify({ i: c.i, n: c.n, m: c.m, t: c.t, c: c.c, o: c.o, cafe }));
  $('#copy-link').onclick = async () => {
    try { await navigator.clipboard.writeText(link); toast('Card link copied. Keep it somewhere private.'); }
    catch { prompt('Copy your card link:', link); }
  };
  $('#share-link')?.addEventListener('click', () => navigator.share({ title: 'My loyalty card', url: link }).catch(() => {}));
}

function restoreCard(payload) {
  try {
    const d = JSON.parse(unb64u(payload));
    if (!d.i || !d.n || !d.m) throw new Error();
    const cur = myCard();
    ls.set('lc_card', { p: 0, v: 0, b: [], at: null, ...(cur?.i === d.i ? cur : {}), ...d });
    toast('Your loyalty card is on this phone');
  } catch { toast('This card link is not valid', true); }
  location.replace('#/card');
}

// Opened when the customer scans the "update your card" QR at the counter.
function applyUpdate(payload) {
  const c = myCard();
  try {
    const u = JSON.parse(unb64u(payload));
    if (!c) toast('Open this on the phone that has your loyalty card', true);
    else if (u.i !== c.i) toast('This update is for a different card', true);
    else if (c.at && u.at < c.at) toast('Your card already has newer points');
    else {
      ls.set('lc_card', { ...c, p: u.p, v: u.v, b: u.b || [], at: u.at, cafe: { ...c.cafe, ...u.s } });
      toast('Card updated ✓');
    }
  } catch { toast('This update code is not valid', true); }
  location.replace(c ? '#/card' : '#/');
}

// ================= CAFE DEVICE (admin / staff) =================
const role = () => sessionStorage.getItem('lc_role');
const by = () => role() || 'unknown';

async function adminPage(tab = 'scan', id) {
  if (!db.hasDatabase()) await db.load();
  if (!db.hasDatabase()) return setupPage();
  if (!role()) return unlockPage();
  if (role() !== 'admin' && tab !== 'scan') return go('#/admin/scan');
  const s = db.S.settings;
  const tabs = role() === 'admin'
    ? [['scan', 'Scan'], ['customers', 'Customers'], ['offers', 'Reminders & offers'], ['rules', 'Rules & cafe'], ['badges', 'Badges'], ['tables', 'Table QR codes'], ['backup', 'Backup'], ['audit', 'Audit log']]
    : [['scan', 'Scan']];
  const right = `<button class="ghost sm" id="lock">Lock</button>`;
  const stale = !db.S.lastBackupAt || Date.now() - new Date(db.S.lastBackupAt).getTime() > 7 * 86400e3;
  shell(`
    ${role() === 'admin' && stale && Object.keys(db.S.customers).length ? `<div class="notice err no-print" style="margin-bottom:12px">All customer data is only on this phone. <a href="#/admin/backup">Make a backup</a> (last: ${db.S.lastBackupAt ? fmtDate(db.S.lastBackupAt) : 'never'}).</div>` : ''}
    <nav class="tabs no-print">${tabs.map(([k, l]) => `<a href="#/admin/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`).join('')}</nav>
    <div id="panel"></div>`, { title: s.cafe_name, wide: true, right });
  $('#lock').onclick = () => { sessionStorage.removeItem('lc_role'); go('#/admin'); };
  const views = { scan: scanTab, customers: id ? customerDetail : customersTab, offers: offersTab, rules: rulesTab, badges: badgesTab, tables: tablesTab, backup: backupTab, audit: auditTab };
  await (views[tab] || scanTab)($('#panel'), id);
}

function setupPage() {
  shell(`
    <form class="card" id="setup">
      <h1>Set up your cafe</h1>
      <p class="small muted">This phone becomes the cafe's loyalty database. Customer data is stored only on this device, so use the phone that stays at the counter.</p>
      <div class="field"><label>Cafe name</label><input name="cafe_name" required maxlength="60"></div>
      <div class="field"><label>Country code for mobile numbers</label><input name="country_code" inputmode="numeric" value="91" maxlength="4"><div class="small muted">e.g. 91 India, 44 UK, 1 USA</div></div>
      <div class="field"><label>Admin PIN (4–8 digits)</label><input name="pin" type="password" inputmode="numeric" autocomplete="new-password" required></div>
      <div class="field"><label>Repeat PIN</label><input name="pin2" type="password" inputmode="numeric" autocomplete="new-password" required></div>
      <div class="field"><button type="submit" class="big">Create cafe database</button></div>
    </form>
    <details class="card"><summary><b>Moving from another phone?</b></summary>
      <p class="small muted" style="margin-top:.75rem">Restore a backup file made on the old phone.</p>
      <input type="file" id="restore" accept="application/json,.json">
    </details>`, { title: 'Cafe setup' });
  onSubmit($('#setup'), async (d) => {
    if (d.pin !== d.pin2) throw new Error('PINs do not match');
    if (!/^\d{4,8}$/.test(d.pin)) throw new Error('PIN must be 4 to 8 digits');
    await db.createDatabase(d);
    await db.persistStorage();
    sessionStorage.setItem('lc_role', 'admin');
    toast('Cafe created');
    go('#/admin/rules');
  });
  $('#restore').onchange = async (e) => {
    try { await db.importJson(await e.target.files[0].text()); await db.persistStorage(); toast('Backup restored. Sign in with your PIN.'); go('#/admin'); }
    catch (err) { toast(err.message, true); }
  };
}

function unlockPage() {
  shell(`
    <form class="card" id="unlock">
      <h1>Staff sign in</h1>
      <div class="field"><label for="pin">PIN</label><input id="pin" name="pin" type="password" inputmode="numeric" autocomplete="current-password" required autofocus></div>
      <div class="field"><button type="submit" class="big">Unlock</button></div>
    </form>
    <p class="center small"><a href="#/">← Customer card</a></p>`, { title: db.S.settings.cafe_name });
  let fails = 0;
  onSubmit($('#unlock'), async (d) => {
    if (fails >= 5) throw new Error('Too many wrong PINs. Reload the page to try again.');
    const r = await db.checkPin(String(d.pin));
    if (!r) { fails++; db.audit('unknown', 'pin.failed'); await db.save(); throw new Error('Wrong PIN'); }
    sessionStorage.setItem('lc_role', r);
    db.audit(r, 'unlock'); await db.save();
    if (r === 'admin') await db.expirePoints();
    go('#/admin/scan');
  });
}

// ---------- Scan tab ----------
async function scanTab(panel) {
  const s = db.S.settings;
  panel.innerHTML = `
    <div class="grid2">
      <section class="card">
        <h2>Scan a customer card</h2>
        <div class="scanner hidden" id="scanner"><video id="video" playsinline muted></video><div class="frame"></div></div>
        <button class="big" id="start-cam" style="margin-top:8px">📷 Start camera</button>
        <div id="scan-result" style="margin-top:12px"></div>
      </section>
      <section class="card">
        <h2>Find a customer</h2>
        <form id="find" class="row"><input name="mobile" type="tel" placeholder="Mobile number" style="flex:1" required><button type="submit">Find</button></form>
        <div id="find-result" style="margin-top:12px"></div>
        <h2 style="margin-top:18px">Wi-Fi</h2>
        ${s.wifi_ssid ? `<button class="ghost sm" id="wifi-toggle">Show Wi-Fi password</button><div id="wifi" class="hidden">Network: <b>${esc(s.wifi_ssid)}</b><br>Password: <b class="code">${esc(s.wifi_password)}</b></div>` : '<p class="small muted">Not set yet (Rules & cafe).</p>'}
      </section>
    </div>`;
  $('#wifi-toggle')?.addEventListener('click', (e) => { $('#wifi').classList.toggle('hidden'); e.target.remove(); });

  let stream = null, raf = null;
  const stopCam = () => { if (raf) cancelAnimationFrame(raf); raf = null; stream?.getTracks().forEach((t) => t.stop()); stream = null; $('#scanner')?.classList.add('hidden'); $('#start-cam')?.classList.remove('hidden'); };
  onLeave(stopCam);

  const result = (html) => { $('#scan-result').innerHTML = html; };
  const scanAgainBtn = '<button class="big secondary" id="again">Scan next customer</button>';
  const wireAgain = () => { $('#again')?.addEventListener('click', () => { result(''); startCam(); }); };

  const showUpdateQr = (mobile, cardId, banner) => {
    const url = BASE_URL + '#/u/' + b64u(JSON.stringify(db.cardUpdate(mobile, cardId)));
    const c = db.summary(mobile);
    result(`
      ${banner}
      <div class="center">
        <p style="margin:10px 0 0"><b>${esc(c.name)}</b>: ${c.points} points · ${c.visits} visits</p>
        <p class="small muted">Ask the customer to scan this with their phone camera to update their card.</p>
        <div class="qr-box" style="width:min(260px,75vw)">${qrSvg(url)}</div>
      </div>
      <div class="stack" style="margin-top:12px">
        ${c.progress.reward_available ? `<button class="big secondary" id="do-redeem">🎁 Redeem ${esc(c.progress.reward_name)}</button>` : ''}
        ${scanAgainBtn}
      </div>`);
    wireAgain();
    $('#do-redeem')?.addEventListener('click', (e) => act(e.target, () => db.redeem(mobile, by()), mobile, cardId, c));
  };

  const act = async (btn, fn, mobile, cardId, c) => {
    if (btn.id === 'do-redeem' && !confirm(`Redeem ${c.progress.reward_name} for ${c.name}? This uses ${c.progress.reward_threshold} points.`)) return;
    btn.disabled = true;
    try {
      const r = await fn();
      const badges = r.new_badges?.length ? `<div class="small">New badge: ${r.new_badges.map((b) => `${isUrl(b.icon) ? '🏅' : esc(b.icon)} ${esc(b.name)}`).join(', ')}</div>` : '';
      showUpdateQr(mobile, cardId, `<div class="result notice ok">✓ ${esc(r.message)}${badges}</div>`);
    } catch (err) {
      $('#scan-result').insertAdjacentHTML('afterbegin', `<div class="result notice err" style="margin-bottom:10px">✕ ${esc(err.message)}</div>`);
      btn.remove();
    }
  };

  const handleCode = async (text) => {
    stopCam();
    let card;
    try { card = JSON.parse(unb64u(text.slice(4))); if (!card.i || !card.m) throw new Error(); }
    catch { result(`<div class="result notice err">✕ Not a valid loyalty card</div>${scanAgainBtn}`); return wireAgain(); }
    let info;
    try { info = db.findOrPrepare(card); }
    catch (err) { result(`<div class="result notice err">✕ ${esc(err.message)}</div>${scanAgainBtn}`); return wireAgain(); }
    const { mobile, existing } = info;
    if (!existing) {
      result(`
        <div class="notice"><b>New customer</b><div>${esc(card.n)} · ${esc(mobile)}</div>${card.t ? `<div class="small muted">Signed up at ${esc(card.t)}</div>` : ''}${card.o ? '<div class="small muted">Wants offers on WhatsApp/SMS</div>' : ''}</div>
        <div class="stack" style="margin-top:12px">
          <button class="big" id="add-visit">✓ Add customer &amp; record visit</button>
          ${scanAgainBtn}
        </div>`);
      wireAgain();
      $('#add-visit').onclick = (e) => act(e.target, async () => { await db.addCustomer(card, by()); return db.recordVisit(mobile, by()); }, mobile, card.i);
      return;
    }
    await db.linkCardId(mobile, card.i);
    const p = existing.progress;
    result(`
      <div class="notice">
        <div class="row spread"><h3 style="margin:0">${esc(existing.name)}</h3><span class="small muted">${esc(mobile)}</span></div>
        ${existing.name.toLowerCase() !== String(card.n).toLowerCase() ? `<div class="small muted">Card name: ${esc(card.n)}</div>` : ''}
        <div class="small muted">${existing.points} points · ${existing.visits} visits${p.reward_threshold ? ` · ${p.reward_available ? `<b style="color:var(--ok)">${esc(p.reward_name)} available</b>` : `${p.visits_to_reward} visits to ${esc(p.reward_name)}`}` : ''}</div>
        ${existing.status !== 'active' ? '<div class="small" style="color:var(--err)"><b>Blocked customer</b></div>' : ''}
      </div>
      <div class="stack" style="margin-top:12px">
        <button class="big" id="do-visit">✓ Record visit</button>
        ${p.reward_available ? `<button class="big secondary" id="do-redeem">🎁 Redeem ${esc(p.reward_name)}</button>` : ''}
        <button class="secondary" id="just-update">Only update customer's card</button>
        ${scanAgainBtn}
      </div>`);
    wireAgain();
    $('#do-visit').onclick = (e) => act(e.target, () => db.recordVisit(mobile, by()), mobile, card.i);
    $('#do-redeem')?.addEventListener('click', (e) => act(e.target, () => db.redeem(mobile, by()), mobile, card.i, existing));
    $('#just-update').onclick = () => showUpdateQr(mobile, card.i, '');
  };
  window.__handleCode = handleCode; // used for testing without a camera

  const startCam = async () => {
    result('');
    if (!navigator.mediaDevices?.getUserMedia) return toast('Camera not available. Open this site over https in Chrome or Safari.', true);
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
    catch { return toast('Could not open the camera. Allow camera access for this site and try again.', true); }
    const video = $('#video');
    video.srcObject = stream;
    await video.play();
    $('#scanner').classList.remove('hidden');
    $('#start-cam').classList.add('hidden');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let last = 0;
    const loop = (t) => {
      if (!stream) return;
      raf = requestAnimationFrame(loop);
      if (t - last < 150 || video.readyState < 2 || !window.jsQR) return;
      last = t;
      const w = 480, h = Math.round((video.videoHeight / video.videoWidth) * w) || 480;
      canvas.width = w; canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);
      const found = window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
      if (found?.data?.startsWith('LC2:')) { navigator.vibrate?.(80); handleCode(found.data); }
    };
    raf = requestAnimationFrame(loop);
  };
  $('#start-cam').onclick = startCam;

  onSubmit($('#find'), async (d) => {
    const mobile = db.normalizeMobile(d.mobile);
    const box = $('#find-result');
    if (!db.S.customers[mobile]) { box.innerHTML = '<p class="small muted">No customer with that number.</p>'; return; }
    const c = db.summary(mobile);
    box.innerHTML = `<div class="notice"><b>${esc(c.name)}</b> <span class="small muted">${esc(mobile)}</span><div class="small muted">${c.points} points · ${c.visits} visits</div>
      ${role() === 'admin' ? `<a class="small" href="#/admin/customers/${encodeURIComponent(mobile)}">Open customer →</a>` : ''}</div>
      <p class="small muted" style="margin-top:8px">Lost their card? They can sign up again from any table QR with the same mobile number. Their points stay with the number.</p>`;
  });
}

// ---------- Customers ----------
function customersTab(panel) {
  panel.innerHTML = `
    <form id="search" class="row" style="margin-bottom:12px"><input name="q" placeholder="Search name or mobile" style="flex:1;max-width:360px"><button type="submit">Search</button></form>
    <div class="card table-wrap"><table><thead><tr><th>Name</th><th>Mobile</th><th>Points</th><th>Visits</th><th>Offers</th><th>Joined</th><th>Last visit</th></tr></thead><tbody id="rows"></tbody></table></div>`;
  const render = (q = '') => {
    q = q.toLowerCase();
    const list = Object.values(db.S.customers).filter((c) => !q || c.name.toLowerCase().includes(q) || c.mobile.includes(q))
      .sort((a, b) => (b.lastVisitAt || b.addedAt).localeCompare(a.lastVisitAt || a.addedAt)).slice(0, 300);
    $('#rows').innerHTML = list.map((c) => `
      <tr class="click" data-m="${esc(c.mobile)}"><td><b>${esc(c.name)}</b>${c.status !== 'active' ? ' <span class="pill err">blocked</span>' : ''}</td><td>${esc(c.mobile)}</td>
      <td>${db.balance(c.mobile)}</td><td>${db.visitCount(c.mobile)}</td><td>${c.marketing ? '<span class="pill ok">yes</span>' : '<span class="pill">no</span>'}</td>
      <td>${fmtDate(c.createdAt)}</td><td>${fmtDate(c.lastVisitAt)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No customers yet. They are added when you scan their card for the first time.</td></tr>';
    $$('#rows tr[data-m]').forEach((tr) => { tr.onclick = () => go('#/admin/customers/' + encodeURIComponent(tr.dataset.m)); });
  };
  onSubmit($('#search'), async (d) => render(d.q));
  render();
}

function customerDetail(panel, mobile) {
  const c = db.S.customers[mobile];
  if (!c) { panel.innerHTML = '<p class="muted">Customer not found. <a href="#/admin/customers">Back</a></p>'; return; }
  const s = db.summary(mobile);
  const visits = db.S.visits.filter((v) => v.mobile === mobile).reverse();
  const ledger = db.S.ledger.filter((l) => l.mobile === mobile).reverse();
  panel.innerHTML = `
    <p><a href="#/admin/customers">← All customers</a></p>
    <div class="grid2">
      <form class="card" id="edit">
        <h2>${esc(c.name)}</h2>
        <p class="small muted">${esc(mobile)} · Joined ${fmtDate(c.createdAt)}${c.table ? ` at ${esc(c.table)}` : ''} · <b>${s.points} points</b> · ${s.visits} visits</p>
        <div class="row" style="margin-bottom:10px"><a class="btn secondary sm" href="https://wa.me/${waDigits(mobile)}" target="_blank" rel="noopener">WhatsApp</a><a class="btn secondary sm" href="tel:${esc(mobile)}">Call</a></div>
        <div class="field"><label>Name</label><input name="name" value="${esc(c.name)}" maxlength="60"></div>
        <div class="field"><label class="check"><input type="checkbox" name="marketing" ${c.marketing ? 'checked' : ''}> Agreed to receive offers on WhatsApp/SMS</label></div>
        <div class="field"><label class="check"><input type="checkbox" name="blocked" ${c.status !== 'active' ? 'checked' : ''}> Blocked</label></div>
        <div class="field"><button type="submit">Save</button></div>
      </form>
      <form class="card" id="adjust">
        <h2>Correct points</h2>
        <p class="small muted">Adds a correction to the history. Nothing is deleted.</p>
        <div class="field"><label>Points (+ to add, − to remove)</label><input name="delta" type="number" step="1" required></div>
        <div class="field"><label>Reason</label><input name="reason" required maxlength="200" placeholder="e.g. Missed scan on 3 May"></div>
        <div class="field"><button type="submit">Apply correction</button></div>
      </form>
    </div>
    <section class="card"><h2>Badges</h2>${s.badges.map((b) => `<span class="pill">${isUrl(b.icon) ? '🏅' : esc(b.icon)} ${esc(b.name)} · ${fmtDate(b.unlocked_at)}</span> `).join('') || '<p class="muted small">None yet</p>'}</section>
    <section class="card table-wrap"><h2>Visits</h2><table><thead><tr><th>When</th><th>Points</th><th>By</th><th></th></tr></thead><tbody>
      ${visits.map((v) => `<tr><td>${fmtDateTime(v.at)}</td><td>${v.points}</td><td>${esc(v.by)}</td><td>${v.voided ? `<span class="pill err">voided</span> <span class="small muted">${esc(v.voidReason)}</span>` : `<button class="ghost sm" data-void="${v.id}">Void</button>`}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No visits</td></tr>'}
    </tbody></table></section>
    <section class="card table-wrap"><h2>Points history</h2><table><thead><tr><th>When</th><th>Change</th><th>Type</th><th>Reason</th><th>By</th></tr></thead><tbody>
      ${ledger.map((l) => `<tr><td>${fmtDateTime(l.at)}</td><td class="${l.delta >= 0 ? 'plus' : 'minus'}">${l.delta > 0 ? '+' : ''}${l.delta}</td><td>${esc(l.kind)}</td><td>${esc(l.reason)}</td><td>${esc(l.by)}</td></tr>`).join('')}
    </tbody></table></section>`;
  const reload = () => customerDetail(panel, mobile);
  onSubmit($('#edit'), async (d) => {
    c.name = String(d.name).trim().slice(0, 60) || c.name;
    c.marketing = !!d.marketing;
    c.status = d.blocked ? 'blocked' : 'active';
    db.audit(by(), 'customer.update', { mobile, name: c.name, marketing: c.marketing, status: c.status });
    await db.save(); toast('Saved'); reload();
  });
  onSubmit($('#adjust'), async (d) => { await db.adjust(mobile, d.delta, d.reason, by()); toast('Correction applied'); reload(); });
  $$('[data-void]').forEach((b) => {
    b.onclick = async () => {
      const reason = prompt('Why is this visit being voided? (required)');
      if (!reason) return;
      try { await db.voidVisit(b.dataset.void, reason, by()); toast('Visit voided and points removed'); reload(); }
      catch (err) { toast(err.message, true); }
    };
  });
}

// ---------- Reminders & offers (free: sends from your own WhatsApp/SMS) ----------
function offersTab(panel) {
  const s = db.S.settings;
  const optedIn = Object.values(db.S.customers).filter((c) => c.marketing && c.status === 'active');
  const remindAfter = Date.now() - s.reminder_min_days * 86400e3;
  const close = optedIn.map((c) => db.summary(c.mobile)).filter((c) =>
    c.progress.visits_to_reward > 0 && c.progress.visits_to_reward <= s.reminder_visits_away &&
    (!c.lastContactAt || new Date(c.lastContactAt).getTime() < remindAfter) &&
    c.lastVisitAt && Date.now() - new Date(c.lastVisitAt).getTime() > 86400e3);

  const vars = (c) => ({ customer_name: c.name.split(' ')[0], full_name: c.name, points: db.balance(c.mobile), visits_away: db.summary(c.mobile).progress.visits_to_reward, reward_name: s.reward_name, cafe_name: s.cafe_name });
  const row = (c, msg, tag) => `
    <li><span><b>${esc(c.name)}</b> <span class="small muted">${esc(c.mobile)}</span><br><span class="small muted">${esc(msg)}</span></span>
      <span class="row" style="flex:none"><a class="btn sm" data-sent="${esc(c.mobile)}" data-tag="${tag}" href="https://wa.me/${waDigits(c.mobile)}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">WhatsApp</a>
      <a class="btn secondary sm" data-sent="${esc(c.mobile)}" data-tag="${tag}" href="sms:${esc(c.mobile)}?body=${encodeURIComponent(msg)}">SMS</a></span></li>`;

  panel.innerHTML = `
    <div class="notice small" style="margin-bottom:14px">Messages open in your own WhatsApp or SMS app, ready to send with one tap. It's free and only goes to customers who agreed to receive offers.</div>
    <section class="card"><h2>Close to a reward</h2>
      <p class="small muted">Customers ${s.reminder_visits_away} or fewer visits away who haven't been reminded in ${s.reminder_min_days} days. Change these in Rules &amp; cafe.</p>
      <ul class="list">${close.map((c) => row(c, db.fill(s.reminder_template, vars(c)), 'reminder')).join('') || '<li class="muted small">Nobody right now.</li>'}</ul>
    </section>
    <form class="card" id="offer">
      <h2>Send an offer</h2>
      <div class="field"><label>Message</label><textarea name="message" required maxlength="500" placeholder="Hello {{customer_name}}! Enjoy 20% OFF on your next visit.">${esc(sessionStorage.getItem('lc_offer') || '')}</textarea>
        <div class="small muted">You can use {{customer_name}}, {{points}}, {{reward_name}}, {{cafe_name}}</div></div>
      <div class="field"><label>Send to</label><select name="audience">
        <option value="all">Everyone who agreed to offers</option>
        <option value="min_visits">Customers with at least N visits</option>
        <option value="inactive_days">Customers who haven't visited in N days</option></select></div>
      <div class="field"><label>N</label><input name="n" type="number" min="0" value="5"></div>
      <div class="field"><button type="submit">Show recipients</button></div>
      <ul class="list" id="recipients"></ul>
    </form>`;

  const markSent = (root) => $$('[data-sent]', root).forEach((a) => a.addEventListener('click', () => {
    const c = db.S.customers[a.dataset.sent];
    c.lastContactAt = new Date().toISOString();
    db.audit(by(), a.dataset.tag === 'reminder' ? 'reminder.sent' : 'offer.sent', { mobile: c.mobile });
    db.save();
    a.closest('li').style.opacity = '.45';
  }));
  markSent(panel);
  onSubmit($('#offer'), async (d) => {
    sessionStorage.setItem('lc_offer', d.message);
    const n = Number(d.n) || 0;
    const list = optedIn.filter((c) => d.audience === 'min_visits' ? db.visitCount(c.mobile) >= n
      : d.audience === 'inactive_days' ? (!c.lastVisitAt || Date.now() - new Date(c.lastVisitAt).getTime() > n * 86400e3) : true);
    $('#recipients').innerHTML = `<li class="small muted">${list.length} customer(s). Tap each one to open the message.</li>` + list.map((c) => row(c, db.fill(d.message, vars(c)), 'offer')).join('');
    markSent($('#recipients'));
  });
}

// ---------- Rules & cafe ----------
function rulesTab(panel) {
  const s = db.S.settings;
  const f = (key, label, type = 'number', hint = '') => `<div class="field"><label for="s-${key}">${label}</label>${type === 'textarea'
    ? `<textarea id="s-${key}" name="${key}">${esc(s[key])}</textarea>`
    : `<input id="s-${key}" name="${key}" type="${type}" value="${esc(s[key])}" ${type === 'number' ? 'min="0" step="1"' : ''}>`}${hint ? `<div class="small muted">${hint}</div>` : ''}</div>`;
  panel.innerHTML = `
    <form id="rules">
      <div class="grid2">
        <section class="card"><h2>Points &amp; rewards</h2>
          ${f('points_per_visit', 'Points per visit')}
          ${f('reward_threshold', 'Points needed for a reward')}
          ${f('reward_name', 'Reward name', 'text', 'e.g. Free coffee')}
          ${f('visit_cooldown_hours', 'Hours between counted visits', 'number', 'Stops the same customer earning twice in a short time.')}
          ${f('points_expiry_days', 'Points expire after this many days without a visit', 'number', '0 = never expire')}
        </section>
        <section class="card"><h2>Reminders</h2>
          ${f('reminder_visits_away', 'Remind customers this many visits away')}
          ${f('reminder_min_days', 'At most one reminder every N days')}
          ${f('reminder_template', 'Reminder message', 'textarea', 'You can use {{customer_name}}, {{visits_away}}, {{reward_name}}, {{points}}, {{cafe_name}}')}
        </section>
        <section class="card"><h2>Cafe information</h2>
          ${f('cafe_name', 'Cafe name', 'text')}
          ${f('country_code', 'Country code for mobile numbers', 'text', 'e.g. 91 India')}
          ${f('instagram_url', 'Instagram link', 'url')}
          ${f('wifi_ssid', 'Wi-Fi network name (staff only)', 'text')}
          ${f('wifi_password', 'Wi-Fi password (staff only)', 'text')}
        </section>
      </div>
      <div class="row" style="margin-top:14px"><button type="submit">Save changes</button></div>
    </form>
    <div class="grid2" style="margin-top:14px">
      <form class="card" id="staff-pin">
        <h2>Staff PIN</h2>
        <p class="small muted">${db.S.auth.staff ? 'A staff PIN is set.' : 'No staff PIN yet.'} Staff can only scan cards and redeem rewards.</p>
        <div class="field"><label>New staff PIN (4–8 digits)</label><input name="pin" type="password" inputmode="numeric" autocomplete="new-password"></div>
        <div class="row"><button type="submit">Set staff PIN</button>${db.S.auth.staff ? '<button type="button" class="secondary" id="clear-staff">Remove staff PIN</button>' : ''}</div>
      </form>
      <form class="card" id="admin-pin">
        <h2>Change admin PIN</h2>
        <div class="field"><label>New admin PIN</label><input name="pin" type="password" inputmode="numeric" autocomplete="new-password" required></div>
        <div class="field"><label>Repeat</label><input name="pin2" type="password" inputmode="numeric" autocomplete="new-password" required></div>
        <div class="field"><button type="submit">Change admin PIN</button></div>
      </form>
    </div>`;
  onSubmit($('#rules'), async (d) => {
    for (const [k, v] of Object.entries(d)) {
      if (!(k in db.DEFAULT_SETTINGS)) continue;
      if (typeof db.DEFAULT_SETTINGS[k] === 'number') {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) throw new Error(`${k.replace(/_/g, ' ')} must be 0 or more`);
        s[k] = n;
      } else s[k] = String(v).slice(0, 500);
    }
    s.country_code = String(s.country_code).replace(/\D/g, '');
    db.audit(by(), 'settings.update', { ...d, wifi_password: d.wifi_password ? '(set)' : '' });
    await db.save();
    toast('Saved. Reprint table QR codes if you changed the cafe name or reward.');
  });
  onSubmit($('#staff-pin'), async (d) => { db.S.auth.staff = await db.makePin(String(d.pin)); db.audit(by(), 'pin.staff_set'); await db.save(); toast('Staff PIN set'); rulesTab(panel); });
  $('#clear-staff')?.addEventListener('click', async () => { db.S.auth.staff = null; db.audit(by(), 'pin.staff_removed'); await db.save(); toast('Staff PIN removed'); rulesTab(panel); });
  onSubmit($('#admin-pin'), async (d) => {
    if (d.pin !== d.pin2) throw new Error('PINs do not match');
    db.S.auth.admin = await db.makePin(String(d.pin)); db.audit(by(), 'pin.admin_changed'); await db.save(); toast('Admin PIN changed');
    $('#admin-pin').reset();
  });
}

// ---------- Badges ----------
function badgesTab(panel) {
  const count = (id) => Object.values(db.S.unlocked).filter((u) => u[id]).length;
  const form = (b = {}) => `
    <form class="card badge-form" data-id="${b.id || ''}">
      <div class="grid2">
        <div class="field"><label>Name</label><input name="name" value="${esc(b.name)}" required maxlength="40"></div>
        <div class="field"><label>Icon (emoji or image URL)</label><input name="icon" value="${esc(b.icon || '☕')}"></div>
        <div class="field"><label>Unlocks at</label><div class="row"><input name="value" type="number" min="1" value="${esc(b.value || 5)}" style="width:100px"><select name="type" style="flex:1"><option value="visits" ${b.type !== 'points' ? 'selected' : ''}>visits</option><option value="points" ${b.type === 'points' ? 'selected' : ''}>points earned</option></select></div></div>
        <div class="field"><label>Description</label><input name="description" value="${esc(b.description)}" maxlength="120"></div>
      </div>
      <div class="row spread" style="margin-top:10px">
        <label class="check"><input type="checkbox" name="active" ${b.id && !b.active ? '' : 'checked'}> Active</label>
        <span class="row">${b.id ? `<span class="small muted">${count(b.id)} customers unlocked</span>` : ''}<button type="submit">${b.id ? 'Save' : 'Add badge'}</button></span>
      </div>
    </form>`;
  panel.innerHTML = `<h2>Add a badge</h2>${form()}<h2 style="margin-top:20px">Badges</h2>${db.S.badges.map(form).join('')}`;
  $$('.badge-form').forEach((el) => onSubmit(el, async (d) => {
    const value = Math.trunc(Number(d.value));
    if (!String(d.name).trim() || value < 1) throw new Error('Name and an unlock value of at least 1 are required');
    const data = { name: d.name.trim(), icon: d.icon.trim() || '☕', type: d.type === 'points' ? 'points' : 'visits', value, description: d.description.trim(), active: !!d.active };
    if (el.dataset.id) Object.assign(db.S.badges.find((b) => b.id === el.dataset.id), data);
    else db.S.badges.push({ id: db.uid(4), ...data });
    db.audit(by(), 'badge.save', data);
    await db.save(); toast('Saved'); badgesTab(panel);
  }));
}

// ---------- Table QR codes (one fixed QR per table) ----------
function tablesTab(panel) {
  const s = db.S.settings;
  const url = (label) => BASE_URL + '#/t/' + encodeURIComponent(label) + '/' + b64u(JSON.stringify(db.publicSettings()));
  panel.innerHTML = `
    <div class="row spread no-print" style="margin-bottom:12px">
      <form id="add" class="row"><input name="label" placeholder="e.g. Table 1" required maxlength="30"><button type="submit">Add table</button></form>
      <button class="secondary" onclick="window.print()">🖨 Print QR codes</button>
    </div>
    <p class="small muted no-print">Each table has one fixed QR code. Print once and stick it on the table. Scanning opens the sign-up page and remembers the table. Reprint only if you change the cafe name or reward.</p>
    <div class="qr-grid">${db.S.tables.map((t) => `
      <div class="card qr-tile">
        <div class="print-only"><b>${esc(s.cafe_name)}</b><br>Scan to get your loyalty card</div>
        <h3>${esc(t.label)}</h3>
        <div class="qr-box">${qrSvg(url(t.label))}</div>
        <div class="small muted no-print">${Object.values(db.S.customers).filter((c) => c.table === t.label).length} sign-ups</div>
        <div class="no-print"><button class="ghost sm" data-del="${t.id}">Remove</button></div>
      </div>`).join('') || '<p class="muted">No tables yet.</p>'}</div>`;
  onSubmit($('#add'), async (d) => {
    const label = String(d.label).trim();
    if (db.S.tables.some((t) => t.label.toLowerCase() === label.toLowerCase())) throw new Error('That table already exists');
    db.S.tables.push({ id: db.uid(4), label });
    db.audit(by(), 'table.add', { label });
    await db.save(); tablesTab(panel);
  });
  $$('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Remove this table from the list? Already printed codes still work for sign-up.')) return;
      db.S.tables = db.S.tables.filter((t) => t.id !== b.dataset.del);
      await db.save(); tablesTab(panel);
    };
  });
}

// ---------- Backup ----------
async function backupTab(panel) {
  const persisted = await navigator.storage?.persisted?.();
  const est = await navigator.storage?.estimate?.().catch(() => null);
  panel.innerHTML = `
    <div class="grid2">
      <section class="card">
        <h2>Back up your data</h2>
        <p class="small muted">All customers, visits and points are stored <b>only on this phone</b>. If the phone is lost, reset or the browser data is cleared, they are gone. Save a backup at least once a week to Google Drive, email or WhatsApp to yourself.</p>
        <p class="small">Last backup: <b>${db.S.lastBackupAt ? fmtDateTime(db.S.lastBackupAt) : 'never'}</b></p>
        <button class="big" id="export">Save backup file</button>
      </section>
      <section class="card">
        <h2>Restore</h2>
        <p class="small muted">Replace everything on this phone with a backup file. Use this on a new phone, or to undo a mistake.</p>
        <input type="file" id="import" accept="application/json,.json">
      </section>
      <section class="card">
        <h2>This device</h2>
        <ul class="list small">
          <li><span>Customers</span><b>${Object.keys(db.S.customers).length}</b></li>
          <li><span>Visits recorded</span><b>${db.S.visits.length}</b></li>
          <li><span>Protected from automatic clearing</span><b>${persisted ? 'Yes' : 'No'}</b></li>
          ${est ? `<li><span>Storage used</span><b>${(est.usage / 1e6).toFixed(1)} MB</b></li>` : ''}
        </ul>
        ${persisted ? '' : '<p class="small muted">Add this site to your home screen (Chrome: ⋮ → Add to Home screen / Safari: Share → Add to Home Screen) and open it from there to protect the data from being cleared.</p><button class="secondary" id="persist">Ask browser to keep data</button>'}
      </section>
    </div>`;
  $('#export').onclick = async () => {
    const json = db.exportJson();
    const name = `cafe-loyalty-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); toast('Backup ready'); return backupTab(panel); } catch {}
    }
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: name });
    a.click(); URL.revokeObjectURL(a.href);
    toast('Backup file saved to Downloads');
    backupTab(panel);
  };
  $('#import').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f || !confirm('Replace ALL data on this phone with this backup? This cannot be undone.')) return;
    try { await db.importJson(await f.text()); toast('Backup restored'); go('#/admin/scan'); } catch (err) { toast(err.message, true); }
  };
  $('#persist')?.addEventListener('click', async () => { toast((await db.persistStorage()) ? 'Done: data is protected' : 'Browser said no. Add to home screen first.'); backupTab(panel); });
}

function auditTab(panel) {
  panel.innerHTML = `<section class="card table-wrap"><h2>Audit log</h2><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead><tbody>
    ${db.S.audit.slice(0, 300).map((a) => `<tr><td>${fmtDateTime(a.at)}</td><td>${esc(a.by)}</td><td><code>${esc(a.action)}</code></td><td class="small muted" style="word-break:break-word">${esc(a.details ? JSON.stringify(a.details) : '')}</td></tr>`).join('')}
  </tbody></table></section>`;
}

// ---------- start ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
route();
