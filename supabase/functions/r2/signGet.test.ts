import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let handler: (request: Request) => Promise<Response>;
let network: ReturnType<typeof vi.fn>;
const request = (kind = 'recordings', loggedIn = true) => new Request('https://fixture.example/r2', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(loggedIn ? { Authorization: `Bearer fixture.${btoa(JSON.stringify({ sub: 'fixture-member' }))}.fixture` } : {}) },
  body: JSON.stringify({ action: 'sign-get', kind, key: 'fixture.m4a', expires: 3600 }),
});

beforeEach(async () => {
  vi.resetModules();
  const settings: Record<string, string> = {
    SUPABASE_URL: 'https://fixture.example', SUPABASE_SERVICE_ROLE_KEY: 'fixture-key',
    R2_ACCOUNT_ID: 'fixture-account', R2_ACCESS_KEY_ID: 'fixture-access', R2_SECRET_ACCESS_KEY: 'fixture-secret',
    R2_BUCKET_RECORDINGS: 'recordings', R2_BUCKET_SPACAREER: 'spacareer',
  };
  vi.stubGlobal('Deno', { env: { get: (key: string) => settings[key] }, serve: (callback: typeof handler) => { handler = callback; } });
  network = vi.fn();
  vi.stubGlobal('fetch', network);
  await import('./index.ts');
});
afterEach(() => vi.unstubAllGlobals());

describe('R2再生URL発行の権限と往復回数', () => {
  it('未ログインはR2にも権限DBにもアクセスしない', async () => {
    expect((await handler(request('recordings', false))).status).toBe(401);
    expect(network).not.toHaveBeenCalled();
  });
  it('権限がない録音はR2の存在確認より前に拒否する', async () => {
    network.mockResolvedValue(new Response('false', { headers: { 'Content-Type': 'application/json' } }));
    expect((await handler(request())).status).toBe(403);
    expect(network).toHaveBeenCalledTimes(1);
    expect(String(network.mock.calls[0][0])).toContain('/rpc/may_read_r2_key');
  });
  it('権限照合後の1回のGETだけで録音URL・全体サイズ・MP3補正を返す', async () => {
    network.mockResolvedValueOnce(new Response('true')).mockResolvedValueOnce(new Response(new Uint8Array([0xff,0xfb,1]), {
      status: 206, headers: { 'Content-Range': 'bytes 0-2/45000', 'Content-Length': '3' },
    }));
    const response = await handler(request());
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result).toMatchObject({ ok: true, size: '45000' });
    const url = new URL(result.url);
    expect(url.searchParams.get('response-content-type')).toBe('audio/mpeg');
    expect(url.searchParams.get('response-content-disposition')).toBe('inline; filename="fixture.mp3"');
    expect(network).toHaveBeenCalledTimes(2);
    expect(String(network.mock.calls[0][0])).toContain('/rpc/may_read_r2_key');
    expect(network.mock.calls[1][1]).toEqual({ headers: { Range: 'bytes=0-11' } });
  });
  it('講義録画は権限照合と従来HEADだけを実行する', async () => {
    network.mockResolvedValueOnce(new Response('true')).mockResolvedValueOnce(new Response(null, { headers: { 'content-length': '89000' } }));
    const result = await (await handler(request('spacareer'))).json();
    expect(result).toMatchObject({ ok: true, size: '89000' });
    expect(new URL(result.url).searchParams.has('response-content-type')).toBe(false);
    expect(network).toHaveBeenCalledTimes(2);
    expect(network.mock.calls[1][1].method).toBe('HEAD');
  });
  it.each([403,404])('R2の%sを記録し、再生署名を返さない', async status => {
    network.mockResolvedValueOnce(new Response('true')).mockResolvedValueOnce(new Response(null, { status }));
    const response = await handler(request());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: 'R2にありません', status });
    expect(network).toHaveBeenCalledTimes(2);
  });
  it('空オブジェクトの416はHEADで確認して従来の空ファイル応答を保つ', async () => {
    network.mockResolvedValueOnce(new Response('true'))
      .mockResolvedValueOnce(new Response(null, { status: 416 }))
      .mockResolvedValueOnce(new Response(null, { headers: { 'content-length': '0' } }));
    const result = await (await handler(request())).json();
    expect(result).toMatchObject({ ok: true, size: '0' });
    expect(network).toHaveBeenCalledTimes(3);
    expect(network.mock.calls[2][1].method).toBe('HEAD');
  });
  it.each(['network', '503'])('%sのRange失敗後、HEADも通信例外ならハンドラーがエラー応答を返す', async failure => {
    network.mockResolvedValueOnce(new Response('true'));
    if (failure === 'network') network.mockRejectedValueOnce(new Error('range offline'));
    else network.mockResolvedValueOnce(new Response(null, { status: 503 }));
    network.mockRejectedValueOnce(new Error('head offline'));
    const response = await handler(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false });
    expect(network).toHaveBeenCalledTimes(3);
    expect(network.mock.calls[2][1].method).toBe('HEAD');
  });
});
