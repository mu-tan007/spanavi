# Claude Code Instructions – spanavi

## Workflow Orchestration

### 1. Plan Node Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately – don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes – don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests – then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

- **Plan First**: Write plan to `tasks/todo.md` with checkable items
- **Verify Plan**: Check in before starting implementation
- **Track Progress**: Mark items complete as you go
- **Explain Changes**: High-level summary at each step
- **Document Results**: Add review section to `tasks/todo.md`
- **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

---

## UI 開発ルール（必読・新規UI実装時に毎回適用）

Spanavi は 2026年5月にデザインシステム化が完了している。新しいページや機能を実装する際は、**必ず以下のルールに従うこと**。インライン style で適当に書くと、これまで磨き上げた統一感が崩れる。

### 1. デザイントークンを使う（hardcode 禁止）

- 色: `src/constants/design.js` の `color.*` トークンを使用
  - `color.navy` / `color.navyDark` / `color.navyDeep` / `color.navyLight`
  - `color.white` / `color.offWhite` / `color.cream` / `color.snow`
  - `color.textDark` / `color.textMid` / `color.textLight`
  - `color.border` / `color.borderLight`
  - `color.gray50`〜`color.gray900` の8段階
  - `color.success` / `color.warn` / `color.danger` / `color.info` ＋ Soft variant
  - `color.gold` / `color.goldLight` / `color.goldDim`
- 余白: `space.*`（8pxグリッド: 0/0.5/1/1.5/2/2.5/3/4/5/6/8/10/12/16/20/24）
- 角丸: `radius.*`（none / sm(3) / md(4) / lg(6) / xl(8) / pill）
- 影: `shadow.*`（xs / sm / md / lg / xl / ring / hoverLift）
- 透明度: `alpha(color, 0.5)` ヘルパーで rgba 生成（hardcode rgba 禁止）
- フォント: `font.family.*` / `font.size.*` / `font.weight.*` / `font.letterSpacing.*` / `font.lineHeight.*`
- トランジション: `transition.fast` / `transition.base` / `transition.slow`

**禁止例**:
```jsx
<div style={{ color: '#0D2247', padding: 16, borderRadius: 4 }}>
```

**正しい例**:
```jsx
import { color, space, radius } from '../../constants/design';
<div style={{ color: color.navy, padding: space[4], borderRadius: radius.md }}>
```

### 2. 共通UIコンポーネントを使う

`src/components/ui/` の既存部品を最優先で使う。インラインで `<button style={...}>` などは書かない。

```jsx
import { Button, Input, Select, Card, Badge, Tag, DataTable } from '../ui';

<Button variant="primary" size="md" loading={saving}>保存</Button>
<Input label="氏名" required placeholder="例" />
<Select options={[{value, label}]} />
<Card padding="md" title="..." description="...">...</Card>
<Badge variant="success" dot>稼働中</Badge>
<Tag closable onClose={...}>東京</Tag>

// 一覧表示は DataTable を使う（独自テーブルは原則禁止）
<DataTable
  columns={[
    { key: 'company', label: '企業名', width: 280, align: 'left' },
    { key: 'phone', label: '電話番号', width: 130, align: 'left',
      cellStyle: { fontFamily: font.family.mono } },
    { key: 'status', label: 'ステータス', width: 120, align: 'center',
      render: (row) => <Badge variant="success" dot>{row.status}</Badge> },
  ]}
  rows={data}
  rowKey="id"
  loading={isLoading}
  emptyMessage="該当する企業がありません"
  onRowClick={(row) => ...}
  rowAccent={(row) => row.urgent ? 'danger' : null}  // 行の左border色
  height="calc(100vh - 200px)"  // or 数値
/>
```

**Button variant**: `primary` / `secondary` / `ghost` / `danger` / `outline`
**Button size**: `sm` / `md` / `lg`
**Badge variant**: `default` / `primary` / `success` / `warn` / `danger` / `info` / `neutral`
**DataTable rowAccent**: `'danger'` / `'warn'` / `'success'` / `'primary'` / `'info'` / カスタム色

**新規一覧画面は必ず `<DataTable>` を使う**。独自実装の `<table>` や `<div display:grid>` で表を組まない。スクロール・ヘッダー sticky・空状態・ローディング・件数表示が全画面で統一される。

### 表のセル揃え (align) ルール

業界標準 (Salesforce / HubSpot / Excel) に合わせる:

| データ種類 | align | 例 |
|---|---|---|
| 金額・率・件数・数値 | **`right`** | ¥1,234,567 / 50% / 17名 |
| 日付・時刻 | **`right`** | 5/9 14:30 / 2026-05-09 |
| 電話番号 | `left` (ハイフンで桁揃わないため例外) | 03-1234-5678 |
| 名前・企業名・メモ・住所 | `left` | 株式会社ABC |
| ステータスバッジ | **`center`** | アポ取得 |
| アクションボタン・操作 | **`center`** | [報告] [削除] |
| 短いコード・ID | `center` | A001 |

**新規列を追加する時は、必ずこの表に従って align を選ぶ**。「とりあえず left」ではなく、データ種類で判断する。

### 表が画面幅まで広がらない場合

DataTable の `fillWidth` プロップを使う:
```jsx
<DataTable fillWidth columns={...} rows={...} />
```
これで列の固定 px 幅が画面幅に応じて比例展開される。給与画面 (Payroll) など列が少なくて画面が広い場合に有効。

### 3. モーダル・ドロワーの構造

- 背景は `rgba(0,0,0,0.45)` 相当 → `alpha(color.navyDeep, 0.5)` を推奨
- カード本体: `borderRadius: radius.lg`、`boxShadow: shadow.xl`、`background: color.white`
- ヘッダー部に Navy bar を置く場合は `background: color.navy`、文字は `color.white`
- ボタン群は `<Button>` で統一（キャンセル=outline、保存=primary、削除=danger）

### 4. テーブルのスタイル

- ヘッダー背景: `color.navy`、文字: `color.white`、フォントサイズ: `font.size.xs`〜`font.size.sm`
- 行のホバー: `alpha(color.navyLight, 0.06)` 程度の薄い navy
- ストライプ（zebra）: 偶数行 `color.white`、奇数行 `color.cream`
- 選択行: `borderLeft: '3px solid ' + color.navy`、背景 `alpha(color.navyLight, 0.08)`
- ステータス表示は `<Badge variant dot>` を使う（独自ピル禁止）

### 5. プレビュー画面で確認

新しいパターンを思いつき開発した場合は、`/design-preview` で見え方を確認できる（認証なしアクセス可）。

```
https://<本番URL>/design-preview
```

### 6. 例外（残してOK）

以下は `color.*` トークンに置換しなくてOK（既存もそうなっている）：
- **PDF出力系**（`InvoicePDF.jsx`, `ClientReportPDF.jsx`）の印刷用色 — 白背景・黒文字を維持
- **Recharts等チャートライブラリ**の設定色 — カテゴリカルカラー
- **branding.* 動的色**（SidebarShell, MobileSidebarOverlay）— Engagement毎に切り替わる
- **特定ブランド色**（Zoom緑 `#1a7f5a` など）

### 7. 必ず守ること

- 新画面を作る前に既存の似た画面（PreCheckView / AppoListView など）を**参考実装**として確認する
- インライン style に hardcoded な hex 値を直書きしない（必ず `color.*` 経由）
- ボタンを `<button style={...}>` で自作しない（必ず `<Button>` を使う）
- 入力欄を `<input style={...}>` で自作しない（必ず `<Input>` を使う）
- `<textarea>` は Input 未対応なのでネイティブ可、ただし border/color/font は token 化

### 8. 違反を見つけた場合

既存コードに hardcode 色やインラインボタンを見つけたら、可能なら**ついでに直す**。修正範囲が大きすぎる場合は別タスクとして提案する。
