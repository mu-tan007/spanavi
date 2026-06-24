import React, { useEffect, useMemo, useState } from 'react';
import { color, space, font, radius, shadow, alpha } from '../../../../constants/design';
import { Button, Card, Badge } from '../../../ui';
import { useAuth } from '../../../../hooks/useAuth';
import { supabase } from '../../../../lib/supabase';
import { generateDailyMessage } from '../../../../lib/spacareer/ai/mock';
import { resolveSessionSchedule } from '../../../../lib/spacareer/sessionSchedule';

// マイページ「あなたの目標」3カードは、キックオフヒアリングの Q33/Q34/Q35 の回答を引用する。
//   Q33: 今回のスパキャリで「絶対に手に入れたい」ものを3つ
//   Q34: お金以外で本当に大切にしているもの（価値観）を3つ
//   Q35: 尊敬している人物（実在／著名人）とその理由
const GOAL_QUESTION_NUMBERS = [33, 34, 35];
const GOAL_CARD_TITLES = {
  33: '今回のスパキャリで絶対に手に入れたいもの',
  34: 'お金以外で本当に達成したい価値観',
  35: '尊敬している人物とその理由',
};

// 仕様書: tasks/spacareer-spec.md §6.1 基本情報（マイページ）
// 参考: イメージ画像⑦
//
// 構造:
//   ヘッダー
//   原動力フレーズ（AI抽出 §8.5）
//   3カラム: 基本情報 / 学習進捗 / セッション進捗
//   あなたの目標カード×3（第1回事後課題から自動引用）
//   右カラム: 次回セッション情報 / 直近セッション感想 / 今日のひとこと（AI §8.6）

const SESSION_TOTAL = 9; // 第0〜8回

export default function ClientMyPageView() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState(null);
  const [memberRow, setMemberRow] = useState(null);
  const [nextSession, setNextSession] = useState(null);
  const [session1At, setSession1At] = useState(null); // 第1回開始日時（未確定回の毎週仮置き基準）
  const [latestFeedback, setLatestFeedback] = useState(null);
  const [videoStats, setVideoStats] = useState({ watched: 0, watching: 0, notWatched: 0 });
  const [dailyMessage, setDailyMessage] = useState(null);
  const [goalCards, setGoalCards] = useState([]);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;

    (async () => {
      setLoading(true);

      const { data: member } = await supabase
        .from('members')
        .select('id, name, email, rank, org_id')
        .eq('user_id', profile.id)
        .maybeSingle();
      if (!member || cancelled) { setLoading(false); return; }
      setMemberRow(member);

      const { data: cust } = await supabase
        .from('spacareer_customers')
        .select('*')
        .eq('member_id', member.id)
        .maybeSingle();
      if (cancelled) return;
      setCustomer(cust);

      if (!cust) { setLoading(false); return; }

      const { data: nextRows } = await supabase
        .from('spacareer_sessions')
        .select('id, session_no, scheduled_at, zoom_url, status')
        .eq('customer_id', cust.id)
        .in('status', ['next_up', 'not_started'])
        .order('session_no', { ascending: true })
        .limit(1);
      if (!cancelled) setNextSession(nextRows?.[0] || null);

      // 第1回の開始日時（未確定の第2〜8回を毎週仮置き表示する基準）
      const { data: s1Rows } = await supabase
        .from('spacareer_sessions')
        .select('scheduled_at')
        .eq('customer_id', cust.id)
        .eq('session_no', 1)
        .limit(1);
      if (!cancelled) setSession1At(s1Rows?.[0]?.scheduled_at || null);

      const { data: feedbackRows } = await supabase
        .from('spacareer_session_feedbacks')
        .select('id, session_id, satisfaction_score, submitted_at, due_at')
        .eq('customer_id', cust.id)
        .order('created_at', { ascending: false })
        .limit(1);
      if (!cancelled) setLatestFeedback(feedbackRows?.[0] || null);

      const { data: views } = await supabase
        .from('spacareer_video_views')
        .select('status')
        .eq('customer_id', cust.id);
      if (!cancelled) {
        const watched = (views || []).filter(v => v.status === 'watched').length;
        const watching = (views || []).filter(v => v.status === 'watching').length;
        const { count: totalCount } = await supabase
          .from('spacareer_course_videos')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true);
        const total = totalCount ?? (watched + watching);
        const notWatched = Math.max(0, total - watched - watching);
        setVideoStats({ watched, watching, notWatched });
      }

      const d = await generateDailyMessage({ customerId: cust.id });
      if (!cancelled) setDailyMessage(d);

      // 「あなたの目標」3カード: キックオフヒアリングQ33/Q34/Q35の回答から構築。
      // questionsテーブルでquestion_number→idを引いて、responsesから answer_text を取る。
      const { data: goalQuestions } = await supabase
        .from('spacareer_kickoff_hearing_questions')
        .select('id, question_number')
        .eq('org_id', cust.org_id)
        .in('question_number', GOAL_QUESTION_NUMBERS);
      const { data: goalResponses } = await supabase
        .from('spacareer_kickoff_hearing_responses')
        .select('question_id, answer_text, is_draft')
        .eq('customer_id', cust.id)
        .in('question_id', (goalQuestions || []).map(q => q.id));
      const qNumById = new Map((goalQuestions || []).map(q => [q.id, q.question_number]));
      const answerByQNum = new Map();
      (goalResponses || []).forEach(r => {
        if (r.is_draft) return; // 未提出のドラフトはマイページに出さない
        const qNum = qNumById.get(r.question_id);
        if (qNum) answerByQNum.set(qNum, r.answer_text || '');
      });
      const cards = GOAL_QUESTION_NUMBERS.map(qNum => ({
        title: GOAL_CARD_TITLES[qNum],
        body: (answerByQNum.get(qNum) || '').trim()
          || 'キックオフヒアリングを提出すると、ここに自動で表示されます。',
      }));
      if (!cancelled) setGoalCards(cards);
      setLoading(false);
    })().catch(err => {
      console.error('[ClientMyPage] load error:', err);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [profile?.id]);

  const learningPct = useMemo(() => {
    const total = videoStats.watched + videoStats.watching + videoStats.notWatched;
    if (!total) return 0;
    return Math.round((videoStats.watched / total) * 100);
  }, [videoStats]);

  const sessionProgressPct = useMemo(() => {
    if (!customer) return 0;
    const done = (customer.current_session_no ?? 0) + (customer.status === 'graduated' ? 1 : 0);
    return Math.round((done / SESSION_TOTAL) * 100);
  }, [customer]);

  if (loading) {
    return (
      <div style={{ padding: space[6], color: color.textLight, fontSize: font.size.sm }}>
        読み込み中...
      </div>
    );
  }

  if (!customer) {
    return (
      <div style={{ padding: space[6] }}>
        <Card title="受講情報が見つかりません" padding="lg">
          <p style={{ fontSize: font.size.sm, color: color.textMid, margin: 0 }}>
            運営にお問い合わせください。
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: space[6], display: 'flex', flexDirection: 'column', gap: space[5] }}>
      <div>
        <h1 style={{ fontSize: font.size['2xl'], fontWeight: font.weight.bold, color: color.navy, margin: 0 }}>マイページ</h1>
        <p style={{ fontSize: font.size.sm, color: color.textMid, marginTop: space[1] }}>
          自分の成長を可視化し、目標に向かって一歩ずつ進んでいきましょう。
        </p>
      </div>

      <DrivingPhraseHero phrase={customer?.driving_phrase} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: space[5] }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[5] }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: space[4] }}>
            <BasicInfoCard memberRow={memberRow} customer={customer} />
            <LearningProgressCard pct={learningPct} stats={videoStats} />
            <SessionProgressCard pct={sessionProgressPct} customer={customer} />
          </div>

          <div>
            <SectionTitle>あなたの目標</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: space[3], marginTop: space[3] }}>
              {goalCards.map((g, i) => (
                <Card key={i} variant="subtle" padding="md">
                  <div style={{
                    fontSize: font.size.xs,
                    color: color.navyLight,
                    fontWeight: font.weight.semibold,
                    letterSpacing: font.letterSpacing.wide,
                    marginBottom: space[1],
                  }}>
                    GOAL {String(i + 1).padStart(2, '0')}
                  </div>
                  <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.textDark, marginBottom: space[2] }}>
                    {g.title}
                  </div>
                  <div style={{ fontSize: font.size.sm, color: color.textMid, lineHeight: font.lineHeight.relaxed }}>
                    {g.body}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
          <NextSessionCard nextSession={nextSession} session1At={session1At} />
          <FeedbackPromptCard latestFeedback={latestFeedback} />
          <DailyMessageCard message={dailyMessage?.message} />
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: font.size.md,
      fontWeight: font.weight.bold,
      color: color.navy,
      letterSpacing: font.letterSpacing.wide,
    }}>
      {children}
    </div>
  );
}

function DrivingPhraseHero({ phrase }) {
  return (
    <div style={{
      position: 'relative',
      borderRadius: radius.lg,
      background: `linear-gradient(135deg, ${color.navy} 0%, ${color.navyDark} 60%, ${color.navyDeep} 100%)`,
      color: color.white,
      padding: `${space[8]}px ${space[6]}px`,
      boxShadow: shadow.md,
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.10,
        background: `radial-gradient(circle at 80% 20%, ${color.gold} 0%, transparent 50%)`,
      }}/>
      <div style={{ position: 'relative' }}>
        <Badge variant="primary" solid style={{ background: alpha(color.white, 0.18), border: '1px solid ' + alpha(color.white, 0.30), color: color.white }}>
          あなたの原動力
        </Badge>
        <div style={{
          fontSize: font.size.xl,
          fontWeight: font.weight.bold,
          marginTop: space[3],
          lineHeight: font.lineHeight.relaxed,
          maxWidth: 720,
        }}>
          {phrase || 'キックオフヒアリングの「あなたの原動力」セクションに書いた一文が、ここに表示されます。'}
        </div>
        <div style={{
          fontSize: font.size.xs,
          color: alpha(color.white, 0.65),
          marginTop: space[3],
          letterSpacing: font.letterSpacing.wide,
        }}>
          ※ キックオフヒアリングの最後「あなたの原動力」セクションで記入した一文がそのまま反映されます。心がくじけそうな時に見返してください。
        </div>
      </div>
    </div>
  );
}

function BasicInfoCard({ memberRow, customer }) {
  const rows = [
    { label: '氏名', value: memberRow?.name || '-' },
    { label: 'ニックネーム', value: customer?.nickname || '-' },
    { label: 'メールアドレス', value: memberRow?.email || '-' },
    { label: 'スパキャリ開始日', value: customer?.contract_started_at ? new Date(customer.contract_started_at).toLocaleDateString('ja-JP') : '-' },
  ];
  return (
    <Card title="基本情報" action={<Button size="sm" variant="ghost" disabled>編集</Button>} padding="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        {rows.map(r => (
          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', gap: space[3] }}>
            <span style={{ fontSize: font.size.xs, color: color.textLight }}>{r.label}</span>
            <span style={{ fontSize: font.size.sm, color: color.textDark, textAlign: 'right' }}>{r.value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function LearningProgressCard({ pct, stats }) {
  return (
    <Card title="学習の進捗" padding="md">
      <div style={{ display: 'flex', alignItems: 'center', gap: space[4] }}>
        <Donut pct={pct} color={color.navyLight} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
          <Row label="視聴済み" value={stats.watched} variant="success" />
          <Row label="視聴中" value={stats.watching} variant="info" />
          <Row label="未視聴" value={stats.notWatched} variant="neutral" />
        </div>
      </div>
    </Card>
  );
}

function SessionProgressCard({ pct, customer }) {
  return (
    <Card title="セッションの進捗" padding="md">
      <div style={{ display: 'flex', alignItems: 'center', gap: space[4] }}>
        <Donut pct={pct} color={color.gold} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
          <Row label="現在" value={`第${customer?.current_session_no ?? 0}回`} variant="neutral" />
          <Row
            label="ステータス"
            value={customer?.status === 'graduated' ? '卒業' : customer?.status === 'in_progress' ? '受講中' : 'キックオフ前'}
            variant={customer?.status === 'graduated' ? 'success' : 'info'}
          />
        </div>
      </div>
    </Card>
  );
}

function Row({ label, value, variant }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
      <Badge variant={variant} size="sm" dot>{label}</Badge>
      <span style={{ fontSize: font.size.sm, color: color.textDark, fontWeight: font.weight.semibold }}>{value}</span>
    </div>
  );
}

function Donut({ pct, color: stroke }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <svg width={72} height={72} viewBox="0 0 72 72">
      <circle cx="36" cy="36" r={r} fill="none" stroke={color.gray200} strokeWidth="8" />
      <circle
        cx="36" cy="36" r={r} fill="none"
        stroke={stroke} strokeWidth="8"
        strokeDasharray={`${dash} ${c}`}
        strokeDashoffset={c / 4}
        transform="rotate(-90 36 36)"
        strokeLinecap="round"
      />
      <text x="36" y="40" textAnchor="middle" fontSize="14" fontWeight="700" fill={color.navy}>{pct}%</text>
    </svg>
  );
}

function NextSessionCard({ nextSession, session1At }) {
  if (!nextSession) {
    return (
      <Card title="次回のセッション" padding="md">
        <p style={{ fontSize: font.size.sm, color: color.textLight, margin: 0 }}>
          すべてのセッションが完了しました。
        </p>
      </Card>
    );
  }
  // 確定済み(scheduled_at)があればそれを、未確定の第2〜8回は第1回基準で毎週自動仮置き。
  const resolved = resolveSessionSchedule(nextSession, session1At);
  return (
    <Card title="次回のセッション" padding="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.navy }}>
          第{nextSession.session_no}回
        </div>
        <div style={{ fontSize: font.size.sm, color: color.textMid }}>
          {resolved
            ? resolved.date.toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
              + (resolved.provisional ? '（仮）' : '')
            : '日程調整中'}
        </div>
        <div style={{
          marginTop: space[2],
          padding: space[3],
          background: color.cream,
          borderRadius: radius.md,
          fontSize: font.size.xs,
          color: color.textMid,
          lineHeight: font.lineHeight.relaxed,
        }}>
          事前にやっておくこと：事後課題に回答し、提出を完了させましょう。
        </div>
      </div>
    </Card>
  );
}

function FeedbackPromptCard({ latestFeedback }) {
  const unsubmitted = latestFeedback && !latestFeedback.submitted_at;
  return (
    <Card title="直近のセッション感想" padding="md">
      {unsubmitted ? (
        <p style={{ fontSize: font.size.sm, color: color.danger, margin: 0, fontWeight: font.weight.semibold }}>
          未回答のアンケートがあります。
        </p>
      ) : latestFeedback ? (
        <p style={{ fontSize: font.size.sm, color: color.textMid, margin: 0 }}>
          ご回答ありがとうございました。
        </p>
      ) : (
        <p style={{ fontSize: font.size.sm, color: color.textLight, margin: 0 }}>
          セッション完了後にアンケートが届きます。
        </p>
      )}
    </Card>
  );
}

function DailyMessageCard({ message }) {
  return (
    <Card
      padding="md"
      style={{
        background: `linear-gradient(135deg, ${alpha(color.gold, 0.10)} 0%, ${color.white} 100%)`,
        border: `1px solid ${alpha(color.gold, 0.30)}`,
      }}
    >
      <div style={{
        fontSize: font.size.xs,
        fontWeight: font.weight.semibold,
        color: color.gold,
        letterSpacing: font.letterSpacing.wide,
        marginBottom: space[2],
      }}>
        今日のひとこと
      </div>
      <div style={{ fontSize: font.size.md, color: color.textDark, lineHeight: font.lineHeight.relaxed }}>
        {message || '今日も一歩ずつ進んでいきましょう。'}
      </div>
    </Card>
  );
}
