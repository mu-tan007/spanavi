// ============================================================
// Spanavi Design Tokens
// 色・余白・角丸・タイポ・shadow・transition を一元管理
// 既存 C (constants/colors.js) は互換のため再エクスポート
// ============================================================
import { C } from './colors';

export { C };

// ── Color ─────────────────────────────────────────────────
// 既存 C をベースに、状態色・グレースケール段階を追加
export const color = {
  // Brand
  navy:      C.navy,        // #032D60 メインブランド
  navyDark:  C.navyDark,    // #021B40
  navyDeep:  C.navyDeep,    // #011226
  navyLight: C.navyLight,   // #0176D3 プライマリブルー

  // Accent
  gold:      C.gold,
  goldLight: C.goldLight,
  goldDim:   C.goldDim,
  goldGlow:  C.goldGlow,

  // Surfaces
  white:    C.white,
  offWhite: C.offWhite,     // ページ背景
  cream:    C.cream,        // カード内サブ
  snow:     C.snow,

  // Text
  textDark:  C.textDark,
  textMid:   C.textMid,
  textLight: C.textLight,

  // Borders
  border:      C.border,
  borderLight: C.borderLight,
  borderDark:  C.borderDark,

  // Grayscale (Tailwind準拠の8段階)
  gray50:  '#FAFAFA',
  gray100: '#F4F4F5',
  gray200: '#E5E7EB',
  gray300: '#D4D4D8',
  gray400: '#A1A1AA',
  gray500: '#71717A',
  gray600: '#52525B',
  gray700: '#3F3F46',
  gray800: '#27272A',
  gray900: '#18181B',

  // Status (既存と整合)
  success:     C.green,                // #2E844A
  successSoft: C.greenLight,           // rgba 10%
  warn:        C.orange,               // #FFB75D
  warnSoft:    C.orangeLight,
  danger:      C.red,                  // #EA001E
  dangerSoft:  C.redLight,
  info:        C.navyLight,            // #0176D3
  infoSoft:    'rgba(1, 118, 211, 0.10)',
};

// ── Spacing (8pxグリッド) ─────────────────────────────────
// 4px = 0.5、それ以外は 8px の倍数を基本とする
export const space = {
  0:    0,
  0.5:  2,
  1:    4,
  1.5:  6,
  2:    8,
  2.5:  10,
  3:    12,
  4:    16,
  5:    20,
  6:    24,
  8:    32,
  10:   40,
  12:   48,
  16:   64,
  20:   80,
  24:   96,
};

// ── Radius (角丸) ─────────────────────────────────────────
export const radius = {
  none: 0,
  sm:   3,
  md:   4,    // デフォルト (Spanavi基準)
  lg:   6,
  xl:   8,
  pill: 999,
};

// ── Font ──────────────────────────────────────────────────
export const font = {
  family: {
    sans: "'Noto Sans JP', sans-serif",
    mono: "'JetBrains Mono', monospace",
    display: "'Outfit', sans-serif", // ロゴ・大型見出し
  },
  size: {
    xs:   11,    // 補助・キャプション
    sm:   12,    // 細字
    base: 13,    // 本文 (Spanaviの主body)
    md:   14,    // やや強調 / フォーム
    lg:   16,    // 強調本文 / モバイル入力
    xl:   20,    // セクション見出し
    '2xl': 24,   // ページタイトル
    '3xl': 32,   // 大見出し
  },
  weight: {
    normal:   400,
    medium:   500,
    semibold: 600,
    bold:     700,
    black:    800,
  },
  // letter-spacing はラベル・見出しで強めに効かせる
  letterSpacing: {
    tight:  '-0.02em',
    normal: 0,
    wide:   '0.04em',
    wider:  '0.08em',
    widest: '0.18em',
  },
  lineHeight: {
    tight:   1.2,
    normal:  1.5,
    relaxed: 1.7,
  },
};

// ── Shadow / Elevation ────────────────────────────────────
export const shadow = {
  none: 'none',
  xs:   '0 1px 2px rgba(0,0,0,0.04)',
  sm:   '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
  md:   '0 4px 12px rgba(0,0,0,0.10)',
  lg:   '0 8px 24px rgba(0,0,0,0.12)',
  xl:   '0 16px 40px rgba(0,0,0,0.18)',
  // フォーカスリング
  ring:        '0 0 0 3px rgba(1,118,211,0.20)',
  ringDanger:  '0 0 0 3px rgba(234,0,30,0.18)',
  ringSuccess: '0 0 0 3px rgba(46,132,74,0.18)',
  // hover lift (内部)
  hoverLift: '0 6px 18px rgba(3,45,96,0.18)',
};

// ── Transition ────────────────────────────────────────────
export const transition = {
  fast:   '0.15s ease',
  base:   '0.20s ease',
  slow:   '0.30s ease',
  spring: '0.25s cubic-bezier(0.4, 0, 0.2, 1)',
};

// ── Z-index ───────────────────────────────────────────────
export const z = {
  base:    0,
  dropdown: 100,
  sticky:  200,
  modal:   1000,
  popover: 1100,
  tooltip: 1200,
  toast:   1300,
};

// ── Helper: rgba with token color ─────────────────────────
// 例: alpha(color.navyLight, 0.2) → 'rgba(1,118,211,0.2)'
export const alpha = (hex, a) => {
  if (!hex) return `rgba(0,0,0,${a})`;
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  const m = hex.replace('#', '').match(/.{2}/g);
  if (!m) return `rgba(0,0,0,${a})`;
  const [r, g, b] = m.map(x => parseInt(x, 16));
  return `rgba(${r},${g},${b},${a})`;
};

// ── 統合 default export ───────────────────────────────────
export const design = { color, space, radius, font, shadow, transition, z, alpha };
export default design;
