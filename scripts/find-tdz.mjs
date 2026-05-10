import fs from 'node:fs';
import { readdirSync } from 'node:fs';
const idx = readdirSync('dist/assets').find(f => f.startsWith('index-') && f.endsWith('.js'));
const c = fs.readFileSync('dist/assets/' + idx, 'utf8');
console.log('Bundle:', idx);
const start = c.indexOf('function DDe(');
console.log('DDe starts at', start);
// Skip past the destructured arg list: function DDe({...}) - find the body { after )
const bodyStart = c.indexOf('){', start) + 1;
console.log('Body starts at', bodyStart);
let depth = 0, end = -1, instr = false, prev = '', strChar = '';
for (let i = bodyStart; i < c.length; i++) {
  const ch = c[i];
  if (instr) {
    if (ch === strChar && prev !== '\\') instr = false;
  } else {
    if (ch === '"' || ch === "'" || ch === '`') { instr = true; strChar = ch; }
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  prev = ch;
}
console.log('DDe ends at', end, 'len=', end - start);
const body = c.slice(bodyStart, end);
let pos = 0, count = 0;
while (true) {
  const ix = body.indexOf('xr', pos);
  if (ix < 0) break;
  const before = body[ix - 1] || '';
  const after = body[ix + 2] || '';
  if (!/[a-zA-Z0-9_$]/.test(before) && !/[a-zA-Z0-9_$]/.test(after)) {
    console.log(`xr at offset ${ix} (rel) ${start + ix} (abs):`, body.slice(Math.max(0, ix - 30), ix + 60).replace(/\n/g, '\\n'));
    count++;
    if (count > 25) break;
  }
  pos = ix + 2;
}
