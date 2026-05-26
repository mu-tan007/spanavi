import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { color, space, radius, font, alpha } from '../../constants/design';
import { Card } from '../ui';
import PageHeader from '../common/PageHeader';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import {
  fetchClientMonthlyTargets,
  fetchEngagementMonthlyTargets, upsertEngagementMonthlyTarget,
} from '../../lib/supabaseWrite';

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

export default function BusinessOverviewView({ appoData = [], callListData = [], clientData = [] }) {
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

  // 当月集計 (軸①/軸② 別 + 商材×タイプ別)
  const stats = useMemo(() => {
    let a1c = 0, a1s = 0, a1r = 0, a2c = 0, a2r = 0;
    // matrix[categoryName][type] = count
    const a1Matrix = {};
    const a2Matrix = {}; // a2Matrix[categoryName] = count
    appoData.forEach(a => {
      if (!a.getDate || !COUNTABLE_STATUSES.has(a.status)) return;
      if (a.getDate.slice(0, 7) !== month) return;
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
  }, [appoData, callListData, engagementMap, month]);

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
        level: '高', icon: '⚠', title: '軸①目標未達見込み',
        desc: `現在のペースで${fmtNum(axis1Pace)}件着地予測 (目標${fmtNum(axis1TargetTotal)}件、達成率${fmtPct(axis1PaceRate)})。リスト追加打診 + 見込み先プール再アプローチを推奨。`,
      });
    } else if (axis1TargetTotal > 0 && axis1PaceRate != null && axis1PaceRate < 100) {
      recs.push({ level: '中', icon: '🟡', title: '軸①目標 ぎりぎり達成見込み', desc: '見込み先プールへの再アプローチを強化推奨。' });
    }
    if (axis2TargetTotal > 0 && axis2AchieveRate != null && axis2AchieveRate < 70) {
      recs.push({
        level: '高', icon: '⚠', title: '軸②クライアント開拓 進捗遅れ',
        desc: `当月${fmtNum(stats.axis2.count)}件 (目標${fmtNum(axis2TargetTotal)}件、達成率${fmtPct(axis2AchieveRate)})。新規開拓加速を推奨。`,
      });
    }
    if (recs.length === 0 && (axis1TargetTotal > 0 || axis2TargetTotal > 0)) {
      recs.push({ level: '低', icon: '✅', title: '順調', desc: '目標達成ペースで進行中。' });
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
        title="経営俯瞰"
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

        {/* B. 目標と乖離 → 推奨アクション */}
        <Section title="目標と乖離 → 推奨アクション" hint={`残営業日 ${daysRemaining}日 / 経過 ${daysPassed}日`}>
          {axis1TargetTotal === 0 && axis2TargetTotal === 0 ? (
            <div style={{ fontSize: font.size.sm, color: color.textMid, padding: space[3] }}>
              目標が未設定です。<br />
              軸① の月次目標は CRM 顧客一覧 → 月別目標タブから各クライアント別に設定してください。<br />
              軸② の月次目標は上の「商材別 目標 (件)」欄から入力してください。
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[2] }}>
                {axis1TargetTotal > 0 && (
                  <div style={{ padding: space[2], background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md }}>
                    <div style={{ fontSize: font.size.xs, color: color.textLight }}>軸①ペース予測</div>
                    <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: axis1PaceRate < 90 ? color.danger : color.navy, fontFamily: font.family.mono }}>
                      {fmtNum(axis1Pace)}件 ({fmtPct(axis1PaceRate)})
                    </div>
                    <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: 2 }}>
                      目標 {fmtNum(axis1TargetTotal)}件、{axis1Pace >= axis1TargetTotal ? '達成見込' : `▲${fmtNum(axis1TargetTotal - axis1Pace)}件 未達見込`}
                    </div>
                  </div>
                )}
                {axis2TargetTotal > 0 && (
                  <div style={{ padding: space[2], background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md }}>
                    <div style={{ fontSize: font.size.xs, color: color.textLight }}>軸②達成状況</div>
                    <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: axis2AchieveRate < 70 ? color.danger : color.navy, fontFamily: font.family.mono }}>
                      {fmtNum(stats.axis2.count)} / {fmtNum(axis2TargetTotal)}件 ({fmtPct(axis2AchieveRate)})
                    </div>
                  </div>
                )}
              </div>
              {recommendations.map((rec, i) => {
                const accentColor = rec.level === '高' ? color.danger : rec.level === '中' ? color.warn : color.success;
                return (
                  <div key={i} style={{
                    padding: space[3],
                    background: color.white,
                    border: `1px solid ${color.border}`,
                    borderLeft: `3px solid ${accentColor}`,
                    borderRadius: radius.md, display: 'flex', alignItems: 'flex-start', gap: space[2],
                  }}>
                    <div>
                      <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: accentColor, marginBottom: 2 }}>
                        {rec.title}
                      </div>
                      <div style={{ fontSize: font.size.xs, color: color.textDark, lineHeight: 1.6 }}>
                        {rec.desc}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Phase β/γ/δ プレースホルダ */}
        <Section title="他セクション (Phase β/γ/δ で実装予定)" hint="コスト・集中リスク・リスト運用・見込み先プール・クライアント別健全性・アポインター稼働">
          <div style={{ fontSize: font.size.sm, color: color.textMid, padding: space[3] }}>
            ・F. コスト・粗利・利益率<br />
            ・G. 集中リスク (1社依存度)<br />
            ・C. リスト運用と改善<br />
            ・D. 見込み先プール<br />
            ・E. クライアント別健全性<br />
            ・H. アポインター稼働<br />
          </div>
        </Section>

      </div>
    </div>
  );
}
