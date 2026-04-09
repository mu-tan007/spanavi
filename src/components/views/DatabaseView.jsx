import { useState, useCallback, useEffect } from 'react';
import { C } from '../../constants/colors';
import { Database, Upload } from 'lucide-react';
import DatabaseFilterPanel from '../database/DatabaseFilterPanel';
import DatabaseResultTable from '../database/DatabaseResultTable';
import ImportModal from '../database/ImportModal';
import TsrIndustryModal from '../TsrIndustryModal';
import { useCompanySearch } from '../../hooks/useCompanySearch';
import { searchCompanies } from '../../lib/companyMasterApi';
import { supabase } from '../../lib/supabase';

export default function DatabaseView({ isAdmin }) {
  const {
    filters, setFilter, resetFilters,
    results, totalCount, loading, error, hasSearched,
    doSearch, setPage,
  } = useCompanySearch();
  const [showImport, setShowImport] = useState(false);
  const [showTsrModal, setShowTsrModal] = useState(false);
  const [dbTotal, setDbTotal] = useState(null);

  useEffect(() => {
    supabase.from('company_master').select('id', { count: 'exact', head: true })
      .then(({ count }) => setDbTotal(count));
  }, [showImport]);

  const handleExport = useCallback(async () => {
    if (!window.confirm(`${totalCount.toLocaleString()}件をCSV出力します。よろしいですか？`)) return;

    try {
      // 全件取得（ページ分割して結合）
      const PAGE = 5000;
      let allRows = [];
      for (let p = 0; p * PAGE < totalCount; p++) {
        const { rows } = await searchCompanies({ ...filters, page: p, pageSize: PAGE });
        allRows = allRows.concat(rows);
        if (rows.length < PAGE) break;
      }
      const rows = allRows;

      const headers = ['大分類','細分類','企業名','事業内容','都道府県','市区郡','住所','売上高(千円)','当期純利益(千円)','代表者','年齢','株主','役員','従業員数','設立年','取引先','電話番号','備考'];
      const keys = ['industry_major','industry_sub','company_name','business_description','prefecture','city','address','revenue_k','net_income_k','representative','representative_age','shareholders','officers','employee_count','established_year','phone','clients','remarks'];

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

      const bom = '\uFEFF';
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
    <div style={{ maxWidth: 1400, animation: 'fadeIn 0.3s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#0D2247', letterSpacing: '-0.3px' }}>Database</div>
          {dbTotal != null && (
            <div style={{ fontSize: 12, color: C.textLight, marginTop: 2 }}>
              Total: {dbTotal.toLocaleString()} companies
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setShowTsrModal(true)}
            style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#0D2247', fontFamily: "'Noto Sans JP'" }}>
            TSR業種分類一覧
          </button>
          {isAdmin && (
            <button onClick={() => setShowImport(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: C.navy, color: C.white, border: 'none',
              borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>
              <Upload size={15} /> リストインポート
            </button>
          )}
        </div>
      </div>

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
        <div style={{ padding: 12, background: '#FEE', borderRadius: 8, color: '#C00', fontSize: 13, marginBottom: 12 }}>
          エラー: {error}
        </div>
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
        <div style={{
          textAlign: 'center', padding: '60px 20px', color: C.textLight,
          background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
        }}>
          <Database size={48} color={C.border} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 15, marginBottom: 6 }}>条件を指定して検索してください</div>
          <div style={{ fontSize: 12 }}>業種・エリア・売上高・従業員数・代表者年齢・電話番号などで絞り込めます</div>
        </div>
      )}

      {showTsrModal && <TsrIndustryModal onClose={() => setShowTsrModal(false)} />}

      {/* Import Modal */}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImportComplete={() => { if (hasSearched) doSearch(); }}
        />
      )}
    </div>
  );
}
