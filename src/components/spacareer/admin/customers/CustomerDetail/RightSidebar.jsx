import React from 'react';
import { color, space, font, radius, alpha } from '../../../../../constants/design';
import { Card, Badge, Button } from '../../../../ui';
import { supabase } from '../../../../../lib/supabase';
import { useAuth } from '../../../../../hooks/useAuth';
import { canChangeCourse } from '../../../../../lib/spacareer/permissions';
import { sessionLabel } from '../../../../../lib/spacareer/sessionOrder';
import { KICKOFF_CHECK_KEYS } from './TabKickoff';

const SOCIAL_STYLE_LABELS = {
  analytical: 'アナリティカル',
  driver: 'ドライバー',
  expressive: 'エクスプレッシブ',
  amiable: 'エミアブル',
};

// ============================================================
// 右カラム（タブ連動）
// 仕様書 §7.1 右：タブ連動
// ============================================================
function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function RightSidebar({ detail, activeTab, onRefresh }) {
  if (!detail) return null;
  const { customer, sessions = [], homework = [], strength, kickoff, trainer } = detail;

  const sessMatch = /^session-([1-8])-([12])$/.exec(activeTab);
  if (sessMatch) {
    const label = `${sessionLabel({ session_no: Number(sessMatch[1]), part: Number(sessMatch[2]) })}セッション管理`;
    return <SilentSidebar label={label} />;
  }

  switch (activeTab) {
    case 'basic':       return <BasicSidebar customer={customer} sessions={sessions} trainer={trainer} onRefresh={onRefresh} />;
    case 'kickoff':     return <KickoffSidebar kickoff={kickoff} sessions={sessions} />;
    case 'sessions':    return <SessionsSidebar sessions={sessions} />;
    case 'homework':    return <HomeworkSidebar homework={homework} />;
    case 'strengths':   return <StrengthSidebar strength={strength} />;
    case 'files':       return <SilentSidebar label="ファイル" />;
    case 'memo':        return <SilentSidebar label="メモ" />;
    case 'members':     return <BasicSidebar customer={customer} sessions={sessions} trainer={trainer} onRefresh={onRefresh} />;
    case 'video_logs':  return <VideoLogsSidebar />;
    default:            return <SilentSidebar label="—" />;
  }
}

function SilentSidebar({ label }) {
  return (
    <Card padding="md" title={`右パネル：${label}`}>
      <div style={{ color: color.textLight, fontSize: font.size.sm }}>
        このタブの右パネルには専用情報は表示されません
      </div>
    </Card>
  );
}

function BasicSidebar({ customer, sessions, trainer, onRefresh }) {
  if (!customer) return null;
  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <CourseCard customer={customer} sessions={sessions} onRefresh={onRefresh} />
      <Card padding="md" title="クイックアクション">
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          <Button variant="outline" size="sm" disabled>Slackチャンネルを開く（準備中）</Button>
          <Button variant="outline" size="sm" disabled>診断URLを再送（準備中）</Button>
          <Button variant="outline" size="sm" disabled>パスワード再設定通知（準備中）</Button>
        </div>
      </Card>
      <Card padding="md" title="担当">
        <div style={{ fontSize: font.size.sm, color: color.textDark }}>
          {trainer ? trainer.name : <span style={{ color: color.danger }}>未アサイン</span>}
        </div>
      </Card>
    </div>
  );
}

function CourseCard({ customer, sessions = [], onRefresh }) {
  const [saving, setSaving] = React.useState(false);
  const { profile } = useAuth();
  // コース/プラン変更は篠宮・小山のみ（むー様指示 2026-07-10）。他トレーナーには操作ボタンを出さない。
  const canChange = canChangeCourse(profile?.email);
  const course = customer?.course || 'kyoka';
  const styleLabel = SOCIAL_STYLE_LABELS[customer?.social_style_type] || (customer?.social_style_type || '未診断');
  const total = sessions.length; // キックオフ込みの総セッション数（強化=9 / 応用=17）

  async function change(next) {
    if (saving || next === course) return;
    const msg = next === 'oyo'
      ? '応用コースに変更します。\nプラスアルファ（α1〜8）セッションを追加します。これまでのセッション記録は引き継がれます。\n\nよろしいですか？'
      : '強化コース（8回）に変更します。\n未実施のプラスアルファ（α）セッションは削除されます（実施済みの記録は残ります）。\n\nよろしいですか？';
    if (!window.confirm(msg)) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('fn_spacareer_set_course', {
        p_customer_id: customer.id, p_course: next,
      });
      if (error) throw error;
      if (onRefresh) await onRefresh();
    } catch (e) {
      console.error('[CourseCard] set_course error:', e);
      alert('コース変更に失敗しました: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="md" title="コース / プラン">
      <div style={{ display: 'grid', gap: space[2] }}>
        <Badge variant={course === 'oyo' ? 'primary' : 'neutral'} dot>
          {course === 'oyo' ? 'AI新規開拓応用コース（16回）' : 'AI新規開拓強化コース（8回）'}
        </Badge>
        <div style={{ fontSize: font.size.xs, color: color.textMid }}>
          ソーシャルスタイル：
          <span style={{ color: color.textDark, fontWeight: font.weight.semibold }}>{styleLabel}</span>
        </div>
        <div style={{ fontSize: font.size.xs, color: color.textLight }}>
          全{total}セッション（キックオフ込み）
        </div>
        {canChange ? (
          <div style={{ display: 'flex', gap: space[2], marginTop: space[1] }}>
            <Button variant={course === 'kyoka' ? 'primary' : 'outline'} size="sm"
              loading={saving && course !== 'kyoka'} disabled={saving}
              onClick={() => change('kyoka')}>強化(8回)</Button>
            <Button variant={course === 'oyo' ? 'primary' : 'outline'} size="sm"
              loading={saving && course !== 'oyo'} disabled={saving}
              onClick={() => change('oyo')}>応用(16回)</Button>
          </div>
        ) : (
          <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: space[1] }}>
            コース・プランの変更は篠宮・小山のみ可能です。
          </div>
        )}
      </div>
    </Card>
  );
}

function KickoffSidebar({ kickoff, sessions }) {
  // キックオフ管理タブの現行チェックリスト（13項目）と同じキーで進捗を計算する。
  // 旧実装は廃止済みの9キーで計算していたため、全項目チェック済みでも最大5/9にしかならなかった。
  const checked = kickoff ? KICKOFF_CHECK_KEYS.filter((k) => !!kickoff[k]).length : 0;
  const pct = KICKOFF_CHECK_KEYS.length
    ? Math.round((checked / KICKOFF_CHECK_KEYS.length) * 100)
    : 0;
  const firstSession = sessions.find((s) => s.session_no === 1);
  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <Card padding="md" title="ヒアリング進捗">
        <Donut percent={pct} label={`${checked}/${KICKOFF_CHECK_KEYS.length}`} />
      </Card>
      <Card padding="md" title="第1回セッション開始">
        <div style={{ fontSize: font.size.sm, color: color.textDark, fontFamily: font.family.mono }}>
          {kickoff?.session_1_start_at ? fmtDate(kickoff.session_1_start_at)
            : firstSession?.scheduled_at ? fmtDate(firstSession.scheduled_at)
              : <span style={{ color: color.textLight, fontFamily: font.family.sans }}>未設定</span>}
        </div>
      </Card>
    </div>
  );
}

function SessionsSidebar({ sessions }) {
  const completed = sessions.filter((s) => s.status === 'completed');
  const nextUp = sessions.find((s) => s.status === 'next_up')
    || sessions.find((s) => s.status === 'not_started');
  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <Card padding="md" title="次回セッション">
        {nextUp ? (
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{
              fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.navy,
            }}>{sessionLabel(nextUp)}</div>
            <div style={{
              fontSize: font.size.sm, fontFamily: font.family.mono, color: color.textMid,
            }}>{fmtDate(nextUp.scheduled_at)}</div>
          </div>
        ) : (
          <div style={{ color: color.textLight, fontSize: font.size.sm }}>未予定</div>
        )}
      </Card>
      <Card padding="md" title="完了済みセッション">
        <div style={{
          fontSize: font.size.xl, fontWeight: font.weight.bold,
          color: color.success, fontFamily: font.family.mono,
        }}>{completed.length} <span style={{ fontSize: font.size.sm, color: color.textLight }}>/ {sessions.length}</span></div>
      </Card>
    </div>
  );
}

function HomeworkSidebar({ homework }) {
  const total = 8;
  const submitted = homework.filter((h) => h.status === 'submitted' || h.status === 'completed').length;
  const partial = homework.filter((h) => h.status === 'partial').length;
  const pct = Math.round((submitted / total) * 100);
  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <Card padding="md" title="事後課題 提出進捗">
        <Donut percent={pct} label={`${submitted}/${total}`} />
      </Card>
      <Card padding="md" title="部分提出中">
        <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.warn }}>
          {partial} <span style={{ fontSize: font.size.sm, color: color.textLight }}>件</span>
        </div>
      </Card>
      <Card padding="md" title="AI 自動生成ツール" description="議事録アップロード + 次回課題生成">
        <Button variant="outline" size="sm" fullWidth disabled>セッション管理で実行</Button>
      </Card>
    </div>
  );
}

function StrengthSidebar({ strength }) {
  if (!strength || !strength.completed_at) {
    return (
      <Card padding="md" title="診断サマリ">
        <div style={{ color: color.textLight, fontSize: font.size.sm }}>未診断</div>
      </Card>
    );
  }
  const tags = Array.isArray(strength.strengths) ? strength.strengths : [];
  return (
    <Card padding="md" title="強み Top 3">
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        {tags.slice(0, 3).map((t, i) => (
          <Badge key={i} variant="primary" solid dot size="md">{t}</Badge>
        ))}
      </div>
    </Card>
  );
}

function VideoLogsSidebar() {
  return (
    <Card padding="md" title="視聴時間サマリ" description="日次の視聴時間積み上げグラフは Phase 4 で追加予定">
      <div style={{
        height: 120, borderRadius: radius.md,
        background: `linear-gradient(180deg, ${alpha(color.navyLight, 0.06)}, ${alpha(color.navyLight, 0.0)})`,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around',
        padding: space[2],
      }}>
        {[20, 35, 12, 48, 60, 30, 18].map((h, i) => (
          <div key={i} style={{
            width: 16, height: `${h}%`,
            background: color.navyLight, borderRadius: radius.sm,
          }}/>
        ))}
      </div>
    </Card>
  );
}

function Donut({ percent, label }) {
  const size = 100, stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color.gray100} strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color.navyLight} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div>
        <div style={{
          fontSize: font.size['2xl'], fontWeight: font.weight.bold,
          color: color.navy, fontFamily: font.family.mono,
        }}>{percent}%</div>
        <div style={{ fontSize: font.size.xs, color: color.textMid }}>{label}</div>
      </div>
    </div>
  );
}
