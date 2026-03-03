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
  const VIDEO_ID = '1j465Gq-MIEqzcL3LreZmNRaC1zhWtHdt';

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
      {/* 基本スクリプト */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700, color: C.navy }}>基本スクリプト</h2>

        <div style={{ background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight, padding: "16px 20px" }}>
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
                  style={{ padding: "6px 18px", borderRadius: 6, background: C.navy, color: C.white,
                    border: "none", cursor: saving ? "not-allowed" : "pointer", fontSize: 12,
                    fontFamily: "'Noto Sans JP', sans-serif", opacity: saving ? 0.6 : 1 }}>
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
          <div style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 6 }}>📹 参考動画</div>
          <div onClick={() => setVideoOpen(true)}
            style={{ position: "relative", width: 200, height: 120, borderRadius: 8,
              overflow: "hidden", cursor: "pointer",
              boxShadow: "0 2px 10px rgba(0,0,0,0.18)", display: "inline-block" }}>
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
        <h2 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700, color: C.navy }}>クライアント別スクリプト</h2>
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
                  style={{ background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight, overflow: "hidden" }}>
                  <div style={{ background: C.navy, padding: "10px 16px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.white, wordBreak: "break-all" }}>{client.company}</div>
                    <div style={{ fontSize: 10, color: C.textLight, marginTop: 2 }}>{client.industry || ''}</div>
                  </div>
                  {allIndustries.length > 1 && (
                    <div style={{ display: "flex", overflowX: "auto", borderBottom: "1px solid " + C.borderLight, background: C.offWhite }}>
                      {allIndustries.map((ind, iIdx) => (
                        <button key={iIdx}
                          onClick={() => setClientTabs(prev => ({ ...prev, [cIdx]: iIdx }))}
                          style={{ padding: "5px 12px", border: "none", cursor: "pointer",
                            fontSize: 10, fontWeight: activeTab === iIdx ? 700 : 400,
                            background: "transparent",
                            color: activeTab === iIdx ? C.navy : C.textLight,
                            borderBottom: "2px solid " + (activeTab === iIdx ? C.gold : "transparent"),
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

      {/* 動画モーダル */}
      {videoOpen && (
        <div onClick={() => setVideoOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9500,
            display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ position: "relative", width: "80vw", maxWidth: 800, borderRadius: 8,
              overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,0.4)" }}>
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
