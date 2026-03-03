import { useState } from 'react';
import { C } from '../../constants/colors';

export default function RecallModal({ row, statusId, onSubmit, onCancel, members = [] }) {
  // membersは文字列配列またはオブジェクト配列のどちらでも受け付ける
  const memberNames = members.map(m => typeof m === 'string' ? m : (m?.name || ''));
  const [form, setForm] = useState({
    recallDate: "",
    recallTime: "",
    assignee: "",
    note: "",
  });
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const u = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const inputStyle = {
    width: "100%", padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.border,
    fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", background: C.offWhite,
  };
  const labelStyle = { fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 2, display: "block" };

  const handleAssigneeChange = (v) => {
    u("assignee", v);
    const filtered = v ? memberNames.filter(m => m.includes(v)) : memberNames;
    setSuggestions(filtered);
    setShowSuggestions(filtered.length > 0);
  };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: C.white, borderRadius: 12, width: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
        <div style={{ padding: "14px 20px", background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")", borderRadius: "12px 12px 0 0", color: C.white }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>📞 再コール設定</div>
          <div style={{ fontSize: 11, color: C.goldLight }}>{row.company}　{statusId === "ceo_recall" ? "（社長再コール）" : "（受付再コール）"}</div>
        </div>
        <div style={{ padding: "16px 20px" }}>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={labelStyle}>再コール日</label>
                <input type="date" value={form.recallDate} onChange={e => u("recallDate", e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>時間</label>
                <input type="time" value={form.recallTime} onChange={e => u("recallTime", e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div style={{ position: "relative" }}>
              <label style={labelStyle}>再コール担当者</label>
              <input
                value={form.assignee}
                onChange={e => handleAssigneeChange(e.target.value)}
                onFocus={() => { const f = form.assignee ? memberNames.filter(m => m.includes(form.assignee)) : memberNames; setSuggestions(f); setShowSuggestions(f.length > 0); }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                style={inputStyle}
                placeholder="架電担当者名"
              />
              {showSuggestions && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.white, border: "1px solid " + C.border, borderRadius: 4, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", zIndex: 100, maxHeight: 160, overflowY: "auto" }}>
                  {suggestions.map((m, i) => (
                    <div key={i} onMouseDown={() => { u("assignee", m); setShowSuggestions(false); }}
                      style={{ padding: "6px 10px", fontSize: 11, cursor: "pointer", color: C.textDark, fontFamily: "'Noto Sans JP'" }}
                      onMouseEnter={e => e.currentTarget.style.background = C.offWhite}
                      onMouseLeave={e => e.currentTarget.style.background = C.white}
                    >{m}</div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label style={labelStyle}>メモ</label>
              <textarea value={form.note} onChange={e => u("note", e.target.value)} style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} placeholder="先方から伝えられたこと等" />
            </div>
          </div>
        </div>
        <div style={{ padding: "10px 20px", borderTop: "1px solid " + C.borderLight, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{
            padding: "8px 20px", borderRadius: 6, border: "1px solid " + C.border,
            background: C.white, cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.textMid, fontFamily: "'Noto Sans JP'",
          }}>キャンセル</button>
          <button onClick={() => onSubmit(form)} style={{
            padding: "8px 24px", borderRadius: 6, border: "none",
            background: "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")",
            cursor: "pointer", fontSize: 11, fontWeight: 700, color: C.white, fontFamily: "'Noto Sans JP'",
          }}>保存</button>
        </div>
      </div>
    </div>
  );
}