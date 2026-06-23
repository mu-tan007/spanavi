import React, { useEffect, useMemo, useState } from 'react';
import { color, space, font, radius } from '../../../../../constants/design';
import { Card, Badge, DataTable, Select } from '../../../../ui';
import { supabase } from '../../../../../lib/supabase';
import HomeworkFileLink from './HomeworkFileLink';

// ============================================================
// 4. 事後課題タブ（提出サマリ＋回答内容ビューア）
// 仕様書 §7.1 中央タブ#4
//   変動課題の生成・追加公開は各回の「セッション管理」タブへ移設（むー様 2026-06-23）。
//   本タブは提出状況サマリと、受講生の回答内容（テキスト/添付ファイル）の確認に専念する。
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
function deadlineState(h) {
  if (!h) return 'none';
  const completed = h.first_completed_at ? new Date(h.first_completed_at) : null;
  const due = h.due_at ? new Date(h.due_at) : null;
  if (completed) {
    if (due && completed.getTime() > due.getTime()) return 'late';
    return 'on_time';
  }
  if (due && Date.now() > due.getTime() && (h.status && h.status !== 'pending' && h.status !== 'unnotified')) return 'overdue';
  return 'none';
}
const DEADLINE_LABEL = { on_time: '期限内達成', late: '期限後達成', overdue: '期限内未達成', none: '—' };
const DEADLINE_VARIANT = { on_time: 'success', late: 'warn', overdue: 'danger', none: 'neutral' };

export default function TabHomework({ detail, customerId, onRefresh }) {
  const { homework = [], sessions = [] } = detail || {};
  const sessByNo = {};
  sessions.forEach((s) => { sessByNo[s.session_no] = s; });

  const rows = [1, 2, 3, 4, 5, 6, 7, 8].map((no) => {
    const h = homework.find((x) => x.session_no === no);
    const s = sessByNo[no];
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

  // ---- 回答内容ビューア ----
  // 公開済み(notified_at あり)の課題を選んで、受講生の回答（テキスト/添付）を確認する。
  const answerable = useMemo(
    () => (homework || []).filter((h) => h.notified_at).sort((a, b) => b.session_no - a.session_no),
    [homework],
  );
  const [selId, setSelId] = useState('');
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const selected = useMemo(
    () => answerable.find((h) => h.id === selId) || answerable[0] || null,
    [answerable, selId],
  );

  useEffect(() => {
    if (answerable.length && !answerable.find((h) => h.id === selId)) setSelId(answerable[0].id);
  }, [answerable, selId]);

  useEffect(() => {
    if (!selected?.id) { setItems([]); return; }
    let cancelled = false;
    setLoadingItems(true);
    (async () => {
      const { data } = await supabase
        .from('spacareer_homework_items')
        .select('*')
        .eq('homework_id', selected.id)
        .eq('is_published', true)
        .order('position', { ascending: true });
      if (cancelled) return;
      setItems(data || []);
      setLoadingItems(false);
    })();
    return () => { cancelled = true; };
  }, [selected?.id]);

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

      {/* 回答内容ビューア */}
      <Card padding="md" title="事後課題の回答内容"
        description="受講生が提出したテキスト回答・添付ファイルを確認できます。"
        action={answerable.length ? (
          <Select size="sm" fullWidth={false} value={selected?.id || ''}
            onChange={(e) => setSelId(e.target.value)}
            options={answerable.map((h) => ({ value: h.id, label: `第${h.session_no}回` }))} />
        ) : null}
      >
        {!answerable.length ? (
          <div style={{ fontSize: font.size.sm, color: color.textLight, padding: space[3], textAlign: 'center' }}>
            公開済みの事後課題はまだありません。
          </div>
        ) : loadingItems ? (
          <div style={{ fontSize: font.size.sm, color: color.textLight, padding: space[3], textAlign: 'center' }}>
            読み込み中...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
            {items.map((it, idx) => (
              <AnswerRow key={it.id} index={idx + 1} item={it} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// 1設問の回答表示。テキストは answer_text、ファイル提出は attached_files を署名URLで開ける。
function AnswerRow({ index, item }) {
  const files = Array.isArray(item.attached_files) ? item.attached_files : [];
  const answered = item.item_type === 'file' ? files.length > 0 : !!(item.answer_text || '').trim();
  return (
    <div style={{
      border: `1px solid ${color.borderLight}`, borderRadius: radius.md,
      padding: space[3], background: color.white,
    }}>
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center', marginBottom: space[2] }}>
        <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs, color: color.textLight, minWidth: 28 }}>
          #{String(index).padStart(2, '0')}
        </span>
        {item.item_type === 'file' && <Badge variant="info" dot>ファイル提出</Badge>}
        {item.is_required && <Badge variant="neutral">必須</Badge>}
        <span style={{ marginLeft: 'auto' }}>
          {answered ? <Badge variant="success" dot>回答あり</Badge> : <Badge variant="warn" dot>未回答</Badge>}
        </span>
      </div>
      <div style={{ fontSize: font.size.sm, color: color.textDark, fontWeight: font.weight.semibold, marginBottom: space[2] }}>
        {item.question_text}
      </div>
      {item.item_type === 'file' ? (
        files.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
            {files.map((f, i) => <HomeworkFileLink key={i} file={f} />)}
          </div>
        ) : (
          <div style={{ fontSize: font.size.xs, color: color.textLight }}>未提出</div>
        )
      ) : (
        <div style={{
          fontSize: font.size.sm, color: answered ? color.textDark : color.textLight,
          whiteSpace: 'pre-wrap', background: color.snow, borderRadius: radius.sm, padding: space[2],
        }}>
          {item.answer_text || '（未記入）'}
        </div>
      )}
    </div>
  );
}
