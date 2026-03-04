import { useState, useEffect, useRef } from "react";
import { C } from '../../constants/colors';

export default function AIAssistantView({ appoData, members, callListData, industryRules, currentUser }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const buildSystemPrompt = () => {
    const countableStatuses = new Set(["面談済", "事前確認済", "アポ取得"]);
    const activeAppo = appoData.filter(a => countableStatuses.has(a.status));
    const totalSales = activeAppo.reduce((s, a) => s + a.sales, 0);
    const totalReward = activeAppo.reduce((s, a) => s + a.reward, 0);

    const teamSummary = {};
    members.forEach(m => {
      const t = m.team || "その他";
      if (!teamSummary[t]) teamSummary[t] = 0;
      teamSummary[t]++;
    });

    const rulesText = industryRules.map(r => `${r.industry}: ${r.rule}`).join("\n");

    return `あなたはMASP（M&A Sourcing Partners）の社内AIアシスタント「MASP AI」です。
テレアポ（電話営業）によるM&A仲介企業向けアポイント獲得サービスを運営する会社のスタッフをサポートします。

【会社概要】
・M&A仲介会社・PEファンド・事業会社向けにアポイント獲得代行サービスを提供
・約${members.length}名のインターン生が架電業務を担当
・成果報酬型（アポ1件あたり11万〜16.5万円）
・チーム制：${Object.entries(teamSummary).map(([t, c]) => t + "（" + c + "名）").join("、")}

【現在の実績サマリ】
・有効アポ数: ${activeAppo.length}件（全${appoData.length}件中）
・当社売上合計: ¥${totalSales.toLocaleString()}
・インターン報酬合計: ¥${totalReward.toLocaleString()}
・クライアント数: ${callListData.length}社（架電リスト）

【業種別架電ルール】
${rulesText}

【社内ルール・方針】
・架電時間帯: 基本は平日9:00〜18:00（業種により異なる）
・社長通電が最優先目標。受付突破が重要
・アポ取得時は必ずアポ取得報告を提出
・ステータス管理: 不通、社長不在、受付ブロック、受付再コール、社長再コール、社長お断り、除外（廃止番号・クレーム等）、アポ獲得
・報酬体系: トレーニー(22%)、プレイヤー(24%)、スパルタン(26%)、スーパースパルタン(28%)
・チームボーナス制度あり

【あなたの役割】
1. 架電のアドバイス（受付突破トーク、社長への切り返し、業種別の攻め方など）
2. 社内規定やルールの説明
3. 業務に関する一般的な質問への回答
4. モチベーション向上のサポート

回答は簡潔かつ実践的に。日本語で回答してください。
架電アドバイスでは、具体的なトーク例を交えて回答してください。`;
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: buildSystemPrompt(),
          messages: apiMessages,
        }),
      });
      const data = await response.json();
      const assistantText = data.content?.map(b => b.type === "text" ? b.text : "").join("") || "回答を取得できませんでした。";
      setMessages(prev => [...prev, { role: "assistant", content: assistantText }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: "エラーが発生しました: " + err.message }]);
    }
    setLoading(false);
  };

  const quickQuestions = [
    "受付突破のコツを教えて",
    "建設業への架電で気をつけることは？",
    "社長に断られた時の切り返しトーク",
    "アポ取得報告の書き方",
    "再コールのベストタイミングは？",
    "報酬体系について教えて",
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 130px)", animation: "fadeIn 0.3s ease" }}>
      {/* Header */}
      <div style={{
        background: C.white, borderRadius: 10, padding: "14px 20px", marginBottom: 12,
        border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, color: C.white, fontWeight: 900,
          }}>AI</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>MASP AI アシスタント</div>
            <div style={{ fontSize: 10, color: C.textLight }}>架電アドバイス・社内ルール・業務サポート</div>
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])} style={{
            padding: "4px 12px", borderRadius: 6, border: "1px solid " + C.borderLight,
            background: C.white, cursor: "pointer", fontSize: 10, color: C.textMid,
            fontFamily: "'Noto Sans JP'", fontWeight: 600,
          }}>チャットをクリア</button>
        )}
      </div>

      {/* Chat area */}
      <div style={{
        flex: 1, overflowY: "auto", background: C.white, borderRadius: 10,
        border: "1px solid " + C.borderLight, padding: 16,
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        {messages.length === 0 ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
            <div style={{
              width: 60, height: 60, borderRadius: 16,
              background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24, color: C.white, fontWeight: 900,
            }}>AI</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.navy, marginBottom: 4 }}>MASP AI アシスタント</div>
              <div style={{ fontSize: 12, color: C.textLight }}>架電のコツや社内ルールなど、何でも聞いてください</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", maxWidth: 500 }}>
              {quickQuestions.map((q, i) => (
                <button key={i} onClick={() => { setInput(q); }} style={{
                  padding: "6px 12px", borderRadius: 16, border: "1px solid " + C.borderLight,
                  background: C.offWhite, cursor: "pointer", fontSize: 11, color: C.navy,
                  fontFamily: "'Noto Sans JP'", fontWeight: 500, transition: "all 0.15s",
                }}>{q}</button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} style={{
              display: "flex", gap: 10, justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}>
              {msg.role === "assistant" && (
                <div style={{
                  width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                  background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, color: C.white, fontWeight: 900,
                }}>AI</div>
              )}
              <div style={{
                maxWidth: "75%", padding: "10px 14px", borderRadius: 12,
                background: msg.role === "user" ? C.navy : C.offWhite,
                color: msg.role === "user" ? C.white : C.textDark,
                fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap",
                borderBottomRightRadius: msg.role === "user" ? 4 : 12,
                borderBottomLeftRadius: msg.role === "assistant" ? 4 : 12,
              }}>{msg.content}</div>
              {msg.role === "user" && (
                <div style={{
                  width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                  background: C.gold + "20", border: "1px solid " + C.gold + "40",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, color: C.navy, fontWeight: 700,
                }}>{(currentUser || "?").slice(0, 1)}</div>
              )}
            </div>
          ))
        )}
        {loading && (
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, flexShrink: 0,
              background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, color: C.white, fontWeight: 900,
            }}>AI</div>
            <div style={{
              padding: "10px 14px", borderRadius: 12, background: C.offWhite,
              fontSize: 13, color: C.textLight, animation: "pulse 1.5s infinite",
            }}>考え中...</div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input area */}
      <div style={{
        display: "flex", gap: 8, marginTop: 12, padding: "12px 16px",
        background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight,
        boxShadow: "0 -1px 4px rgba(26,58,92,0.04)",
      }}>
        <input
          type="text" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="質問を入力... (Enter で送信)"
          style={{
            flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid " + C.border,
            background: C.offWhite, fontSize: 13, color: C.textDark,
            fontFamily: "'Noto Sans JP'", outline: "none",
          }}
        />
        <button onClick={sendMessage} disabled={loading || !input.trim()} style={{
          padding: "10px 20px", borderRadius: 8,
          background: loading || !input.trim() ? C.borderLight : "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")",
          border: "none", color: C.white, cursor: loading || !input.trim() ? "default" : "pointer",
          fontSize: 13, fontWeight: 700, fontFamily: "'Noto Sans JP'",
          opacity: loading || !input.trim() ? 0.5 : 1,
          transition: "all 0.15s",
        }}>送信</button>
      </div>
    </div>
  );
}
