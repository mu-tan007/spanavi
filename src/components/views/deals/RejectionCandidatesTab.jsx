import React, { useEffect, useMemo, useState } from 'react';
import { color, space, radius, font, alpha } from '../../../constants/design';
import { Button, Input, Card } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { getOrgId } from '../../../lib/orgContext';

// rejection_reason は AI 分析バッチで `HIGH/MEDIUM/LOW\n要約` 形式で保存される。
const TEMP_BADGE = {
  HIGH:   { bg: alpha(color.success, 0.15), color: color.success, label: '高' },
  MEDIUM: { bg: alpha(color.info,    0.15), color: color.info,    label: '中' },
  LOW:    { bg: alpha(color.danger,  0.15), color: color.danger,  label: '低' },
};
const TEMP_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2, OTHER: 3 };

function parseRejection(raw) {
  if (!raw) return { temp: null, summary: '' };
  const m = String(raw).match(/^(HIGH|MEDIUM|LOW|SKIP|UNCERTAIN)\s*\n?([\s\S]*)$/i);
  if (m) return { temp: m[1].toUpperCase(), summary: m[2].trim() };
  return { temp: null, summary: String(raw).trim() };
}

// 「再アプローチ候補」タブ (社内 DealsView / クライアントポータル ClientDealsView 共通)
// 過去にキーマン断りとなった企業について、AI 分析した温度感 (HIGH/MEDIUM/LOW) と
// 断り理由要約を一覧表示する。HIGH (将来期待値が高い断り) を上位に並べる。
export default function RejectionCandidatesTab({ client, filterEngagementId = null }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [tempFilter, setTempFilter] = useState('ALL'); // 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'
  // list_id → engagement_id マップ (兼業クライアント post-filter 用)
  const [listEngMap, setListEngMap] = useState({});

  const orgId = getOrgId();

  useEffect(() => {
    if (!orgId || !client?.id) { setRows([]); setListEngMap({}); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data, error }, listsRes] = await Promise.all([
        supabase.rpc('client_keyman_rejections', { p_client_id: client.id, p_org_id: orgId }),
        supabase.from('call_lists').select('id, engagement_id').eq('org_id', orgId).eq('client_id', client.id),
      ]);
      if (cancelled) return;
      if (error) console.error('[ClientRejectionCandidatesTab]', error);
      setRows(data || []);
      const map = {};
      for (const l of (listsRes.data || [])) map[l.id] = l.engagement_id;
      setListEngMap(map);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId, client?.id]);

  // 温度感パース + ソート (HIGH 優先 → 日付新しい順)
  const parsed = useMemo(() => {
    const base = filterEngagementId
      ? (rows || []).filter(r => listEngMap[r.list_id] === filterEngagementId)
      : (rows || []);
    return base.map(r => {
      const rej = parseRejection(r.rejection_reason);
      return { ...r, _temp: rej.temp || 'OTHER', _summary: rej.summary };
    }).sort((a, b) => {
      const ta = TEMP_ORDER[a._temp] ?? 99;
      const tb = TEMP_ORDER[b._temp] ?? 99;
      if (ta !== tb) return ta - tb;
      return new Date(b.called_at).getTime() - new Date(a.called_at).getTime();
    });
  }, [rows, filterEngagementId, listEngMap]);

  const counts = useMemo(() => {
    const m = { HIGH: 0, MEDIUM: 0, LOW: 0, OTHER: 0 };
    parsed.forEach(r => { m[r._temp] = (m[r._temp] || 0) + 1; });
    return m;
  }, [parsed]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return parsed.filter(r => {
      if (tempFilter !== 'ALL' && r._temp !== tempFilter) return false;
      if (q && !(r.company || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [parsed, filter, tempFilter]);

  if (!client) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      {/* サマリー */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: space[2],
      }}>
        {[
          { key: 'ALL',    label: '全候補',   value: parsed.length, color: color.navy },
          { key: 'HIGH',   label: '温度感: 高', value: counts.HIGH,  color: color.success },
          { key: 'MEDIUM', label: '温度感: 中', value: counts.MEDIUM, color: color.info },
          { key: 'LOW',    label: '温度感: 低', value: counts.LOW,   color: color.danger },
        ].map(s => {
          const active = tempFilter === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setTempFilter(s.key)}
              style={{
                background: color.white,
                border: `1px solid ${active ? s.color : color.border}`,
                borderLeft: `4px solid ${s.color}`,
                borderRadius: radius.md,
                padding: `${space[3]}px ${space[4]}px`,
                textAlign: 'left',
                cursor: 'pointer',
                boxShadow: active ? `0 0 0 2px ${alpha(s.color, 0.18)}` : 'none',
                transition: 'box-shadow 0.15s',
                fontFamily: font.family.sans,
              }}
            >
              <div style={{ fontSize: 10, color: color.textMid, fontWeight: font.weight.semibold, letterSpacing: 1, marginBottom: 4 }}>
                {s.label}
              </div>
              <div style={{
                fontSize: font.size.xl, fontFamily: font.family.mono,
                fontWeight: font.weight.bold, color: s.color,
              }}>
                {s.value.toLocaleString()}
              </div>
            </button>
          );
        })}
      </div>

      {/* 検索 */}
      <Card padding="none" style={{
        padding: `${space[2] + 2}px ${space[3]}px`,
        display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap',
      }}>
        <Input
          size="sm"
          fullWidth={false}
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="企業名で絞り込み"
          style={{ width: 220 }}
        />
        {tempFilter !== 'ALL' && (
          <Button size="sm" variant="outline" onClick={() => setTempFilter('ALL')}>
            温度感フィルタ解除
          </Button>
        )}
        <div style={{ marginLeft: 'auto', fontSize: font.size.xs, color: color.textMid }}>
          {filtered.length}社 / 全 {parsed.length}社
        </div>
      </Card>

      {/* 候補一覧 */}
      {loading ? (
        <Card padding="lg" style={{ textAlign: 'center', color: color.textMid }}>
          読み込み中...
        </Card>
      ) : filtered.length === 0 ? (
        <Card padding="lg" style={{ textAlign: 'center', color: color.textLight }}>
          該当する企業がありません
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          {filtered.map(r => {
            const conf = TEMP_BADGE[r._temp] || null;
            return (
              <Card key={r.call_id} padding="md" style={{
                borderLeft: `4px solid ${conf?.color || color.textLight}`,
                background: color.white,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: space[3], flexWrap: 'wrap' }}>
                  {/* 温度感バッジ (左) */}
                  {conf && (
                    <div style={{
                      flexShrink: 0,
                      padding: '4px 12px', borderRadius: radius.sm,
                      background: conf.bg, color: conf.color,
                      fontSize: font.size.xs, fontWeight: font.weight.bold,
                      letterSpacing: 1,
                    }}>
                      温度感: {conf.label}
                    </div>
                  )}

                  {/* 中央: 企業名 + 業種 + メモ */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], flexWrap: 'wrap' }}>
                      <div style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: color.navy }}>
                        {r.company || '—'}
                      </div>
                      {r.list_industry && (
                        <div style={{ fontSize: font.size.xs, color: color.textLight }}>
                          {r.list_industry}
                        </div>
                      )}
                    </div>
                    {r._summary && (
                      <div style={{
                        marginTop: space[1.5],
                        fontSize: font.size.sm, color: color.textDark, lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                      }}>
                        {r._summary}
                      </div>
                    )}
                    <div style={{
                      marginTop: space[2],
                      display: 'flex', gap: space[3], flexWrap: 'wrap',
                      fontSize: 10, color: color.textLight,
                    }}>
                      <span>架電日: {new Date(r.called_at).toLocaleDateString('ja-JP')}</span>
                      {r.getter_name && <span>担当: {r.getter_name}</span>}
                      {r.phone && <span style={{ fontFamily: font.family.mono }}>{r.phone}</span>}
                      {r.list_name && <span>リスト: {r.list_name}</span>}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
