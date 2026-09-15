import { describe, it, expect, vi } from 'vitest';
import { createAuthRetryFetch } from './authRetryFetch';

const ANON = 'anon-key';
const REST = 'https://x.supabase.co/rest/v1/appointments';

const res = (status) => ({ status, ok: status < 400 });

function build({ responses, session = { access_token: 'new-token' } }) {
  const queue = [...responses];
  const baseFetch = vi.fn(async () => res(queue.shift()));
  const refreshSession = vi.fn(async () => ({ data: { session } }));
  const f = createAuthRetryFetch({ fetch: baseFetch, refreshSession, anonKey: ANON });
  return { f, baseFetch, refreshSession };
}

const userInit = (extra = {}) => ({
  method: 'POST',
  headers: { Authorization: 'Bearer old-token', apikey: ANON },
  body: '{"company_name":"有限会社マザーエキスプレス"}',
  ...extra,
});

describe('createAuthRetryFetch', () => {
  it('200 はそのまま返し、更新も再送もしない', async () => {
    const { f, baseFetch, refreshSession } = build({ responses: [200] });
    const r = await f(REST, userInit());
    expect(r.status).toBe(200);
    expect(baseFetch).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('401 ならトークンを取り直して新しいトークンで1回だけ再送する', async () => {
    const { f, baseFetch, refreshSession } = build({ responses: [401, 201] });
    const r = await f(REST, userInit());
    expect(r.status).toBe(201);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(baseFetch).toHaveBeenCalledTimes(2);
    const retryHeaders = baseFetch.mock.calls[1][1].headers;
    expect(retryHeaders.get('Authorization')).toBe('Bearer new-token');
    expect(retryHeaders.get('apikey')).toBe(ANON);
    expect(baseFetch.mock.calls[1][1].body).toBe(userInit().body);
  });

  it('再送しても401なら諦める（無限ループにしない）', async () => {
    const { f, baseFetch } = build({ responses: [401, 401] });
    const r = await f(REST, userInit());
    expect(r.status).toBe(401);
    expect(baseFetch).toHaveBeenCalledTimes(2);
  });

  it('トークンが更新できなければ再送しない', async () => {
    const { f, baseFetch } = build({ responses: [401, 200], session: null });
    const r = await f(REST, userInit());
    expect(r.status).toBe(401);
    expect(baseFetch).toHaveBeenCalledTimes(1);
  });

  it('更新前と同じトークンが返ったら再送しない', async () => {
    const { f, baseFetch } = build({ responses: [401, 200], session: { access_token: 'old-token' } });
    const r = await f(REST, userInit());
    expect(r.status).toBe(401);
    expect(baseFetch).toHaveBeenCalledTimes(1);
  });

  it('認証API自体の401には触らない', async () => {
    const { f, baseFetch, refreshSession } = build({ responses: [401, 200] });
    const r = await f('https://x.supabase.co/auth/v1/token?grant_type=password', userInit());
    expect(r.status).toBe(401);
    expect(refreshSession).not.toHaveBeenCalled();
    expect(baseFetch).toHaveBeenCalledTimes(1);
  });

  it('匿名キーのままの要求は更新しても意味がないので再送しない', async () => {
    const { f, baseFetch, refreshSession } = build({ responses: [401, 200] });
    const r = await f(REST, userInit({ headers: { Authorization: `Bearer ${ANON}`, apikey: ANON } }));
    expect(r.status).toBe(401);
    expect(refreshSession).not.toHaveBeenCalled();
    expect(baseFetch).toHaveBeenCalledTimes(1);
  });

  it('送り直せない body（FormData等）は再送しない', async () => {
    const { f, baseFetch } = build({ responses: [401, 200] });
    const r = await f(REST, userInit({ body: new FormData() }));
    expect(r.status).toBe(401);
    expect(baseFetch).toHaveBeenCalledTimes(1);
  });

  it('401が同時に複数返っても更新は1回にまとめる', async () => {
    const { f, refreshSession } = build({ responses: [401, 401, 401, 200, 200, 200] });
    const rs = await Promise.all([f(REST, userInit()), f(REST, userInit()), f(REST, userInit())]);
    expect(rs.map(r => r.status)).toEqual([200, 200, 200]);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });
});
