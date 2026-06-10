import React, { useMemo, useState } from 'react';
import { color, radius, font, alpha } from '../../constants/design';

// アウト返しデータ { reception: [{q,a}], president: [{q,a}] } をフラットな配列に変換。
// チップの回答検索と即時検索の両方で使う。
export function flattenRebuttal(rebuttal) {
  if (!rebuttal) return [];
  const out = [];
  (rebuttal.reception || []).forEach(it => {
    if ((it.q || '').trim()) out.push({ q: it.q.trim(), a: it.a || '', cat: '受付対応' });
  });
  (rebuttal.president || []).forEach(it => {
    if ((it.q || '').trim()) out.push({ q: it.q.trim(), a: it.a || '', cat: 'キーマン対応' });
  });
  return out;
}

// チップの質問文 → アウト返し回答を検索（完全一致 → 部分一致の順）。
// チップ挿入後にQ&A側の文言を少し直しても、なるべく追従できるようにする。
function findAnswer(items, question) {
  const q = (question || '').trim();
  if (!q) return null;
  const exact = items.find(it => it.q === q);
  if (exact) return exact;
  return items.find(it => it.q.includes(q) || q.includes(it.q)) || null;
}

/**
 * スクリプト本文の描画（閲覧用）。
 * - ==テキスト== : 黄色マーカー
 * - [[Q:質問文]] : アウト返しチップ。クリックでその場に回答をアコーディオン展開
 *
 * @param text     スクリプト本文（記法込み）
 * @param rebuttal アウト返しデータ（リスト別 rebuttal_data か共通 qa_data）
 * @param style    フォントサイズ等（チップは em 指定で追従）
 */
export default function ScriptBody({ text, rebuttal, style = {} }) {
  const items = useMemo(() => flattenRebuttal(rebuttal), [rebuttal]);
  const [openKey, setOpenKey] = useState(null);
  if (!text) return null;

  const parts = text.split(/(==[\s\S]+?==|\[\[Q:[\s\S]+?\]\])/g);
  return (
    <div style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: font.family.sans, ...style }}>
      {parts.map((part, i) => {
        if (part.startsWith('==') && part.endsWith('==') && part.length > 4) {
          return (
            <span key={i} style={{ background: 'linear-gradient(transparent 60%, #FFE066 60%)', fontWeight: 700 }}>
              {part.slice(2, -2)}
            </span>
          );
        }
        if (part.startsWith('[[Q:') && part.endsWith(']]') && part.length > 6) {
          const q = part.slice(4, -2);
          const open = openKey === i;
          const hit = findAnswer(items, q);
          return (
            <React.Fragment key={i}>
              <button
                type="button"
                onClick={() => setOpenKey(open ? null : i)}
                style={{
                  display: 'inline-block',
                  background: open ? color.navy : alpha(color.info, 0.08),
                  border: `1px solid ${open ? color.navy : alpha(color.navyLight, 0.4)}`,
                  color: open ? color.white : color.navyDark,
                  borderRadius: radius.pill,
                  padding: '3px 12px',
                  fontSize: '0.92em',
                  fontWeight: font.weight.semibold,
                  margin: '1px 2px',
                  cursor: 'pointer',
                  fontFamily: font.family.sans,
                  lineHeight: 1.5,
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  verticalAlign: 'baseline',
                }}
              >
                {open ? '▴' : '▾'} {q}
              </button>
              {open && (
                <span style={{
                  display: 'block',
                  margin: '4px 0 6px',
                  padding: '8px 12px',
                  borderRadius: radius.md,
                  background: alpha(color.navyLight, 0.06),
                  borderLeft: `3px solid ${color.navy}`,
                }}>
                  {hit ? (
                    <>
                      <span style={{ display: 'block', fontSize: '0.82em', color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 2 }}>
                        {hit.cat}
                      </span>
                      <span style={{ display: 'block', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                        A: {hit.a}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: color.textLight, fontStyle: 'italic' }}>
                      この質問のアウト返しが見つかりません（ライブラリページのアウト返しに登録してください）
                    </span>
                  )}
                </span>
              )}
            </React.Fragment>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </div>
  );
}
