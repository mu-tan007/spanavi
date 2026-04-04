import { useState, useCallback, useEffect } from 'react';
import { C } from '../../constants/colors';
import { Database, Upload } from 'lucide-react';
import DatabaseFilterPanel from '../database/DatabaseFilterPanel';
import DatabaseResultTable from '../database/DatabaseResultTable';
import ImportModal from '../database/ImportModal';
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
  const [dbTotal, setDbTotal] = useState(null);

  useEffect(() => {
    supabase.from('company_master').select('id', { count: 'exact', head: true })
      .then(({ count }) => setDbTotal(count));
  }, [showImport]);

  const handleExport = useCallback(async () => {
    const confirmed = totalCount > 10000
      ? window.confirm(`${totalCount.toLocaleString()}件ありますが、最大10,000件までCSV出力します。よろしいですか？`)
      : true;
    if (!confirmed) return;

    try {
      const exportSize = Math.min(totalCount, 10000);
      const { rows } = await searchCompanies({ ...filters, page: 0, pageSize: exportSize });

      const headers = ['企業名','大分類','細分類','都道府県','市区郡','住所','電話番号','代表者','年齢','売上高(千円)','当期純利益(千円)','従業員数','設立年','事業内容'];
      const keys = ['company_name','industry_major','industry_sub','prefecture','city','address','phone','representative','representative_age','revenue_k','net_income_k','employee_count','established_year','business_description'];

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
