import { describe, it, expect } from 'vitest';
import { computeTotals, paymentSummary, lineAmount } from '../src/calc.js';
import { amountInWords, normalizePhone } from '../src/format.js';

describe('line amounts', () => {
  it('multiplies qty by rate without float drift', () => {
    expect(lineAmount({ qty: 3, rate: 0.1 })).toBe(0.3);
    expect(lineAmount({ qty: 150, rate: 449.99 })).toBe(67498.5);
    expect(lineAmount({ qty: 2.5, rate: 120 })).toBe(300);
  });
});

describe('computeTotals', () => {
  const base = { lines: [{ qty: 150, rate: 400 }, { qty: 10, rate: 55.5 }], charges: [], taxes: [], applyTax: false };

  it('subtotal of lines', () => {
    const t = computeTotals(base);
    expect(t.subtotal).toBe(60555);
    expect(t.grandTotal).toBe(60555);
  });

  it('per-plate package adds pax x rate', () => {
    const t = computeTotals({ lines: [], package: { enabled: true, rate: 650, pax: 150 } });
    expect(t.packageTotal).toBe(97500);
    expect(t.grandTotal).toBe(97500);
  });

  it('percent discount and amount discount', () => {
    expect(computeTotals({ ...base, discount: { type: 'percent', value: 10 } }).discount).toBe(6055.5);
    expect(computeTotals({ ...base, discount: { type: 'amount', value: 555 } }).taxable).toBe(60000);
  });

  it('discount can never exceed subtotal or go negative', () => {
    expect(computeTotals({ ...base, discount: { type: 'amount', value: 999999 } }).grandTotal).toBe(0);
    expect(computeTotals({ ...base, discount: { type: 'percent', value: 150 } }).grandTotal).toBe(0);
    expect(computeTotals({ ...base, discount: { type: 'amount', value: -50 } }).discount).toBe(0);
  });

  it('applies configurable taxes on taxable value incl. charges', () => {
    const t = computeTotals({
      lines: [{ qty: 1, rate: 1000 }], charges: [{ label: 'Transport', amount: 500 }],
      discount: { type: 'amount', value: 100 }, applyTax: true,
      taxes: [{ name: 'CGST', rate: 2.5 }, { name: 'SGST', rate: 2.5 }]
    });
    expect(t.taxable).toBe(1400);
    expect(t.taxLines).toEqual([{ name: 'CGST', rate: 2.5, amount: 35 }, { name: 'SGST', rate: 2.5, amount: 35 }]);
    expect(t.grandTotal).toBe(1470);
  });

  it('taxes ignored when applyTax is false', () => {
    const t = computeTotals({ lines: [{ qty: 1, rate: 1000 }], applyTax: false, taxes: [{ name: 'GST', rate: 18 }] });
    expect(t.tax).toBe(0);
  });

  it('round-off to nearest rupee', () => {
    const t = computeTotals({ lines: [{ qty: 1, rate: 99.5 }], applyTax: true, taxes: [{ name: 'GST', rate: 5 }], roundOff: true });
    // 99.50 + 4.98 = 104.48 -> 104.00
    expect(t.tax).toBe(4.98);
    expect(t.roundOff).toBe(-0.48);
    expect(t.grandTotal).toBe(104);
    const u = computeTotals({ lines: [{ qty: 1, rate: 100.5 }], roundOff: true });
    expect(u.grandTotal).toBe(101);
    expect(u.roundOff).toBe(0.5);
  });
});

describe('payments', () => {
  it('tracks partial, full and overpayment', () => {
    expect(paymentSummary(1000, [])).toEqual({ paid: 0, balance: 1000, status: 'Unpaid' });
    expect(paymentSummary(1000, [{ amount: 300 }, { amount: 200.5 }])).toEqual({ paid: 500.5, balance: 499.5, status: 'Partially Paid' });
    expect(paymentSummary(1000, [{ amount: 600 }, { amount: 400 }]).status).toBe('Paid');
    expect(paymentSummary(1000, [{ amount: 1200 }]).status).toBe('Overpaid');
  });
  it('ignores voided payments', () => {
    expect(paymentSummary(1000, [{ amount: 1000, voided: true }, { amount: 100 }]).paid).toBe(100);
  });
  it('no float drift across many small payments', () => {
    const pays = Array.from({ length: 10 }, () => ({ amount: 0.1 }));
    expect(paymentSummary(1, pays).balance).toBe(0);
  });
});

describe('formatting', () => {
  it('amount in words (Indian system)', () => {
    expect(amountInWords(97500)).toBe('Rupees Ninety Seven Thousand Five Hundred Only');
    expect(amountInWords(12345678.5)).toBe('Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Fifty Paise Only');
    expect(amountInWords(0)).toBe('Rupees Zero Only');
  });
  it('normalises Indian WhatsApp numbers', () => {
    expect(normalizePhone('+91 72761 15888')).toBe('917276115888');
    expect(normalizePhone('07276115888')).toBe('917276115888');
    expect(normalizePhone('7276115888')).toBe('917276115888');
  });
});
