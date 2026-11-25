import {
  newDoc, autoTable, PAGE, L, R, CW, TOP, BOTTOM, rgb, setText, setDraw, palette, spaced,
  drawBrandHeader, finishPages, ensureSpace, sectionHeading, infoGrid, totalsBlock, textBlock, pm
} from './common.js';
import { groupLines } from './groups.js';
import { computeTotals } from '../calc.js';
import { longDate, fmtTime, displayPhone, qtyFmt, amountInWords, fmtDate } from '../format.js';

// QUOTATION / CATERING PROPOSAL — reference-style menu document + commercials.
export async function buildQuotationPdf(q, s) {
  const p = palette(s);
  const doc = await newDoc({ title: `Quotation ${q.number} - ${q.client?.name || ''}`, author: [s.brandLine1, s.brandLine2].filter(Boolean).join(' ') });
  const ev = q.event || {};
  let y = drawBrandHeader(doc, s);

  // Document type ribbon — this is a QUOTATION, never a bill.
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); setText(doc, p.maroon);
  spaced(doc, `QUOTATION  •  CATERING PROPOSAL  •  NO. ${q.number}`, PAGE.W / 2, y + 2, { space: 0.8 });
  y += 8;

  doc.setFont('times', 'bold'); doc.setFontSize(23); setText(doc, p.navy);
  doc.text((ev.menuTitle || 'CATERING PROPOSAL').toUpperCase(), PAGE.W / 2, y + 18, { align: 'center' });
  y += 26;
  if (ev.menuSubtitle) {
    doc.setFont('times', 'italic'); doc.setFontSize(8.6); setText(doc, p.navy);
    doc.text(ev.menuSubtitle, PAGE.W / 2, y + 4, { align: 'center' });
    y += 10;
  }
  y += 6;

  const guests = ev.guests ? `${ev.guests} PAXES` : '';
  const when = [ev.time ? fmtTime(ev.time) : ''].filter(Boolean).join('');
  const rows = [
    ['HOST', (q.client?.name || '').toUpperCase(), 'VENUE', (ev.venue || '').toUpperCase()],
    ['DATE', ev.date ? longDate(ev.date).toUpperCase() : '', (ev.timeLabel || 'TIME').toUpperCase(), when],
    ['MOBILE', displayPhone(q.client?.whatsapp || q.client?.phone), 'GUESTS', guests],
    ['QUOTE DATE', q.quoteDate ? longDate(q.quoteDate).toUpperCase() : '', 'VALID TILL', q.validUntil ? longDate(q.validUntil).toUpperCase() : '']
  ];
  if (ev.type) rows.splice(3, 0, ['OCCASION', ev.type.toUpperCase(), 'STATUS', (q.status || '').toUpperCase()]);
  y = infoGrid(doc, s, y, rows);

  // ---- Menu & services, grouped exactly like the reference menu ----
  const showRates = !!q.showRates;
  const groups = groupLines(q.lines);
  for (const g of groups) {
    const accent = g.accent || p.navy;
    y = ensureSpace(doc, y, 34 + Math.min(g.lines.length, 2) * 20 + (g.split ? 12 : 0));
    y = sectionHeading(doc, s, y, g.name, g.subtitle, accent);
    for (const part of g.parts) {
      if (!part.lines.length) continue;
      if (part.label) {
        y = ensureSpace(doc, y, 34);
        doc.setFont('times', 'italic'); doc.setFontSize(7.8); setText(doc, p.maroon);
        doc.text(`— ${part.label} —`, L, y + 6);
        y += 10;
      }
      const body = part.lines.map((l) => {
        const desc = [l.description, l.note].filter(Boolean).join(' — ');
        const row = [l.name, desc];
        if (showRates) row.push(Number(l.rate) > 0 ? `${qtyFmt(l.qty)} ${l.unit || ''} × ${pm(l.rate)}` : 'Included');
        return row;
      });
      autoTable(doc, {
        startY: y,
        margin: { left: L, right: PAGE.W - R, top: TOP, bottom: PAGE.H - BOTTOM },
        body,
        theme: 'plain',
        rowPageBreak: 'avoid',
        styles: { font: 'helvetica', fontSize: 6.7, textColor: rgb(p.ink), cellPadding: { top: 5.2, bottom: 5.2, left: 8, right: 6 }, valign: 'middle', overflow: 'linebreak' },
        columnStyles: {
          0: { cellWidth: 122, font: 'times', fontStyle: 'bold', fontSize: 7.8, textColor: rgb(p.navy), fillColor: rgb(p.cream) },
          ...(showRates ? { 2: { cellWidth: 104, font: 'Noto', fontSize: 6.6, halign: 'right', textColor: rgb(p.navy) } } : {})
        },
        didDrawCell: (d) => {
          if (d.section !== 'body') return;
          if (d.column.index === 0) {
            doc.setFillColor(...rgb(accent));
            doc.rect(d.cell.x, d.cell.y, 2.3, d.cell.height, 'F');
          }
          setDraw(doc, p.rule); doc.setLineWidth(0.6);
          doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height);
        }
      });
      y = doc.lastAutoTable.finalY + 6;
    }
    y += 6;
  }

  // ---- Commercials ----
  const t = computeTotals(q);
  const priced = (q.lines || []).filter((l) => Number(l.rate) > 0 && Number(l.qty) > 0);
  const hasMoney = t.subtotal > 0 || t.charges > 0;
  if (hasMoney) {
    y = ensureSpace(doc, y, 150);
    y = sectionHeading(doc, s, y + 4, 'Commercial Proposal', 'Estimated charges for the menu & services proposed above', p.navy);
    const body = [];
    let i = 1;
    if (q.package?.enabled) {
      body.push([i++, q.package.label || 'Per-plate menu package (menu as above)', qtyFmt(q.package.pax), 'Pax', pm(q.package.rate), pm((Number(q.package.pax) || 0) * (Number(q.package.rate) || 0))]);
    }
    for (const l of priced) body.push([i++, l.name, qtyFmt(l.qty), l.unit || '', pm(l.rate), pm(Number(l.qty) * Number(l.rate))]);
    if (body.length) {
      autoTable(doc, {
        startY: y,
        margin: { left: L, right: PAGE.W - R, top: TOP, bottom: PAGE.H - BOTTOM },
        head: [['#', 'PARTICULARS', 'QTY', 'UNIT', 'RATE', 'AMOUNT']],
        body,
        theme: 'plain',
        showHead: 'everyPage',
        headStyles: { font: 'Noto', fontStyle: 'bold', fontSize: 6.6, fillColor: rgb(p.navy), textColor: [255, 255, 255], cellPadding: 5 },
        styles: { font: 'Noto', fontSize: 7.2, textColor: rgb(p.ink), cellPadding: { top: 4.5, bottom: 4.5, left: 5, right: 5 }, valign: 'middle' },
        alternateRowStyles: { fillColor: rgb(p.cream) },
        columnStyles: { 0: { cellWidth: 22, halign: 'center' }, 2: { cellWidth: 40, halign: 'right' }, 3: { cellWidth: 44 }, 4: { cellWidth: 74, halign: 'right' }, 5: { cellWidth: 82, halign: 'right', fontStyle: 'bold' } },
        didParseCell: (d) => { if (d.section === 'head' && d.column.index >= 4) d.cell.styles.halign = 'right'; if (d.section === 'head' && d.column.index === 2) d.cell.styles.halign = 'right'; },
        didDrawCell: (d) => { if (d.section === 'body') { setDraw(doc, p.rule); doc.setLineWidth(0.5); doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height); } }
      });
      y = doc.lastAutoTable.finalY + 10;
    }
    const tr = [{ label: 'Subtotal', value: pm(t.subtotal) }];
    if (t.discount) tr.push({ label: 'Discount' + (q.discount?.type === 'percent' ? ` (${q.discount.value}%)` : ''), value: '− ' + pm(t.discount), color: p.maroon });
    for (const c of q.charges || []) if (Number(c.amount)) tr.push({ label: c.label || 'Additional charge', value: pm(c.amount) });
    for (const tl of t.taxLines) tr.push({ label: `${tl.name} @ ${tl.rate}%`, value: pm(tl.amount) });
    if (t.roundOff) tr.push({ label: 'Round off', value: (t.roundOff < 0 ? '− ' : '') + pm(Math.abs(t.roundOff)) });
    tr.push({ label: 'ESTIMATED TOTAL', value: pm(t.grandTotal), highlight: true });
    y = totalsBlock(doc, s, y, tr);
    doc.setFont('Noto', 'italic'); doc.setFontSize(6.8); setText(doc, p.navy);
    const words = doc.splitTextToSize(amountInWords(t.grandTotal), CW);
    y = ensureSpace(doc, y, 24);
    doc.text(words, R, y + 2, { align: 'right' });
    y += words.length * 9 + 4;
    if (q.package?.enabled && ev.guests) {
      doc.setFont('Noto', 'normal'); doc.setFontSize(6.6); setText(doc, p.grey);
      doc.text(`Estimate based on ${ev.guests} guests. Final bill will reflect the actual confirmed count.`, R, y + 2, { align: 'right' });
      y += 12;
    }
  }

  // ---- Inclusions / Exclusions / Terms ----
  y += 4;
  const half = (CW - 20) / 2;
  const hInc = measureBlock(doc, q.inclusions, half);
  const hExc = measureBlock(doc, q.exclusions, half);
  if (hInc || hExc) {
    const need = Math.max(hInc, hExc);
    if (need < 260) {
      // side by side on one page
      y = ensureSpace(doc, y, need);
      const yA = textBlock(doc, s, y, 'Inclusions', q.inclusions, { x: L, width: half, color: p.green });
      const yB = textBlock(doc, s, y, 'Exclusions', q.exclusions, { x: L + half + 20, width: half, color: p.maroon });
      y = Math.max(yA, yB);
    } else {
      y = textBlock(doc, s, y, 'Inclusions', q.inclusions, { color: p.green });
      y = textBlock(doc, s, y, 'Exclusions', q.exclusions, { color: p.maroon });
    }
  }
  y = textBlock(doc, s, y, 'Terms & Conditions', q.terms, { color: p.navy });
  if ((q.notes || '').trim()) y = textBlock(doc, s, y, 'Notes', q.notes, { color: p.navy });

  // ---- Closing & acceptance ----
  y = ensureSpace(doc, y, 92);
  y += 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.2); setText(doc, p.gold);
  if (s.closingLine) { spaced(doc, s.closingLine, PAGE.W / 2, y + 6, { space: 0.4 }); y += 12; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.4); setText(doc, p.navy);
  spaced(doc, [s.brandLine1, s.brandLine2].filter(Boolean).join(' '), PAGE.W / 2, y + 6, { space: 0.3 });
  y += 36;
  setDraw(doc, p.navy); doc.setLineWidth(0.5);
  doc.line(L, y, L + 160, y); doc.line(R - 160, y, R, y);
  doc.setFont('Noto', 'normal'); doc.setFontSize(6.6); setText(doc, p.grey);
  doc.text('Accepted by client (signature & date)', L, y + 9);
  doc.text('Authorised Signatory', R, y + 9, { align: 'right' });

  finishPages(doc, s, { docNo: `Quotation ${q.number} • ${fmtDate(q.quoteDate)}` });
  return doc;
}

function measureBlock(doc, text, width) {
  const items = String(text || '').split('\n').map((t) => t.trim()).filter(Boolean);
  if (!items.length) return 0;
  doc.setFont('Noto', 'normal'); doc.setFontSize(7);
  return 22 + items.reduce((a, t) => a + doc.splitTextToSize(t, width - 12).length * 9 + 2, 0);
}
