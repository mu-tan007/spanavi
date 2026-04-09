import { useState, useEffect, useMemo } from 'react';
import { C } from '../../constants/colors';
import { Search, RotateCcw, Download } from 'lucide-react';
import CategorySearchInput from './CategorySearchInput';
import { fetchCategories, fetchPrefectures } from '../../lib/companyMasterApi';

const labelStyle = { fontSize: 11, color: C.textMid, marginBottom: 3, fontWeight: 600 };
const inputStyle = {
  width: '100%', padding: '6px 8px', border: `1px solid ${C.border}`,
  borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box',
};
const rowStyle = { display: 'flex', gap: 6, alignItems: 'center' };

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
    <div style={{
      background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
      padding: 18, marginBottom: 16,
    }}>
      {/* Row 1: Keyword + AND/OR + Buttons */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={labelStyle}>キーワード（企業名・事業内容）</div>
          <input
            type="text" value={filters.keyword}
            onChange={e => setFilter('keyword', e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="企業名や事業内容で検索..."
            style={inputStyle}
          />
        </div>
        {/* AND/OR toggle */}
        <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${C.border}`, height: 34 }}>
          {['AND', 'OR'].map(mode => (
            <button key={mode} onClick={() => setFilter('logic', mode)} style={{
              padding: '0 14px', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
              background: filters.logic === mode ? C.navy : C.white,
              color: filters.logic === mode ? C.white : C.textMid,
            }}>
              {mode}
            </button>
          ))}
        </div>
        <button onClick={onSearch} disabled={loading} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: C.navyLight, color: C.white, border: 'none',
          borderRadius: 8, padding: '8px 20px', fontWeight: 700, fontSize: 13,
          cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
        }}>
          <Search size={15} /> 検索
        </button>
        <button onClick={onReset} style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: C.offWhite, color: C.textMid, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
        }}>
          <RotateCcw size={14} /> リセット
        </button>
        {hasSearched && totalCount > 0 && onExport && (
          <button onClick={onExport} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: C.white, color: C.navy, border: `1px solid ${C.navy}`,
            borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}>
            <Download size={14} /> CSV出力
          </button>
        )}
      </div>

      {/* Row 2: Industry */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
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
          <input
            type="text" value={filters.city}
            onChange={e => setFilter('city', e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="市区郡名..."
            style={inputStyle}
          />
        </div>
        <div>
          <div style={labelStyle}>電話番号（前方一致）</div>
          <input
            type="text" value={filters.phonePattern}
            onChange={e => setFilter('phonePattern', e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="例: 090, 03..."
            style={inputStyle}
          />
        </div>
      </div>

      {/* Row 4: Shareholder type */}
      <div style={{ marginBottom: 12 }}>
        <div style={labelStyle}>株主タイプ</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
                padding: '5px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${selected ? C.navy : C.border}`,
                background: selected ? C.navy : C.white,
                color: selected ? C.white : C.textMid,
              }}>
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 5: Ranges */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
        <div>
          <div style={labelStyle}>売上高（千円）</div>
          <div style={rowStyle}>
            <input type="number" value={filters.revenueMin} onChange={e => setFilter('revenueMin', e.target.value)} onKeyDown={handleKeyDown} placeholder="下限" style={{ ...inputStyle, width: '50%' }} />
            <span style={{ color: C.textLight, fontSize: 12 }}>〜</span>
            <input type="number" value={filters.revenueMax} onChange={e => setFilter('revenueMax', e.target.value)} onKeyDown={handleKeyDown} placeholder="上限" style={{ ...inputStyle, width: '50%' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            {[{ v: 'include', l: '空欄を含む' }, { v: 'exclude', l: '空欄を含まない' }].map(o => (
              <label key={o.v} style={{ fontSize: 11, color: C.textMid, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
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
            <input type="number" value={filters.netIncomeMin} onChange={e => setFilter('netIncomeMin', e.target.value)} onKeyDown={handleKeyDown} placeholder="下限" style={{ ...inputStyle, width: '50%' }} />
            <span style={{ color: C.textLight, fontSize: 12 }}>〜</span>
            <input type="number" value={filters.netIncomeMax} onChange={e => setFilter('netIncomeMax', e.target.value)} onKeyDown={handleKeyDown} placeholder="上限" style={{ ...inputStyle, width: '50%' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            {[{ v: 'include', l: '空欄を含む' }, { v: 'exclude', l: '空欄を含まない' }].map(o => (
              <label key={o.v} style={{ fontSize: 11, color: C.textMid, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
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
            <input type="number" value={filters.employeeMin} onChange={e => setFilter('employeeMin', e.target.value)} onKeyDown={handleKeyDown} placeholder="下限" style={{ ...inputStyle, width: '50%' }} />
            <span style={{ color: C.textLight, fontSize: 12 }}>〜</span>
            <input type="number" value={filters.employeeMax} onChange={e => setFilter('employeeMax', e.target.value)} onKeyDown={handleKeyDown} placeholder="上限" style={{ ...inputStyle, width: '50%' }} />
          </div>
        </div>
        <div>
          <div style={labelStyle}>代表者年齢</div>
          <div style={rowStyle}>
            <input type="number" value={filters.ageMin} onChange={e => setFilter('ageMin', e.target.value)} onKeyDown={handleKeyDown} placeholder="下限" style={{ ...inputStyle, width: '50%' }} />
            <span style={{ color: C.textLight, fontSize: 12 }}>〜</span>
            <input type="number" value={filters.ageMax} onChange={e => setFilter('ageMax', e.target.value)} onKeyDown={handleKeyDown} placeholder="上限" style={{ ...inputStyle, width: '50%' }} />
          </div>
        </div>
        <div>
          <div style={labelStyle}>設立年</div>
          <div style={rowStyle}>
            <input type="number" value={filters.establishedMin} onChange={e => setFilter('establishedMin', e.target.value)} onKeyDown={handleKeyDown} placeholder="下限" style={{ ...inputStyle, width: '50%' }} />
            <span style={{ color: C.textLight, fontSize: 12 }}>〜</span>
            <input type="number" value={filters.establishedMax} onChange={e => setFilter('establishedMax', e.target.value)} onKeyDown={handleKeyDown} placeholder="上限" style={{ ...inputStyle, width: '50%' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
