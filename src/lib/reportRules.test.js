import { describe, it, expect, vi } from 'vitest';
vi.mock('./supabase', () => ({ supabase: {} }));
import { resolveReportRules, checkRuleFields, ruleReportBlock } from './reportRules';

const rules = [
  { client_id: 'c1', contact_id: null, list_id: null, items: [{ key: 'revenue', label: '売上高', type: 'number_oku', required: true }, { key: 'emp', label: '従業員数', type: 'number_people', required: true }], conditions: [{ key: 'rev1', label: '売上1億円以下', check: { field: 'revenue_oku', op: '<=', value: 1 } }, { key: 'fixed', label: '確定アポである' }] },
  { client_id: 'c1', contact_id: 'k1', list_id: null, items: [{ key: 'first', label: '社長の下の名前', type: 'text', required: true }], conditions: [] },
  { client_id: 'c1', contact_id: null, list_id: 'L2', items: [{ key: 'revenue', label: '売上高', type: 'number_oku', required: false }], conditions: [] },
  { client_id: 'c2', contact_id: null, list_id: null, items: [{ key: 'x', label: '別会社', type: 'text', required: true }], conditions: [] },
];

describe('クライアントごとの報告項目と条件', () => {
  it('クライアント→担当者→リストの順に重ねる', () => {
    const a = resolveReportRules(rules, { _supaId: 'L1', client_id: 'c1', contactIds: ['k1'] });
    expect(a.items.map(i => i.key)).toEqual(['revenue', 'emp', 'first']);
    const b = resolveReportRules(rules, { _supaId: 'L2', client_id: 'c1', contactIds: [] });
    expect(b.items.find(i => i.key === 'revenue').required).toBe(false);
    expect(b.items.map(i => i.key)).not.toContain('first');
  });
  it('必須の空欄は止め、条件に当たれば警告、確認の条件は常に確かめる', () => {
    const r = resolveReportRules(rules, { _supaId: 'L1', client_id: 'c1', contactIds: [] });
    const empty = checkRuleFields({}, r);
    expect(empty.filter(i => i.level === 'error').length).toBe(2);
    const low = checkRuleFields({ rule_revenue: '0.8', rule_emp: '20' }, r);
    expect(low.filter(i => i.level === 'error')).toEqual([]);
    expect(low.map(i => i.msg).join()).toContain('売上1億円以下');
    expect(low.map(i => i.msg).join()).toContain('確定アポである');
    const ok = checkRuleFields({ rule_revenue: '3', rule_emp: '20' }, r);
    expect(ok.map(i => i.msg).join()).not.toContain('売上1億円以下');
  });
  it('報告本文に【ヒアリング】の段を足す', () => {
    const r = resolveReportRules(rules, { _supaId: 'L1', client_id: 'c1', contactIds: [] });
    expect(ruleReportBlock({ rule_revenue: '3.5', rule_emp: '12' }, r)).toBe('\n【ヒアリング】\n売上高：3.5億円\n従業員数：12人');
    expect(ruleReportBlock({}, r)).toBe('');
  });
});
