import React from 'react';
import { color, space, radius, font } from '../../../../constants/design';
import { Card, Badge } from '../../../ui';

// コース管理（仕様書 §7.8）
// 現状は単一コースのみ。将来コース追加の可能性は別途検討。
// 第0回（キックオフ）〜第8回 の構成を閲覧表示する。
export default function CourseManagement() {
  const sessions = [
    { round: 0, label: 'キックオフ（第0回）', note: '受講開始オリエンテーション' },
    { round: 1, label: '第1回', note: '生い立ち／動機／ゴール設計' },
    { round: 2, label: '第2回', note: '強み診断 / 価値観整理' },
    { round: 3, label: '第3回', note: '返金保証カットオフ' },
    { round: 4, label: '第4回', note: '権限切替（中盤フェーズ）' },
    { round: 5, label: '第5回', note: '実践フェーズ前半' },
    { round: 6, label: '第6回', note: '実践フェーズ後半' },
    { round: 7, label: '第7回', note: '総仕上げ' },
    { round: 8, label: '第8回', note: '卒業セッション' },
  ];

  return (
    <Card padding="md" title="コース管理"
          description="現状は単一コース（全9回：第0回キックオフ＋第1〜8回セッション）。コース追加・並べ替えは未対応。">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {sessions.map(s => (
          <div key={s.round} style={{
            display: 'grid',
            gridTemplateColumns: '60px 200px 1fr auto',
            gap: space[3],
            alignItems: 'center',
            padding: `${space[2]}px ${space[3]}px`,
            background: s.round === 3 || s.round === 4 ? color.cream : color.white,
            border: `1px solid ${color.borderLight}`,
            borderRadius: radius.md,
            fontSize: font.size.sm,
          }}>
            <div style={{
              fontFamily: font.family.mono,
              fontWeight: font.weight.bold,
              color: color.navy,
              fontVariantNumeric: 'tabular-nums',
              textAlign: 'center',
            }}>
              {s.round}
            </div>
            <div style={{
              fontWeight: font.weight.semibold,
              color: color.textDark,
            }}>
              {s.label}
            </div>
            <div style={{ color: color.textMid }}>
              {s.note}
            </div>
            {s.round === 3 && <Badge variant="warn" dot>返金保証</Badge>}
            {s.round === 4 && <Badge variant="info" dot>権限切替</Badge>}
            {s.round === 8 && <Badge variant="success" dot>卒業</Badge>}
            {s.round === 0 && <Badge variant="primary" dot>キックオフ</Badge>}
          </div>
        ))}
      </div>
    </Card>
  );
}
