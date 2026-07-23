import React from 'react';
import { dora } from '../theme';

// 各メニューの「準備中」枠。叩き段階では全画面がこれを描画する。
// (Analytics 等の中身の作り込みは次段階で individual view に差し替える)

const META = {
  projects:     { title: 'Projects',     jp: '案件',           desc: '送付キャンペーン(案件)の一覧・進行状況をここで管理します。' },
  calls:        { title: 'Calls',        jp: 'フォロー架電',    desc: '着荷後のフォロー架電リストと通話ステータスをここで扱います。' },
  appointments: { title: 'Appointments', jp: 'アポイント',      desc: '獲得したアポイントの一覧・面談日程・進捗をここで管理します。' },
  companies:    { title: 'Companies',    jp: '送付先企業',      desc: '送付先企業の一覧・属性・反応状況をここで確認します。' },
  analytics:    { title: 'Analytics',    jp: 'アナリティクス',  desc: '送付〜アポのファネル、実効CPA、セグメント別パフォーマンスを可視化します。' },
  reports:      { title: 'Reports',      jp: 'レポート',        desc: '月次レポートの閲覧・ダウンロードをここで行います。' },
  members:      { title: 'Members',      jp: 'メンバー',        desc: '貴社側の閲覧メンバーと権限をここで管理します。' },
};

export default function PlaceholderView({ section }) {
  const m = META[section] || { title: section, jp: '', desc: '' };
  return (
    <div>
      {/* 見出し(小さめ・左上寄せ) */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: dora.space.sm, marginBottom: dora.space.lg }}>
        <h1 style={{
          margin: 0, fontFamily: dora.font.display, fontSize: 19, fontWeight: 700,
          color: dora.color.ink, letterSpacing: -0.1,
        }}>{m.title}</h1>
        {m.jp && <span style={{ fontSize: 12, color: dora.color.inkSoft, fontFamily: dora.font.body }}>{m.jp}</span>}
      </div>

      {/* 準備中カード */}
      <div style={{
        background: dora.color.surface, border: `1px solid ${dora.color.surfaceLine}`,
        borderRadius: dora.radius.lg, boxShadow: dora.shadow.card,
        padding: '56px 40px', textAlign: 'center',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: dora.space.lg,
      }}>
        {/* ブラウン→ブルーの署名バー */}
        <div style={{ width: 48, height: 4, borderRadius: dora.radius.pill, background: dora.gradient.brandBar }} />
        <div>
          <div style={{
            fontFamily: dora.font.display, fontSize: 17, fontWeight: 600,
            color: dora.color.ink, marginBottom: 8, letterSpacing: 0.2,
          }}>準備中</div>
          <p style={{ margin: 0, maxWidth: 460, fontSize: 14, lineHeight: 1.9, color: dora.color.inkMid }}>
            {m.desc}
          </p>
        </div>
        <span style={{
          fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
          color: dora.color.inkSoft, fontFamily: dora.font.display, fontWeight: 600,
        }}>Coming soon</span>
      </div>
    </div>
  );
}
