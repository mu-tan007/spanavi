import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { prepareIdentity, identityText, corporateNumber } from './lib/companyIdentity.mjs';
import { buildProfileGroups, identityKeys } from './lib/companyProfileGroups.mjs';
import { comparableSharedAddress, companyLegalForm } from '../src/utils/companyProfileIdentity.js';
import { getRepresentativeAddressEntries } from '../src/utils/companyAddressMatch.js';

const dir = process.argv[2], org = process.argv[3];
if (!dir || !org) throw new Error('Usage: node prepare-company-crm-seed.mjs SNAPSHOT_DIR ORG_ID');
const read = file => readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
const idFor = text => { const h = createHash('sha256').update(text).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`; };
const rows = [], byKey = new Map(), facts = [];
const stats = { sourceAttachment: { attached: 0, unmatched: 0, ambiguous: 0, rejectedRepresentative: 0 }, lists: {} };
for (const [file, source] of [['company_master.jsonl', 'master'], ['call_list_items.jsonl', 'calls']]) {
  for await (const line of read(path.join(dir, file))) {
    const raw = JSON.parse(line), identity = prepareIdentity(raw, source);
    const rawAddress = source === 'master' ? raw.full_address || `${raw.prefecture || ''}${raw.address || ''}` : raw.address;
    const row = { ...identity, rawName: raw.company_name || raw.company || '', legalForm: companyLegalForm(raw.company_name || raw.company),
      address: comparableSharedAddress(rawAddress), rawAddress: rawAddress || '', rawRepresentative: raw.representative || '',
      rawPhone: raw.phone || '', business: raw.business_description || raw.business || '', industry: raw.industry_sub || raw.industry_major || '',
      sourceFile: raw.source_file || raw.list_name || '', listId: raw.list_id || null, no: raw.no ?? null, homeFacts: [] };
    const i = rows.length; rows.push(row);
    if (source === 'master') for (const [kind, value] of identityKeys(row)) {
      const key = kind + '\u001f' + value;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(i);
    }
    for (const [key, value] of getRepresentativeAddressEntries({ memo: source === 'master' ? raw.remarks : raw.memo })) {
      if (typeof value !== 'string' || !identityText(value)) continue;
      const fact = { rowIndex: i, field: 'representative_address', value, normalized: comparableSharedAddress(value),
        representativeKey: row.representative, source: { kind: source === 'master' ? 'master' : 'call_list',
          label: row.sourceFile, record_id: String(row.id), record_key: `${source}:${row.id}`, field: key }, sourceKey: `${source}:${row.id}:${key}` };
      facts.push(fact); row.homeFacts.push(fact);
    }
    if (row.corp) facts.push({ rowIndex: i, field: 'corporate_number', value: row.corp, normalized: row.corp,
      representativeKey: '', source: { kind: source, label: row.sourceFile, record_id: String(row.id), record_key: `${source}:${row.id}`, field: 'corporate_number' }, sourceKey: `${source}:${row.id}:corporate_number` });
  }
  console.log(JSON.stringify({ loaded: source, rows: rows.length }));
}
// An original workbook row may enrich only an existing, corroborated DB identity.
// Extra worksheets do not silently create companies or override a different CEO.
for await (const line of read(path.join(dir, 'original-company-facts.jsonl'))) {
  const raw = JSON.parse(line), identity = prepareIdentity(raw, 'master');
  identity.address = comparableSharedAddress(raw.full_address); identity.corp = corporateNumber(raw.corporate_number);
  const candidates = new Set();
  for (const [kind, value] of identityKeys(identity)) for (const i of byKey.get(kind + '\u001f' + value) || []) {
    const row = rows[i];
    if (row.sourceFile !== raw.source_file) continue;
    const form = companyLegalForm(raw.company_name);
    if (form && row.legalForm && form !== row.legalForm) continue;
    candidates.add(i);
  }
  if (!candidates.size) { stats.sourceAttachment.unmatched++; continue; }
  const matched = [...candidates];
  // Duplicate copies of the exact same identity are okay. Otherwise hold the fact.
  const distinct = new Set(matched.map(i => JSON.stringify([rows[i].name, rows[i].representative, rows[i].phone, rows[i].address])));
  if (distinct.size > 1) { stats.sourceAttachment.ambiguous++; continue; }
  stats.sourceAttachment.attached++;
  for (const i of matched) {
    const row = rows[i], source = { kind: 'original_file', label: raw.source_file, sheet: raw.source_sheet, row: raw.source_row, master_id: String(row.id) };
    const sourceKey = `${raw.source_file}:${raw.source_sheet}:${raw.source_row}:${row.id}`;
    if (identity.corp) {
      if (row.corp && row.corp !== identity.corp) { row.conflictedCorp = true; row.corp = ''; }
      else if (!row.conflictedCorp) row.corp = identity.corp;
      facts.push({ rowIndex: i, field: 'corporate_number', value: raw.corporate_number, normalized: identity.corp,
        representativeKey: '', source, sourceKey: sourceKey + ':corporate_number' });
    }
    if (raw.representative_address) {
      const fact = { rowIndex: i, field: 'representative_address', value: raw.representative_address,
        normalized: comparableSharedAddress(raw.representative_address), representativeKey: identity.representative,
        source, sourceKey: sourceKey + ':representative_address' };
      facts.push(fact); row.homeFacts.push(fact);
      if (identity.representative !== row.representative) stats.sourceAttachment.rejectedRepresentative++;
    }
  }
}
byKey.clear();
const { groups, reviews } = buildProfileGroups(rows);
const reviewIndices = new Set(reviews.flatMap(r => r.indices)), rowProfiles = new Array(rows.length);
const profiles = [];
for (const indices of groups) {
  indices.sort((a,b) => (rows[a].source === 'master' ? 0 : 1) - (rows[b].source === 'master' ? 0 : 1)
    || String(rows[a].id).localeCompare(String(rows[b].id), 'en', { numeric: true }));
  const preferred = rows[indices[0]], profileId = idFor(`${org}:${preferred.source}:${preferred.id}`);
  const choose = key => indices.map(i => rows[i][key]).find(Boolean) || '';
  const representativeKey = choose('representative');
  const homeFacts = indices.flatMap(i => rows[i].homeFacts).filter(f => f.normalized && f.representativeKey && f.representativeKey === representativeKey);
  const homes = [...new Set(homeFacts.map(f => f.normalized))];
  const home = homes.length === 1 ? homeFacts[0] : null;
  const masterCount = indices.filter(i => rows[i].source === 'master').length;
  const listCount = new Set(indices.map(i => rows[i].listId).filter(Boolean)).size;
  const profile = { id: profileId, org_id: org, company_name: choose('rawName'), representative: choose('rawRepresentative'),
    phone: choose('rawPhone'), address: choose('rawAddress'), business: choose('business'), industry: choose('industry'),
    corporate_number: choose('corp') || null, representative_address: home?.value || null,
    home_key: home?.normalized || '', home_representative_key: representativeKey,
    home_state: homes.length > 1 ? 'conflict' : home ? 'available' : 'unknown', home_source: home?.source || {},
    needs_review: indices.some(i => reviewIndices.has(i)) || homes.length > 1,
    master_count: masterCount, list_count: listCount, source_count: indices.length };
  for (const i of indices) rowProfiles[i] = profile;
  profiles.push(profile);
}
async function output(name, columns, values) {
  const stream = fs.createWriteStream(path.join(dir, name + '.csv'));
  const cell = v => v === null || v === undefined ? '' : '"' + (typeof v === 'object' ? JSON.stringify(v) : String(v)).replaceAll('"','""') + '"';
  for (const row of values) if (!stream.write(columns.map(k => cell(row[k])).join(',') + '\n')) await once(stream, 'drain');
  stream.end(); await once(stream, 'finish');
  return columns;
}
const columns = {};
columns.company_profiles = await output('company_profiles', Object.keys(profiles[0]), profiles);
const links = rows.map((row, i) => {
  const p = rowProfiles[i];
  // A known different representative must not inherit another person's home.
  const localHomes = [...new Set(row.homeFacts.map(f => f.normalized).filter(Boolean))];
  const localState = localHomes.length > 1 ? 'conflict' : localHomes.length ? 'available' : 'unknown';
  const sharedHome = row.representative && row.representative === p.home_representative_key ? p.home_key : '';
  const home = localState === 'conflict' || (localHomes[0] && sharedHome && localHomes[0] !== sharedHome)
    || (p.home_state === 'conflict' && row.representative === p.home_representative_key) ? '' : localHomes[0] || sharedHome;
  const companyAddress = row.address || comparableSharedAddress(p.address);
  const match = companyAddress && home ? (companyAddress === home ? 'same' : 'different') : 'unknown';
  if (row.listId) {
    const s = stats.lists[row.listId] ||= { name: row.sourceFile, total: 0, same: 0, different: 0, unknown: 0, inMaster: 0 };
    s.total++; s[match]++; if (p.master_count) s.inMaster++;
  }
  return { org_id: org, company_id: p.id, master_id: row.source === 'master' ? row.id : null,
    item_id: row.source === 'calls' ? row.id : null, list_id: row.listId, sort_no: row.no,
    name_key: row.name, representative_key: row.representative, phone_key: row.phone, address_key: row.address,
    corporate_number: row.corp || null, legal_form: row.legalForm, address_match: match,
    local_home_key: localHomes.length === 1 ? localHomes[0] : '', local_home_state: localState,
    source_data: { company_name: row.rawName, representative: row.rawRepresentative, phone: row.rawPhone,
      address: row.rawAddress, business: row.business, industry: row.industry, source_file: row.sourceFile },
    link_reason: p.needs_review ? '要確認' : indicesReason(row, p),
  };
});
function indicesReason(row, p) { return p.source_count === 1 ? '単独レコード' : row.corp ? '法人番号・複合キー照合' : '企業名と代表者・電話・住所の照合'; }
columns.company_profile_links = await output('company_profile_links', Object.keys(links[0]), links);
columns.company_profile_facts = await output('company_profile_facts',
  ['org_id','company_id','source_key','field','value','normalized_value','representative_key','source'],
  facts.map(f => ({ org_id: org, company_id: rowProfiles[f.rowIndex].id, source_key: f.sourceKey,
    field: f.field, value: f.value, normalized_value: f.normalized, representative_key: f.representativeKey, source: f.source })));
const reviewRows = reviews.map((r, i) => ({ id: idFor(`${org}:review:${i}`), org_id: org, reason: r.reason,
  company_ids: [...new Set(r.indices.map(j => rowProfiles[j].id))], source_count: r.indices.length }));
// JSONB company_ids keeps every unresolved candidate without cascading merges.
columns.company_profile_reviews = await output('company_profile_reviews', ['id','org_id','reason','company_ids','source_count'], reviewRows);
stats.totalSources = rows.length; stats.uniqueCompanies = profiles.length;
stats.masterOnly = profiles.filter(p => p.master_count && !p.list_count).length;
stats.listOnly = profiles.filter(p => !p.master_count).length;
stats.shared = profiles.filter(p => p.master_count && p.list_count).length;
stats.homes = profiles.filter(p => p.home_state === 'available').length;
stats.homeConflicts = profiles.filter(p => p.home_state === 'conflict').length;
stats.corporateNumbers = profiles.filter(p => p.corporate_number).length;
stats.identityReviews = reviews.length; stats.facts = facts.length;
fs.writeFileSync(path.join(dir, 'seed-columns.json'), JSON.stringify(columns, null, 2));
fs.writeFileSync(path.join(dir, 'company-crm-seed-summary.json'), JSON.stringify(stats, null, 2));
console.log(JSON.stringify({ ...stats, lists: Object.values(stats.lists).filter(l => l.name.includes('ブティックス')) }, null, 2));
