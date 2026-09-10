import { describe, expect, it, vi } from 'vitest';
import { probeRecording } from './recordingProbe.ts';

describe('録音の存在確認と音声型確認をまとめる範囲GET', () => {
  it.each([[[0x49, 0x44, 0x33]], [[0xff, 0xfb]]])('MP3署名 %j を1往復で判別し、部分サイズではなく全体サイズを返す', async bytes => {
    const get = vi.fn().mockResolvedValue(new Response(new Uint8Array(bytes), { status: 206, headers: { 'content-range': 'bytes 0-11/123456', 'content-length': '12' } }));
    const head = vi.fn();
    expect(await probeRecording('https://fixture.example/audio', 'original.m4a', head, get)).toEqual({
      ok: true, status: 206, size: '123456', as: { type: 'audio/mpeg', filename: 'original.mp3' },
    });
    expect(get).toHaveBeenCalledExactlyOnceWith('https://fixture.example/audio', { headers: { Range: 'bytes=0-11' } });
    expect(head).not.toHaveBeenCalled();
  });

  it('本物のMP4の型・ファイル名は変更しない', async () => {
    const get = vi.fn().mockResolvedValue(new Response(new Uint8Array([0,0,0,20,102,116,121,112,77,52,65,32]), { status: 206, headers: { 'content-range': 'bytes 0-11/12000' } }));
    expect(await probeRecording('https://fixture.example/audio', 'original.m4a', vi.fn(), get)).toEqual({ ok: true, status: 206, size: '12000' });
  });

  it('先頭署名が複数チャンクに分かれて届いても正しく判別する', async () => {
    const chunks = [new Uint8Array([0x49]), new Uint8Array([0x44]), new Uint8Array([0x33,0,0])];
    const response = new Response(new ReadableStream({ pull(controller) {
      const next = chunks.shift();
      if (next) controller.enqueue(next); else controller.close();
    } }), { status: 206, headers: { 'content-range': 'bytes 0-4/50000' } });
    const result = await probeRecording('https://fixture.example/audio', 'original.m4a', vi.fn(), vi.fn().mockResolvedValue(response));
    expect(result).toMatchObject({ size: '50000', as: { type: 'audio/mpeg', filename: 'original.mp3' } });
  });

  it('Range無視の200応答でも先頭だけ保持し、ストリームをキャンセルする', async () => {
    const cancel = vi.fn();
    const bytes = new Uint8Array(65536); bytes.set([0x49,0x44,0x33]);
    const pull = vi.fn(controller => controller.enqueue(bytes));
    const response = new Response(new ReadableStream({ pull, cancel }, { highWaterMark: 0 }), { headers: { 'content-length': '99999999' } });
    const head = vi.fn();
    const result = await probeRecording('https://fixture.example/audio', 'original.mp4', head, vi.fn().mockResolvedValue(response));
    expect(result).toMatchObject({ ok: true, size: '99999999', as: { type: 'audio/mpeg' } });
    expect(pull).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(head).not.toHaveBeenCalled();
  });

  it.each([403,404])('取得失敗 %s は成功扱いにせず本文を破棄する', async status => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), { status });
    const head = vi.fn();
    expect(await probeRecording('https://fixture.example/audio', 'x.m4a', head, vi.fn().mockResolvedValue(response))).toEqual({ ok: false, status, size: null });
    expect(head).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each(['empty', '416', 'missing-total'])('%sは従来のHEADで存在とサイズを確認する', async scenario => {
    const response = scenario === '416' ? new Response(null, { status: 416 })
      : scenario === 'empty' ? new Response(null, { headers: { 'content-length': '0' } })
      : new Response(new Uint8Array([1,2,3]), { status: 206, headers: { 'content-length': '3' } });
    const head = vi.fn().mockResolvedValue({ ok: true, status: 200, size: scenario === 'missing-total' ? '1200' : '0' });
    expect(await probeRecording('https://fixture.example/audio', 'x.m4a', head, vi.fn().mockResolvedValue(response))).toEqual(await head.mock.results[0].value);
    expect(head).toHaveBeenCalledOnce();
  });

  it('Range不可時もHEADの403を保持する', async () => {
    const head = vi.fn().mockResolvedValue({ ok: false, status: 403, size: null });
    expect(await probeRecording('https://fixture.example/audio', 'x.m4a', head, vi.fn().mockResolvedValue(new Response(null, { status: 416 })))).toEqual({ ok: false, status: 403, size: null });
  });

  it.each(['network', '500', '503'])('%sでもHEADで存在を確認できれば従来どおり未補正の署名へ進める', async failure => {
    const head = vi.fn().mockResolvedValue({ ok: true, status: 200, size: '75000' });
    const get = failure === 'network' ? vi.fn().mockRejectedValue(new Error('offline'))
      : vi.fn().mockResolvedValue(new Response(null, { status: Number(failure) }));
    expect(await probeRecording('https://fixture.example/audio', 'x.m4a', head, get)).toEqual({ ok: true, status: 200, size: '75000' });
    expect(head).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledOnce();
  });

  it.each(['network', '500', '503'])('%sの後のHEADも失敗したらその結果を保ち再試行しない', async failure => {
    const head = vi.fn().mockResolvedValue({ ok: false, status: 403, size: null });
    const get = failure === 'network' ? vi.fn().mockRejectedValue(new Error('offline'))
      : vi.fn().mockResolvedValue(new Response(null, { status: Number(failure) }));
    expect(await probeRecording('https://fixture.example/audio', 'x.m4a', head, get)).toEqual({ ok: false, status: 403, size: null });
    expect(head).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledOnce();
  });
});
