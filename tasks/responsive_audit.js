// スパナビ全ページのスマホ幅監査（Chrome のログイン済みタブで javascript_tool から流す）
// 使い方: window.__runAudit({ width: 390, pages: [...] }) → 結果は window.__audit に貯まる
// 採点: ①ページ全体の横はみ出し ②右端を越える要素（横スクロール枠の中は除く）③開いているモーダルの幅
window.__runAudit = async ({ width = 390, height = 800, pages, settleMs = 7000, tabMs = 1500 }) => {
  const KEYS = ['masp_v2_currentTab', 'spanavi_current_engagement_slug'];
  // 途中で止めても元に戻せるよう、最初の値を別名で控えておく
  if (!localStorage.getItem('__audit_saved')) localStorage.setItem('__audit_saved', JSON.stringify(Object.fromEntries(KEYS.map(k => [k, localStorage.getItem(k)]))));
  const saved = JSON.parse(localStorage.getItem('__audit_saved'));
  window.__audit = { width, done: false, results: [], saved };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;background:#ddd;padding:4px';
  document.body.appendChild(host);

  const score = (doc, label) => {
    const win = doc.defaultView;
    const vw = doc.documentElement.clientWidth;
    const pageOverflow = doc.documentElement.scrollWidth - vw;
    // 横スクロール枠（auto/scroll）の中は許容。hidden/clip は、セルの省略表示のような小さい箱なら許容し、
    // ページ全体を包む箱（幅が画面の9割以上）で切れているものは「見えないだけの、はみ出し」として数える
    const scroller = (el) => {
      for (let p = el.parentElement; p && p !== doc.body; p = p.parentElement) {
        const ox = win.getComputedStyle(p).overflowX;
        if (ox === 'auto' || ox === 'scroll') return true;
        if ((ox === 'hidden' || ox === 'clip') && p.getBoundingClientRect().width < vw * 0.9) return true;
      }
      return false;
    };
    const hiddenAway = (el) => {
      const cs = win.getComputedStyle(el);
      return cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0;
    };
    const offenders = [];
    for (const el of doc.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right <= vw + 2) continue;
      if (r.left >= vw) continue;             // 画面外に退避している部品（閉じたドロワー等）
      if (scroller(el) || hiddenAway(el)) continue;
      // 親も越えているなら親だけ記録する（子を重複して数えない）
      const p = el.parentElement;
      if (p && p.getBoundingClientRect().right > vw + 2 && !scroller(p)) continue;
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && typeof el.className === 'string') ? el.className.slice(0, 40) : '',
        right: Math.round(r.right), w: Math.round(r.width),
        text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 24),
        style: (el.getAttribute('style') || '').slice(0, 90),
      });
    }
    const modals = [...doc.querySelectorAll('[role=dialog], [aria-modal=true]')]
      .map(m => Math.round(m.getBoundingClientRect().width)).filter(w => w > vw);
    return { label, pageOverflow, offenders: offenders.slice(0, 12), offenderCount: offenders.length, wideModals: modals };
  };

  for (const pg of pages) {
    localStorage.setItem('spanavi_current_engagement_slug', pg.eng);
    localStorage.setItem('masp_v2_currentTab', pg.tab);
    host.innerHTML = '';
    const f = document.createElement('iframe');
    f.style.cssText = `width:${width}px;height:${height}px;border:0;background:#fff`;
    f.src = '/?audit=' + Date.now();
    host.appendChild(f);
    await sleep(settleMs);
    const doc = f.contentDocument;
    const heading = [...doc.querySelectorAll('h1')].map(h => h.textContent.trim()).join('|');
    window.__audit.results.push({ page: `${pg.eng}/${pg.tab}`, heading, ...score(doc, '(初期)') });
    for (const t of (pg.subtabs || [])) {
      const b = [...doc.querySelectorAll('button,[role=tab],a,div,span')]
        .find(x => x.children.length <= 2 && (x.innerText || '').trim() === t);
      if (!b) { window.__audit.results.push({ page: `${pg.eng}/${pg.tab}`, label: t, missing: true }); continue; }
      b.click();
      await sleep(tabMs);
      window.__audit.results.push({ page: `${pg.eng}/${pg.tab}`, ...score(doc, t) });
    }
  }
  host.remove();
  for (const k of KEYS) { if (saved[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, saved[k]); }
  localStorage.removeItem('__audit_saved');
  window.__audit.done = true;
};
