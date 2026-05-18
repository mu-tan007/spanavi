import React from 'react';
import { color, space, font, radius } from '../../../../constants/design';

// 仕様書: tasks/spacareer-spec.md §6.1 基本情報（マイページ）
// 参考: イメージ画像⑦
// Phase 3 並列実装エージェント #1 が中身を実装
export default function ClientMyPageView() {
  return (
    <div style={{ padding: space[4] }}>
      <h1 style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[2] }}>マイページ</h1>
      <p style={{ fontSize: font.size.sm, color: color.textMid, marginBottom: space[4] }}>自分の成長を可視化し、目標に向かって一歩ずつ進んでいきましょう。</p>
      <div style={{ padding: space[6], background: color.white, borderRadius: radius.lg, border: `1px solid ${color.border}` }}>
        <p style={{ color: color.textLight, fontSize: font.size.sm }}>準備中（Phase 3 並列実装で中身を構築）</p>
      </div>
    </div>
  );
}
