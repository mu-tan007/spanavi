import React, { useMemo, useState } from 'react';
import { color, space, font, radius, alpha } from '../../../../constants/design';
import { Card, Badge, DataTable } from '../../../ui';
import PageHeader from '../../../common/PageHeader';
import SubTabs from '../_shared/SubTabs';
import { useCustomersList } from '../customers/lib/useCustomers';
import { sessionLabel } from '../../../../lib/spacareer/sessionOrder';

// ============================================================
// トレーナー別「次回セッション予定」一覧（今週 / 来週）
//  - 表示する日時は、トレーナーが手動で確定・編集した「次回日程」を参照する。
//    次回日程は next_up セッションの scheduled_at に保存される（TabSessionManageで手入力）。
//    システムが自動で仮決定する日時ではなく、この確定版のみを使う。
//  - トレーナー別にまとめ、今週/来週で切り替え表示する。
// ============================================================

const WD = ['日', '月', '火', '水', '木', '金', '土'];

function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]}) ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 月曜始まりの週レンジ（ローカル=JST）。offsetWeeks=0で今週、1で来週。
function weekRange(offsetWeeks) {
  const now = new Date();
  const day = now.getDay(); // 0=日
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(now.getDate() + diffToMonday + offsetWeeks * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 7); // 翌週月曜0:00（未満）
  return { start, end };
}

export default function TrainerScheduleView() {
  const { rows: customers, loading } = useCustomersList();
  const [weekTab, setWeekTab] = useState('this'); // this | next

  const range = useMemo(() => weekRange(weekTab === 'next' ? 1 : 0), [weekTab]);

  // 次回実施(next_up)のセッションを、確定日時(scheduled_at)が対象週内のものだけ抽出。
  const rows = useMemo(() => {
    const list = [];
    customers.forEach((c) => {
      (c.sessions || []).forEach((s) => {
        if (s.status !== 'next_up') return;
        if (!s.scheduled_at) return;
        const t = new Date(s.scheduled_at);
        if (t < range.start || t >= range.end) return;
        list.push({
          id: `${c.id}_${s.session_no}_${s.part || 1}`,
          trainer_id: c.assigned_trainer_id || null,
          trainer_name: c.trainer?.name || '未割当',
          customer_name: c.member?.name || '(無名)',
          session_no: s.session_no,
          part: s.part || 1,
          scheduled_at: s.scheduled_at,
          _t: t.getTime(),
        });
      });
    });
    return list.sort((a, b) => a._t - b._t);
  }, [customers, range]);

  // トレーナー別にグルーピング（担当あり→氏名順、未割当は末尾）。
  const groups = useMemo(() => {
    const byTrainer = new Map();
    rows.forEach((r) => {
      const key = r.trainer_id || '__none__';
      if (!byTrainer.has(key)) byTrainer.set(key, { trainer_name: r.trainer_name, items: [] });
      byTrainer.get(key).items.push(r);
    });
    return [...byTrainer.entries()]
      .sort((a, b) => {
        if (a[0] === '__none__') return 1;
        if (b[0] === '__none__') return -1;
        return a[1].trainer_name.localeCompare(b[1].trainer_name, 'ja');
      })
      .map(([key, v]) => ({ key, ...v }));
  }, [rows]);

  const rangeLabel = `${range.start.getMonth() + 1}/${range.start.getDate()}〜${range.end.getMonth() + 1}/${new Date(range.end.getTime() - 1).getDate()}`;

  return (
    <div style={{ padding: 0, animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title="トレーナー別 次回セッション予定"
        description="トレーナーが確定・編集した次回日程を、担当トレーナー別に今週／来週でまとめて表示します。"
        style={{ marginBottom: space[4] }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], marginBottom: space[4], flexWrap: 'wrap' }}>
        <SubTabs
          tabs={[{ key: 'this', label: '今週' }, { key: 'next', label: '来週' }]}
          activeKey={weekTab}
          onChange={setWeekTab}
        />
        <span style={{ fontSize: font.size.sm, color: color.textMid }}>
          対象期間：{rangeLabel}（{rows.length}件）
        </span>
      </div>

      {loading ? (
        <div style={{ padding: space[6], color: color.textLight, fontSize: font.size.sm }}>読み込み中…</div>
      ) : groups.length === 0 ? (
        <Card padding="lg">
          <div style={{ textAlign: 'center', color: color.textLight, fontSize: font.size.sm, padding: space[4] }}>
            {weekTab === 'next' ? '来週' : '今週'}に確定済みの次回セッションはありません。
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: space[4] }}>
          {groups.map((g) => (
            <Card key={g.key} padding="md">
              <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[3] }}>
                <span style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy }}>
                  {g.trainer_name}
                </span>
                <Badge variant={g.key === '__none__' ? 'warn' : 'primary'} dot>{g.items.length}件</Badge>
              </div>
              <DataTable
                columns={[
                  { key: 'scheduled_at', label: '確定日時', width: 200, align: 'left',
                    render: (r) => fmtDateTime(r.scheduled_at), cellStyle: { fontFamily: font.family.mono } },
                  { key: 'customer_name', label: '顧客名', width: 200, align: 'left',
                    cellStyle: { fontWeight: font.weight.semibold } },
                  { key: 'session_no', label: '回', width: 110, align: 'center',
                    render: (r) => sessionLabel(r) },
                ]}
                rows={g.items}
                rowKey="id"
                fillWidth
                emptyMessage="予定なし"
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
