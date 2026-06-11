import React, { useEffect, useMemo, useRef, useState } from 'react';
import { color, radius, font, alpha } from '../../constants/design';
import ScriptBody from './ScriptBody';

/**
 * ツリー型スクリプトのガイド表示（架電者向け・トーナメント表形式）。
 *
 * - 全セクション・全反応・全返しを最初から展開して表示する
 * - 相手から実際に言われた反応をクリックすると、その行が強調表示され
 *   「今どの経路を進んでいるか」を見失わない（再クリックで解除）
 * - 行き先のある反応をクリックすると、該当セクションへ自動スクロール
 * - resetKey が変わる（=次の企業に移る）とハイライトを自動クリア
 * - セクション見出しクリックで折りたたみ可（デフォルト全展開）
 *
 * セクション = { id, name, talk, responses }
 * 反応       = { label, answer(こちらの返し), children(入れ子の反応), nextId }
 */
export default function ScriptTreeGuide({ tree, rebuttal, resetKey, style = {} }) {
  const nodes = tree?.nodes || [];
  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  const startId = (tree?.startId && nodeMap.has(tree.startId)) ? tree.startId : (nodes[0]?.id || null);

  // クリックでハイライトした反応のキー集合（経路をマークしていく）
  const [marked, setMarked] = useState(() => new Set());
  // 折りたたんだセクションID集合（デフォルト全展開）
  const [collapsed, setCollapsed] = useState(() => new Set());
  const sectionRefs = useRef({});

  useEffect(() => {
    setMarked(new Set());
    setCollapsed(new Set());
  }, [resetKey]);

  if (!nodes.length) {
    return <div style={{ color: color.textLight, fontSize: font.size.sm, ...style }}>ツリー型スクリプトが未設定です</div>;
  }

  const toggleMark = (key, nextId) => {
    setMarked(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    // 行き先セクションへスクロール（マークON時のみ）
    if (nextId && nodeMap.has(nextId) && !marked.has(key)) {
      // 折りたたまれていたら開く
      setCollapsed(prev => {
        if (!prev.has(nextId)) return prev;
        const next = new Set(prev);
        next.delete(nextId);
        return next;
      });
      setTimeout(() => {
        sectionRefs.current[nextId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  };

  // 反応ツリーを再帰描画（トーナメント表のようにインデント＋縦線で枝を表現）。
  // 色のルール: 相手=紺系 / こちらの返し=金系 で話者を色分けし、
  // 同じ深さ（同列の選択肢）は同じ濃さ、深くなるほど薄くしていく。
  const navyFade = (depth) => Math.max(0.04, 0.16 - depth * 0.045);
  const navyBorderFade = (depth) => Math.max(0.18, 0.55 - depth * 0.12);
  const goldFade = (depth) => Math.max(0.05, 0.17 - depth * 0.045);
  const renderResponses = (nodeId, resps, basePath, depth) => resps.map((r, ri) => {
    const p = [...basePath, ri];
    const key = `${nodeId}:${p.join('.')}`;
    const isMarked = marked.has(key);
    const hasChildren = (r.children || []).length > 0;
    const nextNode = (!hasChildren && r.nextId && nodeMap.has(r.nextId)) ? nodeMap.get(r.nextId) : null;
    const isEnd = !hasChildren && !nextNode;
    return (
      <div key={ri} style={{
        marginTop: 4,
        marginLeft: depth ? 16 : 0,
        borderLeft: depth ? `2px solid ${alpha(color.navyLight, navyBorderFade(depth) * 0.6)}` : 'none',
        paddingLeft: depth ? 10 : 0,
      }}>
        {/* 相手の反応（紺系・クリックで強調） */}
        <button
          type="button"
          onClick={() => toggleMark(key, !hasChildren ? r.nextId : null)}
          title={isMarked ? 'クリックで強調を解除' : '相手にこう言われたらクリックして経路をマーク'}
          style={{
            display: 'flex', alignItems: 'baseline', gap: 6, width: '100%',
            textAlign: 'left', cursor: 'pointer',
            background: isMarked ? color.navy : alpha(color.navyLight, navyFade(depth)),
            border: `1px solid ${isMarked ? color.navy : alpha(color.navyLight, navyBorderFade(depth))}`,
            color: isMarked ? color.white : color.navyDark,
            borderRadius: radius.md,
            padding: '4px 10px',
            fontSize: '0.92em',
            fontWeight: font.weight.semibold,
            fontFamily: font.family.sans,
            lineHeight: 1.5,
          }}
        >
          <span style={{
            flexShrink: 0, fontSize: '0.78em', fontWeight: font.weight.semibold,
            color: isMarked ? alpha(color.white, 0.75) : color.navyLight,
          }}>相手</span>
          <span style={{ flex: 1, minWidth: 0, whiteSpace: 'normal' }}>{r.label || `反応${ri + 1}`}</span>
          {nextNode && (
            <span style={{ flexShrink: 0, fontSize: '0.82em', fontWeight: font.weight.normal, color: isMarked ? alpha(color.white, 0.8) : color.navyLight }}>
              → {nextNode.name}
            </span>
          )}
          {isEnd && (
            <span style={{ flexShrink: 0, fontSize: '0.82em', fontWeight: font.weight.normal, color: isMarked ? alpha(color.white, 0.7) : color.textLight }}>
              → 終話
            </span>
          )}
        </button>
        {/* こちらの返し（金系・深さで薄く） */}
        {(r.answer || '').trim() && (
          <div style={{
            margin: '3px 0 0 10px',
            padding: '5px 10px',
            background: alpha(color.gold, isMarked ? 0.2 : goldFade(depth)),
            borderLeft: `3px solid ${alpha(color.gold, isMarked ? 0.95 : Math.max(0.35, 0.85 - depth * 0.15))}`,
            borderRadius: radius.sm,
            display: 'flex', gap: 6, alignItems: 'baseline',
          }}>
            <span style={{ flexShrink: 0, fontSize: '0.78em', fontWeight: font.weight.semibold, color: '#A87E0E' }}>返し</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <ScriptBody text={r.answer} rebuttal={rebuttal} style={{ lineHeight: 1.7 }} />
            </span>
          </div>
        )}
        {/* 入れ子の反応 */}
        {hasChildren && renderResponses(nodeId, r.children, p, depth + 1)}
      </div>
    );
  });

  return (
    <div style={{ fontFamily: font.family.sans, ...style }}>
      {nodes.map(node => {
        const isCollapsed = collapsed.has(node.id);
        const isStart = node.id === startId;
        return (
          <div
            key={node.id}
            ref={el => { if (el) sectionRefs.current[node.id] = el; }}
            style={{
              marginBottom: 8, borderRadius: radius.md, overflow: 'hidden',
              border: `1px solid ${alpha(color.navyLight, 0.4)}`,
              background: color.white,
            }}
          >
            <button
              type="button"
              onClick={() => setCollapsed(prev => {
                const next = new Set(prev);
                if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
                return next;
              })}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '5px 12px', cursor: 'pointer', textAlign: 'left',
                background: alpha(color.navyLight, 0.08), border: 'none',
                fontSize: '0.88em', fontWeight: font.weight.bold, color: color.navyDark,
                fontFamily: font.family.sans,
              }}
            >
              <span style={{ flexShrink: 0, fontSize: '0.85em', color: color.textLight }}>{isCollapsed ? '▸' : '▾'}</span>
              <span>{node.name || 'セクション'}</span>
              {isStart && (
                <span style={{
                  fontSize: '0.75em', fontWeight: font.weight.semibold, color: color.navyLight,
                  border: `1px solid ${alpha(color.navyLight, 0.45)}`, borderRadius: radius.pill,
                  padding: '0 8px', flexShrink: 0,
                }}>スタート</span>
              )}
            </button>
            {!isCollapsed && (
              <div style={{ padding: '8px 12px 10px' }}>
                {(node.talk || '').trim() && (
                  <div style={{ marginBottom: (node.responses || []).length ? 6 : 0 }}>
                    <ScriptBody text={node.talk} rebuttal={rebuttal} style={{ lineHeight: 1.8 }} />
                  </div>
                )}
                {(node.responses || []).length > 0 && renderResponses(node.id, node.responses, [], 0)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
