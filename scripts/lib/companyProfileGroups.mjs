import { companyLegalForm } from '../../src/utils/companyProfileIdentity.js';

class Union {
  constructor(size) { this.parent = Int32Array.from({ length: size }, (_, i) => i); this.rank = new Uint8Array(size); }
  find(i) { let r = i; while (this.parent[r] !== r) r = this.parent[r];
    while (this.parent[i] !== i) { const n = this.parent[i]; this.parent[i] = r; i = n; } return r; }
  join(a, b) { a = this.find(a); b = this.find(b); if (a === b) return;
    if (this.rank[a] < this.rank[b]) [a, b] = [b, a]; this.parent[b] = a;
    if (this.rank[a] === this.rank[b]) this.rank[a]++; }
}

export function identityKeys(row) {
  const keys = [];
  if (row.corp) keys.push(['corp', row.corp]);
  if (row.name) for (const field of ['phone', 'address', 'representative']) {
    if (row[field]) keys.push([field, row.name + '\u001f' + row[field]]);
  }
  return keys;
}

// Keep source rows separate. Conflicting corporate numbers/legal forms or an
// internally contradictory identifier cannot silently share company facts.
export function buildProfileGroups(rows) {
  const candidate = new Union(rows.length), seen = new Map();
  rows.forEach((row, i) => {
    for (const [kind, value] of identityKeys(row)) {
      const key = kind + '\u001f' + value;
      if (seen.has(key)) candidate.join(i, seen.get(key)); else seen.set(key, i);
    }
  });
  const candidates = new Map();
  rows.forEach((row, i) => {
    const root = candidate.find(i);
    if (!candidates.has(root)) candidates.set(root, { indices: [], corporations: new Set(), forms: new Set(), internalConflict: false });
    const group = candidates.get(root); group.indices.push(i);
    if (row.corp) group.corporations.add(row.corp);
    const form = row.legalForm ?? companyLegalForm(row.rawName);
    if (form) group.forms.add(form);
    if (row.conflictedCorp) group.internalConflict = true;
  });
  const final = new Union(rows.length), reviews = [];
  for (const group of candidates.values()) {
    const everyRowHasSameNumber = group.corporations.size === 1 && group.indices.every(i => !!rows[i].corp);
    const conflicting = group.internalConflict || group.corporations.size > 1
      || (group.forms.size > 1 && !everyRowHasSameNumber);
    if (!conflicting) {
      for (const i of group.indices.slice(1)) final.join(group.indices[0], i);
    } else {
      const numbers = new Map();
      for (const i of group.indices) if (rows[i].corp && !rows[i].conflictedCorp) {
        if (numbers.has(rows[i].corp)) final.join(i, numbers.get(rows[i].corp)); else numbers.set(rows[i].corp, i);
      }
      reviews.push({ indices: group.indices, reason: group.corporations.size > 1 || group.internalConflict ? '法人番号の矛盾' : '法人格の相違' });
    }
  }
  const groups = new Map();
  rows.forEach((_, i) => { const root = final.find(i); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(i); });
  return { groups: [...groups.values()], reviews, roots: Int32Array.from(rows, (_, i) => final.find(i)) };
}
