// Spanavi 外側に既に BrowserRouter があるため react-router の MemoryRouter を
// 二重にネストできない (v7は禁止)。Capital 配下だけで動く軽量ルーター。
// react-router-dom と互換のAPIだけを必要最小限だけ実装する。
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const RouterCtx = createContext(null);
const ParamsCtx = createContext({});

export function CapitalRouterProvider({ initialPath = '/dashboard', children }) {
  const [pathname, setPathname] = useState(initialPath);

  const navigate = useCallback((to, _opts) => {
    if (typeof to === 'number') return; // history.go は非対応
    const t = typeof to === 'string' ? to : (to?.pathname || '/');
    setPathname(prev => (prev === t ? prev : t));
  }, []);

  const value = useMemo(() => ({ pathname, navigate }), [pathname, navigate]);
  return <RouterCtx.Provider value={value}>{children}</RouterCtx.Provider>;
}

export function useLocation() {
  const ctx = useContext(RouterCtx);
  return { pathname: ctx?.pathname || '/', search: '', hash: '', state: null };
}

export function useNavigate() {
  const ctx = useContext(RouterCtx);
  return ctx?.navigate || (() => {});
}

export function useParams() {
  return useContext(ParamsCtx);
}

function matchPath(pattern, pathname) {
  if (pattern === '*' || pattern === '/*') return { params: {} };
  const pat = (pattern || '').replace(/\/+$/, '') || '/';
  const path = (pathname || '').replace(/\/+$/, '') || '/';
  const patParts = pat.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patParts.length !== pathParts.length) return null;
  const params = {};
  for (let i = 0; i < patParts.length; i++) {
    if (patParts[i].startsWith(':')) {
      params[patParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (patParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return { params };
}

export function Routes({ children }) {
  const { pathname } = useContext(RouterCtx) || { pathname: '/' };
  let fallbackElement = null;
  let matchedElement = null;
  let matchedParams = {};
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const { path, element } = child.props || {};
    if (matchedElement) return;
    if (path === '*' || path === '/*') {
      fallbackElement = element;
      return;
    }
    const m = matchPath(path, pathname);
    if (m) {
      matchedElement = element;
      matchedParams = m.params;
    }
  });
  const out = matchedElement || fallbackElement;
  return <ParamsCtx.Provider value={matchedParams}>{out}</ParamsCtx.Provider>;
}

// 型合わせ用のダミー (Routes が中身を解釈するので実装不要)
export function Route(_props) { return null; }

export function Navigate({ to, replace: _replace }) {
  const { navigate } = useContext(RouterCtx) || {};
  useEffect(() => { if (navigate) navigate(to); }, [to, navigate]);
  return null;
}

export function Link({ to, replace: _replace, children, onClick, ...rest }) {
  const { navigate } = useContext(RouterCtx) || {};
  const handleClick = (e) => {
    if (onClick) onClick(e);
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (rest.target && rest.target !== '_self') return;
    e.preventDefault();
    if (navigate) navigate(to);
  };
  const href = typeof to === 'string' ? to : (to?.pathname || '/');
  return <a href={href} onClick={handleClick} {...rest}>{children}</a>;
}

// Outlet, MemoryRouter は Capital では使っていないが import だけされる場合に備えて no-op 提供
export function Outlet() { return null; }
export function MemoryRouter({ children }) { return children; }
