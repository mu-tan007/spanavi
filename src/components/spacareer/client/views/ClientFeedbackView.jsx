import React from 'react';
import { color, space, font, radius } from '../../../../constants/design';

// 仕様書: tasks/spacareer-spec.md §6.3 セッション感想
// 参考: イメージ画像②
// Phase 3 並列実装エージェント #1 が中身を実装
export default function ClientFeedbackView() {
  return (
    <div style={{ padding: space[4] }}>
      <h1 style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[2] }}>セッション感想</h1>
      <p style={{ fontSize: font.size.sm, color: color.textMid, marginBottom: space[4] }}>いただいたご意見は、今後のセッション改善やより良いサポートの提供に活用させていただきます。</p>
      <div style={{ padding: space[6], background: color.white, borderRadius: radius.lg, border: `1px solid ${color.border}` }}>
        <p style={{ color: color.textLight, fontSize: font.size.sm }}>準備中（Phase 3 並列実装で中身を構築）</p>
      </div>
    </div>
  );
}
