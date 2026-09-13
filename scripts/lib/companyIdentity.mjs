import { normalizeCompanyAddress } from '../../src/utils/companyAddressMatch.js';

const missing = /^(?:[-ー―/・*?]+|不明|なし|無し|未登録|未確認|未記入|非公開|null|undefined|n\/?a|代表者|代表取締役|社長|個人)$/i;
export function identityText(value) {
  const text = String(value ?? '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  return !text || missing.test(text) ? '' : text;
}
export function identityName(value) {
  return identityText(value).replace(/株式会社|\(株\)|有限会社|\(有\)|合同会社|\(同\)|合資会社|\(資\)|合名会社|\(名\)|一般社団法人|一般財団法人|公益社団法人|公益財団法人|医療法人社団|医療法人|社会福祉法人|特定非営利活動法人|npo法人/g, '');
}
export function identityPhone(value) {
  const raw = identityText(value);
  if (!raw || /[\/／,、;]/.test(raw)) return '';
  const number = raw.replace(/^\+81(?:\(0\))?/, '0').replace(/[-()‐‑‒–—―−ー]/g, '');
  return /^0[0-9]{9,10}$/.test(number) && !/^0{5}/.test(number) ? number : '';
}
export function identityAddress(value) {
  const text = normalizeCompanyAddress(value);
  return /^(北海道|東京都|京都府|大阪府|.{2,3}県)/.test(text)
    && /[0-9]|無番地|番地なし/.test(text)
    && !/(丁目|市|区|町|村)$/.test(text)
    && !/[*●○?]|以下不明|番地不明/.test(text) ? text : '';
}
export function corporateNumber(value) {
  const n = identityText(value).replace(/-/g, '');
  if (!/^[1-9][0-9]{12}$/.test(n)) return '';
  const sum = [...n.slice(1)].reverse().reduce((total, d, i) => total + Number(d) * (i % 2 ? 2 : 1), 0);
  return Number(n[0]) === 9 - sum % 9 ? n : '';
}
export function parseObject(value) {
  try { const result = typeof value === 'string' ? JSON.parse(value) : value;
    return result && typeof result === 'object' && !Array.isArray(result) ? result : {};
  } catch { return {}; }
}
export function prepareIdentity(row, source) {
  const memo = parseObject(source === 'master' ? row.remarks : row.memo);
  const numbers = [...new Set(Object.entries(memo)
    .filter(([key]) => /^(法人番号|corporate_number|corporatenumber)$/i.test(identityText(key)))
    .map(([, value]) => corporateNumber(value)).filter(Boolean))];
  // A conflict inside one imported record is not evidence for either number.
  const corp = numbers.length === 1 ? numbers[0] : '';
  const name = identityName(row.company_name ?? row.company);
  const representative = identityText(row.representative).replace(/^(?:代表取締役社長|代表取締役|取締役社長|代表社員|代表者|社長)[:：]?/, '');
  const phone = identityPhone(row.phone);
  const rawAddress = source === 'master'
    ? row.full_address || [row.prefecture, row.city, row.address].filter(Boolean).join('')
    : row.address;
  const address = identityAddress(rawAddress);
  return { id: row.id, source, name, representative, phone, address, corp,
    invalidCorp: Object.entries(memo).some(([key, value]) => /^(法人番号|corporate_number|corporatenumber)$/i.test(identityText(key)) && identityText(value) && !corporateNumber(value)),
    conflictedCorp: numbers.length > 1,
    archived: !!row.is_archived,
  };
}

class Union {
  constructor(size) { this.parent = Int32Array.from({ length: size }, (_, i) => i); this.rank = new Uint8Array(size); }
  find(i) { let root = i; while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[i] !== i) { const next = this.parent[i]; this.parent[i] = root; i = next; } return root; }
  join(a,b) { a=this.find(a); b=this.find(b); if(a===b)return;
    if(this.rank[a]<this.rank[b]) [a,b]=[b,a]; this.parent[b]=a;
    if(this.rank[a]===this.rank[b])this.rank[a]++; }
}

// Corporate number OR name+representative/phone/full address. Name alone never joins.
// A connected group with contradictory corporate numbers is held for review. For
// the conservative count, only equal-number rows in that group can be joined.
export function auditIdentities(rows) {
  const candidate = new Union(rows.length);
  const evidence = {};
  for (const field of ['corp', 'phone', 'address', 'representative']) {
    const seen = new Map();
    let matchedRows = 0;
    rows.forEach((row,i) => {
      if(!row[field] || (field!=='corp' && !row.name))return;
      const key=field==='corp' ? row.corp : row.name+'\u0000'+row[field];
      if(seen.has(key)){candidate.join(i,seen.get(key));matchedRows++;}else seen.set(key,i);
    });
    evidence[field]={matchedRows,keys:seen.size};
  }
  const groupCorp=new Map(), conflicts=new Set();
  rows.forEach((row,i)=>{
    if(!row.corp)return;
    const root=candidate.find(i), first=groupCorp.get(root);
    if(first && first!==row.corp)conflicts.add(root);else groupCorp.set(root,row.corp);
  });
  const conservative=new Union(rows.length), firstByGroup=new Map(), sameCorp=new Map();
  rows.forEach((row,i)=>{
    const root=candidate.find(i);
    if(conflicts.has(root)){
      if(row.corp){if(sameCorp.has(row.corp))conservative.join(i,sameCorp.get(row.corp));else sameCorp.set(row.corp,i);}
    }else if(firstByGroup.has(root))conservative.join(i,firstByGroup.get(root));else firstByGroup.set(root,i);
  });
  const groups=new Map(), candidateGroups=new Set();
  let conflictRows=0, insufficient=0;
  rows.forEach((row,i)=>{
    const c=candidate.find(i);candidateGroups.add(c);if(conflicts.has(c))conflictRows++;
    if(!row.corp && (!row.name || !(row.representative || row.phone || row.address)))insufficient++;
    const root=conservative.find(i);
    if(!groups.has(root))groups.set(root,{master:0,calls:0,activeCalls:0});
    const group=groups.get(root);group[row.source]++;if(row.source==='calls'&&!row.archived)group.activeCalls++;
  });
  let masterOnly=0,callsOnly=0,shared=0,activeCalls=0;
  for(const g of groups.values()){
    if(g.master&&g.calls)shared++;else if(g.master)masterOnly++;else callsOnly++;
    if(g.activeCalls)activeCalls++;
  }
  return {rows:rows.length,unique:groups.size,candidateUnique:candidateGroups.size,
    masterOnly,callsOnly,shared,masterPresent:masterOnly+shared,callsPresent:callsOnly+shared,activeCalls,
    conflictGroups:conflicts.size,conflictRows,insufficient,evidence};
}
