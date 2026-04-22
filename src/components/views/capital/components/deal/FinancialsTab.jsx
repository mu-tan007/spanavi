// 財務分析タブ — QoE(Quality of Earnings)観点で整理
// 空時でも分析項目の骨組みが見える

const card = { background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: 20 }
const sectionTitle = { fontSize: 13, fontWeight: 600, color: '#032D60', marginBottom: 4 }
const sectionHint = { fontSize: 11, color: '#A0A0A0', marginBottom: 14, lineHeight: 1.6 }

function fmtOku(v) {
  if (v == null) return '—'
  return `¥${(v / 100000000).toFixed(2)}億`
}
function fmtPct(v) { return v == null ? '—' : `${v.toFixed(1)}%` }
function yoy(cur, prev) {
  if (cur == null || prev == null || prev === 0) return null
  return (cur - prev) / prev * 100
}
function cagr(first, last, years) {
  if (!first || !last || first <= 0 || years <= 0) return null
  return (Math.pow(last / first, 1 / years) - 1) * 100
}

export default function FinancialsTab({ financials = [], company }) {
  const sorted = [...financials].sort((a, b) => a.fiscal_year - b.fiscal_year)
  const latest = sorted[sorted.length - 1]
  const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : null
  const first = sorted[0]
  const years = sorted.length

  // KPI
  const opMargin = latest?.operating_income && latest?.revenue ? latest.operating_income / latest.revenue * 100 : null
  const ebitdaMargin = latest?.ebitda && latest?.revenue ? latest.ebitda / latest.revenue * 100 : null
  const revYoY = prev ? yoy(latest?.revenue, prev.revenue) : null
  const revCagr = first && latest ? cagr(first.revenue, latest.revenue, years - 1) : null
  const netDebt = latest ? (latest.interest_bearing_debt || 0) - (latest.cash || 0) : null
  const leverage = netDebt != null && latest?.ebitda ? netDebt / latest.ebitda : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* KPI カード群 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <Kpi label="直近売上高" value={fmtOku(latest?.revenue)} sub={revYoY != null ? `YoY ${revYoY > 0 ? '+' : ''}${revYoY.toFixed(1)}%` : '—'} />
        <Kpi label="営業利益率" value={fmtPct(opMargin)} sub={ebitdaMargin ? `EBITDA率 ${ebitdaMargin.toFixed(1)}%` : '—'} />
        <Kpi label="売上 CAGR" value={fmtPct(revCagr)} sub={years > 1 ? `過去${years - 1}年` : '期数不足'} />
        <Kpi label="ネットデット/EBITDA" value={leverage != null ? `${leverage.toFixed(1)}x` : '—'} sub={netDebt != null ? `ND: ${fmtOku(netDebt)}` : '—'} />
      </div>

      {/* P&L トレンド */}
      <div style={card}>
        <div style={sectionTitle}>① P&L トレンド (損益計算書推移)</div>
        <div style={sectionHint}>売上/粗利/営業利益/EBITDA/純利益 の年次推移。横: 年度、縦: 項目。</div>
        {sorted.length === 0 ? (
          <EmptyTable headers={['項目', 'YYYY年度', 'YYYY年度', 'YYYY年度']}
            rows={[['売上高', '—', '—', '—'], ['粗利率', '—', '—', '—'], ['営業利益', '—', '—', '—'], ['EBITDA', '—', '—', '—'], ['純利益', '—', '—', '—']]}
            note="財務資料を AIチャットに投げると自動抽出されます" />
        ) : (
          <PLTable financials={sorted} />
        )}
      </div>

      {/* 財務健全性 */}
      <div style={card}>
        <div style={sectionTitle}>② 財務健全性 (B/S の質)</div>
        <div style={sectionHint}>純資産・有利子負債・現金の推移、自己資本比率、ネットデット。</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <MiniMetric label="純資産" value={fmtOku(latest?.net_assets)} />
          <MiniMetric label="有利子負債" value={fmtOku(latest?.interest_bearing_debt)} />
          <MiniMetric label="現金・同等物" value={fmtOku(latest?.cash)} />
          <MiniMetric label="総資産" value={fmtOku(latest?.total_assets)} />
          <MiniMetric label="自己資本比率" value={latest?.net_assets && latest?.total_assets ? fmtPct(latest.net_assets / latest.total_assets * 100) : '—'} />
          <MiniMetric label="ネットデット" value={fmtOku(netDebt)} />
        </div>
      </div>

      {/* QoE 調整 */}
      <div style={card}>
        <div style={sectionTitle}>③ QoE 調整 (Quality of Earnings)</div>
        <div style={sectionHint}>ワンタイム損益・非経常損益を除いた実力値。外部 QoE レポート取込時に反映されます。</div>
        <EmptyPlaceholder>
          外部 QoE レポートを AI チャットに投げると、調整後 EBITDA・Run-rate 等を自動で反映します。
        </EmptyPlaceholder>
      </div>

      {/* 運転資本サイクル */}
      <div style={card}>
        <div style={sectionTitle}>④ 運転資本サイクル</div>
        <div style={sectionHint}>DSO (売上債権回収) / DPO (買掛支払) / DIO (在庫回転) から CCC を算出。</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <MiniMetric label="DSO" value="—" unit="日" />
          <MiniMetric label="DPO" value="—" unit="日" />
          <MiniMetric label="DIO" value="—" unit="日" />
          <MiniMetric label="CCC" value="—" unit="日" />
        </div>
        <div style={{ fontSize: 10, color: '#E5E5E5', marginTop: 10 }}>※ 売上債権・買掛金・在庫データが別途必要 (試算表 or 外部DD取込)</div>
      </div>

      {/* CAPEX */}
      <div style={card}>
        <div style={sectionTitle}>⑤ CAPEX (維持 vs 成長)</div>
        <div style={sectionHint}>減価償却内訳・成長CAPEXの構成比</div>
        <EmptyPlaceholder>
          CF計算書 or 固定資産明細をアップロードすると、維持CAPEX / 成長CAPEX の内訳が反映されます。
        </EmptyPlaceholder>
      </div>

      {/* 顧客集中度 */}
      <div style={card}>
        <div style={sectionTitle}>⑥ 顧客集中度・売上構成</div>
        <div style={sectionHint}>トップ5・10顧客の売上シェア、業種/チャネル別構成</div>
        <EmptyPlaceholder>
          IM の顧客情報 or 売上明細を取込むと、上位顧客シェア・集中リスクが可視化されます。
        </EmptyPlaceholder>
      </div>

    </div>
  )
}

function Kpi({ label, value, sub }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 11, color: '#A0A0A0', marginBottom: 4, letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: '#032D60' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#706E6B', marginTop: 4 }}>{sub || '—'}</div>
    </div>
  )
}

function MiniMetric({ label, value, unit }) {
  return (
    <div style={{ padding: 12, background: '#FAFAFA', border: '0.5px solid #E5E5E5', borderRadius: 8 }}>
      <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 500, color: '#032D60' }}>
        {value}{unit && value !== '—' ? <span style={{ fontSize: 11, color: '#A0A0A0', marginLeft: 4 }}>{unit}</span> : null}
      </div>
    </div>
  )
}

function EmptyPlaceholder({ children }) {
  return (
    <div style={{ padding: '20px 16px', background: '#FAFAFA', border: '0.5px dashed #E5E5E5', borderRadius: 6, fontSize: 12, color: '#706E6B', textAlign: 'center', lineHeight: 1.7 }}>
      {children}
    </div>
  )
}

function EmptyTable({ headers, rows, note }) {
  return (
    <div>
      <div style={{ overflowX: 'auto', opacity: 0.5 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#FAFAFA' }}>
              {headers.map((h, i) => <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '8px 12px', fontSize: 11, color: '#A0A0A0', fontWeight: 500, borderBottom: '0.5px solid #E5E5E5' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                {r.map((c, ci) => <td key={ci} style={{ padding: '7px 12px', textAlign: ci === 0 ? 'left' : 'right', color: ci === 0 ? '#706E6B' : '#E5E5E5', borderBottom: '0.5px solid #f0f2f5' }}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <div style={{ fontSize: 11, color: '#706E6B', marginTop: 10, textAlign: 'center' }}>{note}</div>}
    </div>
  )
}

function PLTable({ financials }) {
  const rows = [
    ['売上高', 'revenue', 'oku'],
    ['売上総利益', 'gross_profit', 'oku'],
    ['営業利益', 'operating_income', 'oku'],
    ['EBITDA', 'ebitda', 'oku'],
    ['純利益', 'net_income', 'oku'],
    ['総資産', 'total_assets', 'oku'],
    ['純資産', 'net_assets', 'oku'],
    ['現金', 'cash', 'oku'],
    ['有利子負債', 'interest_bearing_debt', 'oku'],
  ]
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#FAFAFA' }}>
            <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: '#A0A0A0', fontWeight: 500, borderBottom: '0.5px solid #E5E5E5' }}>項目</th>
            {financials.map(f => (
              <th key={f.id} style={{ textAlign: 'right', padding: '8px 12px', fontSize: 11, color: '#A0A0A0', fontWeight: 500, borderBottom: '0.5px solid #E5E5E5' }}>
                {f.fiscal_year}年度
              </th>
            ))}
            <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 11, color: '#A0A0A0', fontWeight: 500, borderBottom: '0.5px solid #E5E5E5' }}>直近YoY</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, key], ri) => {
            const last = financials[financials.length - 1]?.[key]
            const prev = financials[financials.length - 2]?.[key]
            const yoyVal = yoy(last, prev)
            return (
              <tr key={key} style={{ background: ri % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                <td style={{ padding: '7px 12px', color: '#706E6B', borderBottom: '0.5px solid #f0f2f5' }}>{label}</td>
                {financials.map(f => (
                  <td key={f.id} style={{ padding: '7px 12px', textAlign: 'right', color: '#032D60', borderBottom: '0.5px solid #f0f2f5' }}>
                    {f[key] != null ? `¥${(f[key] / 100000000).toFixed(1)}億` : '—'}
                  </td>
                ))}
                <td style={{ padding: '7px 12px', textAlign: 'right', color: yoyVal == null ? '#E5E5E5' : yoyVal >= 0 ? '#2E844A' : '#EA001E', fontWeight: 500, borderBottom: '0.5px solid #f0f2f5' }}>
                  {yoyVal != null ? `${yoyVal > 0 ? '+' : ''}${yoyVal.toFixed(1)}%` : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
