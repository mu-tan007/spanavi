import { useState, useEffect, useRef, useCallback } from 'react';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge, Tag } from '../ui';
import { DEFAULT_BASIC_SCRIPT } from '../../constants/scripts';
import { fetchSetting, saveSetting, updateCallListRebuttal, updateCallListScript, uploadScriptPdf, deleteScriptPdfObject, updateCallListScriptPdfs, getScriptPdfSignedUrl } from '../../lib/supabaseWrite';
import { renderMarkedScript, toHtml, fromHtml, isSelectionMarked, applyMarker, removeMarker } from '../../utils/scriptMarker';
import PageHeader from '../common/PageHeader';

export default function ScriptView({ isAdmin, clientData, callListData, setCallListData, embedded = false }) {
  const [basicScript, setBasicScript] = useState(DEFAULT_BASIC_SCRIPT);
  const [basicScriptEdit, setBasicScriptEdit] = useState(DEFAULT_BASIC_SCRIPT);
  const editorRef = useRef(null);
  const editorInitRef = useRef(false);
  // 右クリックコンテキストメニュー
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, editorEl, isMarked }

  // contentEditable初期化
  useEffect(() => {
    if (editorRef.current && !editorInitRef.current) {
      editorRef.current.innerHTML = toHtml(basicScriptEdit);
      editorInitRef.current = true;
    }
  }, [basicScriptEdit]);

  // メニュー外クリックで閉じる
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); };
  }, [ctxMenu]);

  const handleContextMenu = useCallback((e, editorEl) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return; // 選択なしならデフォルトメニュー
    e.preventDefault();
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      editorEl,
      isMarked: isSelectionMarked(editorEl),
    });
  }, []);
  const [savedOk, setSavedOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clientTabs, setClientTabs] = useState({});
  const [qaOpen, setQaOpen] = useState(false);
  const [qaTab, setQaTab] = useState('reception');
  const [qaEditing, setQaEditing] = useState(false);
  const [qaSaving, setQaSaving] = useState(false);
  // クライアント別スクリプトのcontentEditable ref管理
  const clientEditorRefs = useRef({});
  const clientEditorInitIds = useRef(new Set());
  const [clientScriptSaving, setClientScriptSaving] = useState(null); // listId being saved
  const [clientScriptSaved, setClientScriptSaved] = useState(null); // listId just saved

  // リスト別アウト返し編集
  const [rebuttalEditListId, setRebuttalEditListId] = useState(null);
  const [rebuttalEditData, setRebuttalEditData] = useState(null);
  const [rebuttalEditTab, setRebuttalEditTab] = useState('reception');
  const [rebuttalSaving, setRebuttalSaving] = useState(false);

  // PDF添付
  const [pdfUploadingListId, setPdfUploadingListId] = useState(null);
  const [pdfDeletingPath, setPdfDeletingPath] = useState(null);
  const [pdfPreview, setPdfPreview] = useState(null); // { name, url }
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const pdfFileInputRefs = useRef({});

  const handleUploadPdf = async (listId, file) => {
    if (!listId || !file) return;
    if (file.type !== 'application/pdf') { alert('PDFファイルのみアップロードできます'); return; }
    if (file.size > 20 * 1024 * 1024) { alert('ファイルサイズは20MB以下にしてください'); return; }
    setPdfUploadingListId(listId);
    const { item, error } = await uploadScriptPdf(listId, file);
    if (error || !item) {
      setPdfUploadingListId(null);
      alert('PDFのアップロードに失敗しました');
      return;
    }
    const currentList = (callListData || []).find(l => l._supaId === listId);
    const currentPdfs = Array.isArray(currentList?.scriptPdfs) ? currentList.scriptPdfs : [];
    const nextPdfs = [...currentPdfs, item];
    const updErr = await updateCallListScriptPdfs(listId, nextPdfs);
    setPdfUploadingListId(null);
    if (updErr) {
      // ロールバック: アップロード済みオブジェクトを削除
      await deleteScriptPdfObject(item.path);
      alert('PDFの保存に失敗しました');
      return;
    }
    if (setCallListData) {
      setCallListData(prev => prev.map(l => l._supaId === listId ? { ...l, scriptPdfs: nextPdfs } : l));
    }
  };

  const handleDeletePdf = async (listId, pdf) => {
    if (!listId || !pdf?.path) return;
    if (!window.confirm(`「${pdf.name}」を削除しますか？`)) return;
    setPdfDeletingPath(pdf.path);
    const currentList = (callListData || []).find(l => l._supaId === listId);
    const currentPdfs = Array.isArray(currentList?.scriptPdfs) ? currentList.scriptPdfs : [];
    const nextPdfs = currentPdfs.filter(p => p.path !== pdf.path);
    const updErr = await updateCallListScriptPdfs(listId, nextPdfs);
    if (updErr) {
      setPdfDeletingPath(null);
      alert('PDFの削除に失敗しました');
      return;
    }
    await deleteScriptPdfObject(pdf.path);
    setPdfDeletingPath(null);
    if (setCallListData) {
      setCallListData(prev => prev.map(l => l._supaId === listId ? { ...l, scriptPdfs: nextPdfs } : l));
    }
  };

  const handleOpenPdf = async (pdf) => {
    if (!pdf?.path) return;
    setPdfPreviewLoading(true);
    const { url, error } = await getScriptPdfSignedUrl(pdf.path);
    setPdfPreviewLoading(false);
    if (error || !url) { alert('PDFを開けませんでした'); return; }
    setPdfPreview({ name: pdf.name, url });
  };

  const formatFileSize = (bytes) => {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };


  const DEFAULT_QA_DATA = {
    reception: [
      { q: 'ご用件は何でしょうか？', a: 'M＆Aに関するご案内でご連絡しております。キーマン様はいらっしゃいますか？' },
      { q: 'どちらの会社の方ですか？', a: '○○株式会社の○○と申します。' },
      { q: '資料を送ってください', a: 'ご説明の機会をいただいた際にお持ちします。ぜひ30分ほどお時間をいただけますでしょうか。' },
      { q: '後でかけ直してください', a: '承知しました。何時頃にお電話すればよろしいでしょうか。' },
      { q: '担当者名を教えてください', a: '私、○○と申します。' },
      { q: '何の件ですか？と聞かれた場合', a: '事業承継・M＆Aに関する情報提供でご連絡しております。' },
    ],
    president: [
      { q: '売る気はない', a: 'おっしゃる通りです。今すぐではなく、将来の選択肢として情報だけでも持っておいていただければ、いざという時に役立ちます。30分だけお時間いただけますか？' },
      { q: '他の会社からも電話が来る', a: 'そうですよね。数多くの業者の中で、私どもは○○という点でご支持いただいており、実績も豊富です。ぜひ一度比較していただければと思います。' },
      { q: '忙しいから時間がない', a: 'お忙しいところ申し訳ございません。30分だけで結構です。ご都合のよい日時を教えていただけますか？' },
      { q: '今は考えていない', a: '承知しました。ただ、情報として知っておいていただくだけでも将来必ずお役に立てます。簡単なご説明だけさせてください。' },
      { q: '子供に継がせる', a: 'それは素晴らしいですね。ただ、もし事情が変わった場合の選択肢として知っておいていただくだけでも損はないかと思います。' },
      { q: '会社の状況が良くない', a: 'そのような状況だからこそ、M＆Aを活用することで従業員の雇用を守りながら最善の判断ができる場合があります。ぜひ一度お話だけでも。' },
    ],
  };

  const [qaData, setQaData] = useState(DEFAULT_QA_DATA);
  const [qaEditData, setQaEditData] = useState(DEFAULT_QA_DATA);

  useEffect(() => {
    fetchSetting('basic_script').then(({ value }) => {
      const text = value || DEFAULT_BASIC_SCRIPT;
      setBasicScript(text);
      setBasicScriptEdit(text);
      // Editor HTMLを初期化
      if (editorRef.current) editorRef.current.innerHTML = toHtml(text);
      editorInitRef.current = true;
    });
    fetchSetting('qa_data').then(({ value }) => {
      if (value) {
        try {
          const parsed = JSON.parse(value);
          setQaData(parsed);
          setQaEditData(parsed);
        } catch { /* use defaults */ }
      }
    });
  }, []);

  const handleSaveBasicScript = async () => {
    setSaving(true);
    // editorから最新テキストを取得
    const text = editorRef.current ? fromHtml(editorRef.current.innerHTML) : basicScriptEdit;
    const err = await saveSetting('basic_script', text);
    setSaving(false);
    if (err) { alert('保存に失敗しました'); return; }
    setBasicScriptEdit(text);
    setBasicScript(text);
    setSavedOk(true);
    setTimeout(() => setSavedOk(false), 2000);
  };

  const handleSaveQA = async () => {
    setQaSaving(true);
    const err = await saveSetting('qa_data', JSON.stringify(qaEditData));
    setQaSaving(false);
    if (err) { alert('Q&Aの保存に失敗しました'); return; }
    setQaData(qaEditData);
    setQaEditing(false);
  };

  const updateQAItem = (tab, index, field, value) => {
    setQaEditData(prev => {
      const updated = { ...prev };
      updated[tab] = [...prev[tab]];
      updated[tab][index] = { ...updated[tab][index], [field]: value };
      return updated;
    });
  };

  const addQAItem = (tab) => {
    setQaEditData(prev => ({
      ...prev,
      [tab]: [...prev[tab], { q: '', a: '' }],
    }));
  };

  const removeQAItem = (tab, index) => {
    setQaEditData(prev => ({
      ...prev,
      [tab]: prev[tab].filter((_, i) => i !== index),
    }));
  };

  const activeClients = (clientData || []).filter(c =>
    c.status === '支援中' &&
    (callListData || []).some(l => l.company === c.company && !l.is_archived)
  );

  return (
    <div style={{ animation: "fadeIn 0.3s ease", padding: "0 0 40px 0" }}>
      {!embedded && (
        <PageHeader
          eyebrow="Sourcing · Scripts"
          title="Scripts"
          description="架電スクリプトライブラリ"
          style={{ marginBottom: 24 }}
        />
      )}

      {/* 基本スクリプト */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <h2 style={{
            margin: 0, fontSize: font.size.base, fontWeight: font.weight.bold,
            color: color.navy, borderBottom: `2px solid ${color.navy}`, paddingBottom: 6,
          }}>基本スクリプト</h2>
          <Button size="sm" onClick={() => setQaOpen(true)}>想定問答を見る</Button>
        </div>

        <Card padding="md">
          {isAdmin ? (
            <>
              <div style={{ fontSize: font.size.xs - 1, color: color.gray400, marginBottom: 6 }}>テキストを選択して右クリックでマーカーを付けられます</div>
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={() => setBasicScriptEdit(fromHtml(editorRef.current?.innerHTML || ''))}
                onContextMenu={e => handleContextMenu(e, editorRef.current)}
                style={{
                  width: "100%", border: "none", outline: "none", minHeight: 180,
                  fontSize: font.size.base, color: color.textDark, fontFamily: font.family.sans,
                  background: "transparent", lineHeight: 1.8, boxSizing: "border-box",
                  whiteSpace: "pre-wrap", overflowY: "auto",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                <Button size="sm" onClick={handleSaveBasicScript} loading={saving}>
                  {saving ? "保存中..." : "保存"}
                </Button>
                {savedOk && <span style={{ fontSize: font.size.sm, color: color.success }}>保存しました</span>}
              </div>
            </>
          ) : (
            <div style={{ minHeight: 120 }}>
              {basicScript
                ? renderMarkedScript(basicScript, { fontSize: font.size.base, color: color.textDark, lineHeight: 1.8 })
                : <span style={{ color: color.textLight, fontStyle: "italic" }}>（スクリプト未設定）</span>}
            </div>
          )}
        </Card>

      </div>

      {/* クライアント別スクリプト */}
      <div>
        <h2 style={{
          margin: "0 0 14px", fontSize: font.size.base, fontWeight: font.weight.bold,
          color: color.navy, borderBottom: `2px solid ${color.navy}`, paddingBottom: 6,
        }}>クライアント別スクリプト</h2>
        {activeClients.length === 0 ? (
          <div style={{ color: color.textLight, fontSize: font.size.base, padding: "20px 0" }}>支援中のクライアントがありません</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {activeClients.map((client, cIdx) => {
              const clientLists = (callListData || []).filter(l => l.company === client.company && !l.is_archived);
              const allIndustries = [...new Set(clientLists.map(l => l.industry).filter(Boolean))];
              const activeTab = clientTabs[cIdx] ?? 0;
              const activeList = clientLists.find(l => l.industry === allIndustries[activeTab]) ?? clientLists[0];
              return (
                <Card key={client._supaId || cIdx} padding="none" style={{ overflow: "hidden" }}>
                  <div style={{ background: color.navy, padding: "10px 16px" }}>
                    <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.white, wordBreak: "break-all" }}>{client.company}</div>
                    <div style={{ fontSize: font.size.xs - 1, color: color.gray400, marginTop: 2 }}>{client.industry || ''}</div>
                  </div>
                  {allIndustries.length > 1 && (
                    <div style={{ display: "flex", overflowX: "auto", borderBottom: `1px solid ${color.border}`, background: color.gray50 }}>
                      {allIndustries.map((ind, iIdx) => (
                        <button key={iIdx}
                          onClick={() => setClientTabs(prev => ({ ...prev, [cIdx]: iIdx }))}
                          style={{
                            padding: "5px 12px", border: "none", cursor: "pointer",
                            fontSize: font.size.xs - 1,
                            fontWeight: activeTab === iIdx ? font.weight.bold : font.weight.normal,
                            background: "transparent",
                            color: activeTab === iIdx ? color.navy : color.gray400,
                            borderBottom: "2px solid " + (activeTab === iIdx ? color.navy : "transparent"),
                            whiteSpace: "nowrap", fontFamily: font.family.sans,
                          }}>
                          {ind}
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ padding: "14px 16px", maxHeight: 220, overflowY: "auto" }}>
                    {isAdmin ? (
                      <>
                        <div
                          key={activeList?._supaId}
                          ref={el => {
                            if (el && activeList?._supaId) {
                              clientEditorRefs.current[activeList._supaId] = el;
                              if (!el.dataset.spInit) {
                                el.innerHTML = toHtml(activeList.scriptBody || '');
                                el.dataset.spInit = '1';
                              }
                            }
                          }}
                          contentEditable
                          suppressContentEditableWarning
                          onContextMenu={e => activeList?._supaId && handleContextMenu(e, clientEditorRefs.current[activeList._supaId])}
                          style={{
                            fontSize: font.size.sm, color: color.textDark, lineHeight: 1.8,
                            whiteSpace: "pre-wrap", outline: "none", minHeight: 40,
                            fontFamily: font.family.sans,
                          }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                          <Button
                            size="sm"
                            loading={clientScriptSaving === activeList?._supaId}
                            onClick={async () => {
                              const listId = activeList?._supaId;
                              if (!listId) return;
                              const el = clientEditorRefs.current[listId];
                              const text = el ? fromHtml(el.innerHTML) : '';
                              setClientScriptSaving(listId);
                              const err = await updateCallListScript(listId, text);
                              setClientScriptSaving(null);
                              if (err) { alert('保存に失敗しました'); return; }
                              if (setCallListData) setCallListData(prev => prev.map(l => l._supaId === listId ? { ...l, scriptBody: text } : l));
                              setClientScriptSaved(listId);
                              setTimeout(() => setClientScriptSaved(null), 2000);
                            }}
                            style={{ fontSize: font.size.xs - 1 }}>
                            {clientScriptSaving === activeList?._supaId ? '保存中...' : '保存'}
                          </Button>
                          {clientScriptSaved === activeList?._supaId && (
                            <span style={{ fontSize: font.size.xs - 1, color: color.success }}>保存しました</span>
                          )}
                        </div>
                      </>
                    ) : (
                      activeList?.scriptBody ? (
                        renderMarkedScript(activeList.scriptBody, { fontSize: font.size.sm, color: color.textDark, lineHeight: 1.8 })
                      ) : (
                        <div style={{ fontSize: font.size.sm, color: color.textLight, fontStyle: "italic" }}>スクリプト未設定</div>
                      )
                    )}
                  </div>
                  {/* 添付PDFセクション */}
                  {activeList && (() => {
                    const listId = activeList._supaId;
                    const pdfs = Array.isArray(activeList.scriptPdfs) ? activeList.scriptPdfs : [];
                    const isUploading = pdfUploadingListId === listId;
                    return (
                      <div style={{ borderTop: `1px solid ${color.border}` }}>
                        <div style={{
                          padding: '8px 16px', display: 'flex', alignItems: 'center',
                          justifyContent: 'space-between', background: color.gray50,
                        }}>
                          <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.navy }}>添付PDF</span>
                          {isAdmin && (
                            <>
                              <input
                                ref={el => { if (el) pdfFileInputRefs.current[listId] = el; }}
                                type="file"
                                accept="application/pdf"
                                style={{ display: 'none' }}
                                onChange={e => {
                                  const file = e.target.files?.[0];
                                  if (file) handleUploadPdf(listId, file);
                                  e.target.value = '';
                                }}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                loading={isUploading}
                                onClick={() => pdfFileInputRefs.current[listId]?.click()}
                                style={{ fontSize: font.size.xs - 1 }}>
                                {isUploading ? 'アップロード中...' : '＋ 追加'}
                              </Button>
                            </>
                          )}
                        </div>
                        {pdfs.length === 0 ? (
                          <div style={{ padding: '6px 16px 12px', fontSize: font.size.xs, color: color.textLight, fontStyle: 'italic' }}>未添付</div>
                        ) : (
                          <div style={{ padding: '6px 16px 12px' }}>
                            {pdfs.map((pdf, i) => (
                              <div key={pdf.path || i} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '5px 8px', borderRadius: radius.sm,
                                background: color.gray50, borderLeft: `2px solid ${color.navy}`,
                                marginBottom: 4,
                              }}>
                                <button
                                  onClick={() => handleOpenPdf(pdf)}
                                  style={{
                                    flex: 1, textAlign: 'left', background: 'transparent',
                                    border: 'none', cursor: 'pointer', padding: 0,
                                    fontSize: font.size.xs, color: color.navy,
                                    fontWeight: font.weight.medium, textDecoration: 'underline',
                                    fontFamily: font.family.sans,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}
                                  title={pdf.name}
                                >
                                  {pdf.name}
                                </button>
                                <span style={{ fontSize: font.size.xs - 1, color: color.gray400, flexShrink: 0 }}>{formatFileSize(pdf.size)}</span>
                                {isAdmin && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    loading={pdfDeletingPath === pdf.path}
                                    onClick={() => handleDeletePdf(listId, pdf)}
                                    style={{
                                      borderColor: '#fca5a5', color: color.danger,
                                      fontSize: font.size.xs - 1, flexShrink: 0,
                                    }}>
                                    {pdfDeletingPath === pdf.path ? '...' : '削除'}
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* アウト返しセクション */}
                  {activeList && (() => {
                    const listId = activeList._supaId;
                    const parsed = (() => { try { return activeList.rebuttalData ? JSON.parse(activeList.rebuttalData) : null; } catch { return null; } })();
                    const isEditing = rebuttalEditListId === listId;
                    return (
                      <div style={{ borderTop: `1px solid ${color.border}` }}>
                        <div style={{
                          padding: '8px 16px', display: 'flex', alignItems: 'center',
                          justifyContent: 'space-between', background: color.gray50,
                        }}>
                          <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.navy }}>アウト返し</span>
                          {isAdmin && !isEditing && (
                            <Button size="sm" variant="outline" onClick={() => {
                              setRebuttalEditListId(listId);
                              setRebuttalEditData(parsed || { reception: [{ q: '', a: '' }], president: [{ q: '', a: '' }] });
                              setRebuttalEditTab('reception');
                            }} style={{ fontSize: font.size.xs - 1 }}>
                              {parsed ? '編集' : '設定する'}
                            </Button>
                          )}
                        </div>
                        {isEditing ? (
                          <div style={{ padding: '10px 16px 14px' }}>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                              {[['reception', '受付対応'], ['president', 'キーマン対応']].map(([k, l]) => (
                                <Button key={k} size="sm"
                                  variant={rebuttalEditTab === k ? 'primary' : 'secondary'}
                                  onClick={() => setRebuttalEditTab(k)}
                                  style={{ fontSize: font.size.xs - 1 }}>
                                  {l}
                                </Button>
                              ))}
                            </div>
                            {(rebuttalEditData[rebuttalEditTab] || []).map((item, i) => (
                              <div key={i} style={{
                                marginBottom: 10, padding: '8px 10px',
                                borderRadius: radius.md, background: color.gray50,
                                borderLeft: `3px solid ${color.navy}`,
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                  <span style={{ fontSize: font.size.xs - 1, fontWeight: font.weight.bold, color: color.gray700 }}>Q:</span>
                                  <Input
                                    size="sm"
                                    fullWidth
                                    type="text"
                                    value={item.q}
                                    onChange={e => {
                                      setRebuttalEditData(prev => {
                                        const updated = { ...prev };
                                        updated[rebuttalEditTab] = [...prev[rebuttalEditTab]];
                                        updated[rebuttalEditTab][i] = { ...updated[rebuttalEditTab][i], q: e.target.value };
                                        return updated;
                                      });
                                    }}
                                    containerStyle={{ flex: 1 }}
                                    style={{ fontSize: font.size.xs }}
                                  />
                                  <Button size="sm" variant="outline" onClick={() => {
                                    setRebuttalEditData(prev => ({
                                      ...prev,
                                      [rebuttalEditTab]: prev[rebuttalEditTab].filter((_, idx) => idx !== i),
                                    }));
                                  }} style={{
                                    borderColor: '#fca5a5', color: color.danger,
                                    fontSize: font.size.xs - 1,
                                  }}>削除</Button>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                  <span style={{ fontSize: font.size.xs - 1, fontWeight: font.weight.bold, color: color.navy, marginTop: 3 }}>A:</span>
                                  <textarea value={item.a} onChange={e => {
                                    setRebuttalEditData(prev => {
                                      const updated = { ...prev };
                                      updated[rebuttalEditTab] = [...prev[rebuttalEditTab]];
                                      updated[rebuttalEditTab][i] = { ...updated[rebuttalEditTab][i], a: e.target.value };
                                      return updated;
                                    });
                                  }} rows={2} style={{
                                    flex: 1, padding: '3px 6px', border: `1px solid ${color.border}`,
                                    borderRadius: radius.md, fontSize: font.size.xs,
                                    resize: 'vertical', lineHeight: 1.5,
                                    color: color.textDark, background: color.white,
                                    fontFamily: font.family.sans, outline: 'none',
                                    boxSizing: 'border-box',
                                  }} />
                                </div>
                              </div>
                            ))}
                            <Button variant="ghost" size="sm" onClick={() => {
                              setRebuttalEditData(prev => ({
                                ...prev,
                                [rebuttalEditTab]: [...prev[rebuttalEditTab], { q: '', a: '' }],
                              }));
                            }} fullWidth style={{
                              border: `1px dashed ${color.gray400}`, color: color.textMid,
                              fontSize: font.size.xs - 1,
                            }}>+ 項目を追加</Button>
                            <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
                              <Button size="sm" variant="secondary" onClick={() => setRebuttalEditListId(null)}
                                style={{ fontSize: font.size.xs - 1 }}>キャンセル</Button>
                              <Button size="sm" loading={rebuttalSaving} onClick={async () => {
                                setRebuttalSaving(true);
                                const jsonStr = JSON.stringify(rebuttalEditData);
                                const err = await updateCallListRebuttal(listId, jsonStr);
                                setRebuttalSaving(false);
                                if (err) { alert('保存に失敗しました'); return; }
                                setRebuttalEditListId(null);
                                if (setCallListData) {
                                  setCallListData(prev => prev.map(l => l._supaId === listId ? { ...l, rebuttalData: jsonStr } : l));
                                }
                              }} style={{ fontSize: font.size.xs - 1 }}>
                                {rebuttalSaving ? '保存中...' : '保存'}
                              </Button>
                            </div>
                          </div>
                        ) : parsed ? (
                          <div style={{ padding: '6px 16px 12px', maxHeight: 150, overflowY: 'auto' }}>
                            {(parsed.reception || []).length > 0 && (
                              <div style={{ marginBottom: 6 }}>
                                <div style={{ fontSize: 9, fontWeight: font.weight.semibold, color: color.gray400, marginBottom: 4 }}>受付対応</div>
                                {parsed.reception.map((item, i) => (
                                  <div key={i} style={{
                                    marginBottom: 6, padding: '4px 8px',
                                    borderRadius: radius.sm, background: color.gray50,
                                    borderLeft: `2px solid ${color.navy}`,
                                  }}>
                                    <div style={{ fontSize: font.size.xs - 1, fontWeight: font.weight.semibold, color: color.gray700 }}>Q: {item.q}</div>
                                    <div style={{ fontSize: font.size.xs - 1, color: color.navy, lineHeight: 1.5 }}>A: {item.a}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                            {(parsed.president || []).length > 0 && (
                              <div>
                                <div style={{ fontSize: 9, fontWeight: font.weight.semibold, color: color.gray400, marginBottom: 4 }}>キーマン対応</div>
                                {parsed.president.map((item, i) => (
                                  <div key={i} style={{
                                    marginBottom: 6, padding: '4px 8px',
                                    borderRadius: radius.sm, background: color.gray50,
                                    borderLeft: `2px solid ${color.navy}`,
                                  }}>
                                    <div style={{ fontSize: font.size.xs - 1, fontWeight: font.weight.semibold, color: color.gray700 }}>Q: {item.q}</div>
                                    <div style={{ fontSize: font.size.xs - 1, color: color.navy, lineHeight: 1.5 }}>A: {item.a}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ padding: '6px 16px 12px', fontSize: font.size.xs, color: color.textLight, fontStyle: 'italic' }}>未設定</div>
                        )}
                      </div>
                    );
                  })()}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* 想定問答モーダル */}
      {qaOpen && (
        <div onClick={() => setQaOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9400,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <div onClick={e => e.stopPropagation()}
            style={{
              width: '90vw', maxWidth: 640, maxHeight: '80vh', borderRadius: radius.md,
              background: color.white, border: `1px solid ${color.border}`,
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              boxShadow: shadow.xl,
            }}>
            <div style={{
              background: color.navy, padding: '12px 24px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0, fontWeight: font.weight.semibold,
              fontSize: font.size.lg - 1, color: color.white,
            }}>
              <span>想定問答集</span>
              <button onClick={() => setQaOpen(false)} style={{
                background: 'none', border: 'none', color: color.white,
                fontSize: 18, cursor: 'pointer', lineHeight: 1,
              }}>✕</button>
            </div>
            <div style={{ display: 'flex', borderBottom: `1px solid ${color.border}`, flexShrink: 0 }}>
              {[['reception', '受付対応'], ['president', 'キーマン対応']].map(([k, l]) => (
                <button key={k} onClick={() => setQaTab(k)} style={{
                  flex: 1, padding: '10px', border: 'none', background: 'transparent',
                  fontWeight: qaTab === k ? font.weight.semibold : font.weight.normal,
                  fontSize: font.size.sm,
                  color: qaTab === k ? color.navy : color.gray400,
                  borderBottom: qaTab === k ? `2px solid ${color.navy}` : '2px solid transparent',
                  cursor: 'pointer', fontFamily: font.family.sans,
                }}>
                  {l}
                </button>
              ))}
            </div>
            <div style={{ overflowY: 'auto', padding: '16px 20px' }}>
              {qaEditing ? (
                <>
                  {qaEditData[qaTab].map((item, i) => (
                    <div key={i} style={{
                      marginBottom: 16, padding: '12px 14px',
                      borderRadius: radius.md, background: color.gray50,
                      borderLeft: `3px solid ${color.navy}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.gray700 }}>Q:</span>
                        <Input
                          size="sm"
                          fullWidth
                          type="text"
                          value={item.q}
                          onChange={e => updateQAItem(qaTab, i, 'q', e.target.value)}
                          containerStyle={{ flex: 1 }}
                        />
                        <Button size="sm" variant="outline" onClick={() => removeQAItem(qaTab, i)} style={{
                          borderColor: '#fca5a5', color: color.danger, fontSize: font.size.xs,
                        }}>削除</Button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <span style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.navy, marginTop: 4 }}>A:</span>
                        <textarea value={item.a} onChange={e => updateQAItem(qaTab, i, 'a', e.target.value)} rows={2} style={{
                          flex: 1, padding: '4px 8px', border: `1px solid ${color.border}`,
                          borderRadius: radius.md, fontSize: font.size.sm,
                          resize: 'vertical', lineHeight: 1.6,
                          color: color.textDark, background: color.white,
                          fontFamily: font.family.sans, outline: 'none',
                          boxSizing: 'border-box',
                        }} />
                      </div>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => addQAItem(qaTab)} fullWidth style={{
                    border: `1px dashed ${color.gray400}`, color: color.textMid,
                  }}>+ 項目を追加</Button>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                    <Button size="sm" variant="secondary" onClick={() => { setQaEditData(qaData); setQaEditing(false); }}>キャンセル</Button>
                    <Button size="sm" onClick={handleSaveQA} loading={qaSaving}>{qaSaving ? '保存中...' : '保存'}</Button>
                  </div>
                </>
              ) : (
                <>
                  {qaData[qaTab].map((item, i) => (
                    <div key={i} style={{
                      marginBottom: 16, padding: '12px 14px',
                      borderRadius: radius.md, background: color.gray50,
                      borderLeft: `3px solid ${color.navy}`,
                    }}>
                      <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.gray700, marginBottom: 6 }}>Q: {item.q}</div>
                      <div style={{ fontSize: font.size.sm, color: color.navy, lineHeight: 1.7 }}>A: {item.a}</div>
                    </div>
                  ))}
                  {isAdmin && (
                    <Button size="sm" variant="outline" onClick={() => { setQaEditData(qaData); setQaEditing(true); }} style={{ marginTop: 8 }}>編集する</Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PDFプレビューローディング */}
      {pdfPreviewLoading && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          zIndex: 9500, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: color.white, fontSize: font.size.base,
        }}>
          PDFを読み込み中...
        </div>
      )}

      {/* PDFプレビューモーダル */}
      {pdfPreview && (
        <div onClick={() => setPdfPreview(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
            zIndex: 9600, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}>
          <div onClick={e => e.stopPropagation()}
            style={{
              width: '95vw', height: '92vh', maxWidth: 1200, borderRadius: radius.md,
              background: color.white, border: `1px solid ${color.border}`,
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              boxShadow: shadow.xl,
            }}>
            <div style={{
              background: color.navy, padding: '10px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0, fontWeight: font.weight.semibold,
              fontSize: font.size.base, color: color.white,
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pdfPreview.name}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <a href={pdfPreview.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: font.size.xs, color: color.white, textDecoration: 'underline' }}>新規タブで開く</a>
                <button onClick={() => setPdfPreview(null)} style={{
                  background: 'none', border: 'none', color: color.white,
                  fontSize: 18, cursor: 'pointer', lineHeight: 1,
                }}>✕</button>
              </div>
            </div>
            <iframe
              src={pdfPreview.url}
              title={pdfPreview.name}
              style={{ flex: 1, border: 'none', width: '100%' }}
            />
          </div>
        </div>
      )}

      {/* 右クリックコンテキストメニュー */}
      {ctxMenu && (
        <div style={{
          position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 99999,
          background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.lg,
          boxShadow: shadow.lg, padding: '4px 0', minWidth: 140,
        }}>
          {ctxMenu.isMarked ? (
            <button onClick={() => {
              removeMarker(ctxMenu.editorEl);
              // state同期
              if (ctxMenu.editorEl === editorRef.current) {
                setBasicScriptEdit(fromHtml(editorRef.current.innerHTML));
              }
              setCtxMenu(null);
            }} style={{
              display: 'block', width: '100%', padding: '8px 16px',
              border: 'none', background: 'transparent', textAlign: 'left',
              fontSize: font.size.sm, color: color.gray700, cursor: 'pointer',
              fontFamily: font.family.sans,
            }}
              onMouseEnter={e => e.target.style.background = color.gray100}
              onMouseLeave={e => e.target.style.background = 'transparent'}>
              取り消す
            </button>
          ) : (
            <button onClick={() => {
              applyMarker(ctxMenu.editorEl);
              // state同期
              if (ctxMenu.editorEl === editorRef.current) {
                setBasicScriptEdit(fromHtml(editorRef.current.innerHTML));
              }
              setCtxMenu(null);
            }} style={{
              display: 'block', width: '100%', padding: '8px 16px',
              border: 'none', background: 'transparent', textAlign: 'left',
              fontSize: font.size.sm, color: color.gray700, cursor: 'pointer',
              fontFamily: font.family.sans,
            }}
              onMouseEnter={e => e.target.style.background = color.gray100}
              onMouseLeave={e => e.target.style.background = 'transparent'}>
              <span style={{ background: 'linear-gradient(transparent 60%, #FFE066 60%)', fontWeight: font.weight.bold, padding: '0 2px', marginRight: 6 }}>A</span>強調する
            </button>
          )}
        </div>
      )}

    </div>
  );
}
