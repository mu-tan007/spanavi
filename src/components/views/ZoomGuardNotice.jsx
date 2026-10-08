import { useEffect, useState } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button } from '../ui';

// 起動のたびに画面の中央に出す案内：Zoomの画面よけの設定方法はこちら
// -----------------------------------------------------------------------------
// むー様 2026-10-04「どのインターン生も入れるべき。ログインや立ち上げのたびに中央に出す。新しいメンバーにも。
// 『今後表示しない』のチェックを付けて、よくある広告のように」。
// 押すとマイページの「Zoomの画面よけ（Windows）」の入れ方を開く（ZoomWindowGuardRow）。
//
// ⚠️ 出すのは Windows のPCだけ。画面よけは Windows でしか動かない（Mac・スマホに出しても入れられない）。
// ⚠️ 「今後表示しない」はこのPCのブラウザに覚える（localStorage・人ごと）。画面よけはPCごとに入れるものなので、
//    別のPCで開いたときはまた出る（そのPCにも入れてもらうため）。
// ⚠️ 出すのは SpanaviAppInner が立ち上がったとき1回だけ（ログイン・再読み込み・起動）。タブを移っても出し直さない。
export const zoomGuardHiddenKey = (userId) => `spanavi_zoomguard_notice_hidden_v1:${userId || 'anon'}`;

export function isWindowsPc() {
  if (typeof navigator === 'undefined') return false;
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  return /win/i.test(platform) || /Windows NT/.test(navigator.userAgent || '');
}

export function isMacPc() {
  if (typeof navigator === 'undefined') return false;
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  // ⚠️ iPad も「Mac」と名乗るので、触れる画面（maxTouchPoints）があるものは外す。
  return /mac/i.test(platform) && !(navigator.maxTouchPoints > 1);
}

function readHidden(userId) {
  try { return localStorage.getItem(zoomGuardHiddenKey(userId)) === '1'; } catch { return false; }
}

function writeHidden(userId) {
  try { localStorage.setItem(zoomGuardHiddenKey(userId), '1'); } catch { /* 覚えられないPCでは次も出す */ }
}

export default function ZoomGuardNotice({ userId, onOpenGuide }) {
  const [open, setOpen] = useState(() => isWindowsPc() && !readHidden(userId));
  const [dontShow, setDontShow] = useState(false);

  const close = (openGuide) => {
    if (dontShow) writeHidden(userId);
    setOpen(false);
    if (openGuide) onOpenGuide?.();
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 20050, background: alpha(color.navyDeep, 0.5),
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: space[4],
    }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="zoom-guard-notice-title"
        style={{
          width: 'min(440px, 100%)', background: color.white, borderRadius: radius.lg,
          boxShadow: shadow.xl, overflow: 'hidden',
        }}
      >
        <div style={{ background: color.navy, color: color.white, padding: '14px 20px' }}>
          <div id="zoom-guard-notice-title" style={{ fontSize: font.size.md, fontWeight: font.weight.bold }}>
            Zoomの画面よけの設定方法はこちら
          </div>
        </div>
        <div style={{ padding: '18px 20px', fontSize: font.size.sm, color: color.textDark, lineHeight: 1.8 }}>
          <div>発信のたびに出るZoomの通話画面を、自動でしまえます。</div>
          <div>架電画面が隠れなくなります。</div>
          <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: space[2] }}>
            設定はマイページの「連携 / 通知設定」からできます。
          </div>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: space[4],
            fontSize: font.size.xs, color: color.textMid, cursor: 'pointer', width: 'fit-content',
          }}>
            <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
            今後表示しない
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space[2], padding: '0 20px 18px' }}>
          <Button variant="outline" onClick={() => close(false)}>閉じる</Button>
          <Button onClick={() => close(true)} autoFocus>設定方法を見る</Button>
        </div>
      </div>
    </div>
  );
}
