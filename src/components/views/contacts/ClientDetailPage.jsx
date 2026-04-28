import { useState, useEffect, useMemo } from 'react';
import { C } from '../../../constants/colors';
import { supabase } from '../../../lib/supabase';
import { getOrgId } from '../../../lib/orgContext';
import ContactDrawer from './ContactDrawer';
import ActivityTimeline from './ActivityTimeline';

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
function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: NAVY,
      letterSpacing: 1.5,
      borderBottom: `1px solid ${GRAY_200}`,
      paddingBottom: 6, marginBottom: 10, marginTop: 18,
    }}>{children}</div>
  );
}

function FieldRow({ label, value, mono = false, valueColor }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 9, fontWeight: 600, color: C.textLight, marginBottom: 2 }}>{label}</div>
      <div style={{
        fontSize: 11, color: valueColor || C.textDark, fontWeight: 500, lineHeight: 1.5,
        fontFamily: mono ? "'JetBrains Mono', monospace" : "'Noto Sans JP', sans-serif",
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
  // 担当者ドロワー
  const [contactDrawer, setContactDrawer] = useState({ isOpen: false, mode: 'add', existingContact: null });

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
      <div style={{ padding: 40, textAlign: 'center', color: C.textLight, fontFamily: "'Noto Sans JP', sans-serif" }}>
        クライアントが選択されていません
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn 0.2s ease', fontFamily: "'Noto Sans JP', sans-serif", color: C.textDark }}>
      {/* Top header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px', background: '#fff',
        border: `1px solid ${GRAY_200}`, borderRadius: 4, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={onBack}
            style={{
              padding: '6px 12px', borderRadius: 4,
              border: `1px solid ${GRAY_200}`, background: '#fff',
              fontSize: 11, color: C.textMid,
              cursor: 'pointer', fontFamily: "'Noto Sans JP', sans-serif",
            }}
          >‹ 一覧に戻る</button>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{
              borderLeft: `3px solid ${sc.color}`, paddingLeft: 8,
              color: sc.color, fontSize: 11, fontWeight: 600,
            }}>{c.status}</span>
            {c.contract === '済' && (
              <span style={{
                fontSize: 9, padding: '2px 8px', borderRadius: 3,
                background: NAVY + '12', color: NAVY, fontWeight: 600,
              }}>契約済</span>
            )}
            <span style={{ fontSize: 17, fontWeight: 700, color: NAVY }}>{c.company}</span>
            {c.industry && (
              <span style={{ fontSize: 11, color: C.textLight }}>{c.industry}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {isAdmin && onEdit && (
            <button
              onClick={() => onEdit(c)}
              title="顧客情報を編集"
              style={{
                padding: '5px 12px', borderRadius: 4,
                border: `1px solid ${GRAY_200}`, background: '#fff',
                fontSize: 11, color: C.textMid, fontWeight: 500,
                cursor: 'pointer', fontFamily: "'Noto Sans JP', sans-serif",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = NAVY; e.currentTarget.style.color = NAVY; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = GRAY_200; e.currentTarget.style.color = C.textMid; }}
            >編集</button>
          )}
        </div>
      </div>

      {/* 3-pane layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '280px 1fr 320px',
        gap: 16,
        alignItems: 'start',
      }}>
        {/* Left pane: profile / contract / numbers / lists / notes */}
        <div style={{
          background: '#fff', border: `1px solid ${GRAY_200}`, borderRadius: 4,
          padding: '14px 16px', maxHeight: 'calc(100vh - 200px)', overflowY: 'auto',
        }}>
          <SectionTitle>契約条件</SectionTitle>
          <FieldRow label="月間目標" value={c.target > 0 ? `${c.target} 件 / 月` : '-'} mono />
          <FieldRow label="報酬体系" value={
            c.rewardType ? (
              <span
                onClick={(e) => { e.stopPropagation(); onShowReward?.(c.rewardType); }}
                style={{ color: NAVY, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
              >{c.rewardType} {rm ? `(${rm.name})` : ''}</span>
            ) : '-'
          } />
          <FieldRow label="税区分" value={rm ? rm.tax : '-'} />
          <FieldRow label="支払サイト" value={c.paySite} />
          <FieldRow label="支払特記" value={c.payNote} />
          <FieldRow label="リスト負担" value={c.listSrc} />
          <FieldRow label="カレンダー" value={c.calendar} />
          <FieldRow label="連絡手段" value={c.contact} />
          {c.clientEmail && <FieldRow label="メールアドレス" value={c.clientEmail} />}
          {c.googleCalendarId && <FieldRow label="Google Calendar ID" value={c.googleCalendarId} />}
          {c.schedulingUrl && <FieldRow label="日程調整 URL" value={c.schedulingUrl} />}

          <SectionTitle>数字</SectionTitle>
          {stats.loading ? (
            <div style={{ fontSize: 11, color: C.textLight }}>読み込み中...</div>
          ) : (
            <>
              <FieldRow label="累計売上" value={yen(stats.totalSales)} mono valueColor={NAVY} />
              <FieldRow label="今月着地" value={yen(stats.monthSales)} mono />
              <FieldRow label="契約開始" value={fmtDate(stats.contractStart)} mono />
            </>
          )}

          <SectionTitle>関連リスト ({relatedLists.length})</SectionTitle>
          {relatedLists.length === 0 ? (
            <div style={{ fontSize: 11, color: C.textLight }}>登録なし</div>
          ) : (
            relatedLists.slice(0, 8).map(l => (
              <div key={l._supaId || l.id} style={{
                fontSize: 11, color: C.textDark,
                padding: '5px 0', borderBottom: `1px solid ${GRAY_100}`,
                display: 'flex', justifyContent: 'space-between', gap: 6,
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.industry || '(無題)'}
                </span>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: C.textLight, fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                }}>{l.count || 0}件</span>
              </div>
            ))
          )}
          {relatedLists.length > 8 && (
            <div style={{ fontSize: 10, color: C.textLight, marginTop: 6 }}>他 {relatedLists.length - 8} 件</div>
          )}

          {(c.noteFirst || c.noteKickoff || c.noteRegular) && (
            <>
              <SectionTitle>備考</SectionTitle>
              {[
                { label: '初回面談時', val: c.noteFirst },
                { label: 'キックオフ MTG 時', val: c.noteKickoff },
                { label: '定期 MTG 時', val: c.noteRegular },
              ].filter(n => n.val).map((n, ni) => (
                <div key={ni} style={{ marginBottom: 8 }}>
                  <div style={{
                    fontSize: 9, fontWeight: 700, color: NAVY, marginBottom: 3,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: NAVY, display: 'inline-block' }} />
                    {n.label}
                  </div>
                  <div style={{
                    fontSize: 11, color: C.textMid, whiteSpace: 'pre-wrap', lineHeight: 1.6,
                    padding: '4px 0 4px 8px', borderLeft: `2px solid ${GRAY_200}`,
                    maxHeight: 180, overflow: 'auto',
                  }}>
                    {String(n.val).replace(/\\n/g, '\n')}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Center pane: Activity Timeline */}
        <div style={{
          background: '#fff', border: `1px solid ${GRAY_200}`, borderRadius: 4,
          padding: '14px 16px', maxHeight: 'calc(100vh - 200px)', overflowY: 'auto',
        }}>
          <ActivityTimeline
            clientSupaId={c?._supaId}
            contactsByClient={contactsByClient}
          />
        </div>

        {/* Right pane: contacts */}
        <div style={{
          background: '#fff', border: `1px solid ${GRAY_200}`, borderRadius: 4,
          padding: '14px 16px', maxHeight: 'calc(100vh - 200px)', overflowY: 'auto',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: `1px solid ${GRAY_200}`, paddingBottom: 8, marginBottom: 10,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, letterSpacing: 1 }}>
              担当者 ({sortedContacts.length})
            </div>
            {setContactsByClient && (
              <button
                onClick={() => setContactDrawer({ isOpen: true, mode: 'add', existingContact: null })}
                style={{
                  padding: '4px 10px', borderRadius: 3,
                  border: `1px solid ${NAVY}`, background: '#fff',
                  color: NAVY, fontSize: 10, fontWeight: 500,
                  cursor: 'pointer', fontFamily: "'Noto Sans JP', sans-serif",
                }}
              >＋ 追加</button>
            )}
          </div>

          {sortedContacts.length === 0 ? (
            <div style={{ fontSize: 11, color: C.textLight, padding: 12, textAlign: 'center' }}>
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
                      fontSize: 8, fontWeight: 700, letterSpacing: 1,
                      color: NAVY, border: `1px solid ${NAVY}`,
                      borderRadius: 2, padding: '1px 4px',
                    }}>主</span>
                  )}
                  <span style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{ct.name}</span>
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
                  marginTop: 4, fontSize: 10, color: NAVY, fontWeight: 500,
                }}>詳細を開く ›</div>
              </div>
            ))
          )}
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
