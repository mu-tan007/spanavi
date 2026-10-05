import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: { from: vi.fn(), auth: {}, functions: { invoke: vi.fn() } } }));
vi.mock('./orgContext', () => ({ getOrgId: () => 'our-org' }));
vi.mock('../hooks/useCallStatuses', () => ({ statusIdToLabel: value => value }));

import { precheckResultForStatusChange } from './supabaseWrite';

describe('アポ一覧・事前確認タブで状態を変えたときの事前確認の結果', () => {
  it('アポ取得から変えたら、架電ページの事前確認欄と同じ結果になる', () => {
    expect(precheckResultForStatusChange('アポ取得', 'キャンセル')).toBe('キャンセル');
    expect(precheckResultForStatusChange('アポ取得', 'リスケ中')).toBe('リスケ');
    expect(precheckResultForStatusChange('アポ取得', '事前確認済')).toBe('確認完了');
    expect(precheckResultForStatusChange('リスケ中', '事前確認済')).toBe('確認完了');
  });
  it('面談後の変更や同じ状態のままは記録しない', () => {
    expect(precheckResultForStatusChange('面談済', 'キャンセル')).toBeNull();
    expect(precheckResultForStatusChange('事前確認済', 'キャンセル')).toBeNull();
    expect(precheckResultForStatusChange('キャンセル', 'キャンセル')).toBeNull();
    expect(precheckResultForStatusChange('アポ取得', '面談済')).toBeNull();
  });
});
