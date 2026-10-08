import { useState, useEffect, useMemo, useRef } from 'react';
import React from 'react';
import { supabase } from '../../lib/supabase';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  getProfileImageUrl, uploadProfileImage, updateMemberAvatarUrl,
  updateMember, updateMemberProfile,
  fetchOrgSettings, fetchMemberInvoiceProfile,
} from '../../lib/supabaseWrite';
import { subscribeToPush, unsubscribeFromPush, isPushSubscribed, resetPushSubscription } from '../../lib/pushNotification';
import { getOrgId } from '../../lib/orgContext';
import ZoomWindowGuardRow from './ZoomWindowGuardRow';
import ZoomWindowGuardMacRow from './ZoomWindowGuardMacRow';
import { isMacPc } from './ZoomGuardNotice';
import { calcRankAndRate, getNextRankInfo, getRankLadder } from '../../utils/calculations';
import { PAYROLL_COUNTABLE, salesMonthOf, salesAmountOf } from '../../utils/money';
import './MyPageView.css';
import '../common/PageTitle.css';

const fmtMan = (v) => (v >= 10000 ? `${(v / 10000).toLocaleString()}万` : v.toLocaleString());

// 数字のカウントアップ（ページを開いたときに1回だけ）。「動きを減らす」設定なら即座に出す。
function useCountUp(target, delay = 0) {
  const [v, setV] = useState(target);
  const first = useRef(true);
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!first.current || reduce || !target) { setV(target); return undefined; }
    first.current = false;
    let raf;
    const t0 = performance.now() + delay;
    const step = (t) => {
      const k = Math.max(0, Math.min((t - t0) / 900, 1));
      setV(Math.round(target * (1 - Math.pow(1 - k, 4))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, delay]);
  return v;
}

// パスワードの強さ（0〜4）
const pwScore = (v) => {
  if (!v) return 0;
  let s = 0;
  if (v.length >= 8) s++;
  if (/[A-Za-z]/.test(v) && /\d/.test(v)) s++;
  if (v.length >= 12) s++;
  if (/[^A-Za-z0-9]/.test(v)) s++;
  return Math.max(1, s);
};

// 組織共通の個人プロフィール画面。事業を跨いで同じ内容が表示される。
export default function MyPageView({ currentUser, userId, members, isAdmin = false, onDataRefetch, appoData = [], onOpenPayroll = null, engSlug = null, openZoomGuide = false }) {
  const isMobile = useIsMobile();
  // 営業代行(seller_sourcing)タブで開いた時だけ売上・ランク・報酬を表示する。
  // MASP（自社）/スパキャリタブでは営業代行固有の数字を出さない。
  const showSourcingStats = engSlug === 'seller_sourcing';

  // ログイン中ユーザー本人のページか（AdminView 等から他メンバーを閲覧するケースと区別）
  const [authUserId, setAuthUserId] = useState(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthUserId(data?.user?.id || null));
  }, []);
  const isSelf = !!authUserId && authUserId === userId;

  // 自分のメンバー情報を user_id で検索（名前変更後も追従するため）
  // user_id が無い場合は名前で fallback（後方互換）
  const memberInfo = useMemo(() => {
    if (!Array.isArray(members)) return null;
    if (userId) {
      const byUserId = members.find(m => typeof m === 'object' && m.user_id === userId);
      if (byUserId) return byUserId;
    }
    return members.find(m => (typeof m === 'object' ? m.name : m) === currentUser) || null;
  }, [members, currentUser, userId]);

  // プロフィール画像
  const [profileImage, setProfileImage] = useState(() => getProfileImageUrl(userId));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => { setImgFailed(false); }, [profileImage]);

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      // uploadProfileImage は { url, error } を返す
      const { url, error: uploadErr } = await uploadProfileImage(userId, file);
      if (uploadErr || !url) {
        throw uploadErr || new Error('アップロード結果が空でした');
      }
      setProfileImage(url);
      // members.id (UUID) で更新
      const memberId = memberInfo?._supaId || memberInfo?.id;
      if (memberId) {
        const updateErr = await updateMemberAvatarUrl(memberId, url);
        if (updateErr) throw updateErr;
      }
      // members 配列を再取得して画面全体に反映
      if (typeof onDataRefetch === 'function') {
        try { await onDataRefetch(); } catch (e) { console.warn('[MyPage] onDataRefetch failed:', e); }
      }
    } catch (err) {
      console.error('[MyPage] avatar upload error:', err);
      setUploadError(err?.message || 'アップロードに失敗しました');
    } finally {
      setUploading(false);
    }
  };

  // 下に出る知らせ
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // 基本情報の編集（本人またはadmin）
  const supaId = memberInfo?._supaId || memberInfo?.id;
  const [profileForm, setProfileForm] = useState({ name: '', email: '', phone_number: '', start_date: '' });
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState(null);

  useEffect(() => {
    if (!memberInfo) return;
    setProfileForm({
      name: memberInfo.name || currentUser || '',
      email: memberInfo.email || '',
      phone_number: memberInfo.phone_number || '',
      start_date: memberInfo.start_date || memberInfo.joinDate || '',
    });
  }, [memberInfo, currentUser]);

  const handleSaveProfile = async () => {
    if (!supaId) return;
    setProfileSaving(true);
    setProfileError(null);
    const error = await updateMemberProfile(supaId, profileForm);
    setProfileSaving(false);
    if (error) {
      setProfileError(error.message || '保存に失敗しました');
      return;
    }
    setProfileEditing(false);
    showToast('基本情報を保存しました');
    // members 配列が古いままだと閲覧モードで旧値が見えるので、上位に再 fetch を依頼
    if (typeof onDataRefetch === 'function') {
      try { await onDataRefetch(); } catch (e) { console.warn('[MyPage] onDataRefetch failed:', e); }
    }
  };

  const handleCancelProfile = () => {
    setProfileEditing(false);
    setProfileError(null);
    setProfileForm({
      name: memberInfo?.name || currentUser || '',
      email: memberInfo?.email || '',
      phone_number: memberInfo?.phone_number || '',
      start_date: memberInfo?.start_date || memberInfo?.joinDate || '',
    });
  };

  // ランク・当月実績（org_settings のランク定義/料率を反映）
  const [orgSettings, setOrgSettings] = useState({});
  useEffect(() => {
    let cancelled = false;
    fetchOrgSettings().then(({ data }) => { if (!cancelled) setOrgSettings(data || {}); });
    return () => { cancelled = true; };
  }, []);

  const totalSales = memberInfo?.totalSales || 0;
  const rankInfo = useMemo(() => calcRankAndRate(totalSales, orgSettings), [totalSales, orgSettings]);
  const nextRank = useMemo(() => getNextRankInfo(totalSales, orgSettings), [totalSales, orgSettings]);

  // 当月のアポ・売上・インセンティブ（給与計算と同じ規約: PAYROLL_COUNTABLE / 面談実施日ベース / 開拓除外）
  const payMonth = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);
  const monthLabel = `${parseInt(payMonth.split('-')[1], 10)}月`;
  const monthSummary = useMemo(() => {
    const name = memberInfo?.name || currentUser;
    if (!name || !Array.isArray(appoData) || appoData.length === 0) return null;
    const mine = appoData.filter(a =>
      a.getter === name &&
      PAYROLL_COUNTABLE.has(a.status) &&
      salesMonthOf(a) === payMonth
    );
    return {
      count: mine.length,
      sales: mine.reduce((s, a) => s + salesAmountOf(a), 0),
      incentive: mine.reduce((s, a) => s + (a.reward || 0), 0),
    };
  }, [appoData, memberInfo?.name, currentUser, payMonth]);

  // 請求書プロフィール（口座情報）の登録状況
  const [invoiceProfile, setInvoiceProfile] = useState(null);
  useEffect(() => {
    if (!supaId) return;
    let cancelled = false;
    fetchMemberInvoiceProfile(supaId).then(({ data }) => { if (!cancelled) setInvoiceProfile(data || null); });
    return () => { cancelled = true; };
  }, [supaId]);

  // パスワード変更（本人のみ）
  const [pwForm, setPwForm] = useState({ pw1: '', pw2: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState(null); // { ok: boolean, text: string }
  const handleChangePassword = async () => {
    setPwMessage(null);
    if (pwForm.pw1.length < 8) { setPwMessage({ ok: false, text: 'パスワードは8文字以上にしてください' }); return; }
    if (pwForm.pw1 !== pwForm.pw2) { setPwMessage({ ok: false, text: '確認用パスワードが一致しません' }); return; }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pwForm.pw1 });
    setPwSaving(false);
    if (error) {
      setPwMessage({ ok: false, text: '変更に失敗しました: ' + (error.message || '') });
      return;
    }
    setPwForm({ pw1: '', pw2: '' });
    setPwMessage({ ok: true, text: 'パスワードを変更しました。次回ログインから新しいパスワードをご利用ください。' });
    showToast('パスワードを変更しました');
    setTimeout(() => setPwMessage(null), 8000);
  };

  // Zoom Phone 番号
  const [zoomPhone, setZoomPhone] = useState('');
  const [zoomPhoneEditing, setZoomPhoneEditing] = useState(false);
  const [zoomPhoneSaving, setZoomPhoneSaving] = useState(false);
  useEffect(() => {
    if (memberInfo?.zoomPhoneNumber !== undefined) setZoomPhone(memberInfo.zoomPhoneNumber || '');
  }, [memberInfo?.zoomPhoneNumber]);
  const handleSaveZoomPhone = async () => {
    if (!supaId) return;
    setZoomPhoneSaving(true);
    await updateMember(supaId, { ...memberInfo, zoomPhoneNumber: zoomPhone.trim() });
    setZoomPhoneSaving(false);
    setZoomPhoneEditing(false);
    showToast('Zoom Phone の番号を保存しました');
    if (typeof onDataRefetch === 'function') {
      try { await onDataRefetch(); } catch (e) { console.warn('[MyPage] onDataRefetch failed:', e); }
    }
  };

  // プッシュ通知
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushTestSending, setPushTestSending] = useState(false);
  const [pushTestResult, setPushTestResult] = useState(null);
  useEffect(() => { isPushSubscribed().then(setPushEnabled); }, []);

  // SW からの push-received メッセージをリッスン（デバッグ用）
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const handler = (e) => {
      if (e.data?.kind === 'push-received') {
        console.log('[Push] Service Worker received push:', e.data);
        setPushTestResult(`✓ デバイスで受信確認: ${e.data.data?.title || ''}`);
        setTimeout(() => setPushTestResult(null), 8000);
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  const handleTogglePush = async () => {
    setPushLoading(true);
    try {
      if (pushEnabled) {
        await unsubscribeFromPush(userId);
        setPushEnabled(false);
        showToast('プッシュ通知をオフにしました');
      } else {
        await subscribeToPush(userId, getOrgId());
        setPushEnabled(true);
        showToast('プッシュ通知をオンにしました');
      }
    } catch (err) {
      alert(err?.message === 'Notification permission denied'
        ? '通知の許可が必要です。ブラウザの設定から通知を許可してください。'
        : 'プッシュ通知の設定に失敗しました: ' + (err?.message || ''));
    } finally {
      setPushLoading(false);
    }
  };

  const handleResetPush = async () => {
    if (!confirm('プッシュ通知を完全にリセットして再設定します。\n\nページが自動で再読み込みされます。よろしいですか？')) return;
    setPushLoading(true);
    try {
      await resetPushSubscription(userId, getOrgId());
      // ページ再読み込みで新しい SW が登録される
      window.location.reload();
    } catch (err) {
      alert('リセットに失敗しました: ' + (err?.message || ''));
      setPushLoading(false);
    }
  };

  const handleTestPush = async () => {
    if (!pushEnabled || !userId) return;
    setPushTestSending(true);
    setPushTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-push', {
        body: {
          type: 'test',
          title: 'テスト通知',
          body: 'プッシュ通知は正常に動作しています',
          user_ids: [userId],
          org_id: getOrgId(),
        },
      });
      if (error) throw error;
      if (data?.sent > 0) {
        setPushTestResult(`✓ 送信成功（${data.sent}件）— 通知が表示されない場合はブラウザ通知設定とOS通知許可をご確認ください`);
      } else if (data?.failures && data.failures.length > 0) {
        const f = data.failures[0];
        setPushTestResult(`✗ 送信失敗 (${f.endpoint_origin}: HTTP ${f.status}) ${f.body || ''}`.slice(0, 200));
      } else if (data?.message) {
        setPushTestResult(`✗ ${data.message}`);
      } else {
        setPushTestResult('✗ 送信先なし');
      }
    } catch (err) {
      setPushTestResult('✗ ' + (err?.message || '送信失敗'));
    } finally {
      setPushTestSending(false);
      setTimeout(() => setPushTestResult(null), 12000);
    }
  };

  // ランクの道（0〜最上位の境目を平方根で並べ、下の段が詰まりすぎないようにする）
  const ladder = useMemo(() => getRankLadder(orgSettings), [orgSettings]);
  const topThreshold = ladder.length ? ladder[ladder.length - 1].threshold : 0;
  const ladderPos = (v) => (topThreshold > 0 ? Math.min(Math.sqrt(Math.max(v, 0) / topThreshold), 1) * 100 : 0);
  const mePos = Math.max(ladderPos(totalSales), 1.2);

  const animSales = useCountUp(totalSales);
  const animGap = useCountUp(nextRank?.gap || 0, 60);
  const ms = monthSummary || { count: 0, sales: 0, incentive: 0 };
  const animCount = useCountUp(ms.count, 120);
  const animMonthSales = useCountUp(ms.sales, 180);
  const animIncentive = useCountUp(ms.incentive, 240);

  const s1 = pwScore(pwForm.pw1);
  const pwHint = !pwForm.pw1
    ? { cls: '', text: '8文字以上・英字と数字をまぜると強くなります' }
    : pwForm.pw1.length < 8
      ? { cls: 'ng', text: `あと${8 - pwForm.pw1.length}文字` }
      : { cls: s1 >= 3 ? 'ok' : '', text: ['', '弱い', 'ふつう', '強い', 'とても強い'][s1] };
  const pwMatch = !pwForm.pw2 ? null : pwForm.pw1 === pwForm.pw2;
  const pwReady = pwForm.pw1.length >= 8 && pwForm.pw1 === pwForm.pw2;
  const notifyBlocked = typeof Notification !== 'undefined' && Notification.permission === 'denied';
  const nameInitial = (currentUser || '?')[0];

  return (
    <div className="mp sp-page-top">
      {/* 自分とランク */}
      <section className={`card mp-hero${memberInfo && showSourcingStats ? '' : ' solo'}`}>
        <div className="mp-who">
          <div className="mp-ph">
            {profileImage && !imgFailed
              ? <img src={profileImage} alt={currentUser} onError={() => setImgFailed(true)} />
              : nameInitial}
            <label className={uploading ? 'busy' : ''}>
              {uploading ? '…' : '編集'}
              <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} disabled={uploading} />
            </label>
          </div>
          <div style={{ minWidth: 0 }}>
            <h1>{currentUser}</h1>
            <div className="mp-role">
              {memberInfo?.position && <span>{memberInfo.position}</span>}
              {memberInfo?.team && <span>{memberInfo.team}チーム</span>}
            </div>
            {memberInfo && showSourcingStats && (
              <span className="mp-rank">{rankInfo.rank} ・ インセンティブ率 {Math.round(rankInfo.rate * 100)}%</span>
            )}
            {uploadError && <div className="mp-err">{uploadError}</div>}
          </div>
        </div>

        {memberInfo && showSourcingStats && (
          <div className="mp-ladder">
            <div className="mp-ladder-h">
              <div>
                <span className="mp-lbl">累計売上</span>
                <span className="mp-big n"><small>¥</small>{animSales.toLocaleString()}</span>
              </div>
              {nextRank ? (
                <div className="mp-next">
                  <span className="mp-lbl">「{nextRank.nextRank}」まであと</span>
                  <b className="n">¥{animGap.toLocaleString()}</b>
                </div>
              ) : (
                <div className="mp-next top"><span className="mp-lbl">ランク</span><b>最上位です</b></div>
              )}
            </div>
            <div className="mp-track">
              <div className="mp-rail"><i style={{ width: `${mePos}%` }} /></div>
              {ladder.map((r, i) => (
                <div
                  key={r.name}
                  className={[
                    'mp-step',
                    i === 0 ? 'first' : '',
                    i === ladder.length - 1 ? 'last' : '',
                    totalSales >= r.threshold ? 'done' : '',
                    r.name === rankInfo.rank ? 'cur' : '',
                  ].join(' ')}
                  style={{ left: i === 0 ? 0 : `${ladderPos(r.threshold)}%` }}
                >
                  <i />
                  <b>{r.name}</b>
                  <span>{fmtMan(r.threshold)} ・ {Math.round(r.rate * 100)}%</span>
                </div>
              ))}
              <span className="mp-dot" style={{ left: `${mePos}%` }} title="いまここ" />
            </div>
          </div>
        )}
      </section>

      <div className="mp-cols">
        <div className="mp-stack">
          {/* 今月の成績（営業代行タブのみ） */}
          {showSourcingStats && (
            <section className="card box">
              <div className="card-h">
                <b>{monthLabel}の成績</b>
                {onOpenPayroll && <button type="button" className="btn sm" onClick={onOpenPayroll}>報酬明細を開く</button>}
              </div>
              <div className="mp-kpis">
                <div className="mp-kpi"><span>アポ</span><b className="n">{animCount}<small>件</small></b></div>
                <div className="mp-kpi"><span>当社売上</span><b className="n">¥{animMonthSales.toLocaleString()}</b><em>面談実施日ベース</em></div>
                <div className="mp-kpi"><span>インセンティブ</span><b className="n g">¥{animIncentive.toLocaleString()}</b></div>
              </div>
              <p className="mp-note">
                {monthSummary ? '' : `${monthLabel}の実績はまだありません。`}
                チームボーナス・紹介フィー・調整を含む確定額は、報酬明細でご確認ください。
              </p>
            </section>
          )}

          {/* 基本情報 */}
          <section className="card box">
            <div className="card-h">
              <b>基本情報</b>
              {!profileEditing && supaId && <button type="button" className="btn sm" onClick={() => setProfileEditing(true)}>編集</button>}
            </div>
            <dl className="mp-dl">
              <dt>氏名</dt>
              <dd>{profileEditing
                ? <input className="input" value={profileForm.name} onChange={e => setProfileForm(s => ({ ...s, name: e.target.value }))} />
                : (memberInfo?.name || currentUser || '—')}</dd>
              <dt>連絡先メール</dt>
              <dd>{profileEditing ? (
                <>
                  <input className="input" type="email" placeholder="example@example.com" value={profileForm.email} onChange={e => setProfileForm(s => ({ ...s, email: e.target.value }))} />
                  <span className="sub">通知・請求書などの連絡先です。ログイン用メールアドレスは変わりません。</span>
                </>
              ) : (memberInfo?.email || '—')}</dd>
              <dt>携帯番号</dt>
              <dd>{profileEditing
                ? <input className="input" type="tel" placeholder="090-1234-5678" value={profileForm.phone_number} onChange={e => setProfileForm(s => ({ ...s, phone_number: e.target.value }))} />
                : <span className="n">{memberInfo?.phone_number || '—'}</span>}</dd>
              <dt>入社日</dt>
              <dd>{profileEditing && isAdmin
                ? <input className="input" type="date" value={profileForm.start_date || ''} onChange={e => setProfileForm(s => ({ ...s, start_date: e.target.value }))} />
                : (
                  <>
                    <span className="n">{(profileEditing ? profileForm.start_date : (memberInfo?.start_date || memberInfo?.joinDate)) || '—'}</span>
                    {profileEditing && <span className="sub">変更は管理者にご依頼ください</span>}
                  </>
                )}</dd>
            </dl>
            {profileError && <div className="mp-msg ng">{profileError}</div>}
            {profileEditing && (
              <div className="mp-edit-acts">
                <button type="button" className="btn sm" onClick={handleCancelProfile} disabled={profileSaving}>キャンセル</button>
                <button type="button" className="btn sm pri" onClick={handleSaveProfile} disabled={profileSaving}>{profileSaving ? '保存中…' : '保存'}</button>
              </div>
            )}
          </section>

          {/* 報酬の振込先（営業代行タブのみ） */}
          {showSourcingStats && (
            <section className="card box">
              <div className="card-h"><b>報酬の振込先</b></div>
              {invoiceProfile?.bank_name ? (
                <div className="mp-bank">
                  <span className="mp-tag green">登録済み</span>
                  <span>{invoiceProfile.bank_name}{invoiceProfile.branch_name ? ` ${invoiceProfile.branch_name}` : ''}</span>
                </div>
              ) : (
                <div className="mp-alert">
                  <p><b>口座が未登録です</b>登録がないと、報酬を振り込めません。報酬明細の請求書作成から登録できます</p>
                  {onOpenPayroll && <button type="button" className="btn sm pri" onClick={onOpenPayroll}>報酬明細を開く</button>}
                </div>
              )}
            </section>
          )}
        </div>

        <div className="mp-stack">
          {/* パスワード（本人のみ。他メンバーのページでは、ログイン中の人のパスワードを変えてしまうため出さない） */}
          {isSelf && (
            <section className="card box">
              <div className="card-h"><b>パスワードの変更</b></div>
              <div className="mp-pw">
                <div>
                  <label htmlFor="mp-pw1">新しいパスワード</label>
                  <input id="mp-pw1" className="input" type="password" autoComplete="new-password" placeholder="8文字以上"
                    value={pwForm.pw1} onChange={e => setPwForm(s => ({ ...s, pw1: e.target.value }))} />
                  <div className={`mp-meter${s1 ? ` s${s1}` : ''}`}><i /><i /><i /><i /></div>
                  <div className={`mp-hint ${pwHint.cls}`}>{pwHint.text}</div>
                </div>
                <div>
                  <label htmlFor="mp-pw2">確認用</label>
                  <input id="mp-pw2" className="input" type="password" autoComplete="new-password" placeholder="同じパスワードをもう一度"
                    value={pwForm.pw2} onChange={e => setPwForm(s => ({ ...s, pw2: e.target.value }))} />
                  <div className={`mp-hint ${pwMatch === null ? '' : pwMatch ? 'ok' : 'ng'}`}>
                    {pwMatch === null ? '' : pwMatch ? '一致しています' : '一致していません'}
                  </div>
                </div>
              </div>
              {pwMessage && <div className={`mp-msg ${pwMessage.ok ? 'ok' : 'ng'}`}>{pwMessage.text}</div>}
              <div className="mp-right">
                <button type="button" className="btn pri" onClick={handleChangePassword} disabled={pwSaving || !pwReady}>
                  {pwSaving ? '変更中…' : 'パスワードを変更'}
                </button>
              </div>
            </section>
          )}

          {/* 連携と通知 */}
          <section className="card box">
            <div className="card-h"><b>連携と通知</b></div>

            <div className="mp-set">
              <div className="t"><b>Zoom Phone の番号</b><span>架電のとき相手に表示される番号</span></div>
              {zoomPhoneEditing ? (
                <div className="acts">
                  <input className="input" value={zoomPhone} placeholder="例: 0312345678" onChange={e => setZoomPhone(e.target.value)} />
                  <button type="button" className="btn sm pri" onClick={handleSaveZoomPhone} disabled={zoomPhoneSaving}>{zoomPhoneSaving ? '保存中…' : '保存'}</button>
                  <button type="button" className="btn sm" onClick={() => setZoomPhoneEditing(false)}>キャンセル</button>
                </div>
              ) : (
                <div className="acts">
                  <span className="v">{zoomPhone || '未設定'}</span>
                  {isAdmin && <button type="button" className="btn sm" onClick={() => setZoomPhoneEditing(true)}>編集</button>}
                </div>
              )}
            </div>

            <div className="mp-set">
              <div className="t">
                <b>プッシュ通知</b>
                <span>アポ獲得・日次レポートなどをブラウザで受け取る</span>
                {notifyBlocked && <span className="warn">ブラウザで通知がブロックされています。ブラウザの設定から許可してください。</span>}
              </div>
              <div className="acts">
                {pushEnabled && (
                  <button type="button" className="btn ghost sm" onClick={handleTestPush} disabled={pushTestSending} title="このデバイスにテスト通知を送る">
                    {pushTestSending ? '送信中…' : 'テスト送信'}
                  </button>
                )}
                {pushEnabled && isAdmin && (
                  <button type="button" className="btn ghost sm" onClick={handleResetPush} disabled={pushLoading} title="古いService Workerを消して通知を設定し直す（不具合のとき用）">
                    リセット
                  </button>
                )}
                <button type="button" className={`mp-sw${pushEnabled ? ' on' : ''}`} onClick={handleTogglePush} disabled={pushLoading}
                  role="switch" aria-checked={pushEnabled} aria-label="プッシュ通知"><i /></button>
              </div>
            </div>
            {pushTestResult && (
              <div className={`mp-result ${pushTestResult.startsWith('✓') ? 'ok' : 'ng'}`}>{pushTestResult.replace(/^[✓✗]\s*/, '')}</div>
            )}

            <div className="mp-guard">
              {/* Mac で開いたら Mac 用の入れ方を出す（2026-10-08） */}
              {isMacPc() ? <ZoomWindowGuardMacRow /> : <ZoomWindowGuardRow openOnMount={openZoomGuide} />}
            </div>
          </section>
        </div>
      </div>

      <div className={`mp-toast${toast ? ' on' : ''}`} role="status">
        {toast && (
          <>
            <svg viewBox="0 0 14 14" fill="none" strokeWidth="2" aria-hidden="true"><path d="M2 7.5l3 3L12 4" /></svg>
            {toast}
          </>
        )}
      </div>
    </div>
  );
}
