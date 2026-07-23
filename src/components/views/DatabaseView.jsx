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
import { searchCompanies } from '../../lib/companyMasterApi';
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
