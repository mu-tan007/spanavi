import React, { useMemo, useState, useEffect } from 'react';
import './MASPMembers.css';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge, Tag, ActionMenu } from '../ui';
import { supabase } from '../../lib/supabase';
import { useEngagements } from '../../hooks/useEngagements';
import { useAllMembersWithEngagements } from '../../hooks/useMemberEngagements';
import { deactivateMember, updateMemberProfile, updateMember } from '../../lib/supabaseWrite';
import { getOrgId } from '../../lib/orgContext';
import PageHeader from '../common/PageHeader';
import { useMemberProfile } from '../common/MemberProfileDrawer';
// 契約書テンプレ管理:
//   メンバー向け  → 管理者設定 > メンバー契約書テンプレ (AdminView)
//   クライアント向け → CRM > 契約書テンプレ サブタブ
// 報酬体系マスタ管理 → CRM > 報酬体系マスタ サブタブ
import GenerateContractModal from './masp/GenerateContractModal';
import { autoEndDate, generateAndDownloadContract } from '../../lib/contractGenerator';

// POSITION_OPTIONS は organization_positions テーブルから動的取得
// （fallback: テーブル未設定時のデフォルト）
const POSITION_FALLBACK = ['代表取締役', '取締役', '執行役員', '監査役'];

async function syncSeatCount(newCount) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-update-seats`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ newSeatCount: newCount }),
      }
    );
  } catch (e) {
    console.warn('Stripe seat sync failed:', e.message);
  }
}

// product slug → 配下の代表 engagement slug
// チェックボックスON時はこの代表 engagement に member_engagements を作る。
const PRODUCT_TO_PRIMARY_ENG_SLUG = {
  sales_agency: 'seller_sourcing',
  spartia_career_biz: 'spartia_career',
  spartia_recruitment_biz: 'spartia_recruitment',
  spanavi_biz: 'spanavi',
  spartia_capital_biz: 'spartia_capital',
};

// MASP タブの「Members」ページ。全社の従業員一覧を編集する。
// onlyEngagementId：その事業に所属する人だけ出す（営業代行のメンバーのページから開いたとき・2026-10-08）
export default function MASPMembersView({ isAdmin, onlyEngagementId = null, onOpenInvite = null }) {
  const { engagements, products } = useEngagements();
  const { openProfile } = useMemberProfile();
  const { members, assignments, teamsByEngagement, memberTeam, loading, toggleAssignment, assignMemberToTeam, refresh } = useAllMembersWithEngagements();
  const [positionOptions, setPositionOptions] = useState(POSITION_FALLBACK);
  useEffect(() => {
    supabase.from('organization_positions')
      .select('name')
      .eq('org_id', getOrgId())
      .order('display_order')
      .then(({ data }) => {
        if (data && data.length > 0) setPositionOptions(data.map(p => p.name));
      });
  }, []);
  const [filter, setFilter] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // 鉛筆メニューの開閉・位置決め・外側クリック/ESC は ActionMenu が担当する

  // 招待再送
  const [resendingId, setResendingId] = useState(null);
  const [resendResult, setResendResult] = useState(null);

  // 業務委託契約書生成モーダル
  const [contractTarget, setContractTarget] = useState(null);

  // 新規追加モーダル
  // 注: start_date は「契約開始日」として使用（入社日と同義）
  // 契約終了日と銀行情報は契約書差し込み + member_invoice_profiles 登録用
  const [addModal, setAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '', email: '', phone_number: '', position: '',
    start_date: '', contract_end_date: '',
    address: '',
    bank_name: '', branch_name: '', account_type: '',
    account_number: '', account_holder_kana: '',
  });
  const [addSendInvite, setAddSendInvite] = useState(true);
  const [addEngagementIds, setAddEngagementIds] = useState(new Set()); // 選択された engagement IDs
  const [addTemplateId, setAddTemplateId] = useState(''); // 自動生成する契約書テンプレ
  const [addContractTemplates, setAddContractTemplates] = useState([]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState(null);

  // 商材（products）単位で列を構成。
  // - 各列の checked 判定は「配下のいずれかの engagement に所属」
  // - チェックON → 代表 engagement に member_engagements 追加
  // - チェックOFF → 配下の全 engagement から削除
  const productCols = useMemo(() => {
    return (products || []).map(p => {
      const primarySlug = PRODUCT_TO_PRIMARY_ENG_SLUG[p.slug];
      const primaryEng = engagements.find(e => e.slug === primarySlug);
      const engagementIds = engagements
        .filter(e => e.product_id === p.id)
        .map(e => e.id);
      return {
        productId: p.id,
        slug: p.slug,
        name: p.name,
        primaryEngagementId: primaryEng?.id || null,
        engagementIds,
      };
    }).filter(c => c.primaryEngagementId);
  }, [products, engagements]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const inScope = onlyEngagementId ? members.filter(m => (assignments[m.id] || new Set()).has(onlyEngagementId)) : members;
    if (!q) return inScope;
    return inScope.filter(m =>
      (m.name || '').toLowerCase().includes(q)
      || (m.email || '').toLowerCase().includes(q)
      || (m.position || '').toLowerCase().includes(q)
      || (m.team || '').toLowerCase().includes(q)
    );
  }, [members, filter, onlyEngagementId, assignments]);

  const startEdit = (m) => {
    setEditingId(m.id);
    setEditForm({
      name: m.name || '',
      email: m.email || '',
      phone_number: m.phone_number || '',
      position: m.position || '',
      start_date: m.start_date || '',
    });
    setSaveError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
    setSaveError(null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    setSaveError(null);
    // ① 本人編集対応のフィールド (name/email/phone/start_date)
    const err1 = await updateMemberProfile(editingId, {
      name: editForm.name,
      email: editForm.email,
      phone_number: editForm.phone_number,
      start_date: editForm.start_date,
    });
    // ② position は別途更新（updateMember 経由）
    if (!err1) {
      const target = members.find(m => m.id === editingId);
      const err2 = await updateMember(editingId, {
        ...target,
        name: editForm.name,
        position: editForm.position,
        // updateMember は他フィールド全部期待するため一通り渡す
        team: target?.team,
        rank: target?.rank,
        rate: target?.incentive_rate,
        offer: target?.job_offer,
        operationStartDate: target?.operation_start_date,
        referrerName: target?.referrer_name,
        zoomUserId: target?.zoom_user_id,
        zoomPhoneNumber: target?.zoom_phone_number,
        year: target?.grade,
        university: target?.university,
        role: editForm.position,
      });
      if (err2) {
        setSaveError(err2.message || '保存に失敗しました');
        setSaving(false);
        return;
      }
    } else {
      setSaveError(err1.message || '保存に失敗しました');
      setSaving(false);
      return;
    }
    setSaving(false);
    setEditingId(null);
    setEditForm({});
    await refresh?.();
  };

  const handleResendInvite = async (m) => {
    if (!m.email) {
      setResendResult({ type: 'error', message: 'メールアドレスが未登録です' });
      setTimeout(() => setResendResult(null), 5000);
      return;
    }
    setResendingId(m.id);
    setResendResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-member`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ email: m.email, name: m.name, resend: true }),
        }
      );
      const result = await res.json();
      if (!res.ok) {
        setResendResult({ type: 'error', message: result.error || '送信失敗' });
      } else if (result.existingUser) {
        setResendResult({ type: 'ok', message: `${m.name} にパスワード再設定メールを送信しました` });
      } else {
        setResendResult({ type: 'ok', message: `${m.name} に招待メールを再送しました` });
      }
    } catch (err) {
      setResendResult({ type: 'error', message: err.message || '送信失敗' });
    } finally {
      setResendingId(null);
      setTimeout(() => setResendResult(null), 5000);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const error = await deactivateMember(deleteTarget.id);
    setDeleting(false);
    if (!error) {
      setDeleteTarget(null);
      await refresh?.();
      syncSeatCount(members.filter(m => m.id !== deleteTarget.id).length);
    }
  };

  const openAddModal = async () => {
    setAddForm({
      name: '', email: '', phone_number: '', position: '',
      start_date: '', contract_end_date: '',
      address: '',
      bank_name: '', branch_name: '', account_type: '',
      account_number: '', account_holder_kana: '',
    });
    setAddSendInvite(true);
    setAddEngagementIds(new Set());
    setAddTemplateId('');
    setAddError(null);
    setAddModal(true);

    // 契約書テンプレ一覧をロード（1つしかなければ自動選択）
    const orgId = getOrgId();
    const { data } = await supabase
      .from('contract_templates')
      .select('id, name, file_path')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('uploaded_at', { ascending: false });
    setAddContractTemplates(data || []);
    if (data && data.length === 1) setAddTemplateId(data[0].id);
  };

  // 契約開始日を変えたら、契約終了日が未入力 or 旧値の自動算出と一致していれば自動更新
  const onAddStartDateChange = (v) => {
    setAddForm(s => {
      const wasAuto = !s.contract_end_date || s.contract_end_date === autoEndDate(s.start_date);
      return {
        ...s,
        start_date: v,
        contract_end_date: wasAuto ? autoEndDate(v) : s.contract_end_date,
      };
    });
  };

  const toggleAddEngagement = (id) => {
    setAddEngagementIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    setAddError(null);
    if (!addForm.name.trim()) { setAddError('氏名は必須です'); return; }
    if (addSendInvite && !addForm.email.trim()) { setAddError('招待メール送信時はメールアドレスが必須です'); return; }

    // 安全弁: 契約書テンプレを選んでいるのに住所/口座が空のまま生成すると、
    // 契約書の該当欄が空になる（過去に住所欄が空の契約書が生成された事故あり）。
    // DB 書き込み前にここで確認し、中断できるようにする。
    if (addTemplateId && addForm.start_date && addForm.contract_end_date) {
      const missing = [];
      if (!addForm.address.trim()) missing.push('住所');
      const hasBank = addForm.bank_name || addForm.branch_name || addForm.account_number;
      if (!hasBank) missing.push('口座情報');
      if (missing.length > 0) {
        const label = missing.join('・');
        const ok = window.confirm(
          `契約書テンプレが選択されていますが、${label}が未入力です。\n` +
          `このまま生成すると契約書の${label}欄が空になります。\n\n` +
          `キャンセルして入力し直すことを推奨します。このまま続けますか？`
        );
        if (!ok) return;
      }
    }

    setAdding(true);
    const orgId = getOrgId();
    let newMemberId = null;

    try {
      if (addSendInvite && addForm.email.trim()) {
        // 招待メール経由（edge function）でメンバー追加
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-member`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({
              email: addForm.email.trim(),
              name: addForm.name.trim(),
              orgId,
              operation_start_date: addForm.start_date || null,
            }),
          }
        );
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || '招待に失敗しました');
        newMemberId = result.memberId;
        // 既存Authユーザー検出時は recovery メール送信なので、画面にトーストで通知
        if (result.existingUser) {
          setResendResult({
            type: 'ok',
            message: `${addForm.email.trim()} は登録済みのため、パスワード再設定メールを送信しました`,
          });
          setTimeout(() => setResendResult(null), 6000);
        } else {
          setResendResult({
            type: 'ok',
            message: `${addForm.email.trim()} に招待メールを送信しました`,
          });
          setTimeout(() => setResendResult(null), 6000);
        }
        // edge function は position='メンバー' rank='トレーニー' をデフォルトで設定する
        // これを希望の値で上書き（position と phone_number, start_date）
        if (newMemberId) {
          await supabase.from('members').update({
            position: addForm.position || null,
            phone_number: addForm.phone_number || null,
            start_date: addForm.start_date || null,
            // 営業代行に入れる人はトレーニーから（空のままだとメンバーのページで「未設定」になる・2026-10-08）。
            // それ以外の事業だけの人は空のまま（事業ごとに後で設定）
            rank: engagements.some(e => e.slug === 'seller_sourcing' && addEngagementIds.has(e.id)) ? 'トレーニー' : null,
          }).eq('id', newMemberId);
        }
      } else {
        // 直接 INSERT
        const { data, error } = await supabase.from('members').insert({
          org_id: orgId,
          name: addForm.name.trim(),
          email: addForm.email.trim() || null,
          phone_number: addForm.phone_number || null,
          position: addForm.position || null,
          start_date: addForm.start_date || null,
          is_active: true,
          incentive_rate: 0,
        }).select('id').single();
        if (error) throw new Error(error.message);
        newMemberId = data.id;
      }

      // 事業所属の登録
      if (newMemberId && addEngagementIds.size > 0) {
        const rows = Array.from(addEngagementIds).map(eid => ({
          org_id: orgId, member_id: newMemberId, engagement_id: eid,
        }));
        const { error: meErr } = await supabase.from('member_engagements').insert(rows);
        if (meErr) console.warn('member_engagements insert partially failed:', meErr.message);
      }

      // 住所 + 口座情報を member_invoice_profiles に upsert（請求書 + 契約書 共通）
      const hasInvoiceFields = addForm.address || addForm.bank_name || addForm.branch_name
        || addForm.account_type || addForm.account_number || addForm.account_holder_kana;
      if (newMemberId && hasInvoiceFields) {
        const { error: ipErr } = await supabase
          .from('member_invoice_profiles')
          .upsert({
            member_id: newMemberId,
            org_id: orgId,
            address: addForm.address || null,
            bank_name: addForm.bank_name || null,
            branch_name: addForm.branch_name || null,
            account_type: addForm.account_type || null,
            account_number: addForm.account_number || null,
            account_holder_kana: addForm.account_holder_kana || null,
          }, { onConflict: 'member_id' });
        if (ipErr) console.warn('member_invoice_profiles upsert failed:', ipErr.message);
      }

      // 契約書テンプレが選ばれていれば、自動で .docx を生成 + contracts に履歴登録
      let contractFilename = null;
      if (newMemberId && addTemplateId && addForm.start_date && addForm.contract_end_date) {
        try {
          const template = addContractTemplates.find(t => t.id === addTemplateId);
          if (template) {
            const memberForGen = {
              id: newMemberId,
              name: addForm.name.trim(),
              address: addForm.address || '',
            };
            const bank = {
              bank_name: addForm.bank_name,
              branch_name: addForm.branch_name,
              account_type: addForm.account_type,
              account_number: addForm.account_number,
              account_holder: addForm.account_holder_kana || addForm.name.trim(),
            };
            const { placeholders, filename } = await generateAndDownloadContract({
              template,
              member: memberForGen,
              startDate: addForm.start_date,
              endDate: addForm.contract_end_date,
              bank,
            });
            contractFilename = filename;

            const { data: { user } } = await supabase.auth.getUser();
            await supabase.from('contracts').insert({
              org_id: orgId,
              member_id: newMemberId,
              template_id: template.id,
              start_date: addForm.start_date,
              end_date: addForm.contract_end_date,
              payload: { placeholders, filename, template_name: template.name },
              generated_by: user?.id || null,
            });
          }
        } catch (genErr) {
          console.warn('contract generation failed:', genErr.message);
          // 契約書生成失敗してもメンバー追加自体は成功扱い
          setResendResult({
            type: 'error',
            message: `メンバー追加は成功しましたが契約書生成に失敗: ${genErr.message}`,
          });
          setTimeout(() => setResendResult(null), 6000);
        }
      }

      // Stripe 席数同期
      syncSeatCount(members.length + 1);

      // 完了
      setAdding(false);
      setAddModal(false);
      if (contractFilename) {
        setResendResult({
          type: 'ok',
          message: `${addForm.name.trim()} を追加し、契約書 ${contractFilename} をダウンロードしました`,
        });
        setTimeout(() => setResendResult(null), 6000);
      }
      await refresh?.();
    } catch (err) {
      setAddError(err.message || '追加に失敗しました');
      setAdding(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: color.textMid }}>読み込み中…</div>;
  }

  const positionSelectOptions = [
    { value: '', label: '（なし）' },
    ...positionOptions.map(p => ({ value: p, label: p })),
  ];

  const initialOf = (m) => (m?.name || '?').trim().charAt(0);
  const toggleProduct = async (m, p, on) => {
    if (!isAdmin) return;
    const set = assignments[m.id] || new Set();
    if (on) {
      await toggleAssignment(m.id, p.primaryEngagementId, true);
    } else {
      // 配下の全 engagement から外す（チーム割当も解除）
      for (const engId of p.engagementIds) {
        if (set.has(engId)) {
          await toggleAssignment(m.id, engId, false);
          await assignMemberToTeam(m.id, engId, null);
        }
      }
    }
  };
  const f = (k) => (e) => setAddForm(s => ({ ...s, [k]: e.target.value }));

  // 2026-10-08 新しい見た目（MASPMembers.css）。題名はシートの見出しが持つので、ここでは道具の段だけ
  return (
    <div className="mm">
      <div className="mm-bar">
        <input className="mm-search" value={filter} onChange={e => setFilter(e.target.value)} placeholder="氏名・メール・役職・チームで探す" />
        <span className="mm-count"><b>{onlyEngagementId ? visible.length : members.length}</b>名{onlyEngagementId ? '（この事業）' : '（全社）'}・入社日順</span>
        <span className="grow" />
        {isAdmin && onOpenInvite && <Button size="sm" variant="primary" onClick={onOpenInvite}>招待リンクで追加</Button>}
        {isAdmin && <Button size="sm" variant="outline" onClick={openAddModal}>直接追加</Button>}
      </div>
      {isAdmin && onOpenInvite && (
        <div className="mm-hint">新しく入る人は<b>「招待リンクで追加」</b>がおすすめです。本人が氏名・メール・住所・口座を入れ、契約まで進みます。「直接追加」は手で全部入れるときに使います。</div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <div className="mm-list" style={{ minWidth: 900 }}>
          <div className="mm-head">
            <span /><span>氏名</span><span style={{ textAlign: 'right' }}>入社日</span><span>役職</span><span>メール</span><span>携帯</span><span>所属する事業</span><span />
          </div>
          {visible.length === 0 && <div className="mm-empty">該当するメンバーがいません</div>}
          {visible.map((m, i) => {
            const set = assignments[m.id] || new Set();
            const isEditing = editingId === m.id;
            return (
              <div key={m.id} className={`mm-row${isEditing ? ' edit' : ''}`} style={{ animationDelay: `${Math.min(i, 16) * 0.02}s` }}>
                <span className="mm-av">{m.avatar_url ? <img src={m.avatar_url} alt="" /> : initialOf(m)}</span>
                {isEditing
                  ? <Input size="sm" value={editForm.name} onChange={e => setEditForm(s => ({ ...s, name: e.target.value }))} />
                  : <span className="mm-nm" onClick={() => openProfile(m.id)} title="プロフィールを開く">{m.name}</span>}
                {isEditing
                  ? <Input size="sm" type="date" value={editForm.start_date || ''} onChange={e => setEditForm(s => ({ ...s, start_date: e.target.value }))} />
                  : <span className="mm-num">{m.start_date ? formatDate(m.start_date) : '—'}</span>}
                {isEditing
                  ? <Select size="sm" value={editForm.position} onChange={e => setEditForm(s => ({ ...s, position: e.target.value }))} options={positionSelectOptions} />
                  : <span>{m.position ? <span className="mm-pos">{m.position}</span> : <span className="mm-mut">—</span>}</span>}
                {isEditing
                  ? <Input size="sm" type="email" value={editForm.email} onChange={e => setEditForm(s => ({ ...s, email: e.target.value }))} />
                  : <span className="mm-mail" title={m.email || ''}>{m.email || '—'}</span>}
                {isEditing
                  ? <Input size="sm" type="tel" value={editForm.phone_number} onChange={e => setEditForm(s => ({ ...s, phone_number: e.target.value }))} />
                  : <span className="mm-mut">{m.phone_number || '—'}</span>}
                <span className="mm-chips">
                  {productCols.map(p => {
                    const on = p.engagementIds.some(id => set.has(id));
                    return <button key={p.productId} type="button" className={`mm-chip${on ? ' on' : ''}`} disabled={!isAdmin} onClick={() => toggleProduct(m, p, !on)} title={isAdmin ? (on ? '押すと外す' : '押すと所属させる') : ''}>{p.name}</button>;
                  })}
                </span>
                <span style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                  {isAdmin && (isEditing ? (
                    <>
                      <Button size="sm" loading={saving} onClick={saveEdit}>保存</Button>
                      <Button size="sm" variant="ghost" disabled={saving} onClick={cancelEdit}>取消</Button>
                    </>
                  ) : (
                    <ActionMenu
                      icon="⋯"
                      title="操作"
                      items={[
                        { key: 'edit', label: '編集', onClick: () => startEdit(m) },
                        { key: 'contract', label: '契約書を生成', title: '業務委託契約書を差し込み生成', onClick: () => setContractTarget(m) },
                        m.email && {
                          key: 'resend',
                          label: resendingId === m.id ? '送信中…' : '招待を再送',
                          title: '招待メールを再送（パスワード未設定者向け）',
                          disabled: resendingId === m.id,
                          onClick: () => handleResendInvite(m),
                        },
                        { key: 'delete', label: '削除', danger: true, onClick: () => setDeleteTarget(m) },
                      ]}
                    />
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {saveError && <div className="mm-err">{saveError}</div>}
      {resendResult && <div className={`mm-toast${resendResult.type === 'error' ? ' bad' : ''}`}>{resendResult.message}</div>}

      {addModal && (
        <div className="mm-ov" onClick={() => !adding && setAddModal(false)}>
          <div className="mm-dlg" onClick={e => e.stopPropagation()}>
            <div className="mm-dlg-h">
              <h3>メンバーを直接追加</h3>
              <p>本人に入れてもらう場合は「招待リンクで追加」を使ってください。ここでは管理者が全部入れます。</p>
            </div>
            <div className="mm-dlg-b">
              <section className="mm-sec">
                <h4>本人</h4>
                <div className="mm-grid">
                  <div className="mm-f"><label>氏名（必須・姓と名の間に半角スペース）</label><Input size="sm" value={addForm.name} onChange={f('name')} placeholder="例: 山田 太郎" /></div>
                  <div className="mm-f"><label>役職</label><Select size="sm" value={addForm.position} onChange={f('position')} options={positionSelectOptions} /></div>
                  <div className="mm-f"><label>メールアドレス</label><Input size="sm" type="email" value={addForm.email} onChange={f('email')} placeholder="例: name@example.com" /></div>
                  <div className="mm-f"><label>携帯番号</label><Input size="sm" type="tel" value={addForm.phone_number} onChange={f('phone_number')} placeholder="090-1234-5678" /></div>
                  <div className="mm-f full"><label>住所</label><Input size="sm" value={addForm.address} onChange={f('address')} placeholder="例: 東京都港区六本木1-2-3 マンション101" /></div>
                </div>
              </section>
              <section className="mm-sec">
                <h4>報酬の振込口座</h4>
                <div className="mm-grid">
                  <div className="mm-f"><label>銀行名</label><Input size="sm" value={addForm.bank_name} onChange={f('bank_name')} placeholder="例: 三井住友銀行" /></div>
                  <div className="mm-f"><label>支店名</label><Input size="sm" value={addForm.branch_name} onChange={f('branch_name')} placeholder="例: 六本木支店" /></div>
                  <div className="mm-f"><label>種別</label><Select size="sm" value={addForm.account_type} onChange={f('account_type')} options={[{ value: '', label: '（選ぶ）' }, { value: '普通', label: '普通' }, { value: '当座', label: '当座' }]} /></div>
                  <div className="mm-f"><label>口座番号</label><Input size="sm" value={addForm.account_number} onChange={f('account_number')} placeholder="数字7桁" /></div>
                  <div className="mm-f full"><label>口座名義（カタカナ）</label><Input size="sm" value={addForm.account_holder_kana} onChange={f('account_holder_kana')} placeholder="例: ヤマダ タロウ" /></div>
                </div>
              </section>
              <section className="mm-sec">
                <h4>契約</h4>
                <div className="mm-grid">
                  <div className="mm-f"><label>契約開始日（入社日）</label><Input size="sm" type="date" value={addForm.start_date} onChange={e => onAddStartDateChange(e.target.value)} /></div>
                  <div className="mm-f"><label>契約終了日</label><Input size="sm" type="date" value={addForm.contract_end_date} onChange={f('contract_end_date')} /><small>開始日＋1年−1日で自動で入ります</small></div>
                  <div className="mm-f full">
                    <label>契約書のひな形</label>
                    {addContractTemplates.length === 0
                      ? <div className="mm-note">ひな形がまだ登録されていません。</div>
                      : <Select size="sm" value={addTemplateId} onChange={e => setAddTemplateId(e.target.value)} options={[{ value: '', label: '作らない' }, ...addContractTemplates.map(t => ({ value: t.id, label: t.name }))]} />}
                    <small>選ぶと、追加と同時に契約書（.docx）を作って保存します</small>
                  </div>
                </div>
              </section>
              <section className="mm-sec">
                <h4>所属する事業</h4>
                <div className="mm-chips" style={{ gap: 6 }}>
                  {productCols.map(p => {
                    const on = addEngagementIds.has(p.primaryEngagementId);
                    return <button key={p.productId} type="button" className={`mm-chip${on ? ' on' : ''}`} onClick={() => toggleAddEngagement(p.primaryEngagementId)} style={{ fontSize: 12, padding: '4px 12px' }}>{p.name}</button>;
                  })}
                </div>
                <label className="mm-check" style={{ marginTop: 12 }}>
                  <input type="checkbox" checked={addSendInvite} onChange={e => setAddSendInvite(e.target.checked)} />
                  ログインの招待メールを送る（おすすめ）
                </label>
              </section>
              {addError && <div className="mm-err" style={{ marginTop: 0 }}>{addError}</div>}
            </div>
            <div className="mm-dlg-f">
              <Button variant="outline" disabled={adding} onClick={() => setAddModal(false)}>やめる</Button>
              <Button variant="primary" loading={adding} onClick={handleAdd}>{adding ? '追加しています…' : '追加する'}</Button>
            </div>
          </div>
        </div>
      )}

      {contractTarget && (
        <GenerateContractModal
          member={contractTarget}
          onClose={() => setContractTarget(null)}
          onGenerated={(res) => {
            setResendResult({ type: 'ok', message: `${res.filename} をダウンロードしました` });
            setTimeout(() => setResendResult(null), 5000);
            refresh?.();
          }}
        />
      )}

      {deleteTarget && (
        <div className="mm-ov" style={{ alignItems: 'center' }} onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="mm-dlg sm" onClick={e => e.stopPropagation()}>
            <div className="mm-dlg-h">
              <h3>{deleteTarget.name}さんを外しますか</h3>
              <p>過去の架電・アポ・売上の記録は残ります。ログインと、各画面のメンバー一覧からは見えなくなります。</p>
            </div>
            <div className="mm-dlg-f">
              <Button size="sm" variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>やめる</Button>
              <Button size="sm" variant="danger" loading={deleting} onClick={handleConfirmDelete}>{deleting ? '外しています…' : '外す'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const th = { padding: '10px 12px', textAlign: 'center', fontWeight: font.weight.semibold, color: color.navy, fontSize: font.size.xs, letterSpacing: font.letterSpacing.wide };
const td = { padding: '8px 12px', fontSize: font.size.sm, color: color.textDark };
function formatDate(d) {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return `${parts[0]}-${parts[1]}-${parts[2]}`;
}

function FormRow({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ minWidth: 120, fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>{label}</div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}
