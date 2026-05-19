// =====================================================================
// fetchPageText: 任意 URL の HTML を取得しタグ・スクリプトを除去して
// プレーンテキストを返すヘルパー。extract-company-from-url から切り出し、
// generate-company-dossier でも再利用する。
// =====================================================================

export const USER_AGENT =
  'Mozilla/5.0 (compatible; SpanaviCompanyInfoBot/1.0; +https://spanavi.app)';

/**
 * HTML を取得しタグ・script・style・コメントを除去したテキストを返す。
 * 失敗時は空文字を返す（呼び出し側で長さチェックして弾く想定）。
 */
export async function fetchPageText(url: string, timeoutMs = 12000): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,*/*;q=0.8',
        'Accept-Language': 'ja,en;q=0.8',
      },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (!res.ok) return '';
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) return '';
    const html = await res.text();
    return html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

/**
 * 入力 URL + 同一ドメインの会社概要系サブパスを並列取得。
 * 他社情報の混入を防ぐためドメインを限定する。
 */
export async function fetchCompanyPagesFromDomain(
  url: string,
  opts: { timeoutMs?: number; minLength?: number; maxBytesPerPage?: number; totalCap?: number } = {},
): Promise<{ url: string; text: string }[]> {
  const timeoutMs = opts.timeoutMs ?? 12000;
  const minLength = opts.minLength ?? 300;
  const maxBytesPerPage = opts.maxBytesPerPage ?? 8000;
  const totalCap = opts.totalCap ?? 40000;

  let parsedUrl: URL;
  try { parsedUrl = new URL(url); } catch { return []; }
  const origin = parsedUrl.origin;

  const subPaths = ['/company/', '/about/', '/corporate/', '/profile/', '/about-us/', '/company', '/about', '/ir/'];
  const candidates = new Set<string>([url]);
  for (const p of subPaths) candidates.add(origin + p);

  const fetched = await Promise.all(
    [...candidates].map(u => fetchPageText(u, timeoutMs).then(text => ({ url: u, text }))),
  );
  const pages = fetched.filter(p => p.text.length >= minLength);

  // ページあたり maxBytesPerPage、合計 totalCap に丸める
  let total = 0;
  const capped: { url: string; text: string }[] = [];
  for (const p of pages) {
    if (total >= totalCap) break;
    const remaining = totalCap - total;
    const slice = p.text.slice(0, Math.min(maxBytesPerPage, remaining));
    capped.push({ url: p.url, text: slice });
    total += slice.length;
  }
  return capped;
}
