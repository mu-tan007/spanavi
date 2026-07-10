import React, { useEffect, useMemo, useState } from 'react';
import { color, space, font, radius, alpha } from '../../../../constants/design';
import { Button, Card, Badge, DataTable } from '../../../ui';
import { useAuth } from '../../../../hooks/useAuth';
import { supabase } from '../../../../lib/supabase';
import { resolveSessionSchedule, getSession1At } from '../../../../lib/spacareer/sessionSchedule';
import { orderSessions, sessionLabel } from '../../../../lib/spacareer/sessionOrder';

// 仕様書: tasks/spacareer-spec.md §6.5 セッション履歴
//
// 仕様要点:
//  - 第0〜第8回のリスト表示
//  - 各回: 実施日 / Zoom URL / 議事録ダウンロード / ステータス
//  - 録画動画は受講生に提供しない（minutes_final のみ）

const SESSIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

function pad(n) { return n < 10 ? `0${n}` : String(n); }

export default function ClientHistoryView() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState(null);
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      const { data: member } = await supabase
        .from('members').select('id').eq('user_id', profile.id).maybeSingle();
      if (!member) { setLoading(false); return; }
      const { data: cust } = await supabase
        .from('spacareer_customers').select('id, oyo_start_session_no').eq('member_id', member.id).maybeSingle();
      if (cancelled) return;
      setCustomer(cust);
      if (!cust) { setLoading(false); return; }

      const { data: rows } = await supabase
        .from('spacareer_sessions')
        .select('id, session_no, part, scheduled_at, started_at, completed_at, zoom_url, status, minutes_final')
        .eq('customer_id', cust.id)
        .order('session_no', { ascending: true })
        .order('part', { ascending: true });
      if (!cancelled) setSessions(rows || []);
      setLoading(false);
    })().catch(err => {
      console.error('[ClientHistory] load error:', err);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [profile?.id]);

  // 応用コースは第1〜8回に加えプラスアルファα1〜8がある。加入回 J 以降の interleave 順
  // （sessionOrder.js）で表示する。まだ行が無い場合のみ第0〜8回のプレースホルダを表示。
  const completeRows = useMemo(() => {
    if (sessions.length) {
      return orderSessions(sessions, customer?.oyo_start_session_no);
    }
    return SESSIONS.map(n => ({ id: `placeholder-${n}`, session_no: n, part: 1, status: 'not_started' }));
  }, [sessions, customer?.oyo_start_session_no]);

  const downloadMinutes = (row) => {
    if (!row.minutes_final) return;
    const blob = new Blob([row.minutes_final], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sessionLabel(row)}_議事録.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <Centered>読み込み中...</Centered>;
  }
  if (!customer) {
    return <Centered>受講情報が見つかりません。運営にお問い合わせください。</Centered>;
  }

  // 第1回の開始日時。第2〜8回の未確定回はこれを基準に毎週仮置き表示する。
  const session1At = getSession1At(sessions);

  const columns = [
    {
      key: 'session_no',
      label: '回',
      width: 100,
      align: 'center',
      render: row => (
        <span style={{ fontWeight: font.weight.bold, color: color.navy }}>
          {sessionLabel(row)}
        </span>
      ),
    },
    {
      key: 'date',
      label: '実施日／予定日時',
      width: 180,
      align: 'right',
      render: row => {
        // 完了済みは実施日、それ以外は予定日時を表示。
        // 実施日は「実際に実施した日時(started_at)」を最優先（キックオフは管理画面で設定した実施日時）。
        // started_at が無ければ completed_at（完了ボタン時刻）→ 予定日時の順でフォールバック。
        // 未完了の第2〜8回は scheduled_at（確定）を優先し、未確定なら第1回基準で毎週自動仮置き。
        // 管理画面と揃え、キックオフ・第1回と完了済みは時刻まで、第2〜8回の予定は日付のみ＋「仮決め」。
        const isCompleted = row.status === 'completed' || !!row.completed_at;
        let d, provisional;
        if (isCompleted) {
          const raw = row.started_at || row.completed_at || row.scheduled_at;
          if (!raw) return <span style={{ color: color.textLight }}>未確定</span>;
          d = new Date(raw);
          provisional = false;
        } else {
          const resolved = resolveSessionSchedule(row, session1At);
          if (!resolved) return <span style={{ color: color.textLight }}>未確定</span>;
          d = resolved.date;
          provisional = resolved.provisional;
        }
        const withTime = isCompleted || row.session_no <= 1;
        const dateStr = withTime
          ? `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
          : `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
        return (
          <span style={{ display: 'inline-flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: space[1] }}>
            <span style={{ fontFamily: font.family.mono, color: color.textDark }}>{dateStr}</span>
            {provisional && <span style={{ fontSize: font.size.xs, color: color.textLight }}>仮決め</span>}
          </span>
        );
      },
    },
    {
      key: 'status',
      label: 'ステータス',
      width: 130,
      align: 'center',
      render: row => statusBadge(row),
    },
    {
      key: 'zoom_url',
      label: 'Zoom URL',
      width: 140,
      align: 'center',
      render: row => row.zoom_url ? (
        <a
          href={row.zoom_url}
          target="_blank"
          rel="noreferrer"
          style={{ color: color.navyLight, fontSize: font.size.sm, fontWeight: font.weight.semibold, textDecoration: 'none' }}
        >
          開く
        </a>
      ) : (
        <span style={{ color: color.textLight, fontSize: font.size.xs }}>-</span>
      ),
    },
    {
      key: 'minutes',
      label: '議事録',
      width: 160,
      align: 'center',
      render: row => row.minutes_final ? (
        <Button size="sm" variant="outline" onClick={() => downloadMinutes(row)}>ダウンロード</Button>
      ) : (
        <span style={{ color: color.textLight, fontSize: font.size.xs }}>未公開</span>
      ),
    },
  ];

  return (
    <div style={{ padding: space[6], display: 'flex', flexDirection: 'column', gap: space[5] }}>
      <div>
        <h1 style={{ fontSize: font.size['2xl'], fontWeight: font.weight.bold, color: color.navy, margin: 0 }}>セッション履歴</h1>
        <p style={{ fontSize: font.size.sm, color: color.textMid, marginTop: space[1] }}>
          第0回から第8回までの実施日・Zoom URL・議事録を確認できます。
        </p>
      </div>

      <Card padding="md" variant="subtle">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: space[3] }}>
          <div style={{
            width: 32, height: 32, flexShrink: 0,
            borderRadius: '50%', background: alpha(color.navyLight, 0.12),
            color: color.navyLight,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: font.weight.bold,
          }}>i</div>
          <div style={{ fontSize: font.size.sm, color: color.textMid, lineHeight: font.lineHeight.relaxed }}>
            セッションの録画はトレーナーのみが閲覧します。議事録（AI生成→トレーナー確認済み）はトレーナーのレビュー完了後に公開されます。
          </div>
        </div>
      </Card>

      <Card padding="none">
        <DataTable
          columns={columns}
          rows={completeRows}
          rowKey="id"
          loading={loading}
          emptyMessage="セッション履歴がありません"
          fillWidth
        />
      </Card>
    </div>
  );
}

function statusBadge(row) {
  if (row.status === 'completed' || row.completed_at) {
    return <Badge variant="success" size="sm" dot>完了</Badge>;
  }
  if (row.status === 'next_up') {
    return <Badge variant="info" size="sm" dot>次回実施</Badge>;
  }
  return <Badge variant="neutral" size="sm">未実施</Badge>;
}

function Centered({ children }) {
  return (
    <div style={{ padding: space[6], color: color.textLight, fontSize: font.size.sm }}>{children}</div>
  );
}
