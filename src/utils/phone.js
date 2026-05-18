// ============================================================
// 電話発信ユーティリティ（Zoom Phone）
// ============================================================
// 入力番号を正規化（全角→半角、不可視文字除去、数字と+のみ抽出）
const normalizePhone = (raw) => {
  if (!raw) return '';
  let s = String(raw);
  s = s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  s = s.replace(/　/g, '');
  s = s.replace(/[​-‍﻿]/g, '');
  return s.replace(/[^\d+]/g, '');
};

export const dialPhone = (phoneNumber) => {
  const num = normalizePhone(phoneNumber);
  if (!num) {
    console.warn('[dialPhone] 無効な電話番号:', phoneNumber);
    return;
  }
  const uri = 'zoomphonecall://' + num;
  console.log('[dialPhone]', uri);
  // window.location.href 経路（Zoom Phone公式推奨、pop-up blockerの影響を受けにくい）
  try {
    window.location.href = uri;
  } catch (e) {
    console.error('[dialPhone] location.href 失敗、a.click() にフォールバック:', e);
    const a = document.createElement('a');
    a.href = uri;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
};
