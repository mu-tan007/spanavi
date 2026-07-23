// dorayaki.AI クライアントポータル 専用テーマ
// -----------------------------------------------------------------------------
// Spanavi 本体のデザイントークン(design.js)とは独立した dorayaki.AI 独自ブランド。
// LP(dorayaki-ai)と世界観を統一する: ダーク基調 + ブラウン(#9A6234)→ロイヤルブルー
// のグラデ、角丸抑制、絵文字禁止。営業代行/スパキャリのクライアントポータルが
// それぞれ独自ブランドを別ルートに持つのと同じ思想で、ここに閉じる。
//
// 叩き段階の値。確定後に design.js 相当へ昇格させても良い。

export const dora = {
  color: {
    // ブランドの核
    brown: '#9A6234',
    brownDeep: '#6B4423',
    blue: '#1E40AF',
    royal: '#2952c8',       // 参考画面のロイヤルブルー(実測サンプル)
    royalBright: '#3157d2',
    blueBright: '#3b6fe0',

    // ダーク面(サイドバー/ヘッダー地)
    navy: '#0D2247',
    navyDeep: '#081a3a',
    navySoft: '#12294f',
    navyLine: 'rgba(255,255,255,0.10)',

    // ライト面(コンテンツ地)
    canvas: '#f7f8fa',
    surface: '#ffffff',
    surfaceLine: '#e4e8f1',

    // テキスト
    ink: '#0f1b34',
    inkMid: '#41506e',
    inkSoft: '#7a879e',
    onDark: '#ffffff',
    onDarkSoft: 'rgba(255,255,255,0.62)',
    onDarkDim: 'rgba(255,255,255,0.40)',

    // 状態
    danger: '#dc3a4b',
    dangerSoft: '#fdecee',
  },

  // ブラウン→ブルーの署名グラデ
  gradient: {
    brand: 'linear-gradient(90deg, #9A6234 0%, #6B4423 42%, #1E40AF 100%)',
    brandBar: 'linear-gradient(90deg, #9A6234 0%, #2952c8 100%)',
    // 参考画面忠実再現: サイドバーはロイヤルブルー(上)→ネイビー(下)の縦グラデ(実測サンプル)
    sidebar: 'linear-gradient(180deg, #2952c8 0%, #1e429f 32%, #163170 62%, #0e2254 100%)',
    // ヘッダー帯: ロイヤルブルーの横グラデ(実測 #2952c8 → #3157d2)
    header: 'linear-gradient(90deg, #2952c8 0%, #3157d2 100%)',
  },

  font: {
    // 英字は Poppins 系(LP と同じ)。未ロード環境でも崩れないよう system sans へフォールバック。
    display: "'Poppins','Hiragino Kaku Gothic ProN','Noto Sans JP',system-ui,sans-serif",
    body: "'Hiragino Kaku Gothic ProN','Noto Sans JP',system-ui,sans-serif",
    // 数値は等幅タブラーで桁揃え
    num: "'SF Mono','Roboto Mono','Consolas',ui-monospace,monospace",
  },

  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 6, md: 10, lg: 14, pill: 999 },
  shadow: {
    card: '0 1px 2px rgba(15,27,52,0.04), 0 8px 24px rgba(15,27,52,0.06)',
    pop: '0 12px 40px rgba(8,26,58,0.28)',
  },
};

export default dora;
