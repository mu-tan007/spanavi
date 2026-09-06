export const APPOINTMENTS_CHANGED_EVENT = 'spanavi:appointments-changed';

// 保存完了を同じ画面内のカレンダーへ通知する。通知の不調でDB保存を失敗扱いにしない。
export function notifyAppointmentsChanged(detail = {}) {
  try {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    window.dispatchEvent(new CustomEvent(APPOINTMENTS_CHANGED_EVENT, { detail }));
  } catch (error) {
    console.warn('[Appointments] 更新通知に失敗しました:', error);
  }
}
