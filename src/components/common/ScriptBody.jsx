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

const isChipPart = (p) => typeof p === 'string' && p.startsWith('[[Q:') && p.endsWith(']]') && p.length > 6;
const isMarkerPart = (p) => typeof p === 'string' && p.startsWith('==') && p.endsWith('==') && p.length > 4;

// インライン部分（マーカー/チップ/テキスト）をトークン列に変換。
// 空白のみを挟んで連続するチップは1グループにまとめる
// （同じ箇所に複数チップを置いたとき、横並びのピルだと読みづらいため縦リスト化する）。
function tokenize(text) {
  const parts = text.split(/(==[\s\S]+?==|\[\[Q:[\s\S]+?\]\])/g);
  const tokens = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (isChipPart(part)) {
      const qs = [part.slice(4, -2)];
      let j = i + 1;
      while (j + 1 < parts.length && /^[\s ]*$/.test(parts[j]) && isChipPart(parts[j + 1])) {
        qs.push(parts[j + 1].slice(4, -2));
        j += 2;
      }
      tokens.push({ type: 'chips', qs });
      i = j - 1;
    } else if (isMarkerPart(part)) {
      tokens.push({ type: 'marker', text: part.slice(2, -2) });
    } else if (part) {
      tokens.push({ type: 'text', text: part });
    }
  }
  return tokens;
}

// 本文を「通常部分」と「分岐ブロック」に分割する。
// {{分岐:見出し}} {{→:選択肢}}トーク... {{/分岐}} 記法。
function parseSegments(text) {
  const segs = [];
  const re = /\{\{分岐:([^}\n]*)\}\}([\s\S]*?)\{\{\/分岐\}\}/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) segs.push({ type: 'plain', text: text.slice(last, m.index) });
    const body = m[2];
    // split: [前置き, label1, content1, label2, content2, ...]
    const parts = body.split(/\{\{→:([^}\n]*)\}\}/g);
    const options = [];
    for (let i = 1; i < parts.length; i += 2) {
      options.push({
        label: (parts[i] || '').trim(),
        content: (parts[i + 1] || '').replace(/^\n/, '').replace(/\n+$/, ''),
      });
    }
    segs.push({ type: 'branch', title: (m[1] || '').trim(), options });
    last = re.lastIndex;
    // ブロック直後の改行は二重改行になるため1つだけ食う
    if (text[last] === '\n') last += 1;
  }
  if (last < text.length) segs.push({ type: 'plain', text: text.slice(last) });
  return segs;
}

function AnswerPanel({ hit, block = false }) {
  return (
    <span style={{
      display: 'block',
      margin: block ? 0 : '4px 0 6px',
      padding: '8px 12px',
      background: alpha(color.navyLight, 0.06),
      borderLeft: `3px solid ${color.navy}`,
      borderRadius: block ? 0 : radius.md,
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
  );
}

// マーカー/チップ入りのインラインテキストを描画（チップの開閉stateは内部管理）。
// 分岐ブロックの中身でも使うため独立コンポーネントにしている。
function InlineTokens({ text, items }) {
  const tokens = useMemo(() => (text ? tokenize(text) : []), [text]);
  const [openKey, setOpenKey] = useState(null);
  return (
    <>
      {tokens.map((tok, i) => {
        if (tok.type === 'marker') {
          return (
            <span key={i} style={{ background: 'linear-gradient(transparent 60%, #FFE066 60%)', fontWeight: 700 }}>
              {tok.text}
            </span>
          );
        }
        if (tok.type === 'chips') {
          // 単独チップ: インラインのピル
          if (tok.qs.length === 1) {
            const q = tok.qs[0];
            const key = `${i}:0`;
            const open = openKey === key;
            const hit = findAnswer(items, q);
            return (
              <React.Fragment key={i}>
                <button
                  type="button"
                  onClick={() => setOpenKey(open ? null : key)}
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
                {open && <AnswerPanel hit={hit} />}
              </React.Fragment>
            );
          }
          // 複数チップ: 縦リストのブロック
          return (
            <span key={i} style={{
              display: 'block',
              margin: '6px 0',
              border: `1px solid ${alpha(color.navyLight, 0.3)}`,
              borderRadius: radius.md,
              overflow: 'hidden',
              background: color.white,
            }}>
              {tok.qs.map((q, k) => {
                const key = `${i}:${k}`;
                const open = openKey === key;
                const hit = findAnswer(items, q);
                return (
                  <React.Fragment key={k}>
                    <button
                      type="button"
                      onClick={() => setOpenKey(open ? null : key)}
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 6,
                        width: '100%',
                        textAlign: 'left',
                        background: open ? color.navy : alpha(color.info, 0.05),
                        border: 'none',
                        borderTop: k > 0 ? `1px solid ${alpha(color.navyLight, 0.2)}` : 'none',
                        color: open ? color.white : color.navyDark,
                        padding: '6px 12px',
                        fontSize: '0.92em',
                        fontWeight: font.weight.semibold,
                        cursor: 'pointer',
                        fontFamily: font.family.sans,
                        lineHeight: 1.5,
                      }}
                    >
                      <span style={{ flexShrink: 0 }}>{open ? '▴' : '▾'}</span>
                      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'normal' }}>{q}</span>
                    </button>
                    {open && <AnswerPanel hit={hit} block />}
                  </React.Fragment>
                );
              })}
            </span>
          );
        }
        return <React.Fragment key={i}>{tok.text}</React.Fragment>;
      })}
    </>
  );
}

// 反応分岐ブロック: 相手の反応に応じた選択肢ボタンを横並びで出し、
// 押した選択肢のトークだけをその場に展開する（1階層・本流復帰の割り切り）。
function BranchBlock({ title, options, items }) {
  const [selected, setSelected] = useState(null);
  return (
    <span style={{
      display: 'block',
      margin: '8px 0',
      border: `1px solid ${alpha(color.gold, 0.55)}`,
      borderRadius: radius.md,
      overflow: 'hidden',
      background: color.white,
    }}>
      <span style={{
        display: 'block',
        padding: '4px 12px',
        background: alpha(color.gold, 0.12),
        fontSize: '0.82em',
        fontWeight: font.weight.semibold,
        color: color.navyDark,
        letterSpacing: 0.3,
      }}>
        ⑂ {title || '相手の反応で分岐'}
      </span>
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 12px' }}>
        {options.map((opt, i) => {
          const active = selected === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(active ? null : i)}
              style={{
                background: active ? color.navy : color.white,
                border: `1px solid ${active ? color.navy : alpha(color.navyLight, 0.45)}`,
                color: active ? color.white : color.navyDark,
                borderRadius: radius.pill,
                padding: '5px 14px',
                fontSize: '0.92em',
                fontWeight: font.weight.semibold,
                cursor: 'pointer',
                fontFamily: font.family.sans,
                lineHeight: 1.5,
              }}
            >
              {opt.label || `選択肢${i + 1}`}
            </button>
          );
        })}
      </span>
      {selected != null && options[selected] && (
        <span style={{
          display: 'block',
          padding: '10px 14px',
          borderTop: `1px solid ${alpha(color.navyLight, 0.2)}`,
          background: alpha(color.navyLight, 0.04),
          whiteSpace: 'pre-wrap',
          lineHeight: 1.8,
        }}>
          <InlineTokens text={options[selected].content} items={items} />
        </span>
      )}
    </span>
  );
}

/**
 * スクリプト本文の描画（閲覧用）。
 * - ==テキスト== : 黄色マーカー
 * - [[Q:質問文]] : アウト返しチップ。クリックでその場に回答をアコーディオン展開
 *   （連続して複数置くと縦リストのブロックにまとまる）
 * - {{分岐:見出し}} {{→:選択肢}}トーク {{/分岐}} : 反応分岐。
 *   選択肢ボタンを押すとその選択肢のトークだけ展開（中でマーカー/チップも使用可）
 *
 * @param text     スクリプト本文（記法込み）
 * @param rebuttal アウト返しデータ（リスト別 rebuttal_data か共通 qa_data）
 * @param style    フォントサイズ等（チップは em 指定で追従）
 */
export default function ScriptBody({ text, rebuttal, style = {} }) {
  const items = useMemo(() => flattenRebuttal(rebuttal), [rebuttal]);
  const segments = useMemo(() => (text ? parseSegments(text) : []), [text]);
  if (!text) return null;

  return (
    <div style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: font.family.sans, ...style }}>
      {segments.map((seg, i) => (
        seg.type === 'branch'
          ? <BranchBlock key={i} title={seg.title} options={seg.options} items={items} />
          : <InlineTokens key={i} text={seg.text} items={items} />
      ))}
    </div>
  );
}
