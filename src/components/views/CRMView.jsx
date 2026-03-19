import { useState } from 'react';
import { C } from '../../constants/colors';
import { updateClient, insertClient, deleteClient } from '../../lib/supabaseWrite';

const NAVY = '#0D2247';
const BLUE = '#1E40AF';
const GRAY_200 = '#E5E7EB';
const GRAY_50 = '#F8F9FA';

export default function CRMView({ isAdmin, clientData, setClientData, rewardMaster = [] }) {
  const [statusFilter, setStatusFilter] = useState("支援中");
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);
  const [showRewardDetail, setShowRewardDetail] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [addForm, setAddForm] = useState(null);
  const [addSaving, setAddSaving] = useState(false);
  const [addToast, setAddToast] = useState(null);

  const statusList = ["支援中", "準備中", "停止中", "保留", "中期フォロー", "面談予定"];
  const statusStyle = (st) => {
    if (st === "支援中") return { bg: C.green + "15", color: C.green, dot: C.green };
    if (st === "準備中") return { bg: C.gold + "15", color: C.gold, dot: C.gold };
    if (st === "停止中") return { bg: "#e5383515", color: "#e53835", dot: "#e53835" };
    if (st === "保留") return { bg: C.textLight + "15", color: C.textLight, dot: C.textLight };
    if (st === "中期フォロー") return { bg: NAVY + "10", color: NAVY, dot: NAVY };
    if (st === "面談予定") return { bg: "#7c3aed15", color: "#7c3aed", dot: "#7c3aed" };
    return { bg: C.textLight + "10", color: C.textLight, dot: C.textLight };
  };

  const filtered = clientData.filter(c => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (search && !c.company.includes(search) && !c.industry.includes(search)) return false;
    return true;
  });

  const statusCounts = {};
  clientData.forEach(c => { statusCounts[c.status] = (statusCounts[c.status] || 0) + 1; });

  const rewardMap = {};
  rewardMaster.forEach(r => {
    if (!rewardMap[r.id]) rewardMap[r.id] = { name: r.name, timing: r.timing, basis: r.basis, tax: r.tax, tiers: [] };
    rewardMap[r.id].tiers.push(r);
  });

  const getRewardSummary = (typeId) => {
    const rm = rewardMap[typeId];
    if (!rm) return "-";
    if (rm.tiers.length === 1) return rm.tiers[0].memo;
    return rm.name;
  };

  const contactIcon = (ct) => {
    if (ct === "LINE") return "\u{1F4AC}";
    if (ct === "Slack") return "\u{1F4BC}";
    if (ct === "Chatwork") return "\u{1F4DD}";
    if (ct === "メール") return "\u2709";
    return "\u{1F4DE}";
  };

  const colTemplate = setClientData
    ? "0.8fr 2fr 0.6fr 0.5fr 0.7fr 0.6fr 0.6fr 0.5fr 32px"
    : "0.8fr 2fr 0.6fr 0.5fr 0.7fr 0.6fr 0.6fr 0.5fr";

  const handleSaveEdit = async () => {
    if (!editForm || !setClientData) return;
    const idx = editForm._idx;
    const updated = { ...editForm };
    delete updated._idx;
    if (updated._supaId) {
      const error = await updateClient(updated._supaId, updated);
      if (error) { alert('保存に失敗しました: ' + (error.message || '不明なエラー')); return; }
    }
    setClientData(prev => prev.map((c, i) => i === idx ? updated : c));
    setEditForm(null);
    setSelectedClient(updated);
  };

  const handleSaveAdd = async () => {
    if (!addForm || !setClientData) return;
    if (!addForm.company?.trim()) { alert('企業名を入力してください'); return; }
    setAddSaving(true);
    const { result, error } = await insertClient(addForm);
    setAddSaving(false);
    if (error) { alert('保存に失敗しました: ' + (error.message || '不明なエラー')); return; }
    const newClient = {
      _supaId: result.id,
      no: result.sort_order || 0,
      status: result.status || addForm.status || '準備中',
      contract: result.contract_status || addForm.contract || '未',
      company: result.name || addForm.company,
      industry: result.industry || addForm.industry || '',
      target: result.supply_target || addForm.target || 0,
      rewardType: result.reward_type || addForm.rewardType || '',
      paySite: result.payment_site || addForm.paySite || '',
      payNote: result.payment_note || addForm.payNote || '',
      listSrc: result.list_source || addForm.listSrc || '',
      calendar: result.calendar_type || addForm.calendar || '',
      contact: result.contact_method || addForm.contact || '',
      noteFirst: (result.notes || addForm.noteFirst || '').replace(/\\n/g, '\n'),
      noteKickoff: (result.note_kickoff || '').replace(/\\n/g, '\n'),
      noteRegular: (result.note_regular || '').replace(/\\n/g, '\n'),
    };
    setClientData(prev => [newClient, ...prev]);
    setAddForm(null);
    setAddToast('顧客を追加しました');
    setTimeout(() => setAddToast(null), 3000);
  };

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      {/* Page Header */}
      <div style={{ marginBottom: 24, paddingBottom: 14, borderBottom: '1px solid #0D2247' }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#0D2247', letterSpacing: '-0.3px' }}>CRM</div>
        <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>顧客関係管理・商談パイプライン</div>
      </div>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16,
        padding: "14px 18px", background: '#fff', borderRadius: 4,
        border: "1px solid " + GRAY_200,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>顧客管理（CRM）</span>
          <span style={{ fontSize: 11, color: C.textLight }}>{filtered.length}社</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="企業名・業界..."
            style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid " + GRAY_200, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", width: 180 }} />
          {setClientData && (
            <button onClick={() => setAddForm({ status: '準備中', contract: '未', company: '', industry: '', target: 0, rewardType: '', paySite: '', payNote: '', listSrc: '', calendar: '', contact: '', noteFirst: '' })}
              style={{ padding: "8px 16px", borderRadius: 4, border: "none", background: NAVY, color: '#fff', fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'Noto Sans JP'", whiteSpace: "nowrap" }}>
              ＋ 新規顧客追加
            </button>
          )}
        </div>
      </div>

      {/* Status tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => setStatusFilter("all")} style={{
          padding: "6px 14px", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Sans JP'",
          border: "1px solid " + (statusFilter === "all" ? NAVY : GRAY_200),
          background: statusFilter === "all" ? NAVY : '#fff', color: statusFilter === "all" ? '#fff' : C.textMid,
        }}>全て <span style={{ fontSize: 10, opacity: 0.7 }}>{clientData.length}</span></button>
        {statusList.map(st => {
          const sc = statusStyle(st);
          const active = statusFilter === st;
          return (
            <button key={st} onClick={() => setStatusFilter(st)} style={{
              padding: "6px 14px", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Sans JP'",
              border: "1px solid " + (active ? sc.color : GRAY_200),
              background: active ? sc.bg : '#fff', color: active ? sc.color : C.textMid,
              display: "flex", alignItems: "center", gap: 4,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.dot }}></span>
              {st} <span style={{ fontSize: 10, opacity: 0.7 }}>{statusCounts[st] || 0}</span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div style={{ border: '1px solid ' + GRAY_200, borderRadius: 4, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: colTemplate,
          padding: "8px 16px", background: NAVY,
          fontSize: 11, fontWeight: 600, color: '#fff',
          verticalAlign: 'middle',
        }}>
          <span style={{ verticalAlign: 'middle' }}>ステータス</span><span style={{ verticalAlign: 'middle' }}>企業名</span><span style={{ verticalAlign: 'middle' }}>業界</span><span style={{ verticalAlign: 'middle' }}>目標</span><span style={{ verticalAlign: 'middle' }}>報酬体系</span><span style={{ verticalAlign: 'middle' }}>リスト</span><span style={{ verticalAlign: 'middle' }}>カレンダー</span><span style={{ verticalAlign: 'middle' }}>連絡</span>{setClientData && <span></span>}
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: "30px 0", textAlign: "center", color: C.textLight, fontSize: 12 }}>データがありません</div>
        ) : filtered.map((c, i) => {
          const sc = statusStyle(c.status);
          const globalIdx = clientData.indexOf(c);
          return (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: colTemplate,
              padding: "8px 16px", fontSize: 11, alignItems: "center",
              borderBottom: '1px solid ' + GRAY_200,
              background: i % 2 === 0 ? '#fff' : GRAY_50,
              cursor: "pointer", transition: "background 0.15s",
            }} onClick={() => setSelectedClient(c)}
              onMouseEnter={e => e.currentTarget.style.background = "#EAF4FF"}
              onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : GRAY_50}>
              <span style={{
                borderLeft: '3px solid ' + sc.color, paddingLeft: 8, color: sc.color, fontSize: 12,
                display: "inline-block", width: "fit-content",
              }}>{c.status}</span>
              <span style={{ fontWeight: 600, color: NAVY }}>{c.company}</span>
              <span style={{ color: C.textMid, fontSize: 10, textAlign: 'left' }}>{c.industry}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, fontWeight: 700, color: c.target > 0 ? NAVY : C.textLight, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{c.target > 0 ? c.target + "件" : "-"}</span>
              <span onClick={e => { e.stopPropagation(); setShowRewardDetail(c.rewardType); }} style={{
                fontSize: 10, fontWeight: 600, color: NAVY, cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted",
              }}>{c.rewardType ? c.rewardType + " " + getRewardSummary(c.rewardType).slice(0, 10) : "-"}</span>
              <span style={{ fontSize: 10, color: C.textMid, textAlign: 'left' }}>{c.listSrc || "-"}</span>
              <span style={{ fontSize: 10, color: C.textMid, textAlign: 'left' }}>{c.calendar || "-"}</span>
              <span style={{ fontSize: 12 }}>{contactIcon(c.contact)}</span>
              {setClientData && <span style={{ textAlign: "center" }}><button onClick={e => { e.stopPropagation(); setEditForm({ ...c, _idx: globalIdx }); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 2 }}>&#9998;</button></span>}
            </div>
          );
        })}
      </div>

      {/* Client Detail Modal */}
      {selectedClient && !editForm && (() => {
        const c = selectedClient;
        const sc = statusStyle(c.status);
        const rm = rewardMap[c.rewardType];
        const globalIdx = clientData.indexOf(c);
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => setSelectedClient(null)}>
            <div style={{ background: '#fff', border: '1px solid ' + GRAY_200, borderRadius: 4, width: 600, maxHeight: "90vh", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ padding: "12px 24px", background: NAVY, borderRadius: "4px 4px 0 0", color: '#fff', fontWeight: 600, fontSize: 15 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ borderLeft: '3px solid ' + sc.color, paddingLeft: 8, color: sc.color, fontSize: 12 }}>{c.status}</span>
                  <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 3, background: "rgba(255,255,255,0.15)", color: '#fff' }}>{c.contract === "済" ? "契約済" : c.contract}</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>{c.company}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>{c.industry}{c.target > 0 ? " ・ 月間目標 " + c.target + "件" : ""}</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  {[
                    { label: "報酬体系", val: c.rewardType ? c.rewardType + " (" + (rm ? rm.name : "") + ")" : "-" },
                    { label: "税区分", val: rm ? rm.tax : "-" },
                    { label: "支払サイト", val: c.paySite || "-" },
                    { label: "支払特記", val: c.payNote || "-" },
                    { label: "リスト負担", val: c.listSrc || "-" },
                    { label: "カレンダー", val: c.calendar || "-" },
                    { label: "連絡手段", val: c.contact || "-" },
                    { label: "供給目標", val: c.target > 0 ? c.target + "件/月" : "-" },
                  ].map((item, idx) => (
                    <div key={idx}>
                      <div style={{ fontSize: 9, fontWeight: 600, color: C.textLight, marginBottom: 2 }}>{item.label}</div>
                      <div style={{ fontSize: 12, color: C.textDark, fontWeight: 500 }}>{item.val}</div>
                    </div>
                  ))}
                </div>
                {rm && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, borderBottom: '2px solid ' + NAVY, paddingBottom: 6, marginBottom: 12 }}>報酬体系詳細（{c.rewardType}）</div>
                    <div style={{ fontSize: 10, color: C.textLight, marginBottom: 6 }}>{rm.timing} ・ {rm.basis} ・ {rm.tax}</div>
                    {rm.tiers.map((t, ti) => (
                      <div key={ti} style={{ display: "flex", justifyContent: "space-between", padding: "8px 16px", fontSize: 11, background: ti % 2 === 0 ? '#fff' : GRAY_50, borderBottom: '1px solid ' + GRAY_200, verticalAlign: 'middle' }}>
                        <span style={{ color: C.textMid }}>{t.memo}</span>
                        <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, color: NAVY, fontVariantNumeric: 'tabular-nums' }}>¥{Number(t.price).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
                {(c.noteFirst || c.noteKickoff || c.noteRegular) && (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, borderBottom: '2px solid ' + NAVY, paddingBottom: 6, marginBottom: 12 }}>備考</div>
                    {[
                      { label: "初回面談時", val: c.noteFirst },
                      { label: "キックオフミーティング時", val: c.noteKickoff },
                      { label: "定期ミーティング時", val: c.noteRegular },
                    ].filter(n => n.val).map((n, ni) => (
                      <div key={ni} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: NAVY, marginBottom: 2, display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ width: 4, height: 4, borderRadius: "50%", background: NAVY, display: "inline-block" }}></span>{n.label}
                        </div>
                        <div style={{ fontSize: 11, color: C.textMid, whiteSpace: "pre-wrap", lineHeight: 1.6, padding: "4px 0 4px 8px", borderLeft: "2px solid " + GRAY_200, maxHeight: 150, overflow: "auto" }}>{n.val.replace(/\\n/g, "\n")}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ padding: "10px 20px", borderTop: "1px solid " + GRAY_200, display: "flex", justifyContent: "space-between" }}>
                {setClientData ? <button onClick={() => { setSelectedClient(null); setEditForm({ ...c, _idx: globalIdx }); }} style={{
                  padding: "8px 16px", borderRadius: 4, border: '1px solid ' + NAVY, background: '#fff',
                  cursor: "pointer", fontSize: 13, fontWeight: 500, color: NAVY, fontFamily: "'Noto Sans JP'",
                }}>&#9998; 編集</button> : <div></div>}
                <button onClick={() => setSelectedClient(null)} style={{
                  padding: "8px 16px", borderRadius: 4, border: "none",
                  background: NAVY,
                  cursor: "pointer", fontSize: 13, fontWeight: 500, color: '#fff', fontFamily: "'Noto Sans JP'",
                }}>閉じる</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Toast */}
      {addToast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: NAVY, color: '#fff', padding: "10px 20px", borderRadius: 4, fontSize: 12, fontWeight: 600, zIndex: 30000, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", fontFamily: "'Noto Sans JP'" }}>
          {addToast}
        </div>
      )}

      {/* Add Modal */}
      {addForm && setClientData && (() => {
        const inputStyle = { width: "100%", padding: "6px 10px", borderRadius: 4, border: "1px solid " + GRAY_200, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", background: GRAY_50 };
        const labelStyle = { fontSize: 10, fontWeight: 600, color: NAVY, marginBottom: 2, display: "block" };
        const u = (k, v) => setAddForm(p => ({ ...p, [k]: v }));
        const rewardIds = [...new Set(rewardMaster.map(r => r.id))].sort();
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20001, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: '#fff', border: '1px solid ' + GRAY_200, borderRadius: 4, width: 580, maxHeight: "90vh", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
              <div style={{ padding: "12px 24px", background: NAVY, borderRadius: "4px 4px 0 0", color: '#fff', fontWeight: 600, fontSize: 15 }}>
                新規顧客を追加
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={labelStyle}>ステータス</label>
                    <select value={addForm.status} onChange={e => u("status", e.target.value)} style={inputStyle}>
                      {statusList.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div><label style={labelStyle}>契約</label>
                    <select value={addForm.contract} onChange={e => u("contract", e.target.value)} style={inputStyle}>
                      <option value="済">済</option><option value="未">未</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ ...labelStyle, color: C.red }}>企業名 <span style={{ fontWeight: 400 }}>*</span></label>
                    <input value={addForm.company} onChange={e => u("company", e.target.value)} placeholder="株式会社○○" style={inputStyle} />
                  </div>
                  <div><label style={labelStyle}>業界</label><input value={addForm.industry} onChange={e => u("industry", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>供給目標（件/月）</label><input type="number" value={addForm.target} onChange={e => u("target", Number(e.target.value))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>報酬体系</label>
                    <select value={addForm.rewardType} onChange={e => u("rewardType", e.target.value)} style={inputStyle}>
                      <option value="">-</option>
                      {rewardIds.map(id => <option key={id} value={id}>{id} - {rewardMap[id] ? rewardMap[id].name : ""}</option>)}
                    </select>
                  </div>
                  <div><label style={labelStyle}>支払サイト</label><input value={addForm.paySite} onChange={e => u("paySite", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>支払特記事項</label><input value={addForm.payNote} onChange={e => u("payNote", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>リスト負担</label>
                    <select value={addForm.listSrc} onChange={e => u("listSrc", e.target.value)} style={inputStyle}>
                      <option value="">-</option><option value="当社持ち">当社持ち</option><option value="先方持ち">先方持ち</option><option value="両方">両方</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>カレンダー</label>
                    <select value={addForm.calendar} onChange={e => u("calendar", e.target.value)} style={inputStyle}>
                      <option value="">-</option><option value="Google">Google</option><option value="Spir">Spir</option><option value="Outlook">Outlook</option><option value="なし">なし</option><option value="調整アポ">調整アポ</option><option value="Google(入力)">Google(入力)</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>連絡手段</label>
                    <select value={addForm.contact} onChange={e => u("contact", e.target.value)} style={inputStyle}>
                      <option value="">-</option><option value="LINE">LINE</option><option value="Slack">Slack</option><option value="Chatwork">Chatwork</option><option value="メール">メール</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>初回面談メモ</label>
                    <textarea value={addForm.noteFirst} onChange={e => u("noteFirst", e.target.value)} rows={4}
                      style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
                  </div>
                </div>
              </div>
              <div style={{ padding: "10px 20px", borderTop: "1px solid " + GRAY_200, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setAddForm(null)} style={{ padding: "8px 16px", borderRadius: 4, border: '1px solid ' + NAVY, background: '#fff', cursor: "pointer", fontSize: 13, fontWeight: 500, color: NAVY, fontFamily: "'Noto Sans JP'" }}>キャンセル</button>
                <button onClick={handleSaveAdd} disabled={addSaving} style={{ padding: "8px 16px", borderRadius: 4, border: "none", background: addSaving ? C.textLight : NAVY, cursor: addSaving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, color: '#fff', fontFamily: "'Noto Sans JP'" }}>
                  {addSaving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit Modal */}
      {editForm && setClientData && (() => {
        const inputStyle = { width: "100%", padding: "6px 10px", borderRadius: 4, border: "1px solid " + GRAY_200, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", background: GRAY_50 };
        const labelStyle = { fontSize: 10, fontWeight: 600, color: NAVY, marginBottom: 2, display: "block" };
        const u = (k, v) => setEditForm(p => ({ ...p, [k]: v }));
        const rewardIds = [...new Set(rewardMaster.map(r => r.id))].sort();
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20001, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: '#fff', border: '1px solid ' + GRAY_200, borderRadius: 4, width: 580, maxHeight: "90vh", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
              <div style={{ padding: "12px 24px", background: NAVY, borderRadius: "4px 4px 0 0", color: '#fff', fontWeight: 600, fontSize: 15 }}>
                顧客情報を編集 — {editForm.company}
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={labelStyle}>ステータス</label>
                    <select value={editForm.status} onChange={e => u("status", e.target.value)} style={inputStyle}>
                      {statusList.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div><label style={labelStyle}>契約</label>
                    <select value={editForm.contract} onChange={e => u("contract", e.target.value)} style={inputStyle}>
                      <option value="済">済</option><option value="未">未</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>企業名</label><input value={editForm.company} onChange={e => u("company", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>業界</label><input value={editForm.industry} onChange={e => u("industry", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>供給目標（件/月）</label><input type="number" value={editForm.target} onChange={e => u("target", Number(e.target.value))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>報酬体系</label>
                    <select value={editForm.rewardType} onChange={e => u("rewardType", e.target.value)} style={inputStyle}>
                      <option value="">-</option>
                      {rewardIds.map(id => <option key={id} value={id}>{id} - {rewardMap[id] ? rewardMap[id].name : ""}</option>)}
                    </select>
                  </div>
                  <div><label style={labelStyle}>支払サイト</label><input value={editForm.paySite} onChange={e => u("paySite", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>支払特記事項</label><input value={editForm.payNote} onChange={e => u("payNote", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>リスト負担</label>
                    <select value={editForm.listSrc} onChange={e => u("listSrc", e.target.value)} style={inputStyle}>
                      <option value="当社持ち">当社持ち</option><option value="先方持ち">先方持ち</option><option value="両方">両方</option><option value="">-</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>カレンダー</label>
                    <select value={editForm.calendar} onChange={e => u("calendar", e.target.value)} style={inputStyle}>
                      <option value="Google">Google</option><option value="Spir">Spir</option><option value="Outlook">Outlook</option><option value="なし">なし</option><option value="調整アポ">調整アポ</option><option value="Google(入力)">Google(入力)</option><option value="">-</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>連絡手段</label>
                    <select value={editForm.contact} onChange={e => u("contact", e.target.value)} style={inputStyle}>
                      <option value="LINE">LINE</option><option value="Slack">Slack</option><option value="Chatwork">Chatwork</option><option value="メール">メール</option><option value="">-</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, borderBottom: '2px solid ' + NAVY, paddingBottom: 6, marginBottom: 12, marginTop: 4 }}>備考</div>
                    <div style={{ marginBottom: 8 }}>
                      <label style={labelStyle}>初回面談時</label>
                      <textarea value={(editForm.noteFirst || "").replace(/\\n/g, "\n")} onChange={e => u("noteFirst", e.target.value)} rows={4}
                        style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <label style={labelStyle}>キックオフミーティング時</label>
                      <textarea value={(editForm.noteKickoff || "").replace(/\\n/g, "\n")} onChange={e => u("noteKickoff", e.target.value)} rows={4}
                        style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
                    </div>
                    <div>
                      <label style={labelStyle}>定期ミーティング時</label>
                      <textarea value={(editForm.noteRegular || "").replace(/\\n/g, "\n")} onChange={e => u("noteRegular", e.target.value)} rows={4}
                        style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ padding: "10px 20px", borderTop: "1px solid " + GRAY_200, display: "flex", justifyContent: "space-between" }}>
                <button onClick={async () => {
                  if (editForm._supaId) {
                    const error = await deleteClient(editForm._supaId);
                    if (error) { alert('削除に失敗しました: ' + (error.message || '不明なエラー')); return; }
                  }
                  setClientData(prev => prev.filter((_, i) => i !== editForm._idx));
                  setEditForm(null); setSelectedClient(null);
                }} style={{ padding: "8px 16px", borderRadius: 4, border: "1px solid #DC2626", background: '#fff', cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#DC2626", fontFamily: "'Noto Sans JP'" }}>削除</button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setEditForm(null)} style={{ padding: "8px 16px", borderRadius: 4, border: '1px solid ' + NAVY, background: '#fff', cursor: "pointer", fontSize: 13, fontWeight: 500, color: NAVY, fontFamily: "'Noto Sans JP'" }}>キャンセル</button>
                  <button onClick={handleSaveEdit} style={{
                    padding: "8px 16px", borderRadius: 4, border: "none",
                    background: NAVY,
                    cursor: "pointer", fontSize: 13, fontWeight: 500, color: '#fff', fontFamily: "'Noto Sans JP'",
                  }}>保存</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Reward Detail Popup */}
      {showRewardDetail && rewardMap[showRewardDetail] && (() => {
        const rm = rewardMap[showRewardDetail];
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.4)", zIndex: 20002, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => setShowRewardDetail(null)}>
            <div style={{ background: '#fff', border: '1px solid ' + GRAY_200, borderRadius: 4, width: 440, boxShadow: "0 8px 32px rgba(0,0,0,0.3)", overflow: "hidden" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ padding: "12px 24px", background: NAVY, color: '#fff', fontWeight: 600, fontSize: 15 }}>
                報酬体系 {showRewardDetail}: {rm.name}
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 2, fontWeight: 400 }}>{rm.timing} ・ {rm.basis} ・ {rm.tax}</div>
              </div>
              <div style={{ padding: "12px 18px" }}>
                {rm.tiers.map((t, ti) => (
                  <div key={ti} style={{ display: "flex", justifyContent: "space-between", padding: "8px 16px", fontSize: 12, background: ti % 2 === 0 ? '#fff' : GRAY_50, borderBottom: '1px solid ' + GRAY_200, verticalAlign: 'middle' }}>
                    <span style={{ color: C.textDark }}>{t.memo}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, color: NAVY, fontVariantNumeric: 'tabular-nums' }}>¥{Number(t.price).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: "8px 18px", borderTop: "1px solid " + GRAY_200, textAlign: "right" }}>
                <button onClick={() => setShowRewardDetail(null)} style={{
                  padding: "8px 16px", borderRadius: 4, border: "none", background: NAVY,
                  cursor: "pointer", fontSize: 13, fontWeight: 500, color: '#fff', fontFamily: "'Noto Sans JP'",
                }}>閉じる</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
