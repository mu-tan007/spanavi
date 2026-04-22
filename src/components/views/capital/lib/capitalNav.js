// Spanavi 外部 (左サイドバー) から Capital 内部 MemoryRouter にナビゲーションする橋渡し。
// MemoryRouter は Capital の <CapitalApp> 内に閉じるので、サイドバーはこのモジュールの
// capitalNavigate() を呼ぶ / subscribeCapitalPathname() で現在パスを購読する。
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from './miniRouter';

let _navigateFn = null;
// 強制リロード後も localStorage から復元 (miniRouter の CapitalRouterProvider と同キー)
let _pathname = (() => {
  try {
    if (typeof window === 'undefined') return '/dashboard';
    return window.localStorage.getItem('spanavi_capital_path') || '/dashboard';
  } catch { return '/dashboard'; }
})();
const listeners = new Set();

export function capitalNavigate(path) {
  if (_navigateFn) _navigateFn(path);
}
export function getCapitalPathname() { return _pathname; }
export function subscribeCapitalPathname(cb) { listeners.add(cb); return () => listeners.delete(cb); }

// CapitalApp 内で <CapitalNavBridge /> を描画する。MemoryRouter コンテキスト内で
// useNavigate/useLocation を取得しモジュールスコープに反映する。
export function CapitalNavBridge() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    _navigateFn = navigate;
    return () => { _navigateFn = null; };
  }, [navigate]);
  useEffect(() => {
    _pathname = location.pathname;
    listeners.forEach(l => l(location.pathname));
  }, [location.pathname]);
  return null;
}

export function useCapitalPathname() {
  const [p, setP] = useState(getCapitalPathname);
  useEffect(() => subscribeCapitalPathname(setP), []);
  return p;
}
