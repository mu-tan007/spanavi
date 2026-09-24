// Shared by the two import entry points. Provider defaults are suggestions;
// ambiguous monetary units require confirmation before anything is saved.
export const IMPORT_PROVIDERS = [
  { value: 'client', label: 'クライアント提供' }, { value: 'tsr', label: '東京商工リサーチ（TSR）' },
  { value: 'tdb', label: '帝国データバンク（TDB）' }, { value: 'other', label: 'その他' },
];
export const MONEY_FACTORS = { '円': 0.001, '千円': 1, '万円': 10, '百万円': 1000, '億円': 100000 };
const field = (key, label, aliases = [], type = 'text', money = false) => ({ key, label, aliases, type, money, active: true });
export const STANDARD_COMPANY_FIELDS = [
  field('company_name', '企業名', ['会社名', '社名', '商号', '法人名', '商号又は名称', '企業名称', 'company name', 'company', '法人名称']),
  field('representative', '代表者', ['代表者名', '代表取締役', '代表', '代表者氏名', 'representative name']),
  field('phone', '電話番号', ['TEL', '電話', '会社電話番号', 'phone number', 'telephone']),
  field('address', '会社住所', ['住所', '所在地', '本社所在地', '本店所在地', 'company address', 'full_address']),
  field('prefecture', '都道府県', ['県']), field('city', '市区町村', ['市区郡', '市町村', '区市町村']),
  field('street', '番地・建物名', ['番地', '番地以降', '番地・以降', '丁目番地']),
  field('postal_code', '郵便番号', ['〒']),
  field('representative_address', '代表者自宅住所', ['代表者現住所', '代表者住所', '代表者現住所詳細', '代表者住所詳細', '自宅住所', '社長住所', '社長自宅住所']),
  field('corporate_number', '法人番号', ['法人番号13桁', 'corporate_number']),
  field('business', '事業内容', ['事業概要', '営業種目', '取扱品目', '業務内容']),
  field('industry', '業種', ['業種名', '主業', '業種1', '中業種']),
  field('source_industry_code', '出所の業種コード', ['業種コード', '産業分類コード']),
  field('industry_major', '業種大分類', ['大分類', '大業種']),
  field('industry_sub', '業種細分類', ['細分類']),
  field('source_company_code', '提供元の企業コード', ['顧客番号', '顧客コード', '顧客ID', 'customer_id', 'company code']),
  field('tsr_code', 'TSR企業コード', ['TSRID', 'TSRコード', 'tsr_id']),
  field('tdb_code', 'TDB企業コード', ['TDBコード', '帝国企業コード']),
  field('revenue_k', '売上高', ['売上', '最新売上', '直近売上', '売上金額', '売上千円'], 'number', true),
  field('net_income_k', '当期純利益', ['純利益', '最新利益', '当期利益', '最新純利益'], 'number', true),
  field('ordinary_income_k', '経常利益', [], 'number', true),
  field('capital_k', '資本金', [], 'number', true),
  field('employee_count', '従業員数', ['社員数', '従業員'], 'number'),
  field('representative_age', '代表者年齢', ['年齢'], 'number'),
  field('established_year', '設立年', ['設立', '設立年度']),
  field('url', 'ホームページ', ['URL', 'HP', '会社URL', '会社HP']),
  field('shareholders', '株主'), field('officers', '役員'), field('clients', '取引先'),
  field('remarks', '備考', ['メモ', '注記']),
];
export const importHeaderKey = value => String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/[\s　]/g, '');
export const importHeaderCore = value => importHeaderKey(value).replace(/\([^)]*\)/g, '');
export function explicitMoneyUnit(header) {
  const text = importHeaderKey(header);
  return ['億円', '百万円', '万円', '千円', '円'].find(unit => text.includes(unit)) || '';
}
export function guessImportProvider(headers) {
  const normalized = headers.map(importHeaderKey);
  const tsr = normalized.some(h => /tsr/i.test(h)), tdb = normalized.some(h => /tdb|cosmos|コスモス/i.test(h));
  return tsr === tdb ? 'client' : tsr ? 'tsr' : 'tdb';
}
export function detectCompanyImportMapping(headers, provider, fields = STANDARD_COMPANY_FIELDS) {
  const candidates = headers.map(header => {
    const core = importHeaderCore(header);
    if (core === '企業コード') return [({ tsr: 'tsr_code', tdb: 'tdb_code' }[provider] || 'source_company_code')];
    return fields.filter(f => f.active !== false && [f.key, f.label, ...(f.aliases || [])].some(a => {
      if (importHeaderKey(a) === importHeaderKey(header)) return true;
      // Only strip unit annotations for monetary fields. “住所(旧)” must not become the current address.
      if (!f.money || !explicitMoneyUnit(header)) return false;
      const moneyCore = value => importHeaderKey(value).replace(/(?:\(|\[)?(?:億円|百万円|万円|千円|円)(?:\)|\])?/g, '');
      return moneyCore(a) === moneyCore(header);
    })).map(f => f.key);
  });
  return headers.map((header, index) => {
    const options = [...new Set(candidates[index])], key = options[0];
    if (!key) return { key: '' };
    if (options.length > 1 || candidates.filter(keys => keys.includes(key)).length > 1) return { key: '', candidates: options, needsChoice: true };
    const f = fields.find(item => item.key === key);
    const explicit = f?.money ? explicitMoneyUnit(header) : '';
    return { key, ...(f?.money ? { unit: explicit || (provider === 'tdb' ? key === 'capital_k' ? '万円' : '百万円' : '千円'), unitConfirmed: !!explicit } : {}) };
  });
}
export function selectCompanyImportHeader(sheet, rowIndex = 0) {
  const matrix = sheet.matrix || [sheet.headersOriginal, ...sheet.dataRows];
  const positions = sheet.rowNumbers || [sheet.headerRow || 1, ...(sheet.sourceRowNumbers || sheet.dataRows.map((_, i) => i + 2))];
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= matrix.length - 1) throw new Error('データ行より前の見出し行を選択してください。');
  const headersOriginal = matrix[rowIndex];
  return { ...sheet, matrix, rowNumbers: positions, headersOriginal, headers: headersOriginal,
    headerIndex: rowIndex, headerRow: positions[rowIndex], dataRows: matrix.slice(rowIndex + 1), sourceRowNumbers: positions.slice(rowIndex + 1) };
}
export function validateCompanyImportMapping(headers, mapping, fields, provider) {
  const errors = [], used = new Set();
  if (!IMPORT_PROVIDERS.some(p => p.value === provider)) errors.push('出所を選択してください。');
  if (!mapping.some(m => m.key === 'company_name')) errors.push('企業名の列を選択してください。');
  mapping.forEach((m, i) => {
    if (!m.key) return;
    const f = fields.find(item => item.key === m.key && item.active !== false);
    if (!f) { errors.push(`${headers[i]}：項目が無効です。`); return; }
    if (used.has(m.key)) errors.push(`${f.label}に複数の列が指定されています。`);
    used.add(m.key);
    if (f.money && (!Object.hasOwn(MONEY_FACTORS, m.unit) || !m.unitConfirmed)) errors.push(`${headers[i]}：金額の単位を確認してください。`);
    if ((m.key === 'tsr_code' && provider === 'tdb') || (m.key === 'tdb_code' && provider === 'tsr')) errors.push(`${headers[i]}：企業コードの出所が一致していません。`);
  });
  return errors;
}
export function applyCompanyImportTemplate(headers, provider, template, fields) {
  if (template.provider !== provider || !template.active) throw new Error('同じ出所の有効な設定を選択してください。');
  const mapping = detectCompanyImportMapping(headers, provider, fields), warnings = [];
  // Reordered/duplicate headers are resolved by header plus occurrence, not index.
  const seen = new Map();
  headers.forEach((h, i) => {
    const header = importHeaderKey(h), occurrence = seen.get(header) || 0; seen.set(header, occurrence + 1);
    const saved = template.settings.columns?.find(c => c.header === header && c.occurrence === occurrence);
    if (!saved) return;
    mapping[i] = { ...saved.rule };
    if (fields.find(f => f.key === saved.rule.key)?.money) {
      const explicit = explicitMoneyUnit(h);
      if (explicit && explicit !== saved.rule.unit) {
        mapping[i] = { ...saved.rule, unit: explicit, unitConfirmed: false };
        warnings.push(`${h}：元の列の単位と保存済み設定が異なります。単位を確認してください。`);
      }
    }
  });
  return { mapping, warnings };
}
export function companyImportTemplateSettings(headers, mapping) {
  const seen = new Map();
  return { columns: headers.map((h, i) => {
    const header = importHeaderKey(h), occurrence = seen.get(header) || 0; seen.set(header, occurrence + 1);
    return { header, occurrence, rule: { ...mapping[i] } };
  }) };
}
export function normalizeImportPhone(value) {
  const raw = String(value ?? '').normalize('NFKC').trim();
  if (!raw) return '';
  if (!/^[+\d\s()\-‐‑‒–—―−ー]+$/.test(raw)) throw new Error('電話番号の形式を確認してください');
  let digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+81')) digits = '0' + digits.slice(2).replace(/^0/, '');
  else if (/^[1-9]\d{8,9}$/.test(digits)) digits = '0' + digits;
  if (!/^0\d{9,10}$/.test(digits)) throw new Error('電話番号の桁数を確認してください');
  return digits;
}
// 「該当しない」等は空欄と同じ扱い。読めない数値・日付・電話は行を落とさず、その項目だけ空にする（元の値は出典に残る）
const IMPORT_BLANK = /^((該当(し|する情報|情報)?|情報)?な[しい]|無し|不明|非公開|未公開|n\/?a|[-－ー―—‐]+)$/i;
function parseImportNumber(value, f, unit) {
  let raw = value.normalize('NFKC').replace(/,/g, '').replace(/\s+/g, '').replace(/[(][^()]*[)]$/, '');
  const jp = f.money && raw.match(/^(?:(\d+(?:\.\d+)?)億)?(?:(\d+(?:\.\d+)?)万)?(\d+)?円?$/);
  if (jp && (jp[1] || jp[2])) return (Number(jp[1] || 0) * 1e8 + Number(jp[2] || 0) * 1e4 + Number(jp[3] || 0)) / 1000;
  raw = raw.replace(f.money ? /円$/ : /[名人]$/, '');
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return null;
  return Number(raw) * (f.money ? MONEY_FACTORS[unit] : 1);
}
export function normalizeCompanyImportRow(cells, mapping, fields, skipped = []) {
  const normalized = {};
  mapping.forEach((m, i) => {
    if (!m.key) return;
    const value = String(cells[i] ?? '').trim();
    if (!value || IMPORT_BLANK.test(value.normalize('NFKC'))) return;
    const f = fields.find(item => item.key === m.key);
    if (!f) throw new Error('取込項目が見つかりません');
    if (f.type === 'number') {
      const number = parseImportNumber(value, f, m.unit);
      if (number === null || !Number.isFinite(number) || Math.abs(number) > 1e14) { skipped.push(`${f.label}「${value}」`); return; }
      normalized[m.key] = number;
    } else if (f.type === 'date') {
      const raw = value.normalize('NFKC').replaceAll('/', '-');
      const [year, month, day] = raw.split('-').map(Number), date = new Date(Date.UTC(year, month - 1, day));
      if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw) || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) { skipped.push(`${f.label}「${value}」`); return; }
      normalized[m.key] = date.toISOString().slice(0, 10);
    } else if (m.key === 'phone') {
      try { normalized.phone = normalizeImportPhone(value); } catch { skipped.push(`${f.label}「${value}」`); }
    } else normalized[m.key] = value;
  });
  if (!normalized.company_name) throw new Error('企業名がありません');
  if (!normalized.industry && (normalized.industry_sub || normalized.industry_major)) normalized.industry = normalized.industry_sub || normalized.industry_major;
  let address = normalized.address || '', prefix = (normalized.prefecture || '') + (normalized.city || '');
  if (address) {
    if (normalized.city && !address.startsWith(prefix) && !address.startsWith(normalized.city) && !address.startsWith(normalized.prefecture || '\0')) address = normalized.city + address;
    if (normalized.prefecture && !address.startsWith(normalized.prefecture)) address = normalized.prefecture + address;
  } else address = prefix + (normalized.street || '');
  if (address) normalized.address = address.replace(/[／/]\s*$/, '');
  return normalized;
}
