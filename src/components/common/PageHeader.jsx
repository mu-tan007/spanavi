import React from 'react';
import PageTitle from './PageTitle';

// Spanavi 全ページ共通の題名。2026-10-07 から白い帯をやめ、PageTitle と同じ形（帯なし・金の短い線）に統一。
// - title / description / right / children はそのまま
// - compact: 直下にタブが来るページ用（下の線と余白を省く）
// - bleed / eyebrow は旧い帯の名残。後方互換のため受け取るが使わない
export default function PageHeader({
  eyebrow, // eslint-disable-line no-unused-vars
  bleed, // eslint-disable-line no-unused-vars
  title,
  description,
  right,
  compact = false,
  children,
  style,
}) {
  return <PageTitle title={title} sub={description} right={right} compact={compact} style={style}>{children}</PageTitle>;
}
