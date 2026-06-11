import { useState, useEffect, useRef, useCallback } from 'react';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge, Tag } from '../ui';
import { fetchSetting, updateCallListRebuttal, updateCallListScript, updateCallListScriptTree, uploadScriptPdf, deleteScriptPdfObject, updateCallListScriptPdfs, getScriptPdfSignedUrl } from '../../lib/supabaseWrite';
import { toHtml, fromHtml, isSelectionMarked, applyMarker, removeMarker, createChipElement } from '../../utils/scriptMarker';
import PageHeader from '../common/PageHeader';
import ScriptBody, { flattenRebuttal } from '../common/ScriptBody';

export default function ScriptView({ isAdmin, clientData, callListData, setCallListData, embedded = false }) {
  // 右クリックコンテキストメニュー
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, editorEl, isMarked }

  // メニュー外クリックで閉じる
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); };
  }, [ctxMenu]);

  const handleContextMenu = useCallback((e, editorEl, rebuttal) => {
    if (!editorEl) return;
    const sel = window.getSelection();
    const hasSelection = !!(sel && !sel.isCollapsed && sel.toString().trim());
    const hasChips = flattenRebuttal(rebuttal).length > 0;
    // 分岐ブロック挿入は常に可能なのでメニューは常時表示
    e.preventDefault();
    // チップ挿入位置: 選択があれば選択の直後、なければ右クリックした位置のキャレット
    let range = null;
    if (hasSelection) {
      range = sel.getRangeAt(0).cloneRange();
    } else if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(e.clientX, e.clientY);
    } else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
      if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); range.collapse(true); }
    }
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      editorEl,
      hasSelection,
      hasChips,
      isMarked: hasSelection ? isSelectionMarked(editorEl) : false,
      range,
      rebuttal,
    });
  }, []);

  // アウト返しチップ挿入ダイアログ { editorEl, range, rebuttal }
  const [chipDialog, setChipDialog] = useState(null);
  const [chipSelected, setChipSelected] = useState([]);

  // 分岐ブロック挿入ダイアログ { editorEl, range }
  const [branchDialog, setBranchDialog] = useState(null);
  const [branchTitle, setBranchTitle] = useState('');
  const [branchOptions, setBranchOptions] = useState(['', '']);

  const handleInsertBranch = () => {
    if (!branchDialog) return;
    const { editorEl, range } = branchDialog;
    // {} は記法を壊すため除去
    const title = branchTitle.replace(/[{}]/g, '').trim() || '相手の反応';
    const opts = branchOptions.map(o => o.replace(/[{}]/g, '').trim()).filter(Boolean);
    if (!editorEl) { setBranchDialog(null); return; }
    if (opts.length < 2) { alert('選択肢を2つ以上入力してください'); return; }
    let r = (range && editorEl.contains(range.commonAncestorContainer)) ? range.cloneRange() : null;
    if (!r) {
      r = document.createRange();
      r.selectNodeContents(editorEl);
    }
    r.collapse(false);
    const lines = [`{{分岐:${title}}}`];
    opts.forEach(o => { lines.push(`{{→:${o}}}`); lines.push('（ここにトークを書く）'); });
    lines.push('{{/分岐}}');
    r.insertNode(document.createTextNode('\n' + lines.join('\n') + '\n'));
    // 挿入した記法テキストを即座に色付き部品の表示へ正規化（カーソル位置は失われるが挿入直後なので許容）
    editorEl.innerHTML = toHtml(fromHtml(editorEl.innerHTML));
    setFeDirty(true);
    setBranchDialog(null);
    setBranchTitle('');
    setBranchOptions(['', '']);
  };

  // 分岐部品（見出し/選択肢）のダブルクリックで名称変更
  const handleEditorDoubleClick = (e) => {
    const tok = e.target?.closest?.('[data-br]');
    if (!tok) return;
    const kind = tok.getAttribute('data-br');
    if (kind === 'close') return;
    const cur = tok.getAttribute('data-val') || '';
    const next = window.prompt(kind === 'open' ? '分岐の見出しを変更' : '選択肢名を変更', cur);
    if (next == null) return;
    const cleaned = next.replace(/[{}]/g, '').trim();
    if (!cleaned) return;
    tok.setAttribute('data-val', cleaned);
    tok.textContent = (kind === 'open' ? '⑂ 分岐: ' : '→ ') + cleaned;
    setFeDirty(true);
  };

  const handleInsertChips = () => {
    if (!chipDialog) return;
    const { editorEl, range } = chipDialog;
    if (!editorEl || chipSelected.length === 0) { setChipDialog(null); return; }
    // 右クリック時に保存した位置がエディタ内なら使う。無効なら末尾に挿入
    let r = (range && editorEl.contains(range.commonAncestorContainer)) ? range.cloneRange() : null;
    if (!r) {
      r = document.createRange();
      r.selectNodeContents(editorEl);
    }
    r.collapse(false);
    chipSelected.forEach(q => {
      const chip = createChipElement(q);
      r.insertNode(chip);
      r.setStartAfter(chip);
      r.collapse(true);
      const sp = document.createTextNode(' ');
      r.insertNode(sp);
      r.setStartAfter(sp);
      r.collapse(true);
    });
    setFeDirty(true);
    setChipDialog(null);
    setChipSelected([]);
  };
  const [clientTabs, setClientTabs] = useState({});
  // クライアント別スクリプト 全画面エディタ
  // （デフォルトのカードは閲覧専用。編集・PDF添付・アウト返し登録は全画面に集約）
  const [fullEditor, setFullEditor] = useState(null); // 編集中リストの _supaId
  const feEditorRef = useRef(null);
  const [feRebuttal, setFeRebuttal] = useState({ reception: [], president: [] });
  const [feRebuttalTab, setFeRebuttalTab] = useState('reception');
  const [feDirty, setFeDirty] = useState(false);
  const [feSaving, setFeSaving] = useState(false);
  const [feSavedOk, setFeSavedOk] = useState(false);
  // 他リスト（同じ商材・タイプ）のアウト返し候補セクションの開閉
  const [feCandOpen, setFeCandOpen] = useState(false);

  // ── ツリー型スクリプト編集 ──
  // feMode: 左ペインの編集対象 'text'(従来のテキスト型) | 'tree'(ツリー型)
  // feTree: { version, startId, nodes: [{id, name, talk, responses:[{label, nextId}]}] }
  //         talk はノードごとの contentEditable(feTreeTalkRefs) に持ち、保存/モード切替時に取り込む
  const [feMode, setFeMode] = useState('text');
  const [feTree, setFeTree] = useState(null);
  const feTreeTalkRefs = useRef({});
  // テキスト型→ツリー型へ切り替えたとき、未保存のテキスト編集を退避しておく
  const feTextDraftRef = useRef(null);

  const genNodeId = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // ノードの contentEditable から talk を state に取り込む（モード切替・保存時）
  const captureTreeTalks = (treeState) => {
    if (!treeState) return treeState;
    return {
      ...treeState,
      nodes: treeState.nodes.map(n => {
        const el = feTreeTalkRefs.current[n.id];
        return el ? { ...n, talk: fromHtml(el.innerHTML) } : n;
      }),
    };
  };

  const handleSwitchFeMode = (mode) => {
    if (mode === feMode) return;
    if (feMode === 'text' && feEditorRef.current) {
      feTextDraftRef.current = fromHtml(feEditorRef.current.innerHTML);
    }
    if (feMode === 'tree') {
      setFeTree(prev => captureTreeTalks(prev));
      feTreeTalkRefs.current = {};
    }
    setFeMode(mode);
  };

  const handleCreateTree = () => {
    const id = genNodeId();
    setFeTree({ version: 1, startId: id, nodes: [{ id, name: '受付', talk: '', responses: [] }] });
    setFeDirty(true);
  };

  const feTreeAddNode = (name = '') => {
    const id = genNodeId();
    setFeTree(prev => ({
      ...prev,
      startId: prev?.startId || id,
      nodes: [...(prev?.nodes || []), { id, name: name || `セクション${(prev?.nodes?.length || 0) + 1}`, talk: '', responses: [] }],
    }));
    setFeDirty(true);
    return id;
  };

  const feTreeUpdateNode = (nodeId, patch) => {
    setFeTree(prev => ({ ...prev, nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, ...patch } : n) }));
    setFeDirty(true);
  };

  const feTreeDeleteNode = (nodeId) => {
    const node = (feTree?.nodes || []).find(n => n.id === nodeId);
    if (!window.confirm(`セクション「${node?.name || ''}」を削除しますか？\nこのセクションへのリンクは「終話」に変わります。`)) return;
    setFeTree(prev => {
      const nodes = prev.nodes
        .filter(n => n.id !== nodeId)
        .map(n => ({
          ...n,
          responses: (n.responses || []).map(r => r.nextId === nodeId ? { ...r, nextId: null } : r),
        }));
      let startId = prev.startId;
      if (startId === nodeId) startId = nodes[0]?.id || null;
      return { ...prev, startId, nodes };
    });
    delete feTreeTalkRefs.current[nodeId];
    setFeDirty(true);
  };

  const feTreeMoveNode = (nodeId, dir) => {
    setFeTree(prev => {
      const idx = prev.nodes.findIndex(n => n.id === nodeId);
      const to = idx + dir;
      if (idx < 0 || to < 0 || to >= prev.nodes.length) return prev;
      const nodes = [...prev.nodes];
      [nodes[idx], nodes[to]] = [nodes[to], nodes[idx]];
      return { ...prev, nodes };
    });
    setFeDirty(true);
  };

  const feTreeUpdateResponse = (nodeId, respIdx, patch) => {
    setFeTree(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => {
        if (n.id !== nodeId) return n;
        const responses = [...(n.responses || [])];
        responses[respIdx] = { ...responses[respIdx], ...patch };
        return { ...n, responses };
      }),
    }));
    setFeDirty(true);
  };

  const feTreeAddResponse = (nodeId) => {
    setFeTree(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === nodeId
        ? { ...n, responses: [...(n.responses || []), { label: '', nextId: null }] }
        : n),
    }));
    setFeDirty(true);
  };

  const feTreeDeleteResponse = (nodeId, respIdx) => {
    setFeTree(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === nodeId
        ? { ...n, responses: (n.responses || []).filter((_, i) => i !== respIdx) }
        : n),
    }));
    setFeDirty(true);
  };

  const handleOpenFullEditor = (listId) => {
    const list = (callListData || []).find(l => l._supaId === listId);
    if (!list) return;
    let parsed = null;
    try { parsed = list.rebuttalData ? JSON.parse(list.rebuttalData) : null; } catch { /* broken json */ }
    setFeRebuttal(parsed || { reception: [], president: [] });
    setFeRebuttalTab('reception');
    setFeDirty(false);
    setFeSavedOk(false);
    setFeCandOpen(false);
    // ツリー型の初期化（ツリーがあるリストはツリー編集を初期表示）
    const tree = (list.scriptTree && Array.isArray(list.scriptTree.nodes)) ? JSON.parse(JSON.stringify(list.scriptTree)) : null;
    setFeTree(tree);
    setFeMode(tree?.nodes?.length ? 'tree' : 'text');
    feTreeTalkRefs.current = {};
    feTextDraftRef.current = null;
    setFullEditor(listId);
  };

  const handleCloseFullEditor = () => {
    if (feDirty && !window.confirm('保存していない変更があります。閉じてよろしいですか？')) return;
    setFullEditor(null);
  };

  const handleSaveFullEditor = async () => {
    const listId = fullEditor;
    if (!listId) return;
    setFeSaving(true);
    // テキスト型: マウント中ならエディタから、ツリー表示中ならモード切替時の退避分（無ければ触らない）
    const text = feEditorRef.current
      ? fromHtml(feEditorRef.current.innerHTML)
      : (feTextDraftRef.current != null ? feTextDraftRef.current : null);
    // ツリー型: ノードの contentEditable から talk を取り込んだ最新版（空ツリーは null = ツリー削除）
    let treeToSave;
    let capturedTree = null;
    if (feTree) {
      capturedTree = feMode === 'tree' ? captureTreeTalks(feTree) : feTree;
      treeToSave = capturedTree.nodes.length
        ? { version: 1, startId: capturedTree.startId || capturedTree.nodes[0].id, nodes: capturedTree.nodes }
        : null;
    } else {
      treeToSave = undefined; // ツリー未作成 → 触らない
    }
    const cleaned = {
      reception: (feRebuttal.reception || []).filter(it => (it.q || '').trim() || (it.a || '').trim()),
      president: (feRebuttal.president || []).filter(it => (it.q || '').trim() || (it.a || '').trim()),
    };
    // 全て空なら null 保存 → 架電画面の「共通の想定問答」フォールバックを維持する
    const jsonStr = (cleaned.reception.length || cleaned.president.length) ? JSON.stringify(cleaned) : null;
    const err1 = text != null ? await updateCallListScript(listId, text) : null;
    const err2 = await updateCallListRebuttal(listId, jsonStr);
    const err3 = treeToSave !== undefined ? await updateCallListScriptTree(listId, treeToSave) : null;
    setFeSaving(false);
    if (err1 || err2 || err3) { alert('保存に失敗しました'); return; }
    if (capturedTree) setFeTree(capturedTree);
    if (setCallListData) {
      setCallListData(prev => prev.map(l => l._supaId === listId ? {
        ...l,
        ...(text != null ? { scriptBody: text } : {}),
        rebuttalData: jsonStr || '',
        ...(treeToSave !== undefined ? { scriptTree: treeToSave } : {}),
      } : l));
    }
    setFeDirty(false);
    setFeSavedOk(true);
    setTimeout(() => setFeSavedOk(false), 2000);
  };

  const feUpdateRebuttalItem = (tab, index, field, value) => {
    setFeRebuttal(prev => {
      const updated = { ...prev };
      updated[tab] = [...(prev[tab] || [])];
      updated[tab][index] = { ...updated[tab][index], [field]: value };
      return updated;
    });
    setFeDirty(true);
  };
  const feAddRebuttalItem = (tab) => {
    setFeRebuttal(prev => ({ ...prev, [tab]: [...(prev[tab] || []), { q: '', a: '' }] }));
    setFeDirty(true);
  };
  const feRemoveRebuttalItem = (tab, index) => {
    setFeRebuttal(prev => ({ ...prev, [tab]: (prev[tab] || []).filter((_, i) => i !== index) }));
    setFeDirty(true);
  };

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

  // 共通の想定問答（アウト返し未設定リストのフォールバック+チップ候補として使用）
  const [qaData, setQaData] = useState(DEFAULT_QA_DATA);

  useEffect(() => {
    fetchSetting('qa_data').then(({ value }) => {
      if (value) {
        try {
          setQaData(JSON.parse(value));
        } catch { /* use defaults */ }
      }
    });
  }, []);

  const activeClients = (clientData || []).filter(c =>
    c.status === '支援中' &&
    (callListData || []).some(l => l.company === c.company && !l.is_archived)
  );

  // クライアント検索（名前の部分一致。今後スクリプトが増えても目的のカードへ即到達できるように）
  const [clientSearch, setClientSearch] = useState('');
  const [clientSearchFocus, setClientSearchFocus] = useState(false);
  const searchQ = clientSearch.trim().toLowerCase();
  const filteredClients = searchQ
    ? activeClients.filter(c => (c.company || '').toLowerCase().includes(searchQ))
    : activeClients;
  const searchSuggestions = searchQ
    ? activeClients
        .map(c => c.company)
        .filter(name => name && name.toLowerCase().includes(searchQ) && name !== clientSearch)
        .slice(0, 8)
    : [];

  return (
    <div style={{ animation: "fadeIn 0.3s ease", padding: "0 0 40px 0" }}>
      {!embedded && (
        <PageHeader
          title="トークスクリプト"
          description="架電スクリプトライブラリ"
          style={{ marginBottom: 24 }}
        />
      )}

      {/* クライアント別スクリプト */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <h2 style={{
            margin: 0, fontSize: font.size.base, fontWeight: font.weight.bold,
            color: color.navy, borderBottom: `2px solid ${color.navy}`, paddingBottom: 6,
          }}>クライアント別スクリプト</h2>
        </div>

        {/* クライアント検索: 名前の一部を入力すると候補が出て、該当クライアントだけ表示 */}
        <div style={{ position: 'relative', maxWidth: 420, marginBottom: 16 }}>
          <Input
            size="md"
            value={clientSearch}
            onChange={e => setClientSearch(e.target.value)}
            onFocus={() => setClientSearchFocus(true)}
            onBlur={() => setTimeout(() => setClientSearchFocus(false), 150)}
            placeholder="クライアント名で検索（一部入力でOK）"
          />
          {clientSearch.trim() && (
            <button
              type="button"
              onClick={() => setClientSearch('')}
              style={{
                position: 'absolute', right: 10, top: 9,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: color.textLight, fontSize: font.size.base, lineHeight: 1,
                fontFamily: font.family.sans,
              }}
              title="クリア"
            >✕</button>
          )}
          {clientSearchFocus && clientSearch.trim() && searchSuggestions.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
              marginTop: 4, background: color.white,
              border: `1px solid ${color.border}`, borderRadius: radius.md,
              boxShadow: shadow.lg, overflow: 'hidden',
            }}>
              {searchSuggestions.map(name => (
                <button key={name} type="button"
                  onMouseDown={() => { setClientSearch(name); setClientSearchFocus(false); }}
                  style={{
                    display: 'block', width: '100%', padding: '8px 14px',
                    border: 'none', background: 'transparent', textAlign: 'left',
                    fontSize: font.size.sm, color: color.textDark, cursor: 'pointer',
                    fontFamily: font.family.sans,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = color.gray100}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>

        {activeClients.length === 0 ? (
          <div style={{ color: color.textLight, fontSize: font.size.base, padding: "20px 0" }}>支援中のクライアントがありません</div>
        ) : filteredClients.length === 0 ? (
          <div style={{ color: color.textLight, fontSize: font.size.base, padding: "20px 0" }}>「{clientSearch}」に一致するクライアントがありません</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {filteredClients.map((client, cIdx) => {
              const clientLists = (callListData || []).filter(l => l.company === client.company && !l.is_archived);
              const allIndustries = [...new Set(clientLists.map(l => l.industry).filter(Boolean))];
              const tabKey = client._supaId || client.company;
              const activeTab = clientTabs[tabKey] ?? 0;
              const activeList = clientLists.find(l => l.industry === allIndustries[activeTab]) ?? clientLists[0];
              return (
                <Card key={client._supaId || cIdx} padding="none" style={{ overflow: "hidden" }}>
                  <div style={{ background: color.navy, padding: "10px 16px", display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.white, wordBreak: "break-all" }}>{client.company}</div>
                      <div style={{ fontSize: font.size.xs - 1, color: color.gray400, marginTop: 2 }}>{client.industry || ''}</div>
                    </div>
                    {isAdmin && activeList?._supaId && (
                      <Button size="sm" variant="outline"
                        onClick={() => handleOpenFullEditor(activeList._supaId)}
                        style={{
                          background: 'transparent', borderColor: alpha(color.white, 0.45),
                          color: color.white, flexShrink: 0, fontSize: font.size.xs,
                        }}>
                        全画面で編集
                      </Button>
                    )}
                  </div>
                  {allIndustries.length > 1 && (
                    <div style={{ display: "flex", overflowX: "auto", borderBottom: `1px solid ${color.border}`, background: color.gray50 }}>
                      {allIndustries.map((ind, iIdx) => (
                        <button key={iIdx}
                          onClick={() => setClientTabs(prev => ({ ...prev, [tabKey]: iIdx }))}
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
                  {/* デフォルトは閲覧専用プレビュー（編集・PDF・アウト返しは全画面エディタに集約） */}
                  <div style={{ padding: "14px 16px", maxHeight: 440, overflowY: "auto" }}>
                    {activeList?.scriptBody ? (() => {
                      let rb = null;
                      try { rb = activeList.rebuttalData ? JSON.parse(activeList.rebuttalData) : null; } catch { /* broken json */ }
                      return <ScriptBody text={activeList.scriptBody} rebuttal={rb || qaData} style={{ fontSize: font.size.sm, color: color.textDark, lineHeight: 1.8 }} />;
                    })() : (
                      <div style={{ fontSize: font.size.sm, color: color.textLight, fontStyle: "italic" }}>スクリプト未設定</div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* クライアント別スクリプト 全画面エディタ */}
      {fullEditor && (() => {
        const list = (callListData || []).find(l => l._supaId === fullEditor);
        if (!list) return null;
        const pdfs = Array.isArray(list.scriptPdfs) ? list.scriptPdfs : [];
        // チップ挿入候補: このリストのアウト返し（編集中の最新状態）。空なら共通の想定問答
        const effRebuttal = flattenRebuttal(feRebuttal).length ? feRebuttal : qaData;
        const isUploading = pdfUploadingListId === fullEditor;
        // 同じクライアントの他リスト（全画面のままスクリプトを切り替えられるようにする）
        const siblingLists = (callListData || []).filter(l => l.company === list.company && !l.is_archived);
        const handleSwitchList = (targetId) => {
          if (targetId === fullEditor) return;
          if (feDirty && !window.confirm('保存していない変更があります。切り替えると破棄されますが、よろしいですか？')) return;
          handleOpenFullEditor(targetId);
        };
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 9650, background: color.offWhite,
            display: 'flex', flexDirection: 'column',
          }}>
            {/* ヘッダー */}
            <div style={{
              background: color.navy, padding: '10px 20px', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: color.white, fontSize: font.size.base, fontWeight: font.weight.bold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {list.company}{list.industry ? ` - ${list.industry}` : ''}　スクリプト編集
                </div>
                <div style={{ color: alpha(color.white, 0.65), fontSize: font.size.xs - 1, marginTop: 2 }}>
                  右クリックでマーカー（テキスト選択時）／アウト返しチップの挿入ができます
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                {feSavedOk && <span style={{ fontSize: font.size.sm, color: '#7EE2A8' }}>保存しました</span>}
                {feDirty && !feSavedOk && <span style={{ fontSize: font.size.xs, color: alpha(color.white, 0.6) }}>未保存の変更あり</span>}
                <Button size="sm" variant="primary" loading={feSaving} onClick={handleSaveFullEditor}>
                  {feSaving ? '保存中...' : '保存'}
                </Button>
                <Button size="sm" variant="outline" onClick={handleCloseFullEditor}
                  style={{ background: 'transparent', borderColor: alpha(color.white, 0.45), color: color.white }}>
                  閉じる
                </Button>
              </div>
            </div>
            {/* リスト切替タブ（同じクライアントに複数リストがある場合のみ） */}
            {siblingLists.length > 1 && (
              <div style={{
                display: 'flex', overflowX: 'auto', flexShrink: 0,
                background: color.white, borderBottom: `1px solid ${color.border}`,
                padding: '0 12px',
              }}>
                {siblingLists.map(sl => {
                  const active = sl._supaId === fullEditor;
                  return (
                    <button key={sl._supaId} type="button"
                      onClick={() => handleSwitchList(sl._supaId)}
                      style={{
                        padding: '9px 16px', border: 'none', cursor: 'pointer',
                        fontSize: font.size.sm,
                        fontWeight: active ? font.weight.semibold : font.weight.normal,
                        background: 'transparent',
                        color: active ? color.navy : color.textMid,
                        borderBottom: `2px solid ${active ? color.gold : 'transparent'}`,
                        whiteSpace: 'nowrap', fontFamily: font.family.sans,
                        marginBottom: -1,
                      }}>
                      {sl.industry || sl.name || 'リスト'}
                    </button>
                  );
                })}
              </div>
            )}
            {/* 本体: 左=スクリプト編集 / 右=アウト返し・添付PDF */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                {/* テキスト型／ツリー型 切替 */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  {[['text', 'テキスト型'], ['tree', 'ツリー型']].map(([m, l]) => (
                    <Button key={m} size="sm"
                      variant={feMode === m ? 'primary' : 'secondary'}
                      onClick={() => handleSwitchFeMode(m)}
                      style={{ fontSize: font.size.xs }}>
                      {l}{m === 'tree' && feTree?.nodes?.length ? `（${feTree.nodes.length}）` : ''}
                    </Button>
                  ))}
                  <span style={{ fontSize: font.size.xs - 1, color: color.textLight }}>
                    {feMode === 'tree'
                      ? 'セクションを「相手の反応→行き先」で繋ぎます。架電画面ではガイドモードで表示されます'
                      : 'ツリー型を作ると架電画面が「ガイド表示」になります（テキスト型は全文タブとして残ります）'}
                  </span>
                </div>

                {feMode === 'tree' ? (
                  /* ── ツリーエディタ ── */
                  !feTree?.nodes?.length ? (
                    <div style={{
                      background: color.white, border: `1px dashed ${color.border}`,
                      borderRadius: radius.lg, padding: '40px 28px', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: font.size.sm, color: color.textMid, lineHeight: 1.8, marginBottom: 16 }}>
                        ツリー型スクリプトはまだありません。<br />
                        「受付」「キーマン編」のような場面単位のセクションを作り、<br />
                        相手の反応ごとに行き先を繋いでいきます。
                      </div>
                      <Button variant="primary" size="md" onClick={handleCreateTree}>最初のセクションを作成</Button>
                    </div>
                  ) : (() => {
                    // 「←どこから来るか」と未接続警告のための逆リンク集計
                    const incoming = {};
                    feTree.nodes.forEach(n => (n.responses || []).forEach(r => {
                      if (r.nextId) (incoming[r.nextId] = incoming[r.nextId] || []).push(n.name || 'セクション');
                    }));
                    const nodeOptions = feTree.nodes.map(n => ({ value: n.id, label: n.name || 'セクション' }));
                    return (
                      <div>
                        {feTree.nodes.map((node, idx) => {
                          const isStart = feTree.startId === node.id;
                          const froms = incoming[node.id] || [];
                          const orphan = !isStart && froms.length === 0;
                          return (
                            <Card key={node.id} padding="none" style={{
                              marginBottom: 12, overflow: 'hidden',
                              border: orphan ? `1px solid ${alpha(color.warn, 0.7)}` : undefined,
                            }}>
                              {/* ヘッダー: 名前 + スタート + 並び替え + 削除 */}
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '8px 12px', background: color.gray50,
                                borderBottom: `1px solid ${color.border}`, flexWrap: 'wrap',
                              }}>
                                <Input
                                  size="sm"
                                  value={node.name}
                                  onChange={e => feTreeUpdateNode(node.id, { name: e.target.value })}
                                  placeholder="セクション名（例: 受付）"
                                  fullWidth={false}
                                  containerStyle={{ width: 220 }}
                                  style={{ fontWeight: font.weight.semibold }}
                                />
                                {isStart ? (
                                  <Badge variant="primary" size="sm">スタート</Badge>
                                ) : (
                                  <button type="button" onClick={() => { setFeTree(prev => ({ ...prev, startId: node.id })); setFeDirty(true); }}
                                    style={{
                                      background: 'transparent', border: `1px dashed ${color.border}`,
                                      borderRadius: radius.pill, padding: '1px 8px', cursor: 'pointer',
                                      fontSize: font.size.xs - 1, color: color.textLight, fontFamily: font.family.sans,
                                    }}>
                                    スタートに設定
                                  </button>
                                )}
                                {froms.length > 0 && (
                                  <span style={{ fontSize: font.size.xs - 1, color: color.textLight }}>
                                    ← {froms.join(' / ')} から
                                  </span>
                                )}
                                {orphan && (
                                  <span style={{ fontSize: font.size.xs - 1, color: color.warn, fontWeight: font.weight.semibold }}>
                                    どこからもリンクされていません
                                  </span>
                                )}
                                <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, flexShrink: 0 }}>
                                  <Button size="sm" variant="ghost" disabled={idx === 0} onClick={() => feTreeMoveNode(node.id, -1)} style={{ fontSize: font.size.xs - 1, padding: '2px 8px' }}>↑</Button>
                                  <Button size="sm" variant="ghost" disabled={idx === feTree.nodes.length - 1} onClick={() => feTreeMoveNode(node.id, 1)} style={{ fontSize: font.size.xs - 1, padding: '2px 8px' }}>↓</Button>
                                  <Button size="sm" variant="outline" onClick={() => feTreeDeleteNode(node.id)} style={{ borderColor: '#fca5a5', color: color.danger, fontSize: font.size.xs - 1 }}>削除</Button>
                                </span>
                              </div>
                              {/* トーク本文（マーカー/チップは右クリックで挿入可） */}
                              <div
                                key={`${fullEditor}-${node.id}`}
                                ref={el => {
                                  if (el) {
                                    feTreeTalkRefs.current[node.id] = el;
                                    if (!el.dataset.feInit) {
                                      el.innerHTML = toHtml(node.talk || '');
                                      el.dataset.feInit = '1';
                                    }
                                  } else {
                                    delete feTreeTalkRefs.current[node.id];
                                  }
                                }}
                                contentEditable
                                suppressContentEditableWarning
                                onInput={() => setFeDirty(true)}
                                onDoubleClick={handleEditorDoubleClick}
                                onContextMenu={e => handleContextMenu(e, feTreeTalkRefs.current[node.id], effRebuttal)}
                                style={{
                                  padding: '12px 16px', minHeight: 64,
                                  fontSize: font.size.sm, color: color.textDark, lineHeight: 1.8,
                                  whiteSpace: 'pre-wrap', outline: 'none', fontFamily: font.family.sans,
                                  background: color.white,
                                }}
                              />
                              {/* 相手の反応 → 行き先 */}
                              <div style={{ padding: '8px 12px 12px', borderTop: `1px dashed ${color.border}`, background: alpha(color.navyLight, 0.025) }}>
                                <div style={{ fontSize: font.size.xs - 1, fontWeight: font.weight.semibold, color: color.textLight, marginBottom: 6 }}>
                                  相手の反応 → 次のセクション
                                </div>
                                {(node.responses || []).map((r, ri) => {
                                  const broken = r.nextId && !feTree.nodes.some(n => n.id === r.nextId);
                                  return (
                                    <div key={ri} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                      <Input
                                        size="sm"
                                        value={r.label}
                                        onChange={e => feTreeUpdateResponse(node.id, ri, { label: e.target.value })}
                                        placeholder="相手の言葉（例: 少々お待ちください）"
                                        fullWidth={false}
                                        containerStyle={{ flex: 1, minWidth: 180 }}
                                      />
                                      <span style={{ fontSize: font.size.xs, color: color.textLight, flexShrink: 0 }}>→</span>
                                      <Select
                                        size="sm"
                                        fullWidth={false}
                                        containerStyle={{ width: 200, flexShrink: 0 }}
                                        value={broken ? '__end__' : (r.nextId || '__end__')}
                                        onChange={e => {
                                          const v = e.target.value;
                                          if (v === '__new__') {
                                            const name = window.prompt('新しいセクション名', '');
                                            if (name == null || !name.trim()) return;
                                            const newId = feTreeAddNode(name.trim());
                                            feTreeUpdateResponse(node.id, ri, { nextId: newId });
                                          } else {
                                            feTreeUpdateResponse(node.id, ri, { nextId: v === '__end__' ? null : v });
                                          }
                                        }}
                                        options={[
                                          { value: '__end__', label: '終話（ここで終了）' },
                                          ...nodeOptions.filter(o => o.value !== node.id),
                                          { value: '__new__', label: '＋ 新規セクションを作成…' },
                                        ]}
                                      />
                                      <Button size="sm" variant="outline" onClick={() => feTreeDeleteResponse(node.id, ri)}
                                        style={{ borderColor: '#fca5a5', color: color.danger, fontSize: font.size.xs - 1, flexShrink: 0 }}>
                                        削除
                                      </Button>
                                      {broken && (
                                        <span style={{ fontSize: font.size.xs - 1, color: color.danger, width: '100%' }}>
                                          行き先のセクションが削除されたため「終話」扱いになっています
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                                <Button variant="ghost" size="sm" onClick={() => feTreeAddResponse(node.id)} style={{
                                  border: `1px dashed ${color.gray400}`, color: color.textMid,
                                  fontSize: font.size.xs - 1,
                                }}>+ 反応を追加</Button>
                              </div>
                            </Card>
                          );
                        })}
                        <Button variant="ghost" size="md" onClick={() => feTreeAddNode()} fullWidth style={{
                          border: `1px dashed ${color.gray400}`, color: color.textMid,
                        }}>+ セクションを追加</Button>
                      </div>
                    );
                  })()
                ) : (
                  /* ── テキスト型エディタ（従来） ── */
                  <div
                    key={fullEditor}
                    ref={el => {
                      feEditorRef.current = el;
                      if (el && !el.dataset.feInit) {
                        el.innerHTML = toHtml(feTextDraftRef.current != null ? feTextDraftRef.current : (list.scriptBody || ''));
                        el.dataset.feInit = '1';
                      }
                    }}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={() => setFeDirty(true)}
                    onDoubleClick={handleEditorDoubleClick}
                    onContextMenu={e => handleContextMenu(e, feEditorRef.current, effRebuttal)}
                    style={{
                      background: color.white, border: `1px solid ${color.border}`,
                      borderRadius: radius.lg, padding: '24px 28px',
                      minHeight: 'calc(100% - 50px)', boxSizing: 'border-box',
                      fontSize: font.size.base, color: color.textDark, lineHeight: 1.9,
                      whiteSpace: 'pre-wrap', outline: 'none', fontFamily: font.family.sans,
                    }}
                  />
                )}
              </div>
              <div style={{
                width: 400, flexShrink: 0, borderLeft: `1px solid ${color.border}`,
                overflowY: 'auto', background: color.white,
              }}>
                {/* アウト返し（このリスト専用） */}
                <div style={{ padding: '14px 16px', borderBottom: `1px solid ${color.border}` }}>
                  <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy, marginBottom: 4 }}>アウト返し</div>
                  <div style={{ fontSize: font.size.xs - 1, color: color.textLight, lineHeight: 1.6, marginBottom: 10 }}>
                    このリスト専用のQ&A（未入力なら共通の想定問答が使われます）。登録したQ&Aは、左の本文を右クリック→「アウト返しチップを挿入」でスクリプト内に配置できます。
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    {[['reception', '受付対応'], ['president', 'キーマン対応']].map(([k, l]) => (
                      <Button key={k} size="sm"
                        variant={feRebuttalTab === k ? 'primary' : 'secondary'}
                        onClick={() => setFeRebuttalTab(k)}
                        style={{ fontSize: font.size.xs - 1 }}>
                        {l}
                      </Button>
                    ))}
                  </div>
                  {(feRebuttal[feRebuttalTab] || []).map((item, i) => (
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
                          onChange={e => feUpdateRebuttalItem(feRebuttalTab, i, 'q', e.target.value)}
                          containerStyle={{ flex: 1 }}
                          style={{ fontSize: font.size.xs }}
                        />
                        <Button size="sm" variant="outline" onClick={() => feRemoveRebuttalItem(feRebuttalTab, i)} style={{
                          borderColor: '#fca5a5', color: color.danger,
                          fontSize: font.size.xs - 1,
                        }}>削除</Button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <span style={{ fontSize: font.size.xs - 1, fontWeight: font.weight.bold, color: color.navy, marginTop: 3 }}>A:</span>
                        <textarea value={item.a} onChange={e => feUpdateRebuttalItem(feRebuttalTab, i, 'a', e.target.value)} rows={2} style={{
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
                  <Button variant="ghost" size="sm" onClick={() => feAddRebuttalItem(feRebuttalTab)} fullWidth style={{
                    border: `1px dashed ${color.gray400}`, color: color.textMid,
                    fontSize: font.size.xs - 1,
                  }}>+ 項目を追加</Button>

                  {/* 同じ商材・タイプの他リストに登録済みのQ&Aを候補表示 → 1クリックで追加 */}
                  {(() => {
                    const seen = new Set(flattenRebuttal(feRebuttal).map(it => it.q));
                    const dupe = new Set();
                    const candidates = [];
                    (callListData || []).forEach(l => {
                      if (l._supaId === fullEditor || !l.rebuttalData) return;
                      if (!l.engagement_id || l.engagement_id !== list.engagement_id) return;
                      let rb = null;
                      try { rb = JSON.parse(l.rebuttalData); } catch { return; }
                      ['reception', 'president'].forEach(tab => {
                        (rb?.[tab] || []).forEach(it => {
                          const q = (it.q || '').trim();
                          if (!q || seen.has(q) || dupe.has(q)) return;
                          dupe.add(q);
                          candidates.push({ tab, q, a: it.a || '', source: `${l.company}${l.industry ? ' - ' + l.industry : ''}` });
                        });
                      });
                    });
                    if (!candidates.length) return null;
                    return (
                      <div style={{ marginTop: 12, borderTop: `1px dashed ${color.border}`, paddingTop: 10 }}>
                        <button type="button" onClick={() => setFeCandOpen(v => !v)} style={{
                          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                          background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                          fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.navy,
                          fontFamily: font.family.sans,
                        }}>
                          <span>{feCandOpen ? '▾' : '▸'}</span>
                          同じタイプの他リストから追加（{candidates.length}件の候補）
                        </button>
                        {feCandOpen && (
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginBottom: 8, lineHeight: 1.5 }}>
                              同じ商材・タイプの他リストに登録済みのアウト返しです。「追加」でこのリストにコピーされます。
                            </div>
                            {candidates.map((c, i) => (
                              <div key={i} style={{
                                marginBottom: 6, padding: '6px 10px',
                                borderRadius: radius.md, background: color.offWhite,
                                border: `1px dashed ${color.border}`,
                              }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginBottom: 2 }}>
                                      {c.tab === 'reception' ? '受付対応' : 'キーマン対応'}　出典: {c.source}
                                    </div>
                                    <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.gray700 }}>Q: {c.q}</div>
                                    <div style={{ fontSize: font.size.xs, color: color.textMid, lineHeight: 1.5 }}>A: {c.a}</div>
                                  </div>
                                  <Button size="sm" variant="outline" style={{ flexShrink: 0, fontSize: font.size.xs - 1 }}
                                    onClick={() => {
                                      setFeRebuttal(prev => ({
                                        ...prev,
                                        [c.tab]: [...(prev[c.tab] || []), { q: c.q, a: c.a }],
                                      }));
                                      setFeDirty(true);
                                    }}>
                                    追加
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                {/* 添付PDF */}
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy }}>添付PDF</span>
                    <input
                      ref={el => { if (el) pdfFileInputRefs.current[fullEditor] = el; }}
                      type="file"
                      accept="application/pdf"
                      style={{ display: 'none' }}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadPdf(fullEditor, file);
                        e.target.value = '';
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      loading={isUploading}
                      onClick={() => pdfFileInputRefs.current[fullEditor]?.click()}
                      style={{ fontSize: font.size.xs - 1 }}>
                      {isUploading ? 'アップロード中...' : '＋ 追加'}
                    </Button>
                  </div>
                  {pdfs.length === 0 ? (
                    <div style={{ fontSize: font.size.xs, color: color.textLight, fontStyle: 'italic' }}>未添付</div>
                  ) : pdfs.map((pdf, i) => (
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
                      <Button
                        size="sm"
                        variant="outline"
                        loading={pdfDeletingPath === pdf.path}
                        onClick={() => handleDeletePdf(fullEditor, pdf)}
                        style={{
                          borderColor: '#fca5a5', color: color.danger,
                          fontSize: font.size.xs - 1, flexShrink: 0,
                        }}>
                        {pdfDeletingPath === pdf.path ? '...' : '削除'}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}


      {/* PDFプレビューローディング */}
      {pdfPreviewLoading && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          zIndex: 9790, display: 'flex', alignItems: 'center', justifyContent: 'center',
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
            zIndex: 9800, display: 'flex', alignItems: 'center', justifyContent: 'center',
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
      {ctxMenu && (() => {
        const menuItemStyle = {
          display: 'block', width: '100%', padding: '8px 16px',
          border: 'none', background: 'transparent', textAlign: 'left',
          fontSize: font.size.sm, color: color.gray700, cursor: 'pointer',
          fontFamily: font.family.sans,
        };
        return (
        <div style={{
          position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 99999,
          background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.lg,
          boxShadow: shadow.lg, padding: '4px 0', minWidth: 180,
        }}>
          {ctxMenu.hasSelection && (ctxMenu.isMarked ? (
            <button onClick={() => {
              removeMarker(ctxMenu.editorEl);
              setFeDirty(true);
              setCtxMenu(null);
            }} style={menuItemStyle}
              onMouseEnter={e => e.target.style.background = color.gray100}
              onMouseLeave={e => e.target.style.background = 'transparent'}>
              取り消す
            </button>
          ) : (
            <button onClick={() => {
              applyMarker(ctxMenu.editorEl);
              setFeDirty(true);
              setCtxMenu(null);
            }} style={menuItemStyle}
              onMouseEnter={e => e.target.style.background = color.gray100}
              onMouseLeave={e => e.target.style.background = 'transparent'}>
              <span style={{ background: 'linear-gradient(transparent 60%, #FFE066 60%)', fontWeight: font.weight.bold, padding: '0 2px', marginRight: 6 }}>A</span>強調する
            </button>
          ))}
          {ctxMenu.hasChips && (
            <button onClick={() => {
              setChipSelected([]);
              setChipDialog({
                editorEl: ctxMenu.editorEl,
                range: ctxMenu.range,
                rebuttal: ctxMenu.rebuttal,
              });
              setCtxMenu(null);
            }} style={{ ...menuItemStyle, borderTop: ctxMenu.hasSelection ? `1px solid ${color.borderLight || color.border}` : 'none' }}
              onMouseEnter={e => e.target.style.background = color.gray100}
              onMouseLeave={e => e.target.style.background = 'transparent'}>
              <span style={{
                display: 'inline-block', background: alpha(color.info, 0.1),
                border: `1px solid ${alpha(color.navyLight, 0.4)}`, color: color.navyDark,
                borderRadius: radius.pill, padding: '0 6px', fontSize: font.size.xs - 1,
                fontWeight: font.weight.semibold, marginRight: 6,
              }}>Q</span>
              アウト返しチップを挿入
            </button>
          )}
          <button onClick={() => {
            setBranchTitle('');
            setBranchOptions(['', '']);
            setBranchDialog({ editorEl: ctxMenu.editorEl, range: ctxMenu.range });
            setCtxMenu(null);
          }} style={{ ...menuItemStyle, borderTop: (ctxMenu.hasSelection || ctxMenu.hasChips) ? `1px solid ${color.borderLight || color.border}` : 'none' }}
            onMouseEnter={e => e.target.style.background = color.gray100}
            onMouseLeave={e => e.target.style.background = 'transparent'}>
            <span style={{
              display: 'inline-block', background: alpha(color.gold, 0.15),
              border: `1px solid ${alpha(color.gold, 0.6)}`, color: color.navyDark,
              borderRadius: radius.pill, padding: '0 6px', fontSize: font.size.xs - 1,
              fontWeight: font.weight.semibold, marginRight: 6,
            }}>⑂</span>
            分岐ブロックを挿入
          </button>
        </div>
        );
      })()}

      {/* 分岐ブロック挿入ダイアログ */}
      {branchDialog && (
        <div onClick={() => setBranchDialog(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <div onClick={e => e.stopPropagation()}
            style={{
              width: '90vw', maxWidth: 480, maxHeight: '75vh', borderRadius: radius.lg,
              background: color.white, boxShadow: shadow.xl,
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
            <div style={{
              background: color.navy, color: color.white, padding: '12px 20px',
              fontSize: font.size.base, fontWeight: font.weight.semibold, flexShrink: 0,
            }}>
              分岐ブロックを挿入
            </div>
            <div style={{ padding: '14px 20px', overflowY: 'auto', flex: 1 }}>
              <div style={{ fontSize: font.size.xs, color: color.textLight, marginBottom: 12, lineHeight: 1.6 }}>
                相手の反応に応じてトークを切り替えるブロックです。架電者には選択肢がボタンで表示され、押した選択肢のトークだけがその場に展開されます。挿入後、各選択肢の「（ここにトークを書く）」を書き換えてください。
              </div>
              <Input
                label="分岐の見出し"
                size="sm"
                value={branchTitle}
                onChange={e => setBranchTitle(e.target.value)}
                placeholder="例: 担当者に代わってもらえたら"
                containerStyle={{ marginBottom: 12 }}
              />
              <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textMid, marginBottom: 4 }}>
                選択肢（相手の反応）
              </div>
              {branchOptions.map((opt, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                  <Input
                    size="sm"
                    value={opt}
                    onChange={e => setBranchOptions(prev => prev.map((o, k) => k === i ? e.target.value : o))}
                    placeholder={`例: ${['興味あり', '忙しい・時間がない', '他社と付き合いがある'][i] || '選択肢' + (i + 1)}`}
                    containerStyle={{ flex: 1 }}
                  />
                  {branchOptions.length > 2 && (
                    <Button size="sm" variant="outline"
                      onClick={() => setBranchOptions(prev => prev.filter((_, k) => k !== i))}
                      style={{ borderColor: '#fca5a5', color: color.danger, fontSize: font.size.xs - 1, flexShrink: 0 }}>
                      削除
                    </Button>
                  )}
                </div>
              ))}
              {branchOptions.length < 6 && (
                <Button variant="ghost" size="sm" onClick={() => setBranchOptions(prev => [...prev, ''])} fullWidth style={{
                  border: `1px dashed ${color.gray400}`, color: color.textMid,
                  fontSize: font.size.xs - 1,
                }}>+ 選択肢を追加</Button>
              )}
            </div>
            <div style={{
              padding: '10px 20px', borderTop: `1px solid ${color.border}`, flexShrink: 0,
              display: 'flex', justifyContent: 'flex-end', gap: 8,
            }}>
              <Button size="sm" variant="outline" onClick={() => setBranchDialog(null)}>キャンセル</Button>
              <Button size="sm" variant="primary"
                disabled={branchOptions.filter(o => o.trim()).length < 2}
                onClick={handleInsertBranch}>
                挿入する
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* アウト返しチップ挿入ダイアログ */}
      {chipDialog && (() => {
        const groups = [
          ['受付対応', (chipDialog.rebuttal?.reception || []).filter(it => (it.q || '').trim())],
          ['キーマン対応', (chipDialog.rebuttal?.president || []).filter(it => (it.q || '').trim())],
        ];
        const toggle = (q) => setChipSelected(prev =>
          prev.includes(q) ? prev.filter(x => x !== q) : [...prev, q]);
        return (
          <div onClick={() => { setChipDialog(null); setChipSelected([]); }}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <div onClick={e => e.stopPropagation()}
              style={{
                width: '90vw', maxWidth: 540, maxHeight: '75vh', borderRadius: radius.lg,
                background: color.white, boxShadow: shadow.xl,
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
              }}>
              <div style={{
                background: color.navy, color: color.white, padding: '12px 20px',
                fontSize: font.size.base, fontWeight: font.weight.semibold, flexShrink: 0,
              }}>
                アウト返しチップを挿入
              </div>
              <div style={{ padding: '14px 20px', overflowY: 'auto', flex: 1 }}>
                <div style={{ fontSize: font.size.xs, color: color.textLight, marginBottom: 10, lineHeight: 1.6 }}>
                  選んだ質問が、右クリックした位置にチップとして入ります。架電者がスクリプト上のチップを押すと、その場で回答が表示されます。
                </div>
                {groups.map(([label, items]) => items.length > 0 && (
                  <div key={label} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.gray400, marginBottom: 6 }}>{label}</div>
                    {items.map((it, i) => (
                      <label key={i} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                        padding: '6px 10px', marginBottom: 4, borderRadius: radius.md,
                        background: chipSelected.includes(it.q) ? alpha(color.navyLight, 0.08) : color.gray50,
                        border: `1px solid ${chipSelected.includes(it.q) ? alpha(color.navyLight, 0.4) : 'transparent'}`,
                        cursor: 'pointer',
                      }}>
                        <input
                          type="checkbox"
                          checked={chipSelected.includes(it.q)}
                          onChange={() => toggle(it.q)}
                          style={{ accentColor: color.navy, marginTop: 3 }}
                        />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.gray700 }}>Q: {it.q}</span>
                          <span style={{ display: 'block', fontSize: font.size.xs, color: color.textMid, lineHeight: 1.5, marginTop: 2 }}>A: {it.a}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
              <div style={{
                padding: '10px 20px', borderTop: `1px solid ${color.border}`, flexShrink: 0,
                display: 'flex', justifyContent: 'flex-end', gap: 8,
              }}>
                <Button size="sm" variant="outline" onClick={() => { setChipDialog(null); setChipSelected([]); }}>キャンセル</Button>
                <Button size="sm" variant="primary" disabled={chipSelected.length === 0} onClick={handleInsertChips}>
                  挿入する{chipSelected.length > 0 ? `（${chipSelected.length}件）` : ''}
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
