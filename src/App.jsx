import { useEffect, useState } from 'preact/hooks';
import { db, ensureSeed, getSettings, setCurrentUser, audit } from './db.js';
import { can, createUser, verifyLogin } from './auth.js';
import { useLive, useRoute, go, Icon, Btn, Field, Input, Toasts, toast } from './ui.jsx';
import { expireQuotations } from './repo.js';
import { Dashboard } from './screens/Dashboard.jsx';
import { QuotationList, QuotationEditor } from './screens/Quotations.jsx';
import { BillList, BillEditor } from './screens/Bills.jsx';
import { POS } from './screens/POS.jsx';
import { Events } from './screens/Events.jsx';
import { ClientList, ClientDetail } from './screens/Clients.jsx';
import { MenuScreen } from './screens/Menu.jsx';
import { Reports } from './screens/Reports.jsx';
import { SettingsScreen } from './screens/Settings.jsx';

const NAV = [
  { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { path: '/pos', label: 'POS', icon: 'pos', perm: 'pos.use' },
  { path: '/quotes', label: 'Quotations', icon: 'quote' },
  { path: '/bills', label: 'Bills', icon: 'bill' },
  { path: '/events', label: 'Events', icon: 'event' },
  { path: '/clients', label: 'Clients', icon: 'clients' },
  { path: '/menu', label: 'Menu', icon: 'menu' },
  { path: '/reports', label: 'Reports', icon: 'reports', perm: 'reports.view' },
  { path: '/settings', label: 'Settings', icon: 'settings' }
];
const PHONE_NAV = ['/dashboard', '/quotes', '/bills', '/pos'];

export function App() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  useEffect(() => {
    (async () => {
      await ensureSeed();
      await expireQuotations();
      const sid = sessionStorage.getItem('uid');
      if (sid) { const u = await db.users.get(sid); if (u?.active) { setCurrentUser(u); setUser(u); } }
      setReady(true);
    })();
  }, []);
  const userCount = useLive(() => db.users.count(), [], null);
  const settings = useLive(getSettings, [], null);

  if (!ready || userCount === null || !settings) return <div class="login"><div class="panel"><div class="l1">Loading…</div></div></div>;
  const login = (u) => { setCurrentUser(u); setUser(u); sessionStorage.setItem('uid', u.id); };
  if (userCount === 0) return <><Setup settings={settings} onDone={login} /><Toasts /></>;
  if (!user) return <><Login settings={settings} onLogin={login} /><Toasts /></>;
  const logout = async () => { await audit('logout', 'user', user.id, user.name); sessionStorage.removeItem('uid'); setCurrentUser(null); setUser(null); };
  return <><Shell user={user} settings={settings} onLogout={logout} /><Toasts /></>;
}

function Shell({ user, settings, onLogout }) {
  const route = useRoute();
  const [more, setMore] = useState(false);
  const parts = route.split('/').filter(Boolean);
  const base = '/' + (parts[0] || 'dashboard');
  const nav = NAV.filter((n) => !n.perm || can(user, n.perm));
  const ctx = { user, settings };
  let screen;
  switch (parts[0]) {
    case 'pos': screen = can(user, 'pos.use') ? <POS {...ctx} /> : null; break;
    case 'quotes': screen = parts[1] ? <QuotationEditor {...ctx} id={parts[1]} /> : <QuotationList {...ctx} />; break;
    case 'bills': screen = parts[1] ? <BillEditor {...ctx} id={parts[1]} fromQuote={parts[2] === 'from' ? parts[3] : null} /> : <BillList {...ctx} />; break;
    case 'events': screen = <Events {...ctx} />; break;
    case 'clients': screen = parts[1] ? <ClientDetail {...ctx} id={parts[1]} /> : <ClientList {...ctx} />; break;
    case 'menu': screen = <MenuScreen {...ctx} />; break;
    case 'reports': screen = can(user, 'reports.view') ? <Reports {...ctx} /> : <p>Not allowed.</p>; break;
    case 'settings': screen = <SettingsScreen {...ctx} />; break;
    default: screen = <Dashboard {...ctx} />;
  }
  return (
    <div class="shell">
      <aside class="sidenav">
        <div class="brand"><div class="l1">{settings.brandLine1 || 'Catering'}</div><div class="l2">{settings.brandLine2 || 'POS'}</div></div>
        {nav.map((n) => <a class={'navlink' + (base === n.path ? ' active' : '')} href={'#' + n.path}><Icon name={n.icon} />{n.label}</a>)}
        <div class="nav-foot">Signed in as <b>{user.name}</b> ({user.role})<br /><a href="#" style="color:#f3d58c" onClick={(e) => { e.preventDefault(); onLogout(); }}>Lock / switch user</a></div>
      </aside>
      <main class="main">
        {screen}
      </main>
      <nav class="bottomnav">
        {nav.filter((n) => PHONE_NAV.includes(n.path)).map((n) => <a class={base === n.path ? 'active' : ''} href={'#' + n.path}><Icon name={n.icon} />{n.label}</a>)}
        <button class={!PHONE_NAV.includes(base) ? 'active' : ''} onClick={() => setMore(true)}><Icon name="more" />More</button>
      </nav>
      {more && (
        <div class="backdrop" onClick={() => setMore(false)}>
          <div class="modal narrow" onClick={(e) => e.stopPropagation()}>
            <div class="modal-h"><h2>Menu</h2><Btn kind="ghost" class="icon" icon="close" onClick={() => setMore(false)} /></div>
            <div class="modal-b">
              <div class="grid g2">
                {nav.map((n) => <a class="btn" style="justify-content:flex-start" href={'#' + n.path} onClick={() => setMore(false)}><Icon name={n.icon} />{n.label}</a>)}
              </div>
              <p class="small muted mt">Signed in as <b>{user.name}</b> ({user.role})</p>
              <Btn icon="lock" onClick={() => { setMore(false); onLogout(); }}>Lock / switch user</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BrandTop({ settings }) {
  return <><div class="l1">{settings.brandLine1}</div><div class="l2">{settings.brandLine2}</div><div class="tg">{settings.tagline}</div></>;
}

function Setup({ settings, onDone }) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [err, setErr] = useState('');
  const submit = async () => {
    setErr('');
    if (pin !== pin2) return setErr('PINs do not match');
    try { const u = await createUser({ name, role: 'Owner', pin }); await audit('login', 'user', u.id, u.name); onDone(u); } catch (e) { setErr(e.message); }
  };
  return (
    <div class="login"><div class="panel">
      <BrandTop settings={settings} />
      <h2 style="text-align:center">First-time setup</h2>
      <p class="small muted" style="text-align:center">Create the Owner account. You can add Managers, Cashiers and Staff later in Settings.</p>
      <div class="stack">
        <Field label="Owner name"><Input value={name} onInput={setName} autoFocus /></Field>
        <Field label="PIN (4–8 digits)"><Input type="password" inputMode="numeric" value={pin} onInput={setPin} /></Field>
        <Field label="Confirm PIN"><Input type="password" inputMode="numeric" value={pin2} onInput={setPin2} /></Field>
        {err && <div class="err">{err}</div>}
        <Btn kind="primary" style="width:100%" onClick={submit}>Create owner & start</Btn>
      </div>
    </div></div>
  );
}

function Login({ settings, onLogin }) {
  const users = useLive(() => db.users.toArray(), [], []);
  const active = users.filter((u) => u.active);
  const [sel, setSel] = useState(null);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const chosen = sel || (active.length === 1 ? active[0].id : null);
  const tryLogin = async (p) => {
    if (!chosen) return setErr('Select your name');
    setBusy(true);
    const u = await verifyLogin(chosen, p);
    setBusy(false);
    if (u) { await audit('login', 'user', u.id, u.name); onLogin(u); }
    else { setErr('Wrong PIN'); setPin(''); await audit('login-failed', 'user', chosen, ''); }
  };
  const press = (d) => {
    setErr('');
    if (d === '⌫') return setPin(pin.slice(0, -1));
    if (d === 'OK') return tryLogin(pin);
    const np = (pin + d).slice(0, 8);
    setPin(np);
  };
  return (
    <div class="login"><div class="panel">
      <BrandTop settings={settings} />
      <div class="users">{active.map((u) => <button class={'chip' + (chosen === u.id ? ' on' : '')} onClick={() => { setSel(u.id); setPin(''); setErr(''); }}>{u.name} · {u.role}</button>)}</div>
      <div class="pindots">{Array.from({ length: Math.max(4, pin.length) }).map((_, i) => <i class={i < pin.length ? 'on' : ''} />)}</div>
      <div style="text-align:center;min-height:20px" class="err">{err}{busy ? 'Checking…' : ''}</div>
      <div class="pinpad">{['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map((d) => <button onClick={() => press(d)} style={d === 'OK' ? 'background:var(--navy);color:#fff' : ''}>{d}</button>)}</div>
      <input type="password" inputMode="numeric" aria-label="PIN" class="input mt" placeholder="or type PIN and press Enter" value={pin} onInput={(e) => setPin(e.currentTarget.value.replace(/\D/g, '').slice(0, 8))} onKeyDown={(e) => e.key === 'Enter' && tryLogin(pin)} />
    </div></div>
  );
}
