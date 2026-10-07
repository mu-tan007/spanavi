import { describe, it, expect } from 'vitest';
import { toStorage, parseOptions, isEmptyRule, previewReportBlock, scopeLabel } from './reportRulesEdit';

describe('reportRulesEdit', () => {
  it('空の行を捨て、既存の key・ask・選択肢を残す', () => {
    const out = toStorage({
      items: [
        { key: 'revenue', label: ' 売上高 ', type: 'number_oku', required: true, ask: true },
        { key: 'interest', label: '関心', type: 'select', options: ['あり', 'なし'], required: true, ask: false },
        { label: '  ', type: 'text' },
      ],
      conditions: [{ key: 'rev1', label: '売上1億円以下', check: { field: 'revenue_oku', op: '<=', value: '1' } }, { label: '' }],
      note: '',
    });
    expect(out.items).toEqual([
      { key: 'revenue', label: '売上高', type: 'number_oku', required: true, ask: true },
      { key: 'interest', label: '関心', type: 'select', required: true, ask: false, options: ['あり', 'なし'] },
    ]);
    expect(out.conditions).toEqual([{ key: 'rev1', label: '売上1億円以下', check: { field: 'revenue_oku', op: '<=', value: 1 } }]);
    expect(out.note).toBeNull();
  });
  it('新しい行には key を振り、数字でない値の判定は付けない', () => {
    const out = toStorage({ items: [{ label: '後継者', type: 'text' }], conditions: [{ label: '従業員', check: { field: 'employees', op: '<=', value: '' } }] });
    expect(out.items[0].key).toMatch(/^i/);
    expect(out.items[0].ask).toBe(true);
    expect(out.conditions[0].check).toBeUndefined();
  });
  it('選択肢を読点・カンマで分ける', () => {
    expect(parseOptions('あり、なし,わからない')).toEqual(['あり', 'なし', 'わからない']);
    expect(toStorage({ items: [{ label: 'x', type: 'select', optionsText: 'A、B' }] }).items[0].options).toEqual(['A', 'B']);
  });
  it('空の段を見分ける', () => {
    expect(isEmptyRule({ items: [], conditions: [], note: null })).toBe(true);
    expect(isEmptyRule({ items: [], conditions: [], note: 'x' })).toBe(false);
  });
  it('報告の本文の見本', () => {
    expect(previewReportBlock([{ label: '売上高', type: 'number_oku' }, { label: '従業員数', type: 'number_people' }]))
      .toBe('【ヒアリング】\n売上高：（架電で聞いた値）億円\n従業員数：（架電で聞いた値）人');
    expect(previewReportBlock([])).toBe('');
  });
  it('段の名前', () => {
    expect(scopeLabel({})).toBe('この会社の全リスト');
    expect(scopeLabel({ contact_id: 'c1' }, { contacts: [{ id: 'c1', name: '高野' }] })).toBe('担当者：高野 様');
    expect(scopeLabel({ list_id: 'l1' }, { lists: [{ _supaId: 'l1', industry: '物流' }] })).toBe('リスト：物流');
  });
});
