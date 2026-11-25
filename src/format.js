// Formatting helpers: Indian currency, dates, amount in words.

const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (v) => '₹' + inr.format(Number(v) || 0);
export const num = (v) => inr.format(Number(v) || 0);
export const qtyFmt = (v) => {
  const n = Number(v) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function addDaysISO(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + Number(days || 0));
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// format: 'DD-MM-YYYY' | 'DD/MM/YYYY' | 'D MMMM YYYY' | 'YYYY-MM-DD'
export function fmtDate(iso, format = 'DD-MM-YYYY') {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return String(iso);
  switch (format) {
    case 'DD/MM/YYYY': return `${d}/${m}/${y}`;
    case 'D MMMM YYYY': return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
    case 'YYYY-MM-DD': return `${y}-${m}-${d}`;
    default: return `${d}-${m}-${y}`;
  }
}
export const longDate = (iso) => fmtDate(iso, 'D MMMM YYYY');
export const fmtDateTime = (ts) => {
  const d = new Date(ts);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// 24h "20:00" -> "8:00 PM"
export function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return t;
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m || 0).padStart(2, '0')} ${ap}`;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function two(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''); }
function three(n) {
  const h = Math.floor(n / 100), r = n % 100;
  return (h ? ONES[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? two(r) : '');
}
function intWords(n) {
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(intWords(crore) + ' Crore');
  if (lakh) parts.push(two(lakh) + ' Lakh');
  if (thousand) parts.push(two(thousand) + ' Thousand');
  if (n) parts.push(three(n));
  return parts.join(' ');
}
export function amountInWords(v) {
  const total = Math.round(Math.abs(Number(v) || 0) * 100);
  const rupees = Math.floor(total / 100), paise = total % 100;
  let s = 'Rupees ' + intWords(rupees);
  if (paise) s += ' and ' + two(paise) + ' Paise';
  return s + ' Only';
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));

export function normalizePhone(p, cc = '91') {
  let d = String(p || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = cc + d;
  return d;
}
export function displayPhone(p) {
  const d = normalizePhone(p);
  if (!d) return '';
  if (d.length === 12 && d.startsWith('91')) return '+91 ' + d.slice(2);
  return '+' + d;
}
