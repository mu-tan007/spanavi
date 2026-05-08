import { useState } from "react";
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge } from '../ui';
import { CALL_RESULTS } from '../../constants/callResults';
import { Badge as CommonBadge } from '../common/Badge';
import PageHeader from '../common/PageHeader';

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

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <PageHeader
        eyebrow="Sourcing · ログ"
        title="架電ログ"
        description="日次架電の記録と重複チェック"
        style={{ marginBottom: 24 }}
        right={
          <Button
            variant={logFormOpen ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => setLogFormOpen(!logFormOpen)}
          >{logFormOpen ? "✕ 閉じる" : "＋ ログを記録"}</Button>
        }
      />

      {logFormOpen && (
        <Card
          padding="none"
          style={{
            border: "1px solid " + alpha(color.gold, 0.25),
            borderLeft: "2px solid " + color.gold,
            marginBottom: 24,
            animation: "fadeIn 0.3s ease",
          }}
        >
          <div style={{ padding: 24 }}>
            <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, marginBottom: 16, color: color.navy }}>新しい架電ログ</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Select
                label="リスト *"
                value={formData.listId}
                onChange={e => setFormData(p => ({ ...p, listId: e.target.value }))}
                options={[
                  { value: "", label: "選択してください" },
                  ...availableLists.map(l => ({ value: l.id, label: `${l.company} - ${l.industry}（${l.count.toLocaleString()}社）` })),
                ]}
              />
              <Select
                label="架電者 *"
                value={formData.caller}
                onChange={e => setFormData(p => ({ ...p, caller: e.target.value }))}
                options={[
                  { value: "", label: "選択してください" },
                  ...INTERNS.map(n => ({ value: n, label: n })),
                ]}
              />
              <Input
                label="開始番号"
                type="number"
                value={formData.startNum}
                onChange={e => setFormData(p => ({ ...p, startNum: e.target.value }))}
              />
              <Input
                label="終了番号"
                type="number"
                value={formData.endNum}
                onChange={e => setFormData(p => ({ ...p, endNum: e.target.value }))}
              />
              <div style={{ gridColumn: "span 2" }}>
                <label style={{ fontSize: font.size.xs, color: color.textLight, display: "block", marginBottom: 4, fontWeight: font.weight.semibold }}>メモ</label>
                <textarea
                  value={formData.memo}
                  onChange={e => setFormData(p => ({ ...p, memo: e.target.value }))}
                  style={{
                    padding: "10px 14px", borderRadius: radius.lg, background: color.offWhite,
                    border: "1px solid " + color.border, color: color.textDark,
                    fontSize: font.size.base, fontFamily: font.family.sans, outline: "none",
                    width: "100%", minHeight: 60, resize: "vertical",
                    boxSizing: "border-box",
                  }}
                  placeholder="特記事項があれば..."
                />
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
                <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: radius.lg, background: color.dangerSoft, border: "1px solid " + alpha(color.danger, 0.2), fontSize: font.size.sm, color: color.danger }}>
                  直近2日以内にこの番号範囲で架電記録があります：{conflicts.map(c => c.caller + "（" + c.startNum + "〜" + c.endNum + "番）").join("、")}
                </div>
              );
              return null;
            })()}
            <div style={{ marginTop: 16 }}>
              <Button
                onClick={handleSubmit}
                disabled={!formData.listId || !formData.caller}
                size="lg"
              >記録する</Button>
            </div>
          </div>
        </Card>
      )}

      {todayLogs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: font.size.base, fontWeight: font.weight.semibold, marginBottom: 10, color: color.textMid }}>本日の架電ログ（{todayLogs.length}件）</div>
          {todayLogs.map(log => { const list = callListData.find(l => l.id === log.listId); return (
            <div key={log.id} style={{ background: color.white, border: "1px solid " + color.borderLight, borderRadius: radius.xl, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, fontSize: font.size.sm, marginBottom: 6 }}>
              <span style={{ fontWeight: font.weight.semibold, color: color.navy }}>{log.caller}</span>
              <span style={{ color: color.textLight }}>→</span>
              <span style={{ fontWeight: font.weight.medium }}>{list?.company}</span>
              <CommonBadge color={color.textLight} small>{list?.industry}</CommonBadge>
              {log.startNum && log.endNum && <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs, color: color.success }}>#{log.startNum}〜{log.endNum}</span>}
              <span style={{ fontSize: font.size.xs - 1, color: color.textLight, marginLeft: "auto" }}>{new Date(log.date).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          ); })}
        </div>
      )}

      {recentLogs.length > 0 && (
        <div>
          <div style={{ fontSize: font.size.base, fontWeight: font.weight.semibold, marginBottom: 10, color: color.textMid }}>直近の架電ログ</div>
          {recentLogs.map(log => { const list = callListData.find(l => l.id === log.listId); return (
            <div key={log.id} style={{ background: color.white, border: "1px solid " + color.borderLight, borderRadius: radius.lg, padding: "8px 14px", display: "flex", alignItems: "center", gap: 10, fontSize: font.size.xs, marginBottom: 4 }}>
              <span style={{ fontFamily: font.family.mono, color: color.textLight, minWidth: 50, fontSize: font.size.xs - 1 }}>{new Date(log.date).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}</span>
              <span style={{ fontWeight: font.weight.semibold, color: color.navy, minWidth: 70 }}>{log.caller}</span>
              <span style={{ color: color.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{list?.company} - {list?.industry}</span>
              {log.startNum && <span style={{ color: color.success, fontFamily: font.family.mono, fontSize: font.size.xs - 1 }}>#{log.startNum}〜{log.endNum}</span>}
            </div>
          ); })}
        </div>
      )}

      {callLogs.length === 0 && !logFormOpen && (
        <div style={{ textAlign: "center", padding: "60px 0", color: color.textLight }}>
          <div style={{ fontSize: font.size.md }}>まだ架電ログがありません</div>
          <div style={{ fontSize: font.size.sm, marginTop: 4 }}>「＋ ログを記録」ボタンから始めましょう</div>
        </div>
      )}
    </div>
  );
}
