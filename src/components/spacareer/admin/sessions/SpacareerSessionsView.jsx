import React, { useState, useMemo } from 'react';
import { color, space, font, radius } from '../../../../constants/design';
import { Card, Badge, DataTable, Button } from '../../../ui';
import { useCustomersList } from '../customers/lib/useCustomers';
import SessionCompleteFlow from '../customers/CustomerDetail/SessionCompleteFlow';

// ============================================================
// セッション管理（独立メニュー）= 横断ビュー
// 仕様書 §7.2
//   - 中央タブ：全体サマリー / 第0回 / 第1回 / … / 第8回
//   - 上部KPIカード（全体サマリー時）
//   - 各回タブの一覧表示
// ============================================================
const STATUS_LABEL = { not_started: '未実施', next_up: '次回実施', completed: '完了' };
const STATUS_VARIANT = { not_started: 'neutral', next_up: 'primary', completed: 'success' };
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
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function SpacareerSessionsView({ isAdmin }) {
  const { rows: customers, loading, refresh } = useCustomersList();
  const [tab, setTab] = useState('summary');

  const flat = useMemo(() => {
    const list = [];
    customers.forEach((c) => {
      const homeworkBy = {};
      (c.homework || []).forEach((h) => { homeworkBy[h.session_no] = h; });
      (c.sessions || []).forEach((s) => {
        list.push({
          id: `${c.id}_${s.session_no}`,
          customer_id: c.id,
          customer_name: c.member?.name || '(無名)',
          customer_email: c.member?.email,
          session_no: s.session_no,
          session_id: s.id,
          status: s.status,
          scheduled_at: s.scheduled_at,
          completed_at: s.completed_at,
          minutes_draft: s.minutes_draft,
          minutes_final: s.minutes_final,
          hearing_sheet_completed: s.hearing_sheet_completed,
          homework: s.session_no >= 1 && s.session_no <= 8 ? homeworkBy[s.session_no] : null,
          trainer_name: c.trainer?.name || null,
        });
      });
    });
    return list;
  }, [customers]);

  const kpi = useMemo(() => {
    const inProgress = customers.filter((c) => c.status === 'in_progress').length;
    const graduated = customers.filter((c) => c.status === 'graduated').length;
    const overdue = flat.filter((r) => {
      if (r.status === 'completed') return false;
      if (!r.scheduled_at) return false;
      return new Date(r.scheduled_at) < new Date();
    }).length;
    const thisWeek = (() => {
      const now = new Date();
      const oneWeekLater = new Date(now);
      oneWeekLater.setDate(now.getDate() + 7);
      return flat.filter((r) => {
        if (!r.scheduled_at) return false;
        const t = new Date(r.scheduled_at);
        return t >= now && t <= oneWeekLater;
      }).length;
    })();
    return { inProgress, graduated, overdue, thisWeek };
  }, [customers, flat]);

  const filteredRows = useMemo(() => {
    if (tab === 'summary') {
      return [...flat].sort((a, b) => {
        const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Infinity;
        const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Infinity;
        return ta - tb;
      });
    }
    const no = parseInt(tab.replace('session_', ''), 10);
    return flat.filter((r) => r.session_no === no).sort((a, b) => {
      const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Infinity;
      const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Infinity;
      return ta - tb;
    });
  }, [flat, tab]);

  const [openRowId, setOpenRowId] = useState(null);
  const openRow = openRowId ? flat.find((r) => r.id === openRowId) : null;

  return (
    <div style={{ padding: 0 }}>
      <div style={{ marginBottom: space[3] }}>
        <h1 style={{
          fontSize: font.size['2xl'], fontWeight: font.weight.bold,
          color: color.navy, margin: 0, lineHeight: 1.2,
        }}>セッション管理</h1>
        <p style={{
          fontSize: font.size.sm, color: color.textMid, margin: 0, marginTop: 4,
        }}>第0〜8回の横断ビュー。完了ボタンと AI 自動生成フローの中核です。</p>
      </div>

      {tab === 'summary' && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: space[3],
          marginBottom: space[3],
        }}>
          <Kpi label="進行中の顧客" value={kpi.inProgress} accent="primary" />
          <Kpi label="卒業完了" value={kpi.graduated} accent="success" />
          <Kpi label="遅延アラート" value={kpi.overdue} accent="danger" />
          <Kpi label="今週の予定" value={kpi.thisWeek} accent="warn" mono />
        </div>
      )}

      <div style={{
        display: 'flex', overflowX: 'auto',
        borderBottom: `1px solid ${color.border}`,
        background: color.white, marginBottom: space[3],
        borderRadius: `${radius.md}px ${radius.md}px 0 0`,
      }}>
        <TabBtn label="全体サマリー" active={tab === 'summary'} onClick={() => setTab('summary')} />
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
          <TabBtn key={n}
            label={n === 0 ? 'キックオフ' : `第${n}回`}
            active={tab === `session_${n}`}
            onClick={() => setTab(`session_${n}`)} />
        ))}
      </div>

      <DataTable
        columns={[
          { key: 'customer_name', label: '顧客名', width: 180, align: 'left',
            cellStyle: { fontWeight: font.weight.semibold } },
          { key: 'session_no', label: '回', width: 80, align: 'center',
            render: (r) => r.session_no === 0 ? 'キックオフ' : `第${r.session_no}回` },
          { key: 'scheduled_at', label: '予定日時', width: 130, align: 'right',
            render: (r) => fmtDate(r.scheduled_at), cellStyle: { fontFamily: font.family.mono } },
          { key: 'status', label: 'ステータス', width: 110, align: 'center',
            render: (r) => <Badge variant={STATUS_VARIANT[r.status]} dot>{STATUS_LABEL[r.status]}</Badge> },
          { key: '_hw', label: '事前課題', width: 110, align: 'center',
            render: (r) => r.session_no === 0
              ? <span style={{ color: color.textLight, fontSize: font.size.xs }}>—</span>
              : <Badge variant={HW_STATUS_VARIANT[r.homework?.status || 'unnotified']} dot>
                  {HW_STATUS_LABEL[r.homework?.status || 'unnotified']}
                </Badge> },
          { key: '_alert', label: 'アラート', width: 110, align: 'center',
            render: (r) => {
              const overdue = r.scheduled_at && new Date(r.scheduled_at) < new Date() && r.status !== 'completed';
              if (overdue) return <Badge variant="danger" dot>完了未押下</Badge>;
              if (r.homework?.status === 'unnotified' && r.session_no >= 1) {
                return <Badge variant="warn" dot>未通知</Badge>;
              }
              return <span style={{ color: color.textLight, fontSize: font.size.xs }}>—</span>;
            }},
          { key: 'trainer_name', label: '担当コーチ', width: 130, align: 'left' },
          { key: '_action', label: '操作', width: 100, align: 'center',
            render: (r) => (
              <Button size="sm" variant={openRowId === r.id ? 'primary' : 'outline'}
                onClick={(e) => { e.stopPropagation(); setOpenRowId(openRowId === r.id ? null : r.id); }}>
                {openRowId === r.id ? '閉じる' : '完了'}
              </Button>
            )},
        ]}
        rows={filteredRows}
        rowKey="id"
        loading={loading}
        height="calc(100vh - 320px)"
        emptyMessage={tab === 'summary' ? 'セッションがありません' : '該当する回のセッションがありません'}
        onRowClick={(r) => setOpenRowId(openRowId === r.id ? null : r.id)}
        rowAccent={(r) => {
          if (r.status === 'completed') return null;
          if (r.scheduled_at && new Date(r.scheduled_at) < new Date()) return 'danger';
          if (r.status === 'next_up') return 'primary';
          return null;
        }}
      />

      {openRow && (
        <div style={{ marginTop: space[4] }}>
          <SessionCompleteFlow
            session={{ id: openRow.session_id, session_no: openRow.session_no, status: openRow.status }}
            customerId={openRow.customer_id}
            hearingSheetChecked={!!openRow.hearing_sheet_completed}
            hasVideo={!!openRow.minutes_draft || !!openRow.minutes_final}
            hasMinutes={!!openRow.minutes_draft || !!openRow.minutes_final}
            onCompleted={() => { refresh(); }} />
        </div>
      )}
    </div>
  );
}

function TabBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: `${space[3]}px ${space[4]}px`,
      background: 'transparent',
      color: active ? color.navy : color.textMid,
      border: 'none',
      borderBottom: active ? `2px solid ${color.navy}` : '2px solid transparent',
      cursor: 'pointer',
      fontSize: font.size.sm,
      fontWeight: font.weight.semibold,
      letterSpacing: font.letterSpacing.wide,
      whiteSpace: 'nowrap',
    }}>{label}</button>
  );
}

function Kpi({ label, value, accent, mono }) {
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
        fontSize: font.size['2xl'], fontWeight: font.weight.bold,
        color: palette[accent] || color.textDark,
        fontFamily: mono ? "'JetBrains Mono', monospace" : undefined,
        marginTop: 4,
      }}>{value}</div>
    </Card>
  );
}
