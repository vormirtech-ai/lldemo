import { h, Fragment, render } from 'preact';
import { useEffect, useState, useRef } from 'preact/hooks';
import { liveQuery } from 'dexie';
import { isNative, nativeShareBlob } from './native.js';

// ---------- Live data hook (re-renders when IndexedDB changes) ----------
export function useLive(fn, deps = [], initial = undefined) {
  const [v, setV] = useState(initial);
  useEffect(() => {
    const sub = liveQuery(fn).subscribe({ next: setV, error: (e) => console.error(e) });
    return () => sub.unsubscribe();
  }, deps);
  return v;
}

// ---------- Router (hash based; works on any static host and inside the APK) ----------
export function useRoute() {
  const get = () => (location.hash.replace(/^#/, '') || '/dashboard');
  const [r, setR] = useState(get());
  useEffect(() => {
    const on = () => setR(get());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return r;
}
export const go = (path) => { location.hash = path; };

// ---------- Icons ----------
const P = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  pos: 'M4 4h16v10H4zM2 18h20v2H2zM8 14h8v2H8z',
  quote: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM8 13h8v2H8v-2zm0 4h8v2H8v-2z',
  bill: 'M6 2h12v20l-3-2-3 2-3-2-3 2V2zm3 5h6v2H9V7zm0 4h6v2H9v-2z',
  event: 'M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zm-2 8h14v10H5V10z',
  clients: 'M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.7 0-6 1.3-6 4v3h6v-3c0-1.1.4-2.1 1.2-3A9 9 0 0 0 8 13zm8 0c-3 0-7 1.5-7 4.5V20h14v-2.5c0-3-4-4.5-7-4.5z',
  menu: 'M11 9H9V2H7v7H5V2H3v7c0 2.1 1.7 3.8 3.8 4V22h2.5v-9c2-.2 3.7-1.9 3.7-4V2h-2v7zm5-3v8h2.5v8H21V2c-2.8 0-5 2.2-5 4z',
  reports: 'M5 9h3v11H5V9zm5.5-5h3v16h-3V4zM16 13h3v7h-3v-7z',
  settings: 'M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5L19.4 13zM13 15.5a3.5 3.5 0 1 1 3.5-3.5 3.5 3.5 0 0 1-3.5 3.5z',
  more: 'M6 10a2 2 0 1 0 2 2 2 2 0 0 0-2-2zm6 0a2 2 0 1 0 2 2 2 2 0 0 0-2-2zm6 0a2 2 0 1 0 2 2 2 2 0 0 0-2-2z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
  trash: 'M9 3h6l1 1h4v2H4V4h4l1-1zm-3 5h12l-1 13H7L6 8z',
  edit: 'M3 17.2V21h3.8L17.8 10l-3.8-3.8L3 17.2zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8L20.7 7z',
  close: 'M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z',
  search: 'M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 4.5-4.5A4.5 4.5 0 0 1 9.5 14z',
  pdf: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM9 18H7v-6h2a2 2 0 0 1 0 4H9v2zm4 0h-2v-6h2a3 3 0 0 1 0 6zm6-4h-2v1h2v1h-2v2h-1v-6h3v2z',
  wa: 'M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.2-.7a11.4 11.4 0 0 1-4.4-3.9 5 5 0 0 1-1-2.7 2.9 2.9 0 0 1 .9-2.2 1 1 0 0 1 .7-.3h.5c.2 0 .4 0 .6.5l.8 1.9a.5.5 0 0 1 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6a8.3 8.3 0 0 0 1.5 1.9 7.4 7.4 0 0 0 2.2 1.3c.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l1.8.9c.3.1.5.2.5.3a2.3 2.3 0 0 1-.2 1.3z',
  copy: 'M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z',
  lock: 'M17 8V7a5 5 0 0 0-10 0v1H5v14h14V8h-2zm-8-1a3 3 0 0 1 6 0v1H9V7z',
  up: 'M7 14l5-5 5 5z', down: 'M7 10l5 5 5-5z',
  download: 'M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z',
  print: 'M19 8H5a3 3 0 0 0-3 3v6h4v4h12v-4h4v-6a3 3 0 0 0-3-3zm-3 11H8v-5h8v5zm3-7a1 1 0 1 1 1-1 1 1 0 0 1-1 1zM18 3H6v4h12V3z',
  back: 'M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20v-2z',
  check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z'
};
export const Icon = ({ name, size }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size} aria-hidden="true"><path d={P[name] || ''} /></svg>
);

// ---------- Form controls ----------
export function Field({ label, children, hint, error, style, class: cls }) {
  return (
    <label class={'field ' + (cls || '')} style={style}>
      {label && <span>{label}</span>}
      {children}
      {hint && <small class="muted tiny">{hint}</small>}
      {error && <small class="err">{error}</small>}
    </label>
  );
}
export const Input = ({ value, onInput, ...rest }) => (
  <input class="input" value={value ?? ''} onInput={(e) => onInput?.(e.currentTarget.value)} {...rest} />
);
export const Num = ({ value, onInput, ...rest }) => (
  <input class="input num" type="number" inputMode="decimal" step="any" value={value ?? ''} onFocus={(e) => e.currentTarget.select()} onInput={(e) => onInput?.(e.currentTarget.value === '' ? '' : Number(e.currentTarget.value))} {...rest} />
);
export const Area = ({ value, onInput, ...rest }) => (
  <textarea class="input" value={value ?? ''} onInput={(e) => onInput?.(e.currentTarget.value)} {...rest} />
);
export const Select = ({ value, onChange, options, ...rest }) => (
  <select class="input" value={value ?? ''} onChange={(e) => onChange?.(e.currentTarget.value)} {...rest}>
    {options.map((o) => (typeof o === 'string' ? <option value={o}>{o}</option> : <option value={o.value}>{o.label}</option>))}
  </select>
);
export const Check = ({ checked, onChange, label }) => (
  <label class="check"><input type="checkbox" checked={!!checked} onChange={(e) => onChange?.(e.currentTarget.checked)} /> {label}</label>
);
export const Btn = ({ icon, children, kind = '', class: cls = '', ...rest }) => (
  <button type="button" class={`btn ${kind} ${cls}`} {...rest}>{icon && <Icon name={icon} />}{children}</button>
);
export const Badge = ({ s, children }) => <span class={'badge b-' + String(s || '').split(' ')[0]}>{children || s}</span>;
export const Empty = ({ title, children }) => <div class="empty"><h3>{title}</h3><div class="small">{children}</div></div>;

// ---------- Modal ----------
export function Modal({ title, onClose, children, footer, size = '' }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  return (
    <div class="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div class={'modal ' + size} role="dialog" aria-modal="true">
        <div class="modal-h"><h2>{title}</h2><Btn kind="ghost" class="icon" icon="close" onClick={onClose} aria-label="Close" /></div>
        <div class="modal-b">{children}</div>
        {footer && <div class="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

// Imperative dialogs (confirm / prompt) mounted in their own root
function mountDialog(Comp) {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const done = (v) => { render(null, host); host.remove(); resolve(v); };
    render(<Comp done={done} />, host);
  });
}
export const confirmDialog = (message, { title = 'Please confirm', ok = 'Confirm', danger = false } = {}) =>
  mountDialog(({ done }) => (
    <Modal title={title} size="narrow" onClose={() => done(false)} footer={<>
      <Btn onClick={() => done(false)}>Cancel</Btn>
      <Btn kind={danger ? 'danger' : 'primary'} onClick={() => done(true)}>{ok}</Btn>
    </>}><p style="margin:0;white-space:pre-line">{message}</p></Modal>
  ));
export const promptDialog = (message, { title = 'Enter value', initial = '', ok = 'OK', type = 'text' } = {}) =>
  mountDialog(({ done }) => {
    const [v, setV] = useState(initial);
    return (
      <Modal title={title} size="narrow" onClose={() => done(null)} footer={<>
        <Btn onClick={() => done(null)}>Cancel</Btn><Btn kind="primary" onClick={() => done(v)}>{ok}</Btn>
      </>}>
        <Field label={message}><input class="input" type={type} autoFocus value={v} onInput={(e) => setV(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && done(v)} /></Field>
      </Modal>
    );
  });

export const choiceDialog = (message, options, { title = 'Choose' } = {}) =>
  mountDialog(({ done }) => (
    <Modal title={title} size="narrow" onClose={() => done(null)}>
      <p class="small muted" style="margin-top:0">{message}</p>
      <div class="stack">{options.map((o) => <Btn kind={o.kind || ''} style="width:100%" onClick={() => done(o.value)}>{o.label}</Btn>)}</div>
    </Modal>
  ));

// ---------- Toasts ----------
let pushToast = () => {};
export const toast = (msg, kind = '') => pushToast(msg, kind);
export function Toasts() {
  const [list, setList] = useState([]);
  const idRef = useRef(0);
  pushToast = (msg, kind) => {
    const id = ++idRef.current;
    setList((l) => [...l, { id, msg, kind }]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 3600);
  };
  return <div class="toast-wrap">{list.map((t) => <div class={'toast ' + t.kind}>{t.msg}</div>)}</div>;
}

export function Stat({ k, v, s, accent, onClick }) {
  return <div class={'stat' + (accent ? ' accent' : '')} onClick={onClick} style={onClick ? 'cursor:pointer' : ''}><div class="k">{k}</div><div class="v">{v}</div>{s && <div class="s">{s}</div>}</div>;
}

export function downloadBlob(blob, name) {
  if (isNative()) { nativeShareBlob(blob, name).catch(() => {}); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

export function TopBar({ title, back, children }) {
  return (
    <div class="topbar">
      {back && <Btn kind="ghost" class="icon" icon="back" onClick={() => (typeof back === 'string' ? go(back) : history.back())} aria-label="Back" />}
      <h1>{title}</h1>
      {children}
    </div>
  );
}
