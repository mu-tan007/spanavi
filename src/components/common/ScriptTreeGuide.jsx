import React, { useEffect, useMemo, useState } from 'react';
import { color, radius, font, alpha } from '../../constants/design';
import ScriptBody from './ScriptBody';

/**
 * ツリー型スクリプトのガイドモード（架電者向け閲覧）。
 *
 * セクション = { id, name, talk, responses }
 * 反応       = { label(相手の言葉), answer(こちらの返し・任意),
 *               children(さらに相手の反応・任意), nextId(次セクション/null=終話) }
 *
 * - 今いるセクションだけ表示し、反応ボタン→返し→さらに反応…と入れ子で進む
 * - 入れ子の終点で「次のセクションへ」or 終話
 * - 通過済みセクションは畳んで上に積む（展開・「ここからやり直す」可）
 * - resetKey が変わる（=次の企業に移る）と自動で最初に戻る
 */
export default function ScriptTreeGuide({ tree, rebuttal, resetKey, style = {} }) {
  const nodeMap = useMemo(() => new Map((tree?.nodes || []).map(n => [n.id, n])), [tree]);
  const startId = useMemo(() => {
    if (tree?.startId && nodeMap.has(tree.startId)) return tree.startId;
    return tree?.nodes?.[0]?.id || null;
  }, [tree, nodeMap]);

  // path: 通過してきたセクション [{ nodeId, via }] via=前のセクションでの選択経路ラベル
  // chain: 現在のセクション内で選んだ反応のインデックス経路
  const [path, setPath] = useState(() => (startId ? [{ nodeId: startId, via: null }] : []));
  const [chain, setChain] = useState([]);
  const [ended, setEnded] = useState(null);      // { label } 終話に到達
  const [openPassed, setOpenPassed] = useState(null);

  useEffect(() => {
    setPath(startId ? [{ nodeId: startId, via: null }] : []);
    setChain([]);
    setEnded(null);
    setOpenPassed(null);
  }, [resetKey, startId]);

  if (!startId) {
    return <div style={{ color: color.textLight, fontSize: font.size.sm, ...style }}>ツリー型スクリプトが未設定です</div>;
  }

  const currentId = path[path.length - 1]?.nodeId;
  const current = nodeMap.get(currentId);
  const passed = path.slice(0, -1);

  // chain を現在ノードの反応ツリーに解決
  const chainResps = [];
  {
    let arr = current?.responses || [];
    for (const idx of chain) {
      const r = arr[idx];
      if (!r) break;
      chainResps.push(r);
      arr = r.children || [];
    }
  }
  const lastResp = chainResps[chainResps.length - 1] || null;
  const currentChoices = lastResp ? (lastResp.children || []) : (current?.responses || []);
  const chainSummary = (extra) => [...chainResps.map(r => r.label), ...(extra ? [extra] : [])].filter(Boolean).join(' › ');

  const advanceTo = (nextId, viaLabel) => {
    setPath(prev => [...prev, { nodeId: nextId, via: viaLabel }]);
    setChain([]);
    setOpenPassed(null);
  };

  const choose = (resp) => {
    const idx = currentChoices.indexOf(resp);
    const hasChildren = (resp.children || []).length > 0;
    const hasAnswer = (resp.answer || '').trim();
    if (!hasChildren && !hasAnswer) {
      // 返しも続きも無い反応: 即遷移 or 終話（旧データ互換）
      if (resp.nextId && nodeMap.has(resp.nextId)) advanceTo(resp.nextId, chainSummary(resp.label));
      else setEnded({ label: chainSummary(resp.label) || resp.label });
      return;
    }
    setChain(prev => [...prev, idx]);
  };

  const rewindTo = (idx) => {
    setPath(prev => prev.slice(0, idx + 1));
    setChain([]);
    setEnded(null);
    setOpenPassed(null);
  };

  // チェーン終端の遷移ボタン（子が無く、返しを見せた後）
  const terminal = lastResp && (lastResp.children || []).length === 0 ? lastResp : null;
  const terminalNext = terminal && terminal.nextId && nodeMap.has(terminal.nextId) ? nodeMap.get(terminal.nextId) : null;

  return (
    <div style={{ fontFamily: font.family.sans, ...style }}>
      {(passed.length > 0 || ended || chain.length > 0) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 4 }}>
          {chain.length > 0 && !ended && (
            <button type="button" onClick={() => setChain(prev => prev.slice(0, -1))}
              style={{
                background: 'transparent', border: `1px solid ${color.border}`,
                borderRadius: radius.pill, padding: '2px 10px', cursor: 'pointer',
                fontSize: '0.85em', color: color.textMid, fontFamily: font.family.sans,
              }}>
              ← 1つ戻る
            </button>
          )}
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
      {passed.map((entry, idx) => {
        const node = nodeMap.get(entry.nodeId);
        if (!node) return null;
        const open = openPassed === idx;
        const via = path[idx + 1]?.via || '';
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
              {via && (
                <span style={{ fontSize: '0.85em', color: color.textLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  → {via}
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

      {ended ? (
        <div style={{
          borderRadius: radius.md, border: `1px solid ${color.border}`,
          background: alpha(color.navyLight, 0.04), padding: '14px 16px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.95em', fontWeight: font.weight.semibold, color: color.navy, marginBottom: 4 }}>
            終話{ended.label ? `（${ended.label}）` : ''}
          </div>
          <div style={{ fontSize: '0.85em', color: color.textMid }}>
            お疲れさまでした。架電結果を入力してください。
          </div>
        </div>
      ) : current ? (
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

          {/* これまでに選んだ反応とこちらの返し（チェーン） */}
          {chainResps.map((r, i) => (
            <div key={i} style={{ borderTop: `1px dashed ${color.border}` }}>
              <div style={{
                padding: '6px 14px', display: 'flex', gap: 8, alignItems: 'baseline',
                background: alpha(color.navyLight, 0.05),
              }}>
                <span style={{ fontSize: '0.78em', fontWeight: font.weight.semibold, color: color.textLight, flexShrink: 0 }}>相手</span>
                <span style={{ fontSize: '0.92em', fontWeight: font.weight.semibold, color: color.navyDark }}>{r.label}</span>
              </div>
              {(r.answer || '').trim() && (
                <div style={{ padding: '8px 14px', display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontSize: '0.78em', fontWeight: font.weight.semibold, color: color.gold, flexShrink: 0 }}>返し</span>
                  <span style={{ flex: 1 }}>
                    <ScriptBody text={r.answer} rebuttal={rebuttal} style={{ lineHeight: 1.8 }} />
                  </span>
                </div>
              )}
            </div>
          ))}

          {/* 次の選択肢 or 遷移/終話 */}
          {currentChoices.length > 0 ? (
            <div style={{ padding: '8px 14px 12px', borderTop: `1px dashed ${color.border}` }}>
              <div style={{ fontSize: '0.82em', color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 6 }}>
                相手の反応は？
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {currentChoices.map((r, i) => (
                  <button key={i} type="button" onClick={() => choose(r)}
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
                  </button>
                ))}
              </div>
            </div>
          ) : terminal && (
            <div style={{ padding: '8px 14px 12px', borderTop: `1px dashed ${color.border}`, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {terminalNext ? (
                <button type="button"
                  onClick={() => advanceTo(terminal.nextId, chainSummary())}
                  style={{
                    background: color.navy, border: `1px solid ${color.navy}`, color: color.white,
                    borderRadius: radius.pill, padding: '6px 16px',
                    fontSize: '0.92em', fontWeight: font.weight.semibold,
                    cursor: 'pointer', fontFamily: font.family.sans, lineHeight: 1.5,
                  }}>
                  次のセクションへ：{terminalNext.name || 'セクション'} →
                </button>
              ) : (
                <button type="button"
                  onClick={() => setEnded({ label: chainSummary() })}
                  style={{
                    background: color.white, border: `1px solid ${color.border}`, color: color.textMid,
                    borderRadius: radius.pill, padding: '6px 16px',
                    fontSize: '0.92em', fontWeight: font.weight.semibold,
                    cursor: 'pointer', fontFamily: font.family.sans, lineHeight: 1.5,
                  }}>
                  終話（ここで終了）
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ color: color.textLight, fontSize: font.size.sm }}>セクションが見つかりません（ライブラリページで確認してください）</div>
      )}
    </div>
  );
}
