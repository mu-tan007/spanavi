// 架電リストCSV取込の共通ユーティリティ。
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
export function detectField(h) {
  const base = (h || '').replace(/\(.*?\)/g, '').trim(); // 単位括弧を除去した基本名
  if (/^(No\.|NO|no|番号)$/.test(h)) return 'no';
  if (base === '企業名' || base === '会社名' || base === '社名' || base === '法人名') return 'company';
  if (base === '事業内容' || base === '事業概要' || base === '業種' || base === '業態' || base === '業績') return 'business';
  if (base === '代表者名' || base === '代表者' || base === '代表') return 'representative';
  if (base === '電話番号' || base === '電話' || base.toUpperCase() === 'TEL') return 'phone';
  if (base === '住所' || base === '所在地') return 'address';
  if (base === '都道府県' || base.toLowerCase() === 'prefecture') return 'pref';
  if (base === '市区町村' || base === '市町村' || base === '区市町村') return 'city';
  if (base === '番地' || base === '番地以降' || base === '番地・号' || base === '丁目番地') return 'ward';
  if (base === '売上高' || base === '売上') return 'revenue';
  if (base === '当期純利益' || base === '純利益') return 'net_income';
  if (base === '備考' || base === 'メモ' || base === '注記') return 'memo_text';
  if (base === '従業員数' || base === '社員数' || base === '従業員') return 'employees';
  if (base === 'URL' || base === 'url' || base === 'HP' || base.includes('ホームページ')) return 'url';
  if (base === '代表者年齢' || base === '年齢') return 'age';
  return null;
}

// ── ヘッダー配列から、マッピング初期値と単位初期値を構築 ────────
// mapping: { field: colIndex }（最初にマッチした列を優先）
// units:   { revenue: '千円', net_income: '千円' }
export function buildDefaultMapping(headers) {
  const mapping = {};
  const units = { revenue: '千円', net_income: '千円' };
  headers.forEach((h, idx) => {
    const field = detectField(h);
    if (field && mapping[field] == null) {
      mapping[field] = idx;
      if (field === 'revenue' || field === 'net_income') units[field] = detectUnit(h);
    }
  });
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
