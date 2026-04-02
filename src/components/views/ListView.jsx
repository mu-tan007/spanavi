import { useState } from 'react';
import { C } from '../../constants/colors';
import { updateCallList, insertCallList, archiveCallList, restoreCallList } from '../../lib/supabaseWrite';
import { supabase } from '../../lib/supabase';
import useColumnConfig from '../../hooks/useColumnConfig';
import ColumnResizeHandle from '../common/ColumnResizeHandle';
import AlignmentContextMenu from '../common/AlignmentContextMenu';
import { useIsMobile } from '../../hooks/useIsMobile';

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

const Badge = ({ children, color = C.navy, glow = false, small = false }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: small ? "1px 7px" : "2px 10px",
    borderRadius: 4, fontSize: small ? 10 : 11, fontWeight: 600, letterSpacing: 0.3,
    color, background: glow ? color + "14" : "transparent",
    border: "1px solid " + color + "30", whiteSpace: "nowrap",
  }}>{children}</span>
);

const getScoreStyle = (score) => {
  if (score >= 80) return { color: "#92670A", background: "#FFFBEB", border: "1px solid #D4A017AA" };
  if (score >= 40) return { color: "#1E40AF", background: "#EFF6FF", border: "1px solid #1E40AF40" };
  return { color: "#6B7280", background: "#F3F4F6", border: "1px solid #6B728040" };
};

const ScorePill = ({ score }) => {
  const s = getScoreStyle(score);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 8px", borderRadius: 4,
      background: s.background, border: s.border,
      fontSize: 10, fontWeight: 700, color: s.color,
      fontFamily: "'JetBrains Mono', monospace",
      letterSpacing: "0.05em", flexShrink: 0, whiteSpace: "nowrap",
    }}>SCORE {score}</span>
  );
};

const LISTVIEW_COLS = [
  { key: 'client', width: 320, align: 'left' },
  { key: 'type', width: 250, align: 'center' },
  { key: 'industry', width: 100, align: 'left' },
  { key: 'count', width: 72, align: 'right' },
  { key: 'manager', width: 180, align: 'center' },
  { key: 'score', width: 125, align: 'center' },
  { key: 'actions', width: 65, align: 'left' },
];

const LISTVIEW_ARCHIVE_COLS = [
  { key: 'client', width: 280, align: 'left' },
  { key: 'type', width: 70, align: 'left' },
  { key: 'industry', width: 140, align: 'left' },
  { key: 'count', width: 70, align: 'left' },
  { key: 'manager', width: 112, align: 'left' },
  { key: 'actions', width: 80, align: 'right' },
];

export default function ListView({ filteredLists, filterStatus, setFilterStatus, filterType, setFilterType, searchQuery, setSearchQuery, sortBy, setSortBy, setSelectedList, callListData, setCallListData, listFormOpen, setListFormOpen, editingListId, setEditingListId, now, isAdmin = false, clientData = [], contactsByClient = {} }) {
  const isMobile = useIsMobile();
  const { columns: lvCols, gridTemplateColumns: lvGrid, contentMinWidth: lvMinW, onResizeStart: lvResize, onHeaderContextMenu: lvCtxMenu, contextMenu: lvCtx, setAlign: lvSetAlign, resetAll: lvReset, closeMenu: lvClose } = useColumnConfig('listView', LISTVIEW_COLS);
  const { columns: arCols, gridTemplateColumns: arGrid, contentMinWidth: arMinW, onResizeStart: arResize, onHeaderContextMenu: arCtxMenu, contextMenu: arCtx, setAlign: arSetAlign, resetAll: arReset, closeMenu: arClose } = useColumnConfig('listViewArchive', LISTVIEW_ARCHIVE_COLS);
  const clientOptions = clientData.filter(c => c.status === "支援中" || c.status === "停止中");

  // 担当者名を苗字のみで表示（CRMの同一クライアント担当者内で苗字被りがあれば名の頭文字付き）
  const shortManagerName = (list) => {
    const full = list.manager || '';
    if (!full) return '';
    const parts = full.split(/\s+/);
    const surname = parts[0];
    if (parts.length < 2) return surname;
    // CRMに登録されている同一クライアントの担当者から苗字被りを判定
    const client = clientData.find(c => c.company === list.company);
    const contacts = client ? (contactsByClient[client._supaId] || []) : [];
    const sameSurname = contacts.filter(ct => {
      const ctParts = (ct.name || '').split(/\s+/);
      return ctParts[0] === surname && ct.name !== full;
    });
    if (sameSurname.length > 0) return `${surname}(${parts[1][0]})`;
    return surname;
  };
  const emptyForm = { company: "", type: "M&A仲介", status: "架電可能", industry: "", count: "", manager: "", contactId: null, companyInfo: "", companyUrl: "", scriptBody: "", cautions: "", notes: "" };
  const [formData, setFormData] = useState(emptyForm);
  const [showRec, setShowRec] = useState(true);
  const [displayFilter, setDisplayFilter] = useState('active');

  // Step1: 足切り（定休日・非推奨帯・timeScore 40以下を除外）
  const callable = filteredLists.filter(l =>
    l.status === "架電可能" &&
    l.recommendation &&
    l.recommendation.timeScore > 40
  );
  // Step2: インポートから1週間以内のものに絞る
  const withinOneWeek = callable.filter(l => {
    if (!l.created_at) return false;
    const daysSinceImport = (Date.now() - new Date(l.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceImport <= 7;
  });
  console.log('callable:', callable.length);
  console.log('withinOneWeek:', withinOneWeek.length);
  console.log('sample created_at:', callable[0]?.created_at);
  // Step3: インポート日が新しい順にソートして最大10件
  const topRecommended = [...withinOneWeek]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 10);

  const handleOpenAdd = () => {
    setFormData(emptyForm);
    setEditingListId(null);
    setListFormOpen(true);
  };

  const handleOpenEdit = (list) => {
    setFormData({
      company: list.company, type: list.type, status: list.status,
      industry: list.industry, count: String(list.count), manager: list.manager,
      contactId: list.contactId || null,
      companyInfo: list.companyInfo || "", companyUrl: list.companyUrl || "", scriptBody: list.scriptBody || "", cautions: list.cautions || "", notes: list.notes || "",
    });
    setEditingListId(list.id);
    setListFormOpen(true);
  };

  const handleSave = async () => {
    if (!formData.company || !formData.industry || !formData.count) return;
    if (editingListId !== null) {
      const target = callListData.find(l => l.id === editingListId);
      if (target?._supaId) {
        const error = await updateCallList(target._supaId, formData);
        if (error) { alert('保存に失敗しました: ' + (error.message || '不明なエラー')); return; }
      }
      setCallListData(prev => prev.map(l => l.id === editingListId ? { ...l, company: formData.company, type: formData.type, status: formData.status, industry: formData.industry, count: parseInt(formData.count) || 0, manager: formData.manager, companyInfo: formData.companyInfo, scriptBody: formData.scriptBody, cautions: formData.cautions, notes: formData.notes } : l));
    } else {
      const { result, error } = await insertCallList(formData);
      if (error || !result) { alert('保存に失敗しました: ' + (error?.message || '不明なエラー')); return; }
      const newId = Math.max(0, ...callListData.map(l => l.id)) + 1;
      setCallListData(prev => [...prev, { id: newId, ...formData, count: parseInt(formData.count) || 0, _supaId: result.id }]);
    }
    setListFormOpen(false);
    setEditingListId(null);
    setFormData(emptyForm);
  };

  const handleDelete = async (id) => {
    const target = callListData.find(l => l.id === id);
    if (!target?._supaId) { alert('Supabase IDが未設定のためアーカイブできません。'); return; }
    if (!window.confirm('このリストをアーカイブしますか？')) return;
    const error = await archiveCallList(target._supaId);
    if (error) { alert('アーカイブに失敗しました: ' + (error.message || '不明なエラー')); return; }
    setCallListData(prev => prev.map(l => l.id === id ? { ...l, is_archived: true } : l));
  };

  const inputStyle = {
    padding: "8px 12px", borderRadius: 6,
    background: C.white, border: "1px solid " + C.border,
    color: C.textDark, fontSize: 12, fontFamily: "'Noto Sans JP'", outline: "none",
  };
  const formInputStyle = {
    padding: "10px 14px", borderRadius: 6,
    background: C.offWhite, border: "1px solid " + C.border,
    color: C.textDark, fontSize: 13, fontFamily: "'Noto Sans JP'", outline: "none", width: "100%",
  };

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      {/* ページヘッダー */}
      <div style={{ marginBottom: 24, paddingBottom: 14, borderBottom: '1px solid #0D2247' }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#0D2247', letterSpacing: '-0.3px' }}>Lists</div>
        <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>架電リスト管理</div>
      </div>
      {/* 時間外メッセージ */}
      {now && (now.getHours() < 7 || now.getHours() >= 20) && (
        <div style={{ background: "#fff", borderRadius: 4, padding: "14px 20px", marginBottom: 16, border: "1px solid #E5E7EB", borderLeft: "4px solid " + C.textLight, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13 }}>夜</span>
          <span style={{ fontSize: 12, color: C.textMid, fontWeight: 600 }}>この時間帯は架電時間外です</span>
          <span style={{ fontSize: 10, color: C.textLight }}>（7:00〜20:00が架電推奨時間帯）</span>
        </div>
      )}

      {/* Recommendation Banner */}
      {topRecommended.length > 0 && showRec && !(now && (now.getHours() < 7 || now.getHours() >= 20)) && (
        <div style={{
          background: "#fff", borderRadius: 4, padding: isMobile ? "10px 12px" : "16px 20px", marginBottom: 16,
          border: "1px solid #E5E7EB", borderLeft: "2px solid #1E40AF",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, animation: "pulse 2s infinite" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>現在のおすすめリスト</span>
              <span style={{ fontSize: 10, color: C.textLight }}>
                {now ? (DAY_NAMES[now.getDay()] + "曜日 " + now.getHours() + "時台") : ""}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#1E40AF", background: "#EFF6FF", padding: "1px 8px", borderRadius: 8 }}>
                {topRecommended.length}件
              </span>
            </div>
            <button onClick={() => setShowRec(false)} style={{
              background: "transparent", border: "none", cursor: "pointer",
              fontSize: 14, color: C.textLight, padding: "2px 6px",
            }}>×</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
            {topRecommended.slice(0, 8).map((list, i) => (
              <button key={list.id} onClick={() => setSelectedList(list.id)} style={{
                background: "#F8F9FA", border: "1px solid #E5E7EB",
                borderRadius: 4, padding: "10px 14px", cursor: "pointer",
                textAlign: "left", color: C.textDark,
                fontFamily: "'Noto Sans JP', sans-serif",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#EFF6FF"; e.currentTarget.style.borderColor = "#1E40AF50"; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.offWhite; e.currentTarget.style.borderColor = C.borderLight; }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, flex: 1, minWidth: 0, wordBreak: "break-all" }}>{list.company}</span>
                  <ScorePill score={list.recommendation.score} />
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <Badge color={C.textLight} small>{list.industry}</Badge>
                  <Badge color={C.textLight} small>{list.count.toLocaleString()}社</Badge>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {[['active', 'アクティブのみ'], ['archived', 'アーカイブのみ'], ['all', '全て表示']].map(([val, label]) => (
          <button key={val} onClick={() => setDisplayFilter(val)} style={{
            padding: "6px 16px", borderRadius: 4, fontSize: 12, fontWeight: 600,
            cursor: "pointer", transition: "all 0.15s", fontFamily: "'Noto Sans JP'",
            ...(displayFilter === val
              ? { background: "#0D2247", color: "#fff", border: "1px solid #0D2247" }
              : { background: "#fff", color: "#6B7280", border: "1px solid #E5E7EB" }),
          }}
          onMouseEnter={e => { if (displayFilter !== val) e.currentTarget.style.background = "#F9FAFB"; }}
          onMouseLeave={e => { if (displayFilter !== val) e.currentTarget.style.background = "#fff"; }}
          >{label}</button>
        ))}
      </div>

      {/* Filters */}
      <div style={{
        display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center",
        padding: isMobile ? "10px 12px" : "14px 18px", background: "#fff", borderRadius: 4,
        border: "1px solid #E5E7EB",
      }}>
        <input type="text" placeholder="企業名・業種・担当者で検索..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ ...inputStyle, flex: "1 1 200px", minWidth: 180 }} />
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={inputStyle}>
          <option value="all">全種別</option>
          <option value="M&A仲介">M&A仲介</option>
          <option value="IFA">IFA</option>
          <option value="ファンド">ファンド</option>
          <option value="売り手FA">売り手FA</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={inputStyle}>
          <option value="date">日付順</option>
          <option value="manager">担当者別</option>
        </select>
        <span style={{ fontSize: 11, color: C.textLight, fontWeight: 600, fontFamily: "'JetBrains Mono'" }}>{displayFilter === 'archived' ? callListData.filter(l => l.is_archived).length : displayFilter === 'all' ? filteredLists.length + callListData.filter(l => l.is_archived).length : filteredLists.length}件</span>
        {isAdmin && <button onClick={handleOpenAdd} style={{
          padding: "8px 18px", borderRadius: 4, marginLeft: "auto",
          background: "#0D2247",
          border: "none", color: "#fff", cursor: "pointer",
          fontSize: 12, fontWeight: 600, fontFamily: "'Noto Sans JP'",
          whiteSpace: "nowrap",
        }}>＋ リスト追加</button>}
      </div>

      {/* Add/Edit Form */}
      {listFormOpen && (
        <div style={{
          background: "#fff", border: "1px solid #E5E7EB", borderRadius: 4,
          padding: isMobile ? 14 : 24, marginBottom: 20, animation: "fadeIn 0.2s ease",
          borderLeft: "2px solid #0D2247",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{editingListId !== null ? "リストを編集" : "新しいリストを追加"}</div>
            <button onClick={() => { setListFormOpen(false); setEditingListId(null); }} style={{
              width: 28, height: 28, borderRadius: 6, background: C.offWhite,
              border: "1px solid " + C.border, color: C.textMid, cursor: "pointer", fontSize: 14,
            }}>✕</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>クライアント企業名 *</label>
              <select value={formData.company} onChange={e => setFormData(p => ({ ...p, company: e.target.value, contactId: null, manager: '' }))} style={formInputStyle}>
                <option value="">クライアントを選択...</option>
                {clientOptions.map(c => (
                  <option key={c._supaId || c.company} value={c.company}>
                    {c.company}{c.status === "停止中" ? "（停止中）" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>種別</label>
              <select value={formData.type} onChange={e => setFormData(p => ({ ...p, type: e.target.value }))} style={formInputStyle}>
                <option value="M&A仲介">M&A仲介</option>
                <option value="IFA">IFA</option>
                <option value="ファンド">ファンド</option>
                <option value="売り手FA">売り手FA</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>業種 *</label>
              <input value={formData.industry} onChange={e => setFormData(p => ({ ...p, industry: e.target.value }))} style={formInputStyle} placeholder="例: 建設" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>リスト社数 *</label>
              <input type="number" value={formData.count} onChange={e => setFormData(p => ({ ...p, count: e.target.value }))} style={formInputStyle} placeholder="例: 1000" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>クライアント担当者</label>
              {(() => {
                const selectedClient = clientOptions.find(c => c.company === formData.company);
                const contacts = selectedClient ? (contactsByClient[selectedClient._supaId] || []) : [];
                return contacts.length > 0 ? (
                  <select value={formData.contactId || ''} onChange={e => {
                    const ctId = e.target.value || null;
                    const ct = contacts.find(c => c.id === ctId);
                    setFormData(p => ({ ...p, contactId: ctId, manager: ct?.name || '' }));
                  }} style={formInputStyle}>
                    <option value="">担当者を選択...</option>
                    {contacts.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                  </select>
                ) : (
                  <input value={formData.manager} onChange={e => setFormData(p => ({ ...p, manager: e.target.value }))} style={formInputStyle} placeholder="例: 田中（CRMで担当者を登録すると選択可能）" />
                );
              })()}
            </div>
<div style={{ gridColumn: "span 3" }}>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>企業概要</label>
              <textarea
                value={formData.companyInfo}
                onChange={e => setFormData(p => ({ ...p, companyInfo: e.target.value }))}
                style={{ ...formInputStyle, minHeight: 60, resize: 'vertical' }}
                placeholder="クライアントの企業概要を入力..."
              />
            </div>
            <div style={{ gridColumn: "span 3" }}>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>スクリプト <span style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 400 }}>（Scriptsページでマーカー編集可）</span></label>
              <textarea
                value={formData.scriptBody}
                onChange={e => setFormData(p => ({ ...p, scriptBody: e.target.value }))}
                style={{ ...formInputStyle, minHeight: 100, resize: 'vertical' }}
                placeholder="架電スクリプトを入力..."
              />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>注意事項</label>
              <textarea value={formData.cautions} onChange={e => setFormData(p => ({ ...p, cautions: e.target.value }))} style={{ ...formInputStyle, minHeight: 50, resize: "vertical" }} placeholder="架電時の注意事項を入力..." />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>備考</label>
              <textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} style={{ ...formInputStyle, minHeight: 50, resize: "vertical" }} placeholder="任意" />
            </div>
          </div>
          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <button onClick={handleSave} disabled={!formData.company || !formData.industry || !formData.count} style={{
              padding: "10px 28px", borderRadius: 4,
              background: formData.company && formData.industry && formData.count ? '#0D2247' : C.border,
              border: "none", color: "#fff",
              cursor: formData.company && formData.industry && formData.count ? "pointer" : "not-allowed",
              fontSize: 13, fontWeight: 600, fontFamily: "'Noto Sans JP'",
            }}>{editingListId !== null ? "更新する" : "追加する"}</button>
            <button onClick={() => { setListFormOpen(false); setEditingListId(null); }} style={{
              padding: "10px 20px", borderRadius: 4,
              background: "#fff", border: "1px solid #0D2247",
              color: "#0D2247", cursor: "pointer", fontSize: 13, fontFamily: "'Noto Sans JP'",
            }}>キャンセル</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{
        background: "#fff", border: "1px solid #E5E7EB",
        borderRadius: 4, overflowX: "auto", overflowY: "hidden",
      }}>
        <div style={{ minWidth: lvMinW }}>
        <div style={{
          display: "grid", gridTemplateColumns: lvGrid,
          padding: isMobile ? "6px 10px" : "8px 16px", background: "#0D2247",
          fontSize: isMobile ? 10 : 11, fontWeight: 600, color: "#fff", verticalAlign: 'middle',
        }}>
          {['クライアント', '種別', '業種', '社数', '担当者', 'おすすめ度', ''].map((label, i) => (
            <span key={i} onContextMenu={e => lvCtxMenu(e, i)} style={{ position: 'relative', textAlign: lvCols[i]?.align || 'left', minWidth: 0, cursor: 'default', userSelect: 'none' }}>
              {label}
              {i < 6 && <ColumnResizeHandle colIndex={i} onResizeStart={lvResize} />}
            </span>
          ))}
        </div>
        {displayFilter !== 'archived' && <div style={{ maxHeight: 600, overflowY: "auto" }}>
          {(() => {
            const grouped = {};
            filteredLists.forEach(list => {
              const key = list.company;
              if (!grouped[key]) grouped[key] = [];
              grouped[key].push(list);
            });
            let idx = 0;
            return Object.entries(grouped).map(([client, lists]) => (
              <div key={client}>
                <div style={{
                  padding: "6px 16px", background: C.navy + "08",
                  borderBottom: "1px solid " + C.borderLight,
                  display: "flex", alignItems: "center", gap: 8,
                  position: "sticky", top: 0, zIndex: 1,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>{client}</span>
                  <span style={{ fontSize: 10, color: C.textLight }}>{lists.length}リスト・{lists.reduce((s,l)=>s+l.count,0).toLocaleString()}社</span>
                </div>
                {lists.map((list) => {
                  const i = idx++;
                  return (
                    <div key={list.id} style={{
                      display: "grid", gridTemplateColumns: lvGrid,
                      padding: "10px 16px",
                      borderBottom: "1px solid #F3F2F2",
                      fontSize: 12, alignItems: "center",
                      transition: "background 0.15s",
                      opacity: list.status === "架電停止" ? 0.4 : 1,
                      animation: "fadeIn 0.2s ease " + (i * 0.015) + "s both",
                      borderLeft: "2px solid transparent",
                      position: "relative",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#EAF4FF"; e.currentTarget.style.borderLeft = "2px solid #0D2247"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderLeft = "2px solid transparent"; }}
                    >
                      <span onClick={() => setSelectedList(list.id)} style={{ fontWeight: 500, paddingRight: 8, cursor: "pointer", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: lvCols[0]?.align || 'left' }}>
                        {list.status === "架電停止" && <span style={{ color: C.red, marginRight: 4 }}>■</span>}
                        {list.company}
                      </span>
                      <span style={{ display: "flex", justifyContent: lvCols[1]?.align === 'right' ? 'flex-end' : lvCols[1]?.align === 'center' ? 'center' : 'flex-start' }}><Badge color={list.type === "M&A仲介" ? C.navy : list.type === "IFA" ? '#6366F1' : list.type === "ファンド" ? C.green : C.orange} small>{list.type}</Badge></span>
                      <span style={{ color: C.textMid, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: lvCols[2]?.align || 'left' }}>{list.industry}</span>
                      <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: C.textMid, textAlign: lvCols[3]?.align || 'right' }}>{list.count.toLocaleString()}</span>
                      <span style={{ color: C.textMid, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: lvCols[4]?.align || 'center' }}>{shortManagerName(list)}</span>
                      <span style={{ display: "flex", justifyContent: lvCols[5]?.align === 'right' ? 'flex-end' : lvCols[5]?.align === 'center' ? 'center' : 'flex-start' }}>{list.status === "架電可能" && <ScorePill score={list.recommendation.score} />}</span>
                      {isAdmin && (
                        <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", display: "flex", gap: 4 }}>
                          <button onClick={() => handleOpenEdit(list)} title="編集" style={{
                            width: isMobile ? 36 : 26, height: isMobile ? 36 : 26, borderRadius: 4, background: C.offWhite,
                            border: "1px solid " + C.border, color: C.textMid, cursor: "pointer",
                            fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center",
                          }}>✎</button>
                          <button onClick={() => { handleDelete(list.id); }} title="削除" style={{
                            width: isMobile ? 36 : 26, height: isMobile ? 36 : 26, borderRadius: 4, background: C.redLight,
                            border: "1px solid " + C.red + "20", color: C.red, cursor: "pointer",
                            fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center",
                          }}>✕</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ));
          })()}
        </div>}
        {/* アーカイブ済みリスト */}
        {displayFilter !== 'active' && (() => {
          const archivedLists = callListData.filter(l => l.is_archived);
          if (archivedLists.length === 0) return <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 12, color: C.textLight }}>— No records —</div>;
          return (
            <div style={{ borderTop: displayFilter === 'all' ? "1px solid #E5E7EB" : "none", overflowX: "auto", overflowY: "hidden" }}>
              <div style={{ minWidth: arMinW }}>
              {archivedLists.map(list => (
                <div key={list.id} style={{
                  display: "grid", gridTemplateColumns: arGrid,
                  padding: "8px 16px", fontSize: 11, alignItems: "center",
                  borderBottom: "1px solid " + C.borderLight,
                  opacity: 0.5, background: C.offWhite,
                }}>
                  <span style={{ color: C.textMid, fontWeight: 500, textAlign: arCols[0]?.align || 'left' }}>{list.company}</span>
                  <span style={{ color: C.textLight, fontSize: 10, textAlign: arCols[1]?.align || 'left' }}>{list.type}</span>
                  <span style={{ color: C.textLight, textAlign: arCols[2]?.align || 'left' }}>{list.industry}</span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.textLight, textAlign: arCols[3]?.align || 'left' }}>{list.count.toLocaleString()}</span>
                  <span style={{ color: C.textLight, textAlign: arCols[4]?.align || 'left' }}>{shortManagerName(list)}</span>
                  <span style={{ textAlign: arCols[5]?.align || 'right' }}>
                    {isAdmin && <button onClick={async () => {
                      const error = await restoreCallList(list._supaId);
                      if (error) { alert('復元に失敗しました: ' + (error.message || '不明なエラー')); return; }
                      setCallListData(prev => prev.map(l => l.id === list.id ? { ...l, is_archived: false } : l));
                    }} style={{
                      padding: isMobile ? "8px 12px" : "4px 10px", borderRadius: 4, fontSize: isMobile ? 12 : 11, fontWeight: 500,
                      background: "#fff", color: "#0D2247", border: "1px solid #0D2247", cursor: "pointer",
                      fontFamily: "'Noto Sans JP'",
                    }}>復元</button>}
                  </span>
                </div>
              ))}
              </div>
            </div>
          );
        })()}
        </div>
      </div>
      {lvCtx.visible && (
        <AlignmentContextMenu
          x={lvCtx.x} y={lvCtx.y}
          currentAlign={lvCols[lvCtx.colIndex]?.align || 'left'}
          onSelect={align => lvSetAlign(lvCtx.colIndex, align)}
          onReset={lvReset}
          onClose={lvClose}
        />
      )}
      {arCtx.visible && (
        <AlignmentContextMenu
          x={arCtx.x} y={arCtx.y}
          currentAlign={arCols[arCtx.colIndex]?.align || 'left'}
          onSelect={align => arSetAlign(arCtx.colIndex, align)}
          onReset={arReset}
          onClose={arClose}
        />
      )}
    </div>
  );
}