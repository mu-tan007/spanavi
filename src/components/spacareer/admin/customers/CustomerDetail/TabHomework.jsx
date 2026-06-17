import React from 'react';
import { color, space, font, radius } from '../../../../../constants/design';
import { Card, Badge, DataTable } from '../../../../ui';

// ============================================================
// 4. 事後課題タブ（個人ページ内サマリ）
// 仕様書 §7.1 中央タブ#4
// ============================================================
const HW_STATUS_LABEL = {
  pending: 'セッション前', unnotified: '未通知', unsubmitted: '未提出', partial: '部分提出',
  submitted: '提出済み', completed: '完了',
};
const HW_STATUS_VARIANT = {
  pending: 'neutral', unnotified: 'danger', unsubmitted: 'warn', partial: 'warn',
  submitted: 'info', completed: 'success',
};

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 提出期限の時点で100%だったかを判定する。
// first_completed_at（初回100%達成日時・上書きされない）と due_at を比較。
//   on_time  : 期限内に100%到達
//   late     : 100%到達したが期限後だった
//   overdue  : 期限を過ぎても未達成（100%未満のまま）
//   none     : まだ通知・対象外
function deadlineState(h) {
  if (!h) return 'none';
  const completed = h.first_completed_at ? new Date(h.first_completed_at) : null;
  const due = h.due_at ? new Date(h.due_at) : null;
  if (completed) {
    if (due && completed.getTime() > due.getTime()) return 'late';
    return 'on_time';
  }
  // 未達成（100%未満）。期限を過ぎていれば overdue。
  if (due && Date.now() > due.getTime() && (h.status && h.status !== 'pending' && h.status !== 'unnotified')) return 'overdue';
  return 'none';
}
const DEADLINE_LABEL = { on_time: '期限内達成', late: '期限後達成', overdue: '期限内未達成', none: '—' };
const DEADLINE_VARIANT = { on_time: 'success', late: 'warn', overdue: 'danger', none: 'neutral' };

export default function TabHomework({ detail }) {
  const { homework = [], sessions = [] } = detail || {};
  const sessByNo = {};
  sessions.forEach((s) => { sessByNo[s.session_no] = s; });

  const rows = [1, 2, 3, 4, 5, 6, 7, 8].map((no) => {
    const h = homework.find((x) => x.session_no === no);
    const s = sessByNo[no];
    // homework行が無い場合: セッション完了済なら本当の異常(未通知=赤)、未完了なら「セッション前」(中立)。
    const status = h?.status || (s?.status === 'completed' ? 'unnotified' : 'pending');
    return {
      session_no: no,
      label: `第${no}回`,
      status,
      notified_at: h?.notified_at,
      due_at: h?.due_at,
      submitted_at: h?.submitted_at,
      first_completed_at: h?.first_completed_at,
      scheduled_at: s?.scheduled_at,
      _deadline: deadlineState(h ? { ...h, status } : null),
    };
  });

  const submitted = rows.filter((r) => r.status === 'submitted' || r.status === 'completed').length;

  return (
    <div style={{ display: 'grid', gap: space[4] }}>
      <Card padding="md" title="事後課題 提出サマリ"
        action={<Badge variant={submitted >= 4 ? 'success' : 'warn'} dot>{submitted}/8 提出済み</Badge>}>
        <DataTable
          columns={[
            { key: 'label', label: '回', width: 80, align: 'left' },
            { key: 'status', label: 'ステータス', width: 120, align: 'center',
              render: (r) => <Badge variant={HW_STATUS_VARIANT[r.status]} dot>{HW_STATUS_LABEL[r.status]}</Badge> },
            { key: 'notified_at', label: '通知日', width: 80, align: 'right',
              render: (r) => fmtDate(r.notified_at), cellStyle: { fontFamily: font.family.mono } },
            { key: 'due_at', label: '締切', width: 80, align: 'right',
              render: (r) => fmtDate(r.due_at), cellStyle: { fontFamily: font.family.mono } },
            { key: 'submitted_at', label: '提出日', width: 80, align: 'right',
              render: (r) => fmtDate(r.submitted_at), cellStyle: { fontFamily: font.family.mono } },
            { key: '_deadline', label: '期限内達成', width: 120, align: 'center',
              render: (r) => r._deadline === 'none'
                ? <span style={{ color: color.textLight }}>—</span>
                : <Badge variant={DEADLINE_VARIANT[r._deadline]} dot>{DEADLINE_LABEL[r._deadline]}</Badge> },
            { key: 'scheduled_at', label: 'セッション予定', width: 110, align: 'right',
              render: (r) => fmtDate(r.scheduled_at), cellStyle: { fontFamily: font.family.mono } },
          ]}
          rows={rows} rowKey="session_no" height="auto"
        />
      </Card>

      <div style={{
        padding: space[3],
        background: color.cream,
        border: `1px dashed ${color.border}`,
        borderRadius: radius.md,
        fontSize: font.size.sm,
        color: color.textMid,
      }}>
        詳細な編集・OK判定・AI再生成は「事後課題管理」メニュー（横断ビュー）で行います。
      </div>
    </div>
  );
}
