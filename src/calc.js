// Pure money maths. All amounts are handled in paise (integers) internally to
// avoid floating-point drift, and returned as rupees rounded to 2 decimals.

export const toPaise = (v) => Math.round((Number(v) || 0) * 100);
export const fromPaise = (p) => Math.round(p) / 100;
export const r2 = (v) => fromPaise(toPaise(v));

export function lineAmount(line) {
  const qty = Number(line.qty) || 0;
  const rate = Number(line.rate) || 0;
  return fromPaise(Math.round(qty * toPaise(rate)));
}

/**
 * Compute document totals.
 * doc: {
 *   lines: [{qty, rate}],
 *   package: {enabled, rate, pax}        // optional per-plate package price
 *   discount: {type: 'amount'|'percent', value}
 *   charges: [{label, amount}]           // additional charges (taxable)
 *   taxes: [{name, rate}]                // e.g. CGST 2.5, SGST 2.5 — applied on taxable value
 *   applyTax: boolean
 *   roundOff: boolean                    // round grand total to nearest rupee
 * }
 */
export function computeTotals(doc) {
  const lines = doc.lines || [];
  let itemsP = 0;
  for (const l of lines) itemsP += toPaise(lineAmount(l));

  let packageP = 0;
  if (doc.package && doc.package.enabled) {
    packageP = Math.round((Number(doc.package.pax) || 0) * toPaise(doc.package.rate));
  }
  const subtotalP = itemsP + packageP;

  let discountP = 0;
  const d = doc.discount || {};
  if (d.type === 'percent') {
    const pct = Math.min(Math.max(Number(d.value) || 0, 0), 100);
    discountP = Math.round((subtotalP * pct) / 100);
  } else {
    discountP = Math.min(Math.max(toPaise(d.value), 0), subtotalP);
  }

  let chargesP = 0;
  for (const c of doc.charges || []) chargesP += toPaise(c.amount);

  const taxableP = Math.max(subtotalP - discountP + chargesP, 0);

  const taxLines = [];
  let taxP = 0;
  if (doc.applyTax) {
    for (const t of doc.taxes || []) {
      const rate = Number(t.rate) || 0;
      if (!rate) continue;
      const amt = Math.round((taxableP * rate) / 100);
      taxLines.push({ name: t.name, rate, amount: fromPaise(amt) });
      taxP += amt;
    }
  }

  const rawTotalP = taxableP + taxP;
  let roundOffP = 0;
  let grandP = rawTotalP;
  if (doc.roundOff) {
    grandP = Math.round(rawTotalP / 100) * 100;
    roundOffP = grandP - rawTotalP;
  }

  return {
    itemsTotal: fromPaise(itemsP),
    packageTotal: fromPaise(packageP),
    subtotal: fromPaise(subtotalP),
    discount: fromPaise(discountP),
    charges: fromPaise(chargesP),
    taxable: fromPaise(taxableP),
    taxLines,
    tax: fromPaise(taxP),
    roundOff: fromPaise(roundOffP),
    grandTotal: fromPaise(grandP)
  };
}

export function paymentSummary(grandTotal, payments = []) {
  let paidP = 0;
  for (const p of payments) if (!p.voided) paidP += toPaise(p.amount);
  const totalP = toPaise(grandTotal);
  const balanceP = totalP - paidP;
  let status = 'Unpaid';
  if (paidP <= 0) status = 'Unpaid';
  else if (balanceP > 0) status = 'Partially Paid';
  else if (balanceP === 0) status = 'Paid';
  else status = 'Overpaid';
  return { paid: fromPaise(paidP), balance: fromPaise(balanceP), status };
}

// Effective discount percent on a subtotal — used for permission checks.
export function discountPercent(doc, totals) {
  if (!totals.subtotal) return 0;
  return (totals.discount / totals.subtotal) * 100;
}
