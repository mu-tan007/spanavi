import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { color, space, radius, font, alpha } from '../../../constants/design';
import { supabase } from '../../../lib/supabase';

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

// 業種別 キーマン接続率 データビュー
//   上段: 現在(JST)曜日×時間帯の業種別接続率ランキング
//   下段: 業種選択 → 曜日×時間帯ヒートマップ
export default function IndustryDataPanel() {
  const [selectedIndustry, setSelectedIndustry] = useState(null);
  const [collapsed, setCollapsed] = useState(true);

  const now = useMemo(() => new Date(), []);
  const nowDow  = (now.getDay() + 7) % 7;
  const nowHour = now.getHours();

  // 共通キャッシュに乗せる（タブ切替で即時描画）
  const { data: nowRanking = [], isPending: loadingNow1 } = useQuery({
    queryKey: ['industry_score_now', 30],
    queryFn: async () => {
      const { data } = await supabase.rpc('industry_score_now', { p_min_samples: 30 });
      return Array.isArray(data) ? data : [];
    },
  });
  const { data: industries = [], isPending: loadingNow2 } = useQuery({
    queryKey: ['industry_score_industries', 100],
    queryFn: async () => {
      const { data } = await supabase.rpc('industry_score_industries', { p_min_samples: 100 });
      return Array.isArray(data) ? data : [];
    },
  });
  const loadingNow = loadingNow1 || loadingNow2;

  // 業種選択肢が来たら最初の業種をデフォルト選択
  useEffect(() => {
    if (industries.length > 0 && !selectedIndustry) {
      setSelectedIndustry(industries[0].industry_major);
    }
  }, [industries, selectedIndustry]);

  const { data: heatmap = [], isPending: loadingHeat } = useQuery({
    queryKey: ['industry_score_heatmap', selectedIndustry],
    enabled: !!selectedIndustry,
    queryFn: async () => {
      const { data } = await supabase.rpc('industry_score_heatmap', { p_industry: selectedIndustry });
      return Array.isArray(data) ? data : [];
    },
  });

  // ヒートマップ用に dow,hour → cell のマップ
  const heatmapMap = useMemo(() => {
    const m = new Map();
    for (const h of heatmap) m.set(`${h.dow}-${h.hour}`, h);
    return m;
  }, [heatmap]);

  // セル色（接続率の高さで navy 濃淡）
  const cellStyle = (rate, total) => {
    if (total == null || total === 0) return { background: color.gray50, color: color.textLight };
    const r = Number(rate) || 0;
    let alpha01 = 0;
    if (r >= 25)      alpha01 = 0.85;
    else if (r >= 15) alpha01 = 0.55;
    else if (r >= 8)  alpha01 = 0.30;
    else if (r > 0)   alpha01 = 0.12;
    return {
      background: alpha(color.navy, alpha01),
      color: alpha01 > 0.5 ? color.white : color.textDark,
    };
  };

  return (
    <div style={{
      padding: '14px 18px', background: color.white, borderRadius: radius.md,
      border: `1px solid ${color.border}`, marginBottom: space[3],
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: collapsed ? 0 : space[3] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy }}>
          業種別 キーマン接続率データ
        </div>
        <button onClick={() => setCollapsed(c => !c)} style={{
          padding: '4px 10px', background: 'transparent', border: `1px solid ${color.border}`,
          borderRadius: radius.md, fontSize: font.size.xs, color: color.textMid, cursor: 'pointer',
          fontFamily: font.family.sans,
        }}>{collapsed ? '展開 ▼' : '閉じる ▲'}</button>
      </div>

      {!collapsed && (
        <>
          {/* いまランキング */}
          <div style={{ marginBottom: space[3] }}>
            <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.textMid, letterSpacing: 0.4, marginBottom: space[2] }}>
              現在の時間帯ランキング　<span style={{ color: color.textLight, fontWeight: font.weight.medium }}>{DAY_LABELS[nowDow]}曜日 {nowHour}時台</span>
            </div>
            {loadingNow ? (
              <div style={{ fontSize: font.size.xs, color: color.textLight }}>読み込み中…</div>
            ) : nowRanking.length === 0 ? (
              <div style={{ fontSize: font.size.xs, color: color.textLight }}>この時間帯のサンプルが不足しています（最少30件以上）。</div>
            ) : (
              <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
                {nowRanking.map((r, i) => (
                  <div key={r.industry_major} style={{
                    padding: '6px 12px', borderRadius: radius.md,
                    background: i === 0 ? alpha(color.gold, 0.10) : i === 1 ? alpha(color.navy, 0.06) : i === 2 ? alpha(color.navy, 0.04) : color.gray50,
                    border: `1px solid ${i === 0 ? color.gold : color.border}`,
                    display: 'flex', alignItems: 'center', gap: space[2],
                  }}>
                    <span style={{ fontSize: font.size.xs - 1, color: color.textLight, fontWeight: font.weight.bold, fontFamily: font.family.mono, minWidth: 18 }}>
                      {i + 1}.
                    </span>
                    <span style={{ fontSize: font.size.xs, color: color.navy, fontWeight: font.weight.semibold }}>
                      {r.industry_major}
                    </span>
                    <span style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy, fontFamily: font.family.mono, fontVariantNumeric: 'tabular-nums' }}>
                      {Number(r.keyman_rate).toFixed(1)}%
                    </span>
                    <span style={{ fontSize: font.size.xs - 1, color: color.textLight, fontFamily: font.family.mono }}>
                      n={r.total}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 業種選択ヒートマップ */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[2] }}>
              <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.textMid, letterSpacing: 0.4 }}>
                曜日 × 時間帯 ヒートマップ
              </span>
              <select value={selectedIndustry || ''} onChange={e => setSelectedIndustry(e.target.value)} style={{
                padding: '4px 10px', borderRadius: radius.md, border: `1px solid ${color.border}`,
                fontSize: font.size.xs, color: color.textDark, fontFamily: font.family.sans, background: color.white, cursor: 'pointer',
              }}>
                {industries.map(i => (
                  <option key={i.industry_major} value={i.industry_major}>
                    {i.industry_major}（全体 {Number(i.keyman_rate).toFixed(1)}% / n={i.total}）
                  </option>
                ))}
              </select>
            </div>
            {loadingHeat ? (
              <div style={{ fontSize: font.size.xs, color: color.textLight }}>読み込み中…</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontFamily: font.family.mono, fontSize: font.size.xs - 1 }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '4px 8px', color: color.textLight, fontWeight: font.weight.semibold, textAlign: 'left', width: 36 }}></th>
                      {HOURS.map(h => (
                        <th key={h} style={{
                          padding: '4px 6px', color: color.textLight, fontWeight: font.weight.semibold,
                          textAlign: 'center', minWidth: 44,
                          background: h === nowHour ? alpha(color.gold, 0.10) : 'transparent',
                        }}>{h}時</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4, 5, 6, 0].map(dow => (
                      <tr key={dow}>
                        <td style={{
                          padding: '4px 8px', color: color.textMid, fontWeight: font.weight.semibold,
                          background: dow === nowDow ? alpha(color.gold, 0.10) : 'transparent',
                        }}>{DAY_LABELS[dow]}</td>
                        {HOURS.map(h => {
                          const cell = heatmapMap.get(`${dow}-${h}`);
                          const rate = cell?.keyman_rate;
                          const total = cell?.total;
                          const isNowSlot = dow === nowDow && h === nowHour;
                          return (
                            <td key={h}
                              title={cell ? `${DAY_LABELS[dow]} ${h}時: ${Number(rate).toFixed(1)}% (キーマン接続 ${cell.keyman_connected} / 架電 ${total})` : 'データなし'}
                              style={{
                                padding: '6px 4px', textAlign: 'center', fontVariantNumeric: 'tabular-nums',
                                borderRight: isNowSlot ? `2px solid ${color.gold}` : '1px solid transparent',
                                borderTop: isNowSlot ? `2px solid ${color.gold}` : '1px solid transparent',
                                borderBottom: isNowSlot ? `2px solid ${color.gold}` : '1px solid transparent',
                                borderLeft: isNowSlot ? `2px solid ${color.gold}` : '1px solid transparent',
                                ...cellStyle(rate, total),
                              }}>
                              {total ? `${Number(rate).toFixed(0)}` : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
