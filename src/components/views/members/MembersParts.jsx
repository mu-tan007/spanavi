import { useEffect, useState } from 'react';
import './Members.css';
import { color, font, radius, alpha } from '../../../constants/design';
import { Button, Input, Select } from '../../ui';

// メンバーページの部品（2026-10-07 むー様確認の見本どおり）

export function rankIndex(ranks, rankId) {
  return ranks.findIndex(r => r.id === rankId);
}

export function Avatar({ m, rankIdx = -1, calling, onClick, style }) {
  return (
    <button type="button" className={`mb-av${rankIdx > 0 ? ` r${Math.min(rankIdx, 3)}` : ''}${calling ? ' on' : ''}`} title={m.name} onClick={onClick} style={style}>
      {m.avatar_url ? <img src={m.avatar_url} alt={m.name} /> : (m.name || '?')[0]}
    </button>
  );
}

/** 上の段：いま架電中・今日のシフト・今月の架電・今月の有効アポ */
export function MembersKpis({ k }) {
  const man = (y) => (Math.round((y || 0) / 1000) / 10).toLocaleString();
  return (
    <div className="mb-kpi">
      <div className="mb-card mb-k"><span className="mb-lbl">いま架電中</span>
        <div className="mb-v mb-num"><span className={`mb-live${k.calling.length ? '' : ' off'}`} />{k.calling.length}<small>名</small></div>
        <div className="mb-s">{k.calling.length ? k.calling.map(n => n.split(/\s/)[0]).join(' ・ ') : '直近30分の架電なし'}</div></div>
      <div className="mb-card mb-k"><span className="mb-lbl">今日シフトに入る人</span>
        <div className="mb-v mb-num">{k.shiftPeople}<small>名</small></div><div className="mb-s">合計 {k.shiftHours.toFixed(1)}時間</div></div>
      <div className="mb-card mb-k"><span className="mb-lbl">今月の架電</span>
        <div className="mb-v mb-num">{k.calls.toLocaleString()}<small>件</small></div><div className="mb-s">社長につながった {k.keyman.toLocaleString()}件（{k.keymanRate}%）</div></div>
      <div className="mb-card mb-k"><span className="mb-lbl">今月の有効アポ</span>
        <div className="mb-v mb-num">{k.appos}<small>件</small></div><div className="mb-s">インターン報酬 {man(k.reward)}万円</div></div>
    </div>
  );
}

/** ランクのはしご：今いる段に顔を並べる。右ほど報酬率が上 */
export function RankLadder({ ranks, members, callingSet, onOpen }) {
  const unranked = members.filter(m => !ranks.some(r => r.id === m.rank_id));
  return (
    <div className="mb-card mb-ladder">
      <h4><span>ランクのはしご ・ 顔を押すとその人</span><span>右に行くほど報酬率が上がる</span></h4>
      <div className="mb-rungs" style={{ gridTemplateColumns: `repeat(${Math.max(ranks.length, 1)}, 1fr)` }}>
        {ranks.map((r, ri) => {
          const ppl = members.filter(m => m.rank_id === r.id);
          return (
            <div key={r.id} className={`mb-rung${ri >= 2 ? ` r${Math.min(ri, 3)}` : ''}`}>
              <h5>{r.name}<span className="mb-num">{r.default_incentive_rate != null ? `${Math.round(Number(r.default_incentive_rate) * 100)}%` : ''}</span></h5>
              <div className="mb-ppl">
                {ppl.map((m, i) => <Avatar key={m.id} m={m} rankIdx={ri} calling={callingSet.has(m.name)} onClick={() => onOpen(m)} style={{ animationDelay: `${(ri * 6 + i) * 30}ms` }} />)}
              </div>
              {ppl.length === 0 && <div className="mb-em">まだいない</div>}
              {ri === 0 && unranked.length > 0 && <div className="mb-em">ランク未設定 {unranked.map(m => m.name.split(/\s/)[0]).join('・')}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 1人の行（チームのカードの中） */
export function MemberLine({ m, ranks, stat, status, grip, onOpen, rowRef, rowStyle, rowProps }) {
  const ri = rankIndex(ranks, m.rank_id);
  const sales = Number(m.cumulative_sales || 0), appos = Number(stat?.appos || 0);
  return (
    <div ref={rowRef} style={rowStyle} {...rowProps} className="mb-mem" onClick={() => onOpen(m)}>
      <span className="mb-grip" onClick={e => e.stopPropagation()} {...(grip || {})}>{grip ? '⋮⋮' : ''}</span>
      <Avatar m={m} rankIdx={ri} calling={status.kind === 'calling'} onClick={() => onOpen(m)} />
      <span className="mb-nm"><b>{m.name}</b><span className={`mb-st ${status.kind}`}>{status.kind === 'calling' ? '● 架電中' : status.label}</span></span>
      <span className={`mb-rk${ri < 0 ? ' none' : ` r${Math.min(ri, 3)}`}`}>{ri < 0 ? '未設定' : ranks[ri].name}</span>
      {/* 2026-10-08 むー様：今月の架電より累計売上をぱっと見たい */}
      <span className={`mb-n mb-num${sales ? '' : ' zero'}`}><b>{Math.round(sales / 10000).toLocaleString()}</b><small>累計 万円</small></span>
      <span className={`mb-n mb-num${appos ? '' : ' zero'}`}><b>{appos}</b><small>アポ</small></span>
    </div>
  );
}

/** 詳細（右から）。ポジション・ランク・個別の報酬率の変更はここに集める */
export function MemberDrawer({ m, ranks, roles, stat, status, editable, onClose, onRankChange, onRoleChange, onOverrideChange, onOpenProfile }) {
  const [rate, setRate] = useState('');
  useEffect(() => { setRate(m?.incentive_rate_override != null ? String(Number(m.incentive_rate_override) * 100) : ''); }, [m?.id, m?.incentive_rate_override]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!m) return null;
  const ri = rankIndex(ranks, m.rank_id);
  const cur = ranks[ri];
  const effective = m.incentive_rate_override != null ? Number(m.incentive_rate_override) : (cur?.default_incentive_rate != null ? Number(cur.default_incentive_rate) : null);
  const commitRate = () => {
    const t = rate.trim();
    if (t === '') { if (m.incentive_rate_override != null) onOverrideChange?.(m.id, null); return; }
    const n = parseFloat(t);
    if (isNaN(n) || n < 0 || n > 100) return;
    if (n / 100 !== Number(m.incentive_rate_override || 0)) onOverrideChange?.(m.id, n / 100);
  };
  const box = { border: `1px solid ${color.border}`, borderRadius: radius.lg, padding: '12px 14px' };
  const h4 = { fontSize: 12, color: color.textMid, fontWeight: font.weight.medium, margin: '0 0 8px', display: 'flex', justifyContent: 'space-between' };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: alpha(color.navyDeep, 0.25), zIndex: 300, display: 'flex', justifyContent: 'flex-end' }}>
      <div className="mb mb-drawer" onClick={e => e.stopPropagation()} style={{ width: 520, maxWidth: '100vw', height: '100vh', background: color.white, boxShadow: '-12px 0 40px rgba(1,18,38,0.18)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${color.borderLight}`, display: 'flex', gap: 14, alignItems: 'center' }}>
          <Avatar m={m} rankIdx={ri} calling={status.kind === 'calling'} style={{ width: 52, height: 52, fontSize: 20, animation: 'none' }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: font.weight.bold, color: color.navy, lineHeight: 1.3 }}>{m.name}</div>
            <div style={{ fontSize: 12, color: color.textMid }}>{[m.team ? `${m.team}チーム` : '', cur?.name || 'ランク未設定', m.start_date ? `入社 ${m.start_date.replaceAll('-', '/')}` : ''].filter(Boolean).join(' ・ ')}</div>
          </div>
        </div>
        <div style={{ padding: '16px 20px', overflow: 'auto', flex: 1, display: 'grid', gap: 14, alignContent: 'start' }}>
          <div className="mb-dk mb-num">
            <div><b>{Number(stat?.calls || 0).toLocaleString()}</b><span>今月の架電</span></div>
            <div><b>{Number(stat?.keyman || 0).toLocaleString()}</b><span>社長につながった</span></div>
            <div><b>{Number(stat?.appos || 0)}</b><span>今月のアポ</span></div>
            <div><b>{m.cumulative_sales ? `${Math.round(m.cumulative_sales / 10000).toLocaleString()}万` : '0'}</b><span>累計売上（円）</span></div>
          </div>
          <div style={box}>
            <div style={h4}><span>ランク</span><span>報酬率 {effective != null ? `${(effective * 100).toFixed(1).replace(/\.0$/, '')}%` : '—'}{m.incentive_rate_override != null ? '（個別）' : ''}</span></div>
            <div className="mb-steps">
              {ranks.map((r, j) => <div key={r.id} className={`${j < ri ? 'done' : ''} ${j === ri ? 'cur' : ''}`}>{r.name}<br /><span className="mb-num">{r.default_incentive_rate != null ? `${Math.round(Number(r.default_incentive_rate) * 100)}%` : ''}</span></div>)}
            </div>
          </div>
          <div style={box}>
            <div style={h4}><span>いまの状態</span></div>
            <dl className="mb-kv"><dt>状態</dt><dd>{status.label}</dd><dt>最後の架電</dt><dd>{stat?.last_called_at ? new Date(stat.last_called_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '今月はなし'}</dd>
              <dt>メール</dt><dd style={{ overflowWrap: 'anywhere' }}>{m.email || '—'}</dd></dl>
          </div>
          {editable && (
            <div style={box}>
              <div style={h4}><span>編集</span><span style={{ fontSize: 11, color: color.textLight }}>変えるとすぐ保存</span></div>
              <div style={{ display: 'grid', gap: 10 }}>
                <Select size="sm" label="ポジション" value={m.role_id || ''} onChange={e => onRoleChange?.(m.id, e.target.value || null)}
                  options={[{ value: '', label: '（なし）' }, ...roles.map(r => ({ value: r.id, label: r.name }))]} />
                <Select size="sm" label="ランク" value={m.rank_id || ''} onChange={e => onRankChange?.(m.id, e.target.value || null)}
                  options={[{ value: '', label: '（未設定）' }, ...ranks.map(r => ({ value: r.id, label: r.name }))]} />
                <Input size="sm" label="個別の報酬率（%）" hint="空欄にするとランクの率に戻る" type="number" step="0.1" min="0" max="100" value={rate}
                  onChange={e => setRate(e.target.value)} onBlur={commitRate} onKeyDown={e => { if (e.key === 'Enter') commitRate(); }} placeholder="例 24" />
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${color.borderLight}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="outline" size="sm" onClick={onClose}>閉じる</Button>
          {onOpenProfile && <Button variant="secondary" size="sm" onClick={() => onOpenProfile(m.id)}>プロフィールを開く</Button>}
        </div>
      </div>
    </div>
  );
}
