import { useEffect, useMemo, useState } from 'react';
import { color, space, radius, font, alpha } from '../../constants/design';
import { Button, Card, Badge, DataTable } from '../ui';
import { calcRankAndRate } from '../../utils/calculations';
import { fetchOrgSettings } from '../../lib/supabaseWrite';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import PageHeader from '../common/PageHeader';
import PayrollInvoiceUploader from './PayrollInvoiceUploader';

const PAYROLL_COUNTABLE = new Set(['アポ取得', '事前確認済', '面談済']);
const MONO = "'JetBrains Mono'";

const fmtYen = (v) => (v > 0 ? '¥' + Math.round(v).toLocaleString() : '-');
const fmtYenZero = (v) => '¥' + Math.round(v || 0).toLocaleString();

function buildPayrollMonths() {
  const now = new Date();
  const out = [];
  let y = 2026, m = 3;
  const endD = new Date(now.getFullYear(), now.getMonth() + 3, 0);
  while (new Date(y, m - 1, 1) <= endD) {
    out.push({ label: m + '月', year: y, month: m });
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

// メンバー単位の月別給与詳細ページ。
// canEdit=true なら請求書アップロード可（自分自身を閲覧している時）。
// targetMember は { _supaId, id, name, team, role, totalSales, operationStartDate, referrerName, referralPaidPayMonth, ... }
export default function PayrollSelfDetailView({ targetMember, members, appoData, canEdit = true, memberRoleMap: memberRoleMapProp = null, embedded = false, onBack = null }) {
  const payrollMonths = useMemo(() => buildPayrollMonths(), []);
  const [monthTab, setMonthTab] = useState(() => payrollMonths[payrollMonths.length - 1]?.label || '3月');
  const [orgSettings, setOrgSettings] = useState({});
  const [internalRoleMap, setInternalRoleMap] = useState({});

  useEffect(() => {
    fetchOrgSettings().then(({ data }) => setOrgSettings(data || {}));
  }, []);

  // 親から渡されない場合は自前で member_engagements から取得
  useEffect(() => {
    if (memberRoleMapProp) return;
    (async () => {
      const orgId = getOrgId();
      if (!orgId) return;
      const { data: eng } = await supabase
        .from('engagements')
        .select('id')
        .eq('org_id', orgId)
        .eq('slug', 'seller_sourcing')
        .maybeSingle();
      if (!eng) return;
      const { data: meRows } = await supabase
        .from('member_engagements')
        .select('member_id, role:engagement_roles(name)')
        .eq('engagement_id', eng.id)
        .eq('org_id', orgId)
        .not('role_id', 'is', null);
      const map = {};
      (meRows || []).forEach(r => { if (r.role?.name) map[r.member_id] = r.role.name; });
      setInternalRoleMap(map);
    })();
  }, [memberRoleMapProp]);

  const memberRoleMap = memberRoleMapProp || internalRoleMap;

  const selectedMonth = useMemo(
    () => payrollMonths.find(x => x.label === monthTab) || payrollMonths[0],
    [payrollMonths, monthTab]
  );
  const payMonth = useMemo(
    () => `${selectedMonth.year}-${String(selectedMonth.month).padStart(2, '0')}`,
    [selectedMonth]
  );

  const memberRole = (targetMember?.id && memberRoleMap[targetMember.id]) || '';

  // 当月の自分のアポ
  const myAppos = useMemo(() => {
    if (!targetMember) return [];
    return (appoData || []).filter(a => {
      const dateKey = (a.meetDate || a.getDate || '').slice(0, 7);
      return a.getter === targetMember.name && dateKey === payMonth && PAYROLL_COUNTABLE.has(a.status);
    });
  }, [appoData, targetMember, payMonth]);

  // インセンティブ計算
  const incentive = useMemo(
    () => myAppos.reduce((s, a) => s + (a.reward || 0), 0),
    [myAppos]
  );
  const monthlySales = useMemo(
    () => myAppos.reduce((s, a) => s + (a.sales || 0), 0),
    [myAppos]
  );

  // ランクと率（参考表示）
  const rankInfo = useMemo(
    () => calcRankAndRate(targetMember?.totalSales || 0, orgSettings),
    [targetMember, orgSettings]
  );

  // 役職ボーナス計算
  const roleBonusInfo = useMemo(() => {
    if (!['リーダー', '副リーダー'].includes(memberRole)) {
      return { bonus: 0, teamSales: 0, rate: 0, members: 0, formula: '対象外' };
    }
    const team = targetMember?.team || '';
    // 同じチームの全メンバーの当月売上を集計
    const monthAppos = (appoData || []).filter(a => {
      const dateKey = (a.meetDate || a.getDate || '').slice(0, 7);
      return dateKey === payMonth && PAYROLL_COUNTABLE.has(a.status);
    });
    const teamMembers = (members || []).filter(m => typeof m === 'object' && m.team === team);
    const teamMemberNames = new Set(teamMembers.map(m => m.name));
    const teamSales = monthAppos
      .filter(a => teamMemberNames.has(a.getter))
      .reduce((s, a) => s + (a.sales || 0), 0);

    // 同じチームのリーダー / 副リーダー人数（role_map から）
    const sameRoleCount = teamMembers.filter(m => memberRoleMap[m.id] === memberRole).length || 1;

    let rate = 0;
    let label = '';
    if (memberRole === 'リーダー') {
      // 段階料率
      let tiers = [
        { threshold: 0, rate: 0.5 }, { threshold: 1000000, rate: 1.0 }, { threshold: 2000000, rate: 1.5 },
        { threshold: 3000000, rate: 2.0 }, { threshold: 4000000, rate: 2.5 }, { threshold: 5000000, rate: 3.0 },
        { threshold: 6000000, rate: 3.5 }, { threshold: 7000000, rate: 4.0 }, { threshold: 8000000, rate: 4.5 },
        { threshold: 9000000, rate: 5.0 }, { threshold: 10000000, rate: 5.5 },
      ];
      if (orgSettings.leader_bonus_tiers) {
        try {
          const parsed = JSON.parse(orgSettings.leader_bonus_tiers);
          if (Array.isArray(parsed) && parsed.length > 0) tiers = parsed;
        } catch { /* use defaults */ }
      }
      const sorted = [...tiers].sort((a, b) => b.threshold - a.threshold);
      const tier = sorted.find(t => teamSales >= t.threshold);
      rate = tier ? tier.rate : 0;
      label = `リーダー段階料率（チーム売上 ${fmtYenZero(teamSales)} → ${rate}%）`;
    } else {
      rate = parseFloat(orgSettings.subleader_bonus_rate) || 1.2;
      label = `副リーダー料率（${rate}%）`;
    }
    const pool = Math.round(teamSales * rate / 100);
    const bonus = Math.round(pool / sameRoleCount);
    return {
      bonus, teamSales, rate, members: sameRoleCount, role: memberRole, label,
      formula: `${fmtYenZero(teamSales)} × ${rate}% ÷ ${sameRoleCount}名 = ${fmtYen(bonus)}`,
    };
  }, [memberRole, members, appoData, payMonth, orgSettings, targetMember, memberRoleMap]);

  // 紹介料（自分が紹介者の被紹介者で当月条件を満たすもの）
  const referrals = useMemo(() => {
    if (!targetMember?.name) return [];
    const monthStart = new Date(selectedMonth.year, selectedMonth.month - 1, 1);
    const monthEnd = new Date(selectedMonth.year, selectedMonth.month, 0);
    const out = [];
    (members || []).forEach(m => {
      if (typeof m !== 'object' || !m.referrerName || m.referrerName !== targetMember.name) return;
      if (!m.operationStartDate) return;
      if (m.referralPaidPayMonth && m.referralPaidPayMonth !== payMonth) return;
      const opDate = new Date(m.operationStartDate);
      const deadline = new Date(opDate);
      deadline.setDate(deadline.getDate() + 30);
      const salesWithin30 = (appoData || [])
        .filter(a =>
          a.getter === m.name &&
          PAYROLL_COUNTABLE.has(a.status) &&
          a.appointmentDate &&
          new Date(a.appointmentDate) >= opDate &&
          new Date(a.appointmentDate) <= deadline
        )
        .reduce((s, a) => s + (a.sales || 0), 0);
      if (salesWithin30 >= 100000 && opDate <= monthEnd && deadline >= monthStart) {
        out.push({
          name: m.name,
          operationStartDate: m.operationStartDate,
          deadline: deadline.toISOString().slice(0, 10),
          salesWithin30,
          amount: 50000,
        });
      }
    });
    return out;
  }, [targetMember, members, appoData, payMonth, selectedMonth]);

  const referralTotal = referrals.reduce((s, r) => s + r.amount, 0);
  const totalPayout = incentive + roleBonusInfo.bonus + referralTotal;

  if (!targetMember) {
    return <div style={{ padding: space[5], color: color.textLight }}>メンバー情報が取得できません</div>;
  }

  const memberRate = rankInfo.rate ? (rankInfo.rate * 100).toFixed(0) + '%' : '-';

  const apptColumns = [
    { key: 'date', label: '面談日', width: 110, align: 'right', cellStyle: { fontFamily: MONO },
      render: (a) => a.meetDate || a.getDate || '-' },
    { key: 'client', label: 'クライアント', width: 180, align: 'left', render: (a) => a.client || '-' },
    { key: 'company', label: '企業名', width: 220, align: 'left', render: (a) => a.company || '-' },
    { key: 'status', label: 'ステータス', width: 110, align: 'center',
      render: (a) => <Badge variant={a.status === '面談済' ? 'success' : 'primary'} dot>{a.status}</Badge> },
    { key: 'sales', label: '売上', width: 110, align: 'right',
      cellStyle: { fontFamily: MONO, fontVariantNumeric: 'tabular-nums' },
      render: (a) => fmtYen(a.sales) },
    { key: 'reward', label: 'インターン報酬', width: 130, align: 'right',
      cellStyle: { fontFamily: MONO, fontVariantNumeric: 'tabular-nums', color: color.success, fontWeight: font.weight.semibold },
      render: (a) => fmtYen(a.reward) },
  ];

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      {!embedded && (
        <PageHeader
          eyebrow="Sourcing · 給与"
          title="自分の給与"
          description={`${targetMember.name} ・ ${payMonth} 分の支給内訳`}
          style={{ marginBottom: space[5] }}
        />
      )}
      {embedded && onBack && (
        <div style={{ marginBottom: space[3] }}>
          <Button variant="outline" size="sm" onClick={onBack}>← 一覧に戻る</Button>
          <span style={{ marginLeft: space[3], fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy }}>
            {targetMember.name} の {payMonth} 分支給内訳
          </span>
        </div>
      )}

      {/* 月切替 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: space[4], flexWrap: 'wrap' }}>
        {payrollMonths.map(({ label }) => (
          <button key={label} onClick={() => setMonthTab(label)} style={{
            padding: '5px 14px', borderRadius: radius.md, fontSize: font.size.xs, fontWeight: font.weight.semibold,
            cursor: 'pointer', fontFamily: font.family.sans,
            background: monthTab === label ? color.navy : color.white,
            color: monthTab === label ? color.white : color.textMid,
            border: `1px solid ${monthTab === label ? color.navy : color.border}`,
          }}>{label}</button>
        ))}
      </div>

      {/* サマリーカード */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: space[5] }}>
        {[
          { label: '①インセンティブ', value: fmtYen(incentive), tone: color.success },
          { label: '②役職ボーナス', value: fmtYen(roleBonusInfo.bonus), tone: color.navy },
          { label: '③紹介料', value: fmtYen(referralTotal), tone: color.success },
          { label: '合計支給額', value: fmtYen(totalPayout), tone: color.navy, emphasis: true },
        ].map((s, i) => (
          <Card key={i} variant="default" padding="none" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: font.size.xs - 1, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 4 }}>{s.label}</div>
            <div style={{
              fontSize: s.emphasis ? 26 : 22,
              fontWeight: font.weight.black,
              color: s.tone,
              fontFamily: MONO,
              fontVariantNumeric: 'tabular-nums',
            }}>{s.value}</div>
          </Card>
        ))}
      </div>

      {/* 計算ロジック */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: space[5] }}>
        <Card
          padding="md"
          title="①インセンティブ計算式"
          description="当月のアポイント単価合計"
        >
          <div style={{ fontSize: font.size.sm, color: color.textDark, lineHeight: 1.7 }}>
            <div style={{ marginBottom: 6 }}>
              <span style={{ color: color.textLight }}>ランク: </span>
              <span style={{ fontWeight: font.weight.bold, color: color.navy }}>{rankInfo.rank}</span>
              <span style={{ color: color.textLight, marginLeft: space[3] }}>適用率: </span>
              <span style={{ fontFamily: MONO, fontWeight: font.weight.bold }}>{memberRate}</span>
              <span style={{ color: color.textLight, marginLeft: space[3] }}>累計売上: </span>
              <span style={{ fontFamily: MONO }}>{fmtYenZero(targetMember.totalSales)}</span>
            </div>
            <div style={{ marginBottom: 6 }}>
              <span style={{ color: color.textLight }}>当月対象アポ: </span>
              <span style={{ fontFamily: MONO, fontWeight: font.weight.semibold }}>{myAppos.length} 件</span>
              <span style={{ color: color.textLight, marginLeft: space[3] }}>当月売上: </span>
              <span style={{ fontFamily: MONO, fontWeight: font.weight.semibold }}>{fmtYen(monthlySales)}</span>
            </div>
            <div style={{
              padding: space[2], borderRadius: radius.md,
              background: alpha(color.success, 0.08),
              fontFamily: MONO, color: color.success, fontWeight: font.weight.bold,
            }}>
              インセンティブ = Σ(各アポのインターン報酬) = {fmtYen(incentive)}
            </div>
            <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: 6 }}>
              ※ インターン報酬の単価はクライアントごとの報酬マスター設定に基づきます
            </div>
          </div>
        </Card>

        <Card
          padding="md"
          title="②役職ボーナス計算式"
          description={memberRole ? `${memberRole}（チーム: ${targetMember.team || '-'}）` : 'リーダー/副リーダーのみ対象'}
        >
          <div style={{ fontSize: font.size.sm, color: color.textDark, lineHeight: 1.7 }}>
            {['リーダー', '副リーダー'].includes(memberRole) ? (
              <>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: color.textLight }}>{roleBonusInfo.label}</span>
                </div>
                <div style={{
                  padding: space[2], borderRadius: radius.md,
                  background: alpha(color.navy, 0.06),
                  fontFamily: MONO, color: color.navy, fontWeight: font.weight.bold,
                }}>
                  {roleBonusInfo.formula}
                </div>
              </>
            ) : (
              <div style={{ color: color.textLight }}>対象外（リーダー/副リーダーのみ計上）</div>
            )}
          </div>
        </Card>
      </div>

      {/* 紹介料明細 */}
      <Card padding="md" title="③紹介料明細" description="被紹介者が稼働開始から 30 日以内に売上 ¥100,000 以上を達成した場合、¥50,000 を支給" style={{ marginBottom: space[5] }}>
        {referrals.length === 0 ? (
          <div style={{ fontSize: font.size.sm, color: color.textLight }}>当月対象なし</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {referrals.map(r => (
              <div key={r.name} style={{
                display: 'flex', alignItems: 'center', gap: space[3],
                padding: '8px 12px', borderRadius: radius.md,
                background: alpha(color.success, 0.06),
                border: `1px solid ${alpha(color.success, 0.2)}`,
              }}>
                <Badge variant="success" dot>{r.name}</Badge>
                <span style={{ fontSize: font.size.xs, color: color.textMid }}>
                  稼働開始 {r.operationStartDate} → 30 日以内売上 <span style={{ fontFamily: MONO, fontWeight: font.weight.bold }}>{fmtYen(r.salesWithin30)}</span>
                </span>
                <span style={{
                  marginLeft: 'auto', fontFamily: MONO, fontWeight: font.weight.bold, color: color.success,
                }}>+{fmtYen(r.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* アポ明細 */}
      <div style={{ marginBottom: space[5] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[2] }}>
          当月対象アポイント明細（{myAppos.length} 件）
        </div>
        <DataTable
          ariaLabel="当月アポイント明細"
          height="auto"
          showCount={false}
          fillWidth
          rows={myAppos}
          rowKey={(_, i) => i}
          emptyMessage="当月の対象アポイントはありません"
          columns={apptColumns}
        />
      </div>

      {/* 請求書 */}
      <PayrollInvoiceUploader memberId={targetMember._supaId || targetMember.id} payMonth={payMonth} canEdit={canEdit} />
    </div>
  );
}
