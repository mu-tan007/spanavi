// Capital 配下の色コントラスト検査。
// 同じ style={{}} ブロック内で background と color が両方明色 or 両方暗色なら警告。
import fs from 'fs';
import path from 'path';

function walk(dir, exts) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, exts));
    else if (exts.some(e => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}
const files = walk('src/components/views/capital', ['.jsx', '.js']);

// 判定用パレット (Spanavi トークン)
const DARK_BG = new Set(['#032D60', '#021B40', '#011226', '#021d47']);
const LIGHT_BG = new Set([
  '#FFFFFF','#ffffff','#fff',
  '#F8F8F8','#FAFAFA','#F3F2F2','#FAF3E0','#E1F5EE','#FAECE7',
  '#E5E5E5','#F0F0F0','#f0f6ff','#f0f2f5',
]);
const DARK_FG = new Set(['#032D60','#021B40','#011226','#181818','#0a1e3c']);
const LIGHT_FG = new Set(['#FFFFFF','#ffffff','#fff','#F8F8F8','#FAFAFA','#F3F2F2','#E5E5E5','#A0A0A0']);

const issues = [];

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  // 複数行にまたがる style={{...}} も拾う
  const styleRe = /style=\{\{([\s\S]*?)\}\}/g;
  let m;
  while ((m = styleRe.exec(src)) !== null) {
    const body = m[1];
    // braces 内のネストが深い場合は scrap (簡易判定)
    if ((body.match(/\{/g) || []).length > 0) continue;

    // background / color の全 hex 値を拾う (三項演算子の両枝含む)
    const bgHexes = [...body.matchAll(/background: ?(?:[^,}]*? )?['"](#[0-9a-fA-F]{3,8})['"]/g)].map(m => m[1]);
    const colorHexes = [...body.matchAll(/\bcolor: ?(?:[^,}]*? )?['"](#[0-9a-fA-F]{3,8})['"]/g)].map(m => m[1]);
    if (bgHexes.length === 0 || colorHexes.length === 0) continue;

    // 各bg × 各color の組み合わせで破綻がないかチェック
    const bg = bgHexes[0]; // 最初の bg を代表値に
    const color = colorHexes[0];
    const bgLower = bg.toLowerCase();
    const colorLower = color.toLowerCase();

    const bgDark = [...DARK_BG].some(x => x.toLowerCase() === bgLower);
    const bgLight = [...LIGHT_BG].some(x => x.toLowerCase() === bgLower);
    const fgDark = [...DARK_FG].some(x => x.toLowerCase() === colorLower);
    const fgLight = [...LIGHT_FG].some(x => x.toLowerCase() === colorLower);

    let reason = null;
    if (bgDark && fgDark) reason = 'dark-on-dark';
    else if (bgLight && fgLight) reason = 'light-on-light';

    if (reason) {
      const lineNo = src.substring(0, m.index).split('\n').length;
      issues.push({ file: f, line: lineNo, bg, color, reason, excerpt: body.slice(0, 120).replace(/\s+/g, ' ') });
    }
  }
}

issues.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
for (const i of issues) {
  console.log(`${i.reason.padEnd(15)} ${i.file}:${i.line}  bg=${i.bg} color=${i.color}  ${i.excerpt}`);
}
console.log(`\nTotal: ${issues.length} contrast issues`);
