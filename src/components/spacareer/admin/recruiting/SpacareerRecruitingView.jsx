import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { color, space, radius, font, shadow, alpha, z } from '../../../../constants/design';
import PageHeader from '../../../common/PageHeader';
import { Badge, DataTable, Select } from '../../../ui';
import RecruitDetail from './RecruitDetail';
import { useAuth } from '../../../../hooks/useAuth';
import {
  useRecruitApplicants, updateApplicant,
  JOB_TYPE_LABELS, JOB_TYPE_BADGE,
  PIPELINE_STATUS_OPTIONS, INTERVIEWER_OPTIONS,
} from './useRecruiting';

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' })
    + ' ' + d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

// ISO → datetime-local input 値 (ローカル時刻 YYYY-MM-DDTHH:mm)
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const JOB_FILTERS = [
  { value: 'all', label: 'すべての職種' },
  { value: 'sales', label: '営業' },
  { value: 'trainer', label: 'トレーナー' },
];
const STATUS_FILTERS = [
  { value: 'all', label: 'すべてのステータス' },
  ...PIPELINE_STATUS_OPTIONS,
];

// token化したインライン入力スタイル
const cellInput = {
  width: '100%', boxSizing: 'border-box',
  padding: `${space[1]}px ${space[2]}px`,
  border: `1px solid ${color.border}`, borderRadius: radius.md,
  fontSize: font.size.xs, color: color.textDark, background: color.white,
  fontFamily: font.family.base,
};
// コンパクトな日時入力（横幅を抑える）
const cellDate = { ...cellInput, padding: '2px 4px', fontSize: font.size.xs - 2, letterSpacing: '-0.2px' };
// セル内セレクトの極小化
const cellSelectStyle = { fontSize: font.size.xs, minHeight: 26, paddingTop: 3, paddingBottom: 3 };

function InlineDateTime({ value, onSave }) {
  const [v, setV] = useState(toLocalInput(value));
  useEffect(() => { setV(toLocalInput(value)); }, [value]);
  return (
    <input
      type="datetime-local"
      value={v}
      onChange={(e) => {
        setV(e.target.value);
        onSave(e.target.value ? new Date(e.target.value).toISOString() : null);
      }}
      style={cellDate}
    />
  );
}

function InlineMemo({ value, onSave }) {
  const [v, setV] = useState(value || '');
  useEffect(() => { setV(value || ''); }, [value]);
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if ((value || '') !== v) onSave(v || null); }}
      placeholder="メモを入力"
      style={cellInput}
    />
  );
}

// ============================================================
// スパキャリ 採用管理（複業クラウド）
//   全幅の候補者一覧（面接日/ステータス/メモはインライン編集）。
//   氏名など編集列以外をクリックで右からプロフィールがドロワー表示。
// ============================================================
export default function SpacareerRecruitingView() {
  const { orgId } = useAuth();
  const { rows, loading, refresh, patchRow } = useRecruitApplicants();
  const [selectedId, setSelectedId] = useState(null);
  const [jobFilter, setJobFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = useMemo(() => rows.filter(r =>
    (jobFilter === 'all' || r.job_type === jobFilter) &&
    (statusFilter === 'all' || (r.pipeline_status || 'scheduling') === statusFilter)
  ), [rows, jobFilter, statusFilter]);

  const selected = useMemo(
    () => rows.find(r => r.id === selectedId) || null,
    [rows, selectedId]
  );

  // インライン保存（楽観更新 → DB）
  const save = useCallback(async (id, patch) => {
    patchRow(id, patch);
    try {
      await updateApplicant(id, patch);
    } catch (e) {
      alert('保存に失敗しました: ' + e.message);
      refresh();
    }
  }, [patchRow, refresh]);

  // 編集セルはクリックでドロワーを開かない
  const stop = (e) => e.stopPropagation();

  const columns = [
    {
      key: 'full_name', label: '氏名', width: 170, align: 'left',
      render: (r) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: font.weight.semibold, color: color.textDark }}>{r.full_name}</div>
          {r.furigana && (
            <div style={{ fontSize: font.size.xs, color: color.textLight }}>{r.furigana}</div>
          )}
        </div>
      ),
    },
    {
      key: 'job_type', label: '職種', width: 90, align: 'center',
      render: (r) => JOB_TYPE_LABELS[r.job_type]
        ? <Badge variant={JOB_TYPE_BADGE[r.job_type]} dot>{JOB_TYPE_LABELS[r.job_type]}</Badge>
        : <span style={{ color: color.textLight }}>—</span>,
    },
    {
      key: 'applied_at', label: '応募日', width: 110, align: 'right',
      render: (r) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{fmtDate(r.applied_at)}</span>,
    },
    {
      key: 'interview_at', label: '面接日', width: 132, align: 'right',
      render: (r) => (
        <div onClick={stop} style={{ cursor: 'default' }}>
          <InlineDateTime value={r.interview_at} onSave={(iso) => save(r.id, { interview_at: iso })} />
        </div>
      ),
    },
    {
      key: 'interviewer', label: '面接担当者', width: 110, align: 'center',
      render: (r) => (
        <div onClick={stop} style={{ cursor: 'default' }}>
          <Select
            size="sm"
            style={cellSelectStyle}
            options={INTERVIEWER_OPTIONS}
            value={r.interviewer || ''}
            onChange={(e) => save(r.id, { interviewer: e.target.value || null })}
          />
        </div>
      ),
    },
    {
      key: 'pipeline_status', label: 'ステータス', width: 120, align: 'center',
      render: (r) => (
        <div onClick={stop} style={{ cursor: 'default' }}>
          <Select
            size="sm"
            style={cellSelectStyle}
            options={PIPELINE_STATUS_OPTIONS}
            value={r.pipeline_status || 'scheduling'}
            onChange={(e) => save(r.id, { pipeline_status: e.target.value })}
          />
        </div>
      ),
    },
    {
      key: 'staff_memo', label: 'メモ', width: 220, align: 'left',
      render: (r) => (
        <div onClick={stop} style={{ cursor: 'default' }}>
          <InlineMemo value={r.staff_memo} onSave={(t) => save(r.id, { staff_memo: t })} />
        </div>
      ),
    },
  ];

  return (
    <div style={{ animation: 'fadeIn 0.3s ease', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <style>{`
        @keyframes recruitDrawerIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      <PageHeader
        title="採用管理"
        description="複業クラウドからの応募（営業／トレーナー）の候補者管理・面接日程"
        compact
        style={{ marginBottom: space[3] }}
      />

      {/* フィルタ（小型） */}
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center', marginBottom: space[2] }}>
        <div style={{ width: 130 }}>
          <Select size="sm" style={cellSelectStyle} options={JOB_FILTERS} value={jobFilter} onChange={e => setJobFilter(e.target.value)} />
        </div>
        <div style={{ width: 150 }}>
          <Select size="sm" style={cellSelectStyle} options={STATUS_FILTERS} value={statusFilter} onChange={e => setStatusFilter(e.target.value)} />
        </div>
        <div style={{ fontSize: font.size.xs, color: color.textMid, marginLeft: space[1] }}>
          {loading ? '読み込み中…' : `${filtered.length} 名`}
        </div>
      </div>

      {/* 全幅の一覧 */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <DataTable
          fillWidth
          columns={columns}
          rows={filtered}
          rowKey="id"
          loading={loading}
          emptyMessage="該当する候補者がいません"
          onRowClick={(row) => setSelectedId(row.id)}
          rowAccent={(row) => row.id === selectedId ? 'primary' : null}
          height="calc(100vh - 200px)"
        />
      </div>

      {/* 右からのドロワー（プロフィール表示） */}
      {selected && (
        <>
          <div
            onClick={() => setSelectedId(null)}
            style={{
              position: 'fixed', inset: 0, background: alpha(color.navyDeep, 0.45),
              zIndex: z.modal, animation: 'fadeIn 0.18s ease',
            }}
          />
          <div style={{
            position: 'fixed', top: 0, right: 0, height: '100vh',
            width: 'min(560px, 94vw)', background: color.white,
            boxShadow: shadow.xl, zIndex: z.modal + 1,
            animation: 'recruitDrawerIn 0.22s ease',
          }}>
            <RecruitDetail
              applicant={selected}
              orgId={orgId}
              onChanged={refresh}
              onClose={() => setSelectedId(null)}
            />
          </div>
        </>
      )}
    </div>
  );
}
