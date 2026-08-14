import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

// 動作確認用の強制切替。
//   URL に ?viewport=mobile を付けるとスマホ表示、?viewport=desktop でPC表示に固定できる。
//   一度指定すると localStorage に残るので、画面を移動しても保たれる。解除は ?viewport=auto。
// PCのブラウザでスマホ表示を確認したい時（実機を出さずにレイアウトを見たい時）に使う。
const OVERRIDE_KEY = 'spa_viewport_override';

function readOverride() {
  if (typeof window === 'undefined') return null;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('viewport');
    if (fromUrl === 'mobile' || fromUrl === 'desktop') {
      localStorage.setItem(OVERRIDE_KEY, fromUrl);
      return fromUrl;
    }
    if (fromUrl === 'auto') {
      localStorage.removeItem(OVERRIDE_KEY);
      return null;
    }
    const saved = localStorage.getItem(OVERRIDE_KEY);
    return saved === 'mobile' || saved === 'desktop' ? saved : null;
  } catch {
    return null;
  }
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    const ov = readOverride();
    if (ov) return ov === 'mobile';
    return window.innerWidth < MOBILE_BREAKPOINT;
  });

  useEffect(() => {
    if (readOverride()) return;   // 強制切替中は画面幅の変化を見ない
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
