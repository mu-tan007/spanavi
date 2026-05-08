import React, { useState } from 'react';
import { color, space, radius, font, shadow } from '../../constants/design';
import { Button, Input, Select, Card, Badge, Tag } from '../ui';

// /design-preview に表示されるデザイン確認用ページ。
// Spanavi 共通UI部品 + デザイントークンを一覧表示し、本番適用前に見た目を確認できる。
export default function DesignPreview() {
  return (
    <div style={{
      minHeight: '100vh',
      background: color.offWhite,
      fontFamily: font.family.sans,
      color: color.textDark,
      paddingBottom: 80,
    }}>
      <PageHeader />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px' }}>
        <Section title="01. Buttons" description="共通ボタンの全バリアント・サイズ・状態">
          <ButtonsSection />
        </Section>

        <Section title="02. Inputs" description="入力欄のサイズ・状態・アイコン付き">
          <InputsSection />
        </Section>

        <Section title="03. Selects" description="セレクトボックス">
          <SelectsSection />
        </Section>

        <Section title="04. Cards" description="情報カードのバリアント">
          <CardsSection />
        </Section>

        <Section title="05. Badges" description="ステータス・属性表示用バッジ">
          <BadgesSection />
        </Section>

        <Section title="06. Tags" description="閉じれるタグ">
          <TagsSection />
        </Section>

        <Section title="07. Color Palette" description="デザイントークンの色">
          <ColorsSection />
        </Section>

        <Section title="08. Typography" description="フォントサイズ・ウェイト">
          <TypographySection />
        </Section>

        <Section title="09. Before / After" description="旧スタイル vs 新スタイルの比較（架電画面のフィルタバーを想定）">
          <BeforeAfterSection />
        </Section>
      </div>
    </div>
  );
}

// ── Layout helpers ─────────────────────────────────────────
function PageHeader() {
  return (
    <div style={{
      background: color.white,
      borderBottom: `1px solid ${color.border}`,
      padding: '20px 32px',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{
          fontSize: font.size.xs,
          color: color.textLight,
          letterSpacing: font.letterSpacing.widest,
          textTransform: 'uppercase',
          marginBottom: 6,
        }}>
          Spanavi · Internal
        </div>
        <h1 style={{
          fontSize: font.size['2xl'],
          fontWeight: font.weight.bold,
          color: color.navy,
          letterSpacing: font.letterSpacing.tight,
          margin: 0,
        }}>
          Design Preview
        </h1>
        <p style={{
          fontSize: font.size.sm,
          color: color.textMid,
          margin: '6px 0 0',
          lineHeight: font.lineHeight.relaxed,
        }}>
          このページは本番画面適用前のデザイン確認用です。共通UI部品とデザイントークンを一覧で確認できます。
        </p>
      </div>
    </div>
  );
}

function Section({ title, description, children }) {
  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{
          fontSize: font.size.lg,
          fontWeight: font.weight.bold,
          color: color.navy,
          margin: 0,
          letterSpacing: font.letterSpacing.tight,
        }}>
          {title}
        </h2>
        {description && (
          <p style={{ fontSize: font.size.sm, color: color.textMid, margin: '4px 0 0' }}>
            {description}
          </p>
        )}
      </div>
      <Card padding="lg">
        {children}
      </Card>
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0', flexWrap: 'wrap' }}>
      {label && (
        <div style={{
          fontSize: font.size.xs,
          color: color.textMid,
          width: 120,
          letterSpacing: font.letterSpacing.wide,
          textTransform: 'uppercase',
        }}>
          {label}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1 }}>
        {children}
      </div>
    </div>
  );
}

// ── Sections ───────────────────────────────────────────────
function ButtonsSection() {
  const [loading, setLoading] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Row label="Primary">
        <Button size="sm">Small</Button>
        <Button>Medium</Button>
        <Button size="lg">Large</Button>
      </Row>
      <Row label="Secondary">
        <Button variant="secondary" size="sm">Small</Button>
        <Button variant="secondary">Medium</Button>
        <Button variant="secondary" size="lg">Large</Button>
      </Row>
      <Row label="Outline">
        <Button variant="outline" size="sm">Small</Button>
        <Button variant="outline">Medium</Button>
        <Button variant="outline" size="lg">Large</Button>
      </Row>
      <Row label="Ghost">
        <Button variant="ghost" size="sm">Small</Button>
        <Button variant="ghost">Medium</Button>
        <Button variant="ghost" size="lg">Large</Button>
      </Row>
      <Row label="Danger">
        <Button variant="danger" size="sm">削除</Button>
        <Button variant="danger">削除</Button>
        <Button variant="danger" size="lg">削除</Button>
      </Row>
      <Row label="Disabled">
        <Button disabled>保存</Button>
        <Button variant="secondary" disabled>キャンセル</Button>
        <Button variant="danger" disabled>削除</Button>
      </Row>
      <Row label="Loading">
        <Button loading={loading} onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1500); }}>
          {loading ? '送信中...' : 'クリック'}
        </Button>
        <Button variant="outline" loading>処理中</Button>
      </Row>
      <Row label="With icons">
        <Button iconLeft={<IconPlus/>}>新規追加</Button>
        <Button variant="outline" iconRight={<IconArrow/>}>詳細</Button>
      </Row>
      <Row label="Full width">
        <div style={{ width: '100%', maxWidth: 320 }}>
          <Button fullWidth>ログイン</Button>
        </div>
      </Row>
    </div>
  );
}

function InputsSection() {
  const [v, setV] = useState('');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
      <Input label="サイズ Small" size="sm" placeholder="入力してください" />
      <Input label="サイズ Medium" placeholder="入力してください" />
      <Input label="サイズ Large" size="lg" placeholder="入力してください" />
      <Input label="ヒント付き" hint="半角英数字 4-20文字" placeholder="user_id" />
      <Input label="必須項目" required placeholder="必須" />
      <Input label="エラー状態" error="入力が正しくありません" defaultValue="invalid" />
      <Input label="アイコン付き" iconLeft={<IconSearch/>} placeholder="検索..." />
      <Input label="制御" value={v} onChange={e => setV(e.target.value)} placeholder="onChange" />
    </div>
  );
}

function SelectsSection() {
  const [v, setV] = useState('A');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
      <Select
        label="ステータス"
        size="sm"
        value={v}
        onChange={e => setV(e.target.value)}
        options={[
          { value: 'A', label: 'アポ取得' },
          { value: 'B', label: '事前確認済' },
          { value: 'C', label: 'リスケ中' },
        ]}
      />
      <Select label="サイズ Medium" defaultValue="2"
        options={[
          { value: '1', label: 'オプション1' },
          { value: '2', label: 'オプション2' },
          { value: '3', label: 'オプション3' },
        ]}
      />
      <Select label="エラー状態" error="選択してください"
        options={[
          { value: '', label: '-- 選択 --' },
          { value: '1', label: 'A' },
        ]}
      />
    </div>
  );
}

function CardsSection() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
      <Card variant="default" title="Default" description="標準カード（border + subtle shadow）">
        <p style={{ margin: 0, fontSize: font.size.sm, color: color.textMid }}>
          ここに本文が入ります。
        </p>
      </Card>
      <Card variant="subtle" title="Subtle" description="背景に馴染むサブカード">
        <p style={{ margin: 0, fontSize: font.size.sm, color: color.textMid }}>
          グルーピング用途。
        </p>
      </Card>
      <Card variant="elevated" title="Elevated" description="浮き上がるカード">
        <p style={{ margin: 0, fontSize: font.size.sm, color: color.textMid }}>
          重要な情報用。
        </p>
      </Card>
      <Card variant="flat" title="Flat" description="影なしフラット">
        <p style={{ margin: 0, fontSize: font.size.sm, color: color.textMid }}>
          密度高めの一覧用。
        </p>
      </Card>
      <Card
        title="Interactive"
        description="hover で持ち上がる"
        interactive
        action={<Badge variant="success" dot>稼働中</Badge>}
      >
        <p style={{ margin: 0, fontSize: font.size.sm, color: color.textMid }}>
          クリック可能なカード。リスト項目に。
        </p>
      </Card>
      <Card padding="sm">
        <div style={{ fontSize: font.size.sm, color: color.textMid }}>
          padding=sm のカード。ヘッダー無し。
        </div>
      </Card>
    </div>
  );
}

function BadgesSection() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Row label="Subtle (default)">
        <Badge>Default</Badge>
        <Badge variant="primary">Primary</Badge>
        <Badge variant="success">Success</Badge>
        <Badge variant="warn">Warning</Badge>
        <Badge variant="danger">Danger</Badge>
        <Badge variant="info">Info</Badge>
        <Badge variant="neutral">Neutral</Badge>
      </Row>
      <Row label="Solid">
        <Badge variant="primary" solid>Primary</Badge>
        <Badge variant="success" solid>Success</Badge>
        <Badge variant="warn" solid>Warning</Badge>
        <Badge variant="danger" solid>Danger</Badge>
        <Badge variant="info" solid>Info</Badge>
      </Row>
      <Row label="With dot">
        <Badge variant="primary" dot>稼働中</Badge>
        <Badge variant="success" dot>完了</Badge>
        <Badge variant="warn" dot>遅延</Badge>
        <Badge variant="danger" dot>停止</Badge>
        <Badge variant="neutral" dot>未着手</Badge>
      </Row>
      <Row label="Size sm">
        <Badge size="sm" variant="primary">SM</Badge>
        <Badge size="sm" variant="success" dot>SM</Badge>
        <Badge size="sm" variant="danger" solid>SM</Badge>
      </Row>
    </div>
  );
}

function TagsSection() {
  const [tags, setTags] = useState(['ソーシング', '上場企業', '2026Q2', '東京']);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Row label="Static">
        <Tag>ソーシング</Tag>
        <Tag variant="primary">優先案件</Tag>
        <Tag variant="success">承認済</Tag>
      </Row>
      <Row label="Closable">
        {tags.map((t, i) => (
          <Tag key={t} closable onClose={() => setTags(tags.filter((_, j) => j !== i))}>{t}</Tag>
        ))}
        {tags.length === 0 && (
          <span style={{ fontSize: font.size.sm, color: color.textLight }}>すべて閉じました</span>
        )}
      </Row>
    </div>
  );
}

function ColorsSection() {
  const groups = [
    { name: 'Brand', items: [
      ['navy', color.navy],
      ['navyDark', color.navyDark],
      ['navyLight', color.navyLight],
    ]},
    { name: 'Accent', items: [
      ['gold', color.gold],
      ['goldLight', color.goldLight],
      ['goldDim', color.goldDim],
    ]},
    { name: 'Surface', items: [
      ['white', color.white],
      ['offWhite', color.offWhite],
      ['cream', color.cream],
    ]},
    { name: 'Status', items: [
      ['success', color.success],
      ['warn', color.warn],
      ['danger', color.danger],
      ['info', color.info],
    ]},
    { name: 'Gray', items: [
      ['gray100', color.gray100], ['gray300', color.gray300], ['gray500', color.gray500],
      ['gray700', color.gray700], ['gray900', color.gray900],
    ]},
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {groups.map(g => (
        <div key={g.name}>
          <div style={{ fontSize: font.size.xs, color: color.textMid, letterSpacing: font.letterSpacing.wide, marginBottom: 8, textTransform: 'uppercase' }}>{g.name}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {g.items.map(([name, hex]) => (
              <div key={name} style={{
                width: 130, border: `1px solid ${color.border}`, borderRadius: radius.md,
                overflow: 'hidden', background: color.white,
              }}>
                <div style={{ background: hex, height: 56 }}/>
                <div style={{ padding: '6px 10px' }}>
                  <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.textDark }}>{name}</div>
                  <div style={{ fontSize: 10, color: color.textLight, fontFamily: font.family.mono }}>{hex}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TypographySection() {
  const samples = [
    ['3xl / Bold', font.size['3xl'], font.weight.bold, 'ページ見出し'],
    ['2xl / Bold', font.size['2xl'], font.weight.bold, 'ページタイトル'],
    ['xl / Semibold', font.size.xl, font.weight.semibold, 'セクション見出し'],
    ['lg / Semibold', font.size.lg, font.weight.semibold, '強調見出し'],
    ['md / Medium', font.size.md, font.weight.medium, '本文（フォーム）'],
    ['base / Normal', font.size.base, font.weight.normal, '本文 (Spanavi基準)'],
    ['sm / Normal', font.size.sm, font.weight.normal, '補助テキスト'],
    ['xs / Normal', font.size.xs, font.weight.normal, 'キャプション・ラベル'],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {samples.map(([label, sz, w, sample]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 16, paddingBottom: 8, borderBottom: `1px solid ${color.borderLight}` }}>
          <div style={{ width: 160, fontSize: font.size.xs, color: color.textLight, fontFamily: font.family.mono }}>{label}</div>
          <div style={{ fontSize: sz, fontWeight: w, color: color.textDark }}>{sample}</div>
        </div>
      ))}
    </div>
  );
}

function BeforeAfterSection() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      <div>
        <div style={{ fontSize: font.size.xs, color: color.textMid, letterSpacing: font.letterSpacing.wide, marginBottom: 10, textTransform: 'uppercase' }}>Before</div>
        <div style={{
          border: `1px solid ${color.border}`,
          borderRadius: 4,
          background: color.white,
          padding: 12,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {/* 旧式インライン: ボタン色や角丸が画面ごとに微妙にバラつく例 */}
          <button style={{ padding: '7px 13px', fontSize: 12, background: '#0D2247', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }}>新規</button>
          <button style={{ padding: '8px 14px', fontSize: 11, background: '#fff', color: '#0D2247', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}>絞り込み</button>
          <input placeholder="検索..." style={{ padding: '7px 10px', fontSize: 12, border: '1px solid #ddd', borderRadius: 3, flex: 1, outline: 'none' }} />
          <span style={{ fontSize: 11, padding: '2px 6px', background: '#FFF3CD', color: '#856404', border: '1px solid #FFE69C', borderRadius: 3 }}>進行中</span>
        </div>
      </div>
      <div>
        <div style={{ fontSize: font.size.xs, color: color.navyLight, letterSpacing: font.letterSpacing.wide, marginBottom: 10, textTransform: 'uppercase', fontWeight: font.weight.semibold }}>After</div>
        <div style={{
          border: `1px solid ${color.border}`,
          borderRadius: radius.lg,
          background: color.white,
          padding: 12,
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: shadow.sm,
        }}>
          <Button size="sm" iconLeft={<IconPlus/>}>新規</Button>
          <Button size="sm" variant="outline">絞り込み</Button>
          <Input size="sm" placeholder="検索..." iconLeft={<IconSearch/>} />
          <Badge variant="warn" dot>進行中</Badge>
        </div>
      </div>
    </div>
  );
}

// ── Inline icons (Heroicons outline風 / 1.5px stroke) ─────
function IconPlus() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
function IconArrow() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function IconSearch() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M9 9l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
