import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { auth: { getSession } } }));
vi.mock('./orgContext', () => ({ getOrgId: () => 'test-org' }));
vi.mock('../hooks/useCallStatuses', () => ({ statusIdToLabel: value => value }));
vi.mock('./payrollAutoSync', () => ({ enqueuePayrollSyncForMeetingDates: vi.fn() }));
vi.mock('./appointmentEvents', () => ({ notifyAppointmentsChanged: vi.fn() }));
import { invokeLookupCompanyHomepage } from './supabaseWrite';

const identity = { company_name: '白石工務店', address: '東京都昭島市', prefecture: '東京都', representative: '白石悟', phone: '042-555-0100' };
const wrongCompanyUrl = 'https://siraisi-koumuten.jp/';
let request;
beforeEach(() => {
  getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'test-session' } } });
  request = vi.fn();
  vi.stubGlobal('fetch', request);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const respond = body => request.mockResolvedValue({ ok: true, json: async () => body });

describe('HP自動取得の応答境界', () => {
  it.each([
    ['旧APIのURLのみ', { url: wrongCompanyUrl }],
    ['旧APIのhigh判定', { url: wrongCompanyUrl, confidence: 'high' }],
    ['未照合', { url: wrongCompanyUrl, confidence: 'high', verified: false }],
    ['文字列の照合フラグ', { url: wrongCompanyUrl, confidence: 'high', verified: 'true' }],
    ['確信度medium', { url: wrongCompanyUrl, confidence: 'medium', verified: true }],
    ['確信度low', { url: wrongCompanyUrl, confidence: 'low', verified: true }],
    ['空の応答', null],
  ])('%sの候補は報告用URLを返さない', async (_label, body) => {
    respond(body);
    expect(await invokeLookupCompanyHomepage(identity)).toMatchObject({ url: null, verified: false });
  });

  it.each(['https://company.example/', 'http://company.example/'])('照合完了の公式HP %s を返す', async url => {
    respond({ url, verified: true, confidence: 'high', reason: '電話番号と住所が一致' });
    expect(await invokeLookupCompanyHomepage(identity)).toMatchObject({ url, verified: true });
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual(identity);
  });

  it.each(['javascript:alert(1)', '//company.example/', 'not a URL', 'https://user:password@company.example/'])('危険・不正なURL %s は照合フラグがあっても空にする', async url => {
    respond({ url, verified: true, confidence: 'high' });
    expect(await invokeLookupCompanyHomepage(identity)).toMatchObject({ url: null });
  });

  it.each(['http', 'network', 'invalid-json', 'no-session'])('%s失敗でも候補を入力させず正常に戻る', async failure => {
    if (failure === 'http') request.mockResolvedValue({ ok: false, status: 503, json: async () => ({ url: wrongCompanyUrl, verified: true, confidence: 'high' }) });
    if (failure === 'network') request.mockRejectedValue(new Error('offline'));
    if (failure === 'invalid-json') request.mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } });
    if (failure === 'no-session') getSession.mockResolvedValue({ data: { session: null } });
    expect(await invokeLookupCompanyHomepage(identity)).toMatchObject({ url: null });
    if (failure === 'no-session') expect(request).not.toHaveBeenCalled();
  });
});
