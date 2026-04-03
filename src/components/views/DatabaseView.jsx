import { useCallback } from 'react';
import { C } from '../../constants/colors';
import { Database } from 'lucide-react';
import DatabaseFilterPanel from '../database/DatabaseFilterPanel';
import DatabaseResultTable from '../database/DatabaseResultTable';
import { useCompanySearch } from '../../hooks/useCompanySearch';
import { searchCompanies } from '../../lib/companyMasterApi';

export default function DatabaseView() {
  const {
    filters, setFilter, resetFilters,
    results, totalCount, loading, error, hasSearched,
    doSearch, setPage,
  } = useCompanySearch();

  const handleExport = useCallback(async () => {
    const confirmed = totalCount > 10000
      ? window.confirm(`${totalCount.toLocaleString()}件ありますが、最大10,000件までCSV出力します。よろしいですか？`)
      : true;
    if (!confirmed) return;

    try {
      const exportSize = Math.min(totalCount, 10000);
      const { rows } = await searchCompanies({ ...filters, page: 0, pageSize: exportSize });

      const headers = ['企業名','大分類','細分類','都道府県','市区郡','住所','電話番号','代表者','年齢','売上高(千円)','従業員数','設立年','事業内容'];
      const keys = ['company_name','industry_major','industry_sub','prefecture','city','address','phone','representative','representative_age','revenue_k','employee_count','established_year','business_description'];

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
    <div style={{ maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Database size={22} color={C.navy} />
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.navy }}>
          企業データベース
        </h2>
        <span style={{ fontSize: 12, color: C.textLight, marginLeft: 8 }}>
          482,958社 | 東京商工リサーチ
        </span>
      </div>

      {/* Filters */}
      <DatabaseFilterPanel
        filters={filters}
        setFilter={setFilter}
        onSearch={() => doSearch()}
        onReset={resetFilters}
        onExport={handleExport}
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
    </div>
  );
}
