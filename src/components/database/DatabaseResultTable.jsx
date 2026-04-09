import { useState } from 'react';
import { C } from '../../constants/colors';
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown, X } from 'lucide-react';

const thStyle = {
  padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700,
  color: C.white, background: C.navy, whiteSpace: 'nowrap', position: 'sticky', top: 0,
  cursor: 'pointer', userSelect: 'none',
};
const tdStyle = {
  padding: '7px 10px', fontSize: 12, borderBottom: `1px solid ${C.borderLight}`,
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220,
};

const COLUMNS = [
  { key: 'industry_major', label: '大分類', width: 160, sortable: true },
  { key: 'industry_sub', label: '細分類', width: 180, sortable: true },
  { key: 'company_name', label: '企業名', width: 200, sortable: true },
  { key: 'business_description', label: '事業内容', width: 300 },
  { key: 'prefecture', label: '都道府県', width: 70, sortable: true },
  { key: 'city', label: '市区郡', width: 100 },
  { key: 'address', label: '住所', width: 180 },
  { key: 'revenue_k', label: '売上高(千円)', width: 100, sortable: true },
  { key: 'net_income_k', label: '当期純利益(千円)', width: 110, sortable: true },
  { key: 'representative', label: '代表者', width: 100 },
  { key: 'representative_age', label: '年齢', width: 45, sortable: true },
  { key: 'shareholders', label: '株主', width: 180 },
  { key: 'officers', label: '役員', width: 180 },
  { key: 'employee_count', label: '従業員数', width: 65, sortable: true },
  { key: 'established_year', label: '設立年', width: 55 },
  { key: 'clients', label: '取引先', width: 220 },
  { key: 'phone', label: '電話番号', width: 120 },
  { key: 'remarks', label: '備考', width: 300 },
];

// 詳細モーダル用ラベル
const DETAIL_FIELDS = [
  { key: 'company_name', label: '企業名' },
  { key: 'industry_major', label: '大分類' },
  { key: 'industry_sub', label: '細分類' },
  { key: 'business_description', label: '事業内容' },
  { key: 'prefecture', label: '都道府県' },
  { key: 'city', label: '市区郡' },
  { key: 'address', label: '住所' },
  { key: 'full_address', label: '住所（完全）' },
  { key: 'postal_code', label: '郵便番号' },
  { key: 'phone', label: '電話番号' },
  { key: 'revenue_k', label: '売上高（千円）', fmt: true },
  { key: 'net_income_k', label: '当期純利益（千円）', fmt: true },
  { key: 'ordinary_income_k', label: '経常利益（千円）', fmt: true },
  { key: 'capital_k', label: '資本金（千円）', fmt: true },
  { key: 'representative', label: '代表者' },
  { key: 'representative_age', label: '代表者年齢', fmt: true },
  { key: 'employee_count', label: '従業員数', fmt: true },
  { key: 'established_year', label: '設立年', fmt: true },
  { key: 'shareholders', label: '株主' },
  { key: 'officers', label: '役員' },
  { key: 'clients', label: '取引先' },
  { key: 'remarks', label: '備考' },
  { key: 'source_file', label: 'ソースファイル' },
];

function formatNumber(val) {
  if (val == null) return '';
  return Number(val).toLocaleString();
}

export default function DatabaseResultTable({ results, totalCount, page, pageSize, onPageChange, loading, sortCol, sortDir, onSort }) {
  const [selectedRow, setSelectedRow] = useState(null);
  const totalPages = Math.ceil(totalCount / pageSize);

  const handleHeaderClick = (col) => {
    if (!col.sortable) return;
    if (sortCol === col.key) {
      onSort(col.key, sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      onSort(col.key, col.key === 'revenue_k' || col.key === 'net_income_k' || col.key === 'employee_count' ? 'desc' : 'asc');
    }
  };

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
            <button onClick={() => onPageChange(page - 1)} disabled={page === 0}
              style={{ background: 'none', border: 'none', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.3 : 1 }}>
              <ChevronLeft size={18} color={C.navy} />
            </button>
            <span style={{ fontSize: 12, color: C.textMid }}>{page + 1} / {totalPages.toLocaleString()}</span>
            <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages - 1}
              style={{ background: 'none', border: 'none', cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.3 : 1 }}>
              <ChevronRight size={18} color={C.navy} />
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 380px)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1800 }}>
          <thead>
            <tr>
              {COLUMNS.map(col => (
                <th key={col.key} style={{ ...thStyle, width: col.width, cursor: col.sortable ? 'pointer' : 'default' }}
                  onClick={() => handleHeaderClick(col)}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    {col.label}
                    {col.sortable && sortCol === col.key && (
                      sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                    )}
                  </span>
                </th>
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
              <tr key={row.id} style={{ background: i % 2 === 0 ? C.white : C.snow, cursor: 'pointer' }}
                onClick={() => setSelectedRow(row)}
                onMouseEnter={(e) => e.currentTarget.style.background = C.goldGlow}
                onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? C.white : C.snow}>
                {COLUMNS.map(col => (
                  <td key={col.key} style={{ ...tdStyle, maxWidth: col.width }} title={row[col.key] ?? ''}>
                    {col.key === 'revenue_k' || col.key === 'net_income_k' || col.key === 'employee_count' || col.key === 'representative_age' || col.key === 'established_year'
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
          <button onClick={() => onPageChange(0)} disabled={page === 0}
            style={paginBtn(page === 0)}>最初</button>
          <button onClick={() => onPageChange(page - 1)} disabled={page === 0}
            style={paginBtn(page === 0)}>前へ</button>
          <span style={{ fontSize: 12, color: C.textMid, minWidth: 80, textAlign: 'center' }}>
            {page + 1} / {totalPages.toLocaleString()} ページ
          </span>
          <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages - 1}
            style={paginBtn(page >= totalPages - 1)}>次へ</button>
          <button onClick={() => onPageChange(totalPages - 1)} disabled={page >= totalPages - 1}
            style={paginBtn(page >= totalPages - 1)}>最後</button>
        </div>
      )}

      {/* Detail Modal */}
      {selectedRow && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}
          onClick={() => setSelectedRow(null)}>
          <div style={{ background: C.white, borderRadius: 12, width: Math.min(700, window.innerWidth - 40), maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${C.border}`, background: C.navy, borderRadius: '12px 12px 0 0' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.white }}>{selectedRow.company_name}</div>
              <button onClick={() => setSelectedRow(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} color={C.white} />
              </button>
            </div>
            {/* Modal body */}
            <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
              {DETAIL_FIELDS.map(f => {
                const val = selectedRow[f.key];
                if (val == null || val === '') return null;
                return (
                  <div key={f.key} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textLight, marginBottom: 2 }}>{f.label}</div>
                    <div style={{ fontSize: 13, color: C.textDark, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>
                      {f.fmt ? formatNumber(val) : val}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const paginBtn = (disabled) => ({
  padding: '4px 10px', fontSize: 12, borderRadius: 4,
  border: `1px solid ${C.border}`, background: C.white,
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1,
});
