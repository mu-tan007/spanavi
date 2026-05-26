import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { color, space, radius, font, alpha } from '../../constants/design';
import { Card, Button, Input } from '../ui';
import PageHeader from '../common/PageHeader';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import {
  fetchClientMonthlyTargets, upsertClientMonthlyTarget,
} from '../../lib/supabaseWrite';

const COUNTABLE_STATUSES = new Set(['面談済', '事前確認済', 'アポ取得']);
const SELF_CLIENT_NAME = 'M&Aソーシングパートナーズ株式会社';

const yen = (n) => '¥' + Number(n || 0).toLocaleString();
const fmtNum = (n) => Number(n || 0).toLocaleString();
const fmtPct = (n) => n == null || isNaN(n) ? '—' : Math.round(n) + '%';

function getCurrentMonth() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
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
  const today = new Date();
  const todayJst = new Date(today.getTime() + 9 * 60 * 60 * 1000);
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
  const today = new Date();
  const todayJst = new Date(today.getTime() + 9 * 60 * 60 * 1000);
  const isThisMonth = todayJst.getUTCFullYear() === y && todayJst.getUTCMonth() === m - 1;
  const cursor = new Date(Date.UTC(y, m - 1, 1));
  const endDay = isThisMonth ? todayJst.getUTCDate() : new Date(Date.UTC(y, m, 0)).getUTCDate();
  let count = 0;
  while (cursor.getUTCDate() <= endDay && cursor.getUTCMonth() === m - 1) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

// セクションラッパー (見出し + Card)
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

// 数値カード (大数字)
function NumberCard({ label, value, sub, valueColor = color.navy }) {
  return (
    <div style={{
      padding: `${space[3]}px ${space[4]}px`,
      background: color.cream,
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

export default function BusinessOverviewView({ appoData = [], callListData = [], clientData = [] }) {
  const [month, setMonth] = useState(getCurrentMonth());
  const [engagementTypeMap, setEngagementTypeMap] = useState({});
  const [targets, setTargets] = useState({}); // { clientId: target_count }
  const [savingTargetId, setSavingTargetId] = useState(null);

  // engagement.id → type マップ
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('engagements')
        .select('id, type')
        .eq('org_id', getOrgId());
      if (cancelled) return;
      const map = {};
      (data || []).forEach(e => { map[e.id] = e.type; });
      setEngagementTypeMap(map);
    })();
    return () => { cancelled = true; };
  }, []);

  // 月次目標を取得
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await fetchClientMonthlyTargets(month, month);
      if (cancelled) return;
      const map = {};
      (data || []).forEach(t => { map[t.client_id] = t.target_count; });
      setTargets(map);
    })();
    return () => { cancelled = true; };
  }, [month]);

  // 自社 client_id を特定
  const selfClient = useMemo(
    () => clientData.find(c => c.company === SELF_CLIENT_NAME),
    [clientData]
  );

  // 当月集計 (軸①/軸② 分離)
  const stats = useMemo(() => {
    let a1c = 0, a1s = 0, a1r = 0, a2c = 0, a2r = 0;
    appoData.forEach(a => {
      if (!a.getDate || !COUNTABLE_STATUSES.has(a.status)) return;
      if (a.getDate.slice(0, 7) !== month) return;
      const list = callListData.find(l => l._supaId === a.list_id);
      const engId = list?.engagement_id;
      const engType = engagementTypeMap[engId];
      const isAxis2 = engType === 'client_acquisition';
      const sales = Number(a.sales || 0);
      const reward = Number(a.reward || 0);
      if (isAxis2) { a2c++; a2r += reward; }
      else { a1c++; a1s += sales; a1r += reward; }
    });
    return { axis1: { count: a1c, sales: a1s, reward: a1r }, axis2: { count: a2c, reward: a2r } };
  }, [appoData, callListData, engagementTypeMap, month]);

  // 軸①目標合計 (自社以外の client の月次目標合計)
  const axis1TargetTotal = useMemo(() => {
    return Object.entries(targets).reduce((sum, [cid, val]) => {
      if (cid === selfClient?._supaId) return sum;
      return sum + Number(val || 0);
    }, 0);
  }, [targets, selfClient]);

  // 軸②目標 (自社 client の月次目標)
  const axis2Target = selfClient ? Number(targets[selfClient._supaId] || 0) : 0;

  // ペース予測 (営業日ベース)
  const daysPassed = businessDaysPassed(month);
  const daysRemaining = businessDaysRemaining(month);
  const totalDays = daysPassed + daysRemaining;
  const axis1Pace = daysPassed > 0 ? Math.round(stats.axis1.count / daysPassed * totalDays) : 0;
  const axis1AchieveRate = axis1TargetTotal > 0 ? (stats.axis1.count / axis1TargetTotal) * 100 : null;
  const axis1PaceRate = axis1TargetTotal > 0 ? (axis1Pace / axis1TargetTotal) * 100 : null;
  const axis2AchieveRate = axis2Target > 0 ? (stats.axis2.count / axis2Target) * 100 : null;

  // 推奨アクション (ルールベース)
  const recommendations = useMemo(() => {
    const recs = [];
    if (axis1TargetTotal > 0 && axis1PaceRate != null && axis1PaceRate < 90) {
      recs.push({
        level: '高',
        icon: '⚠',
        title: '軸①目標未達見込み',
        desc: `現在のペースで${fmtNum(axis1Pace)}件着地予測 (目標${fmtNum(axis1TargetTotal)}件、達成率${fmtPct(axis1PaceRate)})。リスト追加打診 + 見込み先プール再アプローチを推奨。`,
      });
    } else if (axis1TargetTotal > 0 && axis1PaceRate != null && axis1PaceRate < 100) {
      recs.push({
        level: '中',
        icon: '🟡',
        title: '軸①目標 ぎりぎり達成見込み',
        desc: `見込み先プールへの再アプローチを強化推奨。`,
      });
    }
    if (axis2Target > 0 && axis2AchieveRate != null && axis2AchieveRate < 70) {
      recs.push({
        level: '高',
        icon: '⚠',
        title: '軸②クライアント開拓 進捗遅れ',
        desc: `当月${fmtNum(stats.axis2.count)}件 (目標${fmtNum(axis2Target)}件、達成率${fmtPct(axis2AchieveRate)})。新規開拓加速を推奨。`,
      });
    }
    if (recs.length === 0 && (axis1TargetTotal > 0 || axis2Target > 0)) {
      recs.push({
        level: '低',
        icon: '✅',
        title: '順調',
        desc: '目標達成ペースで進行中。',
      });
    }
    return recs;
  }, [axis1TargetTotal, axis1Pace, axis1PaceRate, axis2Target, axis2AchieveRate, stats]);

  // 軸②目標 upsert
  const saveAxis2Target = useCallback(async (val) => {
    if (!selfClient?._supaId) return;
    setSavingTargetId('axis2');
    await upsertClientMonthlyTarget(selfClient._supaId, month, val);
    setTargets(prev => ({ ...prev, [selfClient._supaId]: val }));
    setSavingTargetId(null);
  }, [selfClient, month]);

  return (
    <div style={{ padding: '0 28px 28px' }}>
      <PageHeader
        title="経営俯瞰"
        description="全社の数字と目標達成状況を一目で把握"
        right={
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{
              padding: `${space[1]}px ${space[2]}px`, borderRadius: radius.md,
              border: `1px solid ${color.border}`, fontSize: font.size.sm,
              background: color.white, color: color.textDark, outline: 'none',
              fontFamily: font.family.sans,
            }}
          >
            {monthList(getCurrentMonth(), 6).map(m => (
              <option key={m} value={m}>{m.replace('-', '年') + '月'}</option>
            ))}
          </select>
        }
      />

      <div style={{ marginTop: space[4], display: 'flex', flexDirection: 'column', gap: space[4] }}>

        {/* A. 今月の数字サマリー */}
        <Section title="今月の数字" hint="軸① 案件実行 / 軸② クライアント開拓">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[3] }}>
            {/* 軸① */}
            <div style={{
              padding: space[3],
              background: alpha(color.navyLight, 0.06),
              borderRadius: radius.md,
              border: `1px solid ${color.border}`,
            }}>
              <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy, marginBottom: space[2] }}>
                ① 案件実行
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[2] }}>
                <NumberCard label="アポ取得" value={`${fmtNum(stats.axis1.count)}件`} />
                <NumberCard label="当社売上" value={yen(stats.axis1.sales)} />
                <NumberCard label="インターン報酬" value={yen(stats.axis1.reward)} />
                <NumberCard
                  label="目標対比"
                  value={axis1AchieveRate != null ? fmtPct(axis1AchieveRate) : '—'}
                  sub={axis1TargetTotal > 0 ? `${fmtNum(stats.axis1.count)} / ${fmtNum(axis1TargetTotal)}件` : '目標未設定'}
                  valueColor={axis1AchieveRate != null && axis1AchieveRate < 90 ? color.danger : color.navy}
                />
              </div>
            </div>

            {/* 軸② */}
            <div style={{
              padding: space[3],
              background: alpha(color.gold, 0.06),
              borderRadius: radius.md,
              border: `1px solid ${color.border}`,
            }}>
              <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy, marginBottom: space[2] }}>
                ② クライアント開拓
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[2] }}>
                <NumberCard label="アポ取得" value={`${fmtNum(stats.axis2.count)}件`} />
                <NumberCard label="インターン報酬" value={yen(stats.axis2.reward)} />
                <NumberCard
                  label="目標対比"
                  value={axis2AchieveRate != null ? fmtPct(axis2AchieveRate) : '—'}
                  sub={axis2Target > 0 ? `${fmtNum(stats.axis2.count)} / ${fmtNum(axis2Target)}件` : '目標未設定'}
                  valueColor={axis2AchieveRate != null && axis2AchieveRate < 70 ? color.danger : color.navy}
                />
                {/* 軸②目標入力欄 */}
                <div style={{
                  padding: `${space[2]}px ${space[3]}px`,
                  background: color.white,
                  borderRadius: radius.md,
                  border: `1px dashed ${color.border}`,
                  display: 'flex', flexDirection: 'column', gap: space[1],
                }}>
                  <div style={{ fontSize: font.size.xs - 1, color: color.textLight, fontWeight: font.weight.semibold }}>
                    軸②月次目標 (件)
                  </div>
                  <input
                    type="number"
                    min="0"
                    defaultValue={axis2Target || ''}
                    onBlur={(e) => {
                      const v = Number(e.target.value) || 0;
                      if (v !== axis2Target) saveAxis2Target(v);
                    }}
                    placeholder="未設定"
                    style={{
                      width: '100%', padding: '4px 8px', borderRadius: radius.sm,
                      border: `1px solid ${color.border}`, fontSize: font.size.sm,
                      fontFamily: font.family.mono, outline: 'none', background: color.white,
                    }}
                  />
                  {savingTargetId === 'axis2' && (
                    <span style={{ fontSize: 10, color: color.textLight }}>保存中…</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* B. 目標と乖離 → 推奨アクション */}
        <Section title="目標と乖離 → 推奨アクション" hint={`残営業日 ${daysRemaining}日 / 経過 ${daysPassed}日`}>
          {axis1TargetTotal === 0 && axis2Target === 0 ? (
            <div style={{ fontSize: font.size.sm, color: color.textMid, padding: space[3] }}>
              目標が未設定です。
              <br />
              軸① の月次目標は CRM 顧客一覧 → 月別目標タブから各クライアント別に設定してください。
              <br />
              軸② の月次目標は上の「軸②月次目標」欄から入力してください。
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
              {/* ペース予測サマリー */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[2] }}>
                {axis1TargetTotal > 0 && (
                  <div style={{ padding: space[2], background: color.cream, borderRadius: radius.md }}>
                    <div style={{ fontSize: font.size.xs, color: color.textLight }}>軸①ペース予測</div>
                    <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: axis1PaceRate < 90 ? color.danger : color.navy, fontFamily: font.family.mono }}>
                      {fmtNum(axis1Pace)}件 ({fmtPct(axis1PaceRate)})
                    </div>
                    <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: 2 }}>
                      目標 {fmtNum(axis1TargetTotal)}件、{axis1Pace >= axis1TargetTotal ? '達成見込' : `▲${fmtNum(axis1TargetTotal - axis1Pace)}件 未達見込`}
                    </div>
                  </div>
                )}
                {axis2Target > 0 && (
                  <div style={{ padding: space[2], background: color.cream, borderRadius: radius.md }}>
                    <div style={{ fontSize: font.size.xs, color: color.textLight }}>軸②達成状況</div>
                    <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: axis2AchieveRate < 70 ? color.danger : color.navy, fontFamily: font.family.mono }}>
                      {fmtNum(stats.axis2.count)} / {fmtNum(axis2Target)}件 ({fmtPct(axis2AchieveRate)})
                    </div>
                  </div>
                )}
              </div>

              {/* 推奨アクション一覧 */}
              {recommendations.map((rec, i) => (
                <div key={i} style={{
                  padding: space[3],
                  background: rec.level === '高' ? alpha(color.danger, 0.06)
                    : rec.level === '中' ? alpha(color.warn, 0.06)
                    : alpha(color.success, 0.06),
                  border: `1px solid ${rec.level === '高' ? alpha(color.danger, 0.3) : alpha(color.border, 1)}`,
                  borderRadius: radius.md,
                  display: 'flex', alignItems: 'flex-start', gap: space[2],
                }}>
                  <span style={{ fontSize: font.size.lg }}>{rec.icon}</span>
                  <div>
                    <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy, marginBottom: 2 }}>
                      {rec.title}
                    </div>
                    <div style={{ fontSize: font.size.xs, color: color.textDark, lineHeight: 1.6 }}>
                      {rec.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* 他セクション (F/G/C/D/E/H) は Phase β/γ/δ で実装予定のプレースホルダ */}
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
