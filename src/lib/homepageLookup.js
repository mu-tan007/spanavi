// Older function deployments and unverified AI candidates must never auto-fill a HP field.
export function verifiedHomepageResult(result) {
  if (result?.verified === true && result?.confidence === 'high' && typeof result?.url === 'string') {
    try {
      const url = new URL(result.url);
      if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return result;
    } catch { /* fall through to an unconfirmed result */ }
  }
  return {
    url: null, verified: false, confidence: 'low',
    reason: typeof result?.reason === 'string' ? result.reason : '対象企業との一致を確認できませんでした',
  };
}
