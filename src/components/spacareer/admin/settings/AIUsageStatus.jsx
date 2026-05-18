import React from 'react';
import { color, space, radius, font } from '../../../../constants/design';
import { Card } from '../../../ui';
import AICostTab from '../analytics/AICostTab';

// 設定 > AI利用状況セクション
// 分析レポートのAIコストタブと同データを表示（仕様書 §7.8 AI利用状況セクション）。
// AICostTab を直接埋め込んで再利用。
export default function AIUsageStatus() {
  return (
    <Card padding="md" title="AI利用状況"
          description="分析レポートのAIコストタブと同データ。運用調整・コスト管理用。">
      <div style={{
        marginBottom: space[4],
        padding: space[3],
        background: color.cream,
        border: `1px dashed ${color.border}`,
        borderRadius: radius.md,
        fontSize: font.size.xs,
        color: color.textMid,
      }}>
        ※ AI機能（議事録／30項目／フレーズ抽出／強み診断／今日のひとこと／ソーシャルスタイル）の
        利用量・費用・成功率を確認できます。データソースは <code style={{ fontFamily: font.family.mono, color: color.navy }}>spacareer_ai_usage_logs</code>。
      </div>
      <AICostTab preset="last30" />
    </Card>
  );
}
