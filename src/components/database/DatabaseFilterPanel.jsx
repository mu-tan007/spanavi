import { useState, useEffect, useMemo } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge } from '../ui';
import { Search, RotateCcw, Download } from 'lucide-react';
import CategorySearchInput from './CategorySearchInput';
import { fetchCategories, fetchPrefectures, fetchBusinessCategories, fetchEngagementTypes, DB_LABEL_OPTIONS } from '../../lib/companyMasterApi';
import { CALL_RESULTS } from '../../constants/callResults';

const labelStyle = { fontSize: font.size.xs, color: color.textMid, marginBottom: 3, fontWeight: font.weight.semibold };
const rowStyle = { display: 'flex', gap: space[1.5], alignItems: 'center' };

// 架電ステータス抽出の選択肢。「いずれかのリストで該当」でヒット。
// 特殊2つ（未架電=登録あり未架電 / 未登録=どのリストにも無し）＋実9ステータス。
const CALL_STATUS_OPTIONS = ['未架電', '未登録', ...CALL_RESULTS.map(s => s.label)];

export default function DatabaseFilterPanel({ filters, setFilter, onSearch, onReset, onExport, loading, totalCount, hasSearched }) {
  const [categories, setCategories] = useState([]);
  const [prefectures, setPrefectures] = useState([]);
  const [businessCategories, setBusinessCategories] = useState([]); // 商材(M&A/人材/IFA/…)
  const [engagementTypes, setEngagementTypes] = useState([]); // タイプ(売り手ソーシング等)

  useEffect(() => {
    fetchCategories().then(setCategories).catch(console.error);
    fetchPrefectures().then(setPrefectures).catch(console.error);
    fetchBusinessCategories().then(setBusinessCategories).catch(console.error);
    fetchEngagementTypes().then(setEngagementTypes).catch(console.error);
  }, []);

  // 選択中の商材配下のタイプ（engagement）。商材未選択なら全タイプ。
  const selectedCats = filters.callCategory || [];
  const visibleTypes = useMemo(() => {
    const list = selectedCats.length
      ? engagementTypes.filter(e => selectedCats.includes(e.category_id))
      : engagementTypes;
    // 同名タイプが複数商材にまたがる場合、商材名を接頭してラベル衝突を避ける
    const catName = Object.fromEntries(businessCategories.map(c => [c.id, c.name]));
    const nameCounts = {};
    list.forEach(e => { nameCounts[e.name] = (nameCounts[e.name] || 0) + 1; });
    return list.map(e => ({
      id: e.id,
      label: (nameCounts[e.name] > 1 && catName[e.category_id]) ? `${catName[e.category_id]}/${e.name}` : e.name,
    }));
  }, [engagementTypes, businessCategories, selectedCats]);

  const daibunruiList = useMemo(() => {
    return [...new Set(categories.map(c => c.daibunrui))];
  }, [categories]);

  const saibunruiList = useMemo(() => {
    if (!filters.daibunrui?.length) return [...new Set(categories.map(c => c.saibunrui))];
    const selectedSet = new Set(filters.daibunrui);
    return categories.filter(c => selectedSet.has(c.daibunrui)).map(c => c.saibunrui);
  }, [categories, filters.daibunrui]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') onSearch();
  };

  return (
    <Card padding="md" style={{ marginBottom: space[4] }}>
      {/* Row 1: Keyword + AND/OR + Buttons */}
      <div style={{ display: 'flex', gap: space[2.5], marginBottom: space[3] + 2, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={labelStyle}>キーワード（企業名・事業内容）</div>
          <Input
            size="sm"
            type="text" value={filters.keyword}
            onChange={e => setFilter('keyword', e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="企業名や事業内容で検索..."
          />
        </div>
        {/* AND/OR toggle */}
        <div style={{ display: 'flex', borderRadius: radius.lg, overflow: 'hidden', border: `1px solid ${color.border}`, height: 34 }}>
          {['AND', 'OR'].map(mode => (
            <button key={mode} onClick={() => setFilter('logic', mode)} style={{
              padding: `0 ${space[3] + 2}px`, fontSize: font.size.sm, fontWeight: font.weight.bold, border: 'none', cursor: 'pointer',
              background: filters.logic === mode ? color.navy : color.white,
              color: filters.logic === mode ? color.white : color.textMid,
            }}>
              {mode}
            </button>
          ))}
        </div>
        <Button onClick={onSearch} loading={loading} iconLeft={<Search size={15} />}>検索</Button>
        <Button variant="secondary" onClick={onReset} iconLeft={<RotateCcw size={14} />}>リセット</Button>
        {hasSearched && totalCount > 0 && onExport && (
          <Button variant="outline" onClick={onExport} iconLeft={<Download size={14} />}>CSV出力</Button>
        )}
      </div>

      {/* Row 2: Industry */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[2.5], marginBottom: space[3] }}>
        <div>
          <div style={labelStyle}>大分類</div>
          <CategorySearchInput
            items={daibunruiList}
            value={filters.daibunrui}
            onChange={(v) => { setFilter('daibunrui', v); setFilter('saibunrui', []); }}
            placeholder="入力して候補を表示..."
          />
        </div>
        <div>
          <div style={labelStyle}>細分類</div>
          <CategorySearchInput
            items={saibunruiList}
            value={filters.saibunrui}
            onChange={(v) => setFilter('saibunrui', v)}
            placeholder="入力して候補を表示..."
          />
        </div>
      </div>

      {/* Row 3: Area + Phone */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: space[2.5], marginBottom: space[3] }}>
        <div>
          <div style={labelStyle}>都道府県</div>
          <CategorySearchInput
            items={prefectures}
            value={filters.prefecture}
            onChange={(v) => setFilter('prefecture', v)}
            placeholder="都道府県..."
          />
        </div>
        <div>
          <div style={labelStyle}>市区町村</div>
          <Input
            size="sm"
            type="text" value={filters.city}
            onChange={e => setFilter('city', e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="市区郡名..."
          />
        </div>
        <div>
          <div style={labelStyle}>電話番号（前方一致・複数可）</div>
          <Input
            size="sm"
            type="text" value={filters.phonePattern}
            onChange={e => setFilter('phonePattern', e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="例: 080, 090, 03（カンマ区切りで複数指定可）"
          />
        </div>
      </div>

      {/* Row 4: Shareholder type */}
      <div style={{ marginBottom: space[3] }}>
        <div style={labelStyle}>株主タイプ</div>
        <div style={{ display: 'flex', gap: space[1.5], flexWrap: 'wrap' }}>
          {[
            { value: 'individual', label: '個人のみ' },
            { value: 'corporate', label: '法人のみ' },
            { value: 'mixed', label: '個人＆法人' },
            { value: 'empty', label: '空欄' },
          ].map(opt => {
            const selected = (filters.shareholderType || []).includes(opt.value);
            return (
              <button key={opt.value} onClick={() => {
                const cur = filters.shareholderType || [];
                setFilter('shareholderType', selected ? cur.filter(v => v !== opt.value) : [...cur, opt.value]);
              }} style={{
                padding: '5px 14px', fontSize: font.size.sm, fontWeight: font.weight.semibold, borderRadius: radius.lg, cursor: 'pointer',
                border: `1px solid ${selected ? color.navy : color.border}`,
                background: selected ? color.navy : color.white,
                color: selected ? color.white : color.textMid,
              }}>
                {opt.label}
              </button>
            );
          })}
          <span style={{ width: 1, height: 22, background: color.border, alignSelf: 'center' }} />
          <button onClick={() => setFilter('repShareholderMatch', !filters.repShareholderMatch)} style={{
            padding: '5px 14px', fontSize: font.size.sm, fontWeight: font.weight.semibold, borderRadius: radius.lg, cursor: 'pointer',
            border: `1px solid ${filters.repShareholderMatch ? color.navy : color.border}`,
            background: filters.repShareholderMatch ? color.navy : color.white,
            color: filters.repShareholderMatch ? color.white : color.textMid,
          }}>
            代表・株主一致
          </button>
        </div>
      </div>

      {/* Row 4.4: 企業DBラベル（M&Aニーズあり 等） */}
      <div style={{ marginBottom: space[3] }}>
        <div style={labelStyle}>企業DBラベル<span style={{ color: color.textLight, fontWeight: font.weight.regular, marginLeft: 6 }}>会社属性タグ（架電ステータスとは別軸。掛け合わせ可）</span></div>
        <div style={{ display: 'flex', gap: space[1.5], flexWrap: 'wrap' }}>
          {DB_LABEL_OPTIONS.map(label => {
            const selected = (filters.dbLabel || []).includes(label);
            return (
              <button key={label} onClick={() => {
                const cur = filters.dbLabel || [];
                setFilter('dbLabel', selected ? cur.filter(v => v !== label) : [...cur, label]);
              }} style={{
                padding: '5px 14px', fontSize: font.size.sm, fontWeight: font.weight.semibold, borderRadius: radius.lg, cursor: 'pointer',
                border: `1px solid ${selected ? color.gold : color.border}`,
                background: selected ? color.gold : color.white,
                color: selected ? color.navyDeep : color.textMid,
              }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 4.5: 商材 × 架電ステータス（企業DB×リスト架電履歴の横断） */}
      {businessCategories.length > 0 && (
        <div style={{ marginBottom: space[3] }}>
          <div style={labelStyle}>商材<span style={{ color: color.textLight, fontWeight: font.weight.regular, marginLeft: 6 }}>架電ステータスを商材で絞る（複数選択＝OR。未選択＝全商材）</span></div>
          <div style={{ display: 'flex', gap: space[1.5], flexWrap: 'wrap' }}>
            {businessCategories.map(bc => {
              const selected = (filters.callCategory || []).includes(bc.id);
              return (
                <button key={bc.id} onClick={() => {
                  const cur = filters.callCategory || [];
                  setFilter('callCategory', selected ? cur.filter(v => v !== bc.id) : [...cur, bc.id]);
                }} style={{
                  padding: '5px 14px', fontSize: font.size.sm, fontWeight: font.weight.semibold, borderRadius: radius.lg, cursor: 'pointer',
                  border: `1px solid ${selected ? color.navy : color.border}`,
                  background: selected ? color.navy : color.white,
                  color: selected ? color.white : color.textMid,
                }}>
                  {bc.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* タイプ（商材配下の engagement） */}
      {visibleTypes.length > 0 && (
        <div style={{ marginBottom: space[3] }}>
          <div style={labelStyle}>タイプ<span style={{ color: color.textLight, fontWeight: font.weight.regular, marginLeft: 6 }}>商材配下の種別で絞る（複数選択＝OR。未選択＝全タイプ）</span></div>
          <div style={{ display: 'flex', gap: space[1.5], flexWrap: 'wrap' }}>
            {visibleTypes.map(t => {
              const selected = (filters.callEngagement || []).includes(t.id);
              return (
                <button key={t.id} onClick={() => {
                  const cur = filters.callEngagement || [];
                  setFilter('callEngagement', selected ? cur.filter(v => v !== t.id) : [...cur, t.id]);
                }} style={{
                  padding: '5px 14px', fontSize: font.size.sm, fontWeight: font.weight.semibold, borderRadius: radius.lg, cursor: 'pointer',
                  border: `1px solid ${selected ? color.navyLight : color.border}`,
                  background: selected ? color.navyLight : color.white,
                  color: selected ? color.white : color.textMid,
                }}>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 架電ステータス */}
      <div style={{ marginBottom: space[3] }}>
        <div style={labelStyle}>架電ステータス<span style={{ color: color.textLight, fontWeight: font.weight.regular, marginLeft: 6 }}>いずれかのリストで該当（複数選択＝OR）{((filters.callCategory || []).length > 0 || (filters.callEngagement || []).length > 0) ? '・上の商材/タイプ内で判定' : ''}</span></div>
        <div style={{ display: 'flex', gap: space[1.5], flexWrap: 'wrap' }}>
          {CALL_STATUS_OPTIONS.map(label => {
            const selected = (filters.callStatus || []).includes(label);
            return (
              <button key={label} onClick={() => {
                const cur = filters.callStatus || [];
                setFilter('callStatus', selected ? cur.filter(v => v !== label) : [...cur, label]);
              }} style={{
                padding: '5px 14px', fontSize: font.size.sm, fontWeight: font.weight.semibold, borderRadius: radius.lg, cursor: 'pointer',
                border: `1px solid ${selected ? color.navy : color.border}`,
                background: selected ? color.navy : color.white,
                color: selected ? color.white : color.textMid,
              }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 5: Ranges */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: space[2.5] }}>
        <div>
          <div style={labelStyle}>売上高（千円）</div>
          <div style={rowStyle}>
            <Input size="sm" type="number" value={filters.revenueMin} onChange={e => setFilter('revenueMin', e.target.value)} onKeyDown={handleKeyDown} placeholder="以上" containerStyle={{ width: '50%' }} />
            <span style={{ color: color.textLight, fontSize: font.size.sm }}>〜</span>
            <Input size="sm" type="number" value={filters.revenueMax} onChange={e => setFilter('revenueMax', e.target.value)} onKeyDown={handleKeyDown} placeholder="未満" containerStyle={{ width: '50%' }} />
          </div>
          <div style={{ display: 'flex', gap: space[2.5], marginTop: 4 }}>
            {[{ v: 'include', l: '空欄を含む' }, { v: 'exclude', l: '空欄を含まない' }].map(o => (
              <label key={o.v} style={{ fontSize: font.size.xs, color: color.textMid, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                <input type="checkbox" checked={filters.revenueNullMode === o.v}
                  onChange={() => setFilter('revenueNullMode', filters.revenueNullMode === o.v ? '' : o.v)} />
                {o.l}
              </label>
            ))}
          </div>
        </div>
        <div>
          <div style={labelStyle}>当期純利益（千円）</div>
          <div style={rowStyle}>
            <Input size="sm" type="number" value={filters.netIncomeMin} onChange={e => setFilter('netIncomeMin', e.target.value)} onKeyDown={handleKeyDown} placeholder="以上" containerStyle={{ width: '50%' }} />
            <span style={{ color: color.textLight, fontSize: font.size.sm }}>〜</span>
            <Input size="sm" type="number" value={filters.netIncomeMax} onChange={e => setFilter('netIncomeMax', e.target.value)} onKeyDown={handleKeyDown} placeholder="未満" containerStyle={{ width: '50%' }} />
          </div>
          <div style={{ display: 'flex', gap: space[2.5], marginTop: 4 }}>
            {[{ v: 'include', l: '空欄を含む' }, { v: 'exclude', l: '空欄を含まない' }].map(o => (
              <label key={o.v} style={{ fontSize: font.size.xs, color: color.textMid, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                <input type="checkbox" checked={filters.netIncomeNullMode === o.v}
                  onChange={() => setFilter('netIncomeNullMode', filters.netIncomeNullMode === o.v ? '' : o.v)} />
                {o.l}
              </label>
            ))}
          </div>
        </div>
        <div>
          <div style={labelStyle}>従業員数</div>
          <div style={rowStyle}>
            <Input size="sm" type="number" value={filters.employeeMin} onChange={e => setFilter('employeeMin', e.target.value)} onKeyDown={handleKeyDown} placeholder="以上" containerStyle={{ width: '50%' }} />
            <span style={{ color: color.textLight, fontSize: font.size.sm }}>〜</span>
            <Input size="sm" type="number" value={filters.employeeMax} onChange={e => setFilter('employeeMax', e.target.value)} onKeyDown={handleKeyDown} placeholder="未満" containerStyle={{ width: '50%' }} />
          </div>
          <div style={{ display: 'flex', gap: space[2.5], marginTop: 4 }}>
            {[{ v: 'include', l: '空欄を含む' }, { v: 'exclude', l: '空欄を含まない' }].map(o => (
              <label key={o.v} style={{ fontSize: font.size.xs, color: color.textMid, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                <input type="checkbox" checked={filters.employeeNullMode === o.v}
                  onChange={() => setFilter('employeeNullMode', filters.employeeNullMode === o.v ? '' : o.v)} />
                {o.l}
              </label>
            ))}
          </div>
        </div>
        <div>
          <div style={labelStyle}>代表者年齢</div>
          <div style={rowStyle}>
            <Input size="sm" type="number" value={filters.ageMin} onChange={e => setFilter('ageMin', e.target.value)} onKeyDown={handleKeyDown} placeholder="以上" containerStyle={{ width: '50%' }} />
            <span style={{ color: color.textLight, fontSize: font.size.sm }}>〜</span>
            <Input size="sm" type="number" value={filters.ageMax} onChange={e => setFilter('ageMax', e.target.value)} onKeyDown={handleKeyDown} placeholder="未満" containerStyle={{ width: '50%' }} />
          </div>
          <div style={{ display: 'flex', gap: space[2.5], marginTop: 4 }}>
            {[{ v: 'include', l: '空欄を含む' }, { v: 'exclude', l: '空欄を含まない' }].map(o => (
              <label key={o.v} style={{ fontSize: font.size.xs, color: color.textMid, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                <input type="checkbox" checked={filters.ageNullMode === o.v}
                  onChange={() => setFilter('ageNullMode', filters.ageNullMode === o.v ? '' : o.v)} />
                {o.l}
              </label>
            ))}
          </div>
        </div>
        <div>
          <div style={labelStyle}>設立年（西暦）</div>
          <div style={rowStyle}>
            <Input size="sm" type="number" value={filters.establishedMin} onChange={e => setFilter('establishedMin', e.target.value)} onKeyDown={handleKeyDown} placeholder="以降" containerStyle={{ width: '50%' }} />
            <span style={{ color: color.textLight, fontSize: font.size.sm }}>〜</span>
            <Input size="sm" type="number" value={filters.establishedMax} onChange={e => setFilter('establishedMax', e.target.value)} onKeyDown={handleKeyDown} placeholder="以前" containerStyle={{ width: '50%' }} />
          </div>
        </div>
      </div>
    </Card>
  );
}
