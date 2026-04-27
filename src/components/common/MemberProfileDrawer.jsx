import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import { updateMemberProfile } from '../../lib/supabaseWrite';
import { C } from '../../constants/colors';

const STORAGE_KEY = 'spanavi_member_drawer_width';
const DEFAULT_WIDTH = Math.round(typeof window !== 'undefined' ? window.innerWidth * 0.25 : 400);
const MIN_WIDTH = 280;
const MAX_WIDTH_FRAC = 0.6; // 画面の 60% まで

const MemberProfileContext = createContext({
  openProfile: () => {},
  close: () => {},
  isOpen: false,
});

export function useMemberProfile() {
  return useContext(MemberProfileContext);
}

// SpanaviApp 直下で使う Provider（children の右側に固定 drawer を出す）
export function MemberProfileProvider({ children, currentUserId, isAdmin }) {
  const [memberId, setMemberId] = useState(null);
  const [width, setWidth] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_WIDTH;
    const v = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
    return v >= MIN_WIDTH ? v : DEFAULT_WIDTH;
  });

  const openProfile = useCallback(id => setMemberId(id || null), []);
  const close = useCallback(() => setMemberId(null), []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(width)); } catch { /* ignore */ }
  }, [width]);

  // ESC で閉じる
  useEffect(() => {
    if (!memberId) return;
    const onKey = e => { if (e.key === 'Escape') setMemberId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [memberId]);

  return (
    <MemberProfileContext.Provider value={{ openProfile, close, isOpen: !!memberId }}>
      <div style={{ paddingRight: memberId ? width : 0, transition: 'padding-right 0.15s ease', minHeight: '100vh' }}>
        {children}
      </div>
      {memberId && (
        <MemberProfileDrawer
          memberId={memberId}
          width={width}
          onResize={setWidth}
          onClose={close}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
        />
      )}
    </MemberProfileContext.Provider>
  );
}

function MemberProfileDrawer({ memberId, width, onResize, onClose, currentUserId, isAdmin }) {
  const [member, setMember] = useState(null);
  const [engagements, setEngagements] = useState([]); // [{id, name, slug, team, role_name, rank_name, override_rate}]
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setEditing(false);
    setSaveError(null);
    const orgId = getOrgId();
    const { data: m } = await supabase
      .from('members')
      .select('id, user_id, name, email, phone_number, start_date, position, team, avatar_url, university, grade, job_offer, referrer_name, zoom_user_id, zoom_phone_number')
      .eq('id', memberId)
      .maybeSingle();
    setMember(m || null);
    setForm({
      name: m?.name || '',
      email: m?.email || '',
      phone_number: m?.phone_number || '',
      start_date: m?.start_date || '',
    });

    // 所属する各事業 + role + rank
    const { data: assignments, error: aErr } = await supabase
      .from('member_engagements')
      .select(`
        engagement_id,
        incentive_rate_override,
        engagement:engagements!inner(id, name, slug, status),
        role:engagement_roles(id, name),
        rank:engagement_ranks(id, name, default_incentive_rate)
      `)
      .eq('member_id', memberId)
      .eq('org_id', orgId)
      .eq('engagement.status', 'active');
    if (aErr) console.error('[MemberProfileDrawer] assignments error:', aErr);
    const list = (assignments || [])
      .map(a => ({
        engagement_id: a.engagement_id,
        engagement_name: a.engagement?.name || '',
        engagement_slug: a.engagement?.slug || '',
        role_name: a.role?.name || null,
        rank_name: a.rank?.name || null,
        override_rate: a.incentive_rate_override ?? null,
        default_rate: a.rank?.default_incentive_rate ?? null,
      }))
      .filter(a => a.engagement_slug !== 'masp')
      .sort((a, b) => (a.engagement_name || '').localeCompare(b.engagement_name || ''));
    setEngagements(list);
    setLoading(false);
  }, [memberId]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const isOwn = member && member.user_id === currentUserId;
  const canEdit = isOwn || isAdmin;

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const err1 = await updateMemberProfile(memberId, {
      name: form.name,
      email: form.email,
      phone_number: form.phone_number,
      start_date: form.start_date || null,
    });
    if (err1) {
      setSaveError(err1.message || '保存に失敗しました');
      setSaving(false);
      return;
    }
    setMember(m => ({ ...m, ...form }));
    setEditing(false);
    setSaving(false);
  };

  // ── Resize handle ──
  const startResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const max = Math.round(window.innerWidth * MAX_WIDTH_FRAC);
    const onMove = (ev) => {
      const dx = startX - ev.clientX; // 左にドラッグで広がる
      const next = Math.max(MIN_WIDTH, Math.min(max, startWidth + dx));
      onResize(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <aside style={{
      position: 'fixed', top: 0, right: 0, height: '100vh', width,
      background: C.white, borderLeft: `1px solid ${C.border}`,
      boxShadow: '-2px 0 12px rgba(0,0,0,0.06)', zIndex: 8500,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: "'Noto Sans JP', sans-serif",
    }}>
      {/* 左端ドラッグハンドル */}
      <div
        onMouseDown={startResize}
        style={{
          position: 'absolute', top: 0, left: 0, bottom: 0, width: 5,
          cursor: 'col-resize', zIndex: 1,
          // 視覚化: hover でラインが濃くなる
        }}
        onMouseEnter={e => { e.currentTarget.style.background = C.navy + '20'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      />

      {/* ヘッダー */}
      <div style={{
        padding: '14px 18px', borderBottom: `1px solid ${C.borderLight}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        background: C.white,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, letterSpacing: '0.06em' }}>プロフィール</div>
        <button onClick={onClose} title="閉じる (Esc)"
          style={{ width: 26, height: 26, borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: C.textMid, fontSize: 18, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          ×
        </button>
      </div>

      {/* 本体 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
        {loading ? (
          <div style={{ color: C.textLight, fontSize: 12, textAlign: 'center', padding: 40 }}>読込中…</div>
        ) : !member ? (
          <div style={{ color: C.textLight, fontSize: 12, textAlign: 'center', padding: 40 }}>メンバー情報が取得できませんでした</div>
        ) : (
          <>
            {/* アバター + 氏名 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: C.navy, color: C.white,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, fontWeight: 700, flexShrink: 0, overflow: 'hidden',
              }}>
                {member.avatar_url
                  ? <img src={member.avatar_url} alt={member.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (member.name || '?')[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.navy, marginBottom: 4 }}>{member.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {member.position && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: C.navy + '12', color: C.navy, fontWeight: 600 }}>{member.position}</span>
                  )}
                  {isOwn && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#10B98115', color: '#059669', fontWeight: 600 }}>あなた</span>
                  )}
                </div>
              </div>
              {canEdit && !editing && (
                <button onClick={() => setEditing(true)}
                  style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, background: C.white, color: C.navy, border: `1px solid ${C.navy}`, borderRadius: 3, cursor: 'pointer', fontFamily: "'Noto Sans JP'" }}>
                  編集
                </button>
              )}
            </div>

            {/* 基本情報 */}
            <Section title="基本情報">
              {editing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Field label="氏名">
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inp} />
                  </Field>
                  <Field label="メールアドレス">
                    <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inp} />
                  </Field>
                  <Field label="携帯番号">
                    <input value={form.phone_number} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))} style={inp} />
                  </Field>
                  <Field label="入社日">
                    <input type="date" value={form.start_date || ''} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={inp} />
                  </Field>
                  {saveError && <div style={{ fontSize: 11, color: '#DC2626' }}>{saveError}</div>}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button onClick={handleSave} disabled={saving}
                      style={{ padding: '6px 14px', fontSize: 11, fontWeight: 600, background: C.navy, color: C.white, border: 'none', borderRadius: 3, cursor: saving ? 'wait' : 'pointer', fontFamily: "'Noto Sans JP'" }}>
                      {saving ? '保存中…' : '保存'}
                    </button>
                    <button onClick={() => { setEditing(false); setForm({ name: member.name || '', email: member.email || '', phone_number: member.phone_number || '', start_date: member.start_date || '' }); }} disabled={saving}
                      style={{ padding: '6px 14px', fontSize: 11, fontWeight: 600, background: C.white, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 3, cursor: 'pointer', fontFamily: "'Noto Sans JP'" }}>
                      キャンセル
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Row label="メール" value={member.email} mono />
                  <Row label="携帯" value={member.phone_number} mono />
                  <Row label="入社日" value={member.start_date} mono />
                  {member.university && <Row label="大学" value={member.university} />}
                </div>
              )}
            </Section>

            {/* 事業ごとのポジション・ランク */}
            <Section title="事業内ポジション・ランク">
              {engagements.length === 0 ? (
                <div style={{ fontSize: 11, color: C.textLight }}>所属事業はありません</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {engagements.map(e => (
                    <div key={e.engagement_id} style={{
                      padding: '10px 12px', borderRadius: 4, border: `1px solid ${C.borderLight}`, background: C.cream,
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 6 }}>{e.engagement_name}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {e.role_name && <Tag color="#1E40AF">ポジション: {e.role_name}</Tag>}
                        {e.rank_name && <Tag color="#059669">ランク: {e.rank_name}</Tag>}
                        {e.override_rate != null
                          ? <Tag color="#C8A84B">個別率: {(e.override_rate * 100).toFixed(1).replace(/\.0$/, '')}%</Tag>
                          : (e.default_rate != null && <Tag color="#6B7280">既定率: {(e.default_rate * 100).toFixed(1).replace(/\.0$/, '')}%</Tag>)
                        }
                        {!e.role_name && !e.rank_name && <span style={{ fontSize: 10.5, color: C.textLight }}>未設定</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {(canEdit && !isOwn) && (
                <div style={{ fontSize: 10.5, color: C.textLight, marginTop: 8 }}>
                  ※ ポジション・ランクの編集は各事業の Members タブから行えます
                </div>
              )}
            </Section>

            {/* Zoom Phone（全員に公開・全事業共通の連絡先）/ User ID は admin のみ */}
            {(member.zoom_phone_number || (isAdmin && member.zoom_user_id)) && (
              <Section title="Zoom 連携">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {member.zoom_phone_number && <Row label="Phone" value={member.zoom_phone_number} mono />}
                  {member.zoom_user_id && isAdmin && <Row label="User ID" value={member.zoom_user_id} mono small />}
                </div>
              </Section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.textMid, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.textMid, fontWeight: 600, marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  );
}

function Row({ label, value, mono, small }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 12 }}>
      <span style={{ fontSize: 10.5, color: C.textMid, fontWeight: 600, minWidth: 60 }}>{label}</span>
      <span style={{
        color: value ? C.textDark : C.textLight,
        fontFamily: mono ? "'JetBrains Mono', monospace" : undefined,
        fontSize: small ? 10 : 12,
        wordBreak: 'break-all',
      }}>{value || '—'}</span>
    </div>
  );
}

function Tag({ children, color }) {
  return (
    <span style={{
      fontSize: 10.5, padding: '2px 8px', borderRadius: 10,
      background: color + '15', color, fontWeight: 600,
    }}>{children}</span>
  );
}

const inp = {
  width: '100%', padding: '6px 10px',
  borderRadius: 3, border: `1px solid ${C.border}`,
  fontSize: 12, fontFamily: "'Noto Sans JP', sans-serif",
  outline: 'none', boxSizing: 'border-box',
};
