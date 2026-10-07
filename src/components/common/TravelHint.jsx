import { travelLabel } from '../../utils/travelFromTokyo';
import { color, radius, font, alpha } from '../../constants/design';

// 架電ページのカレンダーの上に、東京からの移動時間の目安を出す（Googleカレンダー・TimeRex・Spirのどれでも同じ位置）
export default function TravelHint({ address }) {
  const label = travelLabel(address);
  if (!label) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: radius.md, background: alpha(color.gold, 0.12), border: `1px solid ${alpha(color.gold, 0.4)}`, fontSize: font.size.xs, color: color.textDark }}>
      <span style={{ fontWeight: font.weight.semibold, color: color.navy }}>移動の目安</span>
      <span>{label}</span>
      <span style={{ marginLeft: 'auto', color: color.textLight, fontSize: 10 }}>前後の予定との間を空けて調整</span>
    </div>
  );
}
