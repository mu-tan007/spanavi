import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge } from '../ui';
import { updateCallList, insertCallList, archiveCallList, restoreCallList } from '../../lib/supabaseWrite';
import { supabase } from '../../lib/supabase';
import { useEngagements } from '../../hooks/useEngagements';
import useColumnConfig from '../../hooks/useColumnConfig';
import ColumnResizeHandle from '../common/ColumnResizeHandle';
import { useIsMobile } from '../../hooks/useIsMobile';
import PageHeader from '../common/PageHeader';
import TopListCard, { ProgressPill } from '../common/TopListCard';
import SmartQueueTab from './smart-queue/SmartQueueTab';
import { useUrlState } from '../../hooks/useUrlState';

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

const TypeBadge = ({ children, color: tone = color.navy, glow = false, small = false }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: small ? "1px 7px" : "2px 10px",
    borderRadius: radius.md, fontSize: small ? 10 : font.size.xs,
    fontWeight: font.weight.semibold, letterSpacing: 0.3,
    color: tone, background: glow ? alpha(tone, 0.08) : "transparent",
    border: `1px solid ${alpha(tone, 0.19)}`, whiteSpace: "nowrap",
  }}>{children}</span>
);

const getScoreStyle = (score) => {
  if (score >= 80) return { color: "#92670A", background: "#FFFBEB", border: "1px solid #D4A017AA" };
  if (score >= 40) return { color: "#1E40AF", background: "#EFF6FF", border: "1px solid #1E40AF40" };
  return { color: "#6B7280", background: "#F3F4F6", border: "1px solid #6B728040" };
};

const ScorePill = ({ score }) => {
  const s = getScoreStyle(score);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 8px", borderRadius: radius.md,
      background: s.background, border: s.border,
      fontSize: 10, fontWeight: font.weight.bold, color: s.color,
      fontFamily: font.family.mono,
      letterSpacing: "0.05em", flexShrink: 0, whiteSpace: "nowrap",
    }}>SCORE {score}</span>
  );
};

const LISTVIEW_COLS = [
  { key: 'client', width: 280, align: 'left' },
  { key: 'category', width: 90, align: 'center' },
  { key: 'engagementType', width: 140, align: 'center' },
  { key: 'industry', width: 140, align: 'left' },
  { key: 'count', width: 72, align: 'right' },
  { key: 'manager', width: 160, align: 'center' },
  { key: 'reward', width: 110, align: 'right' },
  { key: 'progress', width: 110, align: 'center' },
  { key: 'score', width: 125, align: 'center' },
  { key: 'actions', width: 65, align: 'left' },
];


const LISTVIEW_ARCHIVE_COLS = [
  { key: 'client', width: 240, align: 'left' },
  { key: 'category', width: 80, align: 'center' },
  { key: 'engagementType', width: 130, align: 'center' },
  { key: 'industry', width: 140, align: 'left' },
  { key: 'count', width: 70, align: 'right' },
  { key: 'manager', width: 112, align: 'left' },
  { key: 'actions', width: 80, align: 'right' },
];

// 100,000 → 「10万円」 / 165,000 → 「16万5,000円」 / 300,000,000 → 「3億円」
function fmtYen(n) {
  if (n == null) return '';
  const v = Math.round(Number(n));
  if (v >= 100000000) {
    const oku = Math.floor(v / 100000000);
    const rest = v % 100000000;
    if (rest === 0) return `${oku.toLocaleString('ja-JP')}億円`;
    return `${oku.toLocaleString('ja-JP')}億${fmtYen(rest)}`;
  }
  if (v >= 10000) {
    const man = Math.floor(v / 10000);
    const rest = v % 10000;
    if (rest === 0) return `${man.toLocaleString('ja-JP')}万円`;
    return `${man.toLocaleString('ja-JP')}万${rest.toLocaleString('ja-JP')}円`;
  }
  return v.toLocaleString('ja-JP') + '円';
}

// memo「5億円未満：10万円」→ 「5億円未満」のように範囲だけ抽出
function rangeFromMemo(memo, lo, hi) {
  if (memo) {
    const idx = memo.indexOf('：');
    if (idx > 0) return memo.slice(0, idx).trim();
    return memo.trim();
  }
  return `${(lo || 0).toLocaleString()}〜${hi >= 999999999999 ? '上限なし' : (hi || 0).toLocaleString()}`;
}

// 架電リスト1行に表示する報酬チップ
// 通常: ¥X (固定) or ¥X〜¥Y (段階別レンジ) を mono フォントで表示
// ホバー: 段階別 tier 詳細をツールチップで表示 (税込換算額のみ)
function RewardCell({ list, rewardMaster, clientEngagementRewards }) {
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const reward = useMemo(() => {
    if (!list.client_id || !list.engagement_id) return null;
    return (clientEngagementRewards || []).find(
      r => r.client_id === list.client_id && r.engagement_id === list.engagement_id
    );
  }, [list.client_id, list.engagement_id, clientEngagementRewards]);
  const tiers = useMemo(() => {
    if (!reward?.reward_type) return [];
    return (rewardMaster || [])
      .filter(r => r.id === reward.reward_type)
      .sort((a, b) => (a._tierSort || 0) - (b._tierSort || 0));
  }, [rewardMaster, reward]);
  const head = tiers[0];
  if (!head) {
    return <span style={{ color: color.textLight, fontSize: 10 }}>—</span>;
  }
  const isFixed = head.calc_type === 'fixed_per_appo' || head.basis === '-';
  const withTax = (p) => head.tax === '税別' ? Math.round((p || 0) * 1.1) : (p || 0);
  let label;
  if (isFixed) {
    label = '¥' + withTax(head.price).toLocaleString();
  } else {
    const prices = tiers.map(t => withTax(t.price));
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    label = min === max ? `¥${min.toLocaleString()}` : `¥${min.toLocaleString()}〜¥${max.toLocaleString()}`;
  }
  const handleEnter = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const TIP_W = 300;
    const vw = window.innerWidth;
    // 画面右端を超えそうなら左にシフト (ホバー対象の右端を基準に右側合わせ)
    let x = rect.left;
    if (x + TIP_W > vw - 10) x = Math.max(10, vw - TIP_W - 10);
    setPos({ x, y: rect.bottom + 4 });
    setHover(true);
  };
  return (
    <span
      onMouseEnter={handleEnter}
      onMouseLeave={() => setHover(false)}
      onClick={e => e.stopPropagation()}
      style={{
        fontFamily: font.family.mono, fontSize: font.size.xs,
        color: color.navy, fontWeight: font.weight.semibold,
        borderBottom: `1px dotted ${color.textLight}`, cursor: 'default',
      }}
    >
      {label}
      {hover && createPortal(
        <div style={{
          position: 'fixed', top: pos.y, left: pos.x, zIndex: 99999,
          padding: '10px 12px', background: '#FFFFFF',
          border: `1px solid ${color.border}`, borderRadius: radius.md,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.12)',
          width: 300, fontSize: font.size.xs, color: color.textDark,
          fontFamily: font.family.sans, fontWeight: font.weight.normal,
          pointerEvents: 'none',
        }}>
          <div style={{
            fontWeight: font.weight.bold, color: color.navy, marginBottom: 6,
            paddingBottom: 4, borderBottom: `1px solid ${color.border}`,
          }}>
            {head.name}
            <span style={{ marginLeft: 6, fontSize: 10, color: color.textMid, fontWeight: font.weight.normal }}>
              ({head.basis === '-' ? '固定' : head.basis})
            </span>
          </div>
          {isFixed ? (
            <div style={{ color: color.textDark }}>
              アポ1件あたり {fmtYen(withTax(head.price))}
            </div>
          ) : (
            <div>
              {tiers.map((t, i) => (
                <div key={i} style={{
                  padding: '3px 0', color: color.textDark,
                  borderTop: i > 0 ? `1px dashed ${color.borderLight}` : 'none',
                }}>
                  {rangeFromMemo(t.memo, t.lo, t.hi)}：
                  <span style={{ fontWeight: font.weight.semibold }}>
                    {fmtYen(withTax(t.price))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>,
        document.body
      )}
    </span>
  );
}

export default function ListView({ filteredLists, allLists, filterStatus, setFilterStatus, filterType, setFilterType, searchQuery, setSearchQuery, sortBy, setSortBy, setSelectedList, callListData, setCallListData, listFormOpen, setListFormOpen, editingListId, setEditingListId, now, isAdmin = false, clientData = [], contactsByClient = {}, setCallFlowScreen, onOpenIndustryRules, rewardMaster = [], clientEngagementRewards = [] }) {
  const isMobile = useIsMobile();
  const { currentEngagement, engagements: allEngagements, categories: allCategories } = useEngagements();
  // 商材（business_categories）：現状はM&Aのみ
  const selectableCategories = useMemo(
    () => (allCategories || []).slice().sort((a, b) => (a.display_order || 0) - (b.display_order || 0)),
    [allCategories]
  );
  // 営業代行系の業務種別（リスト作成時の選択肢）
  // type は商材横断で共通 (seller_sourcing / matching / client_acquisition)、
  // 商材別 slug (例: client_acquisition_saas) が違っても type 軸で扱う。
  // 表示名は engagements.name を尊重（M&A=売り手ソーシング/買い手マッチング/クライアント開拓、
  // SaaS/IFA/人材=リード獲得/クライアント開拓 など、DB側の登録名そのまま）。
  const salesAgencyEngagements = useMemo(() => {
    const order = ['seller_sourcing', 'matching', 'client_acquisition'];
    return (allEngagements || [])
      .filter(e => order.includes(e.type) && e.status === 'active')
      .map(e => ({ id: e.id, slug: e.slug, type: e.type, name: e.name, category_id: e.category_id }))
      .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  }, [allEngagements]);
  const clientAcquisitionIds = useMemo(
    () => new Set(salesAgencyEngagements.filter(e => e.type === 'client_acquisition').map(e => e.id)),
    [salesAgencyEngagements]
  );
  // engagement.id → category 名 のマップ（一覧表示用）
  const engagementToCategoryName = useMemo(() => {
    const map = {};
    (allEngagements || []).forEach(e => {
      const cat = (allCategories || []).find(c => c.id === e.category_id);
      if (cat) map[e.id] = cat.name;
    });
    return map;
  }, [allEngagements, allCategories]);
  // engagement.id → engagement 表示名（業務種別名）のマップ
  const engagementToEngagementName = useMemo(() => {
    const map = {};
    salesAgencyEngagements.forEach(e => { map[e.id] = e.name; });
    return map;
  }, [salesAgencyEngagements]);
  const { columns: lvCols, gridTemplateColumns: lvGrid, contentMinWidth: lvMinW, onResizeStart: lvResize } = useColumnConfig('listView', LISTVIEW_COLS);
  const { columns: arCols, gridTemplateColumns: arGrid, contentMinWidth: arMinW, onResizeStart: arResize } = useColumnConfig('listViewArchive', LISTVIEW_ARCHIVE_COLS);
  // 「支援中」のクライアントのみ選択候補にする
  const clientOptions = clientData.filter(c => c.status === "支援中");

  // 担当者名を苗字のみで表示（CRMの同一クライアント担当者内で苗字被りがあれば名の頭文字付き）
  const shortManagerName = (list) => {
    const fullNames = (list.manager || '').split(', ').filter(Boolean);
    if (fullNames.length === 0) return '';
    const client = clientData.find(c => c.company === list.company);
    const contacts = client ? (contactsByClient[client._supaId] || []) : [];
    return fullNames.map(full => {
      const parts = full.split(/\s+/);
      const surname = parts[0];
      if (parts.length < 2) return surname;
      const sameSurname = contacts.filter(ct => {
        const ctParts = (ct.name || '').split(/\s+/);
        return ctParts[0] === surname && ct.name !== full;
      });
      return sameSurname.length > 0 ? `${surname}(${parts[1][0]})` : surname;
    }).join('・');
  };
  const emptyForm = { name: "", company: "", type: "M&A仲介", status: "架電可能", industry: "", count: "", manager: "", contactIds: [], companyInfo: "", companyUrl: "", scriptBody: "", cautions: "", notes: "", isProspecting: false, engagementId: "" };
  const [formData, setFormData] = useState(emptyForm);
  const [showRec, setShowRec] = useState(true);
  // 'sourcing' = 通常ソーシング, 'prospecting' = クライアント開拓, 'archived' = アーカイブ, 'all' = 全て
  // displayFilter: engagement slug ('seller_sourcing' / 'matching' / 'client_acquisition' / 'client_acquisition_saas' 等) | 'archived' | 'all'
  // 初期値は 'all' — 商材フィルタ 'all' との組み合わせで全リストが見えるようにする
  // (初期値 'seller_sourcing' だと「全商材」を選んでいても売り手ソーシングだけになる問題があった)
  const [displayFilter, setDisplayFilter] = useState('all');
  // categoryFilter: 商材 ('all' | business_categories.id) ── 2階層フィルタの親
  const [categoryFilter, setCategoryFilter] = useState('all');
  // 商材切替時に、選択中タイプが新商材に存在しなければ自動的に「全て」に戻す
  // (例: M&A→IFA に切り替えた時、買い手マッチングを選んでいたら IFA には無いので 'all' へ)
  useEffect(() => {
    if (categoryFilter === 'all') return;
    if (displayFilter === 'all' || displayFilter === 'archived') return;
    const eng = salesAgencyEngagements.find(e => e.slug === displayFilter);
    if (!eng || eng.category_id !== categoryFilter) {
      setDisplayFilter('all');
    }
  }, [categoryFilter, displayFilter, salesAgencyEngagements]);
  // engagement.id → category_id 引き直し (filteredLists の商材絞り込みに使用)
  const engagementToCategoryId = useMemo(() => {
    const map = {};
    (allEngagements || []).forEach(e => { map[e.id] = e.category_id; });
    return map;
  }, [allEngagements]);
  // トップタブ: 'lists' = 既存のリスト一覧 / 'smart_queue' = スマートキュー（リスト跨ぎ横断）
  // URLに保持してハードリロード/共有/戻る進むでも保持。プレフィックス lv_ で他画面と衝突回避。
  const [viewMode, setViewMode] = useUrlState('lv_view', 'lists', { allowed: ['lists', 'smart_queue'] });
  const [extractingUrl, setExtractingUrl] = useState(false);

  const handleExtractFromUrl = async () => {
    const url = (formData.companyUrl || '').trim();
    if (!url) { alert('HP URL を入力してください。'); return; }
    if (!/^https?:\/\//i.test(url)) { alert('URL は http:// または https:// で始まる必要があります。'); return; }
    if ((formData.companyInfo || '').trim().length > 0) {
      if (!window.confirm('企業概要に既存の内容があります。AI抽出結果で置き換えますか？')) return;
    }
    setExtractingUrl(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-company-from-url', { body: { url } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error === 'not_found' ? '該当する企業情報が見つかりませんでした。URLをご確認ください。' : data.error);
      if (!data?.overview) throw new Error('企業概要の抽出に失敗しました。');
      setFormData(p => ({ ...p, companyInfo: data.overview }));
    } catch (e) {
      alert('抽出に失敗しました: ' + (e?.message || '不明なエラー'));
    } finally {
      setExtractingUrl(false);
    }
  };

  // Dashboard の「現在のおすすめリスト TOP4」と同一ロジック: アクティブ + 架電可能 + recommendation あり、score降順 で TOP4
  // enrichedLists (allLists) を使うことで、現在のフィルタ状態に左右されない
  const topRecommended = (allLists || [])
    .filter(l => l.status === '架電可能' && !l.is_archived && l.recommendation)
    .sort((a, b) => (b.recommendation?.score || 0) - (a.recommendation?.score || 0))
    .slice(0, 4);

  const defaultEngagementId = () => {
    // currentEngagementが営業代行系3つのどれかなら採用、それ以外はseller_sourcingにフォールバック
    const cur = salesAgencyEngagements.find(e => e.id === currentEngagement?.id);
    if (cur) return cur.id;
    return salesAgencyEngagements.find(e => e.slug === 'seller_sourcing')?.id || "";
  };

  const handleOpenAdd = () => {
    setFormData({ ...emptyForm, engagementId: defaultEngagementId() });
    setEditingListId(null);
    setListFormOpen(true);
  };

  const handleOpenEdit = (list) => {
    setFormData({
      name: list.name || "",
      company: list.company, type: list.type, status: list.status,
      industry: list.industry, count: String(list.count), manager: list.manager,
      contactIds: list.contactIds || [],
      companyInfo: list.companyInfo || "", companyUrl: list.companyUrl || "", scriptBody: list.scriptBody || "", cautions: list.cautions || "", notes: list.notes || "",
      isProspecting: !!list.is_prospecting,
      engagementId: list.engagement_id || defaultEngagementId(),
    });
    setEditingListId(list.id);
    setListFormOpen(true);
  };

  const handleSave = async () => {
    if (!formData.company || !formData.industry || !formData.count) return;
    if (!formData.engagementId) { alert('タイプを選択してください'); return; }
    // クライアント開拓 engagement を選んだ場合は is_prospecting=true を自動付与
    const derivedIsProspecting = clientAcquisitionIds.has(formData.engagementId);
    const dataToSave = { ...formData, isProspecting: derivedIsProspecting };
    if (editingListId !== null) {
      const target = callListData.find(l => l.id === editingListId);
      if (target?._supaId) {
        const error = await updateCallList(target._supaId, dataToSave);
        if (error) { alert('保存に失敗しました: ' + (error.message || '不明なエラー')); return; }
      }
      setCallListData(prev => prev.map(l => l.id === editingListId ? { ...l, company: dataToSave.company, type: dataToSave.type, status: dataToSave.status, industry: dataToSave.industry, count: parseInt(dataToSave.count) || 0, manager: dataToSave.manager, contactIds: dataToSave.contactIds, companyInfo: dataToSave.companyInfo, companyUrl: dataToSave.companyUrl, scriptBody: dataToSave.scriptBody, cautions: dataToSave.cautions, notes: dataToSave.notes, is_prospecting: derivedIsProspecting, engagement_id: dataToSave.engagementId } : l));
    } else {
      const { result, error } = await insertCallList(dataToSave, dataToSave.engagementId || currentEngagement?.id);
      if (error || !result) { alert('保存に失敗しました: ' + (error?.message || '不明なエラー')); return; }
      const newId = Math.max(0, ...callListData.map(l => l.id)) + 1;
      setCallListData(prev => [...prev, { id: newId, ...dataToSave, contactIds: dataToSave.contactIds, count: parseInt(dataToSave.count) || 0, is_prospecting: derivedIsProspecting, engagement_id: dataToSave.engagementId, _supaId: result.id }]);
    }
    setListFormOpen(false);
    setEditingListId(null);
    setFormData(emptyForm);
  };

  const handleDelete = async (id) => {
    const target = callListData.find(l => l.id === id);
    if (!target?._supaId) { alert('Supabase IDが未設定のためアーカイブできません。'); return; }
    if (!window.confirm('このリストをアーカイブしますか？')) return;
    const error = await archiveCallList(target._supaId);
    if (error) { alert('アーカイブに失敗しました: ' + (error.message || '不明なエラー')); return; }
    setCallListData(prev => prev.map(l => l.id === id ? { ...l, is_archived: true } : l));
  };

  const inputStyle = {
    padding: "8px 12px", borderRadius: radius.lg,
    background: color.white, border: `1px solid ${color.border}`,
    color: color.textDark, fontSize: font.size.sm, fontFamily: font.family.sans, outline: "none",
  };
  const formInputStyle = {
    padding: "10px 14px", borderRadius: radius.lg,
    background: color.offWhite, border: `1px solid ${color.border}`,
    color: color.textDark, fontSize: font.size.base, fontFamily: font.family.sans, outline: "none", width: "100%",
  };

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <PageHeader
        title="架電リスト"
        description="架電リスト管理"
        style={{ marginBottom: space[3] }}
        right={onOpenIndustryRules && viewMode === 'lists' ? (
          <Button variant="secondary" size="sm" onClick={onOpenIndustryRules}>業種別ルールを開く</Button>
        ) : null}
      />

      {/* トップタブ: リスト一覧 / スマートキュー */}
      <div style={{
        display: 'flex', gap: space[1], marginBottom: space[4],
        borderBottom: `1px solid ${color.border}`,
      }}>
        {[
          { value: 'lists',       label: 'リスト一覧' },
          { value: 'smart_queue', label: 'スマートキュー' },
        ].map(t => {
          const active = viewMode === t.value;
          return (
            <button key={t.value} onClick={() => setViewMode(t.value)} style={{
              padding: '10px 22px', background: 'transparent',
              border: 'none', borderBottom: `2px solid ${active ? color.navy : 'transparent'}`,
              fontSize: font.size.sm, fontWeight: active ? font.weight.bold : font.weight.semibold,
              color: active ? color.navy : color.textMid, cursor: 'pointer',
              fontFamily: font.family.sans, transition: 'all 0.12s', marginBottom: -1,
            }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = color.navy; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = color.textMid; }}
            >{t.label}</button>
          );
        })}
      </div>

      {viewMode === 'smart_queue' && (
        <SmartQueueTab setCallFlowScreen={setCallFlowScreen} callListData={callListData} />
      )}

      {viewMode === 'lists' && <>
      {/* 時間外メッセージ */}
      {now && (now.getHours() < 7 || now.getHours() >= 20) && (
        <div style={{ background: color.white, borderRadius: radius.md, padding: "14px 20px", marginBottom: space[4], border: `1px solid ${color.border}`, borderLeft: `4px solid ${color.textLight}`, display: "flex", alignItems: "center", gap: space[2] }}>
          <span style={{ fontSize: font.size.base }}>夜</span>
          <span style={{ fontSize: font.size.sm, color: color.textMid, fontWeight: font.weight.semibold }}>この時間帯は架電時間外です</span>
          <span style={{ fontSize: 10, color: color.textLight }}>（7:00〜20:00が架電推奨時間帯）</span>
        </div>
      )}

      {/* Recommendation Banner */}
      {topRecommended.length > 0 && showRec && !(now && (now.getHours() < 7 || now.getHours() >= 20)) && (
        <div style={{
          background: color.white, borderRadius: radius.md, padding: isMobile ? "10px 12px" : "16px 20px", marginBottom: space[4],
          border: `1px solid ${color.border}`, borderLeft: "2px solid #1E40AF",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: space[3] }}>
            <div style={{ display: "flex", alignItems: "center", gap: space[2] }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color.success, animation: "pulse 2s infinite" }} />
              <span style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: color.navy }}>現在のおすすめリスト</span>
              <span style={{ fontSize: 10, color: color.textLight }}>
                {now ? (DAY_NAMES[now.getDay()] + "曜日 " + now.getHours() + "時台") : ""}
              </span>
              <span style={{ fontSize: 10, fontWeight: font.weight.bold, color: "#1E40AF", background: "#EFF6FF", padding: "1px 8px", borderRadius: 8 }}>
                {topRecommended.length}件
              </span>
            </div>
            <button onClick={() => setShowRec(false)} style={{
              background: "transparent", border: "none", cursor: "pointer",
              fontSize: 14, color: color.textLight, padding: "2px 6px",
            }}>×</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)", gap: space[2.5] }}>
            {topRecommended.map(list => (
              <TopListCard key={list.id} list={list} onClick={() => setSelectedList(list.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Filter Tabs: 商材 → タイプ の 2 階層 */}
      {(() => {
        const pillStyle = (active) => ({
          padding: "6px 16px", borderRadius: radius.md, fontSize: font.size.sm, fontWeight: font.weight.semibold,
          cursor: "pointer", transition: "all 0.15s", fontFamily: font.family.sans,
          ...(active
            ? { background: color.navy, color: color.white, border: `1px solid ${color.navy}` }
            : { background: color.white, color: color.textMid, border: `1px solid ${color.border}` }),
        });
        // 選択中商材配下のタイプ
        const typesForCategory = categoryFilter === 'all'
          ? []
          : salesAgencyEngagements.filter(e => e.category_id === categoryFilter);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[2], marginBottom: space[3] }}>
            {/* Row 1: 商材セレクタ */}
            <div style={{ display: 'flex', gap: space[1.5], alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold, minWidth: 40 }}>商材:</span>
              <button onClick={() => { setCategoryFilter('all'); setDisplayFilter('all'); }} style={pillStyle(categoryFilter === 'all')}>全商材</button>
              {selectableCategories.map(c => (
                <button key={c.id} onClick={() => setCategoryFilter(c.id)} style={pillStyle(categoryFilter === c.id)}>{c.name}</button>
              ))}
            </div>
            {/* Row 2: タイプセレクタ (商材選択中のみ表示) */}
            {categoryFilter !== 'all' && (
              <div style={{ display: 'flex', gap: space[1.5], alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold, minWidth: 40 }}>タイプ:</span>
                <button onClick={() => setDisplayFilter('all')} style={pillStyle(displayFilter === 'all')}>全て</button>
                {typesForCategory.map(e => (
                  <button key={e.slug} onClick={() => setDisplayFilter(e.slug)} style={pillStyle(displayFilter === e.slug)}>{e.name}</button>
                ))}
                <span style={{ flex: 1 }} />
                <button
                  onClick={() => setDisplayFilter(displayFilter === 'archived' ? 'all' : 'archived')}
                  title={displayFilter === 'archived' ? 'クリックでアーカイブ表示を解除' : 'アーカイブされたリストを表示'}
                  style={pillStyle(displayFilter === 'archived')}
                >アーカイブ</button>
              </div>
            )}
            {/* 商材=全商材 のときはアーカイブだけ右端に置く */}
            {categoryFilter === 'all' && (
              <div style={{ display: 'flex', gap: space[1.5], alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ flex: 1 }} />
                <button
                  onClick={() => setDisplayFilter(displayFilter === 'archived' ? 'all' : 'archived')}
                  title={displayFilter === 'archived' ? 'クリックでアーカイブ表示を解除' : 'アーカイブされたリストを表示'}
                  style={pillStyle(displayFilter === 'archived')}
                >アーカイブ</button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Filters */}
      <div style={{
        display: "flex", gap: space[2.5], marginBottom: space[5], flexWrap: "wrap", alignItems: "center",
        padding: isMobile ? "10px 12px" : "14px 18px", background: color.white, borderRadius: radius.md,
        border: `1px solid ${color.border}`,
      }}>
        <input type="text" placeholder="企業名・リスト名・担当者で検索..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ ...inputStyle, flex: "1 1 200px", minWidth: 180 }} />
        {(() => {
          const STATUS_OPTIONS = ['架電可能', '架電停止'];
          const isAll = filterStatus.length === 0;
          const toggleStatus = (label) => {
            if (label === '全ステータス') { setFilterStatus([]); return; }
            setFilterStatus(prev => prev.includes(label) ? prev.filter(s => s !== label) : [...prev, label]);
          };
          return (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {['全ステータス', ...STATUS_OPTIONS].map(label => {
                const isActive = label === '全ステータス' ? isAll : filterStatus.includes(label);
                return (
                  <button key={label} onClick={() => toggleStatus(label)} style={{
                    padding: '5px 10px', borderRadius: radius.md, cursor: 'pointer',
                    fontSize: font.size.xs, fontWeight: font.weight.semibold, fontFamily: font.family.sans,
                    background: isActive ? color.navy : color.cream,
                    color: isActive ? color.white : color.textMid,
                    border: `1px solid ${isActive ? color.navy : color.border}`,
                    transition: 'all 0.12s', whiteSpace: 'nowrap',
                  }}>{label}</button>
                );
              })}
            </div>
          );
        })()}
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={inputStyle}>
          <option value="all">全種別</option>
          <option value="M&A仲介">M&A仲介</option>
          <option value="IFA">IFA</option>
          <option value="ファンド">ファンド</option>
          <option value="売り手FA">売り手FA</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={inputStyle}>
          <option value="date">日付順</option>
          <option value="manager">担当者別</option>
          <option value="client">クライアント順</option>
        </select>
        <span style={{ fontSize: font.size.xs, color: color.textLight, fontWeight: font.weight.semibold, fontFamily: font.family.mono }}>{(() => {
          const archivedCount = callListData.filter(l => l.is_archived).length;
          if (displayFilter === 'archived') return archivedCount;
          const filterEng = salesAgencyEngagements.find(e => e.slug === displayFilter);
          let scope = filteredLists;
          if (categoryFilter !== 'all') scope = scope.filter(l => engagementToCategoryId[l.engagement_id] === categoryFilter);
          if (filterEng) scope = scope.filter(l => l.engagement_id === filterEng.id);
          return scope.length;
        })()}件</span>
        {isAdmin && (
          <div style={{ marginLeft: 'auto' }}>
            <Button variant="primary" size="sm" onClick={handleOpenAdd}>＋ リスト追加</Button>
          </div>
        )}
      </div>

      {/* Add/Edit Form */}
      {listFormOpen && (
        <div style={{
          background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md,
          padding: isMobile ? 14 : 24, marginBottom: space[5], animation: "fadeIn 0.2s ease",
          borderLeft: `2px solid ${color.navy}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: space[4] }}>
            <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy }}>{editingListId !== null ? "リストを編集" : "新しいリストを追加"}</div>
            <button onClick={() => { setListFormOpen(false); setEditingListId(null); }} style={{
              width: 28, height: 28, borderRadius: radius.lg, background: color.offWhite,
              border: `1px solid ${color.border}`, color: color.textMid, cursor: "pointer", fontSize: 14,
            }}>✕</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 14 }}>
            {/* 商材セレクタ（事業 > 商材 > 業務種別 の真ん中レイヤー） */}
            <div style={{ gridColumn: "span 3", display: "flex", alignItems: "center", gap: space[2], flexWrap: 'wrap' }}>
              <label style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textDark }}>商材 *</label>
              <div style={{ display: 'flex', gap: space[1.5] }}>
                {selectableCategories.map(c => {
                  // 選択中の engagement が属する category を active 表示
                  const selectedEng = salesAgencyEngagements.find(e => e.id === formData.engagementId);
                  const active = selectedEng?.category_id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        // 商材を切り替えたら、その配下の最初の業務種別をデフォルト選択
                        const first = salesAgencyEngagements.find(e => e.category_id === c.id);
                        if (first) setFormData(p => ({ ...p, engagementId: first.id }));
                      }}
                      style={{
                        padding: `6px ${space[3] + 2}px`, fontSize: font.size.sm,
                        background: active ? color.navy : color.white,
                        color: active ? color.white : color.textMid,
                        border: `1px solid ${active ? color.navy : color.border}`,
                        borderRadius: radius.md, cursor: 'pointer',
                        fontWeight: active ? font.weight.semibold : font.weight.normal,
                        fontFamily: font.family.sans,
                      }}
                    >{c.name}</button>
                  );
                })}
              </div>
            </div>
            {/* 業務種別セレクタ（商材配下） */}
            <div style={{ gridColumn: "span 3", display: "flex", alignItems: "center", gap: space[2], flexWrap: 'wrap' }}>
              <label style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textDark }}>タイプ *</label>
              <div style={{ display: 'flex', gap: space[1.5] }}>
                {(() => {
                  // 選択中商材配下の engagements のみ表示
                  const selectedEng = salesAgencyEngagements.find(e => e.id === formData.engagementId);
                  const targetCategoryId = selectedEng?.category_id || selectableCategories[0]?.id;
                  const candidates = salesAgencyEngagements.filter(e => e.category_id === targetCategoryId);
                  return candidates.map(e => {
                    const active = formData.engagementId === e.id;
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setFormData(p => ({ ...p, engagementId: e.id }))}
                        style={{
                          padding: `6px ${space[3] + 2}px`, fontSize: font.size.sm,
                          background: active ? color.navy : color.white,
                          color: active ? color.white : color.textMid,
                          border: `1px solid ${active ? color.navy : color.border}`,
                          borderRadius: radius.md, cursor: 'pointer',
                          fontWeight: active ? font.weight.semibold : font.weight.normal,
                          fontFamily: font.family.sans,
                        }}
                      >{e.name}</button>
                    );
                  });
                })()}
              </div>
              {clientAcquisitionIds.has(formData.engagementId) && (
                <span style={{ fontSize: font.size.xs, color: color.textLight }}>
                  （クライアント開拓は自動的に売上集計から除外され、インターン報酬のみ計上）
                </span>
              )}
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ fontSize: font.size.xs, color: color.textLight, display: "block", marginBottom: 4, fontWeight: font.weight.semibold }}>クライアント企業名 *</label>
              <ClientCombobox
                value={formData.company}
                options={clientOptions}
                onChange={(company) => setFormData(p => ({ ...p, company, contactIds: [], manager: '' }))}
                inputStyle={formInputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: font.size.xs, color: color.textLight, display: "block", marginBottom: 4, fontWeight: font.weight.semibold }}>リスト名 *</label>
              <input value={formData.industry} onChange={e => setFormData(p => ({ ...p, industry: e.target.value }))} style={formInputStyle} placeholder="例: 建設、プラスチック成形、IT、食品⑤" />
            </div>
            <div>
              <label style={{ fontSize: font.size.xs, color: color.textLight, display: "block", marginBottom: 4, fontWeight: font.weight.semibold }}>リスト社数 *</label>
              <input type="number" value={formData.count} onChange={e => setFormData(p => ({ ...p, count: e.target.value }))} style={formInputStyle} placeholder="例: 1000" />
            </div>
            <div>
              <label style={{ fontSize: font.size.xs, color: color.textLight, display: "block", marginBottom: 4, fontWeight: font.weight.semibold }}>クライアント担当者</label>
              {(() => {
                const selectedClient = clientOptions.find(c => c.company === formData.company);
                const contacts = selectedClient ? (contactsByClient[selectedClient._supaId] || []) : [];
                return contacts.length > 0 ? (
                  <div style={{ ...formInputStyle, display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 14px' }}>
                    {contacts.map(ct => (
                      <label key={ct.id} style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.sm, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={(formData.contactIds || []).includes(ct.id)}
                          onChange={e => {
                            const ids = e.target.checked
                              ? [...(formData.contactIds || []), ct.id]
                              : (formData.contactIds || []).filter(id => id !== ct.id);
                            const names = ids.map(id => contacts.find(c => c.id === id)?.name || '').filter(Boolean).join(', ');
                            setFormData(p => ({ ...p, contactIds: ids, manager: names }));
                          }}
                          style={{ accentColor: color.navy }}
                        />
                        <span style={{ color: color.textDark }}>{ct.name}</span>
                      </label>
                    ))}
                    {contacts.length === 0 && <span style={{ fontSize: font.size.xs, color: color.textLight }}>担当者未登録</span>}
                  </div>
                ) : (
                  <input value={formData.manager} onChange={e => setFormData(p => ({ ...p, manager: e.target.value }))} style={formInputStyle} placeholder="例: 田中（CRMで担当者を登録すると選択可能）" />
                );
              })()}
            </div>
<div style={{ gridColumn: "span 3" }}>
              <label style={{ fontSize: font.size.xs, color: color.textLight, display: "block", marginBottom: 4, fontWeight: font.weight.semibold }}>クライアント企業ホームページ URL</label>
              <div style={{ display: "flex", gap: space[2] }}>
                <input
                  type="url"
                  value={formData.companyUrl}
                  onChange={e => setFormData(p => ({ ...p, companyUrl: e.target.value }))}
                  style={{ ...formInputStyle, flex: 1 }}
                  placeholder="https://example.co.jp/about/"
                />
                <Button
                  variant="secondary"
                  size="md"
                  onClick={handleExtractFromUrl}
                  loading={extractingUrl}
                  disabled={extractingUrl || !(formData.companyUrl || '').trim()}
                >URLから自動入力</Button>
              </div>
              <div style={{ fontSize: 10, color: color.textLight, marginTop: 4 }}>
                URLを入力して「URLから自動入力」を押すと、AIがホームページを読み取り企業概要を自動生成します。
              </div>
            </div>
            <div style={{ gridColumn: "span 3" }}>
              <label style={{ fontSize: font.size.xs, color: color.textLight, display: "block", marginBottom: 4, fontWeight: font.weight.semibold }}>企業概要</label>
              <textarea
                value={formData.companyInfo}
                onChange={e => setFormData(p => ({ ...p, companyInfo: e.target.value }))}
                style={{ ...formInputStyle, minHeight: 60, resize: 'vertical' }}
                placeholder="クライアントの企業概要を入力..."
              />
            </div>
            <div style={{ gridColumn: "span 3" }}>
              <label style={{ fontSize: font.size.xs, color: color.textLight, display: "block", marginBottom: 4, fontWeight: font.weight.semibold }}>スクリプト <span style={{ fontSize: 9, color: color.gray400, fontWeight: font.weight.normal }}>（Scriptsページでマーカー編集可）</span></label>
              <textarea
                value={formData.scriptBody}
                onChange={e => setFormData(p => ({ ...p, scriptBody: e.target.value }))}
                style={{ ...formInputStyle, minHeight: 100, resize: 'vertical' }}
                placeholder="架電スクリプトを入力..."
              />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ fontSize: font.size.xs, color: color.textLight, display: "block", marginBottom: 4, fontWeight: font.weight.semibold }}>注意事項</label>
              <textarea value={formData.cautions} onChange={e => setFormData(p => ({ ...p, cautions: e.target.value }))} style={{ ...formInputStyle, minHeight: 50, resize: "vertical" }} placeholder="架電時の注意事項を入力..." />
            </div>
            <div>
              <label style={{ fontSize: font.size.xs, color: color.textLight, display: "block", marginBottom: 4, fontWeight: font.weight.semibold }}>備考</label>
              <textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} style={{ ...formInputStyle, minHeight: 50, resize: "vertical" }} placeholder="任意" />
            </div>
          </div>
          <div style={{ marginTop: space[4], display: "flex", gap: space[2.5] }}>
            <Button
              variant="primary"
              size="md"
              onClick={handleSave}
              disabled={!formData.company || !formData.industry || !formData.count}
            >{editingListId !== null ? "更新する" : "追加する"}</Button>
            <Button
              variant="outline"
              size="md"
              onClick={() => { setListFormOpen(false); setEditingListId(null); }}
            >キャンセル</Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{
        background: color.white, border: `1px solid ${color.border}`,
        borderRadius: radius.md, overflowX: "auto", overflowY: "hidden",
      }}>
        <div style={{ minWidth: lvMinW }}>
        <div style={{
          display: "grid", gridTemplateColumns: lvGrid,
          padding: isMobile ? "6px 10px" : "8px 16px", background: color.navy,
          fontSize: isMobile ? 10 : font.size.xs, fontWeight: font.weight.semibold, color: color.white, verticalAlign: 'middle',
        }}>
          {['クライアント', '商材', 'タイプ', 'リスト名', '社数', '担当者', '報酬', '架電進捗率', 'おすすめ度', ''].map((label, i) => (
            <span key={i} style={{ position: 'relative', textAlign: lvCols[i]?.align || 'left', minWidth: 0, cursor: 'default', userSelect: 'none' }}>
              {label}
              {i < 9 && <ColumnResizeHandle colIndex={i} onResizeStart={lvResize} />}
            </span>
          ))}
        </div>
        {displayFilter !== 'archived' && <div style={{ maxHeight: 600, overflowY: "auto" }}>
          {(() => {
            // 2 階層絞り込み:
            //   (a) categoryFilter (商材) ── 'all' 以外なら配下 engagement のみ残す
            //   (b) displayFilter (タイプ) ── slug 一致の engagement のみ残す
            const filterEng = salesAgencyEngagements.find(e => e.slug === displayFilter);
            let activeLists = filteredLists;
            if (categoryFilter !== 'all') {
              activeLists = activeLists.filter(l => engagementToCategoryId[l.engagement_id] === categoryFilter);
            }
            if (filterEng) {
              activeLists = activeLists.filter(l => l.engagement_id === filterEng.id);
            }
            const grouped = {};
            activeLists.forEach(list => {
              const key = list.company;
              if (!grouped[key]) grouped[key] = [];
              grouped[key].push(list);
            });
            let idx = 0;
            return Object.entries(grouped).map(([client, lists]) => (
              <div key={client}>
                <div style={{
                  padding: "6px 16px", background: alpha(color.navy, 0.03),
                  borderBottom: `1px solid ${color.borderLight}`,
                  display: "flex", alignItems: "center", gap: space[2],
                  position: "sticky", top: 0, zIndex: 1,
                }}>
                  <span style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.navy }}>{client}</span>
                  <span style={{ fontSize: 10, color: color.textLight }}>{lists.length}リスト・{lists.reduce((s,l)=>s+l.count,0).toLocaleString()}社</span>
                </div>
                {lists.map((list) => {
                  const i = idx++;
                  return (
                    <div key={list.id} style={{
                      display: "grid", gridTemplateColumns: lvGrid,
                      padding: "10px 16px",
                      borderBottom: `1px solid ${color.offWhite}`,
                      fontSize: font.size.sm, alignItems: "center",
                      transition: "background 0.15s",
                      opacity: list.status === "架電停止" ? 0.4 : 1,
                      animation: "fadeIn 0.2s ease " + (i * 0.015) + "s both",
                      borderLeft: "2px solid transparent",
                      position: "relative",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#EAF4FF"; e.currentTarget.style.borderLeft = `2px solid ${color.navy}`; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderLeft = "2px solid transparent"; }}
                    >
                      <span onClick={() => setSelectedList(list.id)} style={{ fontWeight: font.weight.medium, paddingRight: space[2], cursor: "pointer", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: lvCols[0]?.align || 'left', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {list.status === "架電停止" && <span style={{ color: color.danger, marginRight: 4 }}>■</span>}
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{list.company}</span>
                      </span>
                      <span style={{ color: color.textMid, fontSize: font.size.xs, textAlign: lvCols[1]?.align || 'center' }}>{engagementToCategoryName[list.engagement_id] || '—'}</span>
                      <span style={{ display: "flex", justifyContent: lvCols[2]?.align === 'right' ? 'flex-end' : lvCols[2]?.align === 'center' ? 'center' : 'flex-start' }}>
                        {(() => {
                          const typeName = engagementToEngagementName[list.engagement_id] || '—';
                          const tone = typeName === '売り手ソーシング' ? color.navy
                                     : typeName === '買い手マッチング' ? '#6366F1'
                                     : typeName === 'クライアント開拓' ? color.gold
                                     : color.textMid;
                          return <TypeBadge color={tone} small>{typeName}</TypeBadge>;
                        })()}
                      </span>
                      <span style={{ color: color.textMid, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: lvCols[3]?.align || 'left' }}>{list.industry}</span>
                      <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs, color: color.textMid, textAlign: lvCols[4]?.align || 'right' }}>{list.count.toLocaleString()}</span>
                      <span style={{ color: color.textMid, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: lvCols[5]?.align || 'center' }}>{shortManagerName(list)}</span>
                      <span style={{ textAlign: lvCols[6]?.align || 'right', display: 'block' }}>
                        <RewardCell list={list} rewardMaster={rewardMaster} clientEngagementRewards={clientEngagementRewards} />
                      </span>
                      <span style={{ display: "flex", justifyContent: lvCols[7]?.align === 'right' ? 'flex-end' : lvCols[7]?.align === 'center' ? 'center' : 'flex-start' }}><ProgressPill pct={list.call_progress_pct} /></span>
                      <span style={{ display: "flex", justifyContent: lvCols[8]?.align === 'right' ? 'flex-end' : lvCols[8]?.align === 'center' ? 'center' : 'flex-start' }}>{list.status === "架電可能" && <ScorePill score={list.recommendation.score} />}</span>
                      {isAdmin && (
                        <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", display: "flex", gap: 4 }}>
                          <button onClick={() => handleOpenEdit(list)} title="編集" style={{
                            width: isMobile ? 36 : 26, height: isMobile ? 36 : 26, borderRadius: radius.md, background: color.offWhite,
                            border: `1px solid ${color.border}`, color: color.textMid, cursor: "pointer",
                            fontSize: font.size.xs, display: "flex", alignItems: "center", justifyContent: "center",
                          }}>✎</button>
                          <button onClick={() => { handleDelete(list.id); }} title="削除" style={{
                            width: isMobile ? 36 : 26, height: isMobile ? 36 : 26, borderRadius: radius.md, background: color.dangerSoft,
                            border: `1px solid ${alpha(color.danger, 0.13)}`, color: color.danger, cursor: "pointer",
                            fontSize: font.size.xs, display: "flex", alignItems: "center", justifyContent: "center",
                          }}>✕</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ));
          })()}
        </div>}
        {/* アーカイブ済みリスト (商材/タイプ フィルタ + 検索 + ソート を適用) */}
        {displayFilter === 'archived' && (() => {
          let archivedLists = callListData.filter(l => l.is_archived);
          if (categoryFilter !== 'all') {
            archivedLists = archivedLists.filter(l => engagementToCategoryId[l.engagement_id] === categoryFilter);
          }
          // 検索 (企業名・業種・担当者で部分一致) — 通常リストと同じロジック
          if (searchQuery) {
            const q = searchQuery.toLowerCase();
            archivedLists = archivedLists.filter(l =>
              (l.company || '').toLowerCase().includes(q) ||
              (l.industry || '').toLowerCase().includes(q) ||
              (l.manager || '').toLowerCase().includes(q)
            );
          }
          // アーカイブ画面は「クライアント順」がデフォルト。
          // 通常リスト共通の sortBy は初期値 'date' だが、アーカイブを開く目的は
          // 「あの会社のリスト過去にあったよな」を探すケースが多いので、
          // selector がデフォルト ('date') の時は client にフォールバックする。
          // selector で明示的に 'manager' や 'client' を選べばそれを反映。
          const effectiveSort = (sortBy === 'date') ? 'client' : sortBy;
          if (effectiveSort === 'client') {
            archivedLists = [...archivedLists].sort((a, b) =>
              (a.company || '').localeCompare(b.company || '', 'ja')
            );
          } else if (effectiveSort === 'manager') {
            archivedLists = [...archivedLists].sort((a, b) =>
              (a.manager || '').localeCompare(b.manager || '', 'ja')
            );
          }
          if (archivedLists.length === 0) return <div style={{ padding: "24px 16px", textAlign: "center", fontSize: font.size.sm, color: color.textLight }}>— No records —</div>;
          return (
            <div style={{ overflowX: "auto", overflowY: "hidden" }}>
              <div style={{ minWidth: arMinW }}>
              {archivedLists.map(list => (
                <div key={list.id} style={{
                  display: "grid", gridTemplateColumns: arGrid,
                  padding: "8px 16px", fontSize: font.size.xs, alignItems: "center",
                  borderBottom: `1px solid ${color.borderLight}`,
                  opacity: 0.5, background: color.offWhite,
                }}>
                  <span style={{ color: color.textMid, fontWeight: font.weight.medium, textAlign: arCols[0]?.align || 'left' }}>{list.company}</span>
                  <span style={{ color: color.textLight, fontSize: 10, textAlign: arCols[1]?.align || 'center' }}>{engagementToCategoryName[list.engagement_id] || '—'}</span>
                  <span style={{ color: color.textLight, fontSize: 10, textAlign: arCols[2]?.align || 'center' }}>{engagementToEngagementName[list.engagement_id] || '—'}</span>
                  <span style={{ color: color.textLight, textAlign: arCols[3]?.align || 'left' }}>{list.industry}</span>
                  <span style={{ fontFamily: font.family.mono, fontSize: 10, color: color.textLight, textAlign: arCols[4]?.align || 'left' }}>{list.count.toLocaleString()}</span>
                  <span style={{ color: color.textLight, textAlign: arCols[5]?.align || 'left' }}>{shortManagerName(list)}</span>
                  <span style={{ textAlign: arCols[6]?.align || 'right' }}>
                    {isAdmin && <button onClick={async () => {
                      const error = await restoreCallList(list._supaId);
                      if (error) { alert('復元に失敗しました: ' + (error.message || '不明なエラー')); return; }
                      setCallListData(prev => prev.map(l => l.id === list.id ? { ...l, is_archived: false } : l));
                    }} style={{
                      padding: isMobile ? "8px 12px" : "4px 10px", borderRadius: radius.md, fontSize: isMobile ? font.size.sm : font.size.xs, fontWeight: font.weight.medium,
                      background: color.white, color: color.navy, border: `1px solid ${color.navy}`, cursor: "pointer",
                      fontFamily: font.family.sans,
                    }}>復元</button>}
                  </span>
                </div>
              ))}
              </div>
            </div>
          );
        })()}
        </div>
      </div>
      </>}
    </div>
  );
}

// 「クライアント企業名」入力欄: 一文字以上入力で候補ドロップダウン表示。
// ↑↓/Enter/Escape キーボード操作、外側クリックで閉じる。
function ClientCombobox({ value, options, onChange, inputStyle }) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

  const matches = useMemo(() => {
    const q = (query || '').trim().toLowerCase();
    if (!q) return options;
    return options.filter(c => (c.company || '').toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    const onMouseDown = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, []);

  useEffect(() => { setHighlight(0); }, [query, open]);

  const pick = (company) => {
    onChange(company);
    setQuery(company);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown') { setOpen(true); e.preventDefault(); }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(h + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const m = matches[highlight];
      if (m) pick(m.company);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="クライアント名を入力（例: 株式…）"
        style={inputStyle}
      />
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md,
          boxShadow: shadow.md, maxHeight: 240, overflowY: 'auto', zIndex: 60,
        }}>
          {matches.length === 0 ? (
            <div style={{ padding: '10px 14px', fontSize: font.size.xs, color: color.textLight, fontStyle: 'italic' }}>
              該当する「支援中」クライアントがありません
            </div>
          ) : (
            matches.map((c, i) => (
              <div
                key={c._supaId || c.company}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => { e.preventDefault(); pick(c.company); }}
                style={{
                  padding: '8px 14px', fontSize: font.size.sm,
                  cursor: 'pointer',
                  background: highlight === i ? alpha(color.navy, 0.06) : color.white,
                  color: c.company === value ? color.navy : color.textDark,
                  fontWeight: c.company === value ? font.weight.semibold : font.weight.normal,
                  fontFamily: font.family.sans,
                }}
              >
                {c.company}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}