import React, { useMemo, useState } from 'react';
import { color, space, radius, font, alpha } from '../../../../constants/design';
import { Input, Badge } from '../../../ui';
import { composeAttention, topAttentionCode, ATTENTION_LABEL } from './lib/needAttention';

// ソーシャルスタイル判定タイプ → 顧客カードのバッジ表記
const SS_BADGE = {
  analytical: { variant: 'info',    label: '論理分析型' },
  driver:     { variant: 'danger',  label: '行動推進型' },
  expressive: { variant: 'warn',    label: '感情表現型' },
  amiable:    { variant: 'success', label: '協調共感型' },
};

// ============================================================
// 顧客一覧（左カラム）
// 仕様書 §7.1 / §10.1
//   - タブ「すべて／要対応」
//   - 検索バー（顧客名・メールアドレスのみ対象）
//   - 顧客カード（アバター／氏名／ステータス／次回／進捗％）
// ============================================================
const STATUS_LABEL = {
  pre_kickoff: 'キックオフ前',
  in_progress: '受講中',
  graduated: '卒業',
  cancelled: '解約',
};
const STATUS_VARIANT = {
  pre_kickoff: 'neutral',
  in_progress: 'primary',
  graduated: 'success',
  cancelled: 'danger',
};

function formatNextSession(sessions = []) {
  const candidates = sessions.filter(
    (s) => (s.status === 'not_started' || s.status === 'next_up') && s.scheduled_at,
  );
  if (!candidates.length) return null;
  candidates.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  return candidates[0];
}
function dateLabel(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function initials(name = '') {
  if (!name) return '?';
  return name.slice(0, 1);
}

export default function CustomerListColumn({
  rows = [], selectedId, onSelect, loading,
}) {
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const now = new Date();

  const enriched = useMemo(() => rows.map((r) => ({
    ...r,
    attention: composeAttention(r, now),
    nextSession: formatNextSession(r.sessions || []),
  })), [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let list = enriched;
    if (tab === 'attention') {
      list = list.filter((r) => r.attention.length > 0);
      const order = { unassigned: 1, homework_unnotified: 2, homework_near_deadline: 3, session_overdue: 4 };
      list.sort((a, b) => {
        const pa = topAttentionCode(a.attention);
        const pb = topAttentionCode(b.attention);
        return (order[pa] || 99) - (order[pb] || 99);
      });
    }
    if (qq) {
      list = list.filter((r) => {
        const name = (r.member?.name || '').toLowerCase();
        const email = (r.member?.email || '').toLowerCase();
        return name.includes(qq) || email.includes(qq);
      });
    }
    return list;
  }, [enriched, tab, q]);

  const attentionCount = enriched.filter((r) => r.attention.length > 0).length;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: color.white,
      border: `1px solid ${color.border}`,
      borderRadius: radius.lg,
      height: '100%', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', borderBottom: `1px solid ${color.border}` }}>
        <TabBtn active={tab === 'all'} onClick={() => setTab('all')} label="すべて" count={enriched.length} />
        <TabBtn active={tab === 'attention'} onClick={() => setTab('attention')} label="要対応" count={attentionCount} accent />
      </div>

      <div style={{ padding: space[3], borderBottom: `1px solid ${color.borderLight}` }}>
        <Input size="sm" placeholder="顧客名・メールで検索" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: space[4], color: color.textLight, fontSize: font.size.sm }}>読み込み中…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: space[6], textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>
            {tab === 'attention' ? '要対応の顧客はありません' : '該当する顧客がありません'}
          </div>
        ) : filtered.map((r) => (
          <CustomerCard key={r.id} row={r} active={r.id === selectedId} onClick={() => onSelect && onSelect(r.id)} />
        ))}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, label, count, accent }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: `${space[3]}px ${space[2]}px`,
      background: active ? color.white : color.cream,
      color: active ? color.navy : color.textMid,
      border: 'none',
      borderBottom: active ? `2px solid ${color.navy}` : '2px solid transparent',
      cursor: 'pointer',
      fontSize: font.size.sm,
      fontWeight: font.weight.semibold,
      letterSpacing: font.letterSpacing.wide,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    }}>
      {label}
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 22, height: 18, padding: '0 6px',
        background: accent && count > 0 ? color.danger : alpha(color.navy, 0.08),
        color: accent && count > 0 ? color.white : color.textMid,
        borderRadius: radius.pill,
        fontSize: font.size.xs,
        fontFamily: font.family.mono,
        fontWeight: font.weight.bold,
      }}>{count}</span>
    </button>
  );
}

function CustomerCard({ row, active, onClick }) {
  const name = row.member?.name || '(名前未設定)';
  const trainerName = row.trainer?.name || null;
  const top = topAttentionCode(row.attention);
  const next = row.nextSession;
  const pct = Number(row.progress_percent || 0);
  return (
    <div onClick={onClick} style={{
      display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: space[2],
      padding: `${space[3]}px ${space[3]}px`,
      borderBottom: `1px solid ${color.borderLight}`,
      borderLeft: active ? `3px solid ${color.navy}` : '3px solid transparent',
      background: active ? alpha(color.navyLight, 0.06) : color.white,
      cursor: 'pointer',
      transition: 'background 0.15s ease',
    }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = alpha(color.navyLight, 0.04); }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = color.white; }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: radius.pill,
        background: row.profile_image_url ? `url(${row.profile_image_url}) center/cover` : color.navy,
        color: color.white,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: font.size.md, fontWeight: font.weight.bold, flexShrink: 0,
      }}>
        {!row.profile_image_url && initials(name)}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: font.size.md, fontWeight: font.weight.semibold,
          color: color.textDark,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{name}</div>
        <div style={{
          fontSize: font.size.xs, color: color.textMid, marginTop: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>担当: {trainerName || '未割当'}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
          <Badge variant={STATUS_VARIANT[row.status] || 'neutral'} size="sm" dot>
            {STATUS_LABEL[row.status] || row.status}
          </Badge>
          {row.social_style_type && SS_BADGE[row.social_style_type] && (
            <Badge variant={SS_BADGE[row.social_style_type].variant} size="sm">
              {SS_BADGE[row.social_style_type].label}
            </Badge>
          )}
          {!row.social_style_type && (
            <Badge variant="neutral" size="sm">診断未完了</Badge>
          )}
          {top && <Badge variant="danger" size="sm">{ATTENTION_LABEL[top]}</Badge>}
        </div>
        <div style={{
          fontSize: font.size.xs, color: color.textLight, marginTop: 3,
          display: 'flex', gap: space[2],
        }}>
          <span>次回 {next ? dateLabel(next.scheduled_at) : '—'}</span>
          <span style={{ color: color.border }}>|</span>
          <span style={{ fontFamily: font.family.mono }}>
            {row.current_session_no || 0}/9・{pct.toFixed(0)}%
          </span>
        </div>
      </div>
      <div style={{
        width: 4, height: '100%', borderRadius: radius.sm,
        background: alpha(color.navyLight, 0.12),
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: `${Math.min(100, pct)}%`,
          background: row.status === 'graduated' ? color.success : color.navyLight,
        }}/>
      </div>
    </div>
  );
}
