import React from 'react';
import { color, space, font, radius } from '../../../../../constants/design';
import { Card, Badge, DataTable } from '../../../../ui';
import { SOCIAL_STYLE_DESCRIPTIONS } from '../../social-style/socialStyleQuestions';

// ============================================================
// 1. 基本情報タブ
// 仕様書 §7.1 中央タブ#1
// ============================================================
const SS_LABEL = {
  analytical: '論理分析型', driver: '行動推進型',
  expressive: '感情表現型', amiable: '協調共感型',
};
const SS_VARIANT = {
  analytical: 'primary', driver: 'danger',
  expressive: 'warn', amiable: 'success',
};

function fmt(v) { return v == null || v === '' ? '—' : String(v); }
function dateOnly(v) {
  if (!v) return '—';
  const d = new Date(v);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function dateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function TabBasicInfo({ detail }) {
  if (!detail) return null;
  const { customer, trainer, socialStyle, monetizationDiagnosis } = detail;
  const member = customer?.member || {};

  // 事後課題の提出履歴（提出回数ごとの達成率スナップショット）。
  // useCustomerDetail で session_no昇順→submitted_at昇順に取得済み。回ごとに「N回目」を採番する。
  const submissionRows = (() => {
    const counter = {};
    return (detail.homeworkSubmissions || []).map((s) => {
      counter[s.session_no] = (counter[s.session_no] || 0) + 1;
      const onTime = s.due_at ? new Date(s.submitted_at).getTime() <= new Date(s.due_at).getTime() : null;
      return {
        id: s.id,
        session_label: `第${s.session_no}回`,
        attempt_label: `${counter[s.session_no]}回目`,
        due_at: s.due_at,
        submitted_at: s.submitted_at,
        percentage: s.percentage,
        on_time: onTime,
      };
    });
  })();

  // キックオフヒアリングの記入率（目安）。全項目を対象に、下限文字数があれば文字数比で按分した平均。
  const hearingQs = detail.kickoffHearingQuestions || [];
  const hearingRespByQ = new Map((detail.kickoffHearingResponses || []).map((r) => [r.question_id, r.answer_text || '']));
  const hearingFillPct = hearingQs.length
    ? Math.round(hearingQs.reduce((sum, q) => {
        const v = (hearingRespByQ.get(q.id) || '').trim();
        if (!v.length) return sum;
        const th = q.min_chars && q.min_chars > 0 ? q.min_chars : 1;
        return sum + Math.min(1, v.length / th);
      }, 0) / hearingQs.length * 100)
    : 0;

  return (
    <div style={{ display: 'grid', gap: space[4] }}>
      <Card padding="md" title="プロフィール">
        <Grid>
          <Row label="氏名" value={fmt(member.name)} />
          <Row label="ニックネーム" value={fmt(customer?.nickname)} />
          <Row label="メールアドレス" value={fmt(member.email)} mono />
          <Row label="電話番号" value={fmt(member.phone)} mono />
          <Row label="生年月日" value={dateOnly(customer?.birthdate)} />
          <Row label="職業" value={fmt(customer?.occupation)} />
          <Row label="現年収" value={customer?.current_annual_income ? `¥${Number(customer.current_annual_income).toLocaleString()}` : '—'} mono />
          <Row label="目標年収" value={customer?.target_annual_income ? `¥${Number(customer.target_annual_income).toLocaleString()}` : '—'} mono />
        </Grid>
      </Card>

      <Card padding="md" title="契約情報">
        <Grid>
          <Row label="スパキャリ開始日" value={dateOnly(customer?.contract_started_at)} />
          <Row label="契約終了日" value={dateOnly(customer?.contract_ended_at)} />
          <Row label="ステータス"
            value={<Badge variant={customer?.status === 'graduated' ? 'success' : customer?.status === 'cancelled' ? 'danger' : 'primary'} dot>
              {customer?.status || '—'}
            </Badge>} />
          <Row label="現在の回数" value={`第${customer?.current_session_no ?? 0}回 / 9`} mono />
          <Row label="ヒアリング記入率" value={hearingQs.length ? `${hearingFillPct}%` : '—'} mono />
          <Row label="直案件DB閲覧権限"
            value={customer?.direct_db_access_granted_at
              ? <Badge variant="success" dot>付与済</Badge>
              : <Badge variant="neutral">未付与</Badge>} />
        </Grid>
      </Card>

      <Card padding="md" title="ソーシャルスタイル診断"
        description="運営内部のみ閲覧可。タイプに応じた接し方の注意点も表示されます。">
        {socialStyle && socialStyle.completed_at ? (
          <>
            <Grid>
              <Row label="タイプ"
                value={<Badge variant={SS_VARIANT[socialStyle.result_type] || 'primary'} dot solid>
                  {SS_LABEL[socialStyle.result_type] || socialStyle.result_type}
                </Badge>} />
              <Row label="完了日時" value={dateOnly(socialStyle.completed_at)} />
              <Row label="スコアバランス"
                value={socialStyle.result_scores
                  ? Object.entries(socialStyle.result_scores)
                      .map(([k, v]) => `${SS_LABEL[k] || k}: ${v}`).join(' / ')
                  : '—'}
                mono />
            </Grid>
            {SOCIAL_STYLE_DESCRIPTIONS[socialStyle.result_type] && (
              <SocialStyleCoachingBlock def={SOCIAL_STYLE_DESCRIPTIONS[socialStyle.result_type]} />
            )}
          </>
        ) : (
          <div style={{ color: color.textLight, fontSize: font.size.sm }}>
            診断未完了です。スパキャリ &gt; ソーシャルスタイル管理画面から診断招待を発行してください。
          </div>
        )}
      </Card>

      <Card padding="md" title="マネタイズ領域診断（第1回事後課題）"
        description="受講生が回答した、どの領域×業界で勝つかの診断結果とAIレポート。">
        {monetizationDiagnosis && monetizationDiagnosis.completed_at && monetizationDiagnosis.result?.primary ? (
          <>
            <Grid>
              <Row label="最有力"
                value={<Badge variant="success" dot>
                  {monetizationDiagnosis.result.primary.domainLabel} × {monetizationDiagnosis.result.primary.industryLabel}（{monetizationDiagnosis.result.primary.score}）
                </Badge>} />
              <Row label="完了日時" value={dateOnly(monetizationDiagnosis.completed_at)} />
              <Row label="次点候補"
                value={(monetizationDiagnosis.result.topCombos || []).slice(1, 4)
                  .map((c) => `${c.domainLabel}×${c.industryLabel}`).join(' / ') || '—'} />
            </Grid>
            {monetizationDiagnosis.report_text && (
              <div style={{
                marginTop: space[3], padding: space[3],
                background: color.snow, border: `1px solid ${color.borderLight}`,
                borderRadius: radius.md, fontSize: font.size.sm, color: color.textDark,
                lineHeight: font.lineHeight.relaxed, whiteSpace: 'pre-wrap',
                maxHeight: 320, overflowY: 'auto',
              }}>
                {monetizationDiagnosis.report_text}
              </div>
            )}
          </>
        ) : (
          <div style={{ color: color.textLight, fontSize: font.size.sm }}>
            診断未完了です。受講生がクライアントポータルの「マネタイズ領域診断」から実施します。
          </div>
        )}
      </Card>

      <Card padding="md" title="担当トレーナー">
        {trainer ? (
          <Grid>
            <Row label="氏名" value={trainer.name} />
            <Row label="メールアドレス" value={fmt(trainer.email)} mono />
            <Row label="電話番号" value={fmt(trainer.phone)} mono />
            <Row label="アサイン日" value={dateOnly(customer?.assigned_at)} />
          </Grid>
        ) : (
          <div style={{
            padding: space[3], background: color.dangerSoft, color: '#A20018',
            fontSize: font.size.sm, borderRadius: radius.md,
          }}>
            担当トレーナー未アサイン。上部の「メンバー」タブから手動でアサインしてください。
          </div>
        )}
      </Card>

      <Card padding="md" title="事後課題 提出履歴"
        description="受講生が「回答を提出」した各回の、提出日時とその時点の達成率。同じ回で複数回提出した場合は提出回数ごとに記録されます。">
        <DataTable
          columns={[
            { key: 'session_label', label: '回', width: 70, align: 'left' },
            { key: 'attempt_label', label: '提出回数', width: 90, align: 'center' },
            { key: 'due_at', label: '締切日', width: 110, align: 'right',
              render: (r) => dateOnly(r.due_at), cellStyle: { fontFamily: font.family.mono } },
            { key: 'submitted_at', label: '提出日時', width: 150, align: 'right',
              render: (r) => dateTime(r.submitted_at), cellStyle: { fontFamily: font.family.mono } },
            { key: 'on_time', label: '期限', width: 90, align: 'center',
              render: (r) => r.on_time == null
                ? <span style={{ color: color.textLight }}>—</span>
                : <Badge variant={r.on_time ? 'success' : 'warn'} dot>{r.on_time ? '期限内' : '期限後'}</Badge> },
            { key: 'percentage', label: '達成率', width: 90, align: 'right',
              render: (r) => <Badge variant={r.percentage >= 100 ? 'success' : r.percentage > 0 ? 'info' : 'neutral'} dot>{r.percentage}%</Badge> },
          ]}
          rows={submissionRows}
          rowKey="id"
          height="auto"
          emptyMessage="まだ提出履歴がありません（本機能の追加後の提出から記録されます）。"
        />
      </Card>
    </div>
  );
}

// タイプ別の強み/注意点/接し方tipsをまとめて表示するブロック。
// 運営・トレーナー向け。受講生のマイページには出さない。
function SocialStyleCoachingBlock({ def }) {
  return (
    <div style={{ marginTop: space[3] }}>
      <div style={{
        padding: space[3], background: color.cream, borderRadius: radius.md,
        fontSize: font.size.sm, color: color.textDark, lineHeight: font.lineHeight.relaxed,
        marginBottom: space[3],
      }}>
        <div style={{ fontWeight: font.weight.semibold, color: color.navy, marginBottom: space[1] }}>
          {def.headline}
        </div>
        {def.summary}
      </div>
      <CoachingList title="強み" items={def.strengths} variant="success" />
      <CoachingList title="注意点" items={def.cautions} variant="warn" />
      <CoachingList title="接し方のポイント（トレーナー向け 要約）" items={def.coach_tips} variant="info" />
      {def.coach_detailed_guide && (
        <DetailedGuideBlock guide={def.coach_detailed_guide} />
      )}
    </div>
  );
}

// タイプ別「トレーナーがどう接するか」の詳細指針を6項目で展開する
function DetailedGuideBlock({ guide }) {
  const sections = [
    { key: 'conversation_opener', label: '会話の入り方' },
    { key: 'feedback_style',      label: 'フィードバックの伝え方' },
    { key: 'motivation_design',   label: '動機付け方' },
    { key: 'homework_design',     label: '宿題の設計傾向' },
    { key: 'avoid',               label: '避けるべき関わり方' },
    { key: 'growth_arc',          label: '期待される成長パターン' },
  ].filter(s => guide[s.key]);
  if (!sections.length) return null;
  return (
    <div style={{ marginTop: space[3] }}>
      <div style={{
        fontSize: font.size.xs, color: color.navy,
        letterSpacing: font.letterSpacing.wider,
        fontWeight: font.weight.bold, marginBottom: space[2],
        padding: `${space[2]}px ${space[3]}px`,
        background: color.cream, borderRadius: radius.sm,
      }}>
        トレーナー向け 詳細指針
      </div>
      <div style={{ display: 'grid', gap: space[3] }}>
        {sections.map(s => (
          <div key={s.key} style={{
            border: `1px solid ${color.borderLight}`,
            borderRadius: radius.md,
            padding: space[3],
            background: color.white,
          }}>
            <div style={{
              fontSize: font.size.xs, color: color.textMid,
              letterSpacing: font.letterSpacing.wider,
              fontWeight: font.weight.semibold,
              marginBottom: space[1],
            }}>
              {s.label}
            </div>
            <div style={{
              fontSize: font.size.sm, color: color.textDark,
              lineHeight: font.lineHeight.relaxed,
              whiteSpace: 'pre-line',
            }}>
              {guide[s.key]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CoachingList({ title, items, variant }) {
  if (!items || !items.length) return null;
  return (
    <div style={{ marginBottom: space[3] }}>
      <div style={{
        fontSize: font.size.xs, color: color.textMid,
        letterSpacing: font.letterSpacing.wider,
        fontWeight: font.weight.semibold, marginBottom: space[1],
      }}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map((it, i) => <Badge key={i} variant={variant}>{it}</Badge>)}
      </div>
    </div>
  );
}

function Grid({ children }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '180px 1fr',
      rowGap: space[2], columnGap: space[3],
      fontSize: font.size.sm,
    }}>{children}</div>
  );
}
function Row({ label, value, mono }) {
  return (
    <>
      <div style={{
        color: color.textMid, fontWeight: font.weight.semibold,
        letterSpacing: font.letterSpacing.wide,
      }}>{label}</div>
      <div style={{
        color: color.textDark,
        fontFamily: mono ? font.family.mono : undefined,
      }}>{value}</div>
    </>
  );
}
