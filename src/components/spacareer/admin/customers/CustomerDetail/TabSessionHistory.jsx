import React, { useState } from 'react';
import { color, space, radius, font } from '../../../../../constants/design';
import { Card, Badge, Button, DataTable } from '../../../../ui';
import SessionCompleteFlow from './SessionCompleteFlow';

// ============================================================
// 3. セッション履歴タブ（縦断ビュー）
// 仕様書 §7.1 / §7.2 個人ページ＝縦断ビュー
// ============================================================
const STATUS_LABEL = { not_started: '未実施', next_up: '次回実施', completed: '完了' };
const STATUS_VARIANT = { not_started: 'neutral', next_up: 'primary', completed: 'success' };

function fmtDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function TabSessionHistory({ detail, onRefresh }) {
  const { customer, sessions = [], videos = [] } = detail || {};
  const [openId, setOpenId] = useState(null);

  const videosBySession = new Map();
  videos.forEach((v) => {
    if (!v.session_id) return;
    if (!videosBySession.has(v.session_id)) videosBySession.set(v.session_id, []);
    videosBySession.get(v.session_id).push(v);
  });

  const rows = sessions.map((s) => ({
    ...s,
    _label: s.session_no === 0 ? 'キックオフ' : `第${s.session_no}回`,
    _scheduled: fmtDate(s.scheduled_at),
    _completed: fmtDate(s.completed_at),
    _hasMinutes: !!s.minutes_draft || !!s.minutes_final,
    _hasVideo: (videosBySession.get(s.id) || []).length > 0,
  }));

  const openSession = openId ? rows.find((r) => r.id === openId) : null;

  return (
    <div style={{ display: 'grid', gap: space[4] }}>
      <DataTable
        columns={[
          { key: '_label', label: '回', width: 110, align: 'left',
            cellStyle: { fontWeight: font.weight.semibold } },
          { key: '_scheduled', label: '予定日時', width: 130, align: 'right',
            cellStyle: { fontFamily: font.family.mono } },
          { key: '_completed', label: '完了日時', width: 130, align: 'right',
            cellStyle: { fontFamily: font.family.mono } },
          { key: 'status', label: 'ステータス', width: 110, align: 'center',
            render: (r) => <Badge variant={STATUS_VARIANT[r.status]} dot>{STATUS_LABEL[r.status]}</Badge> },
          { key: '_hasVideo', label: '録画', width: 70, align: 'center',
            render: (r) => r._hasVideo ? <Badge variant="success">あり</Badge> : <span style={{ color: color.textLight }}>—</span> },
          { key: '_hasMinutes', label: '議事録', width: 80, align: 'center',
            render: (r) => r._hasMinutes ? <Badge variant="success">あり</Badge> : <span style={{ color: color.textLight }}>—</span> },
          { key: 'hearing_sheet_completed', label: 'ヒアリング', width: 90, align: 'center',
            render: (r) => r.hearing_sheet_completed ? <Badge variant="success" dot>済</Badge> : <Badge variant="neutral">未</Badge> },
          { key: '_action', label: '操作', width: 100, align: 'center',
            render: (r) => (
              <Button size="sm" variant={openId === r.id ? 'primary' : 'outline'}
                onClick={(e) => { e.stopPropagation(); setOpenId(openId === r.id ? null : r.id); }}>
                {openId === r.id ? '閉じる' : '操作'}
              </Button>
            )},
        ]}
        rows={rows}
        rowKey="id"
        height="auto"
        emptyMessage="セッションがありません"
        onRowClick={(r) => setOpenId(openId === r.id ? null : r.id)}
      />

      {openSession && openSession.session_no !== 0 && (
        <SessionCompleteFlow
          session={openSession} customerId={customer?.id}
          hearingSheetChecked={!!openSession.hearing_sheet_completed}
          hasVideo={openSession._hasVideo} hasMinutes={openSession._hasMinutes}
          onCompleted={onRefresh} />
      )}

      {openSession && (
        <Card padding="md"
          title={`${openSession._label} 議事録（AI生成ドラフト）`}
          description="トレーナーが確認・修正してください。最終版は受講生のクライアントポータルにも反映されます。"
        >
          {openSession.minutes_final || openSession.minutes_draft ? (
            <pre style={{
              margin: 0, padding: space[3],
              background: color.cream, borderRadius: radius.md,
              fontSize: font.size.sm, fontFamily: font.family.sans,
              color: color.textDark, whiteSpace: 'pre-wrap',
              maxHeight: 360, overflow: 'auto',
            }}>{openSession.minutes_final || openSession.minutes_draft}</pre>
          ) : (
            <div style={{ color: color.textLight, fontSize: font.size.sm }}>
              議事録はまだ生成されていません
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
