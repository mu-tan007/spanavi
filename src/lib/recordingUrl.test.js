import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ session: null, org: 'org-a', listener: null,
  invoke: vi.fn(), getSession: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: {
  functions: { invoke: state.invoke }, auth: {
    getSession: state.getSession,
    onAuthStateChange: vi.fn(fn => { state.listener = fn; return { data: { subscription: { unsubscribe() {} } } }; }),
  },
} }));
vi.mock('./orgContext', () => ({ getOrgId: () => state.org }));
const oldUrl = 'https://app.example/storage/v1/object/public/recordings/call.mp4';
const shareUrl = 'https://app.example/functions/v1/rec/call.mp4?s=fixture';
const success = url => ({ data: { ok: true, url }, error: null });
let resolve;
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  state.session = { user: { id: 'user-a' }, access_token: 'fixture-token-a' };
  state.org = 'org-a';
  state.getSession.mockImplementation(async () => ({ data: { session: state.session } }));
  state.invoke.mockResolvedValue(success('https://signed.example/audio'));
  ({ resolveRecordingUrl: resolve } = await import('./recordingUrl'));
});
afterEach(() => vi.useRealTimers());

describe('recording signature request sharing', () => {
  it('shares concurrent equivalent recording keys and retains successful 50-minute cache', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => resolve(i % 2 ? oldUrl : shareUrl)));
    expect(state.invoke).toHaveBeenCalledTimes(1);
    expect(state.invoke).toHaveBeenCalledWith('r2', { body: { action: 'sign-get', kind: 'recordings', key: 'call.mp4', expires: 3600 } });
    expect(results.every(r => r.url === 'https://signed.example/audio')).toBe(true);
    await resolve(oldUrl);
    expect(state.invoke).toHaveBeenCalledTimes(1);
  });
  it('does not combine different recordings', async () => {
    await Promise.all([resolve(oldUrl), resolve(oldUrl.replace('call.mp4', 'other.mp4'))]);
    expect(state.invoke).toHaveBeenCalledTimes(2);
  });
  it('leaves external URLs unchanged without any signing or session access', async () => {
    expect(await resolve('https://zoom.us/audio')).toEqual({ url: 'https://zoom.us/audio', gone: false, external: true });
    expect(state.invoke).not.toHaveBeenCalled(); expect(state.getSession).not.toHaveBeenCalled();
  });
  it('does not share/cache failed or rejected requests; retries can succeed', async () => {
    state.invoke.mockResolvedValueOnce({ data: null, error: new Error('denied') });
    expect((await resolve(oldUrl)).url).toBeNull();
    state.invoke.mockRejectedValueOnce(new Error('network'));
    await expect(resolve(oldUrl)).rejects.toThrow('network');
    expect((await resolve(oldUrl)).url).toBeTruthy();
    expect(state.invoke).toHaveBeenCalledTimes(3);
  });
  it('expires the cache at 50 minutes without extending the signed URL lifetime', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-10T00:00:00Z'));
    await resolve(oldUrl);
    vi.setSystemTime(new Date('2026-09-10T00:50:00Z'));
    await resolve(oldUrl);
    expect(state.invoke).toHaveBeenCalledTimes(2);
  });
  it.each(['user', 'org', 'refresh', 'permissions', 'logout'])('invalidates success cache on %s change', async kind => {
    await resolve(oldUrl);
    if (kind === 'user') state.session = { user: { id: 'user-b' }, access_token: 'fixture-b' };
    if (kind === 'org') state.org = 'org-b';
    if (kind === 'refresh') state.session = { ...state.session, access_token: 'fixture-refreshed' };
    if (kind === 'permissions') state.listener('USER_UPDATED', state.session);
    if (kind === 'logout') { state.session = null; state.listener('SIGNED_OUT', null); }
    const result = await resolve(oldUrl);
    expect(state.invoke).toHaveBeenCalledTimes(kind === 'logout' ? 1 : 2);
    if (kind === 'logout') expect(result.url).toBeNull();
  });
  it.each(['logout', 'org', 'user'])('discards a late response after %s change', async kind => {
    let finish;
    state.invoke.mockImplementationOnce(() => new Promise(r => { finish = r; }));
    const pending = resolve(oldUrl);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    if (kind === 'logout') { state.session = null; state.listener('SIGNED_OUT', null); }
    if (kind === 'org') state.org = 'org-b';
    if (kind === 'user') state.session = { user: { id: 'user-b' }, access_token: 'fixture-b' };
    finish(success('https://signed.example/old-user'));
    expect((await pending).url).toBeNull();
    if (kind !== 'logout') {
      expect((await resolve(oldUrl)).url).toBe('https://signed.example/audio');
      expect(state.invoke).toHaveBeenCalledTimes(2);
    }
  });
  it('old completion cannot delete a new session request with the same key', async () => {
    let finishOld, finishNew;
    state.invoke.mockImplementationOnce(() => new Promise(r => { finishOld = r; }))
      .mockImplementationOnce(() => new Promise(r => { finishNew = r; }));
    const old = resolve(oldUrl);
    await vi.waitFor(() => expect(finishOld).toBeTypeOf('function'));
    state.session = { user: { id: 'user-b' }, access_token: 'fixture-b' };
    state.listener('SIGNED_IN', state.session);
    const newer = resolve(oldUrl);
    await vi.waitFor(() => expect(finishNew).toBeTypeOf('function'));
    finishOld(success('https://signed.example/old'));
    expect((await old).url).toBeNull();
    const joined = resolve(oldUrl);
    finishNew(success('https://signed.example/new'));
    expect((await newer).url).toBe('https://signed.example/new');
    expect((await joined).url).toBe('https://signed.example/new');
    expect(state.invoke).toHaveBeenCalledTimes(2);
  });
});
