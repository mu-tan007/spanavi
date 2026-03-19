import { useState, useEffect } from 'react';
import { C } from '../../constants/colors';
import { DEFAULT_BASIC_SCRIPT } from '../../constants/scripts';
import { fetchSetting, saveSetting } from '../../lib/supabaseWrite';

export default function ScriptView({ isAdmin, clientData, callListData }) {
  const [basicScript, setBasicScript] = useState(DEFAULT_BASIC_SCRIPT);
  const [basicScriptEdit, setBasicScriptEdit] = useState(DEFAULT_BASIC_SCRIPT);
  const [savedOk, setSavedOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clientTabs, setClientTabs] = useState({});
  const [videoOpen, setVideoOpen] = useState(false);
  const [qaOpen, setQaOpen] = useState(false);
  const [qaTab, setQaTab] = useState('reception');
  const VIDEO_ID = '1j465Gq-MIEqzcL3LreZmNRaC1zhWtHdt';

  const QA_DATA = {
    reception: [
      { q: 'ご用件は何でしょうか？', a: 'M＆Aに関するご案内でご連絡しております。社長様はいらっしゃいますか？' },
      { q: 'どちらの会社の方ですか？', a: '○○株式会社の○○と申します。' },
      { q: '資料を送ってください', a: 'ご説明の機会をいただいた際にお持ちします。ぜひ30分ほどお時間をいただけますでしょうか。' },
      { q: '後でかけ直してください', a: '承知しました。何時頃にお電話すればよろしいでしょうか。' },
      { q: '担当者名を教えてください', a: '私、○○と申します。' },
      { q: '何の件ですか？と聞かれた場合', a: '事業承継・M＆Aに関する情報提供でご連絡しております。' },
    ],
    president: [
      { q: '売る気はない', a: 'おっしゃる通りです。今すぐではなく、将来の選択肢として情報だけでも持っておいていただければ、いざという時に役立ちます。30分だけお時間いただけますか？' },
      { q: '他の会社からも電話が来る', a: 'そうですよね。数多くの業者の中で、私どもは○○という点でご支持いただいており、実績も豊富です。ぜひ一度比較していただければと思います。' },
      { q: '忙しいから時間がない', a: 'お忙しいところ申し訳ございません。30分だけで結構です。ご都合のよい日時を教えていただけますか？' },
      { q: '今は考えていない', a: '承知しました。ただ、情報として知っておいていただくだけでも将来必ずお役に立てます。簡単なご説明だけさせてください。' },
      { q: '子供に継がせる', a: 'それは素晴らしいですね。ただ、もし事情が変わった場合の選択肢として知っておいていただくだけでも損はないかと思います。' },
      { q: '会社の状況が良くない', a: 'そのような状況だからこそ、M＆Aを活用することで従業員の雇用を守りながら最善の判断ができる場合があります。ぜひ一度お話だけでも。' },
    ],
  };

  useEffect(() => {
    fetchSetting('basic_script').then(({ value }) => {
      const text = value || DEFAULT_BASIC_SCRIPT;
      setBasicScript(text);
      setBasicScriptEdit(text);
    });
  }, []);

  const handleSaveBasicScript = async () => {
    setSaving(true);
    const err = await saveSetting('basic_script', basicScriptEdit);
    setSaving(false);
    if (err) { alert('保存に失敗しました'); return; }
    setBasicScript(basicScriptEdit);
    setSavedOk(true);
    setTimeout(() => setSavedOk(false), 2000);
  };

  const activeClients = (clientData || []).filter(c =>
    c.status === '支援中' &&
    (callListData || []).some(l => l.company === c.company && !l.is_archived)
  );

  return (
    <div style={{ animation: "fadeIn 0.3s ease", padding: "0 0 40px 0" }}>
      {/* Page Header */}
      <div style={{ marginBottom: 24, paddingBottom: 14, borderBottom: '1px solid #0D2247' }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#0D2247', letterSpacing: '-0.3px' }}>Scripts</div>
        <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>架電スクリプトライブラリ</div>
      </div>

      {/* 基本スクリプト */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0D2247', borderBottom: '2px solid #0D2247', paddingBottom: 6 }}>基本スクリプト</h2>
          <button onClick={() => setQaOpen(true)} style={{ background: '#0D2247', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>想定問答を見る</button>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, padding: "16px 20px" }}>
          {isAdmin ? (
            <>
              <textarea
                value={basicScriptEdit}
                onChange={e => setBasicScriptEdit(e.target.value)}
                rows={10}
                style={{ width: "100%", border: "none", outline: "none", resize: "vertical",
                  fontSize: 13, color: C.textDark, fontFamily: "'Noto Sans JP', sans-serif",
                  background: "transparent", lineHeight: 1.8, boxSizing: "border-box" }}
                placeholder="基本スクリプトを入力してください..."
              />
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                <button
                  onClick={handleSaveBasicScript}
                  disabled={saving}
                  style={{ background: '#0D2247', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontSize: 11, fontWeight: 500, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}>
                  {saving ? "保存中..." : "保存"}
                </button>
                {savedOk && <span style={{ fontSize: 12, color: "#27ae60" }}>保存しました</span>}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: C.textDark, lineHeight: 1.8, whiteSpace: "pre-wrap", minHeight: 120 }}>
              {basicScript || <span style={{ color: C.textLight, fontStyle: "italic" }}>（スクリプト未設定）</span>}
            </div>
          )}
        </div>

        {/* 参考動画サムネイル */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 6 }}>参考動画</div>
          <div onClick={() => setVideoOpen(true)}
            style={{ position: "relative", width: 200, height: 120, borderRadius: 4,
              overflow: "hidden", cursor: "pointer",
              border: '1px solid #E5E7EB', display: "inline-block" }}>
            <img
              src={`https://drive.google.com/thumbnail?id=${VIDEO_ID}&sz=w400`}
              alt="参考動画サムネイル"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.28)",
              display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 42, height: 42, borderRadius: "50%",
                background: "rgba(255,255,255,0.88)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 17, paddingLeft: 3 }}>
                ▶
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* クライアント別スクリプト */}
      <div>
        <h2 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: '#0D2247', borderBottom: '2px solid #0D2247', paddingBottom: 6 }}>クライアント別スクリプト</h2>
        {activeClients.length === 0 ? (
          <div style={{ color: C.textLight, fontSize: 13, padding: "20px 0" }}>支援中のクライアントがありません</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {activeClients.map((client, cIdx) => {
              const clientLists = (callListData || []).filter(l => l.company === client.company && !l.is_archived);
              const allIndustries = [...new Set(clientLists.map(l => l.industry).filter(Boolean))];
              const activeTab = clientTabs[cIdx] ?? 0;
              const activeList = clientLists.find(l => l.industry === allIndustries[activeTab]) ?? clientLists[0];
              return (
                <div key={client._supaId || cIdx}
                  style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ background: '#0D2247', padding: "10px 16px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', wordBreak: "break-all" }}>{client.company}</div>
                    <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>{client.industry || ''}</div>
                  </div>
                  {allIndustries.length > 1 && (
                    <div style={{ display: "flex", overflowX: "auto", borderBottom: "1px solid #E5E7EB", background: '#F8F9FA' }}>
                      {allIndustries.map((ind, iIdx) => (
                        <button key={iIdx}
                          onClick={() => setClientTabs(prev => ({ ...prev, [cIdx]: iIdx }))}
                          style={{ padding: "5px 12px", border: "none", cursor: "pointer",
                            fontSize: 10, fontWeight: activeTab === iIdx ? 700 : 400,
                            background: "transparent",
                            color: activeTab === iIdx ? '#0D2247' : '#9CA3AF',
                            borderBottom: "2px solid " + (activeTab === iIdx ? '#0D2247' : "transparent"),
                            whiteSpace: "nowrap", fontFamily: "'Noto Sans JP'" }}>
                          {ind}
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ padding: "14px 16px", maxHeight: 220, overflowY: "auto" }}>
                    {activeList?.scriptBody ? (
                      <div style={{ fontSize: 12, color: C.textDark, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                        {activeList.scriptBody}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: C.textLight, fontStyle: "italic" }}>スクリプト未設定</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 想定問答モーダル */}
      {qaOpen && (
        <div onClick={() => setQaOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9400,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '90vw', maxWidth: 640, maxHeight: '80vh', borderRadius: 4,
              background: '#fff', border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ background: '#0D2247', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, fontWeight: 600, fontSize: 15, color: '#fff' }}>
              <span>想定問答集</span>
              <button onClick={() => setQaOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: 'flex', borderBottom: '1px solid #E5E7EB', flexShrink: 0 }}>
              {[['reception', '受付対応'], ['president', '社長対応']].map(([k, l]) => (
                <button key={k} onClick={() => setQaTab(k)} style={{ flex: 1, padding: '10px', border: 'none', background: 'transparent', fontWeight: qaTab === k ? 600 : 400, fontSize: 12, color: qaTab === k ? '#0D2247' : '#9CA3AF', borderBottom: qaTab === k ? '2px solid #0D2247' : '2px solid transparent', cursor: 'pointer', fontFamily: "'Noto Sans JP'" }}>
                  {l}
                </button>
              ))}
            </div>
            <div style={{ overflowY: 'auto', padding: '16px 20px' }}>
              {QA_DATA[qaTab].map((item, i) => (
                <div key={i} style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 4, background: '#F8F9FA', borderLeft: '3px solid #0D2247' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Q: {item.q}</div>
                  <div style={{ fontSize: 12, color: '#0D2247', lineHeight: 1.7 }}>A: {item.a}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 動画モーダル */}
      {videoOpen && (
        <div onClick={() => setVideoOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9500,
            display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ position: "relative", width: "80vw", maxWidth: 800, borderRadius: 4,
              overflow: "hidden", border: '1px solid #E5E7EB' }}>
            <button onClick={() => setVideoOpen(false)}
              style={{ position: "absolute", top: 8, right: 8, zIndex: 1,
                width: 32, height: 32, borderRadius: "50%",
                background: "rgba(0,0,0,0.55)", border: "none",
                color: "white", fontSize: 15, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                lineHeight: 1 }}>
              ✕
            </button>
            <iframe
              src={`https://drive.google.com/file/d/${VIDEO_ID}/preview`}
              width="100%"
              height="450"
              allow="autoplay"
              allowFullScreen
              style={{ display: "block", border: "none" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
