import React from 'react';

const MARKER_STYLE = 'background:linear-gradient(transparent 60%,#FFE066 60%);font-weight:700';

/**
 * ==テキスト== 構文をパースしてマーカーハイライト付きで描画する
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

/**
 * ==text== 構文 → contentEditable用HTML
 */
export function toHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/==(.+?)==/g, `<span style="${MARKER_STYLE}" data-marker="1">$1</span>`)
    .replace(/\n/g, '<br>');
}

/**
 * contentEditableのHTML → ==text== 構文
 */
export function fromHtml(html) {
  let text = html.replace(/<span[^>]*data-marker="1"[^>]*>(.*?)<\/span>/gi, '==$1==');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/div>\s*<div[^>]*>/gi, '\n');
  text = text.replace(/<div[^>]*>/gi, '\n');
  text = text.replace(/<\/div>/gi, '');
  text = text.replace(/<\/p>\s*<p[^>]*>/gi, '\n');
  text = text.replace(/<p[^>]*>/gi, '\n');
  text = text.replace(/<\/p>/gi, '');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
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
