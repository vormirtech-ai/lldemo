import {
  newDoc, autoTable, PAGE, L, R, CW, TOP, BOTTOM, rgb, setText, setDraw, setFill, palette, spaced,
  drawBrandHeader, finishPages, ensureSpace, totalsBlock, textBlock, pm
} from './common.js';
import { groupLines } from './groups.js';
import { computeTotals, paymentSummary } from '../calc.js';
import { longDate, fmtDate, fmtTime, displayPhone, qtyFmt, amountInWords } from '../format.js';

// FINAL BILL / TAX INVOICE — what was actually charged, with payments and balance.
export async function buildInvoicePdf(inv, payments, s) {
  const p = palette(s);
  const title = (inv.title || s.invoiceTitle || 'FINAL BILL').toUpperCase();
  const number = inv.number || 'DRAFT';
  const doc = await newDoc({ title: `${title} ${number} - ${inv.client?.name || ''}`, author: [s.brandLine1, s.brandLine2].filter(Boolean).join(' ') });
  const ev = inv.event || {};
  let y = drawBrandHeader(doc, s);

  // Heading
  doc.setFont('times', 'bold'); doc.setFontSize(23); setText(doc, p.navy);
  doc.text(title, PAGE.W / 2, y + 16, { align: 'center' });
  y += 24;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.2); setText(doc, p.maroon);
  spaced(doc, `BILL NO. ${number}   •   DATE ${fmtDate(inv.invoiceDate).replace(/-/g, '.')}`, PAGE.W / 2, y + 4, { space: 0.8 });
  y += 16;

  // Bill-to / details boxes
  const colW = (CW - 12) / 2;
  const leftRows = [
    ['Name', inv.client?.name || ''],
    ['Mobile', displayPhone(inv.client?.whatsapp || inv.client?.phone)],
    ...(inv.client?.address ? [['Address', inv.client.address]] : []),
    ...(inv.client?.gstin ? [['GSTIN', inv.client.gstin]] : [])
  ];
  const rightRows = [
    ['Bill No.', number],
    ['Bill Date', longDate(inv.invoiceDate)],
    ...(inv.dueDate ? [['Due Date', longDate(inv.dueDate)]] : []),
    ...(inv.quotationNumber ? [['Ref. Quotation', inv.quotationNumber]] : [])
  ];
  const boxTop = y;
  const drawBox = (x, heading, rows) => {
    setFill(doc, p.navy); doc.rect(x, boxTop, colW, 15, 'F');
    doc.setFont('Noto', 'bold'); doc.setFontSize(6.6); setText(doc, '#FFFFFF');
    doc.setCharSpace(0.6); doc.text(heading, x + 7, boxTop + 10); doc.setCharSpace(0);
    autoTable(doc, {
      startY: boxTop + 15, margin: { left: x, right: PAGE.W - (x + colW) }, tableWidth: colW, body: rows, theme: 'plain',
      styles: { font: 'Noto', fontSize: 7, textColor: rgb(p.ink), cellPadding: { top: 3, bottom: 3, left: 7, right: 6 } },
      columnStyles: { 0: { cellWidth: 62, textColor: rgb(p.grey) }, 1: { fontStyle: 'bold', textColor: rgb(p.navy) } }
    });
    return doc.lastAutoTable.finalY;
  };
  const yl = drawBox(L, 'BILLED TO', leftRows);
  const yr = drawBox(L + colW + 12, 'BILL DETAILS', rightRows);
  const boxBottom = Math.max(yl, yr) + 4;
  setDraw(doc, p.navy); doc.setLineWidth(0.6);
  doc.rect(L, boxTop, colW, boxBottom - boxTop);
  doc.rect(L + colW + 12, boxTop, colW, boxBottom - boxTop);
  y = boxBottom + 10;

  // Event strip
  const evBits = [
    ev.type || ev.menuTitle ? ['EVENT', (ev.type || ev.menuTitle || '').toUpperCase()] : null,
    ev.date ? ['DATE', longDate(ev.date).toUpperCase() + (ev.time ? ' • ' + fmtTime(ev.time) : '')] : null,
    ev.venue ? ['VENUE', ev.venue.toUpperCase()] : null,
    ev.guests ? ['GUESTS', `${ev.guests} PAX`] : null
  ].filter(Boolean);
  if (evBits.length) {
    autoTable(doc, {
      startY: y, margin: { left: L, right: PAGE.W - R }, theme: 'grid',
      body: [evBits.flat()],
      styles: { font: 'Noto', fontSize: 6.6, textColor: rgb(p.navy), lineColor: rgb(p.rule), lineWidth: 0.6, cellPadding: 4.5, fillColor: rgb(p.cream), valign: 'middle' },
      didParseCell: (d) => { if (d.column.index % 2 === 0) { d.cell.styles.fillColor = rgb(p.navy); d.cell.styles.textColor = [255, 255, 255]; d.cell.styles.fontStyle = 'bold'; d.cell.styles.fontSize = 6; } }
    });
    y = doc.lastAutoTable.finalY + 12;
  }

  // Item table grouped by category
  const body = [];
  let i = 1;
  // Compact layout: when a per-plate package is billed, dishes included in it are
  // summarised under the package line instead of being listed as ₹0 rows.
  const compact = inv.package?.enabled && !inv.listIncluded;
  const included = (inv.lines || []).filter((l) => !(Number(l.rate) > 0));
  const shownLines = compact ? (inv.lines || []).filter((l) => Number(l.rate) > 0) : inv.lines || [];
  if (inv.package?.enabled) {
    let label = inv.package.label || 'Per-plate menu package';
    if (compact && included.length) label += '\nIncludes: ' + included.map((l) => l.name).join(', ');
    body.push({ kind: 'item', cells: [i++, label, qtyFmt(inv.package.pax), 'Pax', pm(inv.package.rate), pm((Number(inv.package.pax) || 0) * (Number(inv.package.rate) || 0))], pkg: compact && included.length > 0 });
  }
  for (const g of groupLines(shownLines)) {
    body.push({ kind: 'group', cells: [{ content: g.name, colSpan: 6 }], accent: g.accent });
    for (const l of g.lines) {
      const amt = Number(l.qty) * Number(l.rate);
      const name = l.name + (l.note ? `  (${l.note})` : '') + (inv.showDescriptions && l.description ? `\n${l.description}` : '');
      body.push({ kind: 'item', cells: [i++, name, qtyFmt(l.qty), l.unit || '', Number(l.rate) > 0 ? pm(l.rate) : 'Incl.', Number(l.rate) > 0 ? pm(amt) : '—'] });
    }
  }
  autoTable(doc, {
    startY: y,
    margin: { left: L, right: PAGE.W - R, top: TOP, bottom: PAGE.H - BOTTOM },
    head: [['#', 'ITEM / SERVICE', 'QTY', 'UNIT', 'RATE', 'AMOUNT']],
    body: body.map((b) => b.cells),
    theme: 'plain',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    headStyles: { font: 'Noto', fontStyle: 'bold', fontSize: 6.6, fillColor: rgb(p.navy), textColor: [255, 255, 255], cellPadding: 5 },
    styles: { font: 'Noto', fontSize: 7.2, textColor: rgb(p.ink), cellPadding: { top: 4.2, bottom: 4.2, left: 5, right: 5 }, valign: 'middle' },
    columnStyles: { 0: { cellWidth: 22, halign: 'center' }, 2: { cellWidth: 40, halign: 'right' }, 3: { cellWidth: 46 }, 4: { cellWidth: 72, halign: 'right' }, 5: { cellWidth: 82, halign: 'right', fontStyle: 'bold' } },
    didParseCell: (d) => {
      if (d.section === 'head' && [2, 4, 5].includes(d.column.index)) d.cell.styles.halign = 'right';
      if (d.section === 'body') {
        const meta = body[d.row.index];
        if (meta?.pkg && d.column.index === 1) d.cell.styles.fontSize = 6.6;
        if (meta?.kind === 'group') {
          d.cell.styles.fillColor = rgb(p.cream);
          d.cell.styles.font = 'times'; d.cell.styles.fontStyle = 'bolditalic'; d.cell.styles.fontSize = 9;
          d.cell.styles.textColor = rgb(meta.accent || p.navy);
          d.cell.styles.halign = 'left';
        }
      }
    },
    didDrawCell: (d) => {
      if (d.section !== 'body') return;
      setDraw(doc, p.rule); doc.setLineWidth(0.5);
      doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height);
      const meta = body[d.row.index];
      if (meta?.kind === 'group' && d.column.index === 0) { doc.setFillColor(...rgb(meta.accent || p.navy)); doc.rect(d.cell.x, d.cell.y, 2.3, d.cell.height, 'F'); }
    }
  });
  y = doc.lastAutoTable.finalY + 10;

  // Totals
  const t = computeTotals(inv);
  const tr = [{ label: 'Subtotal', value: pm(t.subtotal) }];
  if (t.discount) tr.push({ label: 'Discount' + (inv.discount?.type === 'percent' ? ` (${inv.discount.value}%)` : ''), value: '− ' + pm(t.discount), color: p.maroon });
  for (const c of inv.charges || []) if (Number(c.amount)) tr.push({ label: c.label || 'Additional charge', value: pm(c.amount) });
  if (t.taxLines.length) tr.push({ label: 'Taxable value', value: pm(t.taxable) });
  for (const tl of t.taxLines) tr.push({ label: `${tl.name} @ ${tl.rate}%`, value: pm(tl.amount) });
  if (t.roundOff) tr.push({ label: 'Round off', value: (t.roundOff < 0 ? '− ' : '') + pm(Math.abs(t.roundOff)) });
  tr.push({ label: 'GRAND TOTAL', value: pm(t.grandTotal), highlight: true });
  y = totalsBlock(doc, s, y, tr);
  doc.setFont('Noto', 'italic'); doc.setFontSize(6.8); setText(doc, p.navy);
  y = ensureSpace(doc, y, 14);
  doc.text(doc.splitTextToSize(amountInWords(t.grandTotal), CW), R, y + 2, { align: 'right' });
  y += 16;

  // Payment summary
  const live = (payments || []).filter((x) => !x.voided).sort((a, b) => (a.date > b.date ? 1 : -1));
  const ps = paymentSummary(t.grandTotal, live);
  y = ensureSpace(doc, y, 60 + live.length * 16);
  doc.setFont('times', 'bolditalic'); doc.setFontSize(13); setText(doc, p.navy);
  doc.text('Payment Summary', L, y + 10);
  y += 16;
  if (live.length) {
    autoTable(doc, {
      startY: y, margin: { left: L, right: PAGE.W - R, top: TOP, bottom: PAGE.H - BOTTOM },
      head: [['DATE', 'METHOD', 'REFERENCE / NOTE', 'AMOUNT']],
      body: live.map((x) => [fmtDate(x.date), x.method, [x.reference, x.notes].filter(Boolean).join(' • '), pm(x.amount)]),
      theme: 'plain',
      headStyles: { font: 'Noto', fontStyle: 'bold', fontSize: 6.4, fillColor: rgb(p.cream), textColor: rgb(p.navy), cellPadding: 4.5 },
      styles: { font: 'Noto', fontSize: 7, textColor: rgb(p.ink), cellPadding: 4 },
      columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 70 }, 3: { cellWidth: 90, halign: 'right' } },
      didParseCell: (d) => { if (d.section === 'head' && d.column.index === 3) d.cell.styles.halign = 'right'; },
      didDrawCell: (d) => { setDraw(doc, p.rule); doc.setLineWidth(0.5); doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height); }
    });
    y = doc.lastAutoTable.finalY + 8;
  } else {
    doc.setFont('Noto', 'normal'); doc.setFontSize(7); setText(doc, p.grey);
    doc.text('No payments received yet.', L, y + 6);
    y += 14;
  }
  y = ensureSpace(doc, y, 64);
  const boxW = 236, bx = R - boxW;
  doc.setFont('Noto', 'normal'); doc.setFontSize(7.4); setText(doc, p.navy);
  doc.text('Total Paid', bx + 8, y + 10); doc.text(pm(ps.paid), R - 8, y + 10, { align: 'right' });
  setDraw(doc, p.rule); doc.line(bx, y + 15, R, y + 15);
  y += 18;
  const settled = ps.balance <= 0;
  setFill(doc, settled ? p.green : p.maroon); doc.rect(bx, y, boxW, 22, 'F');
  doc.setFont('Noto', 'bold'); doc.setFontSize(8.6); setText(doc, '#FFFFFF');
  doc.text(settled ? (ps.balance < 0 ? 'EXCESS PAID' : 'PAID IN FULL') : 'BALANCE DUE', bx + 8, y + 14.5);
  doc.text(pm(Math.abs(ps.balance)), R - 8, y + 14.5, { align: 'right' });
  // status stamp on the left
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); setText(doc, settled ? p.green : p.maroon);
  setDraw(doc, settled ? p.green : p.maroon); doc.setLineWidth(1.2);
  const stamp = settled ? 'PAID' : ps.paid > 0 ? 'PARTIALLY PAID' : 'UNPAID';
  const sw = doc.getTextWidth(stamp) + stamp.length * 0.8 + 18;
  doc.roundedRect(L, y - 6, sw, 22, 3, 3);
  doc.setCharSpace(0.8); doc.text(stamp, L + 9, y + 8.5); doc.setCharSpace(0);
  y += 34;

  // Bank / UPI
  const payInfo = [s.bankDetails, s.upiId ? 'UPI: ' + s.upiId : ''].filter(Boolean).join('\n');
  if (payInfo && !settled) y = textBlock(doc, s, y, 'Payment Details', payInfo, { color: p.green });
  y = textBlock(doc, s, y, 'Terms', inv.terms, { color: p.navy });
  if ((inv.notes || '').trim()) y = textBlock(doc, s, y, 'Notes', inv.notes, { color: p.navy });

  // Signature
  y = ensureSpace(doc, y, 54);
  y += 4;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.2); setText(doc, p.gold);
  if (s.closingLine) spaced(doc, s.closingLine, L + 120, y + 6, { space: 0.4 });
  doc.setFont('Noto', 'bold'); doc.setFontSize(7.4); setText(doc, p.navy);
  doc.text('For ' + [s.brandLine1, s.brandLine2].filter(Boolean).join(' '), R, y + 6, { align: 'right' });
  y += 34;
  setDraw(doc, p.navy); doc.setLineWidth(0.5); doc.line(R - 160, y, R, y);
  doc.setFont('Noto', 'normal'); doc.setFontSize(6.6); setText(doc, p.grey);
  doc.text('Authorised Signatory', R, y + 9, { align: 'right' });
  if (s.gstin && title.includes('TAX')) doc.text('This is a computer-generated invoice.', L, y + 9);

  const watermark = inv.status === 'Void' ? 'VOID' : inv.status === 'Draft' ? 'DRAFT' : '';
  finishPages(doc, s, { docNo: `${title} ${number}`, watermark });
  return doc;
}
