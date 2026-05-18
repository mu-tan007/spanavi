import React, { useState, useEffect, useMemo } from 'react';
import { color, space, radius, font, alpha } from '../../../../../constants/design';
import { Button, Input, Card, Badge } from '../../../../ui';
import { supabase } from '../../../../../lib/supabase';
import { getOrgId } from '../../../../../lib/orgContext';
import SessionCompleteFlow from './SessionCompleteFlow';

// ============================================================
// 2. キックオフ管理タブ
// 仕様書 §7.1 キックオフ管理タブ / §5.2 キックオフ
// ============================================================
const CHECK_FIELDS = [
  { key: 'check_unclear_points',          label: '4.3.1 不明点・不安点のヒアリング' },
  { key: 'check_session_content',         label: '4.3.2 セッション内容の説明' },
  { key: 'check_refund_policy',           label: '4.3.3 全額返金保証ポリシーの説明（第3回まで）' },
  { key: 'check_reschedule_rules',        label: '4.3.4 振替・キャンセル規定の説明' },
  { key: 'check_weekly_pace',             label: '4.3.5 週1回連続実施ペースの確認' },
  { key: 'check_zoom_recording',          label: '4.3.6 Zoom録画・保管方針の説明' },
  { key: 'check_schedule_done',           label: '4.3.7 スケジュール調整の完了' },
  { key: 'check_all_sessions_dated',      label: '4.3.8 第1〜第8回 全回の日程確定' },
  { key: 'check_first_session_confirmed', label: '4.3.9 第1回開始日時の確定' },
];

function pad(n) { return n < 10 ? `0${n}` : String(n); }
function toDateInput(v) {
  if (!v) return '';
  const d = new Date(v);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toDateTimeInput(v) {
  if (!v) return '';
  const d = new Date(v);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TabKickoff({ detail, onRefresh }) {
  const { customer, sessions, kickoff, videos } = detail || {};
  const customerId = customer?.id;
  const [form, setForm] = useState(() => buildForm(kickoff));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => { setForm(buildForm(kickoff)); }, [kickoff]);

  const allChecked = CHECK_FIELDS.every((f) => !!form[f.key]);
  const checkedCount = CHECK_FIELDS.filter((f) => !!form[f.key]).length;
  const kickoffSession = useMemo(
    () => (sessions || []).find((s) => s.session_no === 0) || null, [sessions]);
  const hasVideo = useMemo(
    () => (videos || []).some((v) => v.session?.session_no === 0), [videos]);
  const hasMinutes = !!kickoffSession?.minutes_draft;

  async function handleSave() {
    if (!customerId) return;
    setSaving(true);
    try {
      const orgId = getOrgId();
      const payload = { org_id: orgId, customer_id: customerId, ...form };
      const { error } = await supabase.from('spacareer_kickoff_checks')
        .upsert(payload, { onConflict: 'customer_id' });
      if (error) throw error;

      const sessByNo = {};
      (sessions || []).forEach((s) => { sessByNo[s.session_no] = s; });
      for (let i = 1; i <= 8; i++) {
        const dateKey = `session_${i}_date`;
        const v = form[dateKey];
        if (!v) continue;
        const target = sessByNo[i];
        if (!target) continue;
        const scheduledAt = i === 1 && form.session_1_start_at
          ? new Date(form.session_1_start_at).toISOString()
          : new Date(`${v}T10:00:00`).toISOString();
        await supabase.from('spacareer_sessions')
          .update({ scheduled_at: scheduledAt }).eq('id', target.id);
      }

      setSavedAt(new Date());
      onRefresh && onRefresh();
    } catch (e) {
      console.error('[TabKickoff] save error:', e);
      alert(`保存に失敗しました: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: space[4] }}>
      <Card padding="md"
        title="ヒアリングシート（PDF §4.3.1〜4.3.9）"
        description={`全${CHECK_FIELDS.length}項目チェック完了で「セッション完了」が押下可能になります（必須ゲート）。`}
        action={<Badge variant={allChecked ? 'success' : 'warn'} dot>
          {checkedCount}/{CHECK_FIELDS.length} 項目チェック
        </Badge>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
          {CHECK_FIELDS.map((f) => (
            <label key={f.key} style={{
              display: 'flex', alignItems: 'center', gap: space[2],
              padding: `${space[2]}px ${space[2]}px`,
              borderRadius: radius.md,
              background: form[f.key] ? alpha(color.success, 0.06) : 'transparent',
              cursor: 'pointer',
            }}>
              <input type="checkbox" checked={!!form[f.key]}
                onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.checked }))}
                style={{ width: 16, height: 16, accentColor: color.success, cursor: 'pointer' }} />
              <span style={{
                fontSize: font.size.sm,
                color: form[f.key] ? color.textDark : color.textMid,
                fontWeight: form[f.key] ? font.weight.semibold : font.weight.normal,
              }}>{f.label}</span>
            </label>
          ))}
        </div>
      </Card>

      <Card padding="md" title="お客様からの質問記録"
        description="キックオフ中に出た質問・気になり事を記録します。後続セッションへの引き継ぎ用。">
        <textarea
          value={form.customer_questions_log || ''}
          onChange={(e) => setForm((p) => ({ ...p, customer_questions_log: e.target.value }))}
          placeholder="例) 第3回までに転職活動を本格化したい意向あり…"
          rows={5}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: space[3], fontSize: font.size.sm,
            fontFamily: font.family.sans, color: color.textDark,
            background: color.white,
            border: `1px solid ${color.border}`,
            borderRadius: radius.md, outline: 'none', resize: 'vertical',
          }}
        />
      </Card>

      <Card padding="md" title="第1〜第8回 大枠日程"
        description="第1〜第8回の日付を確定します。第1回のみ時間まで入力。">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: space[3] }}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <Input key={n} size="sm" label={`第${n}回`} type="date"
              value={toDateInput(form[`session_${n}_date`])}
              onChange={(e) => setForm((p) => ({ ...p, [`session_${n}_date`]: e.target.value }))} />
          ))}
        </div>
        <div style={{ marginTop: space[3] }}>
          <Input size="sm" label="第1回 開始日時（日付＋時間）" type="datetime-local"
            value={toDateTimeInput(form.session_1_start_at)}
            onChange={(e) => setForm((p) => ({ ...p, session_1_start_at: e.target.value }))}
            hint="第1回の開始日時を確定すると、自動的にスケジュールに反映されます。" />
        </div>
      </Card>

      <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
        <Button variant="outline" loading={saving} onClick={handleSave}>ヒアリング内容を保存</Button>
        {savedAt && (
          <span style={{ fontSize: font.size.xs, color: color.success }}>
            保存しました（{savedAt.toLocaleTimeString()}）
          </span>
        )}
      </div>

      <SessionCompleteFlow session={kickoffSession} customerId={customerId}
        hearingSheetChecked={allChecked}
        hasVideo={hasVideo} hasMinutes={hasMinutes}
        onCompleted={onRefresh} />
    </div>
  );
}

function buildForm(k) {
  const base = {
    customer_questions_log: '',
    session_1_date: null, session_2_date: null, session_3_date: null, session_4_date: null,
    session_5_date: null, session_6_date: null, session_7_date: null, session_8_date: null,
    session_1_start_at: null,
  };
  CHECK_FIELDS.forEach((f) => { base[f.key] = false; });
  if (!k) return base;
  Object.keys(base).forEach((key) => {
    if (k[key] !== undefined && k[key] !== null) base[key] = k[key];
  });
  return base;
}
