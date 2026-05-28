import { useState, useEffect, useMemo, useRef } from 'react';
import { C } from '../../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Input, Select, Card, Badge } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { getOrgId } from '../../../lib/orgContext';
import { updateClientNextContactAt, updateClient } from '../../../lib/supabaseWrite';
import { useIsMobile } from '../../../hooks/useIsMobile';
import ContactDrawer from './ContactDrawer';
import ActivityTimeline from './ActivityTimeline';
import ClientMonthlyTargetSection from '../crm/ClientMonthlyTargetSection';
import ClientMeetingsSection from '../crm/ClientMeetingsSection';

const NAVY = '#0D2247';
const BLUE = '#1E40AF';
const GRAY_200 = '#E5E7EB';
const GRAY_100 = '#F3F4F6';
const GRAY_50 = '#F8F9FA';
const GOLD = '#B8860B';

const statusStyle = (st) => {
  if (st === '支援中') return { color: '#10B981' };
  if (st === '準備中') return { color: C.gold };
  if (st === '停止中') return { color: '#e53835' };
  if (st === '保留') return { color: C.textLight };
  if (st === '中期フォロー') return { color: NAVY };
  if (st === '面談予定') return { color: '#7c3aed' };
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
function EditableField({ label, value, type = 'text', options, placeholder, onSave, mono = false, valueColor }) {
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
          <input
            ref={inputRef}
            type={type === 'email' ? 'email' : 'text'}
            value={localVal}
            onChange={e => setLocalVal(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Escape') cancel(); if (e.key === 'Enter') commit(); }}
            placeholder={placeholder}
            style={{
              width: '100%', padding: '4px 6px', border: `1px solid ${NAVY}`,
              borderRadius: radius.sm, fontSize: font.size.xs,
              fontFamily: mono ? font.family.mono : font.family.sans,
              color: C.textDark, outline: 'none', background: color.white, boxSizing: 'border-box',
            }}
          />
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

// ActivityTimeline カード (デフォルト開)
function ActivityTimelineCard({ clientSupaId, contactsByClient }) {
  return (
    <CollapsibleCard title="Activity Timeline" defaultOpen={true}>
      <div style={{ maxHeight: 600, overflowY: 'auto' }}>
        <ActivityTimeline clientSupaId={clientSupaId} contactsByClient={contactsByClient} />
      </div>
    </CollapsibleCard>
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
  const initial = client.nextContactAt ? String(client.nextContactAt).slice(0, 10) : '';
  const [val, setVal] = useState(initial);
  useEffect(() => {
    setVal(client.nextContactAt ? String(client.nextContactAt).slice(0, 10) : '');
  }, [client.nextContactAt]);

  const handleSave = async () => {
    const newVal = val ? new Date(val + 'T09:00:00').toISOString() : null;
    if (newVal === client.nextContactAt) return;
    if (!client._supaId) return;
    const { error } = await updateClientNextContactAt(client._supaId, newVal);
    if (error) { alert('保存に失敗しました'); return; }
    if (setClientData) {
      setClientData(prev => prev.map(x =>
        x._supaId === client._supaId ? { ...x, nextContactAt: newVal } : x
      ));
    }
  };

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 9, fontWeight: font.weight.semibold, color: C.textLight, marginBottom: 2 }}>次回接点予定日</div>
      <input
        type="date"
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={handleSave}
        disabled={!setClientData}
        style={{
          width: '100%', padding: '6px 8px', borderRadius: radius.sm,
          border: `1px solid ${GRAY_200}`,
          fontSize: font.size.xs, fontFamily: font.family.sans, outline: 'none',
          background: setClientData ? color.white : GRAY_50,
          color: C.textDark,
        }}
      />
    </div>
  );
}

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
  onEdit,
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

  // 関連リスト (このクライアントの架電リスト)
  const relatedLists = useMemo(() => {
    if (!c?.company) return [];
    return (callListData || []).filter(l => l.company === c.company && !l.is_archived);
  }, [callListData, c?.company]);

  // 数字: 累計売上 / 今月着地 / 契約開始
  const [stats, setStats] = useState({ totalSales: 0, monthSales: 0, contractStart: null, loading: true });

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
  // 担当者ドロワー
  const [contactDrawer, setContactDrawer] = useState({ isOpen: false, mode: 'add', existingContact: null });
  // モバイル時のタブ切替
  const isMobile = useIsMobile();

  useEffect(() => {
    let cancelled = false;
    if (!c?._supaId) { setStats({ totalSales: 0, monthSales: 0, contractStart: null, loading: false }); return; }
    (async () => {
      const orgId = getOrgId();
      if (!orgId) return;
      try {
        // 累計売上 + 今月着地（appointments.sales_amount 集計）
        const { data: appos } = await supabase
          .from('appointments')
          .select('sales_amount, appointment_date, created_at')
          .eq('org_id', orgId)
          .eq('client_id', c._supaId);
        let total = 0;
        let month = 0;
        const now = new Date();
        const yyyymm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        (appos || []).forEach(a => {
          const amt = Number(a.sales_amount) || 0;
          total += amt;
          const dt = a.appointment_date || a.created_at;
          if (dt && String(dt).startsWith(yyyymm)) month += amt;
        });
        // 契約開始 = clients.created_at
        const { data: clientRow } = await supabase
          .from('clients')
          .select('created_at')
          .eq('id', c._supaId)
          .maybeSingle();
        if (!cancelled) {
          setStats({
            totalSales: total,
            monthSales: month,
            contractStart: clientRow?.created_at || null,
            loading: false,
          });
        }
      } catch (e) {
        console.warn('[ClientDetail] stats fetch failed', e);
        if (!cancelled) setStats(s => ({ ...s, loading: false }));
      }
    })();
    return () => { cancelled = true; };
  }, [c?._supaId]);

  const contacts = (c?._supaId && contactsByClient[c._supaId]) || [];
  const sortedContacts = [...contacts].sort((a, b) => {
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    return 0;
  });

  if (!c) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: C.textLight, fontFamily: font.family.sans }}>
        クライアントが選択されていません
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn 0.2s ease', fontFamily: font.family.sans, color: C.textDark }}>
      {/* Top header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px', background: color.white,
        border: `1px solid ${GRAY_200}`, borderRadius: radius.md, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={onBack}
            style={{
              padding: '6px 12px', borderRadius: radius.md,
              border: `1px solid ${GRAY_200}`, background: color.white,
              fontSize: font.size.xs, color: C.textMid,
              cursor: 'pointer', fontFamily: font.family.sans,
            }}
          >‹ 一覧に戻る</button>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            {setClientData ? (
              <select
                value={c.status || ''}
                onChange={async (e) => { await patchClient({ status: e.target.value, statusChangedAt: new Date().toISOString() }); }}
                title="ステータスを変更"
                style={{
                  borderLeft: `3px solid ${sc.color}`, paddingLeft: 8,
                  border: 'none', borderRadius: 0,
                  color: sc.color, fontSize: font.size.xs, fontWeight: font.weight.semibold,
                  background: 'transparent', cursor: 'pointer', fontFamily: font.family.sans,
                  outline: 'none',
                }}
              >
                {['準備中','支援中','停止中','保留','中期フォロー','面談予定'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            ) : (
              <span style={{
                borderLeft: `3px solid ${sc.color}`, paddingLeft: 8,
                color: sc.color, fontSize: font.size.xs, fontWeight: font.weight.semibold,
              }}>{c.status}</span>
            )}
            {setClientData ? (
              <select
                value={c.contract || '未'}
                onChange={async (e) => { await patchClient({ contract: e.target.value }); }}
                title="契約状態を変更"
                style={{
                  fontSize: 9, padding: '2px 8px', borderRadius: radius.sm,
                  background: c.contract === '済' ? NAVY + '12' : GRAY_50,
                  color: c.contract === '済' ? NAVY : C.textLight,
                  border: 'none', cursor: 'pointer', fontFamily: font.family.sans,
                  fontWeight: font.weight.semibold, outline: 'none',
                }}
              >
                <option value="未">契約未</option>
                <option value="済">契約済</option>
              </select>
            ) : (
              c.contract === '済' && (
                <span style={{
                  fontSize: 9, padding: '2px 8px', borderRadius: radius.sm,
                  background: NAVY + '12', color: NAVY, fontWeight: font.weight.semibold,
                }}>契約済</span>
              )
            )}
            <span style={{ fontSize: 17, fontWeight: font.weight.bold, color: NAVY }}>{c.company}</span>
            {c.industry && (
              <span style={{ fontSize: font.size.xs, color: C.textLight }}>{c.industry}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {isAdmin && onEdit && (
            <button
              onClick={() => onEdit(c)}
              title="顧客情報を編集"
              style={{
                padding: '5px 12px', borderRadius: radius.md,
                border: `1px solid ${GRAY_200}`, background: color.white,
                fontSize: font.size.xs, color: C.textMid, fontWeight: font.weight.medium,
                cursor: 'pointer', fontFamily: font.family.sans,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = NAVY; e.currentTarget.style.color = NAVY; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = GRAY_200; e.currentTarget.style.color = C.textMid; }}
            >編集</button>
          )}
        </div>
      </div>

      {/* サマリーバー: 重要情報を1行で */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16,
        padding: '10px 16px', background: GRAY_50,
        border: `1px solid ${GRAY_200}`, borderRadius: radius.md,
        marginBottom: 12, fontSize: font.size.xs, color: C.textMid,
      }}>
        {c.industry && (
          <div>
            <span style={{ color: C.textLight, marginRight: 4 }}>業種</span>
            <span style={{ color: C.textDark, fontWeight: font.weight.medium }}>{c.industry}</span>
          </div>
        )}
        {sortedContacts.length > 0 && (
          <div>
            <span style={{ color: C.textLight, marginRight: 4 }}>主担当</span>
            <span style={{ color: NAVY, fontWeight: font.weight.semibold }}>
              {sortedContacts.find(ct => ct.isPrimary)?.name || sortedContacts[0]?.name || '—'}
            </span>
            {sortedContacts.length > 1 && (
              <span style={{ color: C.textLight, marginLeft: 4 }}>+{sortedContacts.length - 1}名</span>
            )}
          </div>
        )}
        {c.rewardType && (
          <div>
            <span style={{ color: C.textLight, marginRight: 4 }}>報酬</span>
            <span
              onClick={(e) => { e.stopPropagation(); onShowReward?.(c.rewardType); }}
              style={{
                color: NAVY, fontWeight: font.weight.semibold,
                cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted',
              }}
            >{c.rewardType}</span>
          </div>
        )}
        <div>
          <span style={{ color: C.textLight, marginRight: 4 }}>次回接点</span>
          <span style={{ color: C.textDark, fontFamily: font.family.mono }}>
            {c.nextContactAt ? fmtDate(c.nextContactAt) : '—'}
          </span>
        </div>
        {!stats.loading && (
          <div>
            <span style={{ color: C.textLight, marginRight: 4 }}>累計売上</span>
            <span style={{ color: NAVY, fontWeight: font.weight.semibold, fontFamily: font.family.mono }}>
              {yen(stats.totalSales)}
            </span>
          </div>
        )}
        {!stats.loading && stats.contractStart && (
          <div>
            <span style={{ color: C.textLight, marginRight: 4 }}>契約開始</span>
            <span style={{ color: C.textDark, fontFamily: font.family.mono }}>
              {fmtDate(stats.contractStart)}
            </span>
          </div>
        )}
      </div>

      {/* 3-column layout: 左=担当者/契約条件/数字 / 中=面談議事録 / 右=Activity Timeline */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '320px 1fr 360px',
        gap: 16,
        alignItems: 'start',
      }}>
        {/* Left column: 担当者・契約条件・数字・月別目標・関連リスト */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {/* 担当者カード (コンパクト) */}
          <CollapsibleCard title={`担当者 (${sortedContacts.length})`} defaultOpen={true}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            paddingBottom: 6, marginBottom: 6,
          }}>
            <div style={{ fontSize: 10, color: C.textLight }}>
              {sortedContacts.length > 0 ? '主担当: ' + (sortedContacts.find(ct => ct.isPrimary)?.name || sortedContacts[0]?.name || '—') : ''}
            </div>
            {setContactsByClient && (
              <button
                onClick={() => setContactDrawer({ isOpen: true, mode: 'add', existingContact: null })}
                style={{
                  padding: '4px 10px', borderRadius: radius.sm,
                  border: `1px solid ${NAVY}`, background: color.white,
                  color: NAVY, fontSize: 10, fontWeight: font.weight.medium,
                  cursor: 'pointer', fontFamily: font.family.sans,
                }}
              >＋ 追加</button>
            )}
          </div>

          {sortedContacts.length === 0 ? (
            <div style={{ fontSize: font.size.xs, color: C.textLight, padding: 12, textAlign: 'center' }}>
              担当者が登録されていません
            </div>
          ) : (
            sortedContacts.map(ct => (
              <div
                key={ct.id}
                onClick={() => setContactDrawer({ isOpen: true, mode: 'edit', existingContact: ct })}
                style={{
                  padding: '10px 8px',
                  borderBottom: `1px solid ${GRAY_100}`,
                  cursor: 'pointer', transition: 'background 0.12s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#EAF4FF'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  {ct.isPrimary && (
                    <span style={{
                      fontSize: 8, fontWeight: font.weight.bold, letterSpacing: 1,
                      color: NAVY, border: `1px solid ${NAVY}`,
                      borderRadius: 2, padding: '1px 4px',
                    }}>主</span>
                  )}
                  <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: NAVY }}>{ct.name}</span>
                </div>
                {ct.email && (
                  <div style={{ fontSize: 10, color: C.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ct.email}
                  </div>
                )}
                {c.contact === 'Slack' && ct.slackMemberId && (
                  <div style={{ fontSize: 9, color: C.textLight, marginTop: 2 }}>@{ct.slackMemberId}</div>
                )}
                <div style={{
                  marginTop: 4, fontSize: 10, color: NAVY, fontWeight: font.weight.medium,
                }}>詳細を開く ›</div>
              </div>
            ))
          )}
          </CollapsibleCard>

          {/* 契約条件カード (デフォルト開・各フィールドをクリックで編集) */}
          <CollapsibleCard title="契約条件" defaultOpen={true}>
            <NextContactRow client={c} setClientData={setClientData} />
            {/* 報酬体系・税区分は商材タイプ別の複雑な構造のため、ここではモーダルへ誘導 */}
            <FieldRow label="報酬体系" value={
              c.rewardType ? (
                <span onClick={(e) => { e.stopPropagation(); onShowReward?.(c.rewardType); }}
                  style={{ color: NAVY, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
                  {c.rewardType} {rm ? `(${rm.name})` : ''}
                </span>
              ) : '-'
            } />
            <FieldRow label="税区分" value={rm ? rm.tax : '-'} />
            <EditableField
              label="支払サイト" value={c.paySite}
              placeholder="例: 月末締め翌月末払い"
              onSave={v => patchClient({ paySite: v })}
            />
            <EditableField
              label="支払特記" value={c.payNote}
              placeholder="（任意）"
              onSave={v => patchClient({ payNote: v })}
            />
            <EditableField
              label="リスト負担" value={c.listSrc} type="select"
              options={[
                { value: '', label: '—' },
                { value: '当社持ち', label: '当社持ち' },
                { value: '先方持ち', label: '先方持ち' },
                { value: '両方', label: '両方' },
              ]}
              onSave={v => patchClient({ listSrc: v })}
            />
            <EditableField
              label="カレンダー" value={c.calendar} type="select"
              options={[
                { value: '', label: '—' },
                { value: 'Google', label: 'Google' },
                { value: 'Spir', label: 'Spir' },
                { value: 'Outlook', label: 'Outlook' },
                { value: 'なし', label: 'なし' },
                { value: '調整アポ', label: '調整アポ' },
                { value: 'Google(入力)', label: 'Google(入力)' },
              ]}
              onSave={v => patchClient({ calendar: v })}
            />
            <EditableField
              label="連絡手段" value={c.contact} type="select"
              options={[
                { value: '', label: '—' },
                { value: 'LINE', label: 'LINE' },
                { value: 'Slack', label: 'Slack' },
                { value: 'Chatwork', label: 'Chatwork' },
                { value: 'メール', label: 'メール' },
              ]}
              onSave={v => patchClient({ contact: v })}
            />
            <EditableField
              label="メールアドレス" value={c.clientEmail} type="email"
              placeholder="client@example.com"
              onSave={v => patchClient({ clientEmail: v })}
            />
          </CollapsibleCard>

          {/* 数字カード (デフォルト開) */}
          <CollapsibleCard title="数字" defaultOpen={true}>
            {stats.loading ? (
              <div style={{ fontSize: font.size.xs, color: C.textLight }}>読み込み中...</div>
            ) : (
              <>
                <FieldRow label="累計売上" value={yen(stats.totalSales)} mono valueColor={NAVY} />
                <FieldRow label="今月着地" value={yen(stats.monthSales)} mono />
                <FieldRow label="契約開始" value={fmtDate(stats.contractStart)} mono />
              </>
            )}
          </CollapsibleCard>

          {/* 月別目標カード (支援中のみ・デフォルト閉) */}
          {c.status === '支援中' && (
            <CollapsibleCard title="月別目標" defaultOpen={false}>
              <ClientMonthlyTargetSection clientId={c._supaId} />
            </CollapsibleCard>
          )}

          {/* 関連リストカード (デフォルト閉) */}
          {relatedLists.length > 0 && (
            <CollapsibleCard title={`関連リスト (${relatedLists.length})`} defaultOpen={false}>
              {relatedLists.slice(0, 8).map(l => (
                <div key={l._supaId || l.id} style={{
                  fontSize: font.size.xs, color: C.textDark,
                  padding: '5px 0', borderBottom: `1px solid ${GRAY_100}`,
                  display: 'flex', justifyContent: 'space-between', gap: 6,
                }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {l.industry || '(無題)'}
                  </span>
                  <span style={{ fontFamily: font.family.mono, fontSize: 10, color: C.textLight, flexShrink: 0 }}>
                    {l.count || 0}件
                  </span>
                </div>
              ))}
              {relatedLists.length > 8 && (
                <div style={{ fontSize: 10, color: C.textLight, marginTop: 6 }}>他 {relatedLists.length - 8} 件</div>
              )}
            </CollapsibleCard>
          )}
        </div>

        {/* Center column: 面談記録 (メイン) */}
        <div style={{
          background: color.white, border: `1px solid ${GRAY_200}`, borderRadius: radius.md,
          padding: '10px 14px',
        }}>
          <ClientMeetingsSection clientId={c?._supaId} currentUser={currentUser} />
        </div>

        {/* Right column: Activity Timeline (デフォルト開) */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <ActivityTimelineCard clientSupaId={c?._supaId} contactsByClient={contactsByClient} />
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
