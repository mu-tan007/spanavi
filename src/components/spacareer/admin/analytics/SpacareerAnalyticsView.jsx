import React, { useMemo, useState } from 'react';
import { color, space, radius, font } from '../../../../constants/design';
import { Card } from '../../../ui';
import PageHeader from '../../../common/PageHeader';
import PeriodFilter from './PeriodFilter';
import KpiCard from '../_shared/KpiCard';
import TrendChart from './TrendChart';
import BarCompareChart from './BarCompareChart';
import HeatmapChart from './HeatmapChart';
import SectionTitle from './SectionTitle';
import AICostTab from './AICostTab';
import {
  getMockKpis,
  getMockTrend,
  getMockTrainerCompare,
  getMockVideoRanking,
  getMockSlackHeatmap,
} from './mockData';

// スパキャリ 分析レポート View
//
// 仕様書 §7.7：
// - 事業全体 + トレーナー比較（顧客個別は個人ページで完結）
// - デフォルトは全体俯瞰ダッシュボード
// - 期間設定：固定（直近7日/30日/90日）+ カスタム期間
// - 集計は日次バッチ（毎晩0時に集計）→ クライアントは集計済みデータを表示
// - エクスポートなし／アラートなし
// - AIコストタブを追加
//
// タブ：①全体俯瞰  ②AIコスト
//
// 注：日次バッチ用集計テーブルは未実装。完成までは mockData を使用。
export default function SpacareerAnalyticsView() {
  const [tab, setTab] = useState('overview'); // 'overview' | 'ai_cost'
  const [preset, setPreset] = useState('last30');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const kpis    = useMemo(() => getMockKpis(preset), [preset]);
  const trend   = useMemo(() => getMockTrend(preset), [preset]);
  const trainer = useMemo(() => getMockTrainerCompare(), []);
  const videos  = useMemo(() => getMockVideoRanking(), []);
  const slackHm = useMemo(() => getMockSlackHeatmap(), []);

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title="分析レポート"
        description="事業全体KPI / トレーナー比較 / AIコスト（日次バッチ集計）"
        style={{ marginBottom: space[4] }}
      />

      {/* タブ切替 */}
      <div style={{
        display: 'flex',
        gap: 4,
        marginBottom: space[4],
        borderBottom: `1px solid ${color.border}`,
      }}>
        {[
          { key: 'overview', label: '全体俯瞰' },
          { key: 'ai_cost',  label: 'AIコスト' },
        ].map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                padding: '10px 16px',
                fontSize: font.size.md,
                fontWeight: active ? font.weight.bold : font.weight.medium,
                color: active ? color.navy : color.textMid,
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${active ? color.navy : 'transparent'}`,
                cursor: 'pointer',
                fontFamily: font.family.sans,
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <PeriodFilter
        preset={preset} setPreset={setPreset}
        from={from} setFrom={setFrom}
        to={to} setTo={setTo}
      />

      {tab === 'overview' && (
        <OverviewDashboard
          kpis={kpis}
          trend={trend}
          trainer={trainer}
          videos={videos}
          slackHm={slackHm}
        />
      )}

      {tab === 'ai_cost' && (
        <AICostTab preset={preset} />
      )}
    </div>
  );
}

function OverviewDashboard({ kpis, trend, trainer, videos, slackHm }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      {/* ── 進捗 ── */}
      <SectionTitle label="進捗" hint="顧客の在籍・卒業・解約・進行度" />
      <GridKpi>
        <KpiCard label="進行中顧客数"   value={kpis.activeCustomers}     unit="名" tone="navy" />
        <KpiCard label="卒業完了顧客数" value={kpis.graduatedCustomers}  unit="名" tone="success" />
        <KpiCard label="中途解約数"     value={kpis.cancelledCustomers}  unit="名" tone="danger" />
        <KpiCard label="平均進捗率"     value={kpis.avgProgressPct}      unit="%"  tone="info" />
      </GridKpi>
      <Card padding="md" title="顧客数推移（日次）">
        <TrendChart
          data={trend}
          series={[
            { key: '進行中', label: '進行中', color: color.navy },
            { key: '新規',   label: '新規',   color: color.navyLight },
            { key: '卒業',   label: '卒業',   color: color.success },
          ]}
          height={220}
        />
      </Card>

      {/* ── 事前課題 ── */}
      <SectionTitle label="事前課題" hint="提出率／OK判定率／平均提出までの日数" />
      <GridKpi>
        <KpiCard label="提出率"             value={kpis.homeworkSubmissionRate} unit="%"   tone="navy" />
        <KpiCard label="OK判定率"           value={kpis.homeworkOkRate}         unit="%"   tone="success" />
        <KpiCard label="平均提出までの日数" value={kpis.homeworkAvgDaysToSubmit} unit="日" tone="info" />
      </GridKpi>

      {/* ── セッション ── */}
      <SectionTitle label="セッション" hint="完了率／満足度／無断欠席／振替" />
      <GridKpi>
        <KpiCard label="完了率"     value={kpis.sessionCompletionRate} unit="%"     tone="success" />
        <KpiCard label="平均満足度" value={kpis.avgSatisfaction}       unit="/ 5.0" tone="navy" />
        <KpiCard label="無断欠席率" value={kpis.noShowRate}            unit="%"     tone="danger" />
        <KpiCard label="振替回数"   value={kpis.reschedules}           unit="回"    tone="warn" />
      </GridKpi>

      {/* ── 返金保証 ── */}
      <SectionTitle label="返金保証" hint="第3回までの離脱・返金請求" />
      <GridKpi>
        <KpiCard label="第3回までの離脱者数" value={kpis.dropoutByThirdSession} unit="名" tone="warn" />
        <KpiCard label="返金請求数"          value={kpis.refundRequests}        unit="件" tone="danger" />
      </GridKpi>

      {/* ── トレーナー比較 ── */}
      <SectionTitle label="トレーナー比較" hint="担当顧客数 / 平均満足度 / 完了率" />
      <Card padding="md" title="担当顧客数（トレーナー別）">
        <BarCompareChart
          data={trainer}
          barKey="担当顧客数"
          barLabel="担当顧客数"
          barColor={color.navy}
          height={220}
        />
      </Card>
      <Card padding="md" title="平均満足度（トレーナー別）">
        <BarCompareChart
          data={trainer}
          barKey="平均満足度"
          barLabel="平均満足度（5点満点）"
          barColor={color.navyLight}
          height={200}
        />
      </Card>
      <Card padding="md" title="セッション完了率（トレーナー別）">
        <BarCompareChart
          data={trainer}
          barKey="完了率"
          barLabel="完了率（%）"
          barColor={color.success}
          height={200}
        />
      </Card>

      {/* ── AI講座 ── */}
      <SectionTitle label="AI講座" hint="視聴率 / 人気動画ランキング（お気に入り数）" />
      <GridKpi>
        <KpiCard label="動画視聴率" value={kpis.videoWatchRate} unit="%" tone="navy" />
      </GridKpi>
      <Card padding="md" title="人気動画ランキング（お気に入り数）">
        <BarCompareChart
          data={videos}
          barKey="お気に入り数"
          barLabel="お気に入り数"
          barColor={color.gold}
          height={220}
          horizontal
        />
      </Card>

      {/* ── クライアントリレーション ── */}
      <SectionTitle label="クライアントリレーション" hint="Slack日次連絡実施率（毎日1回送る運用）" />
      <GridKpi>
        <KpiCard label="Slack日次連絡実施率" value={kpis.slackDailyContactRate} unit="%" tone="success" />
      </GridKpi>
      <Card padding="md" title="Slack日次連絡実施率 ヒートマップ（週×曜日）">
        <HeatmapChart
          data={slackHm.data}
          rowLabels={slackHm.rows}
          colLabels={slackHm.cols}
          max={100}
          unit="%"
        />
      </Card>

      <div style={{
        marginTop: space[3],
        padding: space[3],
        background: color.cream,
        border: `1px dashed ${color.border}`,
        borderRadius: radius.md,
        fontSize: font.size.xs,
        color: color.textMid,
      }}>
        ※ 集計は日次バッチ（毎晩0時に実行）で行われ、本画面は集計済みデータを表示します。
        集計バッチおよび集計テーブルは AI機能群・外部連携エージェントが構築予定です。
      </div>
    </div>
  );
}

function GridKpi({ children }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: space[3],
    }}>
      {children}
    </div>
  );
}
