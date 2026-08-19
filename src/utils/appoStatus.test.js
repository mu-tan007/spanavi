import { describe, it, expect } from 'vitest';
import { initialAppoStatus } from './appoStatus';

describe('initialAppoStatus', () => {
  it('通常の架電リストは「アポ取得」', () => {
    expect(initialAppoStatus({ is_prospecting: false, skipPreCheck: false })).toBe('アポ取得');
  });

  it('クライアント開拓リストは「事前確認済」', () => {
    expect(initialAppoStatus({ is_prospecting: true, skipPreCheck: false })).toBe('事前確認済');
  });

  it('事前確認スキップ設定のクライアントは「事前確認済」', () => {
    expect(initialAppoStatus({ is_prospecting: false, skipPreCheck: true })).toBe('事前確認済');
  });

  it('list が未定義でも落ちず「アポ取得」', () => {
    expect(initialAppoStatus(undefined)).toBe('アポ取得');
    expect(initialAppoStatus(null)).toBe('アポ取得');
    expect(initialAppoStatus({})).toBe('アポ取得');
  });
});
