import React, { useEffect, useState } from 'react';
import { color, space, font } from '../../../../../constants/design';
import { Card, Badge, DataTable } from '../../../../ui';
import { supabase } from '../../../../../lib/supabase';

// ============================================================
// 9. 視聴ログタブ（§7.5 AI講座管理から個別ビュー）
// ============================================================
const VIEW_STATUS_LABEL = { not_watched: '未視聴', watching: '視聴中', watched: '視聴済み' };
const VIEW_STATUS_VARIANT = { not_watched: 'neutral', watching: 'warn', watched: 'success' };

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function TabVideoLogs({ detail }) {
  const customerId = detail?.customer?.id;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('spacareer_video_views')
        .select(`
          id, progress_percent, watched_seconds, status, first_viewed_at, last_viewed_at,
          reflection_text, reflection_submitted_at,
          video:spacareer_course_videos ( id, title, duration_seconds, category:spacareer_course_categories ( name ) )
        `)
        .eq('customer_id', customerId)
        .order('last_viewed_at', { ascending: false, nullsFirst: false });
      setRows(data || []);
      setLoading(false);
    })();
  }, [customerId]);

  const total = rows.length;
  const watched = rows.filter((r) => r.status === 'watched').length;
  const watching = rows.filter((r) => r.status === 'watching').length;
  const totalSeconds = rows.reduce((s, r) => s + (r.watched_seconds || 0), 0);
  const totalHours = (totalSeconds / 3600).toFixed(1);

  return (
    <div style={{ display: 'grid', gap: space[4] }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: space[3] }}>
        <Stat label="視聴済み" value={`${watched} / ${total}`} accent="success" />
        <Stat label="視聴中" value={`${watching} 本`} accent="warn" />
        <Stat label="総視聴時間" value={`${totalHours} h`} accent="primary" mono />
      </div>

      <Card padding="md" title="視聴履歴" description="80% 以上の再生で「視聴済み」になります。">
        <DataTable
          columns={[
            { key: '_title', label: 'タイトル', width: 'minmax(200px, 1fr)', align: 'left',
              render: (r) => r.video?.title || '—' },
            { key: '_cat', label: 'カテゴリ', width: 140, align: 'left',
              render: (r) => r.video?.category?.name || '—' },
            { key: 'progress_percent', label: '進捗', width: 90, align: 'right',
              render: (r) => `${Number(r.progress_percent || 0).toFixed(0)}%`,
              cellStyle: { fontFamily: font.family.mono } },
            { key: 'status', label: 'ステータス', width: 110, align: 'center',
              render: (r) => <Badge variant={VIEW_STATUS_VARIANT[r.status]} dot>{VIEW_STATUS_LABEL[r.status]}</Badge> },
            { key: 'first_viewed_at', label: '初回視聴', width: 90, align: 'right',
              render: (r) => fmtDate(r.first_viewed_at), cellStyle: { fontFamily: font.family.mono } },
            { key: 'last_viewed_at', label: '最終視聴', width: 90, align: 'right',
              render: (r) => fmtDate(r.last_viewed_at), cellStyle: { fontFamily: font.family.mono } },
            { key: '_reflection', label: '視聴後アウトプット', width: 'minmax(260px, 1.6fr)', align: 'left',
              render: (r) => r.reflection_text
                ? (
                  <div style={{
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    fontSize: font.size.xs, color: color.textDark,
                    lineHeight: font.lineHeight.relaxed, padding: `${space[1]}px 0`,
                  }}>{r.reflection_text}</div>
                )
                : <span style={{ color: color.textLight }}>—</span> },
          ]}
          rows={rows} rowKey="id" loading={loading} height="auto"
          emptyMessage="視聴履歴がありません"
        />
      </Card>
    </div>
  );
}

function Stat({ label, value, accent, mono }) {
  const palette = {
    primary: color.navyLight, success: color.success,
    warn: color.warn, danger: color.danger,
  };
  return (
    <Card padding="md">
      <div style={{
        fontSize: font.size.xs, color: color.textMid,
        letterSpacing: font.letterSpacing.wide, fontWeight: font.weight.semibold,
      }}>{label}</div>
      <div style={{
        fontSize: font.size.xl, color: palette[accent] || color.textDark,
        fontWeight: font.weight.bold,
        fontFamily: mono ? font.family.mono : undefined,
        marginTop: 4,
      }}>{value}</div>
    </Card>
  );
}
