import { useState, useEffect, useMemo, useRef } from 'react';
import { C } from '../../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Input, Select, Card, Badge } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { getOrgId } from '../../../lib/orgContext';
import { updateClientNextContactAt, updateClient, deleteClient } from '../../../lib/supabaseWrite';
import { useEngagements } from '../../../hooks/useEngagements';
import { PAYMENT_SITE_OPTIONS, STAGE_LIST, SERVICE_LIST, NEXT_ACTION_OWNERS } from '../crm/utils';
import { useIsMobile } from '../../../hooks/useIsMobile';
import ContactDrawer from './ContactDrawer';
import ClientMeetingsSection from '../crm/ClientMeetingsSection';
import ClientActivity, { useClientActivity, lastContactOf, daysAgo, activityCardStyle } from './ClientActivity';
import { useUrlState } from '../../../hooks/useUrlState';

const NAVY = '#0D2247';
const BLUE = '#1E40AF';
const GRAY_200 = '#E5E7EB';
const GRAY_100 = '#F3F4F6';
const GRAY_50 = '#F8F9FA';
const GOLD = '#B8860B';

// 獲得・停止の選択肢（2026-10-06 むー様の分類）
const CHANNEL_OPTIONS = ['問い合わせフォーム', 'SNSのDM', '紹介', 'テレアポ', 'フォーム営業', 'その他'];
const STOP_REASON_OPTIONS = ['方針転換・体制', 'アポの質', '予算', '成果不足', 'その他'];
const STOPPED_BY_OPTIONS = ['先方', '弊社', '自然消滅'];
const RESUME_OPTIONS = ['あり', '未定', 'なし'];
const toOptions = (arr) => [{ value: '', label: '—' }, ...arr.map(v => ({ value: v, label: v }))];
/** 「110,000円」「11万」「5件」→ 数字。空や読めないものは null */
const parseNum = (v) => {
  const s = String(v ?? '').replace(/[,，円件\s]/g, '');
  if (!s) return null;
  const man = s.match(/^(\d+(?:\.\d+)?)万$/);
  const n = man ? Math.round(Number(man[1]) * 10000) : parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
};

/**
 * ステータスを停止中・保留に変えるときに、止まった理由を聞く小さな窓。
 * ここで入れた内容は、右の活動履歴の「ステータスを〇〇に変えました」に一緒に残る（DBのトリガーで記録）。
 * 停止中にすると、そのクライアントの架電リストは自動でアーカイブされる。
 */
function StopReasonModal({ client, toStatus, onCancel, onSave }) {
  const [form, setForm] = useState({
    stoppedBy: client.stoppedBy || '', stopReason: client.stopReason || '',
    resumeOutlook: client.resumeOutlook || '', stopNote: client.stopNote || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const save = async () => { setSaving(true); await onSave(form); setSaving(false); };
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: alpha(color.navyDeep, 0.5), zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: space[4],
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(460px, 100%)', background: color.white, borderRadius: radius.lg, boxShadow: shadow.xl,
        padding: space[5], fontFamily: font.family.sans,
      }}>
        <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[1] }}>
          {client.company}を「{toStatus}」にします
        </div>
        <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: space[4] }}>
          止まった理由を残しておくと、あとで再開の候補を探せます。
          {toStatus === '停止中' && '架電リストは自動でアーカイブされます。'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[3] }}>
          <Select size="sm" label="止めた側" value={form.stoppedBy} onChange={set('stoppedBy')} options={toOptions(STOPPED_BY_OPTIONS)} />
          <Select size="sm" label="理由" value={form.stopReason} onChange={set('stopReason')} options={toOptions(STOP_REASON_OPTIONS)} />
          <Select size="sm" label="再開の見込み" value={form.resumeOutlook} onChange={set('resumeOutlook')} options={toOptions(RESUME_OPTIONS)} />
          <div />
          <div style={{ gridColumn: '1 / -1' }}>
            <Input size="sm" label="ひとこと（任意）" value={form.stopNote} onChange={set('stopNote')} placeholder="例：予算の上限に達した。11月に再開の相談" />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space[2], marginTop: space[5] }}>
          <Button size="sm" variant="outline" onClick={onCancel}>やめる</Button>
          <Button size="sm" variant="primary" loading={saving} onClick={save}>「{toStatus}」にする</Button>
        </div>
      </div>
    </div>
  );
}

const statusStyle = (st) => {
  if (st === '支援中') return { color: '#10B981' };
  if (st === '準備中') return { color: C.gold };
  if (st === '停止中') return { color: '#e53835' };
  if (st === '保留') return { color: C.textLight };
  if (st === '中期フォロー') return { color: NAVY };
  if (st === '面談予定') return { color: '#7c3aed' };
  if (st === '問い合わせ') return { color: '#0891b2' };
  return { color: C.textLight };
};

const yen = (n) => '¥' + Number(n || 0).toLocaleString();

const fmtDate = (ts) => {
  if (!ts) return '-';
  try {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch { return '-'; }
};

const fmtJa = (ts) => {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${m}/${day} ${hh}:${mm}`;
  } catch { return ''; }
};

/**
 * Section ヘッダー（左ペイン用）
 */
// 汎用 折りたたみ可能カード
function CollapsibleCard({ title, defaultOpen = false, badge, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      background: color.white, border: `1px solid ${GRAY_200}`, borderRadius: radius.md,
      padding: '10px 14px',
    }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        fontSize: font.size.sm, fontWeight: font.weight.bold, color: NAVY,
        fontFamily: font.family.sans, letterSpacing: 1,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{title}</span>
          {badge}
        </span>
        <span style={{ fontSize: font.size.xs, color: C.textLight, fontWeight: font.weight.normal }}>
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          {children}
        </div>
      )}
    </div>
  );
}

// インライン編集可能なフィールド行 (クリック→入力→blur保存)
function EditableField({ label, value, type = 'text', options, datalistOptions, placeholder, onSave, mono = false, valueColor }) {
  const [editing, setEditing] = useState(false);
  const [localVal, setLocalVal] = useState(value ?? '');
  const inputRef = useRef(null);

  useEffect(() => { setLocalVal(value ?? ''); }, [value]);
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current.select) inputRef.current.select();
    }
  }, [editing]);

  const commit = async () => {
    setEditing(false);
    if ((localVal ?? '') === (value ?? '')) return;
    await onSave?.(localVal);
  };
  const cancel = () => { setLocalVal(value ?? ''); setEditing(false); };

  const labelEl = (
    <div style={{
      fontSize: 10, color: C.textLight, fontWeight: font.weight.medium,
      marginBottom: 2, letterSpacing: 0.5,
    }}>{label}</div>
  );

  if (editing) {
    return (
      <div style={{ marginBottom: 8 }}>
        {labelEl}
        {type === 'select' ? (
          <select
            ref={inputRef}
            value={localVal}
            onChange={e => setLocalVal(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Escape') cancel(); if (e.key === 'Enter') commit(); }}
            style={{
              width: '100%', padding: '4px 6px', border: `1px solid ${NAVY}`,
              borderRadius: radius.sm, fontSize: font.size.xs, fontFamily: font.family.sans,
              color: C.textDark, outline: 'none', background: color.white,
            }}
          >
            {(options || []).map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : (
          <>
            <input
              ref={inputRef}
              type={type === 'email' ? 'email' : 'text'}
              value={localVal}
              onChange={e => setLocalVal(e.target.value)}
              onBlur={commit}
              onKeyDown={e => { if (e.key === 'Escape') cancel(); if (e.key === 'Enter') commit(); }}
              placeholder={placeholder}
              list={datalistOptions ? `dl-${label}` : undefined}
              style={{
                width: '100%', padding: '4px 6px', border: `1px solid ${NAVY}`,
                borderRadius: radius.sm, fontSize: font.size.xs,
                fontFamily: mono ? font.family.mono : font.family.sans,
                color: C.textDark, outline: 'none', background: color.white, boxSizing: 'border-box',
              }}
            />
            {datalistOptions && (
              <datalist id={`dl-${label}`}>
                {datalistOptions.map(o => <option key={o} value={o} />)}
              </datalist>
            )}
          </>
        )}
      </div>
    );
  }

  const displayValue = value || placeholder || '—';
  return (
    <div
      onClick={() => setEditing(true)}
      style={{
        marginBottom: 8, padding: '2px 4px', margin: '0 -4px 6px',
        borderRadius: radius.sm, cursor: 'pointer', transition: 'background 0.1s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = GRAY_50}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      title="クリックして編集"
    >
      {labelEl}
      <div style={{
        fontSize: font.size.xs, color: valueColor || (value ? C.textDark : C.textLight),
        fontFamily: mono ? font.family.mono : font.family.sans,
        fontWeight: value ? font.weight.medium : font.weight.normal,
        wordBreak: 'break-all',
      }}>{displayValue}</div>
    </div>
  );
}

// 報酬体系 (商材エンゲージメント別) のサマリ表示 + モーダル編集
// - 表示: 商材ごとに "M&A: F / SaaS: 未設定 / IFA: - / 人材: A" 形式のチップ
// - クリック: モーダルを開いてタイプ別の reward_type を select で編集
function EngagementRewardsInline({ clientId, rewardMaster }) {
  const { engagements, products, categories } = useEngagements();
  const [engRewards, setEngRewards] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  const rewardIds = useMemo(() => [...new Set((rewardMaster || []).map(r => r.id))].sort(), [rewardMaster]);
  const rewardNameById = useMemo(() => {
    const m = {};
    (rewardMaster || []).forEach(r => { if (!m[r.id]) m[r.id] = r.name; });
    return m;
  }, [rewardMaster]);
  // type_id → tax (税別/税込) 識別のため select option に併記する
  const rewardTaxById = useMemo(() => {
    const m = {};
    (rewardMaster || []).forEach(r => { if (!m[r.id]) m[r.id] = r.tax || ''; });
    return m;
  }, [rewardMaster]);

  // 営業代行 product 配下の全 engagement (client_acquisition 以外)
  const salesAgencyEngs = useMemo(() => {
    const sa = (products || []).find(p => p.slug === 'sales_agency');
    if (!sa) return [];
    return (engagements || [])
      .filter(e => e.product_id === sa.id && !e.isVirtual && e.type !== 'client_acquisition')
      .sort((a, b) => {
        const ca = categories.find(c => c.id === a.category_id);
        const cb = categories.find(c => c.id === b.category_id);
        const co = (ca?.display_order || 999) - (cb?.display_order || 999);
        if (co !== 0) return co;
        return (a.display_order || 0) - (b.display_order || 0);
      });
  }, [engagements, products, categories]);

  // 既存の設定をロード
  useEffect(() => {
    if (!clientId) { setLoaded(true); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('client_engagement_reward_settings')
        .select('engagement_id, reward_type')
        .eq('client_id', clientId);
      if (cancelled) return;
      const map = {};
      (data || []).forEach(r => { map[r.engagement_id] = r.reward_type; });
      setEngRewards(map);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const handleChange = async (engId, newType) => {
    const prevType = engRewards[engId] || '';
    if (newType === prevType) return;
    setEngRewards(prev => ({ ...prev, [engId]: newType }));
    const orgId = getOrgId();
    if (newType) {
      const { error } = await supabase
        .from('client_engagement_reward_settings')
        .upsert({ org_id: orgId, client_id: clientId, engagement_id: engId, reward_type: newType },
          { onConflict: 'org_id,client_id,engagement_id' });
      if (error) {
        alert('保存に失敗: ' + error.message);
        setEngRewards(prev => ({ ...prev, [engId]: prevType }));
      }
    } else {
      const { error } = await supabase
        .from('client_engagement_reward_settings')
        .delete()
        .eq('org_id', orgId).eq('client_id', clientId).eq('engagement_id', engId);
      if (error) {
        alert('削除に失敗: ' + error.message);
        setEngRewards(prev => ({ ...prev, [engId]: prevType }));
      }
    }
  };

  if (salesAgencyEngs.length === 0) return null;

  // rewardMaster から id 単位の詳細 map (name, tax, basis, timing, tiers[])
  // rewardMaster は reward_tiers を flatten したもので、各 row が tier 1件 + 共通属性(name/tax/...)
  const rewardDetailMap = useMemo(() => {
    const m = {};
    (rewardMaster || []).forEach(r => {
      if (!m[r.id]) m[r.id] = { name: r.name, tax: r.tax, basis: r.basis, timing: r.timing, tiers: [] };
      m[r.id].tiers.push({
        lo: r.lo, hi: r.hi, price: r.price, memo: r.memo, _tierSort: r._tierSort,
      });
    });
    return m;
  }, [rewardMaster]);

  // ツールチップ用文字列を生成 (reward_tiers: lo/hi/price/memo)
  const fmtMan = (n) => {
    if (n == null) return '—';
    const v = Number(n);
    if (v >= 100000000) return `${(v / 100000000).toFixed(v % 100000000 === 0 ? 0 : 1)}億`;
    if (v >= 10000) return `${(v / 10000).toFixed(v % 10000 === 0 ? 0 : 1)}万`;
    return `¥${v.toLocaleString()}`;
  };
  const buildTooltip = (rid) => {
    const d = rewardDetailMap[rid];
    if (!d) return rid;
    const lines = [];
    lines.push(`【${rid}】${d.name}`);
    if (d.tax) lines.push(`税区分: ${d.tax}`);
    if (d.timing) lines.push(`支払タイミング: ${d.timing}`);
    if (d.basis) lines.push(`基準: ${d.basis}`);
    if (d.tiers && d.tiers.length > 0) {
      lines.push('--- 段階 ---');
      // tier は _tierSort で並べる
      const sorted = [...d.tiers].sort((a, b) => (a._tierSort ?? 0) - (b._tierSort ?? 0));
      sorted.forEach(t => {
        if (t.memo) {
          // memo に既に「5000万〜1億：20万円」のような完成形が入っているのでそのまま使う
          lines.push(`  ${t.memo}`);
        } else {
          const range = `${fmtMan(t.lo)} 〜 ${fmtMan(t.hi)}`;
          const price = t.price != null ? `¥${Number(t.price).toLocaleString()}` : '';
          lines.push(`  ${range} → ${price}`);
        }
      });
    }
    return lines.join('\n');
  };

  // サマリ: 設定済 reward 単位で集約 (同じ reward が複数 engagement に設定されていれば 1 チップに統合)
  // 表示は reward.name のみ。チップにホバーで詳細ツールチップ。
  const summary = useMemo(() => {
    const usedRewards = new Map(); // rid -> { categories: Set<categoryName> }
    let missingCount = 0;
    const missingCats = [];
    for (const eng of salesAgencyEngs) {
      const reward = (engRewards[eng.id] || '').trim();
      const cat = categories.find(c => c.id === eng.category_id)?.name || '?';
      if (reward) {
        if (!usedRewards.has(reward)) usedRewards.set(reward, { categories: new Set() });
        usedRewards.get(reward).categories.add(cat);
      } else {
        missingCount += 1;
        if (!missingCats.includes(cat)) missingCats.push(cat);
      }
    }
    const rewards = [...usedRewards.entries()].map(([rid, v]) => ({
      rid,
      name: rewardDetailMap[rid]?.name || rid,
      categories: [...v.categories],
      tooltip: buildTooltip(rid),
    }));
    return { rewards, missingCount, missingCats };
  }, [salesAgencyEngs, categories, engRewards, rewardDetailMap]);

  return (
    <>
      {/* 契約条件カード内の表示部分 (クリックでモーダル開) */}
      <div
        onClick={() => setOpen(true)}
        style={{
          marginBottom: 8, padding: '2px 4px', margin: '0 -4px 6px',
          borderRadius: radius.sm, cursor: 'pointer', transition: 'background 0.1s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = GRAY_50}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        title="クリックでタイプ別の報酬体系を編集"
      >
        <div style={{ fontSize: 10, color: C.textLight, fontWeight: font.weight.medium, marginBottom: 2, letterSpacing: 0.5 }}>
          報酬体系 (タイプ別)
        </div>
        {!loaded ? (
          <div style={{ fontSize: font.size.xs, color: C.textLight }}>読み込み中...</div>
        ) : summary.rewards.length === 0 && summary.missingCount === 0 ? (
          <div style={{ fontSize: font.size.xs, color: C.textLight }}>—</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            {summary.rewards.map(r => (
              <span
                key={r.rid}
                title={r.tooltip}
                style={{
                  fontSize: font.size.xs, padding: '2px 8px', borderRadius: radius.sm,
                  background: alpha(color.navy, 0.06),
                  color: NAVY, fontWeight: font.weight.medium,
                  border: `1px solid ${alpha(color.navy, 0.2)}`,
                }}
              >
                {r.name}
                <span style={{ color: C.textLight, fontSize: 10, marginLeft: 4, fontWeight: font.weight.normal }}>
                  ({r.categories.join('/')})
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* タイプ別編集モーダル */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: alpha(color.navyDeep, 0.5), zIndex: 20002,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: color.white, border: `1px solid ${color.border}`,
              borderRadius: radius.lg, width: 560, maxHeight: '80vh', overflow: 'auto',
              boxShadow: shadow.xl, fontFamily: font.family.sans,
            }}
          >
            <div style={{
              padding: '12px 20px', background: color.navy,
              borderRadius: `${radius.lg}px ${radius.lg}px 0 0`,
              color: color.white, fontWeight: font.weight.semibold, fontSize: font.size.md,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>報酬体系 (タイプ別)</span>
              <button onClick={() => setOpen(false)} style={{
                background: 'none', border: 'none', color: color.white,
                fontSize: 18, cursor: 'pointer',
              }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: font.size.xs, color: C.textLight, marginBottom: 12, lineHeight: 1.6 }}>
                各業務種別 (商材×タイプ) ごとに reward 体系 (A〜F) を設定します。<br />
                未設定の業務種別はアポ取得時に当社売上・インターン報酬が ¥0 で記録されます。
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {salesAgencyEngs.map(eng => {
                  const cat = categories.find(c => c.id === eng.category_id)?.name || '';
                  const current = engRewards[eng.id] || '';
                  const isMissing = !current;
                  return (
                    <div key={eng.id} style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'center',
                      paddingBottom: 8, borderBottom: `1px solid ${GRAY_100}`,
                    }}>
                      <div style={{ fontSize: font.size.xs, color: C.textMid, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {cat && <span style={{ fontSize: 10, color: C.textLight }}>{cat}</span>}
                        <span style={{ fontWeight: font.weight.medium }}>{eng.name}</span>
                        {isMissing && (
                          <span style={{
                            fontSize: 9, color: color.white, background: color.danger,
                            padding: '1px 5px', borderRadius: radius.sm, fontWeight: font.weight.semibold,
                          }}>未設定</span>
                        )}
                      </div>
                      <select
                        value={current}
                        onChange={e => handleChange(eng.id, e.target.value)}
                        style={{
                          padding: '5px 8px', border: `1px solid ${GRAY_200}`,
                          borderRadius: radius.sm, fontSize: font.size.xs, fontFamily: font.family.sans,
                          color: C.textDark, outline: 'none', background: color.white,
                        }}
                      >
                        <option value="">— (報酬計算なし)</option>
                        {rewardIds.map(id => (
                          <option key={id} value={id}>
                            {id} - {rewardNameById[id] || ''}{rewardTaxById[id] ? ` (${rewardTaxById[id]})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{
              padding: '10px 20px', borderTop: `1px solid ${color.border}`,
              display: 'flex', justifyContent: 'flex-end', gap: 8,
            }}>
              <button onClick={() => setOpen(false)} style={{
                padding: '6px 16px', background: color.navy, color: color.white,
                border: 'none', borderRadius: radius.md, fontSize: font.size.xs,
                fontWeight: font.weight.semibold, cursor: 'pointer', fontFamily: font.family.sans,
              }}>閉じる</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// 企業名をクリックで input 切替
function InlineCompanyName({ company, editable, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(company || '');
  const inputRef = useRef(null);
  useEffect(() => { setVal(company || ''); }, [company]);
  useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [editing]);
  const commit = async () => {
    setEditing(false);
    if ((val || '').trim() === (company || '').trim()) return;
    if (!val.trim()) { setVal(company || ''); return; }
    await onSave?.(val.trim());
  };
  if (editing) {
    return (
      <input
        ref={inputRef}
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Escape') { setVal(company || ''); setEditing(false); } if (e.key === 'Enter') commit(); }}
        style={{
          fontSize: 19, fontWeight: font.weight.bold, color: color.textDark,
          border: `1px solid ${color.navy}`, borderRadius: radius.sm, padding: '2px 6px',
          fontFamily: font.family.sans, outline: 'none', minWidth: 240,
        }}
      />
    );
  }
  return (
    <span
      onClick={() => editable && setEditing(true)}
      style={{
        fontSize: 19, fontWeight: font.weight.bold, color: color.textDark, letterSpacing: -0.1,
        cursor: editable ? 'pointer' : 'default',
        padding: '2px 6px', margin: '0 -6px', borderRadius: radius.sm,
      }}
      onMouseEnter={e => editable && (e.currentTarget.style.background = GRAY_50)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      title={editable ? 'クリックして編集' : ''}
    >{company}</span>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: font.weight.bold, color: NAVY,
      letterSpacing: 1.5,
      borderBottom: `1px solid ${GRAY_200}`,
      paddingBottom: 6, marginBottom: 10, marginTop: 18,
    }}>{children}</div>
  );
}

function NextContactRow({ client, setClientData }) {
  const toYmd = (v) => (v ? new Date(v).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }) : '');
  const [val, setVal] = useState(toYmd(client.nextContactAt));
  useEffect(() => { setVal(toYmd(client.nextContactAt)); }, [client.nextContactAt]);

  const handleSave = async () => {
    const newVal = val ? new Date(val + 'T09:00:00+09:00').toISOString() : null;
    if ((newVal || null) === (client.nextContactAt || null)) return;
    if (!client._supaId) return;
    const { error } = await updateClientNextContactAt(client._supaId, newVal);
    if (error) { alert('保存に失敗しました'); return; }
    setClientData?.(prev => prev.map(x => (x._supaId === client._supaId ? { ...x, nextContactAt: newVal } : x)));
  };

  // 期日を過ぎたら赤（一覧の「予定日超過」と同じ判定）
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const overdue = !!val && val < today;
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: color.textMid }}>
      次回接点
      <input
        type="date"
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={handleSave}
        disabled={!setClientData}
        style={{
          padding: '4px 8px', borderRadius: radius.md,
          border: `1px solid ${overdue ? color.danger : color.border}`,
          fontSize: 12, fontFamily: font.family.sans, outline: 'none',
          background: color.white, color: overdue ? color.danger : color.textDark,
          fontWeight: overdue ? 700 : 400,
        }}
      />
    </label>
  );
}

const profileHead = {
  fontSize: 11, fontWeight: 700, color: color.textMid, letterSpacing: 0.5,
  paddingBottom: 6, marginBottom: 10, borderBottom: `1px solid ${color.borderLight}`,
};

function FieldRow({ label, value, mono = false, valueColor }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 9, fontWeight: font.weight.semibold, color: C.textLight, marginBottom: 2 }}>{label}</div>
      <div style={{
        fontSize: font.size.xs, color: valueColor || C.textDark, fontWeight: font.weight.medium, lineHeight: 1.5,
        fontFamily: mono ? font.family.mono : font.family.sans,
        fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
        wordBreak: 'break-word',
      }}>{value || '-'}</div>
    </div>
  );
}

/**
 * ClientDetailPage — 3 ペインのクライアント詳細
 *
 * Props:
 *  - client: clientData の 1 件 (with _supaId, status, company, ...)
 *  - contactsByClient, setContactsByClient
 *  - rewardMaster
 *  - callListData
 *  - isAdmin
 *  - onBack: 一覧に戻る
 *  - onEdit: (client) => void  ※ 親 (CRMView) の編集モーダルを開かせる
 *  - onShowReward: (rewardType) => void  ※ 親の報酬体系ポップアップを開かせる
 */
export default function ClientDetailPage({
  client,
  contactsByClient = {},
  setContactsByClient,
  rewardMaster = [],
  callListData = [],
  isAdmin = false,
  setClientData,
  currentUser = '',
  onBack,
  onShowReward,
}) {
  const c = client;
  const sc = statusStyle(c?.status);

  const rewardMap = useMemo(() => {
    const map = {};
    rewardMaster.forEach(r => {
      if (!map[r.id]) map[r.id] = { name: r.name, timing: r.timing, basis: r.basis, tax: r.tax, tiers: [] };
      map[r.id].tiers.push(r);
    });
    return map;
  }, [rewardMaster]);
  const rm = rewardMap[c?.rewardType];

  // インライン編集: 1フィールドだけ差分更新
  const patchClient = async (patch) => {
    if (!c?._supaId) return;
    const updated = { ...c, ...patch };
    const error = await updateClient(c._supaId, updated);
    if (error) { alert('保存に失敗: ' + (error.message || '不明なエラー')); return; }
    if (setClientData) {
      setClientData(prev => prev.map(x => x._supaId === c._supaId ? updated : x));
    }
  };


  // クライアント削除
  const handleDelete = async () => {
    if (!c?._supaId) return;
    if (!window.confirm(`「${c.company}」を削除しますか？\nこの操作は取り消せません。`)) return;
    const error = await deleteClient(c._supaId);
    if (error) { alert('削除に失敗: ' + (error.message || '不明なエラー')); return; }
    if (setClientData) {
      setClientData(prev => prev.filter(x => x._supaId !== c._supaId));
    }
    onBack?.();
  };

  // 停止中・保留に変えるときの理由の窓（変える先のステータス。null なら閉じている）
  const [stopTo, setStopTo] = useState(null);

  // 担当者ドロワー
  const [contactDrawer, setContactDrawer] = useState({ isOpen: false, mode: 'add', existingContact: null });
  // 左のタブは URL に持つ（読み直しても同じタブが開く）。
  // 既定は商談記録（基本情報はあまり見ないため。2026-10-05 むー様指示）
  const [tab, setTab] = useUrlState('client_tab', 'meetings', { allowed: ['profile', 'contacts', 'meetings'] });
  // モバイル時のタブ切替
  const isMobile = useIsMobile();

  const contacts = (c?._supaId && contactsByClient[c._supaId]) || [];
  const sortedContacts = [...contacts].sort((a, b) => {
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    return 0;
  });

  const activity = useClientActivity(c?._supaId, sortedContacts);

  if (!c) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: C.textLight, fontFamily: font.family.sans }}>
        クライアントが選択されていません
      </div>
    );
  }

  const primary = sortedContacts.find(ct => ct.isPrimary) || sortedContacts[0] || null;
  const lastAt = lastContactOf(activity.items);
  const tabs = [
    ['meetings', '商談記録', (activity.data?.meetings || []).length],
    ['contacts', '担当者', sortedContacts.length],
    ['profile', '基本情報', 0],
  ];
  const pill = (active, fg) => ({
    padding: '3px 10px', borderRadius: radius.pill, border: 'none', cursor: setClientData ? 'pointer' : 'default',
    background: active ? `${fg}14` : color.gray100, color: fg,
    fontSize: 11.5, fontWeight: 700, fontFamily: font.family.sans, outline: 'none',
  });

  return (
    <div style={{ animation: 'fadeIn 0.2s ease', fontFamily: font.family.sans, color: color.textDark }}>
      <button onClick={onBack} style={{
        padding: '4px 0', border: 'none', background: 'transparent', cursor: 'pointer',
        fontSize: 12.5, color: color.textMid, fontFamily: font.family.sans,
      }}>← 一覧へ戻る</button>

      {stopTo && (
        <StopReasonModal client={c} toStatus={stopTo} onCancel={() => setStopTo(null)}
          onSave={async (form) => {
            // 理由と状態を1回で保存する（DBのトリガーが、理由つきでステータス変更の記録を残す）
            await patchClient({ ...form, status: stopTo, statusChangedAt: new Date().toISOString() });
            setStopTo(null); activity.reload();
          }} />
      )}

      {/* 見出し：社名・ステータス・契約・業種・主担当。札を並べすぎない。 */}
      <div style={{ ...activityCardStyle, marginTop: space[3], padding: '16px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
          <InlineCompanyName company={c.company} editable={!!setClientData} onSave={v => patchClient({ company: v })} />
          {setClientData ? (
            <select value={c.status || ''} title="ステータスを変更"
              onChange={async (e) => {
                const next = e.target.value;
                // 停止中・保留にするときは、止まった理由を先に聞く
                if (next === '停止中' || next === '保留') { setStopTo(next); return; }
                await patchClient({ status: next, statusChangedAt: new Date().toISOString() }); activity.reload();
              }}
              style={pill(true, sc.color)}>
              {['準備中','支援中','停止中','保留','中期フォロー','面談予定','問い合わせ'].map(s2 => <option key={s2} value={s2}>{s2}</option>)}
            </select>
          ) : <span style={pill(true, sc.color)}>{c.status}</span>}
          {setClientData ? (
            <select value={c.contract || '未'} title="契約状態を変更"
              onChange={async (e) => { await patchClient({ contract: e.target.value }); }}
              style={pill(c.contract === '済', c.contract === '済' ? color.navy : color.textLight)}>
              <option value="未">契約未</option>
              <option value="済">契約済</option>
            </select>
          ) : (c.contract === '済' && <span style={pill(true, color.navy)}>契約済</span>)}
          {c.industry && <span style={{ fontSize: 12, color: color.textLight }}>{c.industry}</span>}
          <div style={{ flex: 1 }} />
          <NextContactRow client={c} setClientData={setClientData} />
          <span style={{ fontSize: 11.5, color: color.textMid, whiteSpace: 'nowrap' }}>
            最終接点 {lastAt ? (daysAgo(lastAt) || '—') : '—'}
          </span>
          {isAdmin && setClientData && (
            <button onClick={handleDelete} title="このクライアントを削除" style={{
              padding: '4px 12px', borderRadius: radius.lg, border: `1px solid ${color.border}`,
              background: color.white, fontSize: 11.5, color: color.textLight, cursor: 'pointer', fontFamily: font.family.sans,
            }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = color.danger; e.currentTarget.style.color = color.danger; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = color.border; e.currentTarget.style.color = color.textLight; }}
            >削除</button>
          )}
        </div>
        <div style={{ marginTop: 6, display: 'flex', gap: space[4], flexWrap: 'wrap', fontSize: 12, color: color.textMid }}>
          {primary && <span>主担当 {primary.name}{primary.email ? `（${primary.email}）` : ''}</span>}
          {c.representativeName && <span>代表 {c.representativeName}</span>}
          {c.address && <span>{c.address}</span>}
          {c.hpUrl && <a href={c.hpUrl} target="_blank" rel="noreferrer" style={{ color: color.navyLight }}>HP</a>}
        </div>
      </div>

      {/* 左：タブ（もの） ／ 右：活動履歴（したこと）。活動履歴は右に常に出す。 */}
      <div style={{
        display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'minmax(0,1fr) 400px',
        gap: space[5], marginTop: space[5], alignItems: 'start',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 2, marginBottom: space[3], flexWrap: 'wrap', height: 32, alignItems: 'center' }}>
            {tabs.map(([k, label, n]) => {
              const on = tab === k;
              return (
                <button key={k} onClick={() => setTab(k)} style={{
                  padding: '7px 15px', border: 'none', cursor: 'pointer', borderRadius: radius.md,
                  background: on ? color.navy : 'transparent', color: on ? color.white : color.textMid,
                  fontFamily: font.family.sans, fontSize: 12.5, fontWeight: on ? 700 : 500,
                }}>
                  {label}
                  {n > 0 && (
                    <span style={{
                      marginLeft: 6, padding: '1px 6px', borderRadius: radius.pill,
                      background: on ? 'rgba(255,255,255,0.22)' : color.gray100,
                      color: on ? color.white : color.textLight, fontSize: 10.5,
                    }}>{n}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={activityCardStyle}>
            {tab === 'profile' && (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', columnGap: space[6] }}>
                <div>
                  <div style={profileHead}>契約条件</div>
                  {c?._supaId && setClientData ? (
                    <EngagementRewardsInline clientId={c._supaId} rewardMaster={rewardMaster} />
                  ) : (
                    <FieldRow label="報酬体系" value={
                      c.rewardType ? (
                        <span onClick={(e) => { e.stopPropagation(); onShowReward?.(c.rewardType); }}
                          style={{ color: color.navyLight, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
                          {c.rewardType} {rm ? `(${rm.name})` : ''}
                        </span>
                      ) : '-'
                    } />
                  )}
                  <EditableField label="支払サイト" value={c.paySite} placeholder="例: 毎月末日〆翌月末払い"
                    datalistOptions={PAYMENT_SITE_OPTIONS} onSave={v => patchClient({ paySite: v })} />
                  <EditableField label="支払特記" value={c.payNote} placeholder="（任意）" onSave={v => patchClient({ payNote: v })} />
                  <EditableField label="契約締結日" value={c.contractSignedOn} placeholder="例: 2026-10-05" onSave={v => patchClient({ contractSignedOn: v })} />
                  <EditableField label="業種" value={c.industry} placeholder="（任意）" onSave={v => patchClient({ industry: v })} />
                  <EditableField label="単価（アポ1件・税込）" value={c.feeAmount != null ? `${Number(c.feeAmount).toLocaleString()}円` : ''}
                    placeholder="例: 110000" onSave={v => patchClient({ feeAmount: parseNum(v) })} />
                  <EditableField label="月の件数の上限" value={c.monthlyCap != null ? `${c.monthlyCap}件` : ''}
                    placeholder="例: 5（先方が面談をさばける量）" onSave={v => patchClient({ monthlyCap: parseNum(v) })} />
                  <EditableField label="試しの条件" value={c.trialTerms}
                    placeholder="例: 予算50万円・最初10件。3件以上で月5件の本契約" onSave={v => patchClient({ trialTerms: v })} />

                  <div style={profileHead}>獲得</div>
                  <EditableField label="獲得経路" value={c.acquisitionChannel} type="select" options={toOptions(CHANNEL_OPTIONS)}
                    onSave={v => patchClient({ acquisitionChannel: v })} />
                  {(c.acquisitionChannel === '紹介' || c.referrer) && (
                    <EditableField label="紹介元" value={c.referrer} placeholder="例: 〇〇株式会社 〇〇様" onSave={v => patchClient({ referrer: v })} />
                  )}

                  {(c.status === '停止中' || c.status === '保留' || c.stopReason) && (
                    <>
                      <div style={profileHead}>停止</div>
                      <EditableField label="止めた側" value={c.stoppedBy} type="select" options={toOptions(STOPPED_BY_OPTIONS)} onSave={v => patchClient({ stoppedBy: v })} />
                      <EditableField label="理由" value={c.stopReason} type="select" options={toOptions(STOP_REASON_OPTIONS)} onSave={v => patchClient({ stopReason: v })} />
                      <EditableField label="再開の見込み" value={c.resumeOutlook} type="select" options={toOptions(RESUME_OPTIONS)} onSave={v => patchClient({ resumeOutlook: v })} />
                      <EditableField label="ひとこと" value={c.stopNote} placeholder="（任意）" onSave={v => patchClient({ stopNote: v })} />
                    </>
                  )}
                </div>
                <div>
                  <div style={profileHead}>進み具合</div>
                  <EditableField label="サービス" value={c.service} type="select" options={toOptions(SERVICE_LIST)} onSave={v => patchClient({ service: v })} />
                  <EditableField label="段階" value={c.stage} type="select" options={toOptions(STAGE_LIST)} onSave={v => patchClient({ stage: v })} />
                  <EditableField label="最後のやり取り（日付）" value={c.lastContactAt} placeholder="例: 2026-10-06" onSave={v => patchClient({ lastContactAt: v })} />
                  <EditableField label="最後のやり取り（手段・どちらから）" value={[c.lastContactChannel, c.lastContactFrom].filter(Boolean).join('・')}
                    placeholder="例: メール・先方" onSave={v => { const [ch, fr] = (v || '').split(/[・,、]/); patchClient({ lastContactChannel: (ch || '').trim(), lastContactFrom: (fr || '').trim() }); }} />
                  <EditableField label="最後のやり取り（中身）" value={c.lastContactSummary} placeholder="例: 新しいリストを受領" onSave={v => patchClient({ lastContactSummary: v })} />
                  <EditableField label="次の一手" value={c.nextAction} placeholder="例: 近況伺いと再開の打診" onSave={v => patchClient({ nextAction: v })} />
                  <EditableField label="次の一手を持つ人" value={c.nextActionOwner} type="select" options={toOptions(NEXT_ACTION_OWNERS)} onSave={v => patchClient({ nextActionOwner: v })} />
                  <EditableField label="次の一手の期限" value={c.nextActionDue} placeholder="例: 2026-10-20" onSave={v => patchClient({ nextActionDue: v })} />
                  <EditableField label="止まっている理由" value={c.blocker} placeholder="（任意）" onSave={v => patchClient({ blocker: v })} />

                  <div style={profileHead}>進め方</div>
                  <EditableField label="リスト負担" value={c.listSrc} type="select"
                    options={[{ value: '', label: '—' }, { value: '当社持ち', label: '当社持ち' }, { value: '先方持ち', label: '先方持ち' }, { value: '両方', label: '両方' }]}
                    onSave={v => patchClient({ listSrc: v })} />
                  <EditableField label="カレンダー" value={c.calendar} type="select"
                    options={[{ value: '', label: '—' }, { value: 'Google', label: 'Google' }, { value: 'Spir', label: 'Spir' }, { value: 'Outlook', label: 'Outlook' }, { value: 'なし', label: 'なし' }, { value: '調整アポ', label: '調整アポ' }, { value: 'Google(入力)', label: 'Google(入力)' }]}
                    onSave={v => patchClient({ calendar: v })} />
                  <EditableField label="連絡手段" value={c.contact} type="select"
                    options={[{ value: '', label: '—' }, { value: 'LINE', label: 'LINE' }, { value: 'Slack', label: 'Slack' }, { value: 'Chatwork', label: 'Chatwork' }, { value: 'メール', label: 'メール' }]}
                    onSave={v => patchClient({ contact: v })} />
                  {c.contact === 'Slack' && (
                    <EditableField label="Slack Webhook URL（アポ報告用）" value={c.slackWebhookUrl}
                      placeholder="https://hooks.slack.com/services/..." onSave={v => patchClient({ slackWebhookUrl: v })} />
                  )}
                  {c.contact === 'Chatwork' && (
                    <EditableField label="Chatwork ルームID" value={c.chatworkRoomId} placeholder="123456789" onSave={v => patchClient({ chatworkRoomId: v })} />
                  )}
                  {/* 日程調整URLは担当者ごとのもの（担当者タブで持つ）なので、基本情報には出さない（2026-10-06 むー様） */}
                </div>
              </div>
            )}

            {tab === 'contacts' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[2] }}>
                  <div style={{ fontSize: 12, color: color.textMid }}>
                    {primary ? `主担当 ${primary.name}` : '担当者が登録されていません'}
                  </div>
                  {setContactsByClient && (
                    <button onClick={() => setContactDrawer({ isOpen: true, mode: 'add', existingContact: null })} style={{
                      padding: '4px 12px', borderRadius: radius.lg, border: `1px solid ${color.border}`,
                      background: color.white, color: color.navyLight, fontSize: 11.5, cursor: 'pointer', fontFamily: font.family.sans,
                    }}>担当者を追加</button>
                  )}
                </div>
                {sortedContacts.map(ct => (
                  <div key={ct.id} onClick={() => setContactDrawer({ isOpen: true, mode: 'edit', existingContact: ct })}
                    style={{ padding: '10px 4px', borderTop: `1px solid ${color.borderLight}`, cursor: 'pointer' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = color.gray50; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: color.textDark }}>{ct.name}</span>
                      {ct.isPrimary && <span style={pill(true, color.navy)}>主担当</span>}
                    </div>
                    {ct.email && <div style={{ marginTop: 2, fontSize: 12, color: color.textMid }}>{ct.email}</div>}
                    {c.contact === 'Slack' && ct.slackMemberId && <div style={{ fontSize: 11, color: color.textLight, marginTop: 2 }}>@{ct.slackMemberId}</div>}
                  </div>
                ))}
              </div>
            )}

            {tab === 'meetings' && (
              <ClientMeetingsSection clientId={c?._supaId} currentUser={currentUser} />
            )}
          </div>
        </div>

        <div style={{ position: isMobile ? 'static' : 'sticky', top: 16, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, marginBottom: space[3], padding: '0 3px' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: color.textDark }}>活動履歴</span>
            {activity.items.length > 0 && <span style={{ fontSize: 10.5, color: color.textLight }}>{activity.items.length}</span>}
          </div>
          <div style={activityCardStyle}>
            <ClientActivity
              clientId={c._supaId}
              currentUser={currentUser}
              items={activity.items}
              error={activity.error}
              onSaved={activity.reload}
              onOpenMeeting={() => setTab('meetings')}
            />
          </div>
        </div>
      </div>

      {/* 担当者ドロワー */}
      {setContactsByClient && c?._supaId && (
        <ContactDrawer
          isOpen={contactDrawer.isOpen}
          onClose={() => setContactDrawer({ isOpen: false, mode: 'add', existingContact: null })}
          mode={contactDrawer.mode}
          clientSupaId={c._supaId}
          clientContactMethod={c.contact}
          existingContact={contactDrawer.existingContact}
          onChanged={({ type, contact }) => {
            const cid = c._supaId;
            if (!cid) return;
            if (type === 'added' && contact) {
              setContactsByClient(prev => {
                const list = prev[cid] || [];
                const next = contact.isPrimary
                  ? list.map(x => ({ ...x, isPrimary: false }))
                  : list;
                return { ...prev, [cid]: [...next, contact] };
              });
            } else if (type === 'updated' && contact) {
              setContactsByClient(prev => {
                const list = prev[cid] || [];
                const others = contact.isPrimary
                  ? list.map(x => x.id === contact.id ? x : { ...x, isPrimary: false })
                  : list;
                return {
                  ...prev,
                  [cid]: others.map(x => x.id === contact.id ? { ...x, ...contact } : x),
                };
              });
            } else if (type === 'deleted' && contact) {
              setContactsByClient(prev => ({
                ...prev,
                [cid]: (prev[cid] || []).filter(x => x.id !== contact.id),
              }));
            }
          }}
        />
      )}

    </div>
  );
}
