// Group document lines by category (in catalogue order) and diet.
export function groupLines(lines) {
  const map = new Map();
  for (const l of lines || []) {
    const c = l.category || { name: 'Other Items', subtitle: '', accent: '', kind: 'menu', sort: 999 };
    const key = c.name || 'Other Items';
    if (!map.has(key)) map.set(key, { ...c, name: key, lines: [] });
    map.get(key).lines.push(l);
  }
  const groups = [...map.values()].sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999));
  for (const g of groups) {
    const nonveg = g.lines.filter((l) => l.diet === 'nonveg');
    const veg = g.lines.filter((l) => l.diet === 'veg');
    const other = g.lines.filter((l) => l.diet !== 'veg' && l.diet !== 'nonveg');
    g.split = nonveg.length > 0 && veg.length > 0;
    g.parts = g.split
      ? [{ label: 'Non-Vegetarian', lines: nonveg }, { label: 'Vegetarian', lines: veg }, ...(other.length ? [{ label: 'Other', lines: other }] : [])]
      : [{ label: '', lines: g.lines }];
  }
  return groups;
}
