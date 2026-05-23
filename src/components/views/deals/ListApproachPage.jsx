import React, { useEffect, useMemo, useState } from 'react';
import { C } from '../../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Input, Select, Card, Badge } from '../../ui';
import { fetchAllRpc } from '../../../lib/fetchAllRpc';
import { PlayRecordingButton } from '../../common/RecordingPlayerProvider';

const PAGE_SIZE = 100;

// rejection_reason は AI 分析バッチで `HIGH/MEDIUM/LOW\n要約` 形式で保存される。
// (SKIP は 25MB超で分析不可な特殊ケース、 UNCERTAIN は未判定)
const TEMP_BADGE = {
  HIGH:   { bg: alpha(color.success, 0.15), color: color.success, label: '温度感: 高' },
  MEDIUM: { bg: alpha(color.info,    0.15), color: color.info,    label: '温度感: 中' },
  LOW:    { bg: alpha(color.danger,  0.15), color: color.danger,  label: '温度感: 低' },
};

function parseRejection(raw) {
  if (!raw) return { temp: null, summary: '' };
  const m = raw.match(/^(HIGH|MEDIUM|LOW|SKIP)\s*\n?([\s\S]*)$/);
  if (m) return { temp: m[1].toUpperCase(), summary: m[2].trim() };
  return { temp: null, summary: raw };
}

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

    const bom = '﻿';
    const blob = new Blob([bom + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (list.list_name || 'list').replace(/[^\w぀-ヿ一-鿿]/g, '_');
    a.href = url;
    a.download = `架電詳細_${safeName}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      {/* ヘッダー: 戻る / タイトル / 検索 / エクスポート */}
      <Card padding="none" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', flexWrap: 'wrap', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button size="sm" variant="outline" onClick={onBack}>← 戻る</Button>
          <div>
            <div style={{ fontSize: font.size.base, fontWeight: font.weight.semibold, color: color.navy }}>
              {list.list_name} — 各企業のアプローチ詳細
            </div>
            <div style={{ fontSize: 10, color: color.textMid, marginTop: 2 }}>
              {filtered.length}社 (全 {items.length}社)
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            size="sm"
            fullWidth={false}
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="企業名で絞り込み"
            style={{ width: 200 }}
          />
          <Button
            size="sm"
            onClick={handleExport}
            disabled={loading || items.length === 0}
          >⬇ Excel 出力</Button>
        </div>
      </Card>

      {/* テーブル */}
      <Card padding="none">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: color.textMid }}>読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: color.textLight }}>該当企業がありません</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: font.size.xs, minWidth: '100%' }}>
              <thead>
                <tr style={{ background: color.cream, borderBottom: `1px solid ${color.border}` }}>
                  <th style={{ ...th, width: 40 }}>#</th>
                  <th style={{ ...th, textAlign: 'left', minWidth: 220, position: 'sticky', left: 0, background: color.cream, zIndex: 2 }}>企業名</th>
                  {Array.from({ length: maxCallCount }).map((_, i) => (
                    <th key={i} style={{ ...th, minWidth: 180 }}>{i + 1}回目</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageItems.map(it => {
                  const calls = it._calls;
                  return (
                    <tr key={it.item_id} style={{ borderBottom: `1px solid ${color.borderLight}` }}>
                      <td style={{ ...td, fontFamily: font.family.mono, color: color.textLight }}>{it.no ?? '—'}</td>
                      <td style={{ ...td, textAlign: 'left', fontWeight: font.weight.medium, color: color.navy, position: 'sticky', left: 0, background: color.white, zIndex: 1 }}>
                        {it.company || '—'}
                      </td>
                      {Array.from({ length: maxCallCount }).map((_, i) => {
                        const c = calls[i];
                        if (!c) return <td key={i} style={{ ...td, color: color.textLight }}>—</td>;
                        const isKeymanReject = c.status === 'キーマン断り';
                        const rej = isKeymanReject ? parseRejection(c.rejection_reason) : null;
                        const tempConf = rej && rej.temp ? TEMP_BADGE[rej.temp] : null;
                        return (
                          <td key={i} style={{ ...td, textAlign: 'left', padding: '6px 10px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontFamily: font.family.mono, color: color.textMid, fontSize: 10 }}>
                                {c.called_at
                                  ? new Date(c.called_at).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' }) +
                                    ' ' +
                                    new Date(c.called_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
                                  : '—'}
                              </span>
                              <span style={{ color: statusColor(c.status), fontWeight: font.weight.medium }}>{c.status || '—'}</span>
                              {tempConf && (
                                <span
                                  title={rej.summary || ''}
                                  style={{
                                    fontSize: 9, fontWeight: font.weight.semibold,
                                    padding: '1px 5px', borderRadius: radius.sm,
                                    background: tempConf.bg, color: tempConf.color,
                                    alignSelf: 'flex-start', cursor: rej.summary ? 'help' : 'default',
                                  }}
                                >{tempConf.label}</span>
                              )}
                              {isKeymanReject && rej && rej.summary && (
                                <span
                                  title={rej.summary}
                                  style={{
                                    fontSize: 9, color: color.textMid, lineHeight: 1.4,
                                    marginTop: 2, maxWidth: 220,
                                    display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3, overflow: 'hidden',
                                    cursor: 'help',
                                  }}
                                >{rej.summary}</span>
                              )}
                              {c.getter_name && <span style={{ fontSize: 9, color: color.textLight }}>{c.getter_name}</span>}
                              {c.recording_url && (
                                <div style={{ marginTop: 2 }}>
                                  <PlayRecordingButton
                                    url={c.recording_url}
                                    title={it.company || ''}
                                    subtitle={`${i + 1}回目 ${c.called_at ? new Date(c.called_at).toLocaleDateString('ja-JP') : ''} ・ ${c.status || ''}`}
                                  />
                                </div>
                              )}
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
      </Card>

      {/* ページネーション */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '8px 0' }}>
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >← 前の100件</Button>
          <span style={{ fontSize: font.size.xs, color: color.textMid, minWidth: 140, textAlign: 'center' }}>
            {currentPage} / {totalPages} ページ ({filtered.length.toLocaleString()}社)
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          >次の100件 →</Button>
        </div>
      )}
    </div>
  );
}

function statusColor(status) {
  if (!status) return color.textMid;
  if (status.includes('アポ')) return color.success;
  if (status.includes('お断り') || status.includes('ブロック')) return color.danger;
  if (status.includes('不在') || status.includes('再コール')) return color.warn;
  return color.textMid;
}

const th = { padding: '10px 12px', fontWeight: font.weight.semibold, color: color.navy, fontSize: font.size.xs, letterSpacing: font.letterSpacing.wide, textAlign: 'center' };
const td = { padding: '8px 12px', fontSize: font.size.xs, color: color.textDark, textAlign: 'center', verticalAlign: 'top' };
