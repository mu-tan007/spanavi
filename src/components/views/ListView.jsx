import { useState } from 'react';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card } from '../ui';
import { updateCallList, insertCallList, archiveCallList, restoreCallList } from '../../lib/supabaseWrite';
import { supabase } from '../../lib/supabase';
import useColumnConfig from '../../hooks/useColumnConfig';
import ColumnResizeHandle from '../common/ColumnResizeHandle';
import { useIsMobile } from '../../hooks/useIsMobile';
import PageHeader from '../common/PageHeader';
import TopListCard, { ProgressPill } from '../common/TopListCard';

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

const TypeBadge = ({ children, color: tone = color.navy, glow = false, small = false }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: small ? "1px 7px" : "2px 10px",
    borderRadius: radius.md, fontSize: small ? 10 : font.size.xs,
    fontWeight: font.weight.semibold, letterSpacing: 0.3,
    color: tone, background: glow ? alpha(tone, 0.08) : "transparent",
    border: `1px solid ${alpha(tone, 0.19)}`, whiteSpace: "nowrap",
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
      padding: "2px 8px", borderRadius: radius.md,
      background: s.background, border: s.border,
      fontSize: 10, fontWeight: font.weight.bold, color: s.color,
      fontFamily: font.family.mono,
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
  { key: 'progress', width: 110, align: 'center' },
  { key: 'score', width: 125, align: 'center' },
  { key: 'actions', width: 65, align: 'left' },
];


const LISTVIEW_ARCHIVE_COLS = [
  { key: 'client', width: 280, align: 'left' },
  { key: 'type', width: 70, align: 'left' },
  { key: 'industry', width: 140, align: 'left' },
  { key: 'count', width: 70, align: 'right' },
  { key: 'manager', width: 112, align: 'left' },
  { key: 'actions', width: 80, align: 'right' },
];

export default function ListView({ filteredLists, allLists, filterStatus, setFilterStatus, filterType, setFilterType, searchQuery, setSearchQuery, sortBy, setSortBy, setSelectedList, callListData, setCallListData, listFormOpen, setListFormOpen, editingListId, setEditingListId, now, isAdmin = false, clientData = [], contactsByClient = {}, onOpenIndustryRules }) {
  const isMobile = useIsMobile();
  const { columns: lvCols, gridTemplateColumns: lvGrid, contentMinWidth: lvMinW, onResizeStart: lvResize } = useColumnConfig('listView', LISTVIEW_COLS);
  const { columns: arCols, gridTemplateColumns: arGrid, contentMinWidth: arMinW, onResizeStart: arResize } = useColumnConfig('listViewArchive', LISTVIEW_ARCHIVE_COLS);
  const clientOptions = clientData.filter(c => c.status === "支援中" || c.status === "停止中");

  // 担当者名を苗字のみで表示（CRMの同一クライアント担当者内で苗字被りがあれば名の頭文字付き）
  const shortManagerName = (list) => {
    const fullNames = (list.manager || '').split(', ').filter(Boolean);
    if (fullNames.length === 0) return '';
    const client = clientData.find(c => c.company === list.company);
    const contacts = client ? (contactsByClient[client._supaId] || []) : [];
    return fullNames.map(full => {
      const parts = full.split(/\s+/);
      const surname = parts[0];
      if (parts.length < 2) return surname;
      const sameSurname = contacts.filter(ct => {
        const ctParts = (ct.name || '').split(/\s+/);
        return ctParts[0] === surname && ct.name !== full;
      });
      return sameSurname.length > 0 ? `${surname}(${parts[1][0]})` : surname;
    }).join('・');
  };
  const emptyForm = { company: "", type: "M&A仲介", status: "架電可能", industry: "", count: "", manager: "", contactIds: [], companyInfo: "", companyUrl: "", scriptBody: "", cautions: "", notes: "" };
  const [formData, setFormData] = useState(emptyForm);
  const [showRec, setShowRec] = useState(true);
  const [displayFilter, setDisplayFilter] = useState('active');

  // Dashboard の「現在のおすすめリスト TOP4」と同一ロジック: アクティブ + 架電可能 + recommendation あり、score降順 で TOP4
  // enrichedLists (allLists) を使うことで、現在のフィルタ状態に左右されない
  const topRecommended = (allLists || [])
    .filter(l => l.status === '架電可能' && !l.is_archived && l.recommendation)
    .sort((a, b) => (b.recommendation?.score || 0) - (a.recommendation?.score || 0))
    .slice(0, 4);

  const handleOpenAdd = () => {
    setFormData(emptyForm);
    setEditingListId(null);
    setListFormOpen(true);
  };

  const handleOpenEdit = (list) => {
    setFormData({
      company: list.company, type: list.type, status: list.status,
      industry: list.industry, count: String(list.count), manager: list.manager,
      contactIds: list.contactIds || [],
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
      setCallListData(prev => prev.map(l => l.id === editingListId ? { ...l, company: formData.company, type: formData.type, status: formData.status, industry: formData.industry, count: parseInt(formData.count) || 0, manager: formData.manager, contactIds: formData.contactIds, companyInfo: formData.companyInfo, scriptBody: formData.scriptBody, cautions: formData.cautions, notes: formData.notes } : l));
    } else {
      const { result, error } = await insertCallList(formData);
      if (error || !result) { alert('保存に失敗しました: ' + (error?.message || '不明なエラー')); return; }
      const newId = Math.max(0, ...callListData.map(l => l.id)) + 1;
      setCallListData(prev => [...prev, { id: newId, ...formData, contactIds: formData.contactIds, count: parseInt(formData.count) || 0, _supaId: result.id }]);
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
    padding: "8px 12px", borderRadius: radius.lg,
    background: color.white, border: `1px solid ${color.border}`,
    color: color.textDark, fontSize: font.size.sm, fontFamily: font.family.sans, outline: "none",
  };
  const formInputStyle = {
    padding: "10px 14px", borderRadius: radius.lg,
    background: color.offWhite, border: `1px solid ${color.border}`,
    color: color.textDark, fontSize: font.size.base, fontFamily: font.family.sans, outline: "none", width: "100%",
  };

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <PageHeader
        eyebrow="Sourcing · Lists"
        title="Lists"
        description="架電リスト管理"
        style={{ marginBottom: 24 }}
        right={onOpenIndustryRules ? (
          <Button variant="secondary" size="sm" onClick={onOpenIndustryRules}>業種別ルールを開く</Button>
        ) : null}
      />
      {/* 時間外メッセージ */}
      {now && (now.getHours() < 7 || now.getHours() >= 20) && (
        <div style={{ background: color.white, borderRadius: radius.md, padding: "14px 20px", marginBottom: space[4], border: `1px solid ${color.border}`, borderLeft: `4px solid ${color.textLight}`, display: "flex", alignItems: "center", gap: space[2] }}>
          <span style={{ fontSize: font.size.base }}>夜</span>
          <span style={{ fontSize: font.size.sm, color: color.textMid, fontWeight: font.weight.semibold }}>この時間帯は架電時間外です</span>
          <span style={{ fontSize: 10, color: color.textLight }}>（7:00〜20:00が架電推奨時間帯）</span>
        </div>
      )}

      {/* Recommendation Banner */}
      {topRecommended.length > 0 && showRec && !(now && (now.getHours() < 7 || now.getHours() >= 20)) && (
        <div style={{
          background: color.white, borderRadius: radius.md, padding: isMobile ? "10px 12px" : "16px 20px", marginBottom: space[4],
          border: `1px solid ${color.border}`, borderLeft: "2px solid #1E40AF",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: space[3] }}>
            <div style={{ display: "flex", alignItems: "center", gap: space[2] }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color.success, animation: "pulse 2s infinite" }} />
              <span style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: color.navy }}>現在のおすすめリスト</span>
              <span style={{ fontSize: 10, color: color.textLight }}>
                {now ? (DAY_NAMES[now.getDay()] + "曜日 " + now.getHours() + "時台") : ""}
              </span>
              <span style={{ fontSize: 10, fontWeight: font.weight.bold, color: "#1E40AF", background: "#EFF6FF", padding: "1px 8px", borderRadius: 8 }}>
                {topRecommended.length}件
              </span>
            </div>
            <button onClick={() => setShowRec(false)} style={{
              background: "transparent", border: "none", cursor: "pointer",
              fontSize: 14, color: color.textLight, padding: "2px 6px",
            }}>×</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)", gap: space[2.5] }}>
            {topRecommended.map(list => (
              <TopListCard key={list.id} list={list} onClick={() => setSelectedList(list.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: space[2], marginBottom: space[3] }}>
        {[['active', 'アクティブのみ'], ['archived', 'アーカイブのみ'], ['all', '全て表示']].map(([val, label]) => (
          <button key={val} onClick={() => setDisplayFilter(val)} style={{
            padding: "6px 16px", borderRadius: radius.md, fontSize: font.size.sm, fontWeight: font.weight.semibold,
            cursor: "pointer", transition: "all 0.15s", fontFamily: font.family.sans,
            ...(displayFilter === val
              ? { background: color.navy, color: color.white, border: `1px solid ${color.navy}` }
              : { background: color.white, color: color.textMid, border: `1px solid ${color.border}` }),
          }}
          onMouseEnter={e => { if (displayFilter !== val) e.currentTarget.style.background = color.gray50; }}
          onMouseLeave={e => { if (displayFilter !== val) e.currentTarget.style.background = color.white; }}
          >{label}</button>
        ))}
      </div>

      {/* Filters */}
      <div style={{
        display: "flex", gap: space[2.5], marginBottom: space[5], flexWrap: "wrap", alignItems: "center",
        padding: isMobile ? "10px 12px" : "14px 18px", background: color.white, borderRadius: radius.md,
        border: `1px solid ${color.border}`,
      }}>
        <input type="text" placeholder="企業名・業種・担当者で検索..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ ...inputStyle, flex: "1 1 200px", minWidth: 180 }} />
        {(() => {
          const STATUS_OPTIONS = ['架電可能', '架電停止'];
          const isAll = filterStatus.length === 0;
          const toggleStatus = (label) => {
            if (label === '全ステータス') { setFilterStatus([]); return; }
            setFilterStatus(prev => prev.includes(label) ? prev.filter(s => s !== label) : [...prev, label]);
          };
          return (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {['全ステータス', ...STATUS_OPTIONS].map(label => {
                const isActive = label === '全ステータス' ? isAll : filterStatus.includes(label);
                return (
                  <button key={label} onClick={() => toggleStatus(label)} style={{
                    padding: '5px 10px', borderRadius: radius.md, cursor: 'pointer',
                    fontSize: font.size.xs, fontWeight: font.weight.semibold, fontFamily: font.family.sans,
                    background: isActive ? color.navy : color.cream,
                    color: isActive ? color.white : color.textMid,
                    border: `1px solid ${isActive ? color.navy : color.border}`,
                    transition: 'all 0.12s', whiteSpace: 'nowrap',
                  }}>{label}</button>
                );
              })}
            </div>
          );
        })()}
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
        <span style={{ fontSize: font.size.xs, color: color.textLight, fontWeight: font.weight.semibold, fontFamily: font.family.mono }}>{displayFilter === 'archived' ? callListData.filter(l => l.is_archived).length : displayFilter === 'all' ? filteredLists.length + callListData.filter(l => l.is_archived).length : filteredLists.length}件</span>
        {isAdmin && (
          <div style={{ marginLeft: 'auto' }}>
            <Button variant="primary" size="sm" onClick={handleOpenAdd}>＋ リスト追加</Button>
          </div>
        )}
      </div>

      {/* Add/Edit Form */}
      {listFormOpen && (
        <div style={{
          background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md,
          padding: isMobile ? 14 : 24, marginBottom: space[5], animation: "fadeIn 0.2s ease",
          borderLeft: `2px solid ${color.navy}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: space[4] }}>
            <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy }}>{editingListId !== null ? "リストを編集" : "新しいリストを追加"}</div>
            <button onClick={() => { setListFormOpen(false); setEditingListId(null); }} style={{
              width: 28, height: 28, borderRadius: radius.lg, background: color.offWhite,
              border: `1px solid ${color.border}`, color: color.textMid, cursor: "pointer", fontSize: 14,
            }}>✕</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ fontSize: font.size.xs, color: color.textLight, display: "block", marginBottom: 4, fontWeight: font.weight.semibold }}>クライアント企業名 *</label>
              <select value={formData.company} onChange={e => setFormData(p => ({ ...p, company: e.target.value, contactIds: [], manager: '' }))} style={formInputStyle}>
                <option value="">クライアントを選択...</option>
                {clientOptions.map(c => (
                  <option key={c._supaId || c.company} value={c.company}>
                    {c.company}{c.status === "停止中" ? "（停止中）" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: font.size.xs, color: color.textLight, display: "block", marginBottom: 4, fontWeight: font.weight.semibold }}>種別</label>
              <select value={formData.type} onChange={e => setFormData(p => ({ ...p, type: e.target.value }))} style={formInputStyle}>
                <option value="M&A仲介">M&A仲介</option>
                <option value="IFA">IFA</option>
                <option value="ファンド">ファンド</option>
                <option value="売り手FA">売り手FA</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: font.size.xs, color: color.textLight, display: "block", marginBottom: 4, fontWeight: font.weight.semibold }}>業種 *</label>
              <input value={formData.industry} onChange={e => setFormData(p => ({ ...p, industry: e.target.value }))} style={formInputStyle} placeholder="例: 建設" />
            </div>
            <div>
              <label style={{ fontSize: font.size.xs, color: color.textLight, display: "block", marginBottom: 4, fontWeight: font.weight.semibold }}>リスト社数 *</label>
              <input type="number" value={formData.count} onChange={e => setFormData(p => ({ ...p, count: e.target.value }))} style={formInputStyle} placeholder="例: 1000" />
            </div>
            <div>
              <label style={{ fontSize: font.size.xs, color: color.textLight, display: "block", marginBottom: 4, fontWeight: font.weight.semibold }}>クライアント担当者</label>
              {(() => {
                const selectedClient = clientOptions.find(c => c.company === formData.company);
                const contacts = selectedClient ? (contactsByClient[selectedClient._supaId] || []) : [];
                return contacts.length > 0 ? (
                  <div style={{ ...formInputStyle, display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 14px' }}>
                    {contacts.map(ct => (
                      <label key={ct.id} style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.sm, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={(formData.contactIds || []).includes(ct.id)}
                          onChange={e => {
                            const ids = e.target.checked
                              ? [...(formData.contactIds || []), ct.id]
                              : (formData.contactIds || []).filter(id => id !== ct.id);
                            const names = ids.map(id => contacts.find(c => c.id === id)?.name || '').filter(Boolean).join(', ');
                            setFormData(p => ({ ...p, contactIds: ids, manager: names }));
                          }}
                          style={{ accentColor: color.navy }}
                        />
                        <span style={{ color: color.textDark }}>{ct.name}</span>
                      </label>
                    ))}
                    {contacts.length === 0 && <span style={{ fontSize: font.size.xs, color: color.textLight }}>担当者未登録</span>}
                  </div>
                ) : (
                  <input value={formData.manager} onChange={e => setFormData(p => ({ ...p, manager: e.target.value }))} style={formInputStyle} placeholder="例: 田中（CRMで担当者を登録すると選択可能）" />
                );
              })()}
            </div>
<div style={{ gridColumn: "span 3" }}>
              <label style={{ fontSize: font.size.xs, color: color.textLight, display: "block", marginBottom: 4, fontWeight: font.weight.semibold }}>企業概要</label>
              <textarea
                value={formData.companyInfo}
                onChange={e => setFormData(p => ({ ...p, companyInfo: e.target.value }))}
                style={{ ...formInputStyle, minHeight: 60, resize: 'vertical' }}
                placeholder="クライアントの企業概要を入力..."
              />
            </div>
            <div style={{ gridColumn: "span 3" }}>
              <label style={{ fontSize: font.size.xs, color: color.textLight, display: "block", marginBottom: 4, fontWeight: font.weight.semibold }}>スクリプト <span style={{ fontSize: 9, color: color.gray400, fontWeight: font.weight.normal }}>（Scriptsページでマーカー編集可）</span></label>
              <textarea
                value={formData.scriptBody}
                onChange={e => setFormData(p => ({ ...p, scriptBody: e.target.value }))}
                style={{ ...formInputStyle, minHeight: 100, resize: 'vertical' }}
                placeholder="架電スクリプトを入力..."
              />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ fontSize: font.size.xs, color: color.textLight, display: "block", marginBottom: 4, fontWeight: font.weight.semibold }}>注意事項</label>
              <textarea value={formData.cautions} onChange={e => setFormData(p => ({ ...p, cautions: e.target.value }))} style={{ ...formInputStyle, minHeight: 50, resize: "vertical" }} placeholder="架電時の注意事項を入力..." />
            </div>
            <div>
              <label style={{ fontSize: font.size.xs, color: color.textLight, display: "block", marginBottom: 4, fontWeight: font.weight.semibold }}>備考</label>
              <textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} style={{ ...formInputStyle, minHeight: 50, resize: "vertical" }} placeholder="任意" />
            </div>
          </div>
          <div style={{ marginTop: space[4], display: "flex", gap: space[2.5] }}>
            <Button
              variant="primary"
              size="md"
              onClick={handleSave}
              disabled={!formData.company || !formData.industry || !formData.count}
            >{editingListId !== null ? "更新する" : "追加する"}</Button>
            <Button
              variant="outline"
              size="md"
              onClick={() => { setListFormOpen(false); setEditingListId(null); }}
            >キャンセル</Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{
        background: color.white, border: `1px solid ${color.border}`,
        borderRadius: radius.md, overflowX: "auto", overflowY: "hidden",
      }}>
        <div style={{ minWidth: lvMinW }}>
        <div style={{
          display: "grid", gridTemplateColumns: lvGrid,
          padding: isMobile ? "6px 10px" : "8px 16px", background: color.navy,
          fontSize: isMobile ? 10 : font.size.xs, fontWeight: font.weight.semibold, color: color.white, verticalAlign: 'middle',
        }}>
          {['クライアント', '種別', '業種', '社数', '担当者', '架電進捗率', 'おすすめ度', ''].map((label, i) => (
            <span key={i} style={{ position: 'relative', textAlign: lvCols[i]?.align || 'left', minWidth: 0, cursor: 'default', userSelect: 'none' }}>
              {label}
              {i < 7 && <ColumnResizeHandle colIndex={i} onResizeStart={lvResize} />}
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
                  padding: "6px 16px", background: alpha(color.navy, 0.03),
                  borderBottom: `1px solid ${color.borderLight}`,
                  display: "flex", alignItems: "center", gap: space[2],
                  position: "sticky", top: 0, zIndex: 1,
                }}>
                  <span style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.navy }}>{client}</span>
                  <span style={{ fontSize: 10, color: color.textLight }}>{lists.length}リスト・{lists.reduce((s,l)=>s+l.count,0).toLocaleString()}社</span>
                </div>
                {lists.map((list) => {
                  const i = idx++;
                  return (
                    <div key={list.id} style={{
                      display: "grid", gridTemplateColumns: lvGrid,
                      padding: "10px 16px",
                      borderBottom: `1px solid ${color.offWhite}`,
                      fontSize: font.size.sm, alignItems: "center",
                      transition: "background 0.15s",
                      opacity: list.status === "架電停止" ? 0.4 : 1,
                      animation: "fadeIn 0.2s ease " + (i * 0.015) + "s both",
                      borderLeft: "2px solid transparent",
                      position: "relative",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#EAF4FF"; e.currentTarget.style.borderLeft = `2px solid ${color.navy}`; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderLeft = "2px solid transparent"; }}
                    >
                      <span onClick={() => setSelectedList(list.id)} style={{ fontWeight: font.weight.medium, paddingRight: space[2], cursor: "pointer", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: lvCols[0]?.align || 'left' }}>
                        {list.status === "架電停止" && <span style={{ color: color.danger, marginRight: 4 }}>■</span>}
                        {list.company}
                      </span>
                      <span style={{ display: "flex", justifyContent: lvCols[1]?.align === 'right' ? 'flex-end' : lvCols[1]?.align === 'center' ? 'center' : 'flex-start' }}><TypeBadge color={list.type === "M&A仲介" ? color.navy : list.type === "IFA" ? '#6366F1' : list.type === "ファンド" ? color.success : color.warn} small>{list.type}</TypeBadge></span>
                      <span style={{ color: color.textMid, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: lvCols[2]?.align || 'left' }}>{list.industry}</span>
                      <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs, color: color.textMid, textAlign: lvCols[3]?.align || 'right' }}>{list.count.toLocaleString()}</span>
                      <span style={{ color: color.textMid, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: lvCols[4]?.align || 'center' }}>{shortManagerName(list)}</span>
                      <span style={{ display: "flex", justifyContent: lvCols[5]?.align === 'right' ? 'flex-end' : lvCols[5]?.align === 'center' ? 'center' : 'flex-start' }}><ProgressPill pct={list.call_progress_pct} /></span>
                      <span style={{ display: "flex", justifyContent: lvCols[6]?.align === 'right' ? 'flex-end' : lvCols[6]?.align === 'center' ? 'center' : 'flex-start' }}>{list.status === "架電可能" && <ScorePill score={list.recommendation.score} />}</span>
                      {isAdmin && (
                        <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", display: "flex", gap: 4 }}>
                          <button onClick={() => handleOpenEdit(list)} title="編集" style={{
                            width: isMobile ? 36 : 26, height: isMobile ? 36 : 26, borderRadius: radius.md, background: color.offWhite,
                            border: `1px solid ${color.border}`, color: color.textMid, cursor: "pointer",
                            fontSize: font.size.xs, display: "flex", alignItems: "center", justifyContent: "center",
                          }}>✎</button>
                          <button onClick={() => { handleDelete(list.id); }} title="削除" style={{
                            width: isMobile ? 36 : 26, height: isMobile ? 36 : 26, borderRadius: radius.md, background: color.dangerSoft,
                            border: `1px solid ${alpha(color.danger, 0.13)}`, color: color.danger, cursor: "pointer",
                            fontSize: font.size.xs, display: "flex", alignItems: "center", justifyContent: "center",
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
          if (archivedLists.length === 0) return <div style={{ padding: "24px 16px", textAlign: "center", fontSize: font.size.sm, color: color.textLight }}>— No records —</div>;
          return (
            <div style={{ borderTop: displayFilter === 'all' ? `1px solid ${color.border}` : "none", overflowX: "auto", overflowY: "hidden" }}>
              <div style={{ minWidth: arMinW }}>
              {archivedLists.map(list => (
                <div key={list.id} style={{
                  display: "grid", gridTemplateColumns: arGrid,
                  padding: "8px 16px", fontSize: font.size.xs, alignItems: "center",
                  borderBottom: `1px solid ${color.borderLight}`,
                  opacity: 0.5, background: color.offWhite,
                }}>
                  <span style={{ color: color.textMid, fontWeight: font.weight.medium, textAlign: arCols[0]?.align || 'left' }}>{list.company}</span>
                  <span style={{ color: color.textLight, fontSize: 10, textAlign: arCols[1]?.align || 'left' }}>{list.type}</span>
                  <span style={{ color: color.textLight, textAlign: arCols[2]?.align || 'left' }}>{list.industry}</span>
                  <span style={{ fontFamily: font.family.mono, fontSize: 10, color: color.textLight, textAlign: arCols[3]?.align || 'left' }}>{list.count.toLocaleString()}</span>
                  <span style={{ color: color.textLight, textAlign: arCols[4]?.align || 'left' }}>{shortManagerName(list)}</span>
                  <span style={{ textAlign: arCols[5]?.align || 'right' }}>
                    {isAdmin && <button onClick={async () => {
                      const error = await restoreCallList(list._supaId);
                      if (error) { alert('復元に失敗しました: ' + (error.message || '不明なエラー')); return; }
                      setCallListData(prev => prev.map(l => l.id === list.id ? { ...l, is_archived: false } : l));
                    }} style={{
                      padding: isMobile ? "8px 12px" : "4px 10px", borderRadius: radius.md, fontSize: isMobile ? font.size.sm : font.size.xs, fontWeight: font.weight.medium,
                      background: color.white, color: color.navy, border: `1px solid ${color.navy}`, cursor: "pointer",
                      fontFamily: font.family.sans,
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
    </div>
  );
}