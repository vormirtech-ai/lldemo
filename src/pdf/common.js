import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import notoRegularUrl from '../assets/fonts/NotoSans-400Regular.ttf?url';
import notoBoldUrl from '../assets/fonts/NotoSans-700Bold.ttf?url';
import notoItalicUrl from '../assets/fonts/NotoSans-400Regular_Italic.ttf?url';

export { autoTable };

export const PAGE = { W: 595.28, H: 841.89 };
export const L = 56;
export const R = PAGE.W - 56;
export const CW = R - L; // content width
export const TOP = 62;
export const BOTTOM = PAGE.H - 86; // last usable y for content

let fontCache = null;
async function toBase64(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function loadFonts() {
  if (!fontCache) {
    const [r, b, i] = await Promise.all([toBase64(notoRegularUrl), toBase64(notoBoldUrl), toBase64(notoItalicUrl)]);
    fontCache = { r, b, i };
  }
  return fontCache;
}

export async function newDoc(meta = {}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const f = await loadFonts();
  doc.addFileToVFS('NotoSans-Regular.ttf', f.r);
  doc.addFont('NotoSans-Regular.ttf', 'Noto', 'normal');
  doc.addFileToVFS('NotoSans-Bold.ttf', f.b);
  doc.addFont('NotoSans-Bold.ttf', 'Noto', 'bold');
  doc.addFileToVFS('NotoSans-Italic.ttf', f.i);
  doc.addFont('NotoSans-Italic.ttf', 'Noto', 'italic');
  doc.setProperties({ title: meta.title || 'Document', author: meta.author || '', creator: 'Catering POS' });
  return doc;
}

export function rgb(hex) {
  const h = (hex || '#000000').replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export const setFill = (doc, hex) => doc.setFillColor(...rgb(hex));
export const setDraw = (doc, hex) => doc.setDrawColor(...rgb(hex));
export const setText = (doc, hex) => doc.setTextColor(...rgb(hex));

export function palette(s) {
  const c = s.colors || {};
  return {
    navy: c.navy || '#1B2A41', gold: c.gold || '#C29A45', maroon: c.maroon || '#8B1E3F',
    cream: c.cream || '#FBF4E6', green: c.green || '#2F5D50', rule: '#D9CCA8', ink: '#2B2B2B', grey: '#7A7A7A'
  };
}

export function spaced(doc, text, x, y, opts = {}) {
  doc.setCharSpace(opts.space ?? 0.6);
  doc.text(text, x, y, { align: opts.align || 'center' });
  doc.setCharSpace(0);
}

// Brand block at the top of page 1. Returns next y.
export function drawBrandHeader(doc, s) {
  const p = palette(s);
  let y = 66;
  if (s.logo) {
    try {
      const h = 46;
      const w = s.logoW && s.logoH ? Math.min((s.logoW / s.logoH) * h, 160) : h;
      doc.addImage(s.logo, PAGE.W / 2 - w / 2, y - 14, w, h);
      y += h - 2;
    } catch (e) { /* bad image — skip */ }
  }
  if (s.brandLine1) {
    doc.setFont('times', 'bold'); doc.setFontSize(24); setText(doc, p.gold);
    doc.text(s.brandLine1, PAGE.W / 2, y + 6, { align: 'center' });
    y += 22;
  }
  if (s.brandLine2) {
    doc.setFont('times', 'bold'); doc.setFontSize(15.5); setText(doc, p.navy);
    doc.text(s.brandLine2, PAGE.W / 2, y + 2, { align: 'center' });
    y += 11;
  }
  if (s.tagline) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.3); setText(doc, p.maroon);
    spaced(doc, s.tagline, PAGE.W / 2, y + 1, { space: 0.25 });
    y += 9;
  }
  const contact = [s.address, s.phone, s.email].filter(Boolean).join('  •  ');
  const reg = [s.gstin ? 'GSTIN: ' + s.gstin : '', s.fssai ? 'FSSAI: ' + s.fssai : ''].filter(Boolean).join('   •   ');
  doc.setFont('Noto', 'normal'); doc.setFontSize(6.6); setText(doc, p.grey);
  if (contact) {
    const lines = doc.splitTextToSize(contact, CW);
    doc.text(lines, PAGE.W / 2, y + 2, { align: 'center' });
    y += lines.length * 8.5;
  }
  if (reg) { doc.text(reg, PAGE.W / 2, y + 2, { align: 'center' }); y += 8.5; }
  return y + 10;
}

// Frame, footer tagline, doc number and page numbers on every page.
export function finishPages(doc, s, { docNo = '', watermark = '' } = {}) {
  const p = palette(s);
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    if (watermark) {
      doc.saveGraphicsState();
      doc.setGState(new doc.GState({ opacity: 0.08 }));
      doc.setFont('helvetica', 'bold'); doc.setFontSize(110); setText(doc, p.maroon);
      doc.text(watermark, PAGE.W / 2, PAGE.H / 2 + 40, { align: 'center', angle: 35 });
      doc.restoreGraphicsState();
    }
    setDraw(doc, p.gold);
    doc.setLineWidth(1.4); doc.rect(32, 32, PAGE.W - 64, PAGE.H - 64);
    doc.setLineWidth(0.5); doc.rect(39, 39, PAGE.W - 78, PAGE.H - 78);
    if (s.footerTagline) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.2); setText(doc, p.maroon);
      spaced(doc, s.footerTagline, PAGE.W / 2, PAGE.H - 60, { space: 0.3 });
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); setText(doc, p.grey);
    if (docNo) doc.text(docNo, L, PAGE.H - 49);
    doc.text(`Page ${i} of ${n}`, R, PAGE.H - 49, { align: 'right' });
  }
}

export function ensureSpace(doc, y, needed) {
  if (y + needed > BOTTOM) { doc.addPage(); return TOP; }
  return y;
}

// Italic serif section heading with subtitle (reference style). Returns next y.
export function sectionHeading(doc, s, y, title, subtitle, accent) {
  const p = palette(s);
  doc.setFont('times', 'bolditalic'); doc.setFontSize(15.5); setText(doc, accent || p.navy);
  doc.text(title, PAGE.W / 2, y + 12, { align: 'center' });
  y += 16;
  if (subtitle) {
    doc.setFont('times', 'italic'); doc.setFontSize(6.8); setText(doc, p.maroon);
    doc.text(subtitle, PAGE.W / 2, y + 5, { align: 'center' });
    y += 9;
  }
  return y + 6;
}

// Info grid: rows of [label, value, label, value]
export function infoGrid(doc, s, y, rows) {
  const p = palette(s);
  autoTable(doc, {
    startY: y,
    margin: { left: L, right: PAGE.W - R },
    body: rows,
    theme: 'grid',
    styles: { font: 'Noto', fontSize: 6.8, cellPadding: { top: 4.2, bottom: 4.2, left: 6, right: 5 }, lineColor: rgb(p.navy), lineWidth: 0.6, textColor: rgb(p.navy), valign: 'middle' },
    columnStyles: {
      0: { cellWidth: 50, fillColor: rgb(p.navy), textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.2 },
      1: { cellWidth: 162, fillColor: rgb(p.cream) },
      2: { cellWidth: 52, fillColor: rgb(p.navy), textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.2 },
      3: { fillColor: rgb(p.cream) }
    }
  });
  return doc.lastAutoTable.finalY + 14;
}

// Money in PDFs uses Noto (has the ₹ glyph)
const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pm = (v) => '₹ ' + inr.format(Number(v) || 0);

// Totals block (right-aligned). rows: [{label, value, bold, highlight}] Returns next y.
export function totalsBlock(doc, s, y, rows, { width = 236 } = {}) {
  const p = palette(s);
  const rowH = 15;
  y = ensureSpace(doc, y, rows.length * rowH + 10);
  const x = R - width;
  for (const r of rows) {
    if (r.highlight) {
      setFill(doc, p.navy); doc.rect(x, y, width, rowH + 4, 'F');
      doc.setFont('Noto', 'bold'); doc.setFontSize(8.2); setText(doc, p.gold);
      doc.text(r.label, x + 8, y + 12);
      doc.text(r.value, R - 8, y + 12, { align: 'right' });
      y += rowH + 4;
    } else {
      doc.setFont('Noto', r.bold ? 'bold' : 'normal'); doc.setFontSize(7.4); setText(doc, r.color || p.navy);
      doc.text(r.label, x + 8, y + 10.5);
      doc.text(r.value, R - 8, y + 10.5, { align: 'right' });
      setDraw(doc, p.rule); doc.setLineWidth(0.5); doc.line(x, y + rowH, R, y + rowH);
      y += rowH;
    }
  }
  return y + 8;
}

// Bulleted text block with small heading. Returns next y.
export function textBlock(doc, s, y, heading, text, { x = L, width = CW, color } = {}) {
  const p = palette(s);
  const items = String(text || '').split('\n').map((t) => t.trim()).filter(Boolean);
  if (!items.length) return y;
  doc.setFont('Noto', 'normal'); doc.setFontSize(7);
  const wrapped = items.map((t) => doc.splitTextToSize(t, width - 12));
  const h = 16 + wrapped.reduce((a, w) => a + w.length * 9 + 2, 0);
  y = ensureSpace(doc, y, Math.min(h, 200));
  doc.setFont('times', 'bolditalic'); doc.setFontSize(11); setText(doc, color || p.gold);
  doc.text(heading, x, y + 9);
  y += 16;
  doc.setFont('Noto', 'normal'); doc.setFontSize(7); setText(doc, p.ink);
  for (const w of wrapped) {
    y = ensureSpace(doc, y, w.length * 9 + 2);
    setFill(doc, p.gold); doc.circle(x + 3, y + 3.2, 1.2, 'F');
    doc.text(w, x + 10, y + 5.5);
    y += w.length * 9 + 2;
  }
  return y + 6;
}

export function blobOf(doc) {
  return doc.output('blob');
}

export function safeFileName(s) {
  return String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').slice(0, 90);
}
