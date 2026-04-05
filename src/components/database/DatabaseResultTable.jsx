import { C } from '../../constants/colors';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const thStyle = {
  padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700,
  color: C.white, background: C.navy, whiteSpace: 'nowrap', position: 'sticky', top: 0,
};
const tdStyle = {
  padding: '7px 10px', fontSize: 12, borderBottom: `1px solid ${C.borderLight}`,
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220,
};

const COLUMNS = [
  { key: 'industry_major', label: '大分類', width: 160 },
  { key: 'industry_sub', label: '細分類', width: 180 },
  { key: 'company_name', label: '企業名', width: 200 },
  { key: 'business_description', label: '事業内容', width: 300 },
  { key: 'prefecture', label: '都道府県', width: 70 },
  { key: 'city', label: '市区郡', width: 100 },
  { key: 'address', label: '住所', width: 180 },
  { key: 'revenue_k', label: '売上高(千円)', width: 100 },
  { key: 'net_income_k', label: '当期純利益(千円)', width: 110 },
  { key: 'representative', label: '代表者', width: 100 },
  { key: 'representative_age', label: '年齢', width: 45 },
  { key: 'shareholders', label: '株主', width: 180 },
  { key: 'officers', label: '役員', width: 180 },
  { key: 'employee_count', label: '従業員数', width: 65 },
  { key: 'established_year', label: '設立年', width: 55 },
  { key: 'clients', label: '取引先', width: 220 },
  { key: 'phone', label: '電話番号', width: 120 },
  { key: 'remarks', label: '備考', width: 300 },
];

function formatNumber(val) {
  if (val == null) return '';
  return Number(val).toLocaleString();
}

export default function DatabaseResultTable({ results, totalCount, page, pageSize, onPageChange, loading }) {
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div style={{
      background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
      overflow: 'hidden',
    }}>
      {/* Header bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.cream,
      }}>
        <div style={{ fontSize: 13, color: C.textDark, fontWeight: 600 }}>
          検索結果: <span style={{ color: C.navyLight }}>{totalCount.toLocaleString()}</span> 件
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => onPageChange(page - 1)} disabled={page === 0}
              style={{ background: 'none', border: 'none', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.3 : 1 }}
            >
              <ChevronLeft size={18} color={C.navy} />
            </button>
            <span style={{ fontSize: 12, color: C.textMid }}>
              {page + 1} / {totalPages.toLocaleString()}
            </span>
            <button
              onClick={() => onPageChange(page + 1)} disabled={page >= totalPages - 1}
              style={{ background: 'none', border: 'none', cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.3 : 1 }}
            >
              <ChevronRight size={18} color={C.navy} />
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 380px)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1400 }}>
          <thead>
            <tr>
              {COLUMNS.map(col => (
                <th key={col.key} style={{ ...thStyle, width: col.width }}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={COLUMNS.length} style={{ ...tdStyle, textAlign: 'center', padding: 40, color: C.textLight }}>
                検索中...
              </td></tr>
            ) : results.length === 0 ? (
              <tr><td colSpan={COLUMNS.length} style={{ ...tdStyle, textAlign: 'center', padding: 40, color: C.textLight }}>
                該当する企業が見つかりませんでした
              </td></tr>
            ) : results.map((row, i) => (
              <tr key={row.id} style={{ background: i % 2 === 0 ? C.white : C.snow }}>
                {COLUMNS.map(col => (
                  <td key={col.key} style={{ ...tdStyle, maxWidth: col.width }} title={row[col.key] ?? ''}>
                    {col.key === 'revenue_k' || col.key === 'employee_count' || col.key === 'representative_age' || col.key === 'established_year'
                      ? formatNumber(row[col.key])
                      : (row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8,
          padding: '10px 16px', borderTop: `1px solid ${C.border}`, background: C.cream,
        }}>
          <button
            onClick={() => onPageChange(0)} disabled={page === 0}
            style={{ padding: '4px 10px', fontSize: 12, borderRadius: 4, border: `1px solid ${C.border}`, background: C.white, cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.3 : 1 }}
          >
            最初
          </button>
          <button
            onClick={() => onPageChange(page - 1)} disabled={page === 0}
            style={{ padding: '4px 10px', fontSize: 12, borderRadius: 4, border: `1px solid ${C.border}`, background: C.white, cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.3 : 1 }}
          >
            前へ
          </button>
          <span style={{ fontSize: 12, color: C.textMid, minWidth: 80, textAlign: 'center' }}>
            {page + 1} / {totalPages.toLocaleString()} ページ
          </span>
          <button
            onClick={() => onPageChange(page + 1)} disabled={page >= totalPages - 1}
            style={{ padding: '4px 10px', fontSize: 12, borderRadius: 4, border: `1px solid ${C.border}`, background: C.white, cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.3 : 1 }}
          >
            次へ
          </button>
          <button
            onClick={() => onPageChange(totalPages - 1)} disabled={page >= totalPages - 1}
            style={{ padding: '4px 10px', fontSize: 12, borderRadius: 4, border: `1px solid ${C.border}`, background: C.white, cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.3 : 1 }}
          >
            最後
          </button>
        </div>
      )}
    </div>
  );
}
