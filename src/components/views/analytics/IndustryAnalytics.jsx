import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Card, Select, Badge } from '../../ui';

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const HOURS = Array.from({ length: 12 }, (_, i) => 9 + i); // 9-20時

export default function IndustryAnalytics() {
  const [level, setLevel] = useState('major'); // 'major' | 'sub'
  const [metric, setMetric] = useState('keyman_rate'); // 'calls' | 'keyman_rate' | 'apo_rate'
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndustry, setSelectedIndustry] = useState(null);
  const [heatmap, setHeatmap] = useState([]);
  const [heatmapLoading, setHeatmapLoading] = useState(false);

  // サマリ取得
  const loadSummary = useCallback(async (lvl) => {
    setLoading(true);
    const { data, error } = await supabase.rpc('analytics_industry_summary', { p_level: lvl });
    if (error) console.error('[IndustryAnalytics] summary:', error);
    setSummary(data || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    loadSummary(level);
    setSelectedIndustry(null);
  }, [level, loadSummary]);

  // ヒートマップ取得（industry 切替時）
  const loadHeatmap = useCallback(async (lvl, industry) => {
    setHeatmapLoading(true);
    const { data, error } = await supabase.rpc('analytics_industry_heatmap', { p_level: lvl, p_industry: industry });
    if (error) console.error('[IndustryAnalytics] heatmap:', error);
    setHeatmap(data || []);
    setHeatmapLoading(false);
  }, []);
  useEffect(() => {
    if (selectedIndustry) loadHeatmap(level, selectedIndustry);
    else setHeatmap([]);
  }, [selectedIndustry, level, loadHeatmap]);

  // 集計値を計算
  const enriched = useMemo(() => {
    return (summary || []).map(r => ({
      ...r,
      keyman_rate: r.calls > 0 ? r.keyman_count / r.calls : 0,
      apo_rate:    r.calls > 0 ? r.apo_count    / r.calls : 0,
    }));
  }, [summary]);

  // ヒートマップ用：dow × hour 行列
  const heatmapMatrix = useMemo(() => {
    const matrix = {};
    for (const dow of [1, 2, 3, 4, 5, 6, 0]) {
      matrix[dow] = {};
      for (const hour of HOURS) matrix[dow][hour] = { calls: 0, keyman: 0, apo: 0 };
    }
    (heatmap || []).forEach(r => {
      if (matrix[r.dow] && matrix[r.dow][r.hour]) {
        matrix[r.dow][r.hour] = { calls: r.calls || 0, keyman: r.keyman_count || 0, apo: r.apo_count || 0 };
      }
    });
    return matrix;
  }, [heatmap]);

  // ヒートマップ表示用最大値（カラースケール基準）
  const maxValue = useMemo(() => {
    let max = 0;
    Object.values(heatmapMatrix).forEach(hourMap => {
      Object.values(hourMap).forEach(cell => {
        const v = metric === 'calls' ? cell.calls : (cell.calls > 0 ? (metric === 'keyman_rate' ? cell.keyman / cell.calls : cell.apo / cell.calls) : 0);
        if (v > max) max = v;
      });
    });
    return max;
  }, [heatmapMatrix, metric]);

  return (
    <Card padding="md" style={{ marginTop: space[5] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[3], flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy }}>業種別分析（TSR）</h3>
        <span style={{ fontSize: font.size.xs, color: color.textLight }}>
          各企業を東京商工リサーチの分類でグルーピングし、接続率・アポ率を集計
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: font.size.xs, color: color.textMid }}>分類:</span>
          <ToggleButton active={level === 'major'} onClick={() => setLevel('major')}>大分類</ToggleButton>
          <ToggleButton active={level === 'sub'}   onClick={() => setLevel('sub')}>細分類</ToggleButton>
        </div>
      </div>

      {/* サマリテーブル */}
      <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, overflow: 'auto', maxHeight: 480 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.size.xs }}>
          <thead style={{ background: color.navy, color: color.white, position: 'sticky', top: 0 }}>
            <tr>
              <th style={th}>業種</th>
              <th style={{ ...th, textAlign: 'right' }}>架電数</th>
              <th style={{ ...th, textAlign: 'right' }}>キーマン接続</th>
              <th style={{ ...th, textAlign: 'right' }}>接続率</th>
              <th style={{ ...th, textAlign: 'right' }}>アポ獲得</th>
              <th style={{ ...th, textAlign: 'right' }}>アポ率</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: color.textLight }}>読み込み中…</td></tr>
            )}
            {!loading && enriched.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: color.textLight }}>データなし</td></tr>
            )}
            {enriched.map((r, i) => {
              const isSelected = selectedIndustry === r.industry;
              return (
                <tr
                  key={r.industry}
                  onClick={() => setSelectedIndustry(isSelected ? null : r.industry)}
                  style={{
                    background: isSelected ? alpha(color.navy, 0.08) : (i % 2 === 0 ? color.white : color.cream),
                    borderBottom: `1px solid ${color.borderLight}`,
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = alpha(color.navyLight, 0.05); }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = i % 2 === 0 ? color.white : color.cream; }}
                >
                  <td style={{ ...td, fontWeight: isSelected ? font.weight.bold : font.weight.medium, color: color.navy }}>
                    {isSelected && '▼ '}{r.industry}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: font.family.mono }}>{r.calls.toLocaleString()}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: font.family.mono }}>{r.keyman_count.toLocaleString()}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: font.family.mono, color: r.keyman_rate >= 0.08 ? color.success : (r.keyman_rate >= 0.05 ? color.gold : color.textMid) }}>
                    {(r.keyman_rate * 100).toFixed(1)}%
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: font.family.mono }}>{r.apo_count.toLocaleString()}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: font.family.mono, color: r.apo_rate >= 0.005 ? color.success : color.textMid }}>
                    {(r.apo_rate * 100).toFixed(2)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ヒートマップ（業種選択時） */}
      {selectedIndustry && (
        <div style={{ marginTop: space[4] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[2], flexWrap: 'wrap' }}>
            <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy }}>
              曜日 × 時間帯ヒートマップ: <span style={{ color: color.gold }}>{selectedIndustry}</span>
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: space[2], alignItems: 'center' }}>
              <span style={{ fontSize: font.size.xs, color: color.textMid }}>指標:</span>
              <ToggleButton active={metric === 'calls'}      onClick={() => setMetric('calls')}>架電数</ToggleButton>
              <ToggleButton active={metric === 'keyman_rate'} onClick={() => setMetric('keyman_rate')}>接続率</ToggleButton>
              <ToggleButton active={metric === 'apo_rate'}    onClick={() => setMetric('apo_rate')}>アポ率</ToggleButton>
            </div>
          </div>
          {heatmapLoading ? (
            <div style={{ padding: 20, textAlign: 'center', color: color.textLight }}>ヒートマップを読み込み中…</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 10, minWidth: 600 }}>
                <thead>
                  <tr>
                    <th style={{ ...thHm, background: 'transparent' }}></th>
                    {HOURS.map(h => (
                      <th key={h} style={thHm}>{h}時</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4, 5, 6, 0].map(dow => (
                    <tr key={dow}>
                      <th style={{ ...thHm, textAlign: 'right' }}>{DOW_LABELS[dow]}</th>
                      {HOURS.map(h => {
                        const cell = heatmapMatrix[dow]?.[h] || { calls: 0, keyman: 0, apo: 0 };
                        const v = metric === 'calls' ? cell.calls
                                : metric === 'keyman_rate' ? (cell.calls > 0 ? cell.keyman / cell.calls : 0)
                                : (cell.calls > 0 ? cell.apo / cell.calls : 0);
                        const intensity = maxValue > 0 ? v / maxValue : 0;
                        const bg = `rgba(13, 34, 71, ${0.05 + intensity * 0.85})`;
                        const tooltip = `${DOW_LABELS[dow]} ${h}時: 架電${cell.calls} / キーマン接続${cell.keyman} / アポ${cell.apo}`;
                        return (
                          <td key={h} title={tooltip} style={{
                            background: bg, color: intensity > 0.55 ? color.white : color.textDark,
                            textAlign: 'center', padding: '6px 4px', fontFamily: font.family.mono,
                            border: `1px solid ${color.borderLight}`, minWidth: 42,
                          }}>
                            {metric === 'calls' ? (cell.calls > 0 ? cell.calls : '') :
                             cell.calls > 0 ? `${(v * 100).toFixed(1)}%` : ''}
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
      )}
    </Card>
  );
}

function ToggleButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} type="button" style={{
      padding: `4px ${space[2.5]}px`, fontSize: font.size.xs,
      background: active ? color.navy : color.white,
      color: active ? color.white : color.textMid,
      border: `1px solid ${active ? color.navy : color.border}`,
      borderRadius: radius.sm, cursor: 'pointer',
      fontWeight: active ? font.weight.semibold : font.weight.normal,
      fontFamily: font.family.sans,
    }}>{children}</button>
  );
}

const th = { padding: '6px 10px', textAlign: 'left', fontWeight: font.weight.semibold, fontSize: font.size.xs };
const td = { padding: '6px 10px', borderBottom: `1px solid ${color.borderLight}` };
const thHm = { padding: '4px 6px', fontSize: 10, color: color.textMid, fontWeight: font.weight.semibold, background: color.cream };
