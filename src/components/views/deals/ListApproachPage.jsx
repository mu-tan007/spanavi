import React, { useEffect, useMemo, useState } from 'react';
import { C } from '../../../constants/colors';
import { fetchAllRpc } from '../../../lib/fetchAllRpc';

const PAGE_SIZE = 100;

// リスト内各企業のアプローチ詳細をフルページで表示。
// - 横に並んだ架電履歴 (1回目 / 2回目 / ... が列として広がる)
// - 100 件ごとのページネーション
// - CSV (Excel 互換) エクスポートも全件 × 全架電を網羅
export default function ListApproachPage({ list, orgId, onBack }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // PostgREST の max_rows (1000) を超える件数も取得するため chunk 連続 fetch
      const { data, error } = await fetchAllRpc(
        'sourcing_list_approach_detail',
        { p_list_id: list.list_id, p_org_id: orgId },
        1000,
      );
      if (cancelled) return;
      if (error) console.error('[ListApproachPage]', error);
      setItems(data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [list.list_id, orgId]);

  // jsonb → 配列正規化。supabase-js が返すのは配列だが、万一 string だった場合に備える
  const parseCalls = (raw) => {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
    }
    return [];
  };

  // 絞り込み
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (q ? items.filter(it => (it.company || '').toLowerCase().includes(q)) : items)
      .map(it => ({ ...it, _calls: parseCalls(it.calls) }));
  }, [items, filter]);

  // 表示中の全行で最大の「架電回数」を求める (横幅決定用)
  const maxCallCount = useMemo(
    () => filtered.reduce((m, it) => Math.max(m, it._calls.length), 0),
    [filtered]
  );

  // ページング
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  );
  useEffect(() => { setPage(1); }, [filter]);

  // CSV エクスポート: 企業 × 架電回数分のセルを横に並べて出力
  const handleExport = () => {
    const esc = (v) => {
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return /[,"\n\r]/.test(s) ? `"${s}"` : s;
    };
    // header
    const header = ['No', '企業名'];
    for (let i = 1; i <= maxCallCount; i++) {
      header.push(`${i}回目 日時`, `${i}回目 ステータス`, `${i}回目 架電者`);
    }
    const rows = [header.map(esc).join(',')];

    for (const it of filtered) {
      const calls = it._calls;
      const row = [it.no ?? '', it.company ?? ''];
      for (let i = 0; i < maxCallCount; i++) {
        const c = calls[i];
        if (!c) {
          row.push('', '', '');
        } else {
          const dt = c.called_at
            ? new Date(c.called_at).toLocaleString('ja-JP', { hour12: false })
            : '';
          row.push(dt, c.status || '', c.getter_name || '');
        }
      }
      rows.push(row.map(esc).join(','));
    }

    const bom = '\uFEFF';
    const blob = new Blob([bom + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (list.list_name || 'list').replace(/[^\w\u3040-\u30ff\u4e00-\u9fff]/g, '_');
    a.href = url;
    a.download = `架電詳細_${safeName}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ヘッダー: 戻る / タイトル / 検索 / エクスポート */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', background: C.white, border: `1px solid ${C.border}`, borderRadius: 4,
        flexWrap: 'wrap', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack}
            style={{
              padding: '5px 12px', fontSize: 11, fontWeight: 600,
              background: C.white, color: C.navy,
              border: `1px solid ${C.border}`, borderRadius: 4, cursor: 'pointer',
            }}
          >← 戻る</button>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>
              {list.list_name} — 各企業のアプローチ詳細
            </div>
            <div style={{ fontSize: 10, color: C.textMid, marginTop: 2 }}>
              {filtered.length}社 (全 {items.length}社)
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="企業名で絞り込み"
            style={{ padding: '6px 10px', fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 3, width: 200 }}
          />
          <button onClick={handleExport} disabled={loading || items.length === 0}
            style={{
              fontSize: 11, fontWeight: 600, padding: '6px 12px',
              background: (loading || items.length === 0) ? C.cream : C.navy,
              color: (loading || items.length === 0) ? C.textLight : C.white,
              border: 'none', borderRadius: 3,
              cursor: (loading || items.length === 0) ? 'not-allowed' : 'pointer',
            }}
          >⬇ Excel 出力</button>
        </div>
      </div>

      {/* テーブル */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 4 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.textMid }}>読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.textLight }}>該当企業がありません</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%' }}>
              <thead>
                <tr style={{ background: C.cream, borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ ...th, width: 40 }}>#</th>
                  <th style={{ ...th, textAlign: 'left', minWidth: 220, position: 'sticky', left: 0, background: C.cream, zIndex: 2 }}>企業名</th>
                  {Array.from({ length: maxCallCount }).map((_, i) => (
                    <th key={i} style={{ ...th, minWidth: 180 }}>{i + 1}回目</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageItems.map(it => {
                  const calls = it._calls;
                  return (
                    <tr key={it.item_id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                      <td style={{ ...td, fontFamily: "'JetBrains Mono',monospace", color: C.textLight }}>{it.no ?? '—'}</td>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 500, color: C.navy, position: 'sticky', left: 0, background: C.white, zIndex: 1 }}>
                        {it.company || '—'}
                      </td>
                      {Array.from({ length: maxCallCount }).map((_, i) => {
                        const c = calls[i];
                        if (!c) return <td key={i} style={{ ...td, color: C.textLight }}>—</td>;
                        return (
                          <td key={i} style={{ ...td, textAlign: 'left', padding: '6px 10px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontFamily: "'JetBrains Mono',monospace", color: C.textMid, fontSize: 10 }}>
                                {c.called_at
                                  ? new Date(c.called_at).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' }) +
                                    ' ' +
                                    new Date(c.called_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
                                  : '—'}
                              </span>
                              <span style={{ color: statusColor(c.status), fontWeight: 500 }}>{c.status || '—'}</span>
                              {c.getter_name && <span style={{ fontSize: 9, color: C.textLight }}>{c.getter_name}</span>}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ページネーション */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '8px 0' }}>
          <button disabled={currentPage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
            style={pagerBtn(currentPage <= 1)}>← 前の100件</button>
          <span style={{ fontSize: 11, color: C.textMid, minWidth: 140, textAlign: 'center' }}>
            {currentPage} / {totalPages} ページ ({filtered.length.toLocaleString()}社)
          </span>
          <button disabled={currentPage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            style={pagerBtn(currentPage >= totalPages)}>次の100件 →</button>
        </div>
      )}
    </div>
  );
}

function statusColor(status) {
  if (!status) return C.textMid;
  if (status.includes('アポ')) return C.green;
  if (status.includes('お断り') || status.includes('ブロック')) return '#C0392B';
  if (status.includes('不在') || status.includes('再コール')) return C.gold;
  return C.textMid;
}

function pagerBtn(disabled) {
  return {
    padding: '6px 14px', fontSize: 11, fontWeight: 600,
    background: disabled ? C.cream : C.white, color: disabled ? C.textLight : C.navy,
    border: `1px solid ${disabled ? C.border : C.navy}`,
    borderRadius: 4, cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

const th = { padding: '10px 12px', fontWeight: 600, color: C.navy, fontSize: 11, letterSpacing: '0.04em', textAlign: 'center' };
const td = { padding: '8px 12px', fontSize: 11, color: C.textDark, textAlign: 'center', verticalAlign: 'top' };
