import { useEffect, useRef, useState } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button } from '../ui';

// 切電のキー（Zoom の Ctrl+Shift+E）を使ってもらうための案内
// -----------------------------------------------------------------------------
// むー様 2026-10-08「ショートカットを使っていない人を感知したら推奨し、設定にも飛べるようにしてほしい」。
// 出すのは2つ：
//   ① 届いていない … Spanavi に Ctrl+Shift+E が届いた＝Zoom がキーを受け取っていない（「グローバル」が未設定）。
//      グローバルが入っていれば Zoom が先に受け取り、ブラウザには届かない。押したのに切れていない人なので、すぐ出す。
//   ② 使っていない … 発信の後、ブラウザから別の画面へ移って2秒以上戻らなかった＝Zoom を開いて手で切ったとみなす（推測）。
//      1日に3回たまったら出す。出すのは1日1回まで。「今後表示しない」で止められる。
// ⚠️ Zoom の設定画面を外から開く仕組みは無い（Zoom のリンクは会議の参加用だけ）。設定の手順をこの場で見せる。
// ⚠️ 発信は dialPhone（utils/dialPhone.js）が出す合図「spanavi:dial」で知る。発信ボタンごとに手を入れない。
// ⚠️ 覚える先はこのPCのブラウザ（localStorage・人ごと）。Zoom の設定もPCごとなので、それでよい。

const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent || '');
export const HANGUP_KEY = IS_MAC ? 'Control＋Shift＋E' : 'Ctrl＋Shift＋E';

export const DIAL_EVENT = 'spanavi:dial';
const AWAY_FROM_MS = 4000;      // 発信から4秒より前の切り替わりは、Zoom が前に出ただけ（画面よけが戻す）
const AWAY_UNTIL_MS = 180000;   // 発信から3分を過ぎた切り替わりは、通話と関係ない
const AWAY_MIN_MS = 2000;       // 2秒未満で戻ったのは、画面よけが戻したか、ちらっと見ただけ
const TIP_PER_DAY = 3;          // 手で切った回数がこれだけたまったら②を出す
const NOT_REACHED_GAP_MS = 10 * 60 * 1000;   // ①は10分に1回まで

const today = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
export const hangupKeys = (userId, day = today()) => ({
  count: `spanavi_hangup_manual_v1:${userId || 'anon'}:${day}`,
  shown: `spanavi_hangup_tip_shown_v1:${userId || 'anon'}:${day}`,
  hidden: `spanavi_hangup_tip_hidden_v1:${userId || 'anon'}`,
});
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* 覚えられないPCでは数えない */ } };

// 発信→離れた→戻った、を見て「手で切った」を数える。数えた結果②を出すなら true を返す。
export function createManualHangupCounter(userId, clock = () => Date.now()) {
  let dialAt = 0;
  let awayAt = 0;
  let counted = false;
  return {
    dial() { dialAt = clock(); awayAt = 0; counted = false; },
    away() {
      const t = clock();
      if (!dialAt || counted) return;
      const since = t - dialAt;
      if (since >= AWAY_FROM_MS && since <= AWAY_UNTIL_MS) awayAt = t;
    },
    back() {
      const t = clock();
      if (!awayAt) return false;
      const away = t - awayAt;
      awayAt = 0;
      if (away < AWAY_MIN_MS) return false;
      counted = true;
      const k = hangupKeys(userId);
      const n = Number(read(k.count) || 0) + 1;
      write(k.count, n);
      if (n < TIP_PER_DAY || read(k.shown) === '1' || read(k.hidden) === '1') return false;
      write(k.shown, '1');
      return true;
    },
  };
}

export const isHangupKey = (e) => e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey
  && (e.code === 'KeyE' || e.key === 'E' || e.key === 'e');

const STEPS = [
  'Zoom を開いて、右上の自分のアイコン →「設定」',
  '左の「キーボードショートカット」',
  '「通話を終了」の行の「グローバル」にチェック',
];

function Steps() {
  return (
    <ol style={{ margin: `${space[2]}px 0 0`, padding: '10px 14px', listStyle: 'none', background: color.offWhite, borderRadius: radius.md, fontSize: font.size.xs, lineHeight: 1.8 }}>
      {STEPS.map((s, i) => <li key={s}>{i + 1}. {s}</li>)}
    </ol>
  );
}

export default function HangupKeyCoach({ userId }) {
  const [mode, setMode] = useState(null);   // 'notReached' | 'tip' | null
  const [showSteps, setShowSteps] = useState(false);
  const [dontShow, setDontShow] = useState(false);
  const counterRef = useRef(null);
  const lastNotReachedRef = useRef(0);

  useEffect(() => {
    counterRef.current = createManualHangupCounter(userId);
    const open = (m) => { setMode(m); setShowSteps(m === 'notReached'); setDontShow(false); };
    const onDial = () => counterRef.current.dial();
    const onBlur = () => counterRef.current.away();
    const onFocus = () => { if (counterRef.current.back()) open('tip'); };
    // ⚠️ 入力欄にいても見る（メモを書きながら押す人もいる）。ほかのキーの処理より先に受け取る。
    const onKeyDown = (e) => {
      if (!isHangupKey(e)) return;
      e.preventDefault();
      const t = Date.now();
      if (t - lastNotReachedRef.current < NOT_REACHED_GAP_MS) return;
      lastNotReachedRef.current = t;
      open('notReached');
    };
    window.addEventListener(DIAL_EVENT, onDial);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener(DIAL_EVENT, onDial);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [userId]);

  if (!mode) return null;
  const close = () => {
    if (mode === 'tip' && dontShow) write(hangupKeys(userId).hidden, '1');
    setMode(null);
  };
  const notReached = mode === 'notReached';
  return (
    <div onClick={close} style={{
      position: 'fixed', inset: 0, zIndex: 20060, background: alpha(color.navyDeep, 0.5),
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: space[4],
    }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hangup-coach-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(440px, 100%)', background: color.white, borderRadius: radius.lg, boxShadow: shadow.xl, overflow: 'hidden' }}
      >
        <div style={{ background: color.navy, color: color.white, padding: '14px 20px' }}>
          <div id="hangup-coach-title" style={{ fontSize: font.size.md, fontWeight: font.weight.bold }}>
            {notReached ? '切電のキーがZoomに届いていません' : '切電はキーでできます'}
          </div>
        </div>
        <div style={{ padding: '18px 20px', fontSize: font.size.sm, color: color.textDark, lineHeight: 1.8 }}>
          {notReached ? (
            <>
              <div>{HANGUP_KEY} が、Zoomではなく Spanavi に届きました。</div>
              <div>このままでは、Zoomが後ろにあるときに通話を切れません。</div>
              <div>Zoomの設定を1つ変えてください。</div>
            </>
          ) : (
            <>
              <div>Zoomを開かなくても、{HANGUP_KEY} で通話を切れます。</div>
              <div>初めて使うときは、Zoomの設定が1つ要ります。</div>
            </>
          )}
          {showSteps ? <Steps /> : (
            <Button size="sm" variant="secondary" style={{ marginTop: space[3] }} onClick={() => setShowSteps(true)}>設定方法を見る</Button>
          )}
          {!notReached && (
            <label style={{
              display: 'flex', alignItems: 'center', gap: 8, marginTop: space[4],
              fontSize: font.size.xs, color: color.textMid, cursor: 'pointer', width: 'fit-content',
            }}>
              <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
              今後表示しない
            </label>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 20px 18px' }}>
          <Button onClick={close} autoFocus>閉じる</Button>
        </div>
      </div>
    </div>
  );
}
