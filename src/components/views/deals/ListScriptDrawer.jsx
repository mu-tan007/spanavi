import React, { useEffect, useMemo, useState } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button } from '../../ui';
import ScriptBody from '../../common/ScriptBody';
import ScriptTreeGuide from '../../common/ScriptTreeGuide';

// リスト別スクリプトの閲覧パネル（社内「案件」/ クライアントポータル 共通）。
// 架電者の1画面集中ページ(CallFlowView)の右カラムと同じ見せ方に揃える:
//  - ツリー型とテキスト型の両方があるときだけ「ガイド / 全文」トグルを出す
//  - 片方だけならトグルなしでそのまま表示
// script  : リストの script_body (テキスト型)
// tree    : リストの script_tree (ツリー型 / { nodes, startId })
// rebuttal: リストの rebuttal_data (本文中の [[Q:〜]] チップを開くのに必要)
export default function ListScriptDrawer({ open, onClose, list }) {
  const hasTree = !!(list?.scriptTree && Array.isArray(list.scriptTree.nodes) && list.scriptTree.nodes.length);
  const hasText = !!(list?.scriptBody || '').trim();
  const [viewMode, setViewMode] = useState('guide');

  // リストを開き直すたびに既定表示へ戻す（ツリーがあればガイド優先）
  useEffect(() => {
    if (open) setViewMode(hasTree ? 'guide' : 'text');
  }, [open, list?.listId, hasTree]);

  // Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const rebuttal = useMemo(() => {
    const raw = list?.rebuttalData;
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { return null; }
  }, [list?.rebuttalData]);

  if (!open || !list) return null;

  const showGuide = hasTree && (viewMode === 'guide' || !hasText);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: alpha(color.navyDeep, 0.35),
        display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(720px, 94vw)', height: '100%',
          background: color.white,
          borderLeft: `1px solid ${color.border}`,
          boxShadow: shadow.xl,
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* ヘッダー */}
        <div style={{
          flexShrink: 0,
          padding: `${space[3]}px ${space[5]}px`,
          background: color.navy,
          color: color.white,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[3],
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: font.size.xs - 1, letterSpacing: font.letterSpacing.widest,
              textTransform: 'uppercase', color: alpha(color.white, 0.65),
            }}>
              架電スクリプト
            </div>
            <div style={{
              fontSize: font.size.base, fontWeight: font.weight.semibold,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {list.listName || '(名称未設定)'}
              {list.scriptName && (
                <span style={{ fontSize: font.size.xs, fontWeight: font.weight.normal, color: alpha(color.white, 0.7), marginLeft: space[2] }}>
                  {list.scriptName}
                </span>
              )}
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>閉じる</Button>
        </div>

        {/* 本文 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: space[5] }}>
          {!hasTree && !hasText ? (
            <div style={{ color: color.textLight, fontSize: font.size.sm, textAlign: 'center', padding: space[8] }}>
              このリストにはスクリプトが登録されていません。
            </div>
          ) : (
            <>
              {/* 両方あるときだけ切替（架電者の1画面集中ページと同じ挙動） */}
              {hasTree && hasText && (
                <div style={{ display: 'flex', gap: space[1], marginBottom: space[3] }}>
                  {[['guide', 'ガイド（ツリー型）'], ['text', '全文（テキスト型）']].map(([m, label]) => {
                    const active = viewMode === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setViewMode(m)}
                        style={{
                          fontSize: font.size.xs,
                          padding: `${space[1]}px ${space[4]}px`,
                          borderRadius: radius.md,
                          border: 'none',
                          cursor: 'pointer',
                          fontFamily: font.family.sans,
                          background: active ? color.navyDeep : color.gray100,
                          color: active ? color.white : color.gray500,
                          fontWeight: active ? font.weight.semibold : font.weight.normal,
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
              {showGuide
                ? <ScriptTreeGuide
                    tree={list.scriptTree}
                    rebuttal={rebuttal}
                    resetKey={list.listId}
                    style={{ fontSize: font.size.sm, color: color.navyDeep }}
                  />
                : <ScriptBody
                    text={list.scriptBody}
                    rebuttal={rebuttal}
                    style={{ fontSize: font.size.sm, color: color.navyDeep, lineHeight: 1.8 }}
                  />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
