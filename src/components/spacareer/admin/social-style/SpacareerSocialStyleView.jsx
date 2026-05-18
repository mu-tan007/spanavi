import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { color, space, font, radius, alpha } from '../../../../constants/design';
import { Button, Card, Badge, DataTable } from '../../../ui';
import { supabase } from '../../../../lib/supabase';
import { getOrgId } from '../../../../lib/orgContext';
import { SOCIAL_STYLE_DESCRIPTIONS } from './socialStyleQuestions';
import DiagnosisInviteModal from './DiagnosisInviteModal';

// ============================================================
// ソーシャルスタイル診断 管理画面（運営ダッシュボード）
// ----------------------------------------------------------------
// 仕様書: tasks/spacareer-spec.md §7.4 / §8.3
// 機能:
//   - 招待トークン発行（DiagnosisInviteModal）
//   - 招待一覧（メール / 進捗 / 完了日 / 判定タイプ）
//   - 4タイプ別件数サマリ（KPI）
//   - 完了診断の詳細プレビュー
// ============================================================

const TYPE_BADGE = {
  analytical: { variant: 'info',    label: '論理分析型' },
  driver:     { variant: 'danger',  label: '行動推進型' },
  expressive: { variant: 'warn',    label: '感情表現型' },
  amiable:    { variant: 'success', label: '協調共感型' },
};

function formatDateTime(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${m}/${day} ${hh}:${mm}`;
}

function progressLabel(row) {
  if (row.completed_at) return '完了';
  const cur = row.current_question_no || 0;
  if (cur === 0) return '未着手';
  return `進行中 ${cur}/30`;
}

export default function SpacareerSocialStyleView() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all'); // all | in_progress | completed | unassigned

  const loadResponses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const orgId = getOrgId();
      const { data, error: queryError } = await supabase
        .from('spacareer_social_style_responses')
        .select('id, invite_email, invite_token, current_question_no, result_type, result_scores, completed_at, created_at, customer_id')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });
      if (queryError) throw queryError;
      setRows(data || []);
    } catch (e) {
      console.error('[SocialStyleView] load error:', e);
      setError(e?.message || 'データ取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResponses();
  }, [loadResponses]);

  const kpis = useMemo(() => {
    const total = rows.length;
    const completed = rows.filter(r => r.completed_at).length;
    const inProgress = rows.filter(r => !r.completed_at && (r.current_question_no || 0) > 0).length;
    const unstarted = rows.filter(r => !r.completed_at && (r.current_question_no || 0) === 0).length;
    const byType = { analytical: 0, driver: 0, expressive: 0, amiable: 0 };
    for (const r of rows) {
      if (r.completed_at && r.result_type && byType[r.result_type] !== undefined) {
        byType[r.result_type]++;
      }
    }
    return { total, completed, inProgress, unstarted, byType };
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (filter === 'in_progress') return rows.filter(r => !r.completed_at && (r.current_question_no || 0) > 0);
    if (filter === 'completed') return rows.filter(r => !!r.completed_at);
    if (filter === 'unassigned') return rows.filter(r => r.completed_at && !r.customer_id);
    return rows;
  }, [rows, filter]);

  const columns = useMemo(() => ([
    {
      key: 'invite_email', label: '招待先メール', width: 260, align: 'left',
      render: (r) => (
        <span style={{ color: color.textDark, fontFamily: font.family.mono, fontSize: font.size.sm }}>
          {r.invite_email || '（不明）'}
        </span>
      ),
    },
    {
      key: 'created_at', label: '発行日時', width: 130, align: 'right',
      render: (r) => formatDateTime(r.created_at),
    },
    {
      key: 'progress', label: '進捗', width: 130, align: 'center',
      render: (r) => {
        const label = progressLabel(r);
        if (r.completed_at) return <Badge variant="success" dot>完了</Badge>;
        if ((r.current_question_no || 0) === 0) return <Badge variant="neutral">未着手</Badge>;
        return <Badge variant="warn">{label}</Badge>;
      },
    },
    {
      key: 'completed_at', label: '完了日時', width: 130, align: 'right',
      render: (r) => formatDateTime(r.completed_at),
    },
    {
      key: 'result_type', label: '判定タイプ', width: 140, align: 'center',
      render: (r) => {
        if (!r.result_type) return <span style={{ color: color.textLight, fontSize: font.size.sm }}>—</span>;
        const meta = TYPE_BADGE[r.result_type];
        if (!meta) return r.result_type;
        return <Badge variant={meta.variant} dot>{meta.label}</Badge>;
      },
    },
    {
      key: 'assigned', label: 'アサイン', width: 110, align: 'center',
      render: (r) => {
        if (!r.completed_at) return <span style={{ color: color.textLight, fontSize: font.size.sm }}>—</span>;
        if (r.customer_id) return <Badge variant="primary">紐付済</Badge>;
        return <Badge variant="danger" dot>要対応</Badge>;
      },
    },
  ]), []);

  return (
    <div style={{ paddingBottom: space[6] }}>
      {/* ===== Header ===== */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: space[4], flexWrap: 'wrap', gap: space[3],
      }}>
        <div>
          <h1 style={{
            margin: 0, fontSize: font.size['2xl'], fontWeight: font.weight.bold,
            color: color.navy, letterSpacing: font.letterSpacing.tight,
          }}>
            ソーシャルスタイル診断
          </h1>
          <div style={{ fontSize: font.size.sm, color: color.textMid, marginTop: space[1] }}>
            招待発行・回答状況・4タイプ別の判定結果を一元管理します
          </div>
        </div>
        <Button variant="primary" onClick={() => setInviteOpen(true)}>
          + 診断招待を発行
        </Button>
      </div>

      {/* ===== KPI Cards ===== */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: space[3],
        marginBottom: space[4],
      }}>
        <KpiCard label="招待発行" value={kpis.total} accent={color.navy} />
        <KpiCard label="未着手" value={kpis.unstarted} accent={color.textMid} />
        <KpiCard label="進行中" value={kpis.inProgress} accent={color.warn} />
        <KpiCard label="完了" value={kpis.completed} accent={color.success} />
      </div>

      {/* ===== 4タイプ別件数 ===== */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: space[3],
        marginBottom: space[5],
      }}>
        {Object.entries(SOCIAL_STYLE_DESCRIPTIONS).map(([typeKey, def]) => {
          const meta = TYPE_BADGE[typeKey] || { variant: 'neutral', label: def.label };
          const count = kpis.byType[typeKey] || 0;
          return (
            <Card key={typeKey} padding="md">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[2] }}>
                <Badge variant={meta.variant} dot>{def.label}</Badge>
                <span style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.navy }}>
                  {count}
                </span>
              </div>
              <div style={{ fontSize: font.size.xs, color: color.textMid, lineHeight: font.lineHeight.normal }}>
                {def.headline}
              </div>
            </Card>
          );
        })}
      </div>

      {/* ===== Filter tabs ===== */}
      <div style={{ display: 'flex', gap: space[2], marginBottom: space[3], flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: `すべて (${rows.length})` },
          { key: 'in_progress', label: `進行中 (${kpis.inProgress})` },
          { key: 'completed', label: `完了 (${kpis.completed})` },
          { key: 'unassigned', label: `要対応 (${rows.filter(r => r.completed_at && !r.customer_id).length})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              padding: `${space[1.5]}px ${space[3]}px`,
              fontSize: font.size.sm,
              fontWeight: filter === tab.key ? font.weight.semibold : font.weight.normal,
              color: filter === tab.key ? color.white : color.textDark,
              background: filter === tab.key ? color.navy : color.white,
              border: `1px solid ${filter === tab.key ? color.navy : color.border}`,
              borderRadius: radius.md,
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{
          padding: space[3], marginBottom: space[3],
          background: alpha(color.danger, 0.08),
          border: `1px solid ${alpha(color.danger, 0.3)}`,
          borderRadius: radius.md, color: color.danger, fontSize: font.size.sm,
        }}>
          {error}
        </div>
      )}

      {/* ===== Table ===== */}
      <DataTable
        columns={columns}
        rows={filteredRows}
        rowKey="id"
        loading={loading}
        emptyMessage="診断招待はまだありません。右上の「+ 診断招待を発行」から開始してください。"
        onRowClick={(row) => setSelected(row)}
        rowAccent={(row) => (row.completed_at && !row.customer_id) ? 'danger' : null}
        height="auto"
      />

      {/* ===== Detail Drawer ===== */}
      {selected && (
        <DetailDrawer
          row={selected}
          onClose={() => setSelected(null)}
        />
      )}

      {/* ===== Invite Modal ===== */}
      <DiagnosisInviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onCreated={() => { loadResponses(); }}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
function KpiCard({ label, value, accent }) {
  return (
    <Card padding="md">
      <div style={{ fontSize: font.size.xs, color: color.textMid, letterSpacing: font.letterSpacing.wide, marginBottom: space[1] }}>
        {label}
      </div>
      <div style={{ fontSize: font.size['2xl'], fontWeight: font.weight.bold, color: accent || color.navy, lineHeight: 1 }}>
        {value}
      </div>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
function DetailDrawer({ row, onClose }) {
  const type = row.result_type;
  const def = type ? SOCIAL_STYLE_DESCRIPTIONS[type] : null;
  const scores = row.result_scores || null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: alpha(color.navyDeep, 0.5),
        display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)', height: '100%',
          background: color.white,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{
          background: color.navy, color: color.white,
          padding: `${space[4]}px ${space[5]}px`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold }}>診断詳細</div>
            <div style={{ fontSize: font.size.xs, opacity: 0.8, marginTop: 4 }}>{row.invite_email || '招待先不明'}</div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', color: color.white, border: 'none',
            fontSize: font.size.xl, cursor: 'pointer', lineHeight: 1,
          }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: space[5], display: 'flex', flexDirection: 'column', gap: space[4] }}>
          <Card padding="md" title="基本情報">
            <Row label="発行日時">{formatDateTime(row.created_at)}</Row>
            <Row label="進捗">{progressLabel(row)}</Row>
            <Row label="完了日時">{formatDateTime(row.completed_at) || '—'}</Row>
            <Row label="アサイン">
              {row.completed_at
                ? (row.customer_id ? <Badge variant="primary">紐付済</Badge> : <Badge variant="danger" dot>未アサイン</Badge>)
                : '—'}
            </Row>
          </Card>

          {def && (
            <Card padding="md" title={`判定タイプ: ${def.label}`} description={def.headline}>
              <div style={{ fontSize: font.size.sm, color: color.textDark, lineHeight: font.lineHeight.relaxed, marginBottom: space[3] }}>
                {def.summary}
              </div>
              <SectionTitle>強み</SectionTitle>
              <ChipList items={def.strengths} variant="success" />
              <SectionTitle>注意点</SectionTitle>
              <ChipList items={def.cautions} variant="warn" />
              <SectionTitle>運営内部メモ：接し方のポイント</SectionTitle>
              <ChipList items={def.coach_tips} variant="info" />
            </Card>
          )}

          {scores && (
            <Card padding="md" title="スコアバランス">
              {Object.entries(SOCIAL_STYLE_DESCRIPTIONS).map(([k, d]) => (
                <ScoreBar key={k} label={d.label} value={scores[k] || 0} />
              ))}
            </Card>
          )}

          {!row.completed_at && (
            <Card padding="md" variant="subtle">
              <div style={{ fontSize: font.size.sm, color: color.textMid }}>
                この受講予定者はまだ診断を完了していません。診断完了をもって自動で受講生アカウントが発行されます。
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${space[1.5]}px 0`, borderBottom: `1px solid ${color.borderLight}` }}>
      <span style={{ fontSize: font.size.sm, color: color.textMid }}>{label}</span>
      <span style={{ fontSize: font.size.sm, color: color.textDark, fontWeight: font.weight.medium }}>{children}</span>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: font.size.xs, color: color.textMid,
      letterSpacing: font.letterSpacing.wider,
      fontWeight: font.weight.semibold,
      marginTop: space[3], marginBottom: space[2],
    }}>
      {children}
    </div>
  );
}

function ChipList({ items, variant }) {
  if (!items || !items.length) return <div style={{ color: color.textLight, fontSize: font.size.sm }}>—</div>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[1.5] }}>
      {items.map((it, i) => <Badge key={i} variant={variant}>{it}</Badge>)}
    </div>
  );
}

function ScoreBar({ label, value }) {
  // value は -16〜+16 程度の範囲を想定。0中心に幅を表示。
  const max = 16;
  const v = Math.max(-max, Math.min(max, value));
  const pct = ((v + max) / (max * 2)) * 100;
  const positive = v >= 0;
  return (
    <div style={{ marginBottom: space[2] }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.size.xs, color: color.textMid, marginBottom: 2 }}>
        <span>{label}</span>
        <span style={{ fontFamily: font.family.mono }}>{v > 0 ? '+' : ''}{v}</span>
      </div>
      <div style={{
        height: 6, background: color.gray100, borderRadius: radius.pill, overflow: 'hidden', position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0,
          width: `${pct}%`,
          background: positive ? color.navyLight : color.warn,
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  );
}
