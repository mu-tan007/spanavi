import { C } from '../../constants/colors';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ──────────────────────────────────────────────
// 定数
// ──────────────────────────────────────────────
const PAGE_W = 1123;
const PAGE_H = 794;
const HEADER_H = 56;
const PAD = 24;

const pageStyle = {
  width: PAGE_W,
  height: PAGE_H,
  background: '#ffffff',
  fontFamily: "'Noto Sans JP', 'Hiragino Sans', 'Meiryo', sans-serif",
  overflow: 'hidden',
  boxSizing: 'border-box',
  position: 'relative',
};

// ──────────────────────────────────────────────
// 共通パーツ
// ──────────────────────────────────────────────
function PageHeader({ clientName, listName, dateRange, pageTitle, pageNum }) {
  return (
    <div style={{
      height: HEADER_H,
      background: `linear-gradient(135deg, ${C.navyDeep}, ${C.navy})`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 4, height: 30, background: C.gold, borderRadius: 2 }} />
        <div>
          <div style={{ color: C.goldLight, fontSize: 10, fontWeight: 600, letterSpacing: 0.5 }}>
            {clientName}
          </div>
          <div style={{ color: '#ffffff', fontSize: 13, fontWeight: 700, marginTop: 1 }}>
            {listName}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ color: C.goldLight, fontSize: 11 }}>{dateRange}</div>
        <div style={{
          background: C.gold, color: C.navy,
          padding: '3px 14px', borderRadius: 4,
          fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
        }}>
          {pageTitle}
        </div>
        <div style={{ color: C.goldDim, fontSize: 10 }}>{pageNum} / 4</div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, borderColor }) {
  return (
    <div style={{
      flex: 1, background: '#ffffff',
      border: `1px solid ${C.border}`,
      borderTop: `4px solid ${borderColor}`,
      borderRadius: 8, padding: '16px 20px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.07)',
    }}>
      <div style={{ fontSize: 11, color: C.textMid, marginBottom: 10, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 36, fontWeight: 700, color: borderColor, letterSpacing: -1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: C.textLight, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 700, color: C.navy,
      borderLeft: `3px solid ${C.gold}`, paddingLeft: 10,
      marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

function ComboChart({ data, xKey, barKey, lineKey, barLabel, lineLabel, xFormatter }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 8, right: 60, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 10, fill: C.textMid }}
          tickFormatter={xFormatter}
          interval="preserveStartEnd"
        />
        <YAxis yAxisId="left" orientation="left" tick={{ fontSize: 10, fill: C.textMid }} />
        <YAxis
          yAxisId="right" orientation="right"
          tick={{ fontSize: 10, fill: C.textMid }}
          domain={[0, 100]} unit="%"
        />
        <Tooltip
          formatter={(value, name) =>
            name === lineLabel ? `${value}%` : `${value}件`
          }
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar yAxisId="left" dataKey={barKey} fill={C.navy} name={barLabel} radius={[2, 2, 0, 0]} />
        <Line
          yAxisId="right" type="monotone" dataKey={lineKey}
          stroke={C.gold} strokeWidth={2} dot={false} name={lineLabel}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function StatsTable({ rows, columns, labels }) {
  const cols = labels.length;
  const gridCols = `2fr repeat(${cols - 1}, 1fr)`;
  return (
    <div style={{ marginTop: 10, overflow: 'hidden' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: gridCols,
        background: C.navyDeep, color: C.goldLight,
        fontSize: 10, fontWeight: 600, padding: '6px 12px',
      }}>
        {labels.map((l, i) => (
          <span key={i} style={{ textAlign: i > 0 ? 'center' : 'left' }}>{l}</span>
        ))}
      </div>
      {rows.map((row, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: gridCols,
          padding: '5px 12px', fontSize: 10,
          background: i % 2 === 0 ? '#ffffff' : C.offWhite,
          borderBottom: `1px solid ${C.borderLight}`,
        }}>
          {columns.map((col, j) => (
            <span key={j} style={{
              textAlign: j > 0 ? 'center' : 'left',
              fontFamily: j > 0 ? "'JetBrains Mono', monospace" : 'inherit',
            }}>
              {row[col]}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────
// メインコンポーネント
// ──────────────────────────────────────────────
export default function ClientReportPDF({
  clientName,
  listName,
  dateRange,
  totalCalls,
  ceoConnectRate,
  appoRate,
  appoList,
  dailyStats,
  weeklyStats,
  hourlyStats,
  bestHour,
}) {
  const headerProps = { clientName, listName, dateRange };

  // テーブル表示用に整形
  const fmtDaily = dailyStats.map(d => ({
    ...d,
    connRate: `${d.connRate}%`,
    appoRate: `${d.appoRate}%`,
  }));
  const fmtWeekly = weeklyStats.map(w => ({
    ...w,
    connRate: `${w.connRate}%`,
    appoRate: `${w.appoRate}%`,
  }));

  // 日次は多すぎる場合に末尾14件に絞る（ページ内に収める）
  const dailyTableRows = fmtDaily.slice(-14);
  const weeklyTableRows = fmtWeekly;

  const statsColumns = ['date', 'calls', 'connected', 'connRate', 'appo', 'appoRate'];
  const statsColumnsDailyWithWeek = ['week', 'calls', 'connected', 'connRate', 'appo', 'appoRate'];
  const statsLabels = ['日付', '架電数', '社長接続数', '接続率', 'アポ数', 'アポ率'];
  const statsLabelsWeekly = ['週', '架電数', '社長接続数', '接続率', 'アポ数', 'アポ率'];

  const generatedDate = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div style={{ position: 'fixed', left: -9999, top: 0, zIndex: -1 }}>

      {/* ══════════════════════════════════════
          PAGE 1: サマリー
      ══════════════════════════════════════ */}
      <div id="pdf-page-1" style={pageStyle}>
        <PageHeader {...headerProps} pageTitle="サマリー" pageNum={1} />
        <div style={{ padding: PAD, overflow: 'hidden', height: PAGE_H - HEADER_H - PAD * 2 }}>

          {/* KPI カード */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
            <KpiCard
              label="総架電数"
              value={`${totalCalls.toLocaleString()}件`}
              sub="架電レコード総数"
              borderColor={C.navy}
            />
            <KpiCard
              label="社長接続率"
              value={`${ceoConnectRate.toFixed(1)}%`}
              sub="社長不在・再コール・お断り・アポ獲得の合計"
              borderColor={C.navyLight}
            />
            <KpiCard
              label="アポ取得率"
              value={`${appoRate.toFixed(1)}%`}
              sub="架電数に対するアポ獲得数の割合"
              borderColor={C.green}
            />
          </div>

          {/* アポ一覧 */}
          <SectionTitle>アポ取得企業一覧</SectionTitle>
          {appoList.length === 0 ? (
            <div style={{
              padding: '16px 12px', color: C.textLight, fontSize: 11,
              background: C.offWhite, borderRadius: 6,
              border: `1px solid ${C.borderLight}`,
            }}>
              アポ取得なし
            </div>
          ) : (
            <div style={{ overflow: 'hidden' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '3fr 1fr 1fr',
                background: C.navyDeep, color: C.goldLight,
                fontSize: 10, fontWeight: 600, padding: '6px 12px',
              }}>
                <span>企業名</span>
                <span style={{ textAlign: 'center' }}>アポ取得日</span>
                <span style={{ textAlign: 'center' }}>ステータス</span>
              </div>
              {appoList.map((a, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '3fr 1fr 1fr',
                  padding: '7px 12px', fontSize: 11,
                  background: i % 2 === 0 ? '#ffffff' : C.offWhite,
                  borderBottom: `1px solid ${C.borderLight}`,
                  alignItems: 'center',
                }}>
                  <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.company}
                  </span>
                  <span style={{ textAlign: 'center', color: C.textMid, fontFamily: "'JetBrains Mono', monospace" }}>
                    {a.date}
                  </span>
                  <span style={{ textAlign: 'center' }}>
                    <span style={{
                      background: C.green + '15', color: C.green,
                      padding: '2px 10px', borderRadius: 10,
                      fontSize: 10, fontWeight: 700,
                    }}>
                      {a.status}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* フッター */}
        <div style={{
          position: 'absolute', bottom: 14, right: 24,
          fontSize: 9, color: C.textLight,
        }}>
          Generated by spanavi — {generatedDate}
        </div>
      </div>

      {/* ══════════════════════════════════════
          PAGE 2: 日次推移
      ══════════════════════════════════════ */}
      <div id="pdf-page-2" style={pageStyle}>
        <PageHeader {...headerProps} pageTitle="日次推移" pageNum={2} />
        <div style={{ padding: PAD, overflow: 'hidden', height: PAGE_H - HEADER_H - PAD * 2 }}>
          <SectionTitle>日次 架電数・社長接続率の推移</SectionTitle>
          {dailyStats.length === 0 ? (
            <div style={{ color: C.textLight, fontSize: 11, padding: '12px 0' }}>データなし</div>
          ) : (
            <>
              <ComboChart
                data={dailyStats}
                xKey="date"
                barKey="calls"
                lineKey="connRate"
                barLabel="架電数"
                lineLabel="社長接続率"
              />
              {fmtDaily.length > 14 && (
                <div style={{ fontSize: 10, color: C.textLight, textAlign: 'right', marginBottom: 4 }}>
                  ※ 直近14日分を表示（全{fmtDaily.length}日）
                </div>
              )}
              <StatsTable
                rows={dailyTableRows}
                columns={statsColumns}
                labels={statsLabels}
              />
            </>
          )}
        </div>
        <div style={{ position: 'absolute', bottom: 14, right: 24, fontSize: 9, color: C.textLight }}>
          Generated by spanavi — {generatedDate}
        </div>
      </div>

      {/* ══════════════════════════════════════
          PAGE 3: 週次推移
      ══════════════════════════════════════ */}
      <div id="pdf-page-3" style={pageStyle}>
        <PageHeader {...headerProps} pageTitle="週次推移" pageNum={3} />
        <div style={{ padding: PAD, overflow: 'hidden', height: PAGE_H - HEADER_H - PAD * 2 }}>
          <SectionTitle>週次 架電数・社長接続率・アポ率の推移</SectionTitle>
          {weeklyStats.length === 0 ? (
            <div style={{ color: C.textLight, fontSize: 11, padding: '12px 0' }}>データなし</div>
          ) : (
            <>
              <ComboChart
                data={weeklyStats}
                xKey="week"
                barKey="calls"
                lineKey="connRate"
                barLabel="架電数"
                lineLabel="社長接続率"
              />
              <StatsTable
                rows={weeklyTableRows}
                columns={statsColumnsDailyWithWeek}
                labels={statsLabelsWeekly}
              />
            </>
          )}
        </div>
        <div style={{ position: 'absolute', bottom: 14, right: 24, fontSize: 9, color: C.textLight }}>
          Generated by spanavi — {generatedDate}
        </div>
      </div>

      {/* ══════════════════════════════════════
          PAGE 4: 時間帯別分析
      ══════════════════════════════════════ */}
      <div id="pdf-page-4" style={pageStyle}>
        <PageHeader {...headerProps} pageTitle="時間帯別分析" pageNum={4} />
        <div style={{ padding: PAD, overflow: 'hidden', height: PAGE_H - HEADER_H - PAD * 2 }}>
          <SectionTitle>時間帯別 架電数・社長接続率（JST / 9時〜19時）</SectionTitle>
          <ComboChart
            data={hourlyStats}
            xKey="hour"
            barKey="calls"
            lineKey="connRate"
            barLabel="架電数"
            lineLabel="社長接続率"
            xFormatter={(h) => `${h}時`}
          />

          {/* インサイトボックス */}
          {bestHour !== null ? (
            <div style={{
              marginTop: 20, padding: '16px 24px',
              background: C.green + '08',
              border: `1px solid ${C.green + '30'}`,
              borderLeft: `4px solid ${C.green}`,
              borderRadius: 8,
              display: 'flex', alignItems: 'center', gap: 20,
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: C.green, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                color: '#ffffff', fontSize: 18, fontWeight: 700, flexShrink: 0,
              }}>
                {bestHour}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, marginBottom: 6 }}>
                  最も社長接続率が高い時間帯: {bestHour}時台
                </div>
                <div style={{ fontSize: 11, color: C.textMid, lineHeight: 1.6 }}>
                  {bestHour}時〜{bestHour + 1}時の時間帯に架電を集中させることで、社長接続率の向上が期待できます。<br />
                  接続率: <strong style={{ color: C.green }}>
                    {(hourlyStats.find(h => h.hour === bestHour) || {}).connRate || 0}%
                  </strong>（
                  架電数: {(hourlyStats.find(h => h.hour === bestHour) || {}).calls || 0}件、
                  接続数: {(hourlyStats.find(h => h.hour === bestHour) || {}).connected || 0}件
                  ）
                </div>
              </div>
            </div>
          ) : (
            <div style={{
              marginTop: 20, padding: '16px 24px',
              background: C.offWhite, border: `1px solid ${C.border}`,
              borderRadius: 8, color: C.textMid, fontSize: 11,
            }}>
              時間帯データが不足しています（9〜19時以外の架電記録のみ、またはデータなし）
            </div>
          )}
        </div>
        <div style={{ position: 'absolute', bottom: 14, right: 24, fontSize: 9, color: C.textLight }}>
          Generated by spanavi — {generatedDate}
        </div>
      </div>

    </div>
  );
}
