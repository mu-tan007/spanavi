import { useState, useCallback, useEffect } from 'react';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge } from '../ui';
import { Database, Upload } from 'lucide-react';
import DatabaseFilterPanel from '../database/DatabaseFilterPanel';
import DatabaseResultTable from '../database/DatabaseResultTable';
import DatabaseChatPanel from '../database/DatabaseChatPanel';
import ImportModal from '../database/ImportModal';
import DatabaseExportColumnModal from '../database/DatabaseExportColumnModal';
import TsrIndustryModal from '../TsrIndustryModal';
import { useCompanySearch } from '../../hooks/useCompanySearch';
import { searchCompanies, bulkLabelFromPairs } from '../../lib/companyMasterApi';
import { supabase } from '../../lib/supabase';
import PageHeader from '../common/PageHeader';

// CSVエクスポート対象カラム。
// 先頭14列は Spanavi の企業リスト納品標準フォーマット（クライアント渡し・NGチェック用）。
// この順序・ヘッダ名・マッピングは固定（reference: 企業リストCSV標準カラム構成）。
// defaultExport:true の14列が初期選択。それ以降は任意で追加できる参考列。
//   - 住所は full_address 優先（無ければ address）
//   - 業種は industry_sub（細分類）。大分類は標準に含めない
const EXPORT_COLUMNS = [
  // ── 標準14カラム（順序固定・デフォルトON） ──
  { key: 'company_name',         label: '企業名',     defaultExport: true },
  { key: 'tsr_id',               label: 'tsr_id',     defaultExport: true },
  { key: 'prefecture',           label: '都道府県',   defaultExport: true },
  { key: 'city',                 label: '市区町村',   defaultExport: true },
  { key: 'address',              label: '住所',       defaultExport: true, get: r => r.full_address || r.address || '' },
  { key: 'phone',                label: '電話番号',   defaultExport: true },
  { key: 'revenue_k',            label: '売上千円',   defaultExport: true },
  { key: 'employee_count',       label: '従業員数',   defaultExport: true },
  { key: 'established_year',     label: '設立年',     defaultExport: true },
  { key: 'representative',       label: '代表者',     defaultExport: true },
  { key: 'industry_sub',         label: '業種',       defaultExport: true },
  { key: 'business_description', label: '事業内容',   defaultExport: true },
  { key: 'shareholders',         label: '株主',       defaultExport: true },
  { key: 'officers',             label: '役員',       defaultExport: true },
  // ── 任意追加列（デフォルトOFF。明示的に選んだ時だけ末尾に付く） ──
  { key: 'industry_major',       label: '大分類',           defaultExport: false },
  { key: 'net_income_k',         label: '当期純利益(千円)', defaultExport: false },
  { key: 'representative_age',   label: '代表者年齢',       defaultExport: false },
  { key: 'capital_k',            label: '資本金(千円)',     defaultExport: false },
  { key: 'clients',              label: '取引先',           defaultExport: false },
  { key: 'remarks',              label: '備考',             defaultExport: false },
];

// 納品フォーマットは全フィールド QUOTE_ALL（カンマ・改行・前後空白の事故防止）
const csvQuote = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export default function DatabaseView({ isAdmin }) {
  const {
    filters, setFilter, setFilters, resetFilters,
    results, totalCount, loading, error, hasSearched,
    doSearch, setPage,
  } = useCompanySearch();

  // AIチャットパネルから渡された filters を一括反映 → 即検索
  const handleApplyFromChat = useCallback((newFilters) => {
    setFilters(() => ({ ...newFilters, page: 0 }));
    doSearch({ ...newFilters, page: 0 });
  }, [setFilters, doSearch]);
  const [showImport, setShowImport] = useState(false);
  const [showTsrModal, setShowTsrModal] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [showAiChat, setShowAiChat] = useState(false);
  const [dbTotal, setDbTotal] = useState(null);
  const [labelImporting, setLabelImporting] = useState(false);

  // 【一時】「M&Aニーズあり」Excel/CSV一括取込。1回投入したらこのボタン群は撤去する。
  const handleMaNeedsImport = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLabelImporting(true);
    try {
      const norm = (s) => String(s || '').replace(/[\s　]/g, '').replace(/\(.*?\)|（.*?）/g, '');
      const NAME_H = ['企業名', '会社名', '法人名', '社名'];
      const PHONE_H = ['電話番号', '電話', 'TEL', 'tel', 'Tel'];
      const pairs = [];
      const ext = file.name.split('.').pop().toLowerCase();
      if (ext === 'csv' || ext === 'tsv') {
        const text = await file.text();
        const sep = ext === 'tsv' ? '\t' : ',';
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const split = (l) => l.split(sep).map(s => s.replace(/^﻿/, '').replace(/^"|"$/g, '').trim());
        const hdrs = split(lines[0]);
        const nameIdx = hdrs.findIndex(h => NAME_H.includes(norm(h)));
        const phoneIdx = hdrs.findIndex(h => PHONE_H.includes(norm(h)));
        if (nameIdx < 0 || phoneIdx < 0) { alert('「企業名」「電話番号」の列が見つかりませんでした。'); return; }
        for (const r of lines.slice(1).map(split)) {
          const n = (r[nameIdx] || '').trim(), p = (r[phoneIdx] || '').trim();
          if (n && p) pairs.push({ n, p });
        }
      } else {
        // 列番号を特定して cell.text で取り出す（row.values の添字ズレ・リッチテキスト化けを防ぐ）
        const ExcelJS = (await import('exceljs')).default;
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await file.arrayBuffer());
        const ws = wb.worksheets[0];
        let nameCol = -1, phoneCol = -1;
        ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
          const h = norm(cell.text);
          if (nameCol < 0 && NAME_H.includes(h)) nameCol = col;
          if (phoneCol < 0 && PHONE_H.includes(h)) phoneCol = col;
        });
        if (nameCol < 0 || phoneCol < 0) { alert('「企業名」「電話番号」の列が見つかりませんでした。'); return; }
        ws.eachRow({ includeEmpty: false }, (row, rn) => {
          if (rn === 1) return;
          const n = String(row.getCell(nameCol).text || '').trim();
          const p = String(row.getCell(phoneCol).text || '').trim();
          if (n && p) pairs.push({ n, p });
        });
      }
      if (!pairs.length) { alert('取り込める行がありませんでした（企業名・電話番号の列をご確認ください）。'); return; }

      let matched = 0, inserted = 0;
      const B = 1500;
      for (let i = 0; i < pairs.length; i += B) {
        const res = await bulkLabelFromPairs('M&Aニーズあり', pairs.slice(i, i + B));
        if (res?.error) { alert('取込に失敗しました: ' + (res.error.message || '')); return; }
        matched += res.matched || 0; inserted += res.inserted || 0;
      }
      alert(`「M&Aニーズあり」取込完了\n対象 ${pairs.length.toLocaleString()}件 / 企業DB突合 ${matched.toLocaleString()}件 / 新規付与 ${inserted.toLocaleString()}件\n（突合できなかった先はTSR企業DB未収録です）`);
    } catch (err) {
      alert('取込エラー: ' + err.message);
    } finally {
      setLabelImporting(false);
    }
  }, []);

  useEffect(() => {
    supabase.from('company_master').select('id', { count: 'exact', head: true })
      .then(({ count }) => setDbTotal(count));
  }, [showImport]);

  const handleExport = useCallback(() => {
    if (totalCount === 0) return;
    setShowColumnPicker(true);
  }, [totalCount]);

  const executeExport = useCallback(async (selectedKeys) => {
    setShowColumnPicker(false);
    if (!selectedKeys || selectedKeys.length === 0) return;
    // 大量件数はブラウザ負荷が大きいので段階的に警告する
    const msg = totalCount > 50000
      ? `${totalCount.toLocaleString()}件は大量です。全件取得に時間がかかり、ブラウザが重くなる場合があります。続行しますか？`
      : `${totalCount.toLocaleString()}件をCSV出力します。よろしいですか？`;
    if (!window.confirm(msg)) return;

    try {
      // 全件取得（Supabase PostgREST max_rows=1000のためページ分割）
      const PAGE = 1000;
      let allRows = [];
      for (let p = 0; p * PAGE < totalCount; p++) {
        const { rows } = await searchCompanies({ ...filters, page: p, pageSize: PAGE });
        allRows = allRows.concat(rows);
        if (rows.length < PAGE) break;
      }
      const rows = allRows;

      // EXPORT_COLUMNS の並び順（=納品標準の順序）を維持しつつ選択列だけ抽出
      const cols = EXPORT_COLUMNS.filter(c => selectedKeys.includes(c.key));
      const headers = cols.map(c => csvQuote(c.label));

      const csvRows = [headers.join(',')];
      for (const row of rows) {
        const vals = cols.map(c => csvQuote(c.get ? c.get(row) : row[c.key]));
        csvRows.push(vals.join(','));
      }

      const bom = '﻿';
      const blob = new Blob([bom + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `企業リスト_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('CSV出力に失敗しました: ' + e.message);
    }
  }, [filters, totalCount]);

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title="企業DB"
        description={dbTotal != null ? `Total: ${dbTotal.toLocaleString()} companies` : undefined}
        style={{ marginBottom: 24 }}
        right={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowAiChat(true)}>
              AIで検索
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowTsrModal(true)}>
              TSR業種分類一覧
            </Button>
            {isAdmin && (
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', borderRadius: radius.md, cursor: labelImporting ? 'default' : 'pointer',
                fontSize: font.size.sm, fontWeight: font.weight.medium, fontFamily: font.family.sans,
                border: `1px solid ${color.gold}`, background: color.white, color: color.navyDeep,
                opacity: labelImporting ? 0.6 : 1, whiteSpace: 'nowrap',
              }} title="【一時】Excelを1回アップロードするとM&Aニーズありを付与。完了後に撤去します。">
                <Upload size={14} />
                {labelImporting ? '取込中...' : 'M&Aニーズあり取込（一時）'}
                <input type="file" accept=".xlsx,.csv,.tsv" onChange={handleMaNeedsImport} disabled={labelImporting} style={{ display: 'none' }} />
              </label>
            )}
            {isAdmin && (
              <Button size="sm" iconLeft={<Upload size={14} />} onClick={() => setShowImport(true)}>
                リストインポート
              </Button>
            )}
          </>
        }
      />

      {/* Filters */}
      <DatabaseFilterPanel
        filters={filters}
        setFilter={setFilter}
        onSearch={() => doSearch()}
        onReset={resetFilters}
        onExport={isAdmin ? handleExport : null}
        loading={loading}
        totalCount={totalCount}
        hasSearched={hasSearched}
      />

      {/* Error */}
      {error && (
        <Card padding="sm" style={{ background: color.dangerSoft, borderColor: alpha(color.danger, 0.25), marginBottom: 12 }}>
          <div style={{ color: color.danger, fontSize: font.size.base }}>
            エラー: {error}
          </div>
        </Card>
      )}

      {/* Results */}
      {hasSearched && (
        <DatabaseResultTable
          results={results}
          totalCount={totalCount}
          page={filters.page}
          pageSize={filters.pageSize}
          onPageChange={setPage}
          loading={loading}
          sortCol={filters.sortCol}
          sortDir={filters.sortDir}
          onSort={(col, dir) => {
            setFilter('sortCol', col);
            setFilter('sortDir', dir);
            const newF = { ...filters, sortCol: col, sortDir: dir, page: 0 };
            doSearch(newF);
          }}
        />
      )}

      {/* Initial state */}
      {!hasSearched && !loading && (
        <Card padding="none" style={{ textAlign: 'center', padding: '60px 20px', color: color.textLight }}>
          <Database size={48} color={color.border} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: font.size.md + 1, marginBottom: 6 }}>条件を指定して検索してください</div>
          <div style={{ fontSize: font.size.sm }}>業種・エリア・売上高・従業員数・代表者年齢・電話番号などで絞り込めます</div>
        </Card>
      )}

      {showTsrModal && <TsrIndustryModal onClose={() => setShowTsrModal(false)} />}

      {/* Import Modal */}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImportComplete={() => { if (hasSearched) doSearch(); }}
        />
      )}

      {/* CSV Export Column Picker */}
      {showColumnPicker && (
        <DatabaseExportColumnModal
          columns={EXPORT_COLUMNS}
          totalCount={totalCount}
          onCancel={() => setShowColumnPicker(false)}
          onConfirm={executeExport}
        />
      )}

      {/* AI チャット検索ドロワー */}
      <DatabaseChatPanel
        open={showAiChat}
        onClose={() => setShowAiChat(false)}
        baseFilters={filters}
        onApplyFilters={(f) => { setShowAiChat(false); handleApplyFromChat(f); }}
      />
    </div>
  );
}
