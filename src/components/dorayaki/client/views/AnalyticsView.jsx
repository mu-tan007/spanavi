import React, { useState } from 'react';
import { dora } from '../theme';

// dorayaki.AI クライアントポータル — Analytics(叩き・デモ数値)
// むー様提供のデザイン画像を忠実に再現。数値は全てモック固定。
// -----------------------------------------------------------------------------

/* ============================ mock data ============================ */
const KPIS = [
  { label: '送付数',    value: '500', unit: '社', sub: '予算 ¥520万 / 単価 ¥10,400' },
  { label: '配達完了数', value: '485', unit: '社', sub: '配達完了率 97.0%' },
  { label: 'QR開封数',  value: '210', unit: '社', sub: 'QR開封率 42.0%' },
  { label: 'アポ獲得数', value: '101', unit: '件', sub: 'アポ獲得率 20.2%', subAccent: true },
  { label: '実効CPA',   value: '¥51,485', unit: '', sub: '投下¥520万 / 101件' },
];

const FUNNEL_A = {
  badge: 'ファネル①', title: 'DM到着 → QR開封 → 即アポ',
  desc: '贈り物の到着からQR開封を経て、その場で獲得したアポ',
  grad: 'linear-gradient(90deg, #9A6234 0%, #6B4423 38%, #2952c8 100%)',
  rows: [
    { label: '送付',     value: 500, pct: 100,  right: '500', unit: '社' },
    { label: '配達完了', value: 485, pct: 97.0, right: '97.0', unit: '%' },
    { label: 'QR開封',   value: 210, pct: 42.0, right: '42.0', unit: '%' },
    { label: '動画完視', value: 98,  pct: 19.6, right: '19.6', unit: '%' },
    { label: '即アポ',   value: 45,  pct: 9.0,  right: '9.0',  unit: '%' },
  ],
};
const FUNNEL_B = {
  badge: 'ファネル②', title: 'フォロー架電 → アポ',
  desc: '着荷翌日以降、担当が架電して獲得したアポ',
  grad: 'linear-gradient(90deg, #3b6fe0 0%, #1E40AF 45%, #0D2247 100%)',
  rows: [
    { label: '架電対象', value: 440, pct: 100,  right: '440',  unit: '社' },
    { label: '架電',     value: 392, pct: 89.1, right: '89.1', unit: '%' },
    { label: '接続',     value: 233, pct: 53.0, right: '53.0', unit: '%' },
    { label: '社長接続', value: 106, pct: 24.1, right: '24.1', unit: '%' },
    { label: '獲得',     value: 56,  pct: 12.7, right: '12.7', unit: '%' },
  ],
};

const SEG_TABS = ['業界', '売上規模', '社長年齢', '地域', '業歴'];
const SEG_ROWS = [
  { name: '製造',     send: 128, qr: 42, apo: 24, cpa: 48000, cnt: 31 },
  { name: '建設',     send: 96,  qr: 45, apo: 23, cpa: 51000, cnt: 22 },
  { name: '卸売',     send: 71,  qr: 38, apo: 18, cpa: 58000, cnt: 13 },
  { name: '小売',     send: 64,  qr: 33, apo: 14, cpa: 66000, cnt: 9 },
  { name: '運輸',     send: 52,  qr: 40, apo: 20, cpa: 54000, cnt: 10 },
  { name: '情報通信', send: 43,  qr: 29, apo: 10, cpa: 74000, cnt: 4 },
  { name: '不動産',   send: 38,  qr: 31, apo: 13, cpa: 69000, cnt: 5 },
  { name: '飲食',     send: 34,  qr: 27, apo: 9,  cpa: 79000, cnt: 3 },
  { name: '医療福祉', send: 29,  qr: 35, apo: 16, cpa: 62000, cnt: 5 },
  { name: 'サービス', send: 45,  qr: 28, apo: 9,  cpa: 77000, cnt: 4 },
];

const REACTION = [
  { label: '1時間以内', pct: 34.2, strong: true },
  { label: '当日中',    pct: 21.9, strong: true },
  { label: '翌日',      pct: 10.8, strong: false },
  { label: '2日目以降', pct: 4.1,  strong: false },
];

const TREND = {
  months: ['4月', '5月', '6月', '7月'],
  qr:  [30, 34, 39, 42],   // QR開封率(%)
  apo: [13, 16, 19, 20.2], // アポ率(%)
};

const DAILY = [
  { d: '7/14', v: 55 }, { d: '7/15', v: 78 }, { d: '7/16', v: 100 },
  { d: '7/17', v: 62 }, { d: '7/18', v: 58 }, { d: '7/19', v: 42 }, { d: '7/20', v: 35 },
];

const APO_BREAKDOWN = [
  { title: 'QRから直接予約',    desc: '社長が自らLPで日程を選択', n: 45 },
  { title: 'フォロー架電でアポ', desc: '開封を検知し、担当が架電',   n: 56 },
  { title: '未架電 / 追跡中',    desc: '要フォロー',                 n: 72 },
];

/* ============================ helpers ============================ */
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
// good(0..1) → 薄青→濃紺のバー色。優秀ほど濃い。
const barColor = (good) => mix('#c9d6f4', '#1e3a8a', Math.max(0, Math.min(1, good)));

/* ============================ small UI ============================ */
function Card({ children, style }) {
  return (
    <div style={{
      background: dora.color.surface, border: `1px solid ${dora.color.surfaceLine}`,
      borderRadius: dora.radius.lg, boxShadow: dora.shadow.card, padding: dora.space.xl,
      ...style,
    }}>{children}</div>
  );
}
function CardHead({ title, desc, badge }) {
  return (
    <div style={{ marginBottom: dora.space.lg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: dora.space.sm }}>
        {badge && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: dora.color.royal, background: '#eef2fb',
            padding: '3px 8px', borderRadius: dora.radius.sm, fontFamily: dora.font.display,
          }}>{badge}</span>
        )}
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: dora.color.ink, fontFamily: dora.font.display }}>{title}</h3>
      </div>
      {desc && <p style={{ margin: `${dora.space.xs}px 0 0`, fontSize: 12, color: dora.color.inkSoft }}>{desc}</p>}
    </div>
  );
}

/* ============================ funnel ============================ */
function Funnel({ data }) {
  return (
    <Card>
      <CardHead badge={data.badge} title={data.title} desc={data.desc} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.rows.map((r) => (
          <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '76px 1fr 58px', alignItems: 'center', gap: dora.space.md }}>
            <span style={{ fontSize: 12.5, color: dora.color.inkMid, fontWeight: 500 }}>{r.label}</span>
            <div style={{ position: 'relative', height: 30, background: '#eef1f7', borderRadius: dora.radius.sm, overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', inset: 0, width: `${r.pct}%`, background: data.grad,
                borderRadius: dora.radius.sm, display: 'flex', alignItems: 'center',
                paddingLeft: dora.space.sm,
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', fontFamily: dora.font.num }}>{r.value}</span>
              </div>
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: dora.color.ink, textAlign: 'right', fontFamily: dora.font.num }}>
              {r.right}<span style={{ fontSize: 10, fontWeight: 500, color: dora.color.inkSoft, marginLeft: 1 }}>{r.unit}</span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ============================ segment table ============================ */
function SegBarCell({ display, good }) {
  const w = Math.max(6, Math.round(good * 100));
  return (
    <div style={{ position: 'relative', height: 30, background: '#eef1f7', borderRadius: dora.radius.sm, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${w}%`, background: barColor(good), borderRadius: dora.radius.sm }} />
      <span style={{
        position: 'absolute', right: 8, top: 0, bottom: 0, display: 'flex', alignItems: 'center',
        fontSize: 12, fontWeight: 700, fontFamily: dora.font.num,
        color: good > 0.58 ? '#fff' : dora.color.ink,
      }}>{display}</span>
    </div>
  );
}
function SegmentTable() {
  const [tab, setTab] = useState('業界');
  const maxSend = Math.max(...SEG_ROWS.map(r => r.send));
  const maxQr = Math.max(...SEG_ROWS.map(r => r.qr));
  const maxApo = Math.max(...SEG_ROWS.map(r => r.apo));
  const cpas = SEG_ROWS.map(r => r.cpa); const minCpa = Math.min(...cpas), maxCpa = Math.max(...cpas);
  const cols = ['業界', '送付数', 'QR開封率', 'アポ率', '実効CPA', 'アポ数'];
  const grid = '96px 1fr 1fr 1fr 1fr 60px';

  return (
    <Card>
      <CardHead title="セグメント別パフォーマンス" desc="属性を切り替えて、全指標を横並びで比較 — 濃いほど優秀。来月の送付先を最適化する" />
      {/* tabs */}
      <div style={{ display: 'flex', gap: dora.space.xs, marginBottom: dora.space.lg }}>
        {SEG_TABS.map((t) => {
          const active = t === tab;
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '6px 14px', borderRadius: dora.radius.sm, border: `1px solid ${active ? dora.color.navy : dora.color.surfaceLine}`,
              background: active ? dora.color.navy : dora.color.surface, color: active ? '#fff' : dora.color.inkMid,
              fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: dora.font.display,
            }}>{t}</button>
          );
        })}
      </div>
      {/* header */}
      <div style={{ display: 'grid', gridTemplateColumns: grid, gap: dora.space.md, padding: `0 0 ${dora.space.sm}px`, borderBottom: `1px solid ${dora.color.surfaceLine}` }}>
        {cols.map((c, i) => (
          <span key={c} style={{ fontSize: 11.5, color: dora.color.inkSoft, fontWeight: 600, textAlign: i === 0 ? 'left' : 'center' }}>{c}</span>
        ))}
      </div>
      {/* rows */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {SEG_ROWS.map((r) => (
          <div key={r.name} style={{ display: 'grid', gridTemplateColumns: grid, gap: dora.space.md, alignItems: 'center', padding: `7px 0` }}>
            <span style={{ fontSize: 12.5, color: dora.color.ink, fontWeight: 600 }}>{r.name}</span>
            <SegBarCell display={r.send} good={r.send / maxSend} />
            <SegBarCell display={`${r.qr}%`} good={r.qr / maxQr} />
            <SegBarCell display={`${r.apo}%`} good={r.apo / maxApo} />
            <SegBarCell display={`¥${r.cpa.toLocaleString()}`} good={(maxCpa - r.cpa) / (maxCpa - minCpa)} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: dora.color.ink, textAlign: 'right', fontFamily: dora.font.num }}>{r.cnt}</span>
          </div>
        ))}
      </div>
      {/* recommend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: dora.space.md, marginTop: dora.space.lg, paddingTop: dora.space.lg, borderTop: `1px solid ${dora.color.surfaceLine}` }}>
        <span style={{ fontSize: 12, color: dora.color.inkMid, fontWeight: 600 }}>推奨セグメント上位3件</span>
        <span style={{ fontSize: 11, color: dora.color.inkSoft }}>（アポ率 × CPA 複合スコア）</span>
        {[['1位', '製造'], ['2位', '建設'], ['3位', '運輸']].map(([rank, name]) => (
          <span key={rank} style={{
            fontSize: 12, fontWeight: 600, color: dora.color.royal, background: '#eef2fb',
            border: `1px solid #dbe4f8`, padding: '4px 10px', borderRadius: dora.radius.sm,
          }}><span style={{ color: dora.color.inkSoft, marginRight: 4 }}>{rank}</span>{name}</span>
        ))}
      </div>
    </Card>
  );
}

/* ============================ reaction time ============================ */
function ReactionCard() {
  const max = Math.max(...REACTION.map(r => r.pct));
  return (
    <Card>
      <CardHead title="反応時間 × アポ率" desc="QR開封から架電までの時間が、アポ率を大きく左右する" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {REACTION.map((r) => (
          <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '84px 1fr', alignItems: 'center', gap: dora.space.md }}>
            <span style={{ fontSize: 12.5, color: dora.color.inkMid }}>{r.label}</span>
            <div style={{ position: 'relative', height: 30, background: '#eef1f7', borderRadius: dora.radius.sm, overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', inset: 0, width: `${(r.pct / max) * 100}%`,
                background: r.strong ? dora.color.navy : '#c4cad7', borderRadius: dora.radius.sm,
              }} />
              <span style={{
                position: 'absolute', right: 10, top: 0, bottom: 0, display: 'flex', alignItems: 'center',
                fontSize: 12.5, fontWeight: 700, fontFamily: dora.font.num,
                color: r.strong ? '#fff' : dora.color.ink,
              }}>{r.pct}%</span>
            </div>
          </div>
        ))}
      </div>
      <p style={{ margin: `${dora.space.lg}px 0 0`, fontSize: 12.5, color: dora.color.inkMid }}>
        開封から <strong style={{ color: dora.color.royal }}>1時間以内</strong> の架電で、アポ率は約8倍に
      </p>
    </Card>
  );
}

/* ============================ trend line ============================ */
function TrendCard() {
  const W = 520, H = 170, padX = 34, padY = 22;
  const n = TREND.months.length;
  const allVals = [...TREND.qr, ...TREND.apo];
  const lo = Math.min(...allVals) - 4, hi = Math.max(...allVals) + 4;
  const x = (i) => padX + (i * (W - padX * 2)) / (n - 1);
  const y = (v) => padY + (1 - (v - lo) / (hi - lo)) * (H - padY * 2);
  const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  return (
    <Card>
      <CardHead title="月次推移" desc="開封率・アポ率・CPAの改善トレンド" />
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={padX} x2={W - padX} y1={padY + g * (H - padY * 2)} y2={padY + g * (H - padY * 2)} stroke="#eef1f7" strokeWidth="1" />
        ))}
        <path d={path(TREND.qr)} fill="none" stroke="#9A6234" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d={path(TREND.apo)} fill="none" stroke="#2952c8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {TREND.qr.map((v, i) => <circle key={'q' + i} cx={x(i)} cy={y(v)} r="4" fill="#9A6234" />)}
        {TREND.apo.map((v, i) => <circle key={'a' + i} cx={x(i)} cy={y(v)} r="4" fill="#2952c8" />)}
        {TREND.months.map((m, i) => (
          <text key={m} x={x(i)} y={H - 4} fontSize="11" fill={dora.color.inkSoft} textAnchor="middle">{m}</text>
        ))}
      </svg>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: dora.space.sm }}>
        <div style={{ display: 'flex', gap: dora.space.lg }}>
          <Legend color="#9A6234" label="QR開封率" />
          <Legend color="#2952c8" label="アポ率" />
        </div>
        <span style={{ fontSize: 12, color: dora.color.inkSoft }}>
          CPA <strong style={{ color: '#1a9d6a', fontFamily: dora.font.num }}>¥68,200 → ¥51,485</strong>
        </span>
      </div>
    </Card>
  );
}
function Legend({ color, label }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: dora.color.inkMid }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: color }} />{label}
    </span>
  );
}

/* ============================ daily opens ============================ */
function DailyCard() {
  const max = Math.max(...DAILY.map(d => d.v));
  return (
    <Card>
      <CardHead title="日別 開封数" desc="配達日からの開封の立ち上がり" />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: dora.space.md, height: 150, padding: `0 ${dora.space.sm}px` }}>
        {DAILY.map((d) => (
          <div key={d.d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ width: '100%', flex: 1, display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ width: '100%', height: `${(d.v / max) * 100}%`, background: '#4564b8', borderRadius: `${dora.radius.sm}px ${dora.radius.sm}px 0 0` }} />
            </div>
            <span style={{ fontSize: 11, color: dora.color.inkSoft }}>{d.d}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ============================ apo breakdown ============================ */
function BreakdownCard() {
  return (
    <Card>
      <CardHead title="アポの内訳" desc="QR直接 と フォロー架電 の2レーン" />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {APO_BREAKDOWN.map((b, i) => (
          <div key={b.title} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: `${dora.space.md}px 0`, borderTop: i ? `1px solid ${dora.color.surfaceLine}` : 'none',
          }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: dora.color.ink }}>{b.title}</div>
              <div style={{ fontSize: 12, color: dora.color.inkSoft, marginTop: 2 }}>{b.desc}</div>
            </div>
            <span style={{ fontSize: 22, fontWeight: 700, color: dora.color.ink, fontFamily: dora.font.num }}>{b.n}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ============================ main ============================ */
export default function AnalyticsView() {
  return (
    <div>
      {/* title + filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: dora.space.md, marginBottom: dora.space.lg }}>
        <h1 style={{ margin: 0, fontFamily: dora.font.display, fontSize: 20, fontWeight: 700, color: dora.color.ink }}>Analytics</h1>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: dora.space.sm, marginBottom: dora.space.lg }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: dora.space.sm, padding: '7px 12px',
          background: dora.color.surface, border: `1px solid ${dora.color.surfaceLine}`, borderRadius: dora.radius.md,
          fontSize: 12.5, cursor: 'pointer',
        }}>
          <span style={{ color: dora.color.inkSoft }}>案件</span>
          <span style={{ fontWeight: 700, color: dora.color.ink }}>2026年度7月送付分</span>
          <span style={{ color: dora.color.inkSoft, fontSize: 10 }}>▾</span>
        </div>
        <div style={{
          padding: '7px 14px', background: dora.color.surface, border: `1px solid ${dora.color.surfaceLine}`,
          borderRadius: dora.radius.md, fontSize: 12.5, color: dora.color.inkMid, cursor: 'pointer',
        }}>累計</div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: dora.space.md, marginBottom: dora.space.lg }}>
        {KPIS.map((k) => (
          <Card key={k.label} style={{ padding: dora.space.lg }}>
            <div style={{ fontSize: 12, color: dora.color.inkSoft, marginBottom: dora.space.sm }}>{k.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 27, fontWeight: 700, color: dora.color.ink, fontFamily: dora.font.num, letterSpacing: -0.5 }}>{k.value}</span>
              {k.unit && <span style={{ fontSize: 13, color: dora.color.inkMid }}>{k.unit}</span>}
            </div>
            <div style={{ fontSize: 11.5, color: k.subAccent ? dora.color.royal : dora.color.inkSoft, marginTop: dora.space.sm, fontWeight: k.subAccent ? 700 : 400 }}>{k.sub}</div>
          </Card>
        ))}
      </div>

      {/* funnels */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: dora.space.lg, marginBottom: dora.space.lg }}>
        <Funnel data={FUNNEL_A} />
        <Funnel data={FUNNEL_B} />
      </div>

      {/* segment */}
      <div style={{ marginBottom: dora.space.lg }}>
        <SegmentTable />
      </div>

      {/* bottom 2x2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: dora.space.lg }}>
        <ReactionCard />
        <TrendCard />
        <DailyCard />
        <BreakdownCard />
      </div>
    </div>
  );
}
