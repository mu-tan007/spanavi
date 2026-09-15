import React, { useEffect, useMemo, useState } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Select } from '../../ui';
import ScriptBody, { hasPlaceholder, treeHasPlaceholder } from '../../common/ScriptBody';
import ScriptTreeGuide from '../../common/ScriptTreeGuide';
import { fetchCallListItemScripts, getScriptPdfSignedUrl } from '../../../lib/supabaseWrite';

// リスト別スクリプトの閲覧パネル（社内「案件」/ クライアントポータル 共通）。
// 架電者の1画面集中ページ(CallFlowView)の右カラムと同じ見せ方に揃える:
//  - ツリー型・テキスト型・添付PDFのうち2つ以上あるときだけ「ガイド / 全文 / PDF」トグルを出す
//  - 1つだけならトグルなしでそのまま表示
// script  : リストの script_body (テキスト型)
// tree    : リストの script_tree (ツリー型 / { nodes, startId })
// rebuttal: リストの rebuttal_data (本文中の [[Q:〜]] チップを開くのに必要)
// pdfs   : リストの script_pdfs (添付PDF / 署名付きURLを取ってiframeで表示)
export default function ListScriptDrawer({ open, onClose, list }) {
  const hasTree = !!(list?.scriptTree && Array.isArray(list.scriptTree.nodes) && list.scriptTree.nodes.length);
  const hasText = !!(list?.scriptBody || '').trim();
  const pdfs = useMemo(() => (Array.isArray(list?.scriptPdfs) ? list.scriptPdfs : []), [list?.scriptPdfs]);
  const [viewMode, setViewMode] = useState('guide');
  const [pdfUrls, setPdfUrls] = useState({}); // { [path]: signedUrl }
  const [pickedPdfPath, setPickedPdfPath] = useState('');
  // 企業ごとに差し替わる部分があるスクリプトは、閲覧時にどの企業で見るかを選ばせる
  const [items, setItems] = useState([]);
  const [pickedId, setPickedId] = useState('');
  const perCompany = useMemo(
    () => treeHasPlaceholder(list?.scriptTree) || hasPlaceholder(list?.scriptBody),
    [list?.scriptTree, list?.scriptBody]
  );

  // リストを開き直すたびに既定表示へ戻す（ツリーがあればガイド優先）
  useEffect(() => {
    if (!open) return;
    setViewMode(hasTree ? 'guide' : hasText ? 'text' : 'pdf');
    setPickedPdfPath(pdfs[0]?.path || '');
  }, [open, list?.listId, hasTree, hasText, pdfs]);

  // 差し込み口があるときだけ企業一覧を読む
  useEffect(() => {
    if (!open || !perCompany || !list?.listId) { setItems([]); setPickedId(''); return; }
    let alive = true;
    (async () => {
      const { data } = await fetchCallListItemScripts(list.listId);
      if (!alive) return;
      setItems(data);
      setPickedId(data[0]?.id || '');
    })();
    return () => { alive = false; };
  }, [open, perCompany, list?.listId]);

  // 表示するPDFが決まったら署名付きURLを取る（取れたものはキャッシュ）
  useEffect(() => {
    if (!open || viewMode !== 'pdf' || !pickedPdfPath) return;
    if (pdfUrls[pickedPdfPath]) return;
    let alive = true;
    (async () => {
      const { url } = await getScriptPdfSignedUrl(pickedPdfPath);
      if (alive && url) setPdfUrls(prev => ({ ...prev, [pickedPdfPath]: url }));
    })();
    return () => { alive = false; };
  }, [open, viewMode, pickedPdfPath, pdfUrls]);

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

  const modes = [
    ...(hasTree ? [['guide', 'ガイド（ツリー型）']] : []),
    ...(hasText ? [['text', '全文（テキスト型）']] : []),
    ...(pdfs.length ? [['pdf', 'PDF']] : []),
  ];
  const mode = modes.some(([m]) => m === viewMode) ? viewMode : (modes[0]?.[0] || 'text');
  const pickedRow = items.find(i => i.id === pickedId) || null;
  const pickedPdf = pdfs.find(p => p.path === pickedPdfPath) || pdfs[0] || null;
  const pdfUrl = pickedPdf ? pdfUrls[pickedPdf.path] : null;

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
          {!hasTree && !hasText && !pdfs.length ? (
            <div style={{ color: color.textLight, fontSize: font.size.sm, textAlign: 'center', padding: space[8] }}>
              このリストにはスクリプトが登録されていません。
            </div>
          ) : (
            <>
              {/* 2つ以上あるときだけ切替（架電者の1画面集中ページと同じ挙動） */}
              {modes.length > 1 && (
                <div style={{ display: 'flex', gap: space[1], marginBottom: space[3] }}>
                  {modes.map(([m, label]) => {
                    const active = mode === m;
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
              {perCompany && mode !== 'pdf' && (
                <div style={{ marginBottom: space[3] }}>
                  <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: space[1] }}>
                    このスクリプトは企業ごとに一部の文面が異なります。表示する企業をお選びください。
                  </div>
                  <Select
                    value={pickedId}
                    onChange={e => setPickedId(e.target.value)}
                    options={items.map(i => ({ value: i.id, label: `${i.no}. ${i.company}` }))}
                    disabled={!items.length}
                    style={{ maxWidth: 360 }}
                  />
                </div>
              )}
              {mode === 'pdf'
                ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: space[2], height: '100%', minHeight: 480 }}>
                    {pdfs.length > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', borderBottom: `1px solid ${color.border}`, paddingBottom: space[2] }}>
                        {pdfs.map(pdf => {
                          const active = pdf.path === pickedPdf?.path;
                          return (
                            <button key={pdf.path} type="button"
                              onClick={() => setPickedPdfPath(pdf.path)}
                              title={pdf.name}
                              style={{
                                padding: '4px 10px', fontSize: font.size.xs, borderRadius: radius.sm,
                                border: active ? `1px solid ${color.navyDeep}` : `1px solid ${color.border}`,
                                background: active ? color.navyDeep : color.white,
                                color: active ? color.white : color.navyDeep,
                                cursor: 'pointer', fontFamily: font.family.sans,
                                fontWeight: active ? font.weight.semibold : font.weight.normal,
                                maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                              {pdf.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {pickedPdf && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
                          <span style={{ fontSize: font.size.xs, color: color.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pickedPdf.name}</span>
                          {pdfUrl && (
                            <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                              style={{ marginLeft: 'auto', fontSize: font.size.xs - 1, color: color.textMid, textDecoration: 'underline', flexShrink: 0 }}>
                              新規タブで開く
                            </a>
                          )}
                        </div>
                        <div style={{ flex: 1, minHeight: 440, borderRadius: radius.md, border: `1px solid ${color.border}`, overflow: 'hidden', background: color.white, display: 'flex' }}>
                          {pdfUrl ? (
                            <iframe
                              src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                              title={pickedPdf.name}
                              style={{ flex: 1, border: 'none', width: '100%' }}
                            />
                          ) : (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color.textLight, fontSize: font.size.xs }}>PDFを読み込み中...</div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )
                : mode === 'guide'
                ? <ScriptTreeGuide
                    tree={list.scriptTree}
                    rebuttal={rebuttal}
                    row={pickedRow}
                    resetKey={`${list.listId}|${pickedId}`}
                    style={{ fontSize: font.size.sm, color: color.navyDeep }}
                  />
                : <ScriptBody
                    text={list.scriptBody}
                    rebuttal={rebuttal}
                    row={pickedRow}
                    style={{ fontSize: font.size.sm, color: color.navyDeep, lineHeight: 1.8 }}
                  />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
