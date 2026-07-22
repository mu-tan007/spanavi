import { useState, useEffect, useMemo } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge } from '../ui';
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown, X } from 'lucide-react';
import { CALL_RESULTS } from '../../constants/callResults';
import { fetchCompanyCallHistory, fetchCompanyLabels, toggleCompanyLabel, DB_LABEL_OPTIONS } from '../../lib/companyMasterApi';

// 架電ステータスのラベル→色（企業DB詳細の履歴バッジ用）。org既定=CALL_RESULTS。
const STATUS_STYLE = CALL_RESULTS.reduce((m, s) => { m[s.label] = { color: s.color, bg: s.bg }; return m; }, {});
const statusStyle = (label) => STATUS_STYLE[label] || { color: '#6B7280', bg: '#6B728018' };

const thStyle = {
  padding: `${space[2]}px ${space[2.5]}px`, textAlign: 'left', fontSize: font.size.xs, fontWeight: font.weight.bold,
  color: color.white, background: color.navy, whiteSpace: 'nowrap', position: 'sticky', top: 0,
  cursor: 'pointer', userSelect: 'none',
};
const tdStyle = {
  padding: `7px ${space[2.5]}px`, fontSize: font.size.sm, borderBottom: `1px solid ${color.borderLight}`,
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
  { key: 'established_year', label: '設立年', width: 55, sortable: true },
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
];

function formatNumber(val) {
  if (val == null) return '';
  return Number(val).toLocaleString();
}

export default function DatabaseResultTable({ results, totalCount, page, pageSize, onPageChange, loading, sortCol, sortDir, onSort }) {
  const [selectedRow, setSelectedRow] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [labels, setLabels] = useState([]);
  const [labelBusy, setLabelBusy] = useState(false);
  const totalPages = Math.ceil(totalCount / pageSize);

  // 詳細モーダルを開いたら、その企業（企業名＋電話一致）の全リスト架電履歴＋企業DBラベルを取得
  useEffect(() => {
    if (!selectedRow) { setHistory([]); setLabels([]); return; }
    let cancelled = false;
    setHistoryLoading(true);
    fetchCompanyCallHistory(selectedRow.company_name, selectedRow.phone)
      .then(({ rows }) => { if (!cancelled) setHistory(rows); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    fetchCompanyLabels(selectedRow.id).then(ls => { if (!cancelled) setLabels(ls); });
    return () => { cancelled = true; };
  }, [selectedRow]);

  const handleToggleLabel = async (label) => {
    if (!selectedRow || labelBusy) return;
    const on = !labels.includes(label);
    setLabelBusy(true);
    const { error } = await toggleCompanyLabel(selectedRow.id, label, on);
    if (!error) setLabels(prev => on ? [...new Set([...prev, label])] : prev.filter(l => l !== label));
    else alert('ラベル更新に失敗しました: ' + (error.message || '不明なエラー'));
    setLabelBusy(false);
  };

  // リスト単位にまとめる（各リストのラウンド別レコード）
  const historyByList = useMemo(() => {
    const map = new Map();
    for (const r of history) {
      if (!map.has(r.list_id)) {
        map.set(r.list_id, {
          list_id: r.list_id, list_name: r.list_name,
          is_archived: r.is_archived, item_call_status: r.item_call_status, records: [],
        });
      }
      if (r.round != null || r.status != null) map.get(r.list_id).records.push(r);
    }
    return [...map.values()];
  }, [history]);

  // この企業が持つ架電ステータス一式（複数リストで異なりうるので全て表示）
  const distinctStatuses = useMemo(() => {
    const seen = new Set(); const out = [];
    for (const r of history) { if (r.status && !seen.has(r.status)) { seen.add(r.status); out.push(r.status); } }
    return out;
  }, [history]);

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
      background: color.white, borderRadius: radius.lg + 4, border: `1px solid ${color.border}`,
      overflow: 'hidden',
    }}>
      {/* Header bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: `${space[2.5]}px ${space[4]}px`, borderBottom: `1px solid ${color.border}`, background: color.cream,
      }}>
        <div style={{ fontSize: font.size.base, color: color.textDark, fontWeight: font.weight.semibold }}>
          検索結果: <span style={{ color: color.navyLight }}>{totalCount.toLocaleString()}</span> 件
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
            <button onClick={() => onPageChange(page - 1)} disabled={page === 0}
              style={{ background: 'none', border: 'none', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.3 : 1 }}>
              <ChevronLeft size={18} color={color.navy} />
            </button>
            <span style={{ fontSize: font.size.sm, color: color.textMid }}>{page + 1} / {totalPages.toLocaleString()}</span>
            <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages - 1}
              style={{ background: 'none', border: 'none', cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.3 : 1 }}>
              <ChevronRight size={18} color={color.navy} />
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
              <tr><td colSpan={COLUMNS.length} style={{ ...tdStyle, textAlign: 'center', padding: space[10], color: color.textLight }}>
                検索中...
              </td></tr>
            ) : results.length === 0 ? (
              <tr><td colSpan={COLUMNS.length} style={{ ...tdStyle, textAlign: 'center', padding: space[10], color: color.textLight }}>
                該当する企業が見つかりませんでした
              </td></tr>
            ) : results.map((row, i) => (
              <tr key={row.id} style={{ background: i % 2 === 0 ? color.white : color.snow, cursor: 'pointer' }}
                onClick={() => setSelectedRow(row)}
                onMouseEnter={(e) => e.currentTarget.style.background = color.goldGlow}
                onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? color.white : color.snow}>
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
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: space[2],
          padding: `${space[2.5]}px ${space[4]}px`, borderTop: `1px solid ${color.border}`, background: color.cream,
        }}>
          <button onClick={() => onPageChange(0)} disabled={page === 0}
            style={paginBtn(page === 0)}>最初</button>
          <button onClick={() => onPageChange(page - 1)} disabled={page === 0}
            style={paginBtn(page === 0)}>前へ</button>
          <span style={{ fontSize: font.size.sm, color: color.textMid, minWidth: 80, textAlign: 'center' }}>
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
          <div style={{ background: color.white, borderRadius: radius.xl, width: Math.min(700, window.innerWidth - 40), maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: shadow.xl }}
            onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${space[4]}px ${space[5]}px`, borderBottom: `1px solid ${color.border}`, background: color.navy, borderRadius: `${radius.xl}px ${radius.xl}px 0 0` }}>
              <div style={{ fontSize: font.size.md + 1, fontWeight: font.weight.bold, color: color.white }}>{selectedRow.company_name}</div>
              <button onClick={() => setSelectedRow(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} color={color.white} />
              </button>
            </div>
            {/* Modal body */}
            <div style={{ flex: 1, overflow: 'auto', padding: space[5] }}>
              {/* 企業DBラベル（会社属性タグ。ON/OFF可） */}
              <div style={{ marginBottom: space[4], display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
                <span style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy }}>企業DBラベル</span>
                {DB_LABEL_OPTIONS.map(label => {
                  const on = labels.includes(label);
                  return (
                    <button key={label} onClick={() => handleToggleLabel(label)} disabled={labelBusy} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '4px 12px', borderRadius: radius.pill, cursor: labelBusy ? 'default' : 'pointer',
                      fontSize: font.size.xs, fontWeight: font.weight.bold,
                      border: `1px solid ${on ? color.gold : color.border}`,
                      background: on ? color.gold : color.white,
                      color: on ? color.navyDeep : color.textMid,
                    }} title={on ? 'クリックで解除' : 'クリックで付与'}>
                      <span style={{ fontSize: 13 }}>{on ? '●' : '○'}</span>{label}
                    </button>
                  );
                })}
              </div>

              {/* 架電履歴（全リスト横断・企業名＋電話一致） */}
              <div style={{ marginBottom: space[5] }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[2] }}>
                  <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy }}>架電履歴</div>
                  {!historyLoading && distinctStatuses.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {distinctStatuses.map(s => {
                        const st = statusStyle(s);
                        return (
                          <span key={s} style={{
                            fontSize: 10, fontWeight: font.weight.bold, color: st.color, background: st.bg,
                            padding: '2px 7px', borderRadius: radius.pill, whiteSpace: 'nowrap',
                          }}>{s}</span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {historyLoading ? (
                  <div style={{ fontSize: font.size.xs, color: color.textLight }}>照合中...</div>
                ) : !selectedRow.phone ? (
                  <div style={{ fontSize: font.size.xs, color: color.textLight }}>
                    電話番号が未登録のため架電履歴を照合できません。
                  </div>
                ) : historyByList.length === 0 ? (
                  <div style={{ fontSize: font.size.xs, color: color.textMid }}>
                    どのリストにも未登録です（架電履歴なし）。
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
                    {historyByList.map(g => (
                      <div key={g.list_id} style={{
                        border: `1px solid ${color.border}`, borderRadius: radius.md, padding: `${space[2]}px ${space[3]}px`,
                        background: g.is_archived ? color.snow : color.white,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: g.records.length ? 6 : 0 }}>
                          <span style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.textDark }}>{g.list_name}</span>
                          {g.is_archived && (
                            <span style={{
                              fontSize: 9, fontWeight: font.weight.bold, color: color.textMid, background: alpha(color.textMid, 0.1),
                              padding: '1px 6px', borderRadius: radius.pill,
                            }}>アーカイブ</span>
                          )}
                        </div>
                        {g.records.length === 0 ? (
                          <span style={{ fontSize: font.size.xs, color: color.textLight }}>未架電</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {g.records.map((r, ri) => {
                              const st = statusStyle(r.status);
                              return (
                                <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.xs }}>
                                  <span style={{ color: color.textMid, minWidth: 44 }}>{r.round != null ? `${r.round}回目` : '—'}</span>
                                  <span style={{
                                    fontSize: 10, fontWeight: font.weight.bold, color: st.color, background: st.bg,
                                    padding: '2px 7px', borderRadius: radius.pill, whiteSpace: 'nowrap',
                                  }}>{r.status || '—'}</span>
                                  <span style={{ color: color.textLight, fontFamily: font.family.mono }}>
                                    {r.called_at ? String(r.called_at).slice(0, 10) : ''}
                                  </span>
                                  {r.getter_name && <span style={{ color: color.textLight }}>{r.getter_name}</span>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 企業マスタ詳細 */}
              {DETAIL_FIELDS.map(f => {
                const val = selectedRow[f.key];
                if (val == null || val === '') return null;
                return (
                  <div key={f.key} style={{ marginBottom: space[3] }}>
                    <div style={{ fontSize: 10, fontWeight: font.weight.bold, color: color.textLight, marginBottom: 2 }}>{f.label}</div>
                    <div style={{ fontSize: font.size.base, color: color.textDark, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>
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
  padding: `4px ${space[2.5]}px`, fontSize: font.size.sm, borderRadius: radius.md,
  border: `1px solid ${color.border}`, background: color.white,
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1,
});
