import { useState } from "react";
import { C } from '../../constants/colors';

export default function LoginScreen({ onLogin, members }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const allOptions = [{ id: 0, name: "管理者" }, ...members];
  const filtered = allOptions.filter(m => !search || m.name.includes(search));

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(160deg, " + C.navyDeep + " 0%, " + C.navy + " 35%, #2a5d8f 60%, " + C.navyLight + " 100%)",
      fontFamily: "'Noto Sans JP', sans-serif", position: "relative", overflow: "hidden",
    }}>
      {/* Decorative circles */}
      <div style={{ position: "absolute", top: -80, right: -80, width: 300, height: 300, borderRadius: "50%", background: C.gold + "12" }}></div>
      <div style={{ position: "absolute", bottom: -60, left: -60, width: 200, height: 200, borderRadius: "50%", background: C.gold + "08" }}></div>
      <div style={{ position: "absolute", top: "30%", left: "10%", width: 120, height: 120, borderRadius: "50%", background: C.white + "05" }}></div>

      <div style={{
        background: C.white, borderRadius: 20, padding: "40px 40px 32px", width: 380,
        boxShadow: "0 16px 64px rgba(0,0,0,0.35)", position: "relative", zIndex: 1,
        borderTop: "2px solid " + C.gold,
      }}>
        <div style={{ textAlign: "center", marginBottom: 28, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <svg width="72" height="82" viewBox="0 0 52 60" style={{ marginBottom: 16 }}>
            <defs>
              <linearGradient id="spShieldBg" x1="0" y1="0" x2="0.3" y2="1">
                <stop offset="0%" stopColor="#1a3a5c"/>
                <stop offset="100%" stopColor="#22496e"/>
              </linearGradient>
              <clipPath id="shieldClipL"><path d="M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z"/></clipPath>
            </defs>
            <path d="M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z" fill="url(#spShieldBg)"/>
            <g clipPath="url(#shieldClipL)" stroke="white" fill="none">
              <g opacity="0.45" strokeWidth="1.2">
                <line x1="26" y1="30" x2="26" y2="-5"/><line x1="26" y1="30" x2="55" y2="30"/>
                <line x1="26" y1="30" x2="26" y2="65"/><line x1="26" y1="30" x2="-3" y2="30"/>
                <line x1="26" y1="30" x2="47" y2="5"/><line x1="26" y1="30" x2="47" y2="55"/>
                <line x1="26" y1="30" x2="5" y2="55"/><line x1="26" y1="30" x2="5" y2="5"/>
              </g>
              <g opacity="0.30" strokeWidth="0.8">
                <line x1="26" y1="30" x2="37" y2="-2"/><line x1="26" y1="30" x2="53" y2="16"/>
                <line x1="26" y1="30" x2="53" y2="44"/><line x1="26" y1="30" x2="37" y2="62"/>
                <line x1="26" y1="30" x2="15" y2="62"/><line x1="26" y1="30" x2="-1" y2="44"/>
                <line x1="26" y1="30" x2="-1" y2="16"/><line x1="26" y1="30" x2="15" y2="-2"/>
              </g>
            </g>
          </svg>
          <div style={{
            fontSize: 38, fontWeight: 800, letterSpacing: 2, color: C.navy,
            fontFamily: "'Outfit', sans-serif",
          }}>Spa<span style={{ background: "linear-gradient(180deg, #c6a358, #a8883a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>navi</span></div>
        </div>

        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.navy, marginBottom: 6, letterSpacing: 1 }}>ログインユーザーを選択</div>
          <input value={search} onChange={e => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="名前を入力して選択..."
            style={{
              width: "100%", padding: "12px 14px", borderRadius: 8,
              border: "2px solid " + (open ? C.gold : C.border), fontSize: 13,
              fontFamily: "'Noto Sans JP'", outline: "none",
              transition: "border-color 0.2s",
            }} />

          {open && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
              background: C.white, borderRadius: 8, border: "1px solid " + C.border,
              boxShadow: "0 4px 16px rgba(0,0,0,0.15)", maxHeight: 280, overflowY: "auto", zIndex: 10,
            }}>
              {filtered.map(m => (
                <button key={m.id} onClick={() => onLogin(m.name)} style={{
                  width: "100%", padding: "10px 14px", border: "none",
                  borderBottom: "1px solid " + C.borderLight, background: "transparent",
                  cursor: "pointer", textAlign: "left",
                  fontSize: 13, fontWeight: 500, color: C.navy,
                  fontFamily: "'Noto Sans JP'",
                }}>{m.name}</button>
              ))}
              {filtered.length === 0 && (
                <div style={{ padding: "16px 0", textAlign: "center", color: C.textLight, fontSize: 12 }}>該当なし</div>
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: 24, textAlign: "center", fontSize: 9, color: C.textLight, letterSpacing: 1 }}>
          © 2026 M&A Sourcing Partners Co., Ltd.
        </div>
      </div>
    </div>
  );
}
