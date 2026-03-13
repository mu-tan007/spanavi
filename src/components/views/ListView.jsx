import { useState } from 'react';
import { C } from '../../constants/colors';
import { updateCallList, insertCallList, archiveCallList, restoreCallList } from '../../lib/supabaseWrite';
import { supabase } from '../../lib/supabase';

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

const ScorePill = ({ score, label, color }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 7,
    padding: "3px 10px 3px 4px", borderRadius: 20,
    background: color + "10", border: "1px solid " + color + "25",
    flexShrink: 0,
  }}>
    <div style={{
      width: 26, height: 26, minWidth: 26, minHeight: 26, borderRadius: "50%",
      background: "conic-gradient(" + color + " " + (score * 3.6) + "deg, " + C.borderLight + " 0deg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      <div style={{
        width: 18, height: 18, minWidth: 18, minHeight: 18, borderRadius: "50%", background: C.white,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 8, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace",
        flexShrink: 0,
      }}>{score}</div>
    </div>
    <span style={{ fontSize: 11, fontWeight: 600, color, whiteSpace: "nowrap" }}>{label}</span>
  </div>
);

export default function ListView({ filteredLists, filterStatus, setFilterStatus, filterType, setFilterType, searchQuery, setSearchQuery, sortBy, setSortBy, setSelectedList, callListData, setCallListData, listFormOpen, setListFormOpen, editingListId, setEditingListId, now, isAdmin = false, clientData = [] }) {
  const clientOptions = clientData.filter(c => c.status === "支援中" || c.status === "停止中");
  const emptyForm = { company: "", type: "M&A仲介", status: "架電可能", industry: "", count: "", manager: "", companyInfo: "", companyUrl: "", scriptBody: "", cautions: "", notes: "" };
  const [formData, setFormData] = useState(emptyForm);
  const [showRec, setShowRec] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [generatingInfo, setGeneratingInfo] = useState(false);

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
      {/* 時間外メッセージ */}
      {now && (now.getHours() < 7 || now.getHours() >= 20) && (
        <div style={{ background: C.white, borderRadius: 10, padding: "14px 20px", marginBottom: 16, border: "1px solid " + C.borderLight, borderLeft: "4px solid " + C.textLight, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13 }}>🌙</span>
          <span style={{ fontSize: 12, color: C.textMid, fontWeight: 600 }}>この時間帯は架電時間外です</span>
          <span style={{ fontSize: 10, color: C.textLight }}>（7:00〜20:00が架電推奨時間帯）</span>
        </div>
      )}

      {/* Recommendation Banner */}
      {topRecommended.length > 0 && showRec && !(now && (now.getHours() < 7 || now.getHours() >= 20)) && (
        <div style={{
          background: C.white, borderRadius: 10, padding: "16px 20px", marginBottom: 16,
          border: "1px solid " + C.borderLight, borderLeft: "4px solid " + C.gold,
          boxShadow: "0 2px 8px rgba(26,58,92,0.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, animation: "pulse 2s infinite", boxShadow: "0 0 8px " + C.green + "60" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>現在のおすすめリスト</span>
              <span style={{ fontSize: 10, color: C.textLight }}>
                {now ? (DAY_NAMES[now.getDay()] + "曜日 " + now.getHours() + "時台") : ""}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.gold, background: C.gold + "15", padding: "1px 8px", borderRadius: 8 }}>
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
                background: C.offWhite, border: "1px solid " + C.borderLight,
                borderRadius: 8, padding: "10px 14px", cursor: "pointer",
                textAlign: "left", color: C.textDark,
                fontFamily: "'Noto Sans JP', sans-serif",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.gold + "0c"; e.currentTarget.style.borderColor = C.gold + "50"; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.offWhite; e.currentTarget.style.borderColor = C.borderLight; }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, flex: 1, minWidth: 0, wordBreak: "break-all" }}>{list.company}</span>
                  <ScorePill score={list.recommendation.score} label={list.recommendation.label} color={list.recommendation.color} />
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

      {/* Filters */}
      <div style={{
        display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center",
        padding: "14px 18px", background: C.white, borderRadius: 10,
        border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)",
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
        <span style={{ fontSize: 11, color: C.textLight, fontWeight: 600 }}>{filteredLists.length}件</span>
        {isAdmin && <button onClick={handleOpenAdd} style={{
          padding: "8px 18px", borderRadius: 8, marginLeft: "auto",
          background: "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")",
          border: "none", color: C.white, cursor: "pointer",
          fontSize: 12, fontWeight: 600, fontFamily: "'Noto Sans JP'",
          whiteSpace: "nowrap",
        }}>＋ リスト追加</button>}
      </div>

      {/* Add/Edit Form */}
      {listFormOpen && (
        <div style={{
          background: C.white, border: "1px solid " + C.gold + "40", borderRadius: 12,
          padding: 24, marginBottom: 20, animation: "fadeIn 0.2s ease",
          borderLeft: "4px solid " + C.gold,
          boxShadow: "0 2px 8px rgba(26,58,92,0.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{editingListId !== null ? "リストを編集" : "新しいリストを追加"}</div>
            <button onClick={() => { setListFormOpen(false); setEditingListId(null); }} style={{
              width: 28, height: 28, borderRadius: 6, background: C.offWhite,
              border: "1px solid " + C.border, color: C.textMid, cursor: "pointer", fontSize: 14,
            }}>✕</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>クライアント企業名 *</label>
              <select value={formData.company} onChange={e => setFormData(p => ({ ...p, company: e.target.value }))} style={formInputStyle}>
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
              <input value={formData.manager} onChange={e => setFormData(p => ({ ...p, manager: e.target.value }))} style={formInputStyle} placeholder="例: 田中" />
            </div>
<div style={{ gridColumn: "span 3" }}>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>企業概要</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <input
                  type="url"
                  value={formData.companyUrl || ''}
                  onChange={e => setFormData(p => ({ ...p, companyUrl: e.target.value }))}
                  placeholder="ホームページURLを入力して自動生成..."
                  style={{ ...formInputStyle, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!formData.companyUrl) return
                    setGeneratingInfo(true)
                    try {
                      const { data, error } = await supabase.functions.invoke('generate-company-info', {
                        body: { url: formData.companyUrl },
                      })
                      if (error) throw error
                      if (data?.text) setFormData(p => ({ ...p, companyInfo: data.text }))
                    } catch (e) {
                      console.error(e)
                      alert('企業概要の生成に失敗しました: ' + (e?.message || '不明なエラー'))
                    } finally {
                      setGeneratingInfo(false)
                    }
                  }}
                  disabled={generatingInfo || !formData.companyUrl}
                  style={{
                    padding: '8px 16px', borderRadius: 8, border: 'none',
                    cursor: generatingInfo ? 'not-allowed' : 'pointer',
                    background: 'linear-gradient(135deg, #c8a45a, #a8883a)',
                    color: '#fff', fontSize: 12, fontWeight: 700,
                    whiteSpace: 'nowrap', opacity: generatingInfo || !formData.companyUrl ? 0.6 : 1
                  }}
                >
                  {generatingInfo ? '生成中...' : '✨ 自動生成'}
                </button>
              </div>
              <textarea
                value={formData.companyInfo}
                onChange={e => setFormData(p => ({ ...p, companyInfo: e.target.value }))}
                style={{ ...formInputStyle, minHeight: 60, resize: 'vertical' }}
                placeholder="クライアントの企業概要を入力..."
              />
            </div>
            <div style={{ gridColumn: "span 3" }}>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>スクリプト</label>
              <textarea value={formData.scriptBody} onChange={e => setFormData(p => ({ ...p, scriptBody: e.target.value }))} style={{ ...formInputStyle, minHeight: 80, resize: "vertical" }} placeholder="架電スクリプトを入力..." />
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
              padding: "10px 28px", borderRadius: 8,
              background: formData.company && formData.industry && formData.count ? C.navy : C.border,
              border: "none", color: C.white,
              cursor: formData.company && formData.industry && formData.count ? "pointer" : "not-allowed",
              fontSize: 13, fontWeight: 600, fontFamily: "'Noto Sans JP'",
            }}>{editingListId !== null ? "更新する" : "追加する"}</button>
            <button onClick={() => { setListFormOpen(false); setEditingListId(null); }} style={{
              padding: "10px 20px", borderRadius: 8,
              background: C.offWhite, border: "1px solid " + C.border,
              color: C.textMid, cursor: "pointer", fontSize: 13, fontFamily: "'Noto Sans JP'",
            }}>キャンセル</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{
        background: C.white, border: "1px solid #E5E5E5",
        borderRadius: 8, overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "2fr 70px 1fr 70px 0.8fr 120px 60px",
          padding: "10px 16px", background: "#F3F2F2",
          fontSize: 11, fontWeight: 700, color: "#706E6B", letterSpacing: "0.06em",
          textTransform: "uppercase", borderBottom: "2px solid #E5E5E5",
        }}>
          <span>クライアント</span><span>種別</span><span>業種</span><span>社数</span><span>担当者</span><span>おすすめ度</span><span></span>
        </div>
        <div style={{ maxHeight: 600, overflowY: "auto" }}>
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
                      display: "grid", gridTemplateColumns: "2fr 70px 1fr 70px 0.8fr 120px 60px",
                      padding: "10px 16px",
                      borderBottom: "1px solid #F3F2F2",
                      fontSize: 12, alignItems: "center",
                      transition: "background 0.15s",
                      opacity: list.status === "架電停止" ? 0.4 : 1,
                      animation: "fadeIn 0.2s ease " + (i * 0.015) + "s both",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "#EAF4FF"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <span onClick={() => setSelectedList(list.id)} style={{ fontWeight: 500, paddingRight: 8, cursor: "pointer", wordBreak: "break-all" }}>
                        {list.status === "架電停止" && <span style={{ color: C.red, marginRight: 4 }}>■</span>}
                        {list.company}
        
                      </span>
                      <span><Badge color={list.type === "M&A仲介" ? C.navy : list.type === "IFA" ? C.gold : list.type === "ファンド" ? C.green : C.orange} small>{list.type}</Badge></span>
                      <span style={{ color: C.textMid }}>{list.industry}</span>
                      <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: C.textMid }}>{list.count.toLocaleString()}</span>
                      <span style={{ color: C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{list.manager}</span>
                      <span style={{ textAlign: "right" }}>{list.status === "架電可能" && <ScorePill score={list.recommendation.score} label={list.recommendation.label} color={list.recommendation.color} />}</span>
                      <span style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        {isAdmin && <>
                          <button onClick={() => handleOpenEdit(list)} title="編集" style={{
                            width: 26, height: 26, borderRadius: 4, background: C.offWhite,
                            border: "1px solid " + C.border, color: C.textMid, cursor: "pointer",
                            fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center",
                          }}>✎</button>
                          <button onClick={() => { handleDelete(list.id); }} title="削除" style={{
                            width: 26, height: 26, borderRadius: 4, background: C.redLight,
                            border: "1px solid " + C.red + "20", color: C.red, cursor: "pointer",
                            fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center",
                          }}>✕</button>
                        </>}
                      </span>
                    </div>
                  );
                })}
              </div>
            ));
          })()}
        </div>
        {/* アーカイブ済みリスト */}
        {isAdmin && (() => {
          const archivedLists = callListData.filter(l => l.is_archived);
          if (archivedLists.length === 0) return null;
          return (
            <div style={{ marginTop: 16 }}>
              <div onClick={() => setShowArchived(v => !v)} style={{
                padding: "8px 16px", background: C.offWhite,
                border: "1px solid " + C.borderLight, borderRadius: showArchived ? "8px 8px 0 0" : 8,
                display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                userSelect: "none",
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.textLight }}>
                  アーカイブ済み ({archivedLists.length}件)
                </span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: C.textLight }}>{showArchived ? "▲" : "▼"}</span>
              </div>
              {showArchived && <div style={{ border: "1px solid " + C.borderLight, borderTop: "none", borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
                {archivedLists.map(list => (
                  <div key={list.id} style={{
                    display: "grid", gridTemplateColumns: "2fr 70px 1fr 70px 0.8fr 80px",
                    padding: "8px 16px", fontSize: 11, alignItems: "center",
                    borderBottom: "1px solid " + C.borderLight,
                    opacity: 0.5, background: C.offWhite,
                  }}>
                    <span style={{ color: C.textMid, fontWeight: 500 }}>{list.company}</span>
                    <span style={{ color: C.textLight, fontSize: 10 }}>{list.type}</span>
                    <span style={{ color: C.textLight }}>{list.industry}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.textLight }}>{list.count.toLocaleString()}</span>
                    <span style={{ color: C.textLight }}>{list.manager}</span>
                    <span style={{ textAlign: "right" }}>
                      <button onClick={async () => {
                        const error = await restoreCallList(list._supaId);
                        if (error) { alert('復元に失敗しました: ' + (error.message || '不明なエラー')); return; }
                        setCallListData(prev => prev.map(l => l.id === list.id ? { ...l, is_archived: false } : l));
                      }} style={{
                        padding: "3px 10px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                        background: C.navy, color: C.white, border: "none", cursor: "pointer",
                        fontFamily: "'Noto Sans JP'",
                      }}>復元</button>
                    </span>
                  </div>
                ))}
              </div>}
            </div>
          );
        })()}
      </div>
    </div>
  );
}