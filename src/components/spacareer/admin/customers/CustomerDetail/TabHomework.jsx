import React from 'react';
import { color, space, font, radius } from '../../../../../constants/design';
import { Card, Badge, DataTable } from '../../../../ui';

// ============================================================
// 4. 事後課題タブ（個人ページ内サマリ）
// 仕様書 §7.1 中央タブ#4
// ============================================================
const HW_STATUS_LABEL = {
  unnotified: '未通知', unsubmitted: '未提出', partial: '部分提出',
  submitted: '提出済み', completed: '完了',
};
const HW_STATUS_VARIANT = {
  unnotified: 'danger', unsubmitted: 'warn', partial: 'warn',
  submitted: 'info', completed: 'success',
};

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function TabHomework({ detail }) {
  const { homework = [], sessions = [] } = detail || {};
  const sessByNo = {};
  sessions.forEach((s) => { sessByNo[s.session_no] = s; });

  const rows = [1, 2, 3, 4, 5, 6, 7, 8].map((no) => {
    const h = homework.find((x) => x.session_no === no);
    const s = sessByNo[no];
    return {
      session_no: no,
      label: `第${no}回`,
      status: h?.status || 'unnotified',
      notified_at: h?.notified_at,
      due_at: h?.due_at,
      submitted_at: h?.submitted_at,
      scheduled_at: s?.scheduled_at,
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
