import { useState, useEffect, useMemo } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge } from '../ui';
import { Search, RotateCcw, Download } from 'lucide-react';
import CategorySearchInput from './CategorySearchInput';
import { fetchCategories, fetchPrefectures } from '../../lib/companyMasterApi';

const labelStyle = { fontSize: font.size.xs, color: color.textMid, marginBottom: 3, fontWeight: font.weight.semibold };
const rowStyle = { display: 'flex', gap: space[1.5], alignItems: 'center' };

export default function DatabaseFilterPanel({ filters, setFilter, onSearch, onReset, onExport, loading, totalCount, hasSearched }) {
  const [categories, setCategories] = useState([]);
  const [prefectures, setPrefectures] = useState([]);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(console.error);
    fetchPrefectures().then(setPrefectures).catch(console.error);
  }, []);

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
          <div style={labelStyle}>電話番号（前方一致）</div>
          <Input
            size="sm"
            type="text" value={filters.phonePattern}
            onChange={e => setFilter('phonePattern', e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="例: 090, 03..."
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

      {/* Row 5: Ranges */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: space[2.5] }}>
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
      </div>
    </Card>
  );
}
