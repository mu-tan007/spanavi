import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { color, space, radius, font } from '../../../constants/design';
import { supabase } from '../../../lib/supabase';
import { getOrgId } from '../../../lib/orgContext';
import { fetchClientMonthlyTargets } from '../../../lib/supabaseWrite';
import { NAVY, GRAY_200, currentYearMonth, statusStyle, STATUS_LIST } from './utils';

const yen = n => '¥' + Number(n || 0).toLocaleString();

function getMonthBoundaries(ym) {
  // ym='YYYY-MM' から当月の開始・終了 ISO 文字列を返す（UTC基準）
  const [y, m] = ym.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0)).toISOString();
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0)).toISOString();
  return { start, end };
}

function previousYearMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1); // m は1〜12、m-2 で前月の前 → new Date は0始まりなので m-2 で前月の前月になる… 修正
  // 正：new Date(y, m-1-1, 1) = new Date(y, m-2, 1) = 前月（m=5なら2026-04）
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function KPICard({ label, value, hint, valueColor = NAVY, hintColor }) {
  return (
    <div style={{
      flex: 1, minWidth: 180,
      padding: '14px 18px',
      background: color.white,
      border: '1px solid ' + GRAY_200,
      borderRadius: radius.md,
    }}>
      <div style={{ fontSize: font.size.xs - 1, fontWeight: font.weight.semibold, color: color.textLight, letterSpacing: 0.5, marginBottom: space[2] }}>
        {label}
      </div>
      <div style={{
        fontSize: font.size['2xl'], fontWeight: font.weight.bold, color: valueColor,
        fontFamily: font.family.mono,
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.1,
      }}>
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: font.size.xs - 1, color: hintColor || color.textLight, marginTop: space[1.5] }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export default function CRMKPIDashboard({ clientData = [], statusCounts = {} }) {
  const orgId = getOrgId();
  const currentYM = useMemo(() => currentYearMonth(), []);
  const previousYM = useMemo(() => previousYearMonth(currentYM), [currentYM]);

  // 当月のステータス遷移（成約数 = status_changed_at が当月で status が「準備中」or「支援中」）
  const { data: clientsRaw = [] } = useQuery({
    queryKey: ['crm-clients-status', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, status, status_changed_at')
        .eq('org_id', orgId);
      if (error) { console.warn('[CRM KPI] clients fetch failed', error); return []; }
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  // 当月の appointments（売上＋件数）
  const { data: thisMonthAppos = [] } = useQuery({
    queryKey: ['crm-appointments-month', orgId, currentYM],
    queryFn: async () => {
      const { start, end } = getMonthBoundaries(currentYM);
      const { data, error } = await supabase
        .from('appointments')
        .select('id, client_id, sales_amount, appointment_date')
        .eq('org_id', orgId)
        .gte('appointment_date', start)
        .lt('appointment_date', end);
      if (error) { console.warn('[CRM KPI] appointments fetch failed', error); return []; }
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  // 当月の月別目標
  const { data: monthlyTargets = [] } = useQuery({
    queryKey: ['crm-monthly-targets', currentYM, currentYM],
    queryFn: async () => {
      const { data } = await fetchClientMonthlyTargets(currentYM, currentYM);
      return data;
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  // 集計
  const { thisMonthClosures, prevMonthClosures } = useMemo(() => {
    const closeStatuses = new Set(['準備中', '支援中']);
    let thisCount = 0;
    let prevCount = 0;
    clientsRaw.forEach(c => {
      if (!c.status_changed_at || !closeStatuses.has(c.status)) return;
      const ym = c.status_changed_at.slice(0, 7);
      if (ym === currentYM) thisCount += 1;
      else if (ym === previousYM) prevCount += 1;
    });
    return { thisMonthClosures: thisCount, prevMonthClosures: prevCount };
  }, [clientsRaw, currentYM, previousYM]);

  const monthSalesTotal = useMemo(
    () => thisMonthAppos.reduce((sum, a) => sum + (Number(a.sales_amount) || 0), 0),
    [thisMonthAppos]
  );

  // 目標対比は「支援中」クライアントだけを対象に算出
  const supportedClientIds = useMemo(
    () => new Set(clientData.filter(c => c.status === '支援中').map(c => c._supaId)),
    [clientData]
  );

  const monthAppoCount = useMemo(
    () => thisMonthAppos.filter(a => supportedClientIds.has(a.client_id)).length,
    [thisMonthAppos, supportedClientIds]
  );

  const monthTargetTotal = useMemo(
    () => monthlyTargets
      .filter(t => supportedClientIds.has(t.client_id))
      .reduce((sum, t) => sum + (t.target_count || 0), 0),
    [monthlyTargets, supportedClientIds]
  );

  const targetRatio = monthTargetTotal > 0
    ? Math.round((monthAppoCount / monthTargetTotal) * 100)
    : null;

  // 成約数の前月比 hint
  const closureDiff = thisMonthClosures - prevMonthClosures;
  const closureHint = closureDiff === 0
    ? '前月比 ±0 件'
    : (closureDiff > 0 ? `前月比 +${closureDiff} 件` : `前月比 ${closureDiff} 件`);
  const closureHintColor = closureDiff > 0 ? color.success : closureDiff < 0 ? color.danger : color.textLight;

  // 目標対比 色分け
  let targetColor = color.textLight;
  if (targetRatio != null) {
    if (targetRatio >= 100) targetColor = color.success;
    else if (targetRatio >= 70) targetColor = color.gold;
    else targetColor = color.danger;
  }

  // ステータス別件数（横棒グラフ）
  const totalClients = clientData.length;
  const statusBars = STATUS_LIST.map(st => {
    const count = statusCounts[st] || 0;
    const pct = totalClients > 0 ? (count / totalClients) * 100 : 0;
    const sc = statusStyle(st);
    return { st, count, pct, color: sc.color, dot: sc.dot };
  });

  return (
    <div style={{ display: 'flex', gap: space[3], marginBottom: space[4], flexWrap: 'wrap' }}>
      <KPICard
        label="今月成約数"
        value={`${thisMonthClosures} 社`}
        hint={closureHint}
        hintColor={closureHintColor}
      />
      <KPICard
        label="当月売上"
        value={yen(monthSalesTotal)}
        hint={`${monthAppoCount} 件のアポから`}
      />
      <KPICard
        label="目標対比"
        value={targetRatio != null ? `${targetRatio}%` : '—'}
        hint={`${monthAppoCount} / ${monthTargetTotal} 件`}
        valueColor={targetColor}
      />
      {/* ステータス別件数: 横棒グラフ */}
      <div style={{
        flex: 1.5, minWidth: 280,
        padding: '14px 18px',
        background: color.white,
        border: '1px solid ' + GRAY_200,
        borderRadius: radius.md,
      }}>
        <div style={{ fontSize: font.size.xs - 1, fontWeight: font.weight.semibold, color: color.textLight, letterSpacing: 0.5, marginBottom: space[2] }}>
          ステータス別件数
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
          {statusBars.map(b => (
            <div key={b.st} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 28px', alignItems: 'center', gap: space[1.5], fontSize: font.size.xs - 1 }}>
              <span style={{ color: color.textMid, display: 'flex', alignItems: 'center', gap: space[1] }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: b.dot }}></span>
                {b.st}
              </span>
              <span style={{ height: 6, background: color.gray100, borderRadius: 3, overflow: 'hidden' }}>
                <span style={{
                  display: 'block', height: '100%',
                  width: `${b.pct}%`, background: b.color,
                  transition: 'width 0.3s',
                }} />
              </span>
              <span style={{
                textAlign: 'right',
                fontFamily: font.family.mono,
                fontVariantNumeric: 'tabular-nums',
                color: NAVY, fontWeight: font.weight.semibold,
              }}>{b.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
