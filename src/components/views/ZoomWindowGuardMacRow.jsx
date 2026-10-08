import { useEffect, useRef, useState } from 'react';
import { color, font, radius } from '../../constants/design';
import { Button } from '../ui';

// マイページ「連携 / 通知設定」の1行：Zoomの画面よけ（Mac）
// -----------------------------------------------------------------------------
// Windows 版（ZoomWindowGuardRow・AutoHotkey）と同じことを、Mac の Hammerspoon で行う。
// むー様 2026-10-08「インターン生の中には Mac を使っている人もいるから、彼らにも渡したい」。
//
// ⚠️ Mac はダウンロードしたファイルをダブルクリックで動かすと Gatekeeper に止められる（作り手の署名が無いため）。
//    ターミナルに1行貼る形なら止められず、Hammerspoon も公式の置き場から入る。
// ⚠️ アクセシビリティの許可だけは本人が手でオンにする（Apple の決まりで、ファイルからは代われない）。
// ⚠️ 入れる1行（GUARD_SCRIPT）の名前は固定。本体の版は public/downloads/zoom-window-guard-mac.sh の VERSION で上げる。
export const GUARD_SCRIPT = '/downloads/zoom-window-guard-mac.sh';
export const installCommand = (origin) => `curl -fsSL ${origin}${GUARD_SCRIPT} | bash`;

const STEPS = [
  '下のボタンで、入れるための1行をコピーします。',
  '「ターミナル」を開きます（Command＋スペースで「ターミナル」と入力）。',
  'コピーした1行を貼り付けて、Enterを押します。',
  '「アクセシビリティ」の画面が開いたら、Hammerspoon をオンにします。',
  '画面の右上に「Z」が出れば完了です。Macを起動するたびに、自動で動きます。',
];

// openOnMount … 起動時の案内（ZoomGuardNotice）の「設定方法を見る」から来たとき。入れ方を開いて、この行まで送る。
export default function ZoomWindowGuardMacRow({ openOnMount = false }) {
  const [open, setOpen] = useState(openOnMount);
  const rowRef = useRef(null);
  useEffect(() => {
    if (!openOnMount) return;
    setOpen(true);
    rowRef.current?.scrollIntoView?.({ block: 'center' });
  }, [openOnMount]);
  const [copied, setCopied] = useState(false);
  const command = installCommand(typeof window !== 'undefined' ? window.location.origin : 'https://spanavi.jp');
  const copy = async () => {
    setOpen(true);
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* コピーできないブラウザでは、開いた入れ方の1行を手で選んでもらう */ }
  };
  const small = { fontSize: font.size.xs - 1, color: color.textLight, lineHeight: 1.7 };
  return (
    <div ref={rowRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: font.size.sm, color: color.textDark, fontWeight: font.weight.semibold }}>Zoomの画面よけ（Mac）</div>
          <div style={{ ...small, marginTop: 2 }}>発信のたびに出るZoomの通話画面を、自動でしまう</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? '入れ方を閉じる' : '入れ方'}
          </Button>
          <Button size="sm" onClick={copy}>{copied ? 'コピーしました' : '入れる1行をコピー'}</Button>
        </div>
      </div>
      {open && (
        <div style={{ marginTop: 10, padding: '10px 14px', background: color.offWhite, borderRadius: radius.lg }}>
          <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', fontSize: font.size.xs, color: color.textDark, lineHeight: 1.8 }}>
            {STEPS.map((text, i) => <li key={text}>{i + 1}. {text}</li>)}
          </ol>
          <code style={{
            display: 'block', marginTop: 8, padding: '6px 10px', background: color.white, borderRadius: radius.md,
            fontSize: font.size.xs - 1, color: color.textDark, userSelect: 'all', wordBreak: 'break-all',
          }}>{command}</code>
          <div style={{ ...small, marginTop: 8 }}>
            Hammerspoon（無料）も一緒に入ります。<br />
            電話をかけた直後に出た画面だけをしまいます。<br />
            着信の知らせとミーティングの画面はしまいません。<br />
            DockのZoomを押せば、隠したZoomを開けます。<br />
            Control＋Option＋Z で一時停止と再開ができます。<br />
            新しい版も、同じ1行で入れ替わります。<br />
            効かないときは、Control＋Option＋L で記録をコピーし、Slackに貼ってください。
          </div>
        </div>
      )}
    </div>
  );
}
