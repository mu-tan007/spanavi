import { describe, it, expect } from 'vitest';
import { callMemoText } from './callMemoText';

describe('callMemoText', () => {
  it('再コールの記録を文章にする', () => {
    expect(callMemoText('{"recall_date":"2026-10-08","recall_time":"10:41","assignee":"北川 恭太郎","note":"","recall_completed":false}'))
      .toBe('再コール 10/8 10:41（北川）');
    expect(callMemoText('{"recall_date":"2026-10-07","recall_time":"18:30","assignee":"北川 恭太郎","note":"朝8時台なら在席","recall_completed":true}'))
      .toBe('再コール 10/7 18:30（北川） ・ かけ直し済み ／ 朝8時台なら在席');
  });
  it('ふつうの文章と壊れたデータはそのまま', () => {
    expect(callMemoText('外出中。戻りは未定')).toBe('外出中。戻りは未定');
    expect(callMemoText('{壊れた')).toBe('{壊れた');
    expect(callMemoText(null)).toBe('');
  });
});
