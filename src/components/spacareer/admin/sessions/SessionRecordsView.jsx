import React, { useMemo, useState } from 'react';
import { color, space, font, radius } from '../../../../constants/design';
import { Card, Badge, DataTable, Select } from '../../../ui';
import PageHeader from '../../../common/PageHeader';
import SubTabs from '../_shared/SubTabs';
import { useCustomersList } from '../customers/lib/useCustomers';
import { sessionLabel } from '../../../../lib/spacareer/sessionOrder';

// ============================================================
// セッション記録一覧
//  - 完了済みセッション(status='completed')を、担当トレーナー別に集計。
//  - 「誰が」「何回」セッションを担当したかを一覧化。
//  - 月ごと / 日ごとの単位を切り替えて表示・ソートできる。
//  - トレーナー帰属は顧客の現担当(assigned_trainer_id)を用いる。
// ============================================================

const WD = ['日', '月', '火', '水', '木', '金', '土'];

function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]}) ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function periodKey(d, gran) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  if (gran === 'month') return `${y}-${m}`;
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function periodLabel(d, gran) {
  if (gran === 'month') return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`;
}

export default function SessionRecordsView() {
  const { rows: customers, loading } = useCustomersList();
  const [gran, setGran] = useState('month'); // month | day
  const [trainerFilter, setTrainerFilter] = useState('all');

  // 完了済みセッション（キックオフ第0回〜第8回すべて対象）。
  const completed = useMemo(() => {
    const list = [];
    customers.forEach((c) => {
      (c.sessions || []).forEach((s) => {
        if (s.status !== 'completed' || !s.completed_at) return;
        const d = new Date(s.completed_at);
        list.push({
          id: `${c.id}_${s.session_no}_${s.part || 1}`,
          trainer_id: c.assigned_trainer_id || null,
          trainer_name: c.trainer?.name || '未割当',
          customer_name: c.member?.name || '(無名)',
          session_no: s.session_no,
          part: s.part || 1,
          completed_at: s.completed_at,
          _t: d.getTime(),
          _d: d,
        });
      });
    });
    return list.sort((a, b) => b._t - a._t);
  }, [customers]);

  const trainerOptions = useMemo(() => {
    const byId = new Map();
    completed.forEach((r) => { if (r.trainer_id) byId.set(r.trainer_id, r.trainer_name); });
    const opts = [{ value: 'all', label: 'すべての担当' }];
    [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ja'))
      .forEach(([id, name]) => opts.push({ value: id, label: name }));
    opts.push({ value: 'none', label: '未割当' });
    return opts;
  }, [completed]);

  const filtered = useMemo(() => completed.filter((r) => {
    if (trainerFilter === 'all') return true;
    if (trainerFilter === 'none') return !r.trainer_id;
    return r.trainer_id === trainerFilter;
  }), [completed, trainerFilter]);

  // 期間 × トレーナー の担当回数サマリー。
  const summary = useMemo(() => {
    const map = new Map();
    filtered.forEach((r) => {
      const pk = periodKey(r._d, gran);
      const key = `${pk}__${r.trainer_id || 'none'}`;
      if (!map.has(key)) {
        map.set(key, {
          id: key, period_key: pk, period_label: periodLabel(r._d, gran),
          trainer_name: r.trainer_name, count: 0, _t: r._t,
        });
      }
      const row = map.get(key);
      row.count += 1;
      if (r._t > row._t) row._t = r._t;
    });
    return [...map.values()].sort((a, b) =>
      a.period_key === b.period_key
        ? b.count - a.count
        : (a.period_key < b.period_key ? 1 : -1));
  }, [filtered, gran]);

  // トレーナー別 累計担当回数。
  const totals = useMemo(() => {
    const map = new Map();
    filtered.forEach((r) => {
      const key = r.trainer_id || 'none';
      if (!map.has(key)) map.set(key, { id: key, trainer_name: r.trainer_name, count: 0 });
      map.get(key).count += 1;
    });
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [filtered]);

  return (
    <div style={{ padding: 0, animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title="セッション記録一覧"
        description="完了済みセッションを担当トレーナー別に集計。誰が何回担当したかを月別／日別で確認できます。"
        style={{ marginBottom: space[4] }}
      />

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap', marginBottom: space[4] }}>
        <SubTabs
          tabs={[{ key: 'month', label: '月別' }, { key: 'day', label: '日別' }]}
          activeKey={gran}
          onChange={setGran}
        />
        <div style={{ minWidth: 220 }}>
          <Select
            label="担当トレーナーで絞り込み"
            value={trainerFilter}
            onChange={(e) => setTrainerFilter(e.target.value)}
            options={trainerOptions}
          />
        </div>
      </div>

      {/* トレーナー別 累計 */}
      <div style={{ marginBottom: space[5] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textMid, marginBottom: space[2] }}>
          トレーナー別 累計担当回数（{filtered.length}件）
        </div>
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          {totals.length === 0 ? (
            <span style={{ color: color.textLight, fontSize: font.size.sm }}>完了済みセッションがありません。</span>
          ) : totals.map((t) => (
            <Card key={t.id} padding="sm" style={{ minWidth: 160 }}>
              <div style={{ fontSize: font.size.xs, color: color.textLight }}>{t.trainer_name}</div>
              <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.navy }}>
                {t.count}<span style={{ fontSize: font.size.sm, fontWeight: font.weight.regular, marginLeft: 2 }}>回</span>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* 期間×トレーナー サマリー */}
      <div style={{ marginBottom: space[5] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textMid, marginBottom: space[2] }}>
          {gran === 'month' ? '月別' : '日別'}担当回数
        </div>
        <DataTable
          columns={[
            { key: 'period_label', label: gran === 'month' ? '月' : '日', width: 200, align: 'left',
              cellStyle: { fontWeight: font.weight.semibold } },
            { key: 'trainer_name', label: 'トレーナー', width: 180, align: 'left' },
            { key: 'count', label: '担当回数', width: 120, align: 'right',
              render: (r) => `${r.count}回` },
          ]}
          rows={summary}
          rowKey="id"
          loading={loading}
          fillWidth
          emptyMessage="該当するセッション記録がありません"
        />
      </div>

      {/* 完了セッション明細 */}
      <div>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textMid, marginBottom: space[2] }}>
          完了セッション明細
        </div>
        <DataTable
          columns={[
            { key: 'completed_at', label: '完了日時', width: 210, align: 'left',
              render: (r) => fmtDateTime(r.completed_at), cellStyle: { fontFamily: font.family.mono } },
            { key: 'trainer_name', label: 'トレーナー', width: 160, align: 'left' },
            { key: 'customer_name', label: '顧客名', width: 180, align: 'left',
              cellStyle: { fontWeight: font.weight.semibold } },
            { key: 'session_no', label: '回', width: 110, align: 'center',
              render: (r) => sessionLabel(r) },
          ]}
          rows={filtered}
          rowKey="id"
          loading={loading}
          height="calc(100vh - 300px)"
          emptyMessage="完了済みセッションがありません"
        />
      </div>
    </div>
  );
}
