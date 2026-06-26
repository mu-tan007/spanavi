import React, { useState, useMemo } from 'react';
import { color, space, radius, font } from '../../../../constants/design';
import PageHeader from '../../../common/PageHeader';
import { Badge, DataTable, Select } from '../../../ui';
import RecruitDetail from './RecruitDetail';
import { useAuth } from '../../../../hooks/useAuth';
import {
  useRecruitApplicants,
  JOB_TYPE_LABELS, JOB_TYPE_BADGE, STATUS_LABELS, STATUS_BADGE,
} from './useRecruiting';

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' })
    + ' ' + d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

const JOB_FILTERS = [
  { value: 'all', label: 'すべての職種' },
  { value: 'sales', label: '営業マン' },
  { value: 'trainer', label: 'トレーナー' },
  { value: 'unknown', label: '未判定' },
];
const STATUS_FILTERS = [
  { value: 'all', label: 'すべての選考状況' },
  { value: 'new', label: '新規' },
  { value: 'screening', label: '書類選考' },
  { value: 'interview', label: '面接' },
  { value: 'passed', label: '合格' },
  { value: 'rejected', label: '見送り' },
];

// ============================================================
// スパキャリ 採用管理（複業クラウド）
//   左：候補者一覧（職種/選考状況フィルタ）  右：候補者詳細＋面接日程
// ============================================================
export default function SpacareerRecruitingView() {
  const { orgId } = useAuth();
  const { rows, loading, refresh } = useRecruitApplicants();
  const [selectedId, setSelectedId] = useState(null);
  const [jobFilter, setJobFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = useMemo(() => rows.filter(r =>
    (jobFilter === 'all' || r.job_type === jobFilter) &&
    (statusFilter === 'all' || r.status === statusFilter)
  ), [rows, jobFilter, statusFilter]);

  const selected = useMemo(
    () => rows.find(r => r.id === selectedId) || null,
    [rows, selectedId]
  );

  const columns = [
    {
      key: 'full_name', label: '氏名', width: 150, align: 'left',
      render: (r) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: font.weight.semibold, color: color.textDark, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {r.full_name}
          </div>
          {r.furigana && (
            <div style={{ fontSize: font.size.xs, color: color.textLight, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {r.furigana}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'job_type', label: '職種', width: 90, align: 'center',
      render: (r) => <Badge variant={JOB_TYPE_BADGE[r.job_type] || 'neutral'} dot>{JOB_TYPE_LABELS[r.job_type] || r.job_type}</Badge>,
    },
    {
      key: 'status', label: '選考', width: 90, align: 'center',
      render: (r) => <Badge variant={STATUS_BADGE[r.status] || 'neutral'}>{STATUS_LABELS[r.status] || r.status}</Badge>,
    },
    {
      key: 'applied_at', label: '応募', width: 100, align: 'right',
      render: (r) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{fmtDate(r.applied_at)}</span>,
    },
  ];

  return (
    <div style={{ animation: 'fadeIn 0.3s ease', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="採用管理"
        description="複業クラウドからの応募（営業マン／トレーナー）の候補者管理・面接日程"
        compact
        style={{ marginBottom: space[3] }}
      />

      <div style={{
        display: 'grid', gridTemplateColumns: '420px 1fr', gap: space[3],
        flex: 1, minHeight: 0,
      }}>
        {/* 左カラム: フィルタ + 一覧 */}
        <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: space[2] }}>
          <div style={{ display: 'flex', gap: space[2] }}>
            <div style={{ flex: 1 }}>
              <Select options={JOB_FILTERS} value={jobFilter} onChange={e => setJobFilter(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <Select options={STATUS_FILTERS} value={statusFilter} onChange={e => setStatusFilter(e.target.value)} />
            </div>
          </div>
          <div style={{
            fontSize: font.size.xs, color: color.textMid, padding: `0 ${space[1]}px`,
          }}>
            {loading ? '読み込み中…' : `${filtered.length} 名`}
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <DataTable
              columns={columns}
              rows={filtered}
              rowKey="id"
              loading={loading}
              emptyMessage="該当する候補者がいません"
              onRowClick={(row) => setSelectedId(row.id)}
              rowAccent={(row) => row.id === selectedId ? 'primary' : null}
              height="calc(100vh - 220px)"
            />
          </div>
        </div>

        {/* 右カラム: 詳細 */}
        <div style={{ minHeight: 0 }}>
          <RecruitDetail applicant={selected} orgId={orgId} onChanged={refresh} />
        </div>
      </div>
    </div>
  );
}
