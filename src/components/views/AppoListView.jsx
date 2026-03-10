import { useState, useEffect } from 'react';
import React from 'react';
import { C } from '../../constants/colors';
import { AVAILABLE_MONTHS } from '../../constants/availableMonths';
import { calcRankAndRate } from '../../utils/calculations';
import { updateAppointment, insertAppointment, deleteAppointment, updateAppoCounted, updateMember, insertMember, deleteMember, updateMemberReward, invokeSyncZoomUsers } from '../../lib/supabaseWrite';

export function MemberSuggestInput({ value, onChange, members = [], style, placeholder = '名前を入力して絞り込み' }) {
  const [suggs, setSuggs] = React.useState([]);
  const [show, setShow] = React.useState(false);
  const [rect, setRect] = React.useState(null);
  const inputRef = React.useRef(null);
  const memberNames = React.useMemo(
    () => members.map(m => typeof m === 'string' ? m : m.name || '').filter(Boolean),
    [members]
  );
  const open = (val) => {
    const r = inputRef.current?.getBoundingClientRect();
    if (r) setRect({ top: r.bottom + 2, left: r.left, width: r.width });
    const filtered = val ? memberNames.filter(n => n.includes(val)) : memberNames;
    setSuggs(filtered);
    setShow(filtered.length > 0);
  };
  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={value}
        onChange={e => { onChange(e.target.value); open(e.target.value); }}
        onFocus={() => open('')}
        onBlur={() => setTimeout(() => setShow(false), 150)}
        style={style}
        placeholder={placeholder}
      />
      {show && rect && (
        <div style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width,
          background: C.white, border: '1px solid ' + C.border, borderRadius: 4,
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)', zIndex: 99999, maxHeight: 180, overflowY: 'auto' }}>
          {suggs.map((name, i) => (
            <div key={i}
              onMouseDown={() => { onChange(name); setShow(false); }}
              style={{ padding: '7px 12px', fontSize: 11, cursor: 'pointer', color: C.textDark, fontFamily: "'Noto Sans JP'" }}
              onMouseEnter={e => e.currentTarget.style.background = C.offWhite}
              onMouseLeave={e => e.currentTarget.style.background = C.white}
            >{name}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AppoListView({ appoData, setAppoData, members = [], setMembers, clientData = [], rewardMaster = [] }) {
  const clientOptions = clientData.filter(c => c.status === "支援中" || c.status === "停止中");
  // ── ランク・レート自動計算 ──────────────────────────────────────
  const [apPeriod, setApPeriod] = useState(() =>
    localStorage.getItem('spanavi_appo_period') || "all"
  );
  const [apSelectedMonth, setApSelectedMonth] = useState(() => {
    const s = localStorage.getItem('spanavi_appo_month');
    return (s && AVAILABLE_MONTHS.some(m => m.yyyymm === s)) ? s : (AVAILABLE_MONTHS[0]?.yyyymm || "2026-03");
  });
  const [apCustomFrom, setApCustomFrom] = useState(() =>
    localStorage.getItem('spanavi_appo_from') || ""
  );
  const [apCustomTo, setApCustomTo] = useState(() =>
    localStorage.getItem('spanavi_appo_to') || ""
  );
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editForm, setEditForm] = useState(null);
  const [addAppoForm, setAddAppoForm] = useState(null);
  const [reportDetail, setReportDetail] = useState(null); // Appointment detail modal
  const [showRecordingDetail, setShowRecordingDetail] = useState(false);
  const [detailEditing, setDetailEditing] = useState(false);
  const [detailEditForm, setDetailEditForm] = useState(null);
  const [detailSaving, setDetailSaving] = useState(false);
  useEffect(() => {
    setShowRecordingDetail(false);
    setDetailEditing(false); setDetailEditForm(null);
  }, [reportDetail]);

  useEffect(() => {
    localStorage.setItem('spanavi_appo_period', apPeriod);
    localStorage.setItem('spanavi_appo_month', apSelectedMonth);
    localStorage.setItem('spanavi_appo_from', apCustomFrom);
    localStorage.setItem('spanavi_appo_to', apCustomTo);
  }, [apPeriod, apSelectedMonth, apCustomFrom, apCustomTo]);

  const statuses = [...new Set(appoData.map(a => a.status))];

  const statusOrder = { "面談済": 0, "事前確認済": 1, "アポ取得": 2, "リスケ中": 3, "キャンセル": 4 };
  const filtered = appoData.filter(a => {
    const dm = a.meetDate ? a.meetDate.slice(0, 7) : "";
    if (apPeriod === "month") { if (dm !== apSelectedMonth) return false; }
    else if (apPeriod === "custom") {
      if (apCustomFrom && dm < apCustomFrom) return false;
      if (apCustomTo && dm > apCustomTo) return false;
    }
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (search && !a.company.includes(search) && !a.client.includes(search) && !a.getter.includes(search)) return false;
    return true;
  }).sort((a, b) => {
    const sa = statusOrder[a.status] ?? 99;
    const sb = statusOrder[b.status] ?? 99;
    if (sa !== sb) return sa - sb;
    return (a.meetDate || "").localeCompare(b.meetDate || "");
  });

  const countableStatuses = ["面談済", "事前確認済", "アポ取得"];
  const countable = filtered.filter(a => countableStatuses.includes(a.status));
  const totalSales = countable.reduce((s, a) => s + (a.sales || 0), 0);
  const totalReward = countable.reduce((s, a) => s + (a.reward || 0), 0);

  const monthStats = AVAILABLE_MONTHS.map(({ label, yyyymm }) => {
    const items = appoData.filter(a =>
      a.meetDate && a.meetDate.slice(0, 7) === yyyymm && countableStatuses.includes(a.status)
    );
    return { month: label, count: items.length,
      sales: items.reduce((s, a) => s + (a.sales || 0), 0),
      reward: items.reduce((s, a) => s + (a.reward || 0), 0) };
  });

  const statusColor = (st) => {
    if (st === "面談済") return { bg: C.green + "12", color: C.green };
    if (st === "事前確認済") return { bg: C.navy + "10", color: C.navy };
    if (st === "アポ取得") return { bg: C.gold + "15", color: C.gold };
    if (st === "リスケ中") return { bg: "#ff980012", color: "#ff9800" };
    if (st === "キャンセル" || st.includes("キャンセル")) return { bg: "#e5383512", color: "#e53835" };
    return { bg: C.textLight + "10", color: C.textLight };
  };

  const colTemplate = setAppoData
    ? "1.2fr 1.2fr 0.6fr 0.6fr 0.6fr 0.5fr 0.6fr 0.6fr 32px"
    : "1.2fr 1.2fr 0.6fr 0.6fr 0.6fr 0.5fr 0.6fr 0.6fr";

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16,
        padding: "14px 18px", background: C.white, borderRadius: 10,
        border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>アポ一覧</span>
          <span style={{ fontSize: 11, color: C.textLight }}>{filtered.length}件</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="企業名・クライアント・取得者..."
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", width: 200 }} />
          {/* 月 / 期間指定 */}
          <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
            {[["all", "全月"], ["month", "月"], ["custom", "期間指定"]].map(([k, l]) => (
              <button key={k} onClick={() => setApPeriod(k)} style={{
                padding: "5px 10px", borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: "pointer",
                fontFamily: "'Noto Sans JP'",
                background: apPeriod === k ? C.navy : C.white,
                color: apPeriod === k ? C.white : C.textMid,
                border: "1px solid " + (apPeriod === k ? C.navy : C.border),
              }}>{l}</button>
            ))}
            {apPeriod === "month" && (
              <select value={apSelectedMonth} onChange={e => setApSelectedMonth(e.target.value)}
                style={{ padding: "4px 8px", borderRadius: 5, border: "1px solid " + C.border,
                  fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none" }}>
                {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
              </select>
            )}
            {apPeriod === "custom" && (
              <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                <select value={apCustomFrom} onChange={e => setApCustomFrom(e.target.value)}
                  style={{ padding: "4px 8px", borderRadius: 5, border: "1px solid " + C.border,
                    fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none" }}>
                  <option value="">開始月</option>
                  {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
                </select>
                <span style={{ fontSize: 10, color: C.textLight }}>〜</span>
                <select value={apCustomTo} onChange={e => setApCustomTo(e.target.value)}
                  style={{ padding: "4px 8px", borderRadius: 5, border: "1px solid " + C.border,
                    fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none" }}>
                  <option value="">終了月</option>
                  {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
                </select>
              </div>
            )}
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none" }}>
            <option value="all">全ステータス</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {setAppoData && (
            <button onClick={() => setAddAppoForm({ client: "", company: "", getter: "", getDate: "", meetDate: "", status: "アポ取得", sales: 0, reward: 0, note: "" })} style={{
              padding: "8px 18px", borderRadius: 8,
              background: "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")",
              border: "none", color: C.white, cursor: "pointer", fontSize: 12, fontWeight: 600,
              fontFamily: "'Noto Sans JP'", whiteSpace: "nowrap",
            }}>＋ アポ追加</button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div style={{ marginBottom: 16 }}>
        {/* Total row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 10 }}>
          <div style={{ padding: "14px 18px", background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight }}>
            <div style={{ fontSize: 10, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>アポ件数 <span style={{ fontSize: 9, color: C.textLight + "90" }}>（有効）</span></div>
            <div style={{ fontSize: 24, fontWeight: 900, color: C.navy, fontFamily: "'JetBrains Mono'" }}>{countable.length}<span style={{ fontSize: 11, fontWeight: 500, color: C.textLight, marginLeft: 4 }}>/ {filtered.length}件</span></div>
          </div>
          <div style={{ padding: "14px 18px", background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight }}>
            <div style={{ fontSize: 10, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>当社売上合計</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: C.gold, fontFamily: "'JetBrains Mono'" }}>{(totalSales / 10000).toFixed(1)}<span style={{ fontSize: 11, fontWeight: 500 }}>万円</span></div>
          </div>
          <div style={{ padding: "14px 18px", background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight }}>
            <div style={{ fontSize: 10, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>インターン報酬合計</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: C.green, fontFamily: "'JetBrains Mono'" }}>{(totalReward / 10000).toFixed(1)}<span style={{ fontSize: 11, fontWeight: 500 }}>万円</span></div>
          </div>
        </div>
        {/* Monthly breakdown */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(" + AVAILABLE_MONTHS.length + ", 1fr)", gap: 10 }}>
          {monthStats.map(ms => (
            <div key={ms.month} style={{
              padding: "10px 14px", background: C.white, borderRadius: 8,
              border: "1px solid " + C.borderLight,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 6, borderBottom: "1px solid " + C.borderLight, paddingBottom: 4 }}>{ms.month}</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}>
                <span style={{ color: C.textLight }}>有効アポ</span>
                <span style={{ fontWeight: 700, color: C.navy, fontFamily: "'JetBrains Mono'" }}>{ms.count}件</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}>
                <span style={{ color: C.textLight }}>売上</span>
                <span style={{ fontWeight: 700, color: C.gold, fontFamily: "'JetBrains Mono'" }}>{(ms.sales / 10000).toFixed(1)}万</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                <span style={{ color: C.textLight }}>報酬</span>
                <span style={{ fontWeight: 700, color: C.green, fontFamily: "'JetBrains Mono'" }}>{(ms.reward / 10000).toFixed(1)}万</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: C.white, borderRadius: 10, overflow: "hidden", border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)" }}>
        <div style={{
          display: "grid", gridTemplateColumns: colTemplate,
          padding: "8px 16px", background: C.navyDeep,
          fontSize: 9, fontWeight: 600, color: C.goldLight, letterSpacing: 0.5,
        }}>
          <span>クライアント</span><span>企業名</span><span>取得者</span><span>取得日</span><span>面談日</span><span>ステータス</span><span>当社売上</span><span>インターン報酬</span>{setAppoData && <span></span>}
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: "30px 0", textAlign: "center", color: C.textLight, fontSize: 12 }}>データがありません</div>
        ) : filtered.map((a, i) => {
          const sc = statusColor(a.status);
          return (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: colTemplate,
              padding: "8px 16px", fontSize: 11, alignItems: "center",
              borderBottom: "1px solid " + C.borderLight,
            }}>
              <span style={{ color: C.textMid, fontSize: 10 }}>{a.client}</span>
              <span style={{ fontWeight: 600, color: C.navy, cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 2 }} onClick={() => setReportDetail(a)}>{a.company}</span>
              <span style={{ color: C.textDark }}>{a.getter}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, color: C.textLight }}>{a.getDate.slice(5)}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, color: C.textLight }}>{a.meetDate.slice(5)}</span>
              <span style={{
                fontSize: 9, padding: "2px 6px", borderRadius: 3, textAlign: "center", fontWeight: 600,
                background: sc.bg, color: sc.color,
              }}>{a.status}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, fontWeight: 600, color: C.navy }}>{a.sales > 0 ? (a.sales / 10000).toFixed(1) + "万" : "-"}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.textMid }}>{a.reward > 0 ? (a.reward / 10000).toFixed(1) + "万" : "-"}</span>
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {editForm && setAppoData && (() => {
        const inputStyle = { width: "100%", padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", background: C.offWhite };
        const labelStyle = { fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 2, display: "block" };
        const u = (k, v) => setEditForm(p => ({ ...p, [k]: v }));
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: C.white, borderRadius: 12, width: 520, maxHeight: "90vh", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
              <div style={{ padding: "14px 20px", background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")", borderRadius: "12px 12px 0 0", color: C.white }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>アポ情報を編集</div>
                <div style={{ fontSize: 10, color: C.goldLight, marginTop: 2 }}>{editForm.company}</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={labelStyle}>クライアント</label>
                    <select value={editForm.client} onChange={e => {
                      const name = e.target.value;
                      const client = clientOptions.find(c => c.company === name);
                      const rewardRow = client?.rewardType ? rewardMaster.find(r => r.id === client.rewardType) : null;
                      setEditForm(p => ({ ...p, client: name, ...(name && rewardRow ? { sales: rewardRow.price } : {}) }));
                    }} style={inputStyle}>
                      <option value="">選択...</option>
                      {clientOptions.map(c => (
                        <option key={c._supaId || c.company} value={c.company}>
                          {c.company}{c.status === "停止中" ? "（停止中）" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div><label style={labelStyle}>企業名</label><input value={editForm.company} onChange={e => u("company", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>取得者</label><MemberSuggestInput value={editForm.getter} onChange={v => u("getter", v)} members={members} style={inputStyle} /></div>
                  <div><label style={labelStyle}>ステータス</label>
                    <select value={editForm.status} onChange={e => u("status", e.target.value)} style={inputStyle}>
                      <option value="面談済">面談済</option><option value="事前確認済">事前確認済</option><option value="アポ取得">アポ取得</option><option value="リスケ中">リスケ中</option><option value="キャンセル">キャンセル</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>取得日</label><input type="date" value={editForm.getDate} onChange={e => u("getDate", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>面談日</label><input type="date" value={editForm.meetDate} onChange={e => u("meetDate", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>当社売上</label><input type="number" value={editForm.sales} onChange={e => u("sales", Number(e.target.value))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>インターン報酬</label><input type="number" value={editForm.reward} onChange={e => u("reward", Number(e.target.value))} style={inputStyle} /></div>
                  <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>備考</label><input value={editForm.note} onChange={e => u("note", e.target.value)} style={inputStyle} /></div>
                </div>
              </div>
              <div style={{ padding: "10px 20px", borderTop: "1px solid " + C.borderLight, display: "flex", justifyContent: "space-between" }}>
                <button onClick={async () => {
                  if (editForm._supaId) {
                    const error = await deleteAppointment(editForm._supaId);
                    if (error) { alert('削除に失敗しました: ' + (error.message || '不明なエラー')); return; }
                  }
                  setAppoData(prev => prev.filter((_, i) => i !== editForm._idx));
                  setEditForm(null);
                }} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #e5383530", background: C.white, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#e53835", fontFamily: "'Noto Sans JP'" }}>削除</button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setEditForm(null)} style={{ padding: "8px 20px", borderRadius: 6, border: "1px solid " + C.border, background: C.white, cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.textMid, fontFamily: "'Noto Sans JP'" }}>キャンセル</button>
                  <button onClick={async () => {
                    const idx = editForm._idx;
                    const original = appoData[idx];
                    const updated = { ...editForm };
                    delete updated._idx;

                    const wasKanryo = original?.status === '面談済';
                    const isKanryo  = updated.status === '面談済';

                    // ── 面談済ステータス変更時の累計売上更新 ──────────
                    // intern_reward はアポ取得時の確定値を維持（上書きしない）
                    if ((isKanryo || wasKanryo) && setMembers) {
                      const member = members.find(m => typeof m !== 'string' && m.name === updated.getter);
                      if (member?._supaId) {
                        // cumulative_sales の増減のみ（rewardは触らない）
                        const delta = (isKanryo && !wasKanryo)  ?  (updated.sales  || 0)
                                    : (!isKanryo && wasKanryo)  ? -(original.sales || 0)
                                    : 0;
                        if (delta !== 0) {
                          const newTotal = Math.max(0, (member.totalSales || 0) + delta);
                          const { rank: newRank, rate: newRate } = calcRankAndRate(newTotal);
                          await updateMemberReward(member._supaId, {
                            cumulativeSales: newTotal,
                            rank: newRank,
                            incentiveRate: newRate,
                          });
                          setMembers(prev => prev.map(m =>
                            (typeof m !== 'string' && m._supaId === member._supaId)
                              ? { ...m, totalSales: newTotal, rank: newRank, rate: newRate }
                              : m
                          ));
                          if (original?._supaId) await updateAppoCounted(original._supaId, isKanryo);
                        }
                      }
                    }

                    if (updated._supaId) {
                      const error = await updateAppointment(updated._supaId, updated);
                      if (error) { alert('保存に失敗しました: ' + (error.message || '不明なエラー')); return; }
                    }
                    setAppoData(prev => prev.map((a, i) => i === idx ? updated : a));
                    setEditForm(null);
                  }} style={{
                    padding: "8px 24px", borderRadius: 6, border: "none",
                    background: "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")",
                    cursor: "pointer", fontSize: 11, fontWeight: 700, color: C.white, fontFamily: "'Noto Sans JP'",
                  }}>保存</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Appo Modal */}
      {addAppoForm && setAppoData && (() => {
        const inputStyle = { width: "100%", padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", background: C.offWhite };
        const labelStyle = { fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 2, display: "block" };
        const u = (k, v) => setAddAppoForm(p => ({ ...p, [k]: v }));
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: C.white, borderRadius: 12, width: 520, maxHeight: "90vh", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
              <div style={{ padding: "14px 20px", background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")", borderRadius: "12px 12px 0 0", color: C.white }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>アポを追加</div>
                <div style={{ fontSize: 10, color: C.goldLight, marginTop: 2 }}>新規アポイント登録</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={labelStyle}>クライアント名</label>
                    <select value={addAppoForm.client} onChange={e => {
                      const name = e.target.value;
                      const client = clientOptions.find(c => c.company === name);
                      const rewardRow = client?.rewardType ? rewardMaster.find(r => r.id === client.rewardType) : null;
                      setAddAppoForm(p => ({ ...p, client: name, ...(name && rewardRow ? { sales: rewardRow.price } : {}) }));
                    }} style={inputStyle}>
                      <option value="">選択...</option>
                      {clientOptions.map(c => (
                        <option key={c._supaId || c.company} value={c.company}>
                          {c.company}{c.status === "停止中" ? "（停止中）" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div><label style={labelStyle}>企業名 <span style={{ color: "#e53835" }}>*</span></label><input value={addAppoForm.company} onChange={e => u("company", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>取得者名</label><MemberSuggestInput value={addAppoForm.getter} onChange={v => u("getter", v)} members={members} style={inputStyle} /></div>
                  <div><label style={labelStyle}>ステータス</label>
                    <select value={addAppoForm.status} onChange={e => u("status", e.target.value)} style={inputStyle}>
                      <option value="面談済">面談済</option><option value="事前確認済">事前確認済</option><option value="アポ取得">アポ取得</option><option value="リスケ中">リスケ中</option><option value="キャンセル">キャンセル</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>取得日</label><input type="date" value={addAppoForm.getDate} onChange={e => u("getDate", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>面談日</label><input type="date" value={addAppoForm.meetDate} onChange={e => u("meetDate", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>当社売上</label><input type="number" value={addAppoForm.sales} onChange={e => u("sales", Number(e.target.value))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>インターン報酬</label><input type="number" value={addAppoForm.reward} onChange={e => u("reward", Number(e.target.value))} style={inputStyle} /></div>
                  <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>備考</label><input value={addAppoForm.note} onChange={e => u("note", e.target.value)} style={inputStyle} /></div>
                </div>
              </div>
              <div style={{ padding: "10px 20px", borderTop: "1px solid " + C.borderLight, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setAddAppoForm(null)} style={{ padding: "8px 20px", borderRadius: 6, border: "1px solid " + C.border, background: C.white, cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.textMid, fontFamily: "'Noto Sans JP'" }}>キャンセル</button>
                <button onClick={async () => {
                  if (!addAppoForm.company.trim()) return;
                  const newAppo = {
                    client: addAppoForm.client,
                    company: addAppoForm.company,
                    getter: addAppoForm.getter,
                    getDate: addAppoForm.getDate,
                    meetDate: addAppoForm.meetDate,
                    status: addAppoForm.status,
                    sales: addAppoForm.sales,
                    reward: addAppoForm.reward,
                    note: addAppoForm.note,
                    month: addAppoForm.meetDate ? (parseInt(addAppoForm.meetDate.slice(5, 7), 10) + '月') : '',
                  };
                  const { result, error } = await insertAppointment(addAppoForm);
                  if (error || !result) { alert('保存に失敗しました: ' + (error?.message || '不明なエラー')); return; }
                  newAppo._supaId = result.id;
                  setAppoData(prev => [...prev, newAppo]);
                  setAddAppoForm(null);
                }} style={{
                  padding: "8px 24px", borderRadius: 6, border: "none",
                  background: "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")",
                  cursor: "pointer", fontSize: 11, fontWeight: 700, color: C.white, fontFamily: "'Noto Sans JP'",
                }}>保存</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Appointment Detail Modal */}
      {reportDetail && (
        <div onClick={() => setReportDetail(null)} style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(10,25,41,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 200, animation: "fadeIn 0.2s ease",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: C.white, borderRadius: 12, width: 520, maxHeight: "80vh", overflow: "auto",
            boxShadow: "0 20px 60px rgba(10,25,41,0.3)",
          }}>
            <div style={{
              background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")",
              padding: "16px 20px", borderRadius: "12px 12px 0 0",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.white }}>アポイント詳細</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {!detailEditing ? (
                  <button onClick={() => { setDetailEditForm({ ...reportDetail, _idx: appoData.findIndex(a => a._supaId === reportDetail._supaId) }); setDetailEditing(true); }}
                    style={{ padding: "4px 12px", borderRadius: 5, border: "1px solid " + C.white + "40", background: "transparent", color: C.white, cursor: "pointer", fontSize: 11, fontFamily: "'Noto Sans JP'" }}>
                    ✏ 編集
                  </button>
                ) : (
                  <>
                    <button onClick={() => { setDetailEditing(false); setDetailEditForm(null); }}
                      style={{ padding: "4px 12px", borderRadius: 5, border: "1px solid " + C.white + "40", background: "transparent", color: C.white + "cc", cursor: "pointer", fontSize: 11, fontFamily: "'Noto Sans JP'" }}>
                      キャンセル
                    </button>
                    <button disabled={detailSaving} onClick={async () => {
                      const idx = detailEditForm._idx;
                      const original = appoData[idx];
                      const updated = { ...detailEditForm };
                      delete updated._idx;
                      const wasKanryo = original?.status === '面談済';
                      const isKanryo  = updated.status === '面談済';
                      if ((isKanryo || wasKanryo) && setMembers) {
                        const member = members.find(m => typeof m !== 'string' && m.name === updated.getter);
                        if (member?._supaId) {
                          const delta = (isKanryo && !wasKanryo) ? (updated.sales || 0) : (!isKanryo && wasKanryo) ? -(original.sales || 0) : 0;
                          if (delta !== 0) {
                            const newTotal = Math.max(0, (member.totalSales || 0) + delta);
                            const { rank: newRank, rate: newRate } = calcRankAndRate(newTotal);
                            await updateMemberReward(member._supaId, { cumulativeSales: newTotal, rank: newRank, incentiveRate: newRate });
                            setMembers(prev => prev.map(m => (typeof m !== 'string' && m._supaId === member._supaId) ? { ...m, totalSales: newTotal, rank: newRank, rate: newRate } : m));
                            if (original?._supaId) await updateAppoCounted(original._supaId, isKanryo);
                          }
                        }
                      }
                      setDetailSaving(true);
                      if (updated._supaId) {
                        const error = await updateAppointment(updated._supaId, updated);
                        setDetailSaving(false);
                        if (error) { alert('保存に失敗しました: ' + (error.message || '不明なエラー')); return; }
                      } else { setDetailSaving(false); }
                      setAppoData(prev => prev.map((a, i) => i === idx ? updated : a));
                      setReportDetail(updated);
                      setDetailEditing(false); setDetailEditForm(null);
                    }} style={{ padding: "4px 14px", borderRadius: 5, border: "none", background: detailSaving ? C.border : C.gold, color: C.white, cursor: detailSaving ? "default" : "pointer", fontSize: 11, fontWeight: 700, fontFamily: "'Noto Sans JP'" }}>
                      {detailSaving ? '保存中…' : '保存'}
                    </button>
                  </>
                )}
                <button onClick={() => setReportDetail(null)} style={{ width: 28, height: 28, borderRadius: 6, background: C.white + "15", border: "none", color: C.white, cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
            </div>
            <div style={{ padding: 20 }}>
              {(() => {
                const ef = detailEditForm;
                const iS = { width: "100%", padding: "4px 8px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", background: C.white, boxSizing: "border-box" };
                const u = (k, v) => setDetailEditForm(p => ({ ...p, [k]: v }));
                return (
                  <>
                    {detailEditing
                      ? <input value={ef.company} onChange={e => u("company", e.target.value)} style={{ ...iS, fontSize: 16, fontWeight: 700, marginBottom: 12, padding: "6px 10px" }} />
                      : <div style={{ fontSize: 18, fontWeight: 800, color: C.navy, marginBottom: 12 }}>{reportDetail.company}</div>
                    }
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                      {/* クライアント */}
                      <div style={{ padding: "8px 12px", borderRadius: 6, background: C.offWhite, border: "1px solid " + C.borderLight }}>
                        <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 2 }}>クライアント</div>
                        {detailEditing
                          ? <select value={ef.client} onChange={e => { const name = e.target.value; const cl = clientOptions.find(c => c.company === name); const rr = cl?.rewardType ? rewardMaster.find(r => r.id === cl.rewardType) : null; u("client", name); if (name && rr) u("sales", rr.price); }} style={iS}>
                              <option value="">選択...</option>
                              {clientOptions.map(c => <option key={c._supaId || c.company} value={c.company}>{c.company}{c.status === "停止中" ? "（停止中）" : ""}</option>)}
                            </select>
                          : <div style={{ fontSize: 12, fontWeight: 600, color: C.navy }}>{reportDetail.client}</div>}
                      </div>
                      {/* 取得者 */}
                      <div style={{ padding: "8px 12px", borderRadius: 6, background: C.offWhite, border: "1px solid " + C.borderLight }}>
                        <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 2 }}>取得者</div>
                        {detailEditing
                          ? <MemberSuggestInput value={ef.getter} onChange={v => u("getter", v)} members={members} style={iS} />
                          : <div style={{ fontSize: 12, fontWeight: 600, color: C.navy }}>{reportDetail.getter}</div>}
                      </div>
                      {/* 取得日 */}
                      <div style={{ padding: "8px 12px", borderRadius: 6, background: C.offWhite, border: "1px solid " + C.borderLight }}>
                        <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 2 }}>取得日</div>
                        {detailEditing
                          ? <input type="date" value={ef.getDate} onChange={e => u("getDate", e.target.value)} style={iS} />
                          : <div style={{ fontSize: 12, fontWeight: 600, color: C.navy }}>{reportDetail.getDate}</div>}
                      </div>
                      {/* 面談日 */}
                      <div style={{ padding: "8px 12px", borderRadius: 6, background: C.offWhite, border: "1px solid " + C.borderLight }}>
                        <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 2 }}>面談日</div>
                        {detailEditing
                          ? <input type="date" value={ef.meetDate} onChange={e => u("meetDate", e.target.value)} style={iS} />
                          : <div style={{ fontSize: 12, fontWeight: 600, color: C.navy }}>{reportDetail.meetDate}</div>}
                      </div>
                      {/* ステータス */}
                      <div style={{ padding: "8px 12px", borderRadius: 6, background: C.offWhite, border: "1px solid " + C.borderLight }}>
                        <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 2 }}>ステータス</div>
                        {detailEditing
                          ? <select value={ef.status} onChange={e => u("status", e.target.value)} style={iS}>
                              <option value="面談済">面談済</option><option value="事前確認済">事前確認済</option><option value="アポ取得">アポ取得</option><option value="リスケ中">リスケ中</option><option value="キャンセル">キャンセル</option>
                            </select>
                          : <div style={{ fontSize: 12, fontWeight: 600, color: C.navy }}>{reportDetail.status}</div>}
                      </div>
                      {/* 月（読み取り専用） */}
                      <div style={{ padding: "8px 12px", borderRadius: 6, background: C.offWhite, border: "1px solid " + C.borderLight }}>
                        <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 2 }}>月</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.navy }}>
                          {(detailEditing ? ef.meetDate : reportDetail.meetDate) ? (parseInt((detailEditing ? ef.meetDate : reportDetail.meetDate).slice(5, 7), 10) + "月") : null}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                      <div style={{ padding: "10px 14px", borderRadius: 8, background: C.navy + "08", border: "1px solid " + C.navy + "15" }}>
                        <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>当社売上</div>
                        {detailEditing
                          ? <input type="number" value={ef.sales} onChange={e => u("sales", Number(e.target.value))} style={iS} />
                          : <div style={{ fontSize: 20, fontWeight: 900, color: C.navy, fontFamily: "'JetBrains Mono'" }}>{reportDetail.sales > 0 ? "¥" + reportDetail.sales.toLocaleString() : "-"}</div>}
                      </div>
                      <div style={{ padding: "10px 14px", borderRadius: 8, background: C.gold + "08", border: "1px solid " + C.gold + "15" }}>
                        <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>インターン報酬</div>
                        {detailEditing
                          ? <input type="number" value={ef.reward} onChange={e => u("reward", Number(e.target.value))} style={iS} />
                          : <div style={{ fontSize: 20, fontWeight: 900, color: C.gold, fontFamily: "'JetBrains Mono'" }}>{reportDetail.reward > 0 ? "¥" + reportDetail.reward.toLocaleString() : "-"}</div>}
                      </div>
                    </div>
                    {detailEditing && (
                      <div style={{ marginBottom: 12, textAlign: "right" }}>
                        <button onClick={async () => {
                          if (!reportDetail._supaId) return;
                          if (!window.confirm('このアポを削除しますか？')) return;
                          const error = await deleteAppointment(reportDetail._supaId);
                          if (error) { alert('削除に失敗しました: ' + (error.message || '不明なエラー')); return; }
                          if (setAppoData) setAppoData(prev => prev.filter(a => a._supaId !== reportDetail._supaId));
                          setReportDetail(null);
                        }} style={{ padding: "6px 16px", borderRadius: 5, border: "1px solid #e5383530", background: C.white, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#e53835", fontFamily: "'Noto Sans JP'" }}>
                          🗑 削除
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
              {/* ── 備考 ── */}
              <div style={{ padding: "10px 14px", borderRadius: 8, background: C.offWhite, border: "1px solid " + C.borderLight, marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>備考</div>
                {detailEditing ? (
                  <textarea
                    value={detailEditForm.note || ''}
                    onChange={e => setDetailEditForm(f => ({ ...f, note: e.target.value }))}
                    rows={4}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid " + C.borderLight,
                      fontSize: 12, fontFamily: "'Noto Sans JP'", lineHeight: 1.7, resize: "vertical",
                      outline: "none", background: C.white, color: C.textDark, boxSizing: "border-box" }}
                  />
                ) : reportDetail.note ? (
                  <div style={{ fontSize: 12, color: C.textDark, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{reportDetail.note}</div>
                ) : (
                  <div style={{ fontSize: 11, color: C.textLight }}>備考なし</div>
                )}
              </div>
              {/* ── アポ取得報告 ── */}
              <div style={{ padding: "10px 14px", borderRadius: 8, background: C.gold + "06", border: "1px solid " + C.gold + "20", borderLeft: "3px solid " + C.gold, marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.gold, marginBottom: 6 }}>📋 アポ取得報告</div>
                {detailEditing ? (
                  <textarea
                    value={detailEditForm.appoReport || ''}
                    onChange={e => setDetailEditForm(f => ({ ...f, appoReport: e.target.value }))}
                    rows={10}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid " + C.borderLight,
                      fontSize: 11, fontFamily: "'Noto Sans JP'", lineHeight: 1.7, resize: "vertical",
                      outline: "none", background: C.white, color: C.textDark, boxSizing: "border-box" }}
                  />
                ) : reportDetail.appoReport ? (
                  <div style={{ fontSize: 11, color: C.textDark, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{reportDetail.appoReport}</div>
                ) : (
                  <div style={{ fontSize: 11, color: C.textLight, textAlign: "center", padding: "8px 0" }}>
                    アポ取得報告はまだ登録されていません
                  </div>
                )}
              </div>
              {(() => {
                const src = reportDetail.appoReport || reportDetail.note || '';
                const m = src.match(/録音URL[：:]\s*(https?:\/\/\S+)/);
                const recUrl = m?.[1]?.trim() || '';
                return (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ padding: '5px 8px', borderRadius: 5, background: C.offWhite,
                      display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: C.navy, whiteSpace: 'nowrap' }}>🎙 録音</span>
                      {recUrl
                        ? <button onClick={() => setShowRecordingDetail(v => !v)}
                            title={showRecordingDetail ? "閉じる" : "録音を再生"}
                            style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
                              padding: 0, lineHeight: 1, color: showRecordingDetail ? C.red : 'inherit' }}>🎙</button>
                        : <span style={{ fontSize: 11, color: C.textLight }}>録音なし</span>
                      }
                    </div>
                    {showRecordingDetail && recUrl && (
                      <InlineAudioPlayer url={recUrl} onClose={() => setShowRecordingDetail(false)} />
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Members View (Employee Directory)
// ============================================================
export function MembersView({ members, setMembers }) {
  const [search, setSearch] = useState("");
  const [addForm, setAddForm] = useState(null);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const filtered = members.filter(m => {
    if (search && !m.name.includes(search) && !m.university.includes(search)) return false;
    return true;
  });

  // Group by team
  const teamOrder = ["代表取締役", "営業統括", "成尾", "高橋", "クライアント開拓"];
  const grouped = {};
  filtered.forEach(m => {
    const t = m.team || (m.role === "営業統括" ? "営業統括" : "その他");
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push(m);
  });
  const sortedTeams = Object.keys(grouped).sort((a, b) => {
    const ai = teamOrder.indexOf(a); const bi = teamOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const formatCurrency = (val) => {
    if (!val) return "-";
    return (val / 10000).toFixed(1) + "万";
  };

  const colTemplate = setMembers ? "3% 10% 15% 4% 10% 8% 10% 10% 10% 10% 10%" : "3% 11% 17% 4% 11% 9% 11% 11% 12% 11%";

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16,
        padding: "14px 18px", background: C.white, borderRadius: 10,
        border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>👥</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>従業員名簿</span>
          <span style={{ fontSize: 11, color: C.textLight }}>{members.length}名</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="名前・大学で検索..."
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", width: 180 }} />
          {setMembers && <button
            onClick={() => setAddForm({ name: "", university: "", year: 1, team: "成尾", role: "メンバー", rank: "トレーニー", rate: 0.22, referrerName: "" })}
            style={{
              padding: "6px 12px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 600,
              background: "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")",
              color: C.white, cursor: "pointer", fontFamily: "'Noto Sans JP'",
            }}>+ 追加</button>}
          {setMembers && <button
            disabled={syncLoading}
            onClick={async () => {
              setSyncLoading(true);
              setSyncResult(null);
              const { data, error } = await invokeSyncZoomUsers();
              setSyncLoading(false);
              if (error || !data) {
                setSyncResult({ error: error?.message || '通信エラーが発生しました' });
              } else {
                setSyncResult(data);
                // ページのmembersステートを更新（zoom_user_idをsetMembersで反映）
                if (data.updated?.length > 0) {
                  setMembers(prev => prev.map(m => {
                    const matched = data._updatedMap?.[m._supaId];
                    return matched ? { ...m, zoomUserId: matched } : m;
                  }));
                }
              }
            }}
            style={{
              padding: "6px 12px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 600,
              background: syncLoading
                ? "linear-gradient(135deg, #aaa, #ccc)"
                : "linear-gradient(135deg, #1a7f5a, #2da57a)",
              color: C.white, cursor: syncLoading ? "not-allowed" : "pointer",
              fontFamily: "'Noto Sans JP'", whiteSpace: "nowrap",
            }}>
            {syncLoading ? "同期中..." : "🔄 Zoom ID同期"}
          </button>}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {sortedTeams.map(team => (
          <div key={team} style={{
            background: C.white, borderRadius: 10, overflow: "hidden",
            border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)",
          }}>
            <div style={{
              padding: "10px 16px", background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.white }}>{(team === "営業統括" || team === "代表取締役") ? team : team + "チーム"}</span>
              <span style={{ fontSize: 10, color: C.goldLight }}>{grouped[team].length}名</span>
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: colTemplate,
              padding: "6px 16px", background: C.offWhite, borderBottom: "1px solid " + C.borderLight,
              fontSize: 9, fontWeight: 600, color: C.textLight, letterSpacing: 0.5,
            }}>
              <span style={{ textAlign: "center" }}>No</span><span>氏名</span><span>大学名</span><span style={{ textAlign: "center" }}>学年</span><span style={{ textAlign: "center" }}>役職</span><span style={{ textAlign: "center" }}>ランク</span><span style={{ textAlign: "right" }}>累計売上</span><span style={{ textAlign: "center" }}>インセンティブ率</span><span style={{ textAlign: "center" }}>入社日</span><span style={{ textAlign: "center" }}>稼働開始日</span>{setMembers && <span></span>}
            </div>
            {grouped[team].sort((a, b) => {
              const order = { "チームリーダー": 0, "副リーダー": 1, "営業統括": 2, "メンバー": 3, "": 4 };
              return (order[a.role] ?? 4) - (order[b.role] ?? 4);
            }).map((m, idx) => (
              <div key={m.id} style={{
                display: "grid", gridTemplateColumns: colTemplate,
                padding: "8px 16px", fontSize: 11, alignItems: "center",
                borderBottom: "1px solid " + C.borderLight,
              }}>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.textLight, textAlign: "center" }}>{idx + 1}</span>
                <span style={{ fontWeight: 600, color: C.navy }}>{m.name}</span>
                <span style={{ color: C.textMid, fontSize: 10 }}>{m.university}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", color: C.textLight, textAlign: "center" }}>{m.year}</span>
                <span style={{
                  fontSize: 9, padding: "1px 5px", borderRadius: 3, textAlign: "center",
                  background: m.role === "チームリーダー" ? C.gold + "15" : m.role === "副リーダー" ? C.navy + "10" : m.role === "営業統括" ? C.green + "10" : "transparent",
                  color: m.role === "チームリーダー" ? C.gold : m.role === "副リーダー" ? C.navy : m.role === "営業統括" ? C.green : C.textLight,
                  fontWeight: 600,
                }}>{m.role || "メンバー"}</span>
                <span style={{ fontSize: 10, textAlign: "center", color: m.rank === "プレイヤー" ? C.gold : C.textLight }}>{m.rank || "-"}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, fontWeight: 500, textAlign: "right", color: m.totalSales > 0 ? C.navy : C.textLight }}>{formatCurrency(m.totalSales)}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, textAlign: "center", color: m.rate > 0 ? C.green : C.textLight }}>{m.rate > 0 ? (m.rate * 100).toFixed(0) + "%" : "-"}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, textAlign: "center", color: C.textLight }}>{(m.joinDate || '').slice(2)}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, textAlign: "center", color: C.textLight }}>{m.operationStartDate ? m.operationStartDate.slice(2) : '-'}</span>
                {setMembers && <span style={{ textAlign: "center" }}><button onClick={() => setEditForm({ ...m })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 2 }}>&#9998;</button></span>}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Zoom ID Sync Result Modal */}
      {syncResult && (
        <div
          onClick={() => setSyncResult(null)}
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: 12, width: 480, maxHeight: "80vh", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
            <div style={{ padding: "14px 20px", background: "linear-gradient(135deg, #1a7f5a, #2da57a)", borderRadius: "12px 12px 0 0", color: C.white }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>🔄 Zoom ID同期結果</div>
            </div>
            <div style={{ padding: "20px 24px" }}>
              {syncResult.error ? (
                <div style={{ color: "#c0392b", fontSize: 13, padding: "12px 16px", background: "#fdf0ef", borderRadius: 8, border: "1px solid #e8b4b0" }}>
                  ❌ エラー：{syncResult.error}
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                    <div style={{ padding: "10px 14px", background: "#f0faf5", borderRadius: 8, border: "1px solid #a8dfc5" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#1a7f5a" }}>
                        ✅ 更新成功：{syncResult.updated?.length ?? 0}名
                      </span>
                      {syncResult.updated?.length > 0 && (
                        <div style={{ marginTop: 6, fontSize: 11, color: "#2d6a4f", lineHeight: 1.8 }}>
                          {syncResult.updated.join('　/　')}
                        </div>
                      )}
                    </div>
                    {syncResult.skipped?.length > 0 && (
                      <div style={{ padding: "10px 14px", background: "#f8f9fa", borderRadius: 8, border: "1px solid " + C.borderLight }}>
                        <span style={{ fontSize: 12, color: C.textMid }}>
                          ✔ 登録済みスキップ：{syncResult.skipped.length}名
                        </span>
                      </div>
                    )}
                    {syncResult.unmatched?.length > 0 && (
                      <div style={{ padding: "10px 14px", background: "#fff8f0", borderRadius: 8, border: "1px solid #f5c99a" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#b05e00" }}>
                          ✗ 未マッチ：{syncResult.unmatched.length}名
                        </span>
                        <div style={{ marginTop: 6, fontSize: 11, color: "#7a4200", lineHeight: 1.8 }}>
                          {syncResult.unmatched.map(u => (
                            <div key={u.email}>{u.name}（{u.email}）</div>
                          ))}
                        </div>
                      </div>
                    )}
                    {syncResult.errors?.length > 0 && (
                      <div style={{ padding: "10px 14px", background: "#fdf0ef", borderRadius: 8, border: "1px solid #e8b4b0" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#c0392b" }}>
                          ❌ 更新エラー：{syncResult.errors.length}名
                        </span>
                        <div style={{ marginTop: 6, fontSize: 11, color: "#7b241c" }}>{syncResult.errors.join('、')}</div>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: C.textLight, textAlign: "center" }}>クリックで閉じる</div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Member Modal */}
      {editForm && setMembers && (() => {
        const inputStyle = {
          width: "100%", padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.border,
          fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", background: C.offWhite,
        };
        const labelStyle = { fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 2, display: "block" };
        const u = (k, v) => setEditForm(p => ({ ...p, [k]: v }));
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: C.white, borderRadius: 12, width: 440, boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
              <div style={{ padding: "14px 20px", background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")", borderRadius: "12px 12px 0 0", color: C.white }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{editForm.name} を編集</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={labelStyle}>氏名 *</label><input value={editForm.name} onChange={e => u("name", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>大学名</label><input value={editForm.university || ""} onChange={e => u("university", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>学年</label><input type="number" value={editForm.year} onChange={e => u("year", Number(e.target.value))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>チーム</label>
                    <select value={editForm.team} onChange={e => u("team", e.target.value)} style={inputStyle}>
                      <option value="成尾">成尾</option><option value="高橋">高橋</option><option value="クライアント開拓">クライアント開拓</option><option value="">営業統括</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>役職</label>
                    <select value={editForm.role} onChange={e => u("role", e.target.value)} style={inputStyle}>
                      <option value="メンバー">メンバー</option><option value="副リーダー">副リーダー</option><option value="チームリーダー">チームリーダー</option><option value="営業統括">営業統括</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>累計売上 (¥)</label><input type="number" value={editForm.totalSales || 0} onChange={e => { const s = Number(e.target.value); const { rank, rate } = calcRankAndRate(s); setEditForm(p => ({ ...p, totalSales: s, rank, rate })); }} style={inputStyle} /></div>
                  <div><label style={labelStyle}>ランク <span style={{ fontWeight: 400, color: C.textLight }}>(自動)</span></label><input value={editForm.rank || 'トレーニー'} readOnly style={{ ...inputStyle, background: '#f0f4f8', color: C.navy, fontWeight: 600 }} /></div>
                  <div><label style={labelStyle}>内定先</label><input value={editForm.offer || ""} onChange={e => u("offer", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>インセンティブ率 <span style={{ fontWeight: 400, color: C.textLight }}>(自動)</span></label><input value={((editForm.rate || 0) * 100).toFixed(0) + '%'} readOnly style={{ ...inputStyle, background: '#f0f4f8', color: C.navy, fontWeight: 600 }} /></div>
                  <div><label style={labelStyle}>入社日</label><input type="date" value={editForm.joinDate || ""} onChange={e => u("joinDate", e.target.value)} style={inputStyle} /></div>
                  <div>
                    <label style={labelStyle}>稼働開始日</label>
                    <input type="date" value={editForm.operationStartDate || ""} onChange={e => u("operationStartDate", e.target.value)} style={inputStyle} />
                  </div>
                  <div><label style={labelStyle}>紹介者</label>
                    <select value={editForm.referrerName || ""} onChange={e => u("referrerName", e.target.value)} style={inputStyle}>
                      <option value="">（なし）</option>
                      {members.filter(m => m.id !== editForm.id).map(m => <option key={m.id || m.name} value={m.name}>{m.name}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ ...labelStyle, color: C.gold }}>Zoom User ID <span style={{ fontWeight: 400, color: C.textLight }}>（管理者専用）</span></label>
                    <input value={editForm.zoomUserId || ""} onChange={e => u("zoomUserId", e.target.value)} style={inputStyle} placeholder="例: lXsqw8miT5iHmX7cKz0R5w" />
                  </div>
                </div>
              </div>
              <div style={{ padding: "10px 20px", borderTop: "1px solid " + C.borderLight }}>
                {deleteError && <div style={{ fontSize: 11, color: "#e53835", marginBottom: 8, padding: "6px 10px", background: "#fde8e8", borderRadius: 4 }}>削除エラー: {deleteError}</div>}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                <button onClick={async () => {
                  if (!editForm._supaId) { setDeleteError('IDが見つかりません。ページを再読み込みしてください。'); return; }
                  if (!window.confirm(`「${editForm.name}」を削除しますか？`)) return;
                  setDeleteSaving(true);
                  setDeleteError(null);
                  const error = await deleteMember(editForm._supaId);
                  setDeleteSaving(false);
                  if (error) { setDeleteError(error.message || 'DBからの削除に失敗しました。'); return; }
                  setMembers(prev => prev.filter(x => x.id !== editForm.id));
                  setEditForm(null);
                  setDeleteError(null);
                }} disabled={deleteSaving} style={{
                  padding: "8px 16px", borderRadius: 6, border: "1px solid #e5383530",
                  background: C.white, cursor: deleteSaving ? "default" : "pointer", fontSize: 11, fontWeight: 600, color: "#e53835", fontFamily: "'Noto Sans JP'",
                }}>{deleteSaving ? '削除中...' : '削除'}</button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setEditForm(null); setDeleteError(null); }} style={{ padding: "8px 20px", borderRadius: 6, border: "1px solid " + C.border, background: C.white, cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.textMid, fontFamily: "'Noto Sans JP'" }}>キャンセル</button>
                  <button onClick={async () => {
                    if (!editForm.name.trim()) return;
                    if (editForm._supaId) {
                      const error = await updateMember(editForm._supaId, editForm);
                      if (error) { alert('保存に失敗しました: ' + (error.message || '不明なエラー')); return; }
                      await updateMemberReward(editForm._supaId, { cumulativeSales: editForm.totalSales || 0, rank: editForm.rank, incentiveRate: editForm.rate });
                    }
                    setMembers(prev => prev.map(m => m.id === editForm.id ? { ...m, ...editForm } : m));
                    setEditForm(null);
                  }} style={{
                    padding: "8px 24px", borderRadius: 6, border: "none",
                    background: "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")",
                    cursor: "pointer", fontSize: 11, fontWeight: 700, color: C.white, fontFamily: "'Noto Sans JP'",
                  }}>保存</button>
                </div>
              </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Member Modal */}
      {addForm && setMembers && (() => {
        const inputStyle = {
          width: "100%", padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.border,
          fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", background: C.offWhite,
        };
        const labelStyle = { fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 2, display: "block" };
        const u = (k, v) => setAddForm(p => ({ ...p, [k]: v }));
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: C.white, borderRadius: 12, width: 440, boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
              <div style={{ padding: "14px 20px", background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")", borderRadius: "12px 12px 0 0", color: C.white }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>従業員を追加</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={labelStyle}>氏名 *</label><input value={addForm.name} onChange={e => u("name", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>大学名</label><input value={addForm.university || ""} onChange={e => u("university", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>学年</label><input type="number" value={addForm.year} onChange={e => u("year", Number(e.target.value))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>チーム</label>
                    <select value={addForm.team} onChange={e => u("team", e.target.value)} style={inputStyle}>
                      <option value="成尾">成尾</option><option value="高橋">高橋</option><option value="クライアント開拓">クライアント開拓</option><option value="">営業統括</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>役職</label>
                    <select value={addForm.role} onChange={e => u("role", e.target.value)} style={inputStyle}>
                      <option value="メンバー">メンバー</option><option value="副リーダー">副リーダー</option><option value="チームリーダー">チームリーダー</option><option value="営業統括">営業統括</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>ランク</label>
                    <select value={addForm.rank} onChange={e => u("rank", e.target.value)} style={inputStyle}>
                      <option value="トレーニー">トレーニー</option><option value="プレイヤー">プレイヤー</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>紹介者</label>
                    <select value={addForm.referrerName || ""} onChange={e => u("referrerName", e.target.value)} style={inputStyle}>
                      <option value="">（なし）</option>
                      {members.map(m => <option key={m.id || m.name} value={m.name}>{m.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div style={{ padding: "10px 20px", borderTop: "1px solid " + C.borderLight }}>
                {addError && <div style={{ fontSize: 11, color: "#e53835", marginBottom: 8, padding: "6px 10px", background: "#fde8e8", borderRadius: 4 }}>エラー: {addError}</div>}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => { setAddForm(null); setAddError(null); }} style={{ padding: "8px 20px", borderRadius: 6, border: "1px solid " + C.border, background: C.white, cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.textMid, fontFamily: "'Noto Sans JP'" }}>キャンセル</button>
                  <button onClick={async () => {
                    if (!addForm.name.trim()) return;
                    setAddSaving(true);
                    setAddError(null);
                    const today = new Date().toISOString().slice(0, 10);
                    const { result, error } = await insertMember(addForm);
                    setAddSaving(false);
                    if (error || !result) {
                      setAddError(error?.message || 'DBへの保存に失敗しました。RLSポリシーを確認してください。');
                      return;
                    }
                    setMembers(prev => [...prev, {
                      ...addForm,
                      id: result.id,
                      _supaId: result.id,
                      offer: addForm.offer || "",
                      totalSales: 0,
                      joinDate: today,
                    }]);
                    setAddForm(null);
                    setAddError(null);
                  }} disabled={!addForm.name.trim() || addSaving} style={{
                    padding: "8px 24px", borderRadius: 6, border: "none",
                    background: addForm.name.trim() && !addSaving ? "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")" : C.border,
                    cursor: addForm.name.trim() && !addSaving ? "pointer" : "default", fontSize: 11, fontWeight: 700, color: C.white, fontFamily: "'Noto Sans JP'",
                  }}>{addSaving ? '保存中...' : '追加'}</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ============================================================
// Stats View (Performance Dashboard)
// ============================================================
// StatsView は src/components/views/StatsView.jsx に移動済み
