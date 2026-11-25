import { jsPDF } from 'jspdf';
import { computeTotals } from '../calc.js';
import { fmtDateTime, qtyFmt } from '../format.js';
import { newDoc } from './common.js';

const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const m = (v) => '₹' + inr.format(Number(v) || 0);

// 80 mm POS receipt for counter orders.
export async function buildReceiptPdf(order, s) {
  const W = 226.77;
  const t = computeTotals(order);
  const height = 210 + order.lines.length * 22 + t.taxLines.length * 12 + (order.payments?.length || 0) * 12;
  // create with fonts loaded, then reset page size
  const base = await newDoc({ title: `Receipt ${order.number}` });
  const doc = base;
  doc.deletePage(1);
  doc.addPage([W, height], 'portrait');
  let y = 22;
  const c = (txt, size = 8, style = 'normal', font = 'Noto') => { doc.setFont(font, style); doc.setFontSize(size); doc.text(txt, W / 2, y, { align: 'center' }); };
  doc.setTextColor(20, 20, 20);
  if (s.brandLine1) { c(s.brandLine1, 13, 'bold', 'times'); y += 13; }
  if (s.brandLine2) { c(s.brandLine2, 9.5, 'bold', 'times'); y += 11; }
  const contact = [s.address, s.phone].filter(Boolean).join(' • ');
  if (contact) { doc.setFont('Noto', 'normal'); doc.setFontSize(6.5); const lines = doc.splitTextToSize(contact, W - 24); doc.text(lines, W / 2, y, { align: 'center' }); y += lines.length * 8; }
  if (s.gstin) { c('GSTIN: ' + s.gstin, 6.5); y += 9; }
  y += 3;
  c('RECEIPT', 9, 'bold'); y += 11;
  doc.setFont('Noto', 'normal'); doc.setFontSize(7);
  doc.text(`No: ${order.number}`, 10, y); doc.text(fmtDateTime(order.paidAt || order.createdAt), W - 10, y, { align: 'right' }); y += 10;
  const type = order.type === 'dine-in' ? `Dine-in${order.tableName ? ' • ' + order.tableName : ''}` : order.type === 'delivery' ? 'Delivery' : order.type === 'takeaway' ? 'Takeaway' : 'Catering';
  doc.text(type, 10, y); if (order.customerName) doc.text(order.customerName, W - 10, y, { align: 'right' }); y += 6;
  const rule = () => { doc.setLineDashPattern([2, 2], 0); doc.setLineWidth(0.5); doc.line(10, y, W - 10, y); doc.setLineDashPattern([], 0); y += 9; };
  rule();
  for (const l of order.lines) {
    doc.setFont('Noto', 'normal'); doc.setFontSize(7.4);
    const name = doc.splitTextToSize(l.name, W - 90);
    doc.text(name, 10, y);
    doc.text(`${qtyFmt(l.qty)} × ${inr.format(l.rate)}`, W - 72, y, { align: 'right' });
    doc.text(inr.format(Number(l.qty) * Number(l.rate)), W - 10, y, { align: 'right' });
    y += name.length * 9;
    if (l.note) { doc.setFontSize(6.4); doc.setTextColor(110); doc.text('  ' + l.note, 10, y); doc.setTextColor(20); y += 8; }
    y += 2;
  }
  rule();
  const row = (label, val, bold) => { doc.setFont('Noto', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 9 : 7.4); doc.text(label, 10, y); doc.text(val, W - 10, y, { align: 'right' }); y += bold ? 13 : 10; };
  row('Subtotal', m(t.subtotal));
  if (t.discount) row('Discount', '− ' + m(t.discount));
  for (const tl of t.taxLines) row(`${tl.name} @ ${tl.rate}%`, m(tl.amount));
  if (t.roundOff) row('Round off', m(t.roundOff));
  row('TOTAL', m(t.grandTotal), true);
  for (const p of order.payments || []) row(`Paid (${p.method})`, m(p.amount));
  y += 4;
  c('Thank you! Visit again.', 7.5, 'italic'); y += 10;
  return doc;
}
