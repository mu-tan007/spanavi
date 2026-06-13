import React from 'react';
import { color, space, font } from '../../../../constants/design';

// 分析レポート内のカテゴリ見出し（「進捗」「事後課題」など）
export default function SectionTitle({ label, hint }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'baseline',
      gap: space[3],
      marginTop: space[5],
      marginBottom: space[3],
      paddingLeft: 2,
    }}>
      <div style={{
        fontSize: font.size.md,
        fontWeight: font.weight.bold,
        color: color.navy,
        letterSpacing: font.letterSpacing.tight,
      }}>
        {label}
      </div>
      {hint && (
        <div style={{
          fontSize: font.size.xs,
          color: color.textLight,
        }}>
          {hint}
        </div>
      )}
    </div>
  );
}
