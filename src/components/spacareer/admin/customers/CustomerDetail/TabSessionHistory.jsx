import React, { useState, useEffect } from 'react';
import { color, space, radius, font } from '../../../../../constants/design';
import { Card, Badge, Button, DataTable } from '../../../../ui';
import { supabase } from '../../../../../lib/supabase';
import SessionCompleteFlow from './SessionCompleteFlow';
import SessionVideoModal from '../../_shared/SessionVideoModal';

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
function fmtDateOnly(v) {
  if (!v) return null;
  const d = new Date(v);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function TabSessionHistory({ detail, onRefresh }) {
  const { customer, sessions = [], videos = [] } = detail || {};
  const [openId, setOpenId] = useState(null);
  const [playPath, setPlayPath] = useState(null); // 画面内再生する動画の storage_path
  // 議事録の確定（受講生公開）用の編集状態
  const [minutesText, setMinutesText] = useState('');
  const [publishing, setPublishing] = useState(false);

  const videosBySession = new Map();
  videos.forEach((v) => {
    if (!v.session_id) return;
    if (!videosBySession.has(v.session_id)) videosBySession.set(v.session_id, []);
    videosBySession.get(v.session_id).push(v);
  });

  const rows = [...sessions]
    .sort((a, b) => (a.session_no - b.session_no) || ((a.part || 1) - (b.part || 1)))
    .map((s) => ({
      ...s,
      _label: s.session_no === 0 ? 'キックオフ'
        : `第${s.session_no}回${(s.part || 1) === 2 ? '(2)' : ''}`,
      _completed: fmtDate(s.completed_at),
      _hasMinutes: !!s.minutes_draft || !!s.minutes_final,
      _hasVideo: (videosBySession.get(s.id) || []).length > 0,
      _videoPath: (videosBySession.get(s.id) || []).find((v) => v.storage_path)?.storage_path || null,
    }));

  const openSession = openId ? rows.find((r) => r.id === openId) : null;

  // 行を開いたら、確定済み(minutes_final)があればそれを、無ければAIドラフトを編集欄に読み込む。
  useEffect(() => {
    setMinutesText(openSession ? (openSession.minutes_final || openSession.minutes_draft || '') : '');
  }, [openId, openSession?.minutes_final, openSession?.minutes_draft]);

  async function handlePublishMinutes() {
    if (!openSession?.id) return;
    if (!minutesText.trim()) { alert('議事録の内容が空です。'); return; }
    if (!window.confirm('この内容を受講生のクライアントポータルに公開します。よろしいですか？')) return;
    setPublishing(true);
    try {
      const { error } = await supabase
        .from('spacareer_sessions')
        .update({ minutes_final: minutesText })
        .eq('id', openSession.id);
      if (error) throw error;
      alert('議事録を受講生に公開しました。');
      onRefresh && onRefresh();
    } catch (e) {
      console.error('[TabSessionHistory] publish minutes error:', e);
      alert(`公開に失敗しました: ${e.message || e}`);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: space[4] }}>
      <DataTable
        columns={[
          { key: '_label', label: '回', width: 110, align: 'left',
            cellStyle: { fontWeight: font.weight.semibold } },
          { key: '_scheduled', label: '予定日時', width: 150, align: 'right',
            render: (r) => {
              if (!r.scheduled_at) return <span style={{ color: color.textLight }}>—</span>;
              // 第2回以降はキックオフ時点で時刻未確定のため、日付のみ＋「仮決め」表示
              const provisional = r.session_no >= 2;
              return (
                <span style={{
                  display: 'inline-flex', alignItems: 'baseline',
                  justifyContent: 'flex-end', gap: space[1],
                }}>
                  <span style={{ fontFamily: font.family.mono, color: color.textDark }}>
                    {provisional ? fmtDateOnly(r.scheduled_at) : fmtDate(r.scheduled_at)}
                  </span>
                  {provisional && (
                    <span style={{ fontSize: font.size.xs, color: color.textLight }}>仮決め</span>
                  )}
                </span>
              );
            } },
          { key: '_completed', label: '完了日時', width: 130, align: 'right',
            cellStyle: { fontFamily: font.family.mono } },
          { key: 'status', label: 'ステータス', width: 110, align: 'center',
            render: (r) => <Badge variant={STATUS_VARIANT[r.status]} dot>{STATUS_LABEL[r.status]}</Badge> },
          { key: '_hasVideo', label: '録画', width: 110, align: 'center',
            render: (r) => (
              r._videoPath ? (
                <Button size="sm" variant="outline"
                  onClick={(e) => { e.stopPropagation(); setPlayPath(r._videoPath); }}>
                  再生
                </Button>
              ) : <span style={{ color: color.textLight }}>—</span>
            ) },
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
          title={`${openSession._label} 議事録`}
          description="AI生成ドラフトを確認・修正し、「受講生に公開する」を押すとクライアントポータルのセッション履歴に反映されます。トレーナー専用メモの節は公開前に削除してください。"
        >
          {openSession.minutes_final || openSession.minutes_draft ? (
            <div style={{ display: 'grid', gap: space[3] }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
                {openSession.minutes_final
                  ? <Badge variant="success" dot>受講生に公開済み</Badge>
                  : <Badge variant="warn" dot>未公開（AIドラフトのみ）</Badge>}
                {openSession.minutes_draft && (
                  <Button size="sm" variant="ghost"
                    onClick={() => setMinutesText(openSession.minutes_draft || '')}>
                    AIドラフトを読み込み直す
                  </Button>
                )}
              </div>
              <textarea
                value={minutesText}
                onChange={(e) => setMinutesText(e.target.value)}
                rows={16}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: space[3], background: color.cream,
                  border: `1px solid ${color.border}`, borderRadius: radius.md,
                  fontSize: font.size.sm, fontFamily: font.family.sans,
                  color: color.textDark, lineHeight: font.lineHeight.relaxed,
                  resize: 'vertical', minHeight: 240,
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="primary" loading={publishing} onClick={handlePublishMinutes}>
                  受講生に公開する
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ color: color.textLight, fontSize: font.size.sm }}>
              議事録はまだ生成されていません
            </div>
          )}
        </Card>
      )}

      <SessionVideoModal
        open={!!playPath}
        onClose={() => setPlayPath(null)}
        storagePath={playPath}
        title="セッション録画"
      />
    </div>
  );
}
