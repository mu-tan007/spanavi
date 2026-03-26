import { useState } from "react";
import { C } from '../../constants/colors';

const DS = {
  navy: '#0D2247',
  blue: '#1E40AF',
  gray200: '#E5E7EB',
  white: '#ffffff',
  textMuted: '#6B7280',
  textDark: '#111827',
  labelColor: '#374151',
  navyHover: '#1a3366',
};

export default function LoginScreen({ onLogin, members }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  const allOptions = [{ id: 0, name: "管理者" }, ...members];
  const filtered = allOptions.filter(m => !search || m.name.includes(search));

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#F8F9FA",
      fontFamily: "'Noto Sans JP', sans-serif",
    }}>
      <div style={{
        background: DS.white,
        border: "1px solid " + DS.gray200,
        borderRadius: 4,
        padding: "40px",
        width: "100%",
        maxWidth: 400,
        boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
        position: "relative",
      }}>
        {/* Logo */}
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
          <div style={{ fontSize: 12, fontWeight: 600, color: DS.labelColor, marginBottom: 4 }}>ログインユーザーを選択</div>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => { setOpen(true); setFocused(true); }}
            onBlur={() => setFocused(false)}
            placeholder="名前を入力して選択..."
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 4,
              border: "1px solid " + (focused ? DS.navy : DS.gray200),
              boxShadow: focused ? "0 0 0 2px rgba(13,34,71,0.1)" : "none",
              fontSize: 14, color: DS.textDark,
              fontFamily: "'Noto Sans JP'", outline: "none",
              transition: "border-color 0.2s, box-shadow 0.2s",
              boxSizing: "border-box",
            }} />

          {open && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
              background: DS.white, borderRadius: 4, border: "1px solid " + DS.gray200,
              boxShadow: "0 2px 8px rgba(0,0,0,0.10)", maxHeight: 280, overflowY: "auto", zIndex: 10,
            }}>
              {filtered.map(m => (
                <button key={m.id} onClick={() => onLogin(m.name)} style={{
                  width: "100%", padding: "10px 14px", border: "none",
                  borderBottom: "1px solid " + DS.gray200, background: "transparent",
                  cursor: "pointer", textAlign: "left",
                  fontSize: 14, fontWeight: 500, color: DS.textDark,
                  fontFamily: "'Noto Sans JP'",
                }}
                  onMouseEnter={e => e.currentTarget.style.background = "#F3F4F6"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >{m.name}</button>
              ))}
              {filtered.length === 0 && (
                <div style={{ padding: "16px 0", textAlign: "center", color: DS.textMuted, fontSize: 13 }}>該当なし</div>
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: 24, textAlign: "center", fontSize: 9, color: DS.textMuted, letterSpacing: 1 }}>
          © {new Date().getFullYear()} Spanavi
        </div>
      </div>
    </div>
  );
}
