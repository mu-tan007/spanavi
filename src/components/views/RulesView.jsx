import { useState } from "react";
import { C } from '../../constants/colors';
import { Badge } from '../common/Badge';

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

export default function RulesView({ industryRules, setIndustryRules, ruleEditorOpen, setRuleEditorOpen, editingRule, setEditingRule, isAdmin = false }) {
  const [newRule, setNewRule] = useState({ industry: "", rule: "", goodDays: [], badDays: [], goodHours: "", badHours: "", level: "normal" });
  const inputStyle = { padding: "10px 14px", borderRadius: 6, background: C.offWhite, border: "1px solid " + C.border, color: C.textDark, fontSize: 13, fontFamily: "'Noto Sans JP'", outline: "none", width: "100%" };

  const toggleDay = (day, field) => setNewRule(prev => { const arr = [...prev[field]]; const idx = arr.indexOf(day); if (idx >= 0) arr.splice(idx, 1); else arr.push(day); return { ...prev, [field]: arr }; });

  const handleSave = () => {
    if (!newRule.industry || !newRule.rule) return;
    if (editingRule !== null) setIndustryRules(prev => prev.map((r, i) => i === editingRule ? { ...newRule } : r));
    else setIndustryRules(prev => [...prev, { ...newRule }]);
    setNewRule({ industry: "", rule: "", goodDays: [], badDays: [], goodHours: "", badHours: "", level: "normal" });
    setRuleEditorOpen(false); setEditingRule(null);
  };

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.navy, fontFamily: "'Noto Serif JP', serif" }}>業種別架電ルール管理</h2>
        {isAdmin && <button onClick={() => { setRuleEditorOpen(!ruleEditorOpen); setEditingRule(null); setNewRule({ industry: "", rule: "", goodDays: [], badDays: [], goodHours: "", badHours: "", level: "normal" }); }} style={{
          padding: "8px 20px", borderRadius: 8,
          background: ruleEditorOpen ? C.white : "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")",
          border: ruleEditorOpen ? "1px solid " + C.border : "none",
          color: ruleEditorOpen ? C.textDark : C.white, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'Noto Sans JP'",
        }}>{ruleEditorOpen ? "✕ 閉じる" : "＋ ルールを追加"}</button>}
      </div>

      {ruleEditorOpen && (
        <div style={{ background: C.white, border: "1px solid " + C.gold + "40", borderRadius: 12, padding: 24, marginBottom: 24, animation: "fadeIn 0.3s ease", borderLeft: "4px solid " + C.gold }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: C.navy }}>{editingRule !== null ? "ルールを編集" : "新しいルール"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>業種名 *</label>
              <input value={newRule.industry} onChange={e => setNewRule(p => ({ ...p, industry: e.target.value }))} style={inputStyle} placeholder="例: 不動産" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>レベル</label>
              <select value={newRule.level} onChange={e => setNewRule(p => ({ ...p, level: e.target.value }))} style={inputStyle}>
                <option value="excellent">優良</option><option value="normal">通常</option><option value="specific">特定時間のみ</option><option value="warning">注意が必要</option>
              </select>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>ルール説明 *</label>
              <input value={newRule.rule} onChange={e => setNewRule(p => ({ ...p, rule: e.target.value }))} style={inputStyle} placeholder="例: 水曜・日曜はつながりにくい" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 6, fontWeight: 600 }}>架電OK曜日</label>
              <div style={{ display: "flex", gap: 4 }}>
                {DAY_NAMES.map((d, i) => (
                  <button key={i} onClick={() => toggleDay(i, "goodDays")} style={{
                    width: 36, height: 32, borderRadius: 4, background: newRule.goodDays.includes(i) ? C.green + "20" : C.offWhite,
                    border: "1px solid " + (newRule.goodDays.includes(i) ? C.green : C.border),
                    color: newRule.goodDays.includes(i) ? C.green : C.textLight,
                    cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Noto Sans JP'",
                  }}>{d}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 6, fontWeight: 600 }}>架電NG曜日</label>
              <div style={{ display: "flex", gap: 4 }}>
                {DAY_NAMES.map((d, i) => (
                  <button key={i} onClick={() => toggleDay(i, "badDays")} style={{
                    width: 36, height: 32, borderRadius: 4, background: newRule.badDays.includes(i) ? C.red + "20" : C.offWhite,
                    border: "1px solid " + (newRule.badDays.includes(i) ? C.red : C.border),
                    color: newRule.badDays.includes(i) ? C.red : C.textLight,
                    cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Noto Sans JP'",
                  }}>{d}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>つながりやすい時間帯</label>
              <input value={newRule.goodHours} onChange={e => setNewRule(p => ({ ...p, goodHours: e.target.value }))} style={inputStyle} placeholder="例: 10:00〜12:00, 14:00〜17:00" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>つながりにくい時間帯</label>
              <input value={newRule.badHours} onChange={e => setNewRule(p => ({ ...p, badHours: e.target.value }))} style={inputStyle} placeholder="例: 12:00〜13:00" />
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <button onClick={handleSave} disabled={!newRule.industry || !newRule.rule} style={{
              padding: "10px 28px", borderRadius: 8, background: newRule.industry && newRule.rule ? C.navy : C.border,
              border: "none", color: C.white, cursor: newRule.industry && newRule.rule ? "pointer" : "not-allowed",
              fontSize: 13, fontWeight: 600, fontFamily: "'Noto Sans JP'",
            }}>{editingRule !== null ? "更新する" : "保存する"}</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {industryRules.map((rule, i) => (
          <div key={i} style={{
            background: C.white, border: "1px solid " + C.borderLight, borderRadius: 10, padding: "14px 18px",
            boxShadow: "0 1px 3px rgba(26,58,92,0.04)",
            animation: "slideIn 0.2s ease " + (i * 0.03) + "s both",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{rule.industry}</span>
                <Badge color={rule.level === "excellent" ? C.green : rule.level === "warning" ? C.orange : rule.level === "specific" ? C.goldDim : C.navyLight} glow>
                  {rule.level === "excellent" ? "優良" : rule.level === "warning" ? "注意" : rule.level === "specific" ? "特定時間" : "通常"}
                </Badge>
              </div>
              {isAdmin && <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { setNewRule({ ...rule }); setEditingRule(i); setRuleEditorOpen(true); }} style={{
                  padding: "4px 10px", borderRadius: 4, background: C.offWhite, border: "1px solid " + C.border,
                  color: C.textMid, cursor: "pointer", fontSize: 11, fontFamily: "'Noto Sans JP'",
                }}>編集</button>
                <button onClick={() => setIndustryRules(prev => prev.filter((_, idx) => idx !== i))} style={{
                  padding: "4px 10px", borderRadius: 4, background: C.redLight, border: "1px solid " + C.red + "25",
                  color: C.red, cursor: "pointer", fontSize: 11, fontFamily: "'Noto Sans JP'",
                }}>削除</button>
              </div>}
            </div>
            <div style={{ fontSize: 12, color: C.textMid, marginBottom: 8 }}>{rule.rule}</div>
            <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
              <div><span style={{ color: C.textLight }}>OK: </span><span style={{ color: C.green, fontWeight: 600 }}>{rule.goodDays.map(d => DAY_NAMES[d]).join("・") || "—"}</span></div>
              <div><span style={{ color: C.textLight }}>NG: </span><span style={{ color: C.red, fontWeight: 600 }}>{rule.badDays.map(d => DAY_NAMES[d]).join("・") || "—"}</span></div>
              {rule.goodHours && <div><span style={{ color: C.textLight }}>推奨: </span><span style={{ color: C.green }}>{rule.goodHours}</span></div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
