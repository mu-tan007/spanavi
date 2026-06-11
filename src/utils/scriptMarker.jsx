import React from 'react';

const MARKER_STYLE = 'background:linear-gradient(transparent 60%,#FFE066 60%);font-weight:700';

// アウト返しチップ [[Q:質問文]] の編集画面(contentEditable)内での見た目。
// contenteditable=false で「1文字のように丸ごと消せる」アトミックな部品にする。
const CHIP_STYLE = 'display:inline-block;background:#EFF6FF;border:1px solid rgba(30,64,175,0.35);color:#1E3A8A;border-radius:10px;padding:0 8px;font-size:0.85em;font-weight:600;margin:0 2px;line-height:1.6;user-select:none;cursor:default;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;vertical-align:baseline';

/**
 * アウト返しチップのDOM要素を生成（エディタへのカーソル挿入用）
 */
export function createChipElement(question) {
  const span = document.createElement('span');
  span.setAttribute('data-chip', '1');
  span.setAttribute('contenteditable', 'false');
  span.style.cssText = CHIP_STYLE;
  span.textContent = question;
  return span;
}

/**
 * ==テキスト== 構文をパースしてマーカーハイライト付きで描画する
 */
export function renderMarkedScript(text, style = {}) {
  if (!text) return null;
  // `s` (dotAll) フラグ: `.` を改行にもマッチさせ、複数行にまたがる ==marker== を拾う
  const parts = text.split(/(==[\s\S]+?==)/g);
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

// 分岐ブロック記法のエディタ内表示。生の {{分岐:...}} テキストだと読みづらいため、
// 構造行を色付きのアトミックな部品として描画する（本来の値は data-val 属性に保持し、
// fromHtml で記法テキストへ復元する）。ダブルクリックで名称変更（ScriptView側で対応）。
const BR_OPEN_STYLE = 'display:inline-block;background:rgba(212,160,23,0.12);border:1px solid rgba(212,160,23,0.55);color:#0D2247;border-radius:4px;padding:1px 10px;font-size:0.85em;font-weight:700;margin:2px 0;user-select:none;cursor:default';
const BR_OPT_STYLE = 'display:inline-block;background:#0D2247;color:#FFFFFF;border-radius:10px;padding:1px 12px;font-size:0.85em;font-weight:600;margin:2px 0;user-select:none;cursor:default';
const BR_CLOSE_STYLE = 'display:inline-block;background:rgba(13,34,71,0.05);border:1px dashed rgba(13,34,71,0.3);color:#6B7280;border-radius:4px;padding:0 8px;font-size:0.8em;margin:2px 0;user-select:none;cursor:default';

/**
 * ==text== / [[Q:...]] / {{分岐}} 構文 → contentEditable用HTML
 */
export function toHtml(text) {
  if (!text) return '';
  // `[\s\S]+?` で改行込みのテキストもマーカーとして拾えるようにする
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\{\{分岐:([^}\n]*)\}\}/g, `<span style="${BR_OPEN_STYLE}" data-br="open" data-val="$1" contenteditable="false" title="ダブルクリックで見出しを変更">⑂ 分岐: $1</span>`)
    .replace(/\{\{→:([^}\n]*)\}\}/g, `<span style="${BR_OPT_STYLE}" data-br="opt" data-val="$1" contenteditable="false" title="ダブルクリックで選択肢名を変更">→ $1</span>`)
    .replace(/\{\{\/分岐\}\}/g, `<span style="${BR_CLOSE_STYLE}" data-br="close" contenteditable="false">分岐ここまで（本流に戻る）</span>`)
    .replace(/\[\[Q:([\s\S]+?)\]\]/g, `<span style="${CHIP_STYLE}" data-chip="1" contenteditable="false">$1</span>`)
    .replace(/==([\s\S]+?)==/g, `<span style="${MARKER_STYLE}" data-marker="1">$1</span>`)
    .replace(/\n/g, '<br>');
}

/**
 * contentEditableのHTML → ==text== / [[Q:...]] / {{分岐}} 構文
 */
export function fromHtml(html) {
  // 分岐部品は表示テキストでなく data-val 属性から復元する
  let text = html.replace(/<span[^>]*data-br="open"[^>]*data-val="([^"]*)"[^>]*>[\s\S]*?<\/span>/gi, '{{分岐:$1}}');
  text = text.replace(/<span[^>]*data-br="opt"[^>]*data-val="([^"]*)"[^>]*>[\s\S]*?<\/span>/gi, '{{→:$1}}');
  text = text.replace(/<span[^>]*data-br="close"[^>]*>[\s\S]*?<\/span>/gi, '{{/分岐}}');
  // 改行を含むマーカー span も拾えるよう `[\s\S]*?` を使用
  text = text.replace(/<span[^>]*data-chip="1"[^>]*>([\s\S]*?)<\/span>/gi, '[[Q:$1]]');
  text = text.replace(/<span[^>]*data-marker="1"[^>]*>([\s\S]*?)<\/span>/gi, '==$1==');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/div>\s*<div[^>]*>/gi, '\n');
  text = text.replace(/<div[^>]*>/gi, '\n');
  text = text.replace(/<\/div>/gi, '');
  text = text.replace(/<\/p>\s*<p[^>]*>/gi, '\n');
  text = text.replace(/<p[^>]*>/gi, '\n');
  text = text.replace(/<\/p>/gi, '');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  if (text.startsWith('\n')) text = text.slice(1);
  return text;
}

/**
 * 選択テキストが既にマーカー付きかどうか判定
 */
export function isSelectionMarked(editorEl) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !editorEl) return false;
  const node = sel.anchorNode;
  const parent = node?.nodeType === 3 ? node.parentElement : node;
  return !!parent?.closest?.('[data-marker]');
}

/**
 * 選択テキストにマーカーを付ける
 */
export function applyMarker(editorEl) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  if (!editorEl?.contains(range.commonAncestorContainer)) return;
  const selectedText = range.toString();
  if (!selectedText.trim()) return;

  const span = document.createElement('span');
  span.style.cssText = MARKER_STYLE;
  span.setAttribute('data-marker', '1');
  range.surroundContents(span);
  sel.removeAllRanges();
}

/**
 * 選択テキストからマーカーを外す
 */
export function removeMarker(editorEl) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const node = sel.anchorNode;
  const parent = node?.nodeType === 3 ? node.parentElement : node;
  const markerSpan = parent?.closest?.('[data-marker]');
  if (markerSpan && editorEl?.contains(markerSpan)) {
    const text = document.createTextNode(markerSpan.textContent);
    markerSpan.parentNode.replaceChild(text, markerSpan);
    sel.removeAllRanges();
  }
}
