import React, { useEffect, useMemo, useState } from 'react';
import { color, radius, font, alpha } from '../../constants/design';
import ScriptBody from './ScriptBody';

/**
 * ツリー型スクリプトのガイドモード（架電者向け閲覧）。
 *
 * - 今いるセクションだけ全文表示し、相手の反応ボタンで次のセクションへ進む
 * - 通過済みセクションは見出しだけ畳んで上に積む（クリックで展開・「ここからやり直す」可）
 * - 行き先のない反応は「終話」扱い
 * - resetKey が変わる（=次の企業に移る）と自動で最初に戻る
 *
 * @param tree     { version, startId, nodes: [{ id, name, talk, responses: [{label, nextId}] }] }
 * @param rebuttal アウト返しデータ（トーク内の [[Q:]] チップが参照）
 * @param resetKey 企業切替で変わるキー
 * @param style    フォントサイズ等
 */
export default function ScriptTreeGuide({ tree, rebuttal, resetKey, style = {} }) {
  const nodeMap = useMemo(() => new Map((tree?.nodes || []).map(n => [n.id, n])), [tree]);
  const startId = useMemo(() => {
    if (tree?.startId && nodeMap.has(tree.startId)) return tree.startId;
    return tree?.nodes?.[0]?.id || null;
  }, [tree, nodeMap]);

  const [path, setPath] = useState(() => (startId ? [startId] : []));
  const [ended, setEnded] = useState(null);      // { label } 終話に到達したとき
  const [openPassed, setOpenPassed] = useState(null); // 展開中の通過済みindex

  // 次の企業へ移ったら最初に戻る
  useEffect(() => {
    setPath(startId ? [startId] : []);
    setEnded(null);
    setOpenPassed(null);
  }, [resetKey, startId]);

  if (!startId) {
    return <div style={{ color: color.textLight, fontSize: font.size.sm, ...style }}>ツリー型スクリプトが未設定です</div>;
  }

  const currentId = path[path.length - 1];
  const current = nodeMap.get(currentId);
  const passed = path.slice(0, -1);

  const handleResponse = (resp) => {
    setOpenPassed(null);
    if (resp.nextId && nodeMap.has(resp.nextId)) {
      setPath(prev => [...prev, resp.nextId]);
    } else {
      setEnded({ label: resp.label });
    }
  };

  const rewindTo = (idx) => {
    setPath(prev => prev.slice(0, idx + 1));
    setEnded(null);
    setOpenPassed(null);
  };

  return (
    <div style={{ fontFamily: font.family.sans, ...style }}>
      {/* 最初からボタン（進んでいるときだけ） */}
      {(passed.length > 0 || ended) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <button type="button" onClick={() => rewindTo(0)}
            style={{
              background: 'transparent', border: `1px solid ${color.border}`,
              borderRadius: radius.pill, padding: '2px 10px', cursor: 'pointer',
              fontSize: '0.85em', color: color.textMid, fontFamily: font.family.sans,
            }}>
            ↺ 最初から
          </button>
        </div>
      )}

      {/* 通過済みセクション（畳み） */}
      {passed.map((id, idx) => {
        const node = nodeMap.get(id);
        if (!node) return null;
        const open = openPassed === idx;
        // この通過時に選んだ反応ラベル（次のpath要素への遷移に使ったもの）
        const nextInPath = path[idx + 1];
        const chosen = (node.responses || []).find(r => r.nextId === nextInPath)?.label || '';
        return (
          <div key={idx} style={{
            marginBottom: 4, borderRadius: radius.md, overflow: 'hidden',
            border: `1px solid ${color.borderLight || color.border}`,
            background: alpha(color.navyLight, 0.03),
          }}>
            <button type="button" onClick={() => setOpenPassed(open ? null : idx)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '5px 10px', textAlign: 'left',
                fontSize: '0.9em', color: color.textMid, fontFamily: font.family.sans,
              }}>
              <span style={{ flexShrink: 0 }}>{open ? '▾' : '▸'}</span>
              <span style={{ fontWeight: font.weight.semibold, color: color.textMid }}>{node.name || 'セクション'}</span>
              {chosen && (
                <span style={{ fontSize: '0.85em', color: color.textLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  → {chosen}
                </span>
              )}
              <span style={{ marginLeft: 'auto', fontSize: '0.8em', color: color.textLight, flexShrink: 0 }}>通過済</span>
            </button>
            {open && (
              <div style={{ padding: '8px 12px', borderTop: `1px dashed ${color.border}` }}>
                <ScriptBody text={node.talk || ''} rebuttal={rebuttal} style={{ lineHeight: 1.8 }} />
                <button type="button" onClick={() => rewindTo(idx)}
                  style={{
                    marginTop: 8, background: color.white, border: `1px solid ${color.navy}`,
                    borderRadius: radius.md, padding: '3px 12px', cursor: 'pointer',
                    fontSize: '0.85em', color: color.navy, fontWeight: font.weight.semibold,
                    fontFamily: font.family.sans,
                  }}>
                  ここからやり直す
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* 終話表示 */}
      {ended ? (
        <div style={{
          borderRadius: radius.md, border: `1px solid ${color.border}`,
          background: alpha(color.navyLight, 0.04), padding: '14px 16px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.95em', fontWeight: font.weight.semibold, color: color.navy, marginBottom: 4 }}>
            終話（{ended.label}）
          </div>
          <div style={{ fontSize: '0.85em', color: color.textMid }}>
            お疲れさまでした。架電結果を入力してください。
          </div>
        </div>
      ) : current ? (
        /* 現在のセクション */
        <div style={{
          borderRadius: radius.md, overflow: 'hidden',
          border: `1px solid ${alpha(color.navyLight, 0.45)}`,
          background: color.white,
        }}>
          <div style={{
            padding: '5px 12px', background: alpha(color.navyLight, 0.08),
            fontSize: '0.85em', fontWeight: font.weight.bold, color: color.navyDark,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          }}>
            <span>{current.name || 'セクション'}</span>
            <span style={{ fontSize: '0.85em', fontWeight: font.weight.normal, color: color.textLight }}>今ここ</span>
          </div>
          <div style={{ padding: '10px 14px' }}>
            <ScriptBody text={current.talk || ''} rebuttal={rebuttal} style={{ lineHeight: 1.8 }} />
          </div>
          {(current.responses || []).length > 0 && (
            <div style={{ padding: '8px 14px 12px', borderTop: `1px dashed ${color.border}` }}>
              <div style={{ fontSize: '0.82em', color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 6 }}>
                相手の反応は？
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(current.responses || []).map((r, i) => (
                  <button key={i} type="button" onClick={() => handleResponse(r)}
                    style={{
                      background: color.white,
                      border: `1px solid ${alpha(color.navyLight, 0.5)}`,
                      color: color.navyDark,
                      borderRadius: radius.pill,
                      padding: '6px 14px',
                      fontSize: '0.92em',
                      fontWeight: font.weight.semibold,
                      cursor: 'pointer',
                      fontFamily: font.family.sans,
                      lineHeight: 1.5,
                    }}>
                    {r.label || `反応${i + 1}`}
                    {(!r.nextId || !nodeMap.has(r.nextId)) && (
                      <span style={{ marginLeft: 4, fontSize: '0.8em', color: color.textLight, fontWeight: font.weight.normal }}>終話</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ color: color.textLight, fontSize: font.size.sm }}>セクションが見つかりません（ライブラリページで確認してください）</div>
      )}
    </div>
  );
}
