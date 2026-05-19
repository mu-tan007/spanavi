import React, { useMemo, useState } from 'react';
import { color, space, font, radius } from '../../../../constants/design';
import { Button, Badge, DataTable, Card } from '../../../ui';
import PageHeader from '../../../common/PageHeader';
import KpiCard from '../_shared/KpiCard';
import SubTabs from '../_shared/SubTabs';
import HomeworkMatrix from './HomeworkMatrix';
import HomeworkEditPanel from './HomeworkEditPanel';
import {
  MOCK_CUSTOMERS,
  MOCK_MATRIX,
  MOCK_UNSENT,
  MOCK_HOMEWORK_TEMPLATES,
  STATUS_INDEX,
  kpiSummary,
} from './mockData';

// 仕様書: tasks/spacareer-spec.md §7.3 事前課題管理
// 参考画像: イメージ④
// 中央4タブ + 上部KPI4枚 + 右カラム編集パネル
const MAIN_TABS = [
  { key: 'summary',    label: '課題サマリー' },
  { key: 'unsent',     label: '未通知の顧客' },
  { key: 'progress',   label: '全顧客の進捗' },
  { key: 'templates',  label: '課題テンプレート' },
];

export default function SpacareerHomeworkView() {
  const [tab, setTab] = useState('summary');
  const [selectedCell, setSelectedCell] = useState(null);
  const kpi = useMemo(() => kpiSummary(), []);
  const customerIndex = useMemo(() => {
    const m = {};
    MOCK_CUSTOMERS.forEach(c => { m[c.id] = c; });
    return m;
  }, []);

  const handleCellClick = (cell) => setSelectedCell(cell);
  const selectedCustomer = selectedCell ? customerIndex[selectedCell.customerId] : null;
  const selectedStatus = selectedCell ? MOCK_MATRIX[selectedCell.customerId]?.[selectedCell.sessionNumber] : null;

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title="事前課題管理"
        description="全顧客×第1〜第8回（全8サイクル）の事前課題を横断管理します。第0回は事前課題なし。"
        style={{ marginBottom: space[4] }}
      />

      {/* KPI 4枚 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: space[3],
        marginBottom: space[4],
      }}>
        <KpiCard label="未通知の顧客" value={kpi.unsentCount} unit="名" tone="danger"  hint="セッション完了後1日以内に通知が必要" />
        <KpiCard label="期限切れ間近" value={kpi.dueSoonCount} unit="件" tone="warn"   hint="締切3日前以降で未提出/部分提出" />
        <KpiCard label="全対象顧客"   value={kpi.customerCount} unit="名" tone="primary" hint="進行中の受講生" />
        <KpiCard label="通知済み"     value={kpi.notifiedCount} unit="件" tone="info"    hint="クライアントポータル公開済み" />
      </div>

      <SubTabs tabs={MAIN_TABS} activeKey={tab} onChange={setTab} />

      {/* 本体 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: selectedCell ? 'minmax(0, 1fr) 460px' : 'minmax(0, 1fr)',
        gap: space[4],
        alignItems: 'flex-start',
      }}>
        <div style={{ minWidth: 0 }}>
          {tab === 'summary'   && <SummaryView onCellClick={handleCellClick} selectedCell={selectedCell} />}
          {tab === 'unsent'    && <UnsentView onSelect={(row) => handleCellClick({ customerId: row.customerId, sessionNumber: row.sessionNumber })} />}
          {tab === 'progress'  && <HomeworkMatrix customers={MOCK_CUSTOMERS} matrix={MOCK_MATRIX} onCellClick={handleCellClick} selectedCell={selectedCell} />}
          {tab === 'templates' && <HomeworkTemplatesQuickList />}
        </div>
        {selectedCell && (
          <div style={{ position: 'sticky', top: space[3], height: 'calc(100vh - 180px)' }}>
            <HomeworkEditPanel
              selected={selectedCell}
              customer={selectedCustomer}
              status={selectedStatus}
              onClose={() => setSelectedCell(null)}
              onNotify={() => { /* TODO: 完了・通知の実装はステップ2完了後 */ }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 課題サマリータブ ────────────────────────────────────────
function SummaryView({ onCellClick, selectedCell }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <Card title="未通知の顧客（要対応）" description="セッション完了から1日以内に課題を設定して通知してください。" padding="md">
        {MOCK_UNSENT.length === 0 ? (
          <div style={{ padding: space[4], textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>
            現在、未通知の顧客はありません。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
            {MOCK_UNSENT.map(row => (
              <div key={`${row.customerId}_${row.sessionNumber}`} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: space[3],
                background: color.snow,
                border: `1px solid ${color.borderLight}`,
                borderLeft: `3px solid ${color.danger}`,
                borderRadius: radius.md,
                gap: space[3],
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.navy }}>
                    {row.name}
                    <span style={{ marginLeft: 8, fontWeight: font.weight.normal, color: color.textMid, fontSize: font.size.sm }}>
                      第{row.sessionNumber}回前 事前課題
                    </span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: font.size.xs, color: color.textMid }}>
                    セッション {row.sessionDate} ・ 完了から {row.elapsedDays} 日経過 ・ 設定期限 {row.dueByDate}
                  </div>
                </div>
                <Button variant="primary" size="sm" onClick={() => onCellClick({ customerId: row.customerId, sessionNumber: row.sessionNumber })}>
                  課題を設定
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="全顧客の進捗マトリクス" description="セルをクリックすると右ペインで個別編集できます。" padding="none">
        <HomeworkMatrix customers={MOCK_CUSTOMERS} matrix={MOCK_MATRIX} onCellClick={onCellClick} selectedCell={selectedCell} />
      </Card>
    </div>
  );
}

// ─── 未通知の顧客タブ ────────────────────────────────────────
function UnsentView({ onSelect }) {
  const columns = [
    { key: 'name',          label: '顧客名',         width: 180, align: 'left',
      render: (r) => <span><strong style={{ color: color.navy }}>{r.name}</strong> <span style={{ color: color.textLight, fontSize: font.size.xs }}>{r.customerId}</span></span> },
    { key: 'sessionNumber', label: 'セッション',     width: 110, align: 'center',
      render: (r) => `第${r.sessionNumber}回` },
    { key: 'sessionDate',   label: 'セッション実施日', width: 140, align: 'right',
      cellStyle: { fontFamily: font.family.mono } },
    { key: 'elapsedDays',   label: '経過日数',       width: 100, align: 'right',
      render: (r) => `${r.elapsedDays} 日`, cellStyle: { fontFamily: font.family.mono } },
    { key: 'dueByDate',     label: '設定期限',       width: 130, align: 'right',
      cellStyle: { fontFamily: font.family.mono, color: color.danger } },
    { key: 'status',        label: 'ステータス',     width: 110, align: 'center',
      render: () => <Badge variant="danger" dot>未通知</Badge> },
    { key: 'trainer',       label: '担当コーチ',     width: 130, align: 'left' },
    { key: 'action',        label: 'アクション',     width: 130, align: 'center',
      render: (r) => <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); onSelect(r); }}>課題を設定</Button> },
  ];
  return (
    <DataTable
      columns={columns}
      rows={MOCK_UNSENT}
      rowKey={(r) => `${r.customerId}_${r.sessionNumber}`}
      emptyMessage="未通知の顧客はいません"
      rowAccent={() => 'danger'}
      height="auto"
      onRowClick={(r) => onSelect(r)}
    />
  );
}

// ─── 課題テンプレートタブ（テンプレ管理への近道） ─────────────
function HomeworkTemplatesQuickList() {
  const columns = [
    { key: 'label',     label: 'テンプレート名', width: 280, align: 'left',
      render: (r) => (
        <span>
          <strong style={{ color: color.navy }}>{r.label}</strong>
          {r.adminOnly && <span style={{ marginLeft: 8 }}><Badge variant="primary" size="sm">運営のみ</Badge></span>}
        </span>
      ) },
    { key: 'itemCount', label: '項目数', width: 100, align: 'right',
      render: (r) => r.itemCount ? `${r.itemCount} 項目` : '—', cellStyle: { fontFamily: font.family.mono } },
    { key: 'updatedAt', label: '最終更新', width: 140, align: 'right',
      cellStyle: { fontFamily: font.family.mono } },
    { key: 'updatedBy', label: '更新者', width: 140, align: 'left' },
    { key: 'action',    label: '', width: 110, align: 'center',
      render: () => <Button size="sm" variant="outline">編集</Button> },
  ];
  return (
    <div>
      <div style={{
        padding: space[3],
        background: color.snow,
        border: `1px solid ${color.borderLight}`,
        borderRadius: radius.md,
        marginBottom: space[3],
        fontSize: font.size.sm,
        color: color.textMid,
      }}>
        ※ 11種のテンプレート全体管理は「テンプレート管理」メニューで行います。ここでは事前課題に関する 4 種への近道を表示しています。
      </div>
      <DataTable columns={columns} rows={MOCK_HOMEWORK_TEMPLATES} rowKey="key" height="auto" />
    </div>
  );
}
