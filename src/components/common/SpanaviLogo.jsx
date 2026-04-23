import React from 'react';
import { C } from '../../constants/colors';

// Spanavi ブランドロゴ。シールド + 2層の装飾ライン + 分割カラーの "Spanavi" テキスト。
// size: アイコンの幅 (px)。高さは size * (60/52) で自動。
// textSize: 文字サイズ。省略時は size と同程度。
// variant: 'light' (暗背景用・白系) | 'onLight' (明背景用・テキストが navy/gold) どちらも
//          シールド本体は accent → primary のグラデーションなので共通。
export default function SpanaviLogo({
  size = 28,
  textSize,
  gap = 10,
  hideText = false,
  style,
  uidSuffix = 'default',
}) {
  const h = Math.round(size * (60 / 52));
  const ts = textSize ?? Math.round(size * 0.72);
  const shieldId = `spShieldLogo-${uidSuffix}`;
  const clipId = `spShieldClipLogo-${uidSuffix}`;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap, ...style }}>
      <svg width={size} height={h} viewBox="0 0 52 60" aria-hidden="true">
        <defs>
          <linearGradient id={shieldId} x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0%" stopColor={C.navyLight}/>
            <stop offset="100%" stopColor={C.navy}/>
          </linearGradient>
          <clipPath id={clipId}>
            <path d="M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z" />
          </clipPath>
        </defs>
        <path d="M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z" fill={`url(#${shieldId})`} />
        <g clipPath={`url(#${clipId})`} stroke="white" fill="none">
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
      {!hideText && (
        <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: ts, fontWeight: 800, letterSpacing: 2, lineHeight: 1 }}>
          <span style={{ color: C.navyLight }}>Spa</span>
          <span style={{ color: C.gold }}>navi</span>
        </div>
      )}
    </div>
  );
}
