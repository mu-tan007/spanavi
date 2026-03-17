// ============================================================
// 電話発信ユーティリティ（Zoom Phone Smart Embed）
// ============================================================
import { zoomPhone } from '../lib/zoomPhoneStore';

export const dialPhone = (phoneNumber) => {
  if (!phoneNumber) return;
  const num = phoneNumber.replace(/[-\s]/g, "");
  console.log('[dialPhone] zp-make-call:', num);
  zoomPhone.makeCall(num);
};
