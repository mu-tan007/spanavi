import { useState } from "react";
import { C } from '../../constants/colors';
import { CALL_RESULTS } from '../../constants/callResults';
import { Badge } from '../common/Badge';

const INTERNS = [
  "成尾 拓輝", "武山 創", "小山 在人", "坂 玲央奈", "山村 蓮",
  "尾鼻 優吾", "古木 優作", "石井 智也", "半田 航希", "高橋 航世",
  "吉川 諒馬", "清水 慧吾", "竹野内 佑大", "伊藤 耶麻音", "上田 悠斗",
  "伊藤 航", "吉藤 永翔", "池田 紘規", "植木 帆希", "徳富 悠風",
  "石井 佑弥", "瀬尾 貫太", "高尾 諭良", "小中谷 樹斗", "岡田 大和",
  "山元 真滉", "浅井 佑", "粟飯原 柚月", "中村 光希", "能登谷 斗夢",
  "鍛冶 雅也", "篠原 大吾朗", "中島 稀里琥", "平 晴來", "羽室 れい",
  "伊藤 結音", "川又 友翔", "小林 武蔵", "渡部 陽生",
];

export default function LogView({ callLogs, logFormOpen, setLogFormOpen, addCallLog, enrichedLists, now, callListData }) {
  const [formData, setFormData] = useState({ listId: "", caller: "", startNum: "", endNum: "", memo: "" });
  const availableLists = enrichedLists.filter(l => l.status === "架電可能");
  const todayLogs = callLogs.filter(l => new Date(l.date).toDateString() === now.toDateString());
  const recentLogs = [...callLogs].reverse().slice(0, 30);

  const handleSubmit = () => {
    if (!formData.listId || !formData.caller) return;
    addCallLog({ listId: parseInt(formData.listId), caller: formData.caller, startNum: formData.startNum ? parseInt(formData.startNum) : null, endNum: formData.endNum ? parseInt(formData.endNum) : null, memo: formData.memo });
    setFormData({ listId: "", caller: "", startNum: "", endNum: "", memo: "" });
  };

  const inputStyle = { padding: "10px 14px", borderRadius: 6, background: C.offWhite, border: "1px solid " + C.border, color: C.textDark, fontSize: 13, fontFamily: "'Noto Sans JP'", outline: "none", width: "100%" };

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.navy, fontFamily: "'Noto Serif JP', serif" }}>架電ログ</h2>
        <button onClick={() => setLogFormOpen(!logFormOpen)} style={{
          padding: "8px 20px", borderRadius: 8,
          background: logFormOpen ? C.white : "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")",
          border: logFormOpen ? "1px solid " + C.border : "none",
          color: logFormOpen ? C.textDark : C.white, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'Noto Sans JP'",
        }}>{logFormOpen ? "✕ 閉じる" : "＋ ログを記録"}</button>
      </div>

      {logFormOpen && (
        <div style={{ background: C.white, border: "1px solid " + C.gold + "40", borderRadius: 12, padding: 24, marginBottom: 24, animation: "fadeIn 0.3s ease", borderLeft: "4px solid " + C.gold }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: C.navy }}>新しい架電ログ</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>リスト *</label>
              <select value={formData.listId} onChange={e => setFormData(p => ({ ...p, listId: e.target.value }))} style={inputStyle}>
                <option value="">選択してください</option>
                {availableLists.map(l => <option key={l.id} value={l.id}>{l.company} - {l.industry}（{l.count.toLocaleString()}社）</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>架電者 *</label>
              <select value={formData.caller} onChange={e => setFormData(p => ({ ...p, caller: e.target.value }))} style={inputStyle}>
                <option value="">選択してください</option>
                {INTERNS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>開始番号</label>
              <input type="number" placeholder="" value={formData.startNum} onChange={e => setFormData(p => ({ ...p, startNum: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>終了番号</label>
              <input type="number" placeholder="" value={formData.endNum} onChange={e => setFormData(p => ({ ...p, endNum: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>メモ</label>
              <textarea value={formData.memo} onChange={e => setFormData(p => ({ ...p, memo: e.target.value }))} style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} placeholder="特記事項があれば..." />
            </div>
          </div>
          {formData.listId && formData.startNum && (() => {
            const conflicts = callLogs.filter(l => {
              if (l.listId !== parseInt(formData.listId)) return false;
              const daysDiff = (now - new Date(l.date)) / (1000*60*60*24);
              if (daysDiff > 2) return false;
              const s = parseInt(formData.startNum), e = parseInt(formData.endNum) || s;
              return l.startNum && l.endNum && !(e < l.startNum || s > l.endNum);
            });
            if (conflicts.length > 0) return (
              <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 6, background: C.redLight, border: "1px solid " + C.red + "30", fontSize: 12, color: C.red }}>
                ⚠ 直近2日以内にこの番号範囲で架電記録があります：{conflicts.map(c => c.caller + "（" + c.startNum + "〜" + c.endNum + "番）").join("、")}
              </div>
            );
            return null;
          })()}
          <div style={{ marginTop: 16 }}>
            <button onClick={handleSubmit} disabled={!formData.listId || !formData.caller} style={{
              padding: "10px 28px", borderRadius: 8,
              background: formData.listId && formData.caller ? C.navy : C.border,
              border: "none", color: C.white, cursor: formData.listId && formData.caller ? "pointer" : "not-allowed",
              fontSize: 13, fontWeight: 600, fontFamily: "'Noto Sans JP'",
            }}>記録する</button>
          </div>
        </div>
      )}

      {todayLogs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: C.textMid }}>本日の架電ログ（{todayLogs.length}件）</div>
          {todayLogs.map(log => { const list = callListData.find(l => l.id === log.listId); return (
            <div key={log.id} style={{ background: C.white, border: "1px solid " + C.borderLight, borderRadius: 8, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, fontSize: 12, marginBottom: 6 }}>
              <span style={{ fontWeight: 600, color: C.navy }}>{log.caller}</span>
              <span style={{ color: C.textLight }}>→</span>
              <span style={{ fontWeight: 500 }}>{list?.company}</span>
              <Badge color={C.textLight} small>{list?.industry}</Badge>
              {log.startNum && log.endNum && <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: C.green }}>#{log.startNum}〜{log.endNum}</span>}
              <span style={{ fontSize: 10, color: C.textLight, marginLeft: "auto" }}>{new Date(log.date).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          ); })}
        </div>
      )}

      {recentLogs.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: C.textMid }}>直近の架電ログ</div>
          {recentLogs.map(log => { const list = callListData.find(l => l.id === log.listId); return (
            <div key={log.id} style={{ background: C.white, border: "1px solid " + C.borderLight, borderRadius: 6, padding: "8px 14px", display: "flex", alignItems: "center", gap: 10, fontSize: 11, marginBottom: 4 }}>
              <span style={{ fontFamily: "'JetBrains Mono'", color: C.textLight, minWidth: 50, fontSize: 10 }}>{new Date(log.date).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}</span>
              <span style={{ fontWeight: 600, color: C.navy, minWidth: 70 }}>{log.caller}</span>
              <span style={{ color: C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{list?.company} - {list?.industry}</span>
              {log.startNum && <span style={{ color: C.green, fontFamily: "'JetBrains Mono'", fontSize: 10 }}>#{log.startNum}〜{log.endNum}</span>}
            </div>
          ); })}
        </div>
      )}

      {callLogs.length === 0 && !logFormOpen && (
        <div style={{ textAlign: "center", padding: "60px 0", color: C.textLight }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📝</div>
          <div style={{ fontSize: 14 }}>まだ架電ログがありません</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>「＋ ログを記録」ボタンから始めましょう</div>
        </div>
      )}
    </div>
  );
}
