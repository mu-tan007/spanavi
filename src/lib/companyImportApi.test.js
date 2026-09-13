import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }));
import { supabase } from './supabase';
import { executeCompanyImport, companyImportFingerprint } from './companyImportApi';

const rowsFor = count => Array.from({ length: count }, (_, i) => ({ row_no: i + 1, source_row: i + 3, values: [`検証社${i}`] }));
const response = (data, error = null) => {
  const promise = Promise.resolve({ data, error }); promise.abortSignal = () => promise; return promise;
};
beforeEach(() => vi.clearAllMocks());

describe('企業取込の原子的な再開', () => {
  it('登録済みと要修正の両方を処理済みに含め、未処理行だけを送る', async () => {
    let processed = 25; const chunks = [], progress = vi.fn();
    supabase.rpc.mockImplementation((name, args) => {
      if (name === 'append_company_import') { chunks.push(args.p_rows); processed += args.p_rows.length; }
      return response({ id: 'job', processed, total: 61, saved: processed - 3, rejected: 3 });
    });
    const result = await executeCompanyImport({ rows: rowsFor(61), metadata: {}, fingerprint: 'same', onProgress: progress });
    expect(chunks.map(chunk => [chunk[0].row_no, chunk.at(-1).row_no])).toEqual([[26, 50], [51, 61]]);
    expect(result.saved).toBe(58); expect(progress.mock.calls.map(([job]) => job.processed)).toEqual([25, 50, 61]);
  });
  it('サーバーの保存後に応答だけ失われても再実行で二重登録しない', async () => {
    let processed = 0, loseResponse = true; const stored = [];
    supabase.rpc.mockImplementation((name, args) => {
      if (name === 'append_company_import') {
        stored.push(...args.p_rows.map(row => row.row_no)); processed += args.p_rows.length;
        if (loseResponse) { loseResponse = false; return response(null, new Error('network interrupted')); }
      }
      return response({ id: 'job', processed, total: 55, saved: processed, rejected: 0 });
    });
    const request = { rows: rowsFor(55), metadata: {}, fingerprint: 'same' };
    await expect(executeCompanyImport(request)).rejects.toThrow('network');
    await expect(executeCompanyImport(request)).resolves.toMatchObject({ processed: 55, saved: 55 });
    expect(stored).toEqual(Array.from({ length: 55 }, (_, i) => i + 1));
  });
  it('中断後は次のチャンクを送らない', async () => {
    const controller = new AbortController();
    supabase.rpc.mockImplementation(() => response({ id: 'job', processed: 0 }));
    await expect(executeCompanyImport({ rows: rowsFor(30), signal: controller.signal,
      onProgress: () => controller.abort() })).rejects.toThrow('中断');
    expect(supabase.rpc.mock.calls.map(([name]) => name)).toEqual(['begin_company_import']);
  });
  it('最終結果が全行分でなければ成功として返さない', async () => {
    supabase.rpc.mockImplementation(name => response({ id: 'job', processed: name === 'append_company_import' ? 1 : 0 }));
    await expect(executeCompanyImport({ rows: rowsFor(1) })).rejects.toThrow('未確定');
  });
  it('同じ原本と設定は同じ指紋、出所・元の値・リストが変われば別の指紋になる', async () => {
    const rows = rowsFor(2), metadata = { provider: 'tdb', mapping: [{ key: 'company_name' }] };
    const fingerprint = await companyImportFingerprint('list-a', metadata, rows);
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(await companyImportFingerprint('list-a', metadata, rows)).toBe(fingerprint);
    for (const args of [['list-b', metadata, rows], ['list-a', { ...metadata, provider: 'tsr' }, rows], ['list-a', metadata, rowsFor(3)]]) {
      expect(await companyImportFingerprint(...args)).not.toBe(fingerprint);
    }
  });
});
