// Read-only audit of local snapshots. Never merges or modifies production rows.
// Input: company_master.jsonl, call_list_items.jsonl from one repeatable-read snapshot.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { prepareIdentity, auditIdentities } from './lib/companyIdentity.mjs';
const dir=process.argv[2] || '.local-snapshots';
const all=[],coverage={},counts={};
for(const [file,source] of [['company_master.jsonl','master'],['call_list_items.jsonl','calls']]){
  const rows=[];
  const c={name:0,representative:0,phone:0,address:0,corp:0,invalidCorp:0,conflictedCorp:0};
  for await(const line of readline.createInterface({input:fs.createReadStream(path.join(dir,file)),crlfDelay:Infinity})){
    const row=prepareIdentity(JSON.parse(line),source);rows.push(row);
    for(const k of Object.keys(c))if(row[k])c[k]++;
  }
  coverage[source]=c;counts[source]=auditIdentities(rows);for(const row of rows)all.push(row);
  console.log(JSON.stringify({source,...counts[source]}));
}
const result={snapshotDate:'2026-09-13',orgId:'a0000000-0000-0000-0000-000000000001',includesArchived:true,
  coverage,individual:counts,combined:auditIdentities(all)};
fs.writeFileSync(path.join(dir,'company-union-audit.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({coverage,combined:result.combined}));
