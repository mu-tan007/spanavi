// 架電リスト取込（CSV / Excel）の共通ユーティリティ。
// CSVPhoneList（取込本体）と CSVColumnMappingModal（カラム紐付けUI/プレビュー）で共有する。
// 既存の handleCSVImport 内ロジック（住所結合・電話正規化・単位換算・memo JSON・
// 数式インジェクション対策）を切り出して、明示マッピング駆動に一般化したもの。

// ── スパナビ側の標準カラム定義 ───────────────────────────────
// key: 内部フィールド名 / label: UI表示名 / unit: 単位選択が必要な金額列
export const TARGET_FIELDS = [
  { key: 'no',             label: 'No.（取込時に自動採番）' },
  { key: 'company',        label: '企業名', required: true },
  { key: 'business',       label: '事業内容' },
  { key: 'representative', label: '代表者' },
  { key: 'phone',          label: '電話番号' },
  { key: 'address',        label: '住所（単体）' },
  { key: 'pref',           label: '都道府県' },
  { key: 'city',           label: '市区町村' },
  { key: 'ward',           label: '番地・以降' },
  { key: 'revenue',        label: '売上高', unit: true },
  { key: 'net_income',     label: '当期純利益', unit: true },
  { key: 'employees',      label: '従業員数' },
  { key: 'url',            label: 'URL・HP' },
  { key: 'age',            label: '代表者年齢' },
  { key: 'memo_text',      label: '備考・メモ' },
];

export const UNIT_OPTIONS = ['千円', '百万円', '億円', '円'];

// ── ヘッダー正規化（全角→半角、括弧統一、trim）────────────────
export function normalizeHeader(s) {
  return (s || '')
    .replace(/^﻿/, '')
    .trim()
    .replace(/　/g, ' ')
    .replace(/（/g, '(').replace(/）/g, ')')
    .replace(/．/g, '.').replace(/／/g, '/')
    .replace(/[Ａ-Ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[ａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

// ── CSV1行パース（ダブルクォート・カンマ対応）──────────────────
export function parseCSVLine(line) {
  const result = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (!inQ) { inQ = true; }
      else if (line[i + 1] === '"') { cur += '"'; i++; }
      else { inQ = false; }
    } else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur.trim());
  return result;
}

// ── ファイル読み込み（CSV / Excel 共通）──────────────────────────
// ファイル選択 input の accept 属性。旧形式(.xls)はライブラリが読めないため含めない。
export const IMPORT_FILE_ACCEPT = '.csv,.xlsx,.xlsm';

// Excel セルの値 → 文字列。
// 数式セルは計算結果、リッチテキストは連結、リンクセルは表示テキストを取る。
function cellValueToString(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return formatExcelDate(v);
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(t => t?.text || '').join('').trim();
    if ('formula' in v || 'sharedFormula' in v) return cellValueToString(v.result);
    if (v.error) return '';               // #N/A などのエラーセル
    if (v.text != null) return String(v.text).trim();  // ハイパーリンクセル
  }
  return String(v).trim();
}

// 日付セルは時刻が入っていなければ日付だけにする（設立年月日などが 00:00 付きになるのを避ける）。
// exceljs は日付をUTC基準のDateで返すため、UTCで読まないと時差の分だけ時刻がずれる。
function formatExcelDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  const ymd = `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}`;
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) return ymd;
  return `${ymd} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

// Excelで電話番号が数値セルになっていると先頭の0が落ちる（0312345678 → 312345678）。
// 数字だけで9〜10桁・先頭が0以外の値に限って0を補う。ハイフン入りはそのまま。
export function restorePhoneLeadingZero(v) {
  const s = String(v ?? '').trim();
  return /^[1-9]\d{8,9}$/.test(s) ? '0' + s : s;
}

// 1行目をヘッダー、以降をデータ行とみなして {headers, headersOriginal, dataRows} を作る
function toSheet(name, matrix) {
  const headersOriginal = matrix[0] || [];
  return {
    name,
    headers: headersOriginal.map(normalizeHeader),
    headersOriginal,
    dataRows: matrix.slice(1),
  };
}

async function readCsvSheets(file) {
  const text = await file.text(); // UTF-8
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  return [toSheet(null, lines.map(l => parseCSVLine(l)))];
}

async function readExcelSheets(file) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  return wb.worksheets.map(ws => {
    const colCount = ws.columnCount || 0;
    const matrix = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells = [];
      for (let c = 1; c <= colCount; c++) cells.push(cellValueToString(row.getCell(c).value));
      if (cells.some(v => v !== '')) matrix.push(cells); // 空行は詰める（CSV側の filter と同じ挙動）
    });
    return toSheet(ws.name, matrix);
  });
}

// ファイル → シート配列。CSV は1シート扱い（name: null）。
// データ行のないシート（見出しだけ・空シート）は落とす。
export async function parseImportFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'xls') {
    throw new Error('旧Excel形式(.xls)は取り込めません。Excelで「Excel ブック(.xlsx)」として保存し直してください。');
  }
  const isExcel = ext === 'xlsx' || ext === 'xlsm';
  const sheets = (isExcel ? await readExcelSheets(file) : await readCsvSheets(file))
    .filter(s => s.dataRows.length > 0);
  if (sheets.length === 0) {
    throw new Error(isExcel ? 'データ行のあるシートが見つかりません' : 'CSVにデータ行が見つかりません');
  }
  return { fileName: file.name, sheets };
}

// パース結果 → カラム紐付けモーダルに渡す state。
// シートを切り替えるたびに呼び直して、そのシートのヘッダーで自動判定をやり直す。
export function buildPendingImport(fileName, sheets, sheetIndex = 0) {
  const s = sheets[sheetIndex];
  const { mapping, units } = buildDefaultMapping(s.headers, s.dataRows);
  return {
    fileName, sheets, sheetIndex,
    sheetName: s.name,
    headers: s.headers,
    headersOriginal: s.headersOriginal,
    dataRows: s.dataRows,
    mapping, units,
  };
}

// ── 単位検出（ヘッダーの括弧内表記から）─────────────────────────
export function detectUnit(h) {
  if (!h) return '千円';
  if (h.includes('(億円)')) return '億円';
  if (h.includes('(百万円)')) return '百万円';
  if (h.includes('(千円)')) return '千円';
  if (h.includes('(円)')) return '円';
  return '千円'; // 単位なし → 千円とみなす
}

// ── 千円単位に統一変換 ────────────────────────────────────────
export function toSenEn(val, unit) {
  const n = parseFloat(String(val).replace(/,/g, '').replace(/[^\d.-]/g, ''));
  if (isNaN(n)) return null;
  if (unit === '円') return Math.floor(n / 1000);
  if (unit === '百万円') return Math.floor(n * 1000);
  if (unit === '億円') return Math.floor(n * 100000);
  return Math.floor(n); // 千円（デフォルト）
}

// ── 汎用数値パース（カンマ・全角数字対応）──────────────────────
export function parseNum(val) {
  if (!val && val !== 0) return null;
  const n = parseFloat(String(val).replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return isNaN(n) ? null : n;
}

// ── ヘッダー名 → 標準フィールドの自動判定（マッピング初期値用）──
// 「商号 / 営業種目 / 最新売上 / 最新利益」などクライアント支給CSV（TSR・LBC書式）の
// 表記も拾う。カナ列（商号カナ・代表者カナ）は完全一致判定なので誤検出しない。
export function detectField(h) {
  const base = (h || '').replace(/\(.*?\)/g, '').trim(); // 単位括弧を除去した基本名
  if (/^(No\.|NO|no|番号)$/.test(h)) return 'no';
  if (base === '企業名' || base === '会社名' || base === '社名' || base === '法人名'
    || base === '商号' || base === '商号又は名称' || base === '企業名称') return 'company';
  if (base === '事業内容' || base === '事業概要' || base === '業種' || base === '業態' || base === '業績'
    || base === '営業種目' || base === '主業' || base === '取扱品目') return 'business';
  if (base === '代表者名' || base === '代表者' || base === '代表' || base === '代表取締役') return 'representative';
  if (base === '電話番号' || base === '電話' || base.toUpperCase() === 'TEL') return 'phone';
  if (base === '住所' || base === '所在地' || base === '本社所在地') return 'address';
  if (base === '都道府県' || base.toLowerCase() === 'prefecture') return 'pref';
  if (base === '市区町村' || base === '市町村' || base === '区市町村') return 'city';
  if (base === '番地' || base === '番地以降' || base === '番地・号' || base === '丁目番地') return 'ward';
  if (base === '売上高' || base === '売上' || base === '最新売上' || base === '売上金額' || base === '直近売上') return 'revenue';
  if (base === '当期純利益' || base === '純利益' || base === '最新利益' || base === '当期利益' || base === '最新純利益') return 'net_income';
  if (base === '備考' || base === 'メモ' || base === '注記') return 'memo_text';
  if (base === '従業員数' || base === '社員数' || base === '従業員') return 'employees';
  if (base === 'URL' || base === 'url' || base === 'HP' || base === '会社URL' || base === '会社HP' || base.includes('ホームページ')) return 'url';
  if (base === '代表者年齢' || base === '年齢') return 'age';
  return null;
}

// ── 金額列の実データから単位を推定 ────────────────────────────
// ヘッダーに単位表記がないCSV（例: 最新売上=2900000000）を千円と解釈すると
// 1000倍ずれる。中央値が1億以上なら「円」表記とみなす
// （千円単位で中央値1億＝中央値1000億円となり実在しないため誤爆しない）。
export function inferUnitFromValues(values) {
  const nums = (values || [])
    .map(v => parseFloat(String(v ?? '').replace(/,/g, '').replace(/[^\d.-]/g, '')))
    .filter(n => !isNaN(n) && n > 0)
    .sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const median = nums[Math.floor(nums.length / 2)];
  return median >= 100000000 ? '円' : null;
}

// ── ヘッダー配列から、マッピング初期値と単位初期値を構築 ────────
// mapping: { field: colIndex }（最初にマッチした列を優先）
// units:   { revenue: '千円', net_income: '千円' }
// dataRows を渡すと、単位表記のない金額列を実データから推定する
// （純利益は単体だと桁が小さく推定できないため、売上の推定結果を引き継ぐ）
export function buildDefaultMapping(headers, dataRows) {
  const mapping = {};
  const units = { revenue: '千円', net_income: '千円' };
  const explicit = {};
  headers.forEach((h, idx) => {
    const field = detectField(h);
    if (field && mapping[field] == null) {
      mapping[field] = idx;
      if (field === 'revenue' || field === 'net_income') {
        units[field] = detectUnit(h);
        explicit[field] = /\((億円|百万円|千円|円)\)/.test(h);
      }
    }
  });

  if (dataRows?.length) {
    const sample = dataRows.slice(0, 200);
    const colValues = (idx) => sample.map(cols => cols?.[idx]);
    let revenueInferred = null;
    if (mapping.revenue != null && !explicit.revenue) {
      revenueInferred = inferUnitFromValues(colValues(mapping.revenue));
      if (revenueInferred) units.revenue = revenueInferred;
    }
    if (mapping.net_income != null && !explicit.net_income) {
      units.net_income = inferUnitFromValues(colValues(mapping.net_income)) || revenueInferred || units.net_income;
    }
  }

  return { mapping, units };
}

// 数式インジェクション対策: =,+,-,@,タブ,改行 で始まる文字列の先頭に ' を付加
function sanitizeCSV(v) {
  return (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : v);
}
// 電話番号正規化: 数字のみ抽出 → 先頭0補完
function normalizePhone(v) {
  const d = (v || '').replace(/[^\d]/g, '');
  return d ? (d.startsWith('0') ? d : '0' + d) : '';
}

// ── マッピングに従って行データを組み立てる ────────────────────
// dataRows: CSVデータ行（parseCSVLineで分解済みの配列の配列）
// headers:  正規化済みヘッダー配列（未マッピング列の名前としてmemoに使う）
// mapping:  { field: colIndex }
// units:    { revenue, net_income }
export function buildRowsFromMapping(dataRows, headers, mapping, units) {
  const mappedIdx = new Set(Object.values(mapping).filter(v => v != null && v >= 0));
  const revenueUnit = units?.revenue || '千円';
  const netIncomeUnit = units?.net_income || '千円';

  const rows = [];
  for (const cols of dataRows) {
    if (!cols || cols.length < 1 || cols.every(c => !c)) continue;

    const get = (field) => {
      const idx = mapping[field];
      return (idx != null && idx >= 0) ? ((cols[idx] || '').trim()) : '';
    };

    // 住所結合
    const addrRaw = get('address');
    const prefVal = get('pref');
    const cityVal = get('city');
    const wardVal = get('ward');
    let address = '';
    if (addrRaw) {
      address = (prefVal && !addrRaw.startsWith(prefVal)) ? prefVal + addrRaw : addrRaw;
    } else {
      address = prefVal + cityVal + wardVal;
    }
    address = address.replace(/\/\s*$/, '');

    // memo JSON（備考・年齢・未マッピング列）
    const extraInfo = {};
    const memoText = get('memo_text');
    if (memoText) extraInfo.biko = memoText;
    const ageVal = get('age');
    if (ageVal) extraInfo.age = ageVal;
    headers.forEach((h, idx) => {
      if (mappedIdx.has(idx)) return;
      const v = (cols[idx] || '').trim();
      if (v) extraInfo[h] = v;
    });

    const companyVal = get('company');
    if (!companyVal) continue; // 企業名なしはスキップ

    rows.push({
      no: rows.length + 1,
      company: sanitizeCSV(companyVal),
      business: sanitizeCSV(get('business') || ''),
      address: sanitizeCSV(address),
      pref: prefVal,
      representative: sanitizeCSV(get('representative') || ''),
      phone: normalizePhone(get('phone') || ''),
      revenue: (() => { const v = get('revenue'); return v ? toSenEn(v, revenueUnit) : null; })(),
      net_income: (() => { const v = get('net_income'); return v ? toSenEn(v, netIncomeUnit) : null; })(),
      employees: (() => { const v = get('employees'); return v ? parseNum(v) : null; })(),
      url: get('url') || null,
      memo: Object.keys(extraInfo).length > 0 ? JSON.stringify(extraInfo) : null,
      called: false,
      result: '',
    });
  }
  return rows;
}
