import { useState, useCallback, useEffect } from 'react';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge } from '../ui';
import { Database, Upload, Sparkles } from 'lucide-react';
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

// CSVエクスポート対象カラム（label = CSVヘッダ, key = company_master のカラム名）
const EXPORT_COLUMNS = [
  { key: 'industry_major',       label: '大分類' },
  { key: 'industry_sub',         label: '細分類' },
  { key: 'company_name',         label: '企業名' },
  { key: 'business_description', label: '事業内容' },
  { key: 'prefecture',           label: '都道府県' },
  { key: 'city',                 label: '市区郡' },
  { key: 'address',              label: '住所' },
  { key: 'revenue_k',            label: '売上高(千円)' },
  { key: 'net_income_k',         label: '当期純利益(千円)' },
  { key: 'representative',       label: '代表者' },
  { key: 'representative_age',   label: '年齢' },
  { key: 'shareholders',         label: '株主' },
  { key: 'officers',             label: '役員' },
  { key: 'employee_count',       label: '従業員数' },
  { key: 'established_year',     label: '設立年' },
  { key: 'phone',                label: '電話番号' },
  { key: 'clients',              label: '取引先' },
  { key: 'remarks',              label: '備考' },
];

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
    if (!window.confirm(`${totalCount.toLocaleString()}件をCSV出力します。よろしいですか？`)) return;

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

      // EXPORT_COLUMNS の並び順を維持しつつ、選択されたカラムだけ抽出
      const cols = EXPORT_COLUMNS.filter(c => selectedKeys.includes(c.key));
      const headers = cols.map(c => c.label);
      const keys = cols.map(c => c.key);

      const csvRows = [headers.join(',')];
      for (const row of rows) {
        const vals = keys.map(k => {
          const v = row[k];
          if (v == null) return '';
          const s = String(v).replace(/"/g, '""');
          return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
        });
        csvRows.push(vals.join(','));
      }

      const bom = '﻿';
      const blob = new Blob([bom + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `企業データベース_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('CSV出力に失敗しました: ' + e.message);
    }
  }, [filters, totalCount]);

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        eyebrow="Sourcing · Database"
        title="Database"
        description={dbTotal != null ? `Total: ${dbTotal.toLocaleString()} companies` : undefined}
        style={{ marginBottom: 24 }}
        right={
          <>
            <Button variant="secondary" size="sm" iconLeft={<Sparkles size={14} />} onClick={() => setShowAiChat(true)}>
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
