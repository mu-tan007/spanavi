import React, { useMemo } from 'react';
import { color, space, radius, font } from '../../../../constants/design';
import { Card, Badge, DataTable } from '../../../ui';
import KpiCard from './KpiCard';
import PieBreakdownChart from './PieBreakdownChart';
import BarCompareChart from './BarCompareChart';
import SectionTitle from './SectionTitle';
import { getMockAICost } from './mockData';

// AIコストタブ（分析レポート内 / 設定>AI利用状況からも再利用）
// - 月次利用量・費用
// - 機能別内訳（議事録／30項目生成／フレーズ抽出／強み診断／今日のひとこと）
// - 顧客別利用量
// - 生成失敗ログ・成功率
export default function AICostTab({ preset }) {
  const data = useMemo(() => getMockAICost(preset), [preset]);

  const failureColumns = [
    { key: 'at',       label: '発生日時', width: 160, align: 'left', cellStyle: { fontFamily: font.family.mono } },
    { key: 'feature',  label: '機能',     width: 160, align: 'left' },
    { key: 'customer', label: '顧客',     width: 140, align: 'left' },
    { key: 'error',    label: 'エラー',   width: 220, align: 'left',
      render: (row) => <Badge variant="danger" dot>{row.error}</Badge>,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionTitle label="月次利用量 / 費用" hint="今月のAI機能合計" />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: space[3],
      }}>
        <KpiCard label="月次利用回数" value={data.monthly.usageCount}   unit="回" tone="navy" />
        <KpiCard label="月次費用 (USD)" value={data.monthly.costUsd}    unit="USD" tone="info" />
        <KpiCard label="月次費用 (JPY)" value={data.monthly.costJpy}    unit="円"  tone="info" />
        <KpiCard label="成功率"        value={data.successRate}        unit="%"   tone="success" />
        <KpiCard label="総呼び出し数"   value={data.totalCalls}         unit="回" tone="navy" />
      </div>

      <SectionTitle label="機能別内訳" hint="費用（円）" />
      <Card padding="md">
        <PieBreakdownChart data={data.byFeature} height={260} />
      </Card>

      <SectionTitle label="顧客別利用量" hint="上位5名" />
      <Card padding="md">
        <BarCompareChart
          data={data.byCustomer}
          barKey="使用量"
          barLabel="使用量（回）"
          barColor={color.navy}
          height={220}
          horizontal
        />
      </Card>

      <SectionTitle label="生成失敗ログ" hint={`成功率 ${data.successRate}% / 失敗 ${data.failures.length} 件`} />
      <DataTable
        columns={failureColumns}
        rows={data.failures}
        rowKey="at"
        emptyMessage="失敗ログはありません"
        height={200}
      />

      <div style={{
        marginTop: space[3],
        padding: space[3],
        background: color.cream,
        border: `1px dashed ${color.border}`,
        borderRadius: radius.md,
        fontSize: font.size.xs,
        color: color.textMid,
      }}>
        ※ AI利用ログは spacareer_ai_usage_logs テーブルに記録され、日次バッチで集計されます。
        本画面は集計済みデータを表示する想定で、現状は仮データを表示しています。
      </div>
    </div>
  );
}
