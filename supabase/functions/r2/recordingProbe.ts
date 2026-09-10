type HeadResult = { ok: boolean; status: number; size: string | null };
export type ProbeResult = HeadResult & { as?: { type: string; filename: string } };

// Keep only the signature bytes, including when an upstream ignores Range and returns 200.
// Cancelling the reader stops further consumption; never arrayBuffer() the whole recording.
async function readPrefix(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const prefix = new Uint8Array(12);
  let length = 0;
  try {
    while (length < prefix.length) {
      const { done, value } = await reader.read();
      if (done) break;
      const take = Math.min(value.length, prefix.length - length);
      prefix.set(value.subarray(0, take), length);
      length += take;
    }
  } catch {
    return new Uint8Array(0);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return prefix.subarray(0, length);
}

/** Called only after mayRead. A successful range proves existence AND supplies the audio type. */
export async function probeRecording(
  url: string, key: string, fallbackHead: () => Promise<HeadResult>, fetcher: typeof fetch = fetch,
): Promise<ProbeResult> {
  let response: Response;
  try {
    response = await fetcher(url, { headers: { Range: 'bytes=0-11' } });
  } catch {
    // Previously a successful HEAD still allowed playback when the optional sniff failed.
    return await fallbackHead();
  }
  if (response.status !== 200 && response.status !== 206) {
    await response.body?.cancel().catch(() => {});
    // Empty objects reject a Range request; HEAD retains the existing zero-byte behavior.
    if (response.status === 416 || response.status >= 500) return await fallbackHead();
    return { ok: false, status: response.status, size: null };
  }
  const prefix = await readPrefix(response);
  const range = response.headers.get('content-range');
  const total = range?.match(/^bytes\s+0-\d+\/(\d+)$/i)?.[1];
  const length = response.headers.get('content-length');
  // For 206, Content-Length is only the prefix length, not the recording size.
  const size = response.status === 206 ? total : length && /^\d+$/.test(length) ? length : null;
  const result = size == null || prefix.length === 0
    ? await fallbackHead()
    : { ok: true, status: response.status, size };
  if (!result.ok) return result;
  const isMp3 = (prefix.length >= 3 && prefix[0] === 0x49 && prefix[1] === 0x44 && prefix[2] === 0x33)
    || (prefix.length >= 2 && prefix[0] === 0xff && (prefix[1] & 0xe0) === 0xe0);
  return {
    ...result,
    ...(isMp3 ? { as: { type: 'audio/mpeg', filename: `${key.replace(/\.[^.]+$/, '')}.mp3` } } : {}),
  };
}
