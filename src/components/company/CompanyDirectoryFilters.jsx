import { Input, Select, Button } from '../ui';
import { color, space, font, radius } from '../../constants/design';
import CategorySearchInput from '../database/CategorySearchInput';
import { DB_LABEL_OPTIONS } from '../../lib/companyMasterApi';
import { DIRECTORY_RANGES, advancedDirectoryConditionCount } from '../../utils/companyDirectoryFilters';
import { COMPANY_CRM_STAGES, COMPANY_REGISTRY_STATUSES } from '../../utils/companyProfileIdentity';
import { IMPORT_PROVIDERS } from '../../utils/companyImportFields';
import { CALL_RESULTS } from '../../constants/callResults';

// =====================================================================
// 企業DBの検索条件（Phalanx の企業DBの条件の並びにならう・2026-10-05）
//   並びは「会社を特定する → どんな会社か → どこにあるか → 規模 → 会社の性格 → 接点」。
//   ①〜③は基本の条件でいつも見える。④以降は「詳細条件」で畳む。
//   検索・条件クリアのボタンは検索カードの見出しの段に1組だけ置く（ここには置かない）。
// =====================================================================

const all = { value: '', label: '指定なし' };
const homeOptions = [all, { value: 'available', label: '住所あり' }, { value: 'unknown', label: '未確認' }, { value: 'conflict', label: '情報の相違あり' }];

export function FieldLabel({ children }) {
  return <div style={{ fontSize: 11.5, color: color.textMid, fontWeight: 600, marginBottom: 5 }}>{children}</div>;
}

// 番号付きの条件の枠。見出しは左に固定幅、項目は右に並べる。
export function Section({ number, label, children, columns = 3, isMobile }) {
  return (
    <div style={{
      display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'flex-start', gap: isMobile ? 12 : 20,
      marginTop: 10, padding: isMobile ? 12 : 16,
      background: color.gray50, border: `1px solid ${color.border}`, borderRadius: radius.xl,
    }}>
      <span style={{
        display: 'flex', alignItems: 'center', gap: 10, width: isMobile ? 'auto' : 150, flexShrink: 0, paddingTop: isMobile ? 0 : 6,
        fontSize: 12.5, fontWeight: 700, color: color.navy,
      }}>
        <span aria-hidden="true" style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: radius.xl,
          background: color.navy, color: color.white, fontSize: 12, fontWeight: 700, flexShrink: 0,
        }}>{number}</span>
        {label}
      </span>
      <div style={{
        flex: 1, minWidth: 0, width: '100%', display: 'grid', gap: 16,
        gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : `repeat(${columns}, minmax(0, 1fr))`,
      }}>{children}</div>
    </div>
  );
}

function Multi({ label, items = [], value = [], onChange }) {
  const options = items.map((item) => (typeof item === 'string' ? { value: item, label: item } : item));
  const counts = new Map();
  for (const o of options) counts.set(o.label, (counts.get(o.label) || 0) + 1);
  const duplicated = new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
  const named = options.map((o) => ({ ...o, name: duplicated.has(o.label) ? o.label + ' (' + o.value.slice(-6) + ')' : o.label }));
  // アーカイブされたリストや消えた業種を選んだままでも、選択は残す
  for (const selected of value) if (!named.some((o) => o.value === selected)) named.push({ value: selected, name: selected });
  return (
    <div style={{ minWidth: 0 }}>
      <FieldLabel>{label}</FieldLabel>
      <CategorySearchInput ariaLabel={label} placeholder="入力して複数選択"
        items={named.map((o) => o.name)} value={value.map((v) => named.find((o) => o.value === v)?.name || v)}
        onChange={(values) => onChange(values.map((v) => named.find((o) => o.name === v)?.value || v))} />
    </div>
  );
}

export default function CompanyDirectoryFilters({
  filters: f, onChange, onSearch, options, optionError, onRetryOptions, error,
  detailsOpen, onDetailsToggle, isMobile = false,
}) {
  const field = (label, el) => <div style={{ minWidth: 0 }}><FieldLabel>{label}</FieldLabel>{el}</div>;
  const input = (key, label, props = {}) => field(label,
    <Input size="sm" aria-label={label} value={f[key] || ''} onChange={(e) => onChange(key, e.target.value)} {...props} />);
  const select = (key, label, items) => field(label,
    <Select size="sm" aria-label={label} value={f[key] || ''} options={items} onChange={(e) => onChange(key, e.target.value)} />);
  const multi = (key, label, items) => <Multi key={key} label={label} items={items} value={f[key]} onChange={(value) => onChange(key, value)} />;
  const range = (key, label, missing = true) => (
    <div key={key} style={{ minWidth: 0 }}>
      <FieldLabel>{label}</FieldLabel>
      <div style={{ display: 'flex', gap: space[1], alignItems: 'center' }}>
        <Input size="sm" inputMode="numeric" aria-label={label + 'の下限（以上）'} placeholder="以上" value={f[key + 'Min']} disabled={f[key + 'NullMode'] === 'only'} onChange={(e) => onChange(key + 'Min', e.target.value)} />
        <span style={{ color: color.textLight }}>〜</span>
        <Input size="sm" inputMode="numeric" aria-label={label + (key === 'established' ? 'の上限（以下）' : 'の上限（未満）')} placeholder={key === 'established' ? '以下' : '未満'} value={f[key + 'Max']} disabled={f[key + 'NullMode'] === 'only'} onChange={(e) => onChange(key + 'Max', e.target.value)} />
      </div>
      {missing && (
        <Select size="sm" aria-label={label + 'が不明の企業'} value={f[key + 'NullMode']} onChange={(e) => onChange(key + 'NullMode', e.target.value)} containerStyle={{ marginTop: 4 }}
          options={[{ value: '', label: '不明は除く' }, { value: 'include', label: '不明も含める' }, { value: 'exclude', label: '不明を除く' }, { value: 'only', label: '不明のみ' }]} />
      )}
    </div>
  );

  const majors = [...new Set(options.categories.map((c) => c.daibunrui))];
  const subs = [...new Set(options.categories.filter((c) => !f.daibunrui.length || f.daibunrui.includes(c.daibunrui)).map((c) => c.saibunrui))];
  const advanced = advancedDirectoryConditionCount(f);

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSearch(); }}>
      {/* いちばん上：キーワード。Enter で検索。 */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'minmax(0,1fr) 220px', gap: 16, alignItems: 'end' }}>
        {field('キーワード', <Input size="sm" aria-label="企業を検索" placeholder="企業名・電話・住所など（空白区切りで複数）" value={f.keyword} onChange={(e) => onChange('keyword', e.target.value)} />)}
        {select('logic', '複数キーワード', [{ value: 'AND', label: 'すべて含む' }, { value: 'OR', label: 'いずれかを含む' }])}
      </div>

      <Section number="1" label="基本情報" columns={2} isMobile={isMobile}>
        {multi('listIds', '架電リスト', options.lists.map((l) => ({ value: l.id, label: l.name + (l.is_archived ? '（アーカイブ）' : '') })))}
        {input('owner', '担当者')}
      </Section>
      <Section number="2" label="業種・事業" columns={3} isMobile={isMobile}>
        {multi('daibunrui', '業種大分類', majors)}
        {multi('saibunrui', '業種細分類', subs)}
        {input('business', '事業内容')}
      </Section>
      <Section number="3" label="所在地" columns={2} isMobile={isMobile}>
        {multi('prefecture', '都道府県', options.prefectures)}
        {field('市区町村・会社住所', <Input size="sm" aria-label="市区町村・会社住所" placeholder="読点区切りで複数" value={f.cities.length ? f.cities.join('、') : f.city} onChange={(e) => onChange('city', e.target.value)} />)}
      </Section>

      {/* 詳細条件。閉じている間は入っている数を出す。 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '12px 0 0' }}>
        <Button type="button" size="sm" variant="ghost" aria-expanded={detailsOpen} onClick={onDetailsToggle}>
          {detailsOpen ? '詳細条件を閉じる' : '詳細条件'}
          {!detailsOpen && advanced > 0 && (
            <span style={{ marginLeft: 6, padding: '1px 7px', borderRadius: radius.pill, background: color.infoSoft, color: color.navy, fontSize: 11 }}>{advanced}</span>
          )}
        </Button>
      </div>

      {detailsOpen && <>
        <Section number="4" label="識別・電話" columns={4} isMobile={isMobile}>
          {input('identifier', '法人番号・企業コード', { placeholder: '完全一致・先頭の0も入力' })}
          {input('representative', '代表者名')}
          {input('phonePattern', '電話番号の前方一致', { placeholder: '03, 06 など' })}
          {input('industry', '業種名')}
        </Section>
        <Section number="5" label="規模・財務" columns={3} isMobile={isMobile}>
          {DIRECTORY_RANGES.filter(([key]) => !['age', 'established'].includes(key)).map(([key, label]) => range(key, label))}
        </Section>
        <Section number="6" label="会社の性格" columns={3} isMobile={isMobile}>
          {range('age', '代表者年齢')}
          {range('established', '設立年')}
          {multi('shareholderType', '株主の構成', [{ value: 'individual', label: '個人のみ' }, { value: 'corporate', label: '法人のみ' }, { value: 'mixed', label: '個人・法人混在' }, { value: 'empty', label: '不明' }])}
          {field('代表者と株主', <Select size="sm" aria-label="代表者と株主" value={f.repShareholderMatch ? 'yes' : ''} onChange={(e) => onChange('repShareholderMatch', e.target.value === 'yes')} options={[all, { value: 'yes', label: '株主欄に代表者名を含む' }]} />)}
          {multi('dbLabel', '企業ラベル', DB_LABEL_OPTIONS.map((v) => (typeof v === 'string' ? v : { value: v.value, label: v.label })))}
          {select('registry', '登記の確認状況', [all, { value: 'exclude_closed', label: '閉鎖確認済みを除く' }, ...COMPANY_REGISTRY_STATUSES])}
          {select('addressMatch', '会社住所と代表者自宅住所', [all, { value: 'same', label: '一致' }, { value: 'different', label: '不一致' }, { value: 'unknown', label: '判定不可' }])}
          {select('home', '代表者自宅住所', homeOptions)}
        </Section>
        <Section number="7" label="架電状況" columns={3} isMobile={isMobile}>
          {multi('callCategory', '架電の商材', options.categoriesCall.map((c) => ({ value: c.id, label: c.name })))}
          {multi('callEngagement', '架電のタイプ', options.engagements.filter((e) => !f.callCategory.length || f.callCategory.includes(e.category_id) || f.callEngagement.includes(e.id)).map((e) => ({ value: e.id, label: e.name })))}
          {multi('callStatus', '架電ステータス', ['未架電', '未登録', ...CALL_RESULTS.map((c) => c.label)])}
          {range('callCount', '架電回数', false)}
          {input('lastCallFrom', '最終架電日（から）', { type: 'date' })}
          {input('lastCallTo', '最終架電日（まで）', { type: 'date' })}
        </Section>
        <Section number="8" label="担当・次回対応" columns={4} isMobile={isMobile}>
          {select('stage', '対応状況', [all, ...COMPANY_CRM_STAGES.map((value) => ({ value, label: value }))])}
          {select('scope', '確認・対応', [all, { value: 'due', label: '次回対応の期限が到来' }, { value: 'review', label: '名寄せ・情報の確認が必要' }])}
          {input('nextActionFrom', '次回対応日（から）', { type: 'date' })}
          {input('nextActionTo', '次回対応日（まで）', { type: 'date' })}
        </Section>
        <Section number="9" label="取込元" columns={2} isMobile={isMobile}>
          {select('provider', 'データの出所', [all, ...IMPORT_PROVIDERS, { value: 'unknown', label: '出所未設定（過去の取込など）' }])}
          {input('sourceQuery', '提供元・ファイル名', { placeholder: 'クライアント名、元ファイル名など' })}
        </Section>
      </>}

      {optionError && (
        <p role="alert" style={{ color: color.danger, fontSize: font.size.sm }}>
          {optionError} <Button type="button" size="sm" variant="ghost" onClick={onRetryOptions}>候補を再読み込み</Button>
        </p>
      )}
      {error && <p role="alert" style={{ color: color.danger, fontSize: font.size.sm }}>{error}</p>}
      {/* Enter で送るための見えないボタン */}
      <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
    </form>
  );
}
