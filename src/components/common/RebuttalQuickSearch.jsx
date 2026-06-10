import React, { useMemo, useState } from 'react';
import { color, radius, font, alpha } from '../../constants/design';
import { Input } from '../ui';
import { flattenRebuttal } from './ScriptBody';

// 架電集中画面スクリプトタブ用の「アウト返し即時検索」。
// 想定外の質問が来たとき、タブを切り替えずにキーワードでQ&Aを引けるようにする。
export default function RebuttalQuickSearch({ rebuttal, compact = false }) {
  const [query, setQuery] = useState('');
  const items = useMemo(() => flattenRebuttal(rebuttal), [rebuttal]);

  if (!items.length) return null;

  const q = query.trim().toLowerCase();
  const hits = q
    ? items.filter(it => (it.q + ' ' + it.a).toLowerCase().includes(q)).slice(0, 8)
    : [];

  return (
    <div style={{ marginBottom: compact ? 6 : 10 }}>
      <Input
        size="sm"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="アウト返しを検索（想定外の質問が来たら入力）"
        style={{ fontSize: compact ? font.size.xs : font.size.sm }}
      />
      {q && (
        <div style={{ marginTop: 4 }}>
          {hits.length === 0 ? (
            <div style={{ fontSize: compact ? font.size.xs : font.size.sm, color: color.textLight, padding: '4px 2px' }}>
              該当するアウト返しがありません
            </div>
          ) : hits.map((it, i) => (
            <div key={i} style={{
              marginBottom: 4,
              padding: compact ? '4px 8px' : '6px 10px',
              borderRadius: radius.md,
              background: alpha(color.navyLight, 0.05),
              borderLeft: `3px solid ${color.navy}`,
            }}>
              <div style={{ fontSize: compact ? font.size.xs - 1 : font.size.xs, color: color.textLight, fontWeight: font.weight.semibold }}>
                {it.cat}　Q: {it.q}
              </div>
              <div style={{ fontSize: compact ? font.size.xs : font.size.sm, color: color.navyDeep, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                A: {it.a}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
