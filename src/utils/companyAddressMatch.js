// 取込済みの住所だけを照合する。原文や memo は変更しない。
export const ADDRESS_MATCH_OPTIONS = [
  { value: '', label: '指定なし' },
  { value: 'same', label: '一致' },
  { value: 'different', label: '不一致' },
  { value: 'unknown', label: '判定不可' },
];

export const normalizeAddressMatchFilter = value =>
  ADDRESS_MATCH_OPTIONS.some(option => option.value === value) ? value : '';

const HOME_ADDRESS_KEYS = [
  '代表者自宅住所', '代表者現住所', '代表者現住所詳細', '代表者住所詳細', '代表者住所',
  '代表者居住地', '社長自宅住所', '社長住所', '自宅住所',
  'representative_address', 'representative_home_address', 'president_address',
];
const normalizeKey = key => String(key).normalize('NFKC').replace(/[\s()（）]/g, '').toLowerCase();
const HOME_KEYS = new Set(HOME_ADDRESS_KEYS.map(normalizeKey));
const PREFECTURE = /^(北海道|東京都|京都府|大阪府|.{2,3}県)/;
const MISSING = /^(?:[-ー―—–−/・*＊?？]+|不明|未確認|未取得|未登録|未記入|記載なし|情報なし|住所不明|非公開|なし|無し|null|undefined|n\/?a)$/i;

function readMemo(memo) {
  if (!memo) return {};
  try {
    const value = typeof memo === 'string' ? JSON.parse(memo) : memo;
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function kanjiNumber(value) {
  const digits = { '〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  if (!/[十百千]/.test(value)) return String(Number([...value].map(c => digits[c]).join('')));
  let total = 0, digit = 0;
  for (const c of value) {
    const unit = { '十': 10, '百': 100, '千': 1000 }[c];
    if (unit) { total += (digit || 1) * unit; digit = 0; }
    else digit = digits[c];
  }
  return String(total + digit);
}

export function normalizeCompanyAddress(value) {
  if (typeof value !== 'string') return '';
  let text = value.normalize('NFKC').trim();
  if (!text || MISSING.test(text)) return '';
  text = text
    .replace(/^(?:〒\s*)?\d{3}[-‐‑‒–—―−ー]?\d{4}\s*(?=(?:北海道|東京都|京都府|大阪府|.{2,3}県))/, '')
    .replace(/\s+/g, '')
    .replace(/\/+$/, '')
    .replace(/[〇零一二三四五六七八九十百千]+(?=丁目|番地|番(?!町)|号(?!館|棟|室))/g, kanjiNumber)
    // 長音符は数字の間だけ。建物名の「コーポ」などを壊さない。
    .replace(/(\d)[‐‑‒–—―−ー](?=\d)/g, '$1-')
    .replace(/(\d)(?:丁目|番地の|番地|番|号の|の)(?=\d)/g, '$1-')
    .replace(/(\d)(?:番地|番|号)(?=$|[^\d室館棟町])/g, '$1')
    .toLowerCase();
  return text;
}

// 市区町村だけ・コードだけ・伏字は、一致とも不一致ともみなさない。
function isComparable(address) {
  return PREFECTURE.test(address)
    && /\d|無番地|番地なし/.test(address.replace(PREFECTURE, ''))
    && !/(?:丁目|市|区|町|村)$/.test(address)
    && !/[*＊●○?？]|以下不明|番地不明|一部非公開/.test(address);
}

export function getCompanyAddressMatch(item) {
  const companyAddress = normalizeCompanyAddress(item?.address);
  if (!isComparable(companyAddress)) return 'unknown';
  const memo = readMemo(item?.memo);
  const values = [...Object.entries(memo), ...Object.entries(item || {})]
    .filter(([key]) => HOME_KEYS.has(normalizeKey(key)))
    .map(([, value]) => normalizeCompanyAddress(value))
    .filter(isComparable);
  const addresses = [...new Set(values)];
  if (addresses.length === 0) return 'unknown';
  // 複数の住所欄が矛盾する場合は推測しない（住所コード欄は上で除外）。
  if (addresses.length > 1) return 'unknown';
  return companyAddress === addresses[0] ? 'same' : 'different';
}
