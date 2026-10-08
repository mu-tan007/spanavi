import { describe, it, expect } from 'vitest';
import { yenFromThousand, shortYen, financeFromReport, briefModel, buildNewReportText } from './appoBrief';

describe('アポ報告の新しい形と1枚資料の値', () => {
  it('千円の値を読みやすい円にする', () => {
    expect(yenFromThousand(150500)).toBe('1億5,050万円');
    expect(yenFromThousand(-300)).toBe('▲30万円');
    expect(shortYen(150500)).toBe('1.5億');
    expect(shortYen(-300)).toBe('▲30万');
  });
  it('報告本文の財務の行から値を拾う', () => {
    expect(financeFromReport('財務：売上150,500千円、当期純利益-300千円')).toEqual({ revenue_k: 150500, net_income_k: -300 });
  });
  it('要点があれば新しい形の本文を作る', () => {
    const appo = { company: '株式会社ヒューマンクリエイト', client: '株式会社フラーレン', meetDate: '2026-10-20', meetTime: '11:00', meetLocation: '大阪府大阪市西区立売堀1-8-6 3F', isOnline: false, appoReport: '財務：売上150,500千円、当期純利益-300千円', getter: '日高 孝太朗' };
    const dossier = { target_representative: '吉岡 信吾', content: { business: ['IoT・組込みシステム開発。'], history: [{ year: '1991', event: '設立' }],
      brief: { one_liner: '財務は厳しいが選択肢は「全然ある」', temperature: 3, temperature_label: '条件次第', quotes: [{ text: '全然ある', context: '将来の選択肢', source: 'transcript' }], questions: ['過去の検討で止まった理由'], cautions: [], successor: '未確認' } } };
    const m = briefModel(appo, dossier);
    expect(m.meeting).toBe('10/20（火） 11:00');
    expect(m.travel).toBe('東京から片道 約3時間（新幹線）');
    const t = buildNewReportText(m, { phone: '06-6567-9140' });
    expect(t).toContain('【アポ取得のご報告】株式会社ヒューマンクリエイト');
    expect(t).toContain('温度感 ●●●○○ 条件次第');
    expect(t).toContain('「全然ある」');
    expect(t).toContain('財務　売上 1億5,050万円 ／ 純利益 ▲30万円');
    expect(t).toContain('面談前の1枚資料を添付しております。');
    expect(t).not.toContain('後継者');
  });
  it('アポ報告の【ヒアリング】の段を本文に載せる', () => {
    const m = briefModel({ company: 'A社', client: 'B社', meetDate: '2026-10-20', appoReport: '…\n　・アポ取得者→山田\n【ヒアリング】\n売上高：3.5億円\n従業員数：12人' }, { content: { brief: { one_liner: 'x', temperature: 3, quotes: [], questions: [] } } });
    expect(m.hearing).toEqual(['売上高：3.5億円', '従業員数：12人']);
    expect(buildNewReportText(m)).toContain('■ ヒアリング\n売上高：3.5億円\n従業員数：12人');
  });
});
