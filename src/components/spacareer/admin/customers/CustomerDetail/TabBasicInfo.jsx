import React from 'react';
import { color, space, font, radius } from '../../../../../constants/design';
import { Card, Badge } from '../../../../ui';

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

export default function TabBasicInfo({ detail }) {
  if (!detail) return null;
  const { customer, trainer, socialStyle } = detail;
  const member = customer?.member || {};

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
          <Row label="直案件DB閲覧権限"
            value={customer?.direct_db_access_granted_at
              ? <Badge variant="success" dot>付与済</Badge>
              : <Badge variant="neutral">未付与</Badge>} />
        </Grid>
      </Card>

      <Card padding="md" title="ソーシャルスタイル診断"
        description="運営内部のみ閲覧可。受講生にも一部表示されます。">
        {socialStyle && socialStyle.completed_at ? (
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
        ) : (
          <div style={{ color: color.textLight, fontSize: font.size.sm }}>診断未完了です</div>
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
