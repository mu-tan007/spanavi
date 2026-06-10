import React, { useEffect, useState } from 'react';
import { color, space, radius, font } from '../../../constants/design';
import { Card, Badge } from '../../ui';
import { supabase } from '../../../lib/supabase';

// クライアントポータル「ニーズヒアリング」タブ。
// そのクライアント宛（client_id 一致）に蓄積された買収ニーズだけを閲覧する。
// RLS (bnh_portal_select) で「自分(client)宛 = client_id が自分の clients.id」に自動制限される。
// client_id でも明示フィルタして二重に絞る。

// 買収ニーズ7項目（入力があるものだけ表示する）
const NEEDS_FIELDS = [
  { key: 'industry',         label: '業種' },
  { key: 'area',             label: 'エリア' },
  { key: 'revenue',          label: '売上' },
  { key: 'operating_profit', label: '営業利益' },
  { key: 'budget',           label: '予算' },
  { key: 'purpose',          label: '目的' },
  { key: 'memo',             label: 'メモ' },
];

function formatDate(d) {
  if (!d) return '';
  // hearing_date は 'YYYY-MM-DD' 文字列
  const [y, m, day] = String(d).slice(0, 10).split('-');
  if (!y) return '';
  return `${y}/${m}/${day}`;
}

export default function BuyerMatchingNeedsTab({ client }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('buyer_needs_hearings')
        .select('*')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) console.error('[BuyerMatchingNeedsTab] fetch error:', error);
      setRows(data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [client.id]);

  if (loading) {
    return <div style={{ padding: space[6], textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>読み込み中...</div>;
  }

  if (!rows.length) {
    return (
      <div style={{ padding: space[8], textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>
        まだ買収ニーズのヒアリング記録がありません。
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: space[3] }}>
        蓄積された買収ニーズ：{rows.length}件
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        {rows.map(r => {
          const filled = NEEDS_FIELDS.filter(f => (r[f.key] || '').toString().trim());
          return (
            <Card key={r.id} padding="none" style={{ padding: `${space[3]}px ${space[4]}px` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: space[3], marginBottom: filled.length ? space[2] : 0, flexWrap: 'wrap' }}>
                <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.navy }}>
                  {r.company_name || '（企業名未入力）'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
                  {r.getter_name && <Badge variant="neutral" size="sm">{r.getter_name}</Badge>}
                  {r.hearing_date && (
                    <span style={{ fontSize: font.size.xs, color: color.textLight, fontFamily: font.family.mono }}>
                      {formatDate(r.hearing_date)}
                    </span>
                  )}
                </div>
              </div>
              {filled.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: `${space[1]}px ${space[3]}px`, alignItems: 'start' }}>
                  {filled.map(f => (
                    <React.Fragment key={f.key}>
                      <div style={{ fontSize: font.size.xs, color: color.textLight, fontWeight: font.weight.semibold, whiteSpace: 'nowrap', paddingTop: 1 }}>
                        {f.label}
                      </div>
                      <div style={{ fontSize: font.size.sm, color: color.textDark, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                        {r[f.key]}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
