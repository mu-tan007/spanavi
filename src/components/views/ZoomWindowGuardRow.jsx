import { useEffect, useRef, useState } from 'react';
import { color, font, radius } from '../../constants/design';
import { Button } from '../ui';

// マイページ「連携 / 通知設定」の1行：Zoomの画面よけ（Windows）
// -----------------------------------------------------------------------------
// 発信（zoomphonecall://）のたびに Zoom の通話画面が架電画面に重なる。Zoom の設定では止められない
// （2026-10-02 Zoomサポートにも確認中）ので、発信の直後に出た画面を最小化する AutoHotkey の設定ファイルを配る。
// 中身は Phalanx のヘルプ「Zoomの画面よけ」と同じ（dorayaki-portal の tools/zoom-window-guard）。
// むー様 2026-10-04「インターン生も毎回 Zoom の画面が立ち上がるのは嫌だと言っている」。
//
// ⚠️ 配布ファイルは名前に版を入れ、中身を変えたら版を上げて新しい名前で置く（古いキャッシュを掴ませない）。
//    改行を変換させない（.gitattributes の -text）。文字コードは UTF-8（BOM付き）。
// ⚠️ Windows だけ。Mac では動かない。
const GUARD_FILE = '/downloads/zoom-window-guard-1.1.4.ahk';

const STEPS = [
  ['AutoHotkey v2（無料）を、公式サイトから入れます。', 'https://www.autohotkey.com/'],
  ['下のボタンで、設定ファイルをダウンロードします。'],
  ['ダウンロードした設定ファイルを、ダブルクリックします。'],
  ['右下に「入れ終わりました」と出れば完了です。PCを起動するたびに、自動で動きます。'],
];

// 保存名は版を外した zoom-window-guard.ahk（記録の名前 zoom-window-guard.log とそろえる）。
function download() {
  const a = document.createElement('a');
  a.href = GUARD_FILE;
  a.download = 'zoom-window-guard.ahk';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// openOnMount … 起動時の案内（ZoomGuardNotice）の「設定方法を見る」から来たとき。入れ方を開いて、この行まで送る。
export default function ZoomWindowGuardRow({ openOnMount = false }) {
  const [open, setOpen] = useState(openOnMount);
  const rowRef = useRef(null);
  // ⚠️ すでにマイページを開いているときに案内から来ても開く（作り直されないので、初期値だけでは開かない）。
  useEffect(() => {
    if (!openOnMount) return;
    setOpen(true);
    rowRef.current?.scrollIntoView?.({ block: 'center' });
  }, [openOnMount]);
  const small = { fontSize: font.size.xs - 1, color: color.textLight, lineHeight: 1.7 };
  return (
    <div ref={rowRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: font.size.sm, color: color.textDark, fontWeight: font.weight.semibold }}>Zoomの画面よけ（Windows）</div>
          <div style={{ ...small, marginTop: 2 }}>発信のたびに出るZoomの通話画面を、自動でしまう</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? '入れ方を閉じる' : '入れ方'}
          </Button>
          <Button size="sm" onClick={download}>設定ファイルをダウンロード</Button>
        </div>
      </div>
      {open && (
        <div style={{ marginTop: 10, padding: '10px 14px', background: color.offWhite, borderRadius: radius.lg }}>
          <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', fontSize: font.size.xs, color: color.textDark, lineHeight: 1.8 }}>
            {STEPS.map(([text, href], i) => (
              <li key={text}>
                {i + 1}. {text}
                {href && <> <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: color.navy }}>www.autohotkey.com</a></>}
              </li>
            ))}
          </ol>
          <div style={{ ...small, marginTop: 8 }}>
            管理者の権限が無いPCでは、AutoHotkey の「Install mode」で「Current user」を選びます。<br />
            電話をかけた直後に出た画面だけをしまいます。<br />
            着信の知らせとミーティングの画面はしまいません。<br />
            Zoomの画面を自分で開けば、その通話の画面はしまわなくなります。<br />
            Ctrl+Alt+Z で一時停止と再開ができます。<br />
            ダウンロードしたファイルは、消して構いません。<br />
            前の手順で入れた方も、新しい設定ファイルをダブルクリックすれば入れ替わります。<br />
            Macでは動きません。
          </div>
        </div>
      )}
    </div>
  );
}
