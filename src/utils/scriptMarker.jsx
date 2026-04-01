import React from 'react';

/**
 * ==テキスト== 構文をパースしてマーカーハイライト付きで描画する
 * @param {string} text - スクリプトテキスト
 * @param {object} [style] - ベースのテキストスタイル
 * @returns {React.ReactNode}
 */
export function renderMarkedScript(text, style = {}) {
  if (!text) return null;
  const parts = text.split(/(==.+?==)/g);
  return (
    <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: "'Noto Sans JP', sans-serif", ...style }}>
      {parts.map((part, i) => {
        if (part.startsWith('==') && part.endsWith('==') && part.length > 4) {
          return (
            <span key={i} style={{ background: 'linear-gradient(transparent 60%, #FFE066 60%)', fontWeight: 700 }}>
              {part.slice(2, -2)}
            </span>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </pre>
  );
}
