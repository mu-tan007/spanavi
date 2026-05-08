import React from 'react'
import { useIsMobile } from '../../hooks/useIsMobile'

// 社内ログイン / クライアントポータルログイン共通の "暗HUDシェル"。
// - 背景: Navy→Blueグラデ + ファランクス陣形 + シールドHUD
// - カード: 半透明Navy + backdrop-blur + 4隅HUDコーナー
// - ロゴ: 大型シールド + "Spanavi" タイトル
// 入力欄・ボタンは呼び出し側で `inputStyle` / `makeBtnStyle` / `labelStyle` を使う。
export const SHELL_C = {
  navy: '#0D2247',
  navyDeep: '#081636',
  blue: '#1E40AF',
  cardBg: 'rgba(8,22,54,0.55)',
  cardBorder: 'rgba(255,255,255,0.18)',
  textOnDark: '#FFFFFF',
  textMutedOnDark: 'rgba(255,255,255,0.65)',
  labelOnDark: 'rgba(255,255,255,0.78)',
  inputBg: 'rgba(255,255,255,0.04)',
  inputBorder: 'rgba(255,255,255,0.20)',
  linkOnDark: 'rgba(255,255,255,0.75)',
  errorRed: '#FF6B6B',
  white: '#ffffff',
  navyHover: '#1a3366',
}

export const inputStyle = {
  width: '100%', padding: '10px 14px', borderRadius: 4,
  fontSize: 14, color: SHELL_C.textOnDark,
  fontFamily: "'Noto Sans JP'", outline: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s', marginBottom: 0,
  boxSizing: 'border-box',
}

export const labelStyle = {
  fontSize: 12, fontWeight: 600, color: SHELL_C.labelOnDark, letterSpacing: '0.04em', marginBottom: 4,
}

export function makeBtnStyle(loading) {
  return {
    width: '100%', padding: '11px 16px', borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.30)',
    cursor: loading ? 'not-allowed' : 'pointer',
    background: SHELL_C.navy,
    color: SHELL_C.white, fontSize: 14, fontWeight: 600, fontFamily: "'Noto Sans JP'",
    opacity: loading ? 0.6 : 1,
  }
}

function BackgroundLayer({ isMobile }) {
  const verticalBarCount = isMobile ? 6 : 10
  const horizontalBarCount = isMobile ? 2 : 3
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none',
        background: `linear-gradient(135deg, #1456C7 0%, #1E3A8A 30%, ${SHELL_C.navy} 60%, ${SHELL_C.navyDeep} 100%)`,
      }}
    >
      <style>{`
        @keyframes spLoginBarFlash {
          0%, 6%   { opacity: 0; transform: scaleY(0.3); }
          10%      { opacity: 0.95; transform: scaleY(1); }
          22%      { opacity: 0.95; transform: scaleY(1); }
          32%      { opacity: 0; transform: scaleY(0.3); }
          100%     { opacity: 0; transform: scaleY(0.3); }
        }
        @keyframes spLoginHBarFlash {
          0%, 8%   { opacity: 0; transform: scaleX(0.3); }
          12%      { opacity: 0.7; transform: scaleX(1); }
          24%      { opacity: 0.7; transform: scaleX(1); }
          34%      { opacity: 0; transform: scaleX(0.3); }
          100%     { opacity: 0; transform: scaleX(0.3); }
        }
        @keyframes spLoginScanLine {
          0%   { transform: translateY(-2vh); opacity: 0; }
          5%   { opacity: 0.65; }
          95%  { opacity: 0.65; }
          100% { transform: translateY(102vh); opacity: 0; }
        }
        @keyframes spLoginRingBreathe {
          0%, 100% { opacity: 0.16; }
          50%      { opacity: 0.26; }
        }
        @keyframes spLoginCardEnter {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spLoginLogoBreathe {
          0%,100% { filter: drop-shadow(0 0 6px rgba(255,255,255,0.18)); }
          50%     { filter: drop-shadow(0 0 18px rgba(255,255,255,0.45)); }
        }
        @keyframes spLoginGridDrift {
          from { background-position: 0 0; }
          to   { background-position: 32px 32px; }
        }
        .sp-login-card {
          animation: spLoginCardEnter 0.55s ease-out;
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }
        .sp-login-card:hover { box-shadow: 0 16px 48px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.28) !important; }
        .sp-login-logo { animation: spLoginLogoBreathe 3.4s ease-in-out infinite; }
        .sp-login-corner {
          position: absolute; width: 14px; height: 14px; pointer-events: none;
          border-color: rgba(255,255,255,0.55); border-style: solid; border-width: 0;
        }
        .sp-login-corner.tl { top: -1px; left: -1px;  border-top-width: 1.5px;    border-left-width: 1.5px;  }
        .sp-login-corner.tr { top: -1px; right: -1px; border-top-width: 1.5px;    border-right-width: 1.5px; }
        .sp-login-corner.bl { bottom: -1px; left: -1px;  border-bottom-width: 1.5px; border-left-width: 1.5px;  }
        .sp-login-corner.br { bottom: -1px; right: -1px; border-bottom-width: 1.5px; border-right-width: 1.5px; }
        .sp-login-input {
          background: ${SHELL_C.inputBg} !important;
          border: 1px solid ${SHELL_C.inputBorder} !important;
          color: ${SHELL_C.textOnDark} !important;
          -webkit-text-fill-color: ${SHELL_C.textOnDark} !important;
          caret-color: ${SHELL_C.textOnDark};
        }
        .sp-login-input::placeholder {
          color: rgba(255,255,255,0.32) !important;
          -webkit-text-fill-color: rgba(255,255,255,0.32) !important;
        }
        .sp-login-input:focus {
          border-color: rgba(255,255,255,0.55) !important;
          box-shadow: 0 0 0 3px rgba(255,255,255,0.10) !important;
          background: rgba(255,255,255,0.06) !important;
        }
        .sp-login-input:-webkit-autofill,
        .sp-login-input:-webkit-autofill:hover,
        .sp-login-input:-webkit-autofill:focus,
        .sp-login-input:-internal-autofill-selected {
          -webkit-text-fill-color: ${SHELL_C.textOnDark} !important;
          -webkit-box-shadow: 0 0 0 1000px rgba(8,22,54,0.85) inset !important;
          caret-color: ${SHELL_C.textOnDark};
        }
        .sp-login-btn {
          transition: background 0.25s ease, box-shadow 0.25s ease, transform 0.18s ease !important;
          letter-spacing: 1.5px !important;
        }
        .sp-login-btn:hover:not(:disabled) {
          box-shadow: 0 8px 22px rgba(13,34,71,0.40), 0 0 0 1px rgba(255,255,255,0.32);
          transform: translateY(-1px);
        }
        .sp-login-btn:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 2px 6px rgba(13,34,71,0.30);
        }
        .sp-login-bar {
          position: absolute; top: 18vh; height: 64vh;
          width: 1.5px;
          background: linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.85) 50%, transparent 100%);
          transform-origin: center;
          will-change: opacity, transform;
        }
        .sp-login-hbar {
          position: absolute; left: 14%; right: 14%; height: 1.5px;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.75) 50%, transparent 100%);
          transform-origin: center;
          will-change: opacity, transform;
        }
        .sp-login-scan {
          position: absolute; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.65) 50%, transparent 100%);
          box-shadow: 0 0 10px rgba(255,255,255,0.30);
          will-change: transform, opacity;
        }
        @media (max-width: 768px) {
          .sp-login-card {
            padding: 26px 20px !important;
            border-radius: 4px !important;
          }
          .sp-login-grid { background-size: 22px 22px !important; }
          .sp-login-input {
            font-size: 16px !important;
            padding: 12px 14px !important;
          }
          .sp-login-btn {
            font-size: 15px !important;
            padding: 13px 16px !important;
          }
          .sp-login-corner { width: 12px !important; height: 12px !important; }
          .sp-login-hbar { left: 8% !important; right: 8% !important; }
        }
        @media (max-width: 380px) {
          .sp-login-card { padding: 22px 16px !important; }
        }
      `}</style>
      <div
        className="sp-login-grid"
        style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          animation: 'spLoginGridDrift 24s linear infinite',
          maskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 75%)',
        }}
      />
      {Array.from({ length: verticalBarCount }).map((_, i) => {
        const span = 100 - 12
        const left = `${6 + (span / (verticalBarCount - 1)) * i}%`
        return (
          <div
            key={`bar-${i}`}
            className="sp-login-bar"
            style={{
              left,
              animation: `spLoginBarFlash 6s linear ${i * 0.3}s infinite`,
            }}
          />
        )
      })}
      {Array.from({ length: horizontalBarCount }).map((_, i) => (
        <div
          key={`hbar-top-${i}`}
          className="sp-login-hbar"
          style={{
            top: `${6 + i * 4}%`,
            animation: `spLoginHBarFlash 6s linear ${i * 0.4 + 1.5}s infinite`,
          }}
        />
      ))}
      {Array.from({ length: horizontalBarCount }).map((_, i) => (
        <div
          key={`hbar-bot-${i}`}
          className="sp-login-hbar"
          style={{
            bottom: `${6 + i * 4}%`,
            animation: `spLoginHBarFlash 6s linear ${i * 0.4 + 1.5}s infinite`,
          }}
        />
      ))}
      <div className="sp-login-scan" style={{ animation: 'spLoginScanLine 10s linear infinite' }} />
      <div className="sp-login-scan" style={{ animation: 'spLoginScanLine 10s linear 5s infinite', opacity: 0.5 }} />
      <svg
        viewBox="0 0 52 60"
        preserveAspectRatio="xMidYMid meet"
        style={{
          position: 'absolute', top: '50%', left: '50%',
          width: 'min(900px, 95vh)', height: 'min(900px, 95vh)',
          transform: 'translate(-50%,-50%)',
          opacity: 0.35,
        }}
      >
        <defs>
          <linearGradient id="spLoginShieldBg" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0%" stopColor="#1456C7" stopOpacity="0.45"/>
            <stop offset="100%" stopColor="#03132E" stopOpacity="0.05"/>
          </linearGradient>
          <clipPath id="spLoginShieldClip"><path d="M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z"/></clipPath>
        </defs>
        <path d="M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z" fill="url(#spLoginShieldBg)"/>
        <g clipPath="url(#spLoginShieldClip)">
          <g stroke="#FFFFFF" fill="none" strokeWidth="0.10" opacity="0.22">
            <line x1="26" y1="30" x2="26" y2="-10"/><line x1="26" y1="30" x2="60" y2="30"/>
            <line x1="26" y1="30" x2="26" y2="70"/><line x1="26" y1="30" x2="-8" y2="30"/>
            <line x1="26" y1="30" x2="50" y2="2"/><line x1="26" y1="30" x2="50" y2="58"/>
            <line x1="26" y1="30" x2="2" y2="58"/><line x1="26" y1="30" x2="2" y2="2"/>
            <line x1="26" y1="30" x2="40" y2="-6"/><line x1="26" y1="30" x2="58" y2="14"/>
            <line x1="26" y1="30" x2="58" y2="46"/><line x1="26" y1="30" x2="40" y2="66"/>
            <line x1="26" y1="30" x2="12" y2="66"/><line x1="26" y1="30" x2="-6" y2="46"/>
            <line x1="26" y1="30" x2="-6" y2="14"/><line x1="26" y1="30" x2="12" y2="-6"/>
          </g>
          <g style={{ animation: 'spLoginRingBreathe 6s ease-in-out infinite' }}>
            {[8, 14, 20, 26].map((r, i) => (
              <circle
                key={`ring-${i}`}
                cx="26" cy="30" r={r}
                fill="none" stroke="#FFFFFF" strokeWidth="0.16"
                opacity="0.85"
              />
            ))}
          </g>
          <g stroke="#FFFFFF" fill="none" strokeWidth="0.10" opacity="0.30">
            <line x1="26" y1="-2" x2="26" y2="62"/>
            <line x1="-6" y1="30" x2="58" y2="30"/>
          </g>
        </g>
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(180deg, rgba(8,22,54,0.55) 0%, rgba(8,22,54,0) 25%, rgba(8,22,54,0) 75%, rgba(8,22,54,0.55) 100%)`,
      }}/>
    </div>
  )
}

function ShieldLogo() {
  return (
    <svg className="sp-login-logo" width="72" height="82" viewBox="0 0 52 60" style={{ marginBottom: 16 }}>
      <defs>
        <linearGradient id="spShieldBg" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#0176D3"/>
          <stop offset="100%" stopColor="#032D60"/>
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
  )
}

// 暗HUDシェル本体: ロゴ + subtitle + 子要素 + copyright
export function LoginShell({ subtitle, children, eyebrow }) {
  const isMobile = useIsMobile()
  return (
    <div style={{
      minHeight: '100vh', position: 'relative', overflow: 'hidden',
      background: SHELL_C.navyDeep,
      fontFamily: "'Noto Sans JP', sans-serif",
    }}>
      <BackgroundLayer isMobile={isMobile} />
      <div style={{
        position: 'relative', zIndex: 1, minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}>
        <div className="sp-login-card" style={{
          background: SHELL_C.cardBg,
          border: '1px solid ' + SHELL_C.cardBorder,
          borderRadius: 4,
          padding: '40px',
          width: '100%',
          maxWidth: 400,
          boxShadow: '0 12px 36px rgba(0,0,0,0.40), 0 0 0 1px rgba(255,255,255,0.06)',
          position: 'relative',
          transition: 'transform 0.25s ease, box-shadow 0.25s ease',
        }}>
          <span className="sp-login-corner tl"/>
          <span className="sp-login-corner tr"/>
          <span className="sp-login-corner bl"/>
          <span className="sp-login-corner br"/>
          <div style={{ textAlign: 'center', marginBottom: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <ShieldLogo />
            <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: 2, color: '#0176D3' }}>
              Spa<span style={{ color: '#C8A84B' }}>navi</span>
            </div>
            {eyebrow && (
              <div style={{
                fontSize: 10, color: SHELL_C.textMutedOnDark,
                letterSpacing: '0.18em', textTransform: 'uppercase',
                marginTop: 6,
              }}>
                {eyebrow}
              </div>
            )}
          </div>
          {subtitle && (
            <div style={{ fontSize: 13, color: SHELL_C.textMutedOnDark, marginBottom: 20, textAlign: 'center' }}>
              {subtitle}
            </div>
          )}
          {children}
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: SHELL_C.textMutedOnDark, letterSpacing: 1 }}>
              © {new Date().getFullYear()} Spanavi
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
