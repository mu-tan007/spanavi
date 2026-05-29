import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { color, space, radius, font, alpha, shadow } from '../../constants/design';
import { Card } from '../ui';
import PageHeader from '../common/PageHeader';
import { ProgressPill } from '../common/TopListCard';
import { useCallQueue } from './smart-queue/useCallQueue';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import {
  fetchClientMonthlyTargets,
  fetchEngagementMonthlyTargets, upsertEngagementMonthlyTarget,
  fetchListAnalysisSummary, fetchListDrillDown, updateListTodoMemo,
  invokeGenListFollowupEmail, invokeSendEmail,
} from '../../lib/supabaseWrite';
import { useImeSafeInput } from '../../lib/useImeSafe';

const COUNTABLE_STATUSES = new Set(['面談済', '事前確認済', 'アポ取得']);
const SELF_CLIENT_NAME = 'M&Aソーシングパートナーズ株式会社';
// 軸①のタイプ表示順 (列順)
const AXIS1_TYPES = [
  { type: 'seller_sourcing', label: '売り手ソーシング' },
  { type: 'matching',        label: '買い手マッチング' },
  { type: 'lead_generation', label: 'リード獲得' },
];

const yen = (n) => '¥' + Number(n || 0).toLocaleString();
const fmtNum = (n) => Number(n || 0).toLocaleString();
const fmtPct = (n) => n == null || isNaN(n) ? '—' : Math.round(n) + '%';

function getCurrentMonth() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 7);
}

function monthList(centerYm, range = 6) {
  const [y, m] = centerYm.split('-').map(Number);
  const out = [];
  for (let i = -range; i <= range; i++) {
    const d = new Date(y, m - 1 + i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function businessDaysRemaining(ym) {
  const [y, m] = ym.split('-').map(Number);
  const todayJst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const cursor = new Date(Date.UTC(y, m - 1, todayJst.getUTCDate() + 1));
  const monthEnd = new Date(Date.UTC(y, m, 0));
  let count = 0;
  while (cursor <= monthEnd) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function businessDaysPassed(ym) {
  const [y, m] = ym.split('-').map(Number);
  const todayJst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const isThisMonth = todayJst.getUTCFullYear() === y && todayJst.getUTCMonth() === m - 1;
  const endDay = isThisMonth ? todayJst.getUTCDate() : new Date(Date.UTC(y, m, 0)).getUTCDate();
  let count = 0;
  for (let day = 1; day <= endDay; day++) {
    const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

function Section({ title, hint, right, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2] }}>
          <h2 style={{
            fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.navy,
            margin: 0, fontFamily: `${font.family.display}, 'Noto Sans JP', sans-serif`,
          }}>{title}</h2>
          {hint && <span style={{ fontSize: font.size.xs, color: color.textLight }}>{hint}</span>}
        </div>
        {right}
      </div>
      <Card padding="md">{children}</Card>
    </div>
  );
}

function NumberCard({ label, value, sub, valueColor = color.navy }) {
  // 既存ダッシュボードと揃えるため、白背景 + 細borderのみ。cream/色背景は使わない。
  return (
    <div style={{
      padding: `${space[3]}px ${space[4]}px`,
      background: color.white,
      borderRadius: radius.md,
      border: `1px solid ${color.border}`,
    }}>
      <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.textLight, marginBottom: space[1] }}>
        {label}
      </div>
      <div style={{
        fontSize: font.size['2xl'], fontWeight: font.weight.bold, color: valueColor,
        fontFamily: font.family.mono, lineHeight: 1.1,
      }}>{value}</div>
      {sub && <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: space[1] }}>{sub}</div>}
    </div>
  );
}

// マトリクス用セル
function MatrixCell({ count, isTotal, isEmpty }) {
  if (isEmpty) {
    return <td style={{ padding: '6px 8px', textAlign: 'right', color: color.textLight, fontSize: font.size.sm, fontFamily: font.family.mono }}>—</td>;
  }
  return (
    <td style={{
      padding: '6px 8px', textAlign: 'right',
      fontSize: font.size.sm, fontFamily: font.family.mono,
      fontWeight: isTotal ? font.weight.bold : font.weight.normal,
      color: isTotal ? color.navy : color.textDark,
      background: isTotal ? alpha(color.navyLight, 0.04) : 'transparent',
    }}>
      {count > 0 ? fmtNum(count) + '件' : '0'}
    </td>
  );
}

export default function BusinessOverviewView({
  appoData = [], callListData = [], clientData = [],
  contactsByClient = {}, currentUser = '',
  setCallFlowScreen,
}) {
  const [month, setMonth] = useState(getCurrentMonth());
  const [engagementsMaster, setEngagementsMaster] = useState([]); // {id, type, category_id, category_name}
  const [categoriesMaster, setCategoriesMaster] = useState([]); // {id, name, display_order}
  const [clientTargets, setClientTargets] = useState({}); // 軸① clientId → target_count
  const [engagementTargets, setEngagementTargets] = useState({}); // 軸② engagementId → target_count
  const [savingKey, setSavingKey] = useState(null);

  // engagements + categories 取得
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: engs }, { data: cats }] = await Promise.all([
        supabase.from('engagements').select('id, name, type, category_id, status').eq('org_id', getOrgId()).eq('status', 'active'),
        supabase.from('business_categories').select('id, name, display_order').eq('org_id', getOrgId()).eq('is_active', true).order('display_order'),
      ]);
      if (cancelled) return;
      const catMap = new Map((cats || []).map(c => [c.id, c]));
      setEngagementsMaster((engs || []).map(e => ({
        ...e,
        category_name: catMap.get(e.category_id)?.name || null,
        category_order: catMap.get(e.category_id)?.display_order || 999,
      })));
      setCategoriesMaster(cats || []);
    })();
    return () => { cancelled = true; };
  }, []);

  // 当月の目標を取得（軸①= client_monthly_targets / 軸②= engagement_monthly_targets）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: cMT }, { data: eMT }] = await Promise.all([
        fetchClientMonthlyTargets(month, month),
        fetchEngagementMonthlyTargets(month, month),
      ]);
      if (cancelled) return;
      const cm = {};
      (cMT || []).forEach(t => { cm[t.client_id] = t.target_count; });
      setClientTargets(cm);
      const em = {};
      (eMT || []).forEach(t => { em[t.engagement_id] = t.target_count; });
      setEngagementTargets(em);
    })();
    return () => { cancelled = true; };
  }, [month]);

  // engagementMap: id → engagement
  const engagementMap = useMemo(() => {
    const map = {};
    engagementsMaster.forEach(e => { map[e.id] = e; });
    return map;
  }, [engagementsMaster]);

  // 集計関数 (任意の年月)
  const computeStats = useCallback((targetYm) => {
    let a1c = 0, a1s = 0, a1r = 0, a2c = 0, a2r = 0;
    const a1Matrix = {};
    const a2Matrix = {};
    appoData.forEach(a => {
      if (!a.getDate || !COUNTABLE_STATUSES.has(a.status)) return;
      if (a.getDate.slice(0, 7) !== targetYm) return;
      const list = callListData.find(l => l._supaId === a.list_id);
      const engId = list?.engagement_id;
      const eng = engagementMap[engId];
      if (!eng) return;
      const isAxis2 = eng.type === 'client_acquisition';
      const sales = Number(a.sales || 0);
      const reward = Number(a.reward || 0);
      const cat = eng.category_name || '—';
      if (isAxis2) {
        a2c++; a2r += reward;
        a2Matrix[cat] = (a2Matrix[cat] || 0) + 1;
      } else {
        a1c++; a1s += sales; a1r += reward;
        if (!a1Matrix[cat]) a1Matrix[cat] = {};
        a1Matrix[cat][eng.type] = (a1Matrix[cat][eng.type] || 0) + 1;
      }
    });
    return {
      axis1: { count: a1c, sales: a1s, reward: a1r, matrix: a1Matrix },
      axis2: { count: a2c, reward: a2r, matrix: a2Matrix },
    };
  }, [appoData, callListData, engagementMap]);

  const stats = useMemo(() => computeStats(month), [computeStats, month]);

  // 前月 ym 算出
  const prevMonth = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, [month]);

  const previousStats = useMemo(() => computeStats(prevMonth), [computeStats, prevMonth]);

  // 自社client_id 特定 (軸②目標が紐付く)
  const selfClient = useMemo(() => clientData.find(c => c.company === SELF_CLIENT_NAME), [clientData]);

  // 軸②各engagement (client_acquisition_* 商材別)
  const axis2Engagements = useMemo(() => {
    return engagementsMaster
      .filter(e => e.type === 'client_acquisition')
      .sort((a, b) => (a.category_order || 999) - (b.category_order || 999));
  }, [engagementsMaster]);

  // 軸①目標合計 (自社以外の client_monthly_targets 合計)
  const axis1TargetTotal = useMemo(() => {
    return Object.entries(clientTargets).reduce((sum, [cid, val]) => {
      if (cid === selfClient?._supaId) return sum;
      return sum + Number(val || 0);
    }, 0);
  }, [clientTargets, selfClient]);

  // 軸②目標合計
  const axis2TargetTotal = useMemo(() => {
    return axis2Engagements.reduce((sum, e) => sum + Number(engagementTargets[e.id] || 0), 0);
  }, [axis2Engagements, engagementTargets]);

  const daysPassed = businessDaysPassed(month);
  const daysRemaining = businessDaysRemaining(month);
  const totalDays = daysPassed + daysRemaining;
  const axis1Pace = daysPassed > 0 ? Math.round(stats.axis1.count / daysPassed * totalDays) : 0;
  const axis1AchieveRate = axis1TargetTotal > 0 ? (stats.axis1.count / axis1TargetTotal) * 100 : null;
  const axis1PaceRate = axis1TargetTotal > 0 ? (axis1Pace / axis1TargetTotal) * 100 : null;
  const axis2AchieveRate = axis2TargetTotal > 0 ? (stats.axis2.count / axis2TargetTotal) * 100 : null;

  // 推奨アクション
  const recommendations = useMemo(() => {
    const recs = [];
    if (axis1TargetTotal > 0 && axis1PaceRate != null && axis1PaceRate < 90) {
      recs.push({
        level: '高', title: '軸①目標未達見込み',
        desc: `現在のペースで${fmtNum(axis1Pace)}件着地予測 (目標${fmtNum(axis1TargetTotal)}件、達成率${fmtPct(axis1PaceRate)})。リスト追加打診 + 見込み先プール再アプローチを推奨。`,
      });
    } else if (axis1TargetTotal > 0 && axis1PaceRate != null && axis1PaceRate < 100) {
      recs.push({ level: '中', title: '軸①目標 ぎりぎり達成見込み', desc: '見込み先プールへの再アプローチを強化推奨。' });
    }
    if (axis2TargetTotal > 0 && axis2AchieveRate != null && axis2AchieveRate < 70) {
      recs.push({
        level: '高', title: '軸②クライアント開拓 進捗遅れ',
        desc: `当月${fmtNum(stats.axis2.count)}件 (目標${fmtNum(axis2TargetTotal)}件、達成率${fmtPct(axis2AchieveRate)})。新規開拓加速を推奨。`,
      });
    }
    if (recs.length === 0 && (axis1TargetTotal > 0 || axis2TargetTotal > 0)) {
      recs.push({ level: '低', title: '順調', desc: '目標達成ペースで進行中。' });
    }
    return recs;
  }, [axis1TargetTotal, axis1Pace, axis1PaceRate, axis2TargetTotal, axis2AchieveRate, stats]);

  // 軸②目標 upsert (engagement_id 単位)
  const saveAxis2Target = useCallback(async (engagementId, val) => {
    setSavingKey(engagementId);
    await upsertEngagementMonthlyTarget(engagementId, month, val);
    setEngagementTargets(prev => ({ ...prev, [engagementId]: Number(val) || 0 }));
    setSavingKey(null);
  }, [month]);

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title="事業俯瞰"
        description="全社の数字と目標達成状況を一目で把握"
        style={{ marginBottom: 24 }}
        right={
          <select value={month} onChange={(e) => setMonth(e.target.value)} style={{
            padding: `${space[1]}px ${space[2]}px`, borderRadius: radius.md,
            border: `1px solid ${color.border}`, fontSize: font.size.sm,
            background: color.white, color: color.textDark, outline: 'none',
            fontFamily: font.family.sans,
          }}>
            {monthList(getCurrentMonth(), 6).map(m => (
              <option key={m} value={m}>{m.replace('-', '年') + '月'}</option>
            ))}
          </select>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>

        {/* A. 今月の数字サマリー + 商材×タイプ マトリクス */}
        <Section title="今月の数字" hint="軸① 案件実行 / 軸② クライアント開拓">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[3] }}>

            {/* 軸① */}
            <div style={{
              padding: space[3], background: color.white,
              borderRadius: radius.md, border: `1px solid ${color.border}`,
            }}>
              <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy, marginBottom: space[2] }}>
                ① 案件実行
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[2], marginBottom: space[3] }}>
                <NumberCard label="アポ取得" value={`${fmtNum(stats.axis1.count)}件`} />
                <NumberCard label="当社売上" value={yen(stats.axis1.sales)} />
                <NumberCard label="インターン報酬" value={yen(stats.axis1.reward)} />
                <NumberCard
                  label="目標対比" valueColor={axis1AchieveRate != null && axis1AchieveRate < 90 ? color.danger : color.navy}
                  value={axis1AchieveRate != null ? fmtPct(axis1AchieveRate) : '—'}
                  sub={axis1TargetTotal > 0 ? `${fmtNum(stats.axis1.count)} / ${fmtNum(axis1TargetTotal)}件` : '目標未設定'}
                />
              </div>
              {/* 軸① 商材×タイプマトリクス */}
              <div style={{ background: color.white, borderRadius: radius.md, border: `1px solid ${color.border}`, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: color.navy, color: color.white }}>
                      <th style={{ padding: '6px 8px', fontSize: font.size.xs, textAlign: 'left', fontWeight: font.weight.semibold }}>商材</th>
                      {AXIS1_TYPES.map(t => (
                        <th key={t.type} style={{ padding: '6px 8px', fontSize: font.size.xs, textAlign: 'right', fontWeight: font.weight.semibold }}>{t.label}</th>
                      ))}
                      <th style={{ padding: '6px 8px', fontSize: font.size.xs, textAlign: 'right', fontWeight: font.weight.semibold, background: alpha(color.white, 0.1) }}>合計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoriesMaster.map(cat => {
                      const row = stats.axis1.matrix[cat.name] || {};
                      const rowTotal = AXIS1_TYPES.reduce((s, t) => s + (row[t.type] || 0), 0);
                      // この商材で active な engagement type のセットを取得 (空セル判定用)
                      const validTypes = new Set(engagementsMaster.filter(e => e.category_id === cat.id && e.type !== 'client_acquisition').map(e => e.type));
                      return (
                        <tr key={cat.id} style={{ borderTop: `1px solid ${color.border}` }}>
                          <td style={{ padding: '6px 8px', fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textDark }}>{cat.name}</td>
                          {AXIS1_TYPES.map(t => (
                            <MatrixCell key={t.type} count={row[t.type] || 0} isEmpty={!validTypes.has(t.type)} />
                          ))}
                          <MatrixCell count={rowTotal} isTotal />
                        </tr>
                      );
                    })}
                    <tr style={{ borderTop: `2px solid ${color.border}`, background: alpha(color.navyLight, 0.04) }}>
                      <td style={{ padding: '6px 8px', fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy }}>合計</td>
                      {AXIS1_TYPES.map(t => {
                        const total = Object.values(stats.axis1.matrix).reduce((s, row) => s + (row[t.type] || 0), 0);
                        return <MatrixCell key={t.type} count={total} isTotal />;
                      })}
                      <MatrixCell count={stats.axis1.count} isTotal />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 軸② */}
            <div style={{
              padding: space[3], background: color.white,
              borderRadius: radius.md, border: `1px solid ${color.border}`,
            }}>
              <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy, marginBottom: space[2] }}>
                ② クライアント開拓
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[2], marginBottom: space[3] }}>
                <NumberCard label="アポ取得" value={`${fmtNum(stats.axis2.count)}件`} />
                <NumberCard label="インターン報酬" value={yen(stats.axis2.reward)} />
                <NumberCard
                  label="目標対比" valueColor={axis2AchieveRate != null && axis2AchieveRate < 70 ? color.danger : color.navy}
                  value={axis2AchieveRate != null ? fmtPct(axis2AchieveRate) : '—'}
                  sub={axis2TargetTotal > 0 ? `${fmtNum(stats.axis2.count)} / ${fmtNum(axis2TargetTotal)}件` : '目標未設定'}
                />
              </div>
              {/* 軸② 商材別 実績 + 目標入力 */}
              <div style={{ background: color.white, borderRadius: radius.md, border: `1px solid ${color.border}`, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: color.navy, color: color.white }}>
                      <th style={{ padding: '6px 8px', fontSize: font.size.xs, textAlign: 'left', fontWeight: font.weight.semibold }}>商材</th>
                      <th style={{ padding: '6px 8px', fontSize: font.size.xs, textAlign: 'right', fontWeight: font.weight.semibold }}>実績</th>
                      <th style={{ padding: '6px 8px', fontSize: font.size.xs, textAlign: 'right', fontWeight: font.weight.semibold }}>目標 (件)</th>
                      <th style={{ padding: '6px 8px', fontSize: font.size.xs, textAlign: 'right', fontWeight: font.weight.semibold }}>達成率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {axis2Engagements.map(e => {
                      const cat = e.category_name || '—';
                      const actual = stats.axis2.matrix[cat] || 0;
                      const target = engagementTargets[e.id] || 0;
                      const rate = target > 0 ? (actual / target) * 100 : null;
                      return (
                        <tr key={e.id} style={{ borderTop: `1px solid ${color.border}` }}>
                          <td style={{ padding: '6px 8px', fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textDark }}>{cat}</td>
                          <MatrixCell count={actual} />
                          <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                            <input
                              type="number" min="0" defaultValue={target || ''}
                              onBlur={(ev) => {
                                const v = Number(ev.target.value) || 0;
                                if (v !== target) saveAxis2Target(e.id, v);
                              }}
                              placeholder="—"
                              style={{
                                width: 70, padding: '2px 6px', textAlign: 'right',
                                borderRadius: radius.sm, border: `1px solid ${color.border}`,
                                fontSize: font.size.sm, fontFamily: font.family.mono,
                                background: savingKey === e.id ? color.gray50 : color.white, outline: 'none',
                              }}
                              disabled={savingKey === e.id}
                            />
                          </td>
                          <td style={{
                            padding: '6px 8px', textAlign: 'right',
                            fontSize: font.size.sm, fontFamily: font.family.mono,
                            color: rate != null && rate < 70 ? color.danger : (rate != null ? color.navy : color.textLight),
                          }}>
                            {rate != null ? fmtPct(rate) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={{ borderTop: `2px solid ${color.border}`, background: alpha(color.navyLight, 0.04) }}>
                      <td style={{ padding: '6px 8px', fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy }}>合計</td>
                      <MatrixCell count={stats.axis2.count} isTotal />
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontSize: font.size.sm, fontWeight: font.weight.bold, fontFamily: font.family.mono, color: color.navy }}>
                        {axis2TargetTotal > 0 ? `${fmtNum(axis2TargetTotal)}件` : '—'}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontSize: font.size.sm, fontWeight: font.weight.bold, fontFamily: font.family.mono, color: axis2AchieveRate != null && axis2AchieveRate < 70 ? color.danger : color.navy }}>
                        {axis2AchieveRate != null ? fmtPct(axis2AchieveRate) : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Section>

        {/* F. コスト・粗利・利益率 */}
        <SectionF stats={stats} previousStats={previousStats} />

        {/* C. リスト分析 */}
        <SectionListAnalysis
          setCallFlowScreen={setCallFlowScreen}
          callListData={callListData}
          clientData={clientData}
          contactsByClient={contactsByClient}
          currentUser={currentUser}
        />

      </div>
    </div>
  );
}

// ========================================================================
// C. リスト分析 ─ 商材×タイプ別 停滞度ワースト + ドリルダウンドロワー
// ========================================================================
const STAGNATION_COLORS = {
  0: { bg: 'transparent', fg: color.textLight, label: '—' },
  1: { bg: color.successSoft || alpha(color.success, 0.15), fg: color.success, label: '1' },
  2: { bg: color.infoSoft    || alpha(color.info, 0.15),    fg: color.info,    label: '2' },
  3: { bg: color.warnSoft    || alpha(color.warn, 0.18),    fg: color.warn,    label: '3' },
  4: { bg: alpha(color.danger, 0.15),                       fg: color.danger,  label: '4' },
  5: { bg: color.danger,                                    fg: color.white,   label: '5' },
};

function StagnationBadge({ level }) {
  const s = STAGNATION_COLORS[level] || STAGNATION_COLORS[0];
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: radius.pill || 999,
      fontSize: font.size.xs, fontWeight: font.weight.semibold,
      background: s.bg, color: s.fg, minWidth: 28, textAlign: 'center',
      fontFamily: font.family.mono,
    }}>{s.label}</span>
  );
}

function CountBadge({ count, onClick, tone = 'navy' }) {
  if (!count) return <span style={{ color: color.textLight, fontSize: font.size.sm }}>—</span>;
  const tones = {
    navy:    { bg: alpha(color.navy, 0.08),    fg: color.navy },
    warn:    { bg: alpha(color.warn, 0.15),    fg: color.warn },
    danger:  { bg: alpha(color.danger, 0.12),  fg: color.danger },
  };
  const t = tones[tone] || tones.navy;
  return (
    <button onClick={onClick} style={{
      padding: '2px 10px', borderRadius: radius.pill || 999,
      fontSize: font.size.xs, fontWeight: font.weight.semibold,
      background: t.bg, color: t.fg, border: 'none', cursor: 'pointer',
      fontFamily: font.family.mono,
    }}
    onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
    >{count}件</button>
  );
}

function SectionListAnalysis({ setCallFlowScreen, callListData = [], clientData = [], contactsByClient = {}, currentUser = '' }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState(null);
  const [emailCtx, setEmailCtx] = useState(null); // { kind:'list', row } メール送信モーダル対象
  // スマートキューと同じ「キュー連続架電」を使う。
  // suppressChecks=true で「アポ獲得/除外スキップ」「再コール警告」「他人架電警告」を全 off にする。
  // (リスト分析からの架電は『キーマン再コール/断り状態を承知の上で意図的に再アプローチ』する経路のため)
  const { openQueue } = useCallQueue({ setCallFlowScreen, callListData, suppressChecks: true });
  // 商材×タイプセレクタ (デフォルトはデータ取得後に初回グループへ自動セット)
  const [selectedKey, setSelectedKey] = useState(null);
  // ソート方向: 'worst' = 停滞度高い順, 'best' = 停滞度低い順 (= 健全順)
  const [sortDir, setSortDir] = useState('worst');

  useEffect(() => {
    let cancelled = false;
    fetchListAnalysisSummary().then(({ data }) => {
      if (cancelled) return;
      setRows(data || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // 商材×タイプでグループ化
  const groups = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = `${r.category_name || '—'}|${r.eng_type}`;
      if (!map.has(key)) {
        map.set(key, {
          key, category: r.category_name || '—',
          eng_type: r.eng_type, eng_name: r.eng_name,
          cat_order: r.cat_order || 999, rows: [],
        });
      }
      map.get(key).rows.push(r);
    }
    const typeOrder = ['seller_sourcing', 'matching', 'client_acquisition'];
    return Array.from(map.values())
      .sort((a, b) =>
        (a.cat_order - b.cat_order) ||
        (typeOrder.indexOf(a.eng_type) - typeOrder.indexOf(b.eng_type))
      );
  }, [rows]);

  // 初回データロード時にデフォルトグループ選択
  useEffect(() => {
    if (!selectedKey && groups.length > 0) setSelectedKey(groups[0].key);
  }, [groups, selectedKey]);

  // 選択中グループ + ソート適用
  const activeGroup = useMemo(() => {
    const g = groups.find(g => g.key === selectedKey);
    if (!g) return null;
    const sorted = g.rows.slice().sort((a, b) => {
      if (sortDir === 'worst') {
        return (b.stagnation - a.stagnation) || (a.appo_count - b.appo_count);
      }
      // best: 停滞度低い順 (= 健全) , 同じならアポ数多い順
      return (a.stagnation - b.stagnation) || (b.appo_count - a.appo_count);
    });
    return { ...g, rows: sorted };
  }, [groups, selectedKey, sortDir]);

  // 商材リスト (重複なし)
  const categories = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const g of groups) {
      if (!seen.has(g.category)) {
        seen.add(g.category);
        out.push({ category: g.category, cat_order: g.cat_order });
      }
    }
    return out;
  }, [groups]);

  const selectedCategory = activeGroup?.category;

  const handleOpenDrill = useCallback(async (row, kind, kindLabel) => {
    setDrill({ list: row, kind, kindLabel, rows: [], loading: true });
    const { data } = await fetchListDrillDown(row.list_id, kind);
    setDrill(prev =>
      prev && prev.list?.list_id === row.list_id && prev.kind === kind
        ? { ...prev, rows: data, loading: false }
        : prev
    );
  }, []);

  // ドリルダウン Drawer で「架電」ボタンを押した時の挙動。
  // 表示中の全件をキュー化して、押した行から開始。架電集中ページで前後ボタンで連続架電できる。
  const handleCallItem = useCallback((listId, startItemId, allRows) => {
    if (!openQueue) return;
    const queueItems = (allRows || [])
      .filter(r => r.item_id)
      .map(r => ({ list_id: listId, item_id: r.item_id }));
    if (queueItems.length === 0) return;
    const startIdx = Math.max(0, queueItems.findIndex(q => q.item_id === startItemId));
    openQueue(queueItems, startIdx);
    setDrill(null);
  }, [openQueue]);

  // pillスタイル
  const pillStyle = (active) => ({
    padding: '5px 14px', borderRadius: radius.md, fontSize: font.size.xs,
    fontWeight: font.weight.semibold, cursor: 'pointer', fontFamily: font.family.sans,
    transition: 'all 0.15s',
    ...(active
      ? { background: color.navy, color: color.white, border: `1px solid ${color.navy}` }
      : { background: color.white, color: color.textMid, border: `1px solid ${color.border}` }),
  });

  return (
    <>
      <Section title="リスト分析 ─ 既存リストでさらに伸ばす" hint="商材×タイプで切替・停滞度で並べ替え可">
        {loading ? (
          <div style={{ fontSize: font.size.sm, color: color.textMid, padding: space[3] }}>読み込み中…</div>
        ) : groups.length === 0 ? (
          <div style={{ fontSize: font.size.sm, color: color.textMid, padding: space[3] }}>表示するアクティブリストがありません</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
            {/* 商材セレクタ */}
            <div style={{ display: 'flex', gap: space[1.5], alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold, minWidth: 40 }}>商材:</span>
              {categories.map(c => {
                const firstGroupOfCat = groups.find(g => g.category === c.category);
                return (
                  <button key={c.category}
                    onClick={() => setSelectedKey(firstGroupOfCat?.key)}
                    style={pillStyle(selectedCategory === c.category)}
                  >{c.category}</button>
                );
              })}
            </div>
            {/* タイプセレクタ */}
            <div style={{ display: 'flex', gap: space[1.5], alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold, minWidth: 40 }}>タイプ:</span>
              {groups.filter(g => g.category === selectedCategory).map(g => (
                <button key={g.key} onClick={() => setSelectedKey(g.key)} style={pillStyle(selectedKey === g.key)}>
                  {g.eng_name}
                </button>
              ))}
              <span style={{ flex: 1 }} />
              {/* ソート切替 */}
              <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>並び順:</span>
              <button onClick={() => setSortDir('worst')} style={pillStyle(sortDir === 'worst')}>ワースト順</button>
              <button onClick={() => setSortDir('best')} style={pillStyle(sortDir === 'best')}>ベスト順</button>
            </div>
            {/* テーブル */}
            {activeGroup && (
              <ListAnalysisTable group={activeGroup} sortDir={sortDir} onOpenDrill={handleOpenDrill}
                onOpenEmail={(row) => setEmailCtx({ kind: 'list', row })} />
            )}
          </div>
        )}
      </Section>

      <DrillDownDrawer drill={drill} onClose={() => setDrill(null)} onCallItem={handleCallItem} />
      {emailCtx && (
        <EmailFollowupModal
          modalCtx={emailCtx}
          callListData={callListData}
          clientData={clientData}
          contactsByClient={contactsByClient}
          currentUser={currentUser}
          onClose={() => setEmailCtx(null)}
        />
      )}
    </>
  );
}

function ListAnalysisTable({ group, sortDir, onOpenDrill, onOpenEmail }) {
  const [expanded, setExpanded] = useState(false);
  const top10 = group.rows.slice(0, 10);
  const rest = group.rows.slice(10);
  const visible = expanded ? group.rows : top10;

  const th = { padding: '8px 10px', fontSize: font.size.xs, textAlign: 'left', fontWeight: font.weight.semibold, color: color.white };
  const td = { padding: '8px 10px', fontSize: font.size.sm, borderTop: `1px solid ${color.border}` };

  return (
    <div>
      <div style={{ fontSize: font.size.xs, color: color.textLight, marginBottom: space[1] }}>
        {group.rows.length}リスト中、{sortDir === 'worst' ? 'ワースト' : 'ベスト'}10件を表示
      </div>
      <div style={{ overflowX: 'auto', border: `1px solid ${color.border}`, borderRadius: radius.md }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
          <thead>
            <tr style={{ background: color.navy }}>
              <th style={th}>クライアント</th>
              <th style={th}>リスト名</th>
              <th style={{ ...th, textAlign: 'right' }}>社数</th>
              <th style={{ ...th, textAlign: 'center' }}>架電進捗</th>
              <th style={{ ...th, textAlign: 'right' }}>アポ数</th>
              <th style={{ ...th, textAlign: 'center' }}>停滞度</th>
              <th style={{ ...th, textAlign: 'right' }}>最終<br />アポから</th>
              <th style={{ ...th, textAlign: 'right' }}>最終<br />架電から</th>
              <th style={{ ...th, textAlign: 'center' }}>リスケ中</th>
              <th style={{ ...th, textAlign: 'center' }}>キーマン<br />再コール</th>
              <th style={{ ...th, textAlign: 'center' }}>キーマン断り<br />(高/中)</th>
              <th style={{ ...th, textAlign: 'left', minWidth: 220 }}>ToDo</th>
              <th style={{ ...th, textAlign: 'center' }}>メール送信</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(r => (
              <tr key={r.list_id} style={{ background: r.stagnation >= 4 ? alpha(color.danger, 0.03) : color.white }}>
                <td style={{ ...td, color: color.textMid, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.list_client || '—'}
                </td>
                <td style={{ ...td, color: color.textDark }}>
                  {r.list_industry || '(無題)'}
                </td>
                <td style={{ ...td, textAlign: 'right', fontFamily: font.family.mono, color: color.textMid }}>
                  {Number(r.total_count || 0).toLocaleString()}
                </td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <ProgressPill pct={r.call_progress_pct} />
                </td>
                <td style={{ ...td, textAlign: 'right', fontFamily: font.family.mono, color: color.textDark, fontWeight: font.weight.semibold }}>
                  {r.appo_count}
                </td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <StagnationBadge level={r.stagnation} />
                </td>
                <td style={{ ...td, textAlign: 'right', fontFamily: font.family.mono,
                  color: r.days_since_last_appo != null && r.days_since_last_appo > 30 ? color.danger : color.textMid }}>
                  {r.days_since_last_appo != null ? `${r.days_since_last_appo}日` : '—'}
                </td>
                <td style={{ ...td, textAlign: 'right', fontFamily: font.family.mono,
                  color: r.days_since_last_call != null && r.days_since_last_call > 30 ? color.danger : color.textMid }}>
                  {r.days_since_last_call != null ? `${r.days_since_last_call}日` : '—'}
                </td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <CountBadge count={r.rescheduling_count} tone="warn"
                    onClick={() => onOpenDrill(r, 'rescheduling', 'リスケ中アポ')} />
                </td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <CountBadge count={r.keyman_recall_count} tone="navy"
                    onClick={() => onOpenDrill(r, 'keyman_recall', 'キーマン再コール')} />
                </td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <CountBadge count={r.keyman_reject_high_med_count} tone="danger"
                    onClick={() => onOpenDrill(r, 'keyman_reject_high_med', 'キーマン断り(温度感 高/中)')} />
                </td>
                <td style={{ ...td, padding: '4px 8px' }}>
                  <TodoMemoCell listId={r.list_id} initialValue={r.todo_memo || ''} />
                </td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <button onClick={() => onOpenEmail?.(r)} style={{
                    padding: '5px 12px', background: color.white, color: color.navy,
                    border: `1px solid ${color.navy}`, borderRadius: radius.md,
                    fontSize: font.size.xs, fontWeight: font.weight.semibold,
                    cursor: 'pointer', fontFamily: font.family.sans, whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = alpha(color.navy, 0.08); }}
                  onMouseLeave={e => { e.currentTarget.style.background = color.white; }}
                  >メール作成</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rest.length > 0 && (
        <button onClick={() => setExpanded(!expanded)} style={{
          marginTop: space[2], padding: '6px 14px',
          background: color.white, border: `1px solid ${color.border}`,
          borderRadius: radius.md, fontSize: font.size.xs, color: color.textMid,
          cursor: 'pointer', fontFamily: font.family.sans,
        }}>{expanded ? `▲ 折りたたむ` : `▼ もっと見る (+${rest.length}件)`}</button>
      )}
    </div>
  );
}

// ToDo メモセル:
//   - blur 時に自動保存 (e.target.value を直接読んで state 遅延回避)
//   - IME 確定 / 通常入力後 800ms の debounce でも自動保存 (リロードに備えて未保存を残さない)
//   - IME safe (compositionend まで保存しない)
function TodoMemoCell({ listId, initialValue }) {
  const [value, setValue] = useState(initialValue || '');
  const savedRef = useRef(initialValue || '');
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    setValue(initialValue || '');
    savedRef.current = initialValue || '';
  }, [initialValue]);

  const doSave = async (v) => {
    if (v === savedRef.current) return;
    setSaving(true);
    const { error } = await updateListTodoMemo(listId, v);
    setSaving(false);
    if (!error) savedRef.current = v;
  };

  const ime = useImeSafeInput(value, (v) => {
    setValue(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSave(v), 800);
  });

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const handleBlur = (e) => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    doSave(e.target.value);
  };

  return (
    <textarea
      value={ime.value}
      onChange={ime.onChange}
      onCompositionStart={ime.onCompositionStart}
      onCompositionEnd={ime.onCompositionEnd}
      onBlur={handleBlur}
      placeholder="Next Action を入力..."
      rows={2}
      style={{
        width: '100%', minWidth: 200, minHeight: 38,
        padding: '4px 8px',
        border: `1px solid ${saving ? color.warn : color.border}`,
        borderRadius: radius.sm,
        fontSize: font.size.xs, fontFamily: font.family.sans,
        color: color.textDark, background: saving ? alpha(color.warn, 0.04) : color.white,
        resize: 'vertical', outline: 'none',
      }}
    />
  );
}

// File → base64 文字列 (data URL のヘッダー除いたbody部のみ)
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || '';
      const comma = String(result).indexOf(',');
      resolve(comma >= 0 ? String(result).slice(comma + 1) : String(result));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 署名2種 (gmail-auto-reply と同方式)
const SIG_DEFAULT = `

-----------------------------------------------
M&Aソーシングパートナーズ株式会社
代表取締役　篠宮　拓武
Mail: shinomiya@ma-sp.co
Tel:   080-4134-4038
Hp: https://ma-sp.co/
X: https://x.com/masp_007?s=21
-----------------------------------------------`;
const SIG_RALLY = `

MASP 篠宮`;
const SIG_OPTIONS = [
  { key: 'default', label: 'フル署名 (初回・正式)', text: SIG_DEFAULT },
  { key: 'rally',   label: '簡易 (MASP 篠宮)',     text: SIG_RALLY },
  { key: 'none',    label: '署名なし',              text: '' },
];

// ========================================================================
// リスト状況 メール作成モーダル
// modalCtx:
//   { kind: 'list', row }        ... リスト分析行
//   { kind: 'client', client }   ... 支援中以外クライアント
export function EmailFollowupModal({ modalCtx, callListData, clientData, contactsByClient, currentUser, onClose }) {
  // クライアント・担当者解決
  let clientId = null;
  let headerTitle = '';
  let headerSubtitle = '';
  let aiPayloadContext = null;

  if (modalCtx?.kind === 'list') {
    const row = modalCtx.row;
    const list = (callListData || []).find(l => l._supaId === row.list_id);
    clientId = list?.client_id || list?._client_supaId || null;
    headerTitle = 'リスト状況フォローアップメール作成';
    headerSubtitle = `${row.list_client} / ${row.eng_name}\n対象リスト: ${row.list_industry || '(無題)'}`;
    aiPayloadContext = { listContext: {
      client_name: row.list_client, list_industry: row.list_industry, eng_name: row.eng_name,
      total_count: row.total_count, call_progress_pct: Number(row.call_progress_pct || 0),
      appo_count: row.appo_count, rescheduling_count: row.rescheduling_count,
      keyman_recall_count: row.keyman_recall_count,
      keyman_reject_high_med_count: row.keyman_reject_high_med_count,
      last_appo_days: row.days_since_last_appo, last_call_days: row.days_since_last_call,
      stagnation: row.stagnation,
    }};
  } else if (modalCtx?.kind === 'client') {
    const client = modalCtx.client;
    clientId = client.client_id;
    headerTitle = 'クライアントフォローメール作成';
    headerSubtitle = `${client.client_name}\n現ステータス: ${client.status} / 業種: ${client.industry || '—'}`;
    aiPayloadContext = { clientContext: {
      client_name: client.client_name,
      status: client.status,
      industry: client.industry,
      days_since_status_change: client.days_since_status_change,
      contact_count: client.contact_count,
      past_appo_count: client.past_appo_count,
    }};
  }

  const contacts = (clientId && contactsByClient?.[clientId]) || [];

  // 初期は最初の担当者をTo
  const [toIds, setToIds] = useState(contacts.length > 0 ? [contacts[0].id] : []);
  const [ccIds, setCcIds] = useState([]);
  // フリー入力メールアドレス (カンマ/空白/改行区切りで複数可、テスト送信用途等)
  const [extraToInput, setExtraToInput] = useState('');
  const [extraCcInput, setExtraCcInput] = useState('');
  const [intent, setIntent] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sentOk, setSentOk] = useState(false);
  // 署名選択: default=フル / rally=簡易 / none=なし
  const [signatureKey, setSignatureKey] = useState('default');
  // 添付ファイル: [{ filename, data (base64), mimeType, size }]
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);
  const sendingRef = useRef(false);
  const intentIme = useImeSafeInput(intent, setIntent);
  const subjectIme = useImeSafeInput(subject, setSubject);
  const bodyIme = useImeSafeInput(body, setBody);

  const toggleId = (set, setter, id) => {
    setter(set.includes(id) ? set.filter(x => x !== id) : [...set, id]);
  };

  // カンマ/空白/改行 区切りのメアド文字列を {name, email}[] に変換
  // メアド以外は無視、name はローカルパート (@より前) を仮置き
  const parseExtraEmails = (raw) => {
    if (!raw) return [];
    return String(raw)
      .split(/[\s,;]+/).map(s => s.trim()).filter(Boolean)
      .filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
      .map(email => ({ name: email.split('@')[0], email }));
  };

  // 全宛先 (担当者選択 + フリー入力)
  const allToRecipients = () => [
    ...contacts.filter(c => toIds.includes(c.id)).map(c => ({ name: c.name, email: c.email })),
    ...parseExtraEmails(extraToInput),
  ];
  const allCcRecipients = () => [
    ...contacts.filter(c => ccIds.includes(c.id)).map(c => ({ name: c.name, email: c.email })),
    ...parseExtraEmails(extraCcInput),
  ];

  const handleGenerate = async () => {
    const recipients = allToRecipients();
    const ccRecipients = allCcRecipients();
    if (recipients.length === 0) { setError('宛先 (To) を1名以上選択またはフリー入力してください'); return; }
    if (!intent.trim()) { setError('伝えたい内容を入力してください'); return; }
    setGenerating(true); setError(null);
    const { subject: s, body: b, error: e } = await invokeGenListFollowupEmail({
      ...(aiPayloadContext || {}),
      recipients, ccRecipients, userIntent: intent,
    });
    setGenerating(false);
    if (e) { setError(String(e.message || e) || 'AI生成に失敗しました'); return; }
    setSubject(s); setBody(b);
  };

  const handleSend = async () => {
    if (sendingRef.current) return;
    if (!subject.trim() || !body.trim()) { setError('件名と本文を入力してください'); return; }
    const toAll = allToRecipients();
    if (toAll.length === 0) { setError('宛先 (To) を1名以上選択またはフリー入力してください'); return; }
    sendingRef.current = true; setSending(true); setError(null);
    const to = toAll.map(r => r.email).join(', ');
    const cc = allCcRecipients().map(r => r.email).join(', ');
    const sigText = (SIG_OPTIONS.find(o => o.key === signatureKey) || SIG_OPTIONS[0]).text;
    const finalBody = body + sigText;
    const attPayload = attachments.length > 0
      ? attachments.map(a => ({ filename: a.filename, data: a.data, mimeType: a.mimeType }))
      : undefined;
    const { error: e } = await invokeSendEmail({ to, subject, body: finalBody, cc, attachments: attPayload });
    sendingRef.current = false; setSending(false);
    if (e) { setError(String(e.message || e) || '送信に失敗しました'); return; }
    setSentOk(true);
    setTimeout(() => onClose(), 1500);
  };

  // ファイル添付処理
  const handleFilePick = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const MAX_TOTAL = 24 * 1024 * 1024; // Gmail添付合計上限の安全側目安 (25MBより少し低め)
    const currentTotal = attachments.reduce((s, a) => s + (a.size || 0), 0);
    let total = currentTotal;
    const newOnes = [];
    for (const f of files) {
      total += f.size;
      if (total > MAX_TOTAL) {
        setError(`添付ファイル合計が ${(MAX_TOTAL / 1024 / 1024).toFixed(0)}MB を超えるためスキップしました: ${f.name}`);
        continue;
      }
      const data = await fileToBase64(f);
      newOnes.push({ filename: f.name, data, mimeType: f.type || 'application/octet-stream', size: f.size });
    }
    setAttachments(prev => [...prev, ...newOnes]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (idx) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: alpha(color.navyDeep || color.navy, 0.5),
      zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: space[4],
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: color.white, borderRadius: radius.lg, boxShadow: shadow.xl,
        width: '100%', maxWidth: 720, maxHeight: '92vh', overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* ヘッダ */}
        <div style={{
          padding: `${space[3]}px ${space[4]}px`, background: color.navy, color: color.white,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderRadius: `${radius.lg}px ${radius.lg}px 0 0`,
        }}>
          <div>
            <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold }}>
              {headerTitle}
            </div>
            <div style={{ fontSize: font.size.xs, opacity: 0.8, marginTop: 4, whiteSpace: 'pre-line' }}>
              {headerSubtitle}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: color.white, fontSize: 24,
            cursor: 'pointer', padding: 4,
          }}>×</button>
        </div>

        <div style={{ padding: space[4], display: 'flex', flexDirection: 'column', gap: space[3] }}>
          {/* 宛先 To */}
          <div>
            <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.textMid, marginBottom: space[1] }}>
              宛先 (To)
            </div>
            {contacts.length === 0 ? (
              <div style={{ fontSize: font.size.xs, color: color.textLight, marginBottom: space[1] }}>
                このクライアントには担当者が登録されていません。下のフリー入力欄を使ってください。
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: space[1] }}>
                {contacts.map(c => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.sm, cursor: 'pointer' }}>
                    <input type="checkbox" checked={toIds.includes(c.id)} onChange={() => toggleId(toIds, setToIds, c.id)} />
                    <span style={{ fontWeight: font.weight.semibold }}>{c.name || '(名前未設定)'}</span>
                    <span style={{ color: color.textMid, fontFamily: font.family.mono, fontSize: font.size.xs }}>{c.email || '(メール未設定)'}</span>
                  </label>
                ))}
              </div>
            )}
            <input
              type="text" value={extraToInput} onChange={e => setExtraToInput(e.target.value)}
              placeholder="追加のメールアドレス (カンマ区切りで複数可、テスト送信等に)"
              autoComplete="off" name="spnv_extra_to" data-lpignore="true" data-1p-ignore="true"
              style={{
                width: '100%', padding: '6px 10px', border: `1px solid ${color.border}`,
                borderRadius: radius.sm, fontSize: font.size.xs, fontFamily: font.family.mono,
                color: color.textDark, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* CC */}
          <div>
            <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.textMid, marginBottom: space[1] }}>
              CC (任意)
            </div>
            {contacts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: space[1] }}>
                {contacts.filter(c => !toIds.includes(c.id)).map(c => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.sm, cursor: 'pointer' }}>
                    <input type="checkbox" checked={ccIds.includes(c.id)} onChange={() => toggleId(ccIds, setCcIds, c.id)} />
                    <span>{c.name || '(名前未設定)'}</span>
                    <span style={{ color: color.textMid, fontFamily: font.family.mono, fontSize: font.size.xs }}>{c.email || '(メール未設定)'}</span>
                  </label>
                ))}
              </div>
            )}
            <input
              type="text" value={extraCcInput} onChange={e => setExtraCcInput(e.target.value)}
              placeholder="追加のメールアドレス (カンマ区切りで複数可)"
              autoComplete="off" name="spnv_extra_cc" data-lpignore="true" data-1p-ignore="true"
              style={{
                width: '100%', padding: '6px 10px', border: `1px solid ${color.border}`,
                borderRadius: radius.sm, fontSize: font.size.xs, fontFamily: font.family.mono,
                color: color.textDark, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* 自然言語入力 */}
          <div>
            <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.textMid, marginBottom: space[1] }}>
              現状や伝えたい内容 (篠宮の言葉でラフに書いてOK。AI が文体ガイドに沿って整えます)
            </div>
            <textarea
              value={intentIme.value}
              onChange={intentIme.onChange}
              onCompositionStart={intentIme.onCompositionStart}
              onCompositionEnd={intentIme.onCompositionEnd}
              rows={5}
              placeholder="例: このリストはもう500社以上架電してアポも数件取れたけど、ここ1ヶ月停滞している。そろそろ新しいリストいただきたいので前向きに検討してほしい旨を伝えたい"
              style={{
                width: '100%', padding: space[2], border: `1px solid ${color.border}`,
                borderRadius: radius.sm, fontSize: font.size.sm, fontFamily: font.family.sans,
                color: color.textDark, resize: 'vertical', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <button onClick={handleGenerate} disabled={generating} style={{
            padding: '10px 16px', background: generating ? color.gray100 : color.navy,
            color: color.white, border: 'none', borderRadius: radius.md,
            fontSize: font.size.sm, fontWeight: font.weight.semibold, cursor: generating ? 'wait' : 'pointer',
            fontFamily: font.family.sans, alignSelf: 'flex-start',
          }}>
            {generating ? 'AI 生成中...' : 'AI でメール作成'}
          </button>

          {/* 生成結果プレビュー (編集可) */}
          {(subject || body) && (
            <>
              <div style={{ borderTop: `1px solid ${color.border}`, paddingTop: space[3] }}>
                <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.textMid, marginBottom: space[1] }}>
                  件名 (編集可)
                </div>
                <input
                  value={subjectIme.value}
                  onChange={subjectIme.onChange}
                  onCompositionStart={subjectIme.onCompositionStart}
                  onCompositionEnd={subjectIme.onCompositionEnd}
                  style={{
                    width: '100%', padding: space[2], border: `1px solid ${color.border}`,
                    borderRadius: radius.sm, fontSize: font.size.sm, fontFamily: font.family.sans,
                    color: color.textDark, outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: space[1], flexWrap: 'wrap', gap: space[2] }}>
                  <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.textMid }}>
                    本文 (編集可)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
                    <span style={{ fontSize: font.size.xs, color: color.textMid }}>署名:</span>
                    {SIG_OPTIONS.map(opt => (
                      <label key={opt.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: font.size.xs, cursor: 'pointer', color: color.textDark }}>
                        <input type="radio" name="sig" value={opt.key} checked={signatureKey === opt.key} onChange={() => setSignatureKey(opt.key)} />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
                <textarea
                  value={bodyIme.value}
                  onChange={bodyIme.onChange}
                  onCompositionStart={bodyIme.onCompositionStart}
                  onCompositionEnd={bodyIme.onCompositionEnd}
                  rows={16}
                  style={{
                    width: '100%', padding: space[2], border: `1px solid ${color.border}`,
                    borderRadius: radius.sm, fontSize: font.size.sm, fontFamily: font.family.sans,
                    color: color.textDark, resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              {/* 添付ファイル */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[1], flexWrap: 'wrap' }}>
                  <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.textMid }}>
                    添付ファイル (任意・合計24MBまで)
                  </span>
                  <button type="button" onClick={() => fileInputRef.current?.click()} style={{
                    padding: '4px 12px', background: color.white, color: color.navy,
                    border: `1px solid ${color.navy}`, borderRadius: radius.sm,
                    fontSize: font.size.xs, fontWeight: font.weight.semibold, cursor: 'pointer',
                    fontFamily: font.family.sans,
                  }}>+ ファイル追加</button>
                  <input ref={fileInputRef} type="file" multiple onChange={handleFilePick} style={{ display: 'none' }} />
                </div>
                {attachments.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {attachments.map((a, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: space[2],
                        padding: '4px 8px', background: alpha(color.navy, 0.04),
                        borderRadius: radius.sm, fontSize: font.size.xs,
                      }}>
                        <span style={{ flex: 1, color: color.textDark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.filename}
                        </span>
                        <span style={{ color: color.textMid, fontFamily: font.family.mono }}>
                          {(a.size / 1024).toFixed(1)} KB
                        </span>
                        <button onClick={() => removeAttachment(i)} style={{
                          background: 'none', border: 'none', color: color.danger,
                          cursor: 'pointer', fontSize: font.size.sm, padding: '0 4px',
                        }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={handleSend} disabled={sending || sentOk} style={{
                padding: '10px 16px',
                background: sentOk ? color.success : (sending ? color.gray100 : color.gold || color.navy),
                color: color.white, border: 'none', borderRadius: radius.md,
                fontSize: font.size.sm, fontWeight: font.weight.semibold,
                cursor: sending || sentOk ? 'wait' : 'pointer',
                fontFamily: font.family.sans, alignSelf: 'flex-start',
              }}>
                {(() => {
                  const toCnt = allToRecipients().length;
                  const ccCnt = allCcRecipients().length;
                  if (sentOk) return '送信完了';
                  if (sending) return '送信中...';
                  const attLabel = attachments.length > 0 ? ` / 添付 ${attachments.length}件` : '';
                  return `メール送信 (To ${toCnt}件${ccCnt > 0 ? ` / CC ${ccCnt}件` : ''}${attLabel})`;
                })()}
              </button>
            </>
          )}

          {error && (
            <div style={{
              padding: space[2], background: alpha(color.danger, 0.08),
              border: `1px solid ${color.danger}`, borderRadius: radius.sm,
              fontSize: font.size.xs, color: color.danger,
            }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DrillDownDrawer({ drill, onClose, onCallItem }) {
  if (!drill) return null;
  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: alpha(color.navyDeep || color.navy, 0.4),
        zIndex: 9998,
      }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(560px, 90vw)', background: color.white,
        boxShadow: '-4px 0 16px rgba(0,0,0,0.15)', zIndex: 9999,
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: `${space[3]}px ${space[4]}px`, borderBottom: `1px solid ${color.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: color.navy, color: color.white,
        }}>
          <div>
            <div style={{ fontSize: font.size.sm, opacity: 0.8 }}>{drill.list?.list_name}</div>
            <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, marginTop: 2 }}>
              {drill.kindLabel}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: color.white, fontSize: 24,
            cursor: 'pointer', padding: 4,
          }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: space[3] }}>
          {drill.loading ? (
            <div style={{ fontSize: font.size.sm, color: color.textMid, padding: space[3] }}>読み込み中…</div>
          ) : drill.rows.length === 0 ? (
            <div style={{ fontSize: font.size.sm, color: color.textMid, padding: space[3] }}>該当先方がありません</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
              {drill.rows.map((r, i) => (
                <div key={`${r.item_id}_${i}`} style={{
                  padding: space[3], border: `1px solid ${color.border}`,
                  borderRadius: radius.md, background: color.white,
                  display: 'flex', alignItems: 'flex-start', gap: space[3],
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textDark, marginBottom: 4 }}>
                      {r.company || '—'}
                    </div>
                    {r.representative && (
                      <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: 2 }}>
                        担当: {r.representative}
                      </div>
                    )}
                    {r.phone && (
                      <div style={{ fontSize: font.size.xs, color: color.textMid, fontFamily: font.family.mono, marginBottom: 2 }}>
                        TEL: {r.phone}
                      </div>
                    )}
                    {r.detail && (
                      <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 4, lineHeight: 1.5 }}>
                        {r.detail}
                      </div>
                    )}
                  </div>
                  {r.item_id && onCallItem && (
                    <button onClick={() => onCallItem(drill.list.list_id, r.item_id, drill.rows)} style={{
                      padding: '6px 14px', background: color.navy, color: color.white,
                      border: 'none', borderRadius: radius.md, cursor: 'pointer',
                      fontSize: font.size.xs, fontWeight: font.weight.semibold,
                      fontFamily: font.family.sans, whiteSpace: 'nowrap',
                    }}>架電</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ========================================================================
// F. コスト・粗利・利益率
// ========================================================================
function SectionF({ stats, previousStats }) {
  const totalSales = stats.axis1.sales; // 軸②は売上発生しないので合算しても axis1.sales のみ
  const totalReward = stats.axis1.reward + stats.axis2.reward;
  const grossProfit = totalSales - totalReward;
  const profitRate = totalSales > 0 ? (grossProfit / totalSales) * 100 : null;

  const prevSales = previousStats?.axis1?.sales || 0;
  const prevReward = (previousStats?.axis1?.reward || 0) + (previousStats?.axis2?.reward || 0);
  const prevProfit = prevSales - prevReward;
  const salesDelta = prevSales > 0 ? ((totalSales - prevSales) / prevSales) * 100 : null;
  const rewardDelta = prevReward > 0 ? ((totalReward - prevReward) / prevReward) * 100 : null;
  const profitDelta = prevProfit > 0 ? ((grossProfit - prevProfit) / prevProfit) * 100 : null;

  const sign = (n) => n == null ? '' : (n >= 0 ? '+' : '') + Math.round(n) + '%';

  return (
    <Section title="月次採算" hint="当社売上 - インターン報酬 = 粗利">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: space[3] }}>
        <NumberCard
          label="当社売上"
          value={yen(totalSales)}
          sub={salesDelta != null ? `前月比 ${sign(salesDelta)}` : '前月比 —'}
        />
        <NumberCard
          label="インターン報酬"
          value={yen(totalReward)}
          sub={rewardDelta != null ? `前月比 ${sign(rewardDelta)}` : '前月比 —'}
        />
        <NumberCard
          label={`粗利 (利益率 ${profitRate != null ? Math.round(profitRate) : '—'}%)`}
          value={yen(grossProfit)}
          sub={profitDelta != null ? `前月比 ${sign(profitDelta)}` : '前月比 —'}
          valueColor={grossProfit < 0 ? color.danger : color.navy}
        />
      </div>
      <div style={{ marginTop: space[3], padding: space[2], fontSize: font.size.xs, color: color.textMid, background: color.gray50, borderRadius: radius.sm }}>
        翌月末払い予定: <b style={{ color: color.navy }}>{yen(totalReward)}</b> (キャッシュアウト予測)
      </div>
    </Section>
  );
}

// ========================================================================
// G. 集中リスク
// ========================================================================
function SectionG({ appoData, callListData, engagementMap, month, selfClient }) {
  const byClient = useMemo(() => {
    const map = new Map();
    appoData.forEach(a => {
      if (!a.getDate || !COUNTABLE_STATUSES.has(a.status)) return;
      if (a.getDate.slice(0, 7) !== month) return;
      const list = callListData.find(l => l._supaId === a.list_id);
      const engId = list?.engagement_id;
      const eng = engagementMap[engId];
      if (!eng || eng.type === 'client_acquisition') return; // 軸①のみ集計
      const cname = a.client || '不明';
      if (selfClient && cname === selfClient.company) return;
      const cur = map.get(cname) || { count: 0, sales: 0 };
      cur.count++;
      cur.sales += Number(a.sales || 0);
      map.set(cname, cur);
    });
    return Array.from(map.entries()).map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.sales - a.sales);
  }, [appoData, callListData, engagementMap, month, selfClient]);

  const totalSales = byClient.reduce((s, c) => s + c.sales, 0);
  const top3Sales = byClient.slice(0, 3).reduce((s, c) => s + c.sales, 0);
  const top3Pct = totalSales > 0 ? (top3Sales / totalSales) * 100 : 0;
  const top1 = byClient[0];
  const top1Pct = totalSales > 0 && top1 ? (top1.sales / totalSales) * 100 : 0;

  const riskLevel = top1Pct > 50 ? '高' : top1Pct > 30 ? '中' : '低';
  const riskColor = riskLevel === '高' ? color.danger : riskLevel === '中' ? color.warn : color.success;

  return (
    <Section title="集中リスク" hint="軸① 当月の当社売上ベース">
      {byClient.length === 0 ? (
        <div style={{ fontSize: font.size.sm, color: color.textMid, padding: space[3] }}>当月の売上データなし</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[2], marginBottom: space[3] }}>
            <NumberCard
              label="TOP1クライアント比率"
              value={Math.round(top1Pct) + '%'}
              sub={top1 ? `${top1.name} (${yen(top1.sales)})` : '—'}
              valueColor={riskColor}
            />
            <NumberCard
              label={`TOP3クライアント比率 (依存度: ${riskLevel})`}
              value={Math.round(top3Pct) + '%'}
              sub={`全${byClient.length}社中 上位3社で売上の${Math.round(top3Pct)}%`}
              valueColor={riskColor}
            />
          </div>
          {/* クライアント別バー */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
            {byClient.slice(0, 5).map((c, i) => {
              const pct = totalSales > 0 ? (c.sales / totalSales) * 100 : 0;
              return (
                <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.sm }}>
                  <div style={{ width: 180, color: color.textDark, fontWeight: font.weight.semibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {i + 1}. {c.name}
                  </div>
                  <div style={{ flex: 1, height: 14, background: color.gray100, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color.navy }} />
                  </div>
                  <div style={{ width: 60, textAlign: 'right', fontFamily: font.family.mono, color: color.textMid }}>
                    {Math.round(pct)}%
                  </div>
                  <div style={{ width: 110, textAlign: 'right', fontFamily: font.family.mono, color: color.textDark }}>
                    {yen(c.sales)}
                  </div>
                </div>
              );
            })}
          </div>
          {top1Pct > 40 && (
            <div style={{ marginTop: space[3], padding: space[2], fontSize: font.size.xs, color: color.danger, background: color.white, border: `1px solid ${color.border}`, borderLeft: `3px solid ${color.danger}`, borderRadius: radius.sm }}>
              <b>{top1?.name}</b> 1社で当月売上の{Math.round(top1Pct)}%を占めています。解約時の影響大。新規受託加速で分散推奨。
            </div>
          )}
        </>
      )}
    </Section>
  );
}

// ========================================================================
// E. クライアント別 健全性
// ========================================================================
function SectionE({ clientData, appoData, callListData, engagementMap, clientTargets, month, selfClient }) {
  const [tab, setTab] = useState('axis1');

  // 軸①: clients から自社を除外、各クライアントの月次目標 vs 当月実績
  const axis1Rows = useMemo(() => {
    return clientData
      .filter(c => c.company !== SELF_CLIENT_NAME)
      .map(c => {
        let actual = 0;
        appoData.forEach(a => {
          if (!a.getDate || !COUNTABLE_STATUSES.has(a.status)) return;
          if (a.getDate.slice(0, 7) !== month) return;
          if (a.client === c.company) {
            const list = callListData.find(l => l._supaId === a.list_id);
            const eng = engagementMap[list?.engagement_id];
            if (eng && eng.type !== 'client_acquisition') actual++;
          }
        });
        const target = clientTargets[c._supaId] || 0;
        const rate = target > 0 ? (actual / target) * 100 : null;
        const lastContact = c.nextContactAt || c.statusChangedAt;
        const daysSince = lastContact ? Math.floor((Date.now() - new Date(lastContact).getTime()) / (1000 * 60 * 60 * 24)) : null;
        return {
          id: c._supaId, name: c.company, status: c.status,
          contactPerson: c.contactPerson || c.contact_person || '',
          target, actual, rate,
          daysSince,
          needsAttention: (target > 0 && rate < 50) || (daysSince != null && daysSince > 30),
        };
      })
      .filter(r => ['支援中', '準備中', '面談予定'].includes(r.status))
      .sort((a, b) => {
        if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
        return (b.target || 0) - (a.target || 0);
      });
  }, [clientData, appoData, callListData, engagementMap, clientTargets, month]);

  // 軸②: 開拓中の見込客 (面談予定/準備中)
  const axis2Rows = useMemo(() => {
    return clientData
      .filter(c => c.company !== SELF_CLIENT_NAME)
      .filter(c => ['面談予定', '準備中'].includes(c.status))
      .map(c => ({
        id: c._supaId,
        name: c.company,
        industry: c.industry || '—',
        status: c.status,
        contactPerson: c.contactPerson || c.contact_person || '',
        nextContactAt: c.nextContactAt,
      }))
      .sort((a, b) => (a.nextContactAt || '9999').localeCompare(b.nextContactAt || '9999'));
  }, [clientData]);

  const tabStyle = (active) => ({
    padding: `${space[1]}px ${space[3]}px`,
    background: active ? color.navy : color.white,
    color: active ? color.white : color.textMid,
    border: `1px solid ${color.border}`,
    borderBottom: active ? `1px solid ${color.navy}` : `1px solid ${color.border}`,
    cursor: 'pointer',
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    fontFamily: font.family.sans,
    borderRadius: `${radius.sm}px ${radius.sm}px 0 0`,
  });

  return (
    <Section title="クライアント別 健全性">
      <div style={{ display: 'flex', gap: 2, marginBottom: space[2] }}>
        <button onClick={() => setTab('axis1')} style={tabStyle(tab === 'axis1')}>軸① 既存クライアント ({axis1Rows.length})</button>
        <button onClick={() => setTab('axis2')} style={tabStyle(tab === 'axis2')}>軸② 開拓中 ({axis2Rows.length})</button>
      </div>

      {tab === 'axis1' && (
        axis1Rows.length === 0 ? (
          <div style={{ fontSize: font.size.sm, color: color.textMid, padding: space[3] }}>該当クライアントなし</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: color.navy, color: color.white }}>
                <th style={{ padding: '6px 8px', fontSize: font.size.xs, textAlign: 'left', fontWeight: font.weight.semibold }}>クライアント</th>
                <th style={{ padding: '6px 8px', fontSize: font.size.xs, textAlign: 'left', fontWeight: font.weight.semibold }}>先方担当</th>
                <th style={{ padding: '6px 8px', fontSize: font.size.xs, textAlign: 'right', fontWeight: font.weight.semibold }}>目標</th>
                <th style={{ padding: '6px 8px', fontSize: font.size.xs, textAlign: 'right', fontWeight: font.weight.semibold }}>実績</th>
                <th style={{ padding: '6px 8px', fontSize: font.size.xs, textAlign: 'right', fontWeight: font.weight.semibold }}>達成率</th>
                <th style={{ padding: '6px 8px', fontSize: font.size.xs, textAlign: 'right', fontWeight: font.weight.semibold }}>最終接点</th>
              </tr>
            </thead>
            <tbody>
              {axis1Rows.map(r => (
                <tr key={r.id} style={{ borderTop: `1px solid ${color.border}`, background: r.needsAttention ? alpha(color.danger, 0.04) : 'transparent' }}>
                  <td style={{ padding: '6px 8px', fontSize: font.size.sm, color: color.textDark, fontWeight: r.needsAttention ? font.weight.semibold : font.weight.normal, borderLeft: r.needsAttention ? `3px solid ${color.danger}` : '3px solid transparent' }}>
                    {r.name}
                  </td>
                  <td style={{ padding: '6px 8px', fontSize: font.size.sm, color: color.textMid }}>{r.contactPerson || '—'}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontSize: font.size.sm, fontFamily: font.family.mono, color: color.textMid }}>
                    {r.target > 0 ? `${r.target}件` : '—'}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontSize: font.size.sm, fontFamily: font.family.mono, color: color.textDark }}>
                    {r.actual}件
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontSize: font.size.sm, fontFamily: font.family.mono, color: r.rate != null && r.rate < 50 ? color.danger : color.textDark }}>
                    {r.rate != null ? Math.round(r.rate) + '%' : '—'}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontSize: font.size.sm, color: r.daysSince != null && r.daysSince > 30 ? color.danger : color.textMid }}>
                    {r.daysSince != null ? `${r.daysSince}日前` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {tab === 'axis2' && (
        axis2Rows.length === 0 ? (
          <div style={{ fontSize: font.size.sm, color: color.textMid, padding: space[3] }}>開拓中の見込客なし</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: color.navy, color: color.white }}>
                <th style={{ padding: '6px 8px', fontSize: font.size.xs, textAlign: 'left', fontWeight: font.weight.semibold }}>クライアント</th>
                <th style={{ padding: '6px 8px', fontSize: font.size.xs, textAlign: 'left', fontWeight: font.weight.semibold }}>商材</th>
                <th style={{ padding: '6px 8px', fontSize: font.size.xs, textAlign: 'left', fontWeight: font.weight.semibold }}>先方担当</th>
                <th style={{ padding: '6px 8px', fontSize: font.size.xs, textAlign: 'left', fontWeight: font.weight.semibold }}>ステータス</th>
                <th style={{ padding: '6px 8px', fontSize: font.size.xs, textAlign: 'right', fontWeight: font.weight.semibold }}>次回接点</th>
              </tr>
            </thead>
            <tbody>
              {axis2Rows.map(r => (
                <tr key={r.id} style={{ borderTop: `1px solid ${color.border}` }}>
                  <td style={{ padding: '6px 8px', fontSize: font.size.sm, color: color.textDark, fontWeight: font.weight.semibold }}>{r.name}</td>
                  <td style={{ padding: '6px 8px', fontSize: font.size.sm, color: color.textMid }}>{r.industry}</td>
                  <td style={{ padding: '6px 8px', fontSize: font.size.sm, color: color.textMid }}>{r.contactPerson || '—'}</td>
                  <td style={{ padding: '6px 8px', fontSize: font.size.sm, color: color.textMid }}>{r.status}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontSize: font.size.sm, fontFamily: font.family.mono, color: color.textMid }}>
                    {r.nextContactAt ? new Date(r.nextContactAt).toISOString().slice(5, 10).replace('-', '/') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </Section>
  );
}
