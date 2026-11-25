import { useState } from 'preact/hooks';
import { db, audit } from '../db.js';
import { can } from '../auth.js';
import { money, uid } from '../format.js';
import { useLive, TopBar, Btn, Badge, Empty, Input, Num, Area, Field, Select, Modal, Check, toast, confirmDialog } from '../ui.jsx';
import { useCategories, UNITS } from './docparts.jsx';

export function MenuScreen({ user }) {
  const [tab, setTab] = useState('items');
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [archived, setArchived] = useState(false);
  const [edit, setEdit] = useState(null);
  const [editCat, setEditCat] = useState(null);
  const cats = useCategories();
  const items = useLive(() => db.items.toArray(), [], []);
  const canEdit = can(user, 'menu.edit');
  const f = q.trim().toLowerCase();
  const shown = items.filter((i) => !!i.archived === archived && (cat === 'all' || i.categoryId === cat) && (!f || [i.name, i.description].join(' ').toLowerCase().includes(f)))
    .sort((a, b) => (cats.find((c) => c.id === a.categoryId)?.sort ?? 99) - (cats.find((c) => c.id === b.categoryId)?.sort ?? 99) || (a.sort ?? 0) - (b.sort ?? 0));
  const moveCat = async (c, dir) => {
    const list = [...cats];
    const i = list.findIndex((x) => x.id === c.id), j = i + dir;
    if (j < 0 || j >= list.length) return;
    await db.transaction('rw', db.categories, async () => { await db.categories.update(list[i].id, { sort: list[j].sort }); await db.categories.update(list[j].id, { sort: list[i].sort }); });
  };
  return (
    <>
      <TopBar title="Menu & services">
        {canEdit && tab === 'items' && <Btn kind="primary" icon="plus" onClick={() => setEdit({ id: null, name: '', categoryId: cat !== 'all' ? cat : cats[0]?.id, description: '', diet: 'veg', unit: 'Plate', rate: 0, archived: 0, image: '' })}>Add item</Btn>}
        {canEdit && tab === 'cats' && <Btn kind="primary" icon="plus" onClick={() => setEditCat({ id: null, name: '', subtitle: '', accent: '#1B2A41', kind: 'menu' })}>Add section</Btn>}
      </TopBar>
      <div class="content">
        <div class="chips mb"><button class={'chip' + (tab === 'items' ? ' on' : '')} onClick={() => setTab('items')}>Items ({items.filter((i) => !i.archived).length})</button><button class={'chip' + (tab === 'cats' ? ' on' : '')} onClick={() => setTab('cats')}>Sections ({cats.length})</button></div>
        {tab === 'items' && <>
          <div class="row" style="flex-wrap:nowrap"><Input placeholder="Search items" value={q} onInput={setQ} /><Check checked={archived} onChange={setArchived} label="Archived" /></div>
          <div class="chips mt">
            <button class={'chip' + (cat === 'all' ? ' on' : '')} onClick={() => setCat('all')}>All</button>
            {cats.map((c) => <button class={'chip' + (cat === c.id ? ' on' : '')} onClick={() => setCat(c.id)}>{c.name}</button>)}
          </div>
          {items.some((i) => !i.archived && !(Number(i.rate) > 0)) && !archived && <div class="notice mt">Some items have no rate yet (₹0). That is fine for per-plate quotations; set rates for POS and item-wise billing.</div>}
          <div class="list mt">
            {shown.map((i) => {
              const c = cats.find((x) => x.id === i.categoryId);
              return (
                <div class="item" onClick={() => canEdit && setEdit(i)}>
                  {i.image ? <img src={i.image} alt="" style="width:48px;height:48px;border-radius:10px;object-fit:cover" /> : <div style={{ width: '6px', alignSelf: 'stretch', borderRadius: '3px', background: c?.accent || '#ccc' }} />}
                  <div class="grow"><div class="row" style="gap:8px"><span class="main-t">{i.name}</span>{i.diet && <Badge s={i.diet}>{i.diet === 'veg' ? 'Veg' : 'Non-veg'}</Badge>}</div><div class="small muted ellipsis">{c?.name} • {i.description}</div></div>
                  <div class="amt">{Number(i.rate) > 0 ? money(i.rate) : <span class="muted small">₹0</span>}<div class="tiny muted">/ {i.unit}</div></div>
                </div>
              );
            })}
            {!shown.length && <Empty title={archived ? 'No archived items' : 'No items'} />}
          </div>
        </>}
        {tab === 'cats' && (
          <div class="list">
            {cats.map((c) => (
              <div class="item" onClick={() => canEdit && setEditCat(c)}>
                <div style={{ width: '6px', alignSelf: 'stretch', borderRadius: '3px', background: c.accent }} />
                <div class="grow"><div class="main-t" style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', color: c.accent }}>{c.name} {c.archived ? <Badge s="Expired">Archived</Badge> : ''}</div><div class="small muted ellipsis">{c.subtitle} • {c.kind === 'service' ? 'Service' : 'Menu'}</div></div>
                {canEdit && <><Btn class="sm icon" kind="ghost" icon="up" onClick={(e) => { e.stopPropagation(); moveCat(c, -1); }} /><Btn class="sm icon" kind="ghost" icon="down" onClick={(e) => { e.stopPropagation(); moveCat(c, 1); }} /></>}
              </div>
            ))}
            <p class="tiny muted">Section order here is the order dishes appear on quotation and bill PDFs.</p>
          </div>
        )}
      </div>
      {edit && <ItemModal item={edit} cats={cats} user={user} onClose={() => setEdit(null)} />}
      {editCat && <CatModal cat={editCat} count={items.filter((i) => i.categoryId === editCat.id).length} maxSort={Math.max(0, ...cats.map((c) => c.sort ?? 0))} onClose={() => setEditCat(null)} />}
    </>
  );
}

async function compressImage(file) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const max = 480, scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

function ItemModal({ item, cats, user, onClose }) {
  const [i, setI] = useState(item);
  const canPrice = can(user, 'menu.price');
  const u = (k) => (v) => setI({ ...i, [k]: v });
  const save = async () => {
    if (!i.name.trim()) return toast('Name is required', 'error');
    const id = i.id || uid();
    const prev = i.id ? await db.items.get(i.id) : null;
    await db.items.put({ ...i, id, name: i.name.trim(), rate: Number(i.rate) || 0, sort: i.sort ?? Date.now() });
    await audit(prev ? 'edit' : 'create', 'menu-item', id, `${i.name}${prev && prev.rate !== Number(i.rate) ? ` rate ${prev.rate} → ${i.rate}` : ''}`);
    toast('Saved'); onClose();
  };
  const toggleArchive = async () => {
    await db.items.update(i.id, { archived: i.archived ? 0 : 1 });
    await audit(i.archived ? 'restore' : 'archive', 'menu-item', i.id, i.name);
    toast(i.archived ? 'Restored' : 'Archived'); onClose();
  };
  return (
    <Modal title={i.id ? 'Edit item' : 'New item'} onClose={onClose} footer={<>
      {i.id && <Btn class={i.archived ? '' : 'danger'} style="margin-right:auto" onClick={toggleArchive}>{i.archived ? 'Restore' : 'Archive'}</Btn>}
      <Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
      <div class="grid g2">
        <Field label="Name *" style="grid-column:1/-1"><Input value={i.name} onInput={u('name')} autoFocus /></Field>
        <Field label="Section"><Select value={i.categoryId} onChange={u('categoryId')} options={cats.map((c) => ({ value: c.id, label: c.name }))} /></Field>
        <Field label="Veg / Non-veg"><Select value={i.diet} onChange={u('diet')} options={[{ value: '', label: '— (service)' }, { value: 'veg', label: 'Vegetarian' }, { value: 'nonveg', label: 'Non-vegetarian' }]} /></Field>
        <Field label="Description (shown on quotation PDF)" style="grid-column:1/-1"><Area value={i.description} onInput={u('description')} /></Field>
        <Field label="Default unit"><Select value={i.unit} onChange={u('unit')} options={[...new Set([i.unit || 'Plate', ...UNITS])]} /></Field>
        <Field label="Default rate ₹" hint={canPrice ? 'Copied into new documents; old ones never change' : 'Only Owner/Manager can change prices'}><Num value={i.rate} disabled={!canPrice} onInput={u('rate')} /></Field>
        <Field label="Photo (optional)" style="grid-column:1/-1">
          <div class="row">{i.image && <img src={i.image} style="width:64px;height:64px;border-radius:10px;object-fit:cover" />}<input type="file" accept="image/*" onChange={async (e) => { const f = e.currentTarget.files[0]; if (f) setI({ ...i, image: await compressImage(f) }); }} />{i.image && <Btn class="sm" onClick={() => setI({ ...i, image: '' })}>Remove</Btn>}</div>
        </Field>
      </div>
    </Modal>
  );
}

function CatModal({ cat, count, maxSort, onClose }) {
  const [c, setC] = useState(cat);
  const u = (k) => (v) => setC({ ...c, [k]: v });
  const save = async () => {
    if (!c.name.trim()) return toast('Name is required', 'error');
    const id = c.id || uid();
    await db.categories.put({ ...c, id, name: c.name.trim(), sort: c.sort ?? maxSort + 1, archived: c.archived || 0 });
    await audit(c.id ? 'edit' : 'create', 'category', id, c.name);
    toast('Saved'); onClose();
  };
  const arch = async () => { await db.categories.update(c.id, { archived: c.archived ? 0 : 1 }); await audit('archive', 'category', c.id, c.name); onClose(); };
  return (
    <Modal title={c.id ? 'Edit section' : 'New section'} onClose={onClose} footer={<>{c.id && <Btn style="margin-right:auto" onClick={arch}>{c.archived ? 'Restore' : 'Archive'}</Btn>}<Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
      <div class="grid g2">
        <Field label="Section name *" style="grid-column:1/-1"><Input value={c.name} onInput={u('name')} placeholder="e.g. Dessert Atelier" /></Field>
        <Field label="Subtitle (italic line on PDF)" style="grid-column:1/-1"><Input value={c.subtitle} onInput={u('subtitle')} /></Field>
        <Field label="Accent colour"><input type="color" class="swatch" value={c.accent} onInput={(e) => u('accent')(e.currentTarget.value)} /></Field>
        <Field label="Type"><Select value={c.kind} onChange={u('kind')} options={[{ value: 'menu', label: 'Menu (food & drink)' }, { value: 'service', label: 'Service (staff, equipment…)' }]} /></Field>
      </div>
      {c.id && <p class="tiny muted">{count} item(s) in this section.</p>}
    </Modal>
  );
}
