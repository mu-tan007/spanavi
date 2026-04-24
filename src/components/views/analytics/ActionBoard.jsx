import { useMemo } from 'react';
import { C } from '../../../constants/colors';

const NAVY = '#0D2247';

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];

/**
 * データから推奨アクションを自動生成
 */
function generateActions({ callRecords, callListData, rankByPerson, ceoConnectLabels }) {
  const actions = [];

  // ── ① ヒートマップで突出した時間帯 ──────────────────────────────────
  const grid = {};
  (callRecords || []).forEach(r => {
    const d = new Date(r.called_at);
    const jst = new Date(d.getTime() + 9 * 3600000);
    const hour = jst.getUTCHours();
    const dow = (jst.getUTCDay() + 6) % 7;
    if (hour < 8 || hour > 19) return;
    const key = dow + '_' + hour;
    if (!grid[key]) grid[key] = { calls: 0, connects: 0 };
    grid[key].calls++;
    if (ceoConnectLabels?.has(r.status)) grid[key].connects++;
  });

  const totalConnects = (callRecords || []).filter(r => ceoConnectLabels?.has(r.status)).length;
  const totalCalls = (callRecords || []).length;
  const orgRate = totalCalls > 0 ? totalConnects / totalCalls : 0;

  let bestCell = null;
  Object.entries(grid).forEach(([key, c]) => {
    if (c.calls < 15) return;
    const rate = c.connects / c.calls;
    if (rate > orgRate * 1.3) {
      if (!bestCell || rate > bestCell.rate) {
        const [w, h] = key.split('_').map(Number);
        bestCell = { w, h, rate, calls: c.calls };
      }
    }
  });
  if (bestCell) {
    actions.push({
      type: 'schedule',
      priority: 1,
      title: `${WEEKDAYS[bestCell.w]}曜 ${bestCell.h}時台に架電を集中`,
      body: `この時間帯の社長接続率 ${(bestCell.rate * 100).toFixed(1)}% は組織平均 ${(orgRate * 100).toFixed(1)}% の${(bestCell.rate / orgRate).toFixed(1)}倍。同曜・同時間帯の枠を今週中に追加投入してアポを積み増す。`,
    });
  }

  // ── ② メンバー別: 平均との乖離が大きい人 ───────────────────────────
  const activeMembers = (rankByPerson || []).filter(p => p.call >= 50);
  if (activeMembers.length >= 3) {
    const avgCall = activeMembers.reduce((s, p) => s + p.call, 0) / activeMembers.length;
    const avgAppo = activeMembers.reduce((s, p) => s + p.appo, 0) / activeMembers.length;

    const lowPerformers = activeMembers
      .filter(p => p.call >= avgCall * 0.7 && p.appo < avgAppo * 0.6)
      .slice(0, 2);

    if (lowPerformers.length > 0) {
      const names = lowPerformers.map(p => p.name).join('・');
      actions.push({
        type: 'coaching',
        priority: 2,
        title: `${names} のアポ転換にロープレ推奨`,
        body: `架電量は平均水準だがアポ転換が大きく下回っている（平均の${Math.round((lowPerformers[0].appo / (avgAppo || 1)) * 100)}%）。社長接続後のクロージングを重点的にロープレ。`,
      });
    }
  }

  // ── ③ リスト枯渇（進捗率500%+）──────────────────────────────────
  const depleted = (callListData || []).filter(l => !l.is_archived && (l.call_progress_pct || 0) >= 500);
  if (depleted.length > 0) {
    const names = depleted.slice(0, 2).map(l => l.name).join('・');
    actions.push({
      type: 'list',
      priority: 1,
      title: `${names}${depleted.length > 2 ? ` ほか${depleted.length - 2}件` : ''} に追加リスト投入`,
      body: `進捗率が500%を超えており、新規企業への初回接触機会がほぼなくなっている。同業種・同エリアの追加リストを今週中に仕込む。`,
    });
  }

  // ── ④ ファネル段階別: 接続→アポ転換の弱さ検出 ─────────────────────
  const ceoCount = (callRecords || []).filter(r => ceoConnectLabels?.has(r.status)).length;
  const appoCount = (callRecords || []).filter(r => r.status === 'アポ獲得').length;
  if (ceoCount >= 30 && (appoCount / ceoCount) < 0.15) {
    actions.push({
      type: 'funnel',
      priority: 2,
      title: `社長接続→アポ転換率を改善（現在 ${(appoCount / ceoCount * 100).toFixed(1)}%）`,
      body: `社長と話せた後のアポ取得率が15%未満。スクリプトの冒頭フックと切り返しトークを見直し、成功パターンを共有する。`,
    });
  }

  // 空なら、健全状態のメッセージ
  if (actions.length === 0) {
    actions.push({
      type: 'ok',
      priority: 3,
      title: '特筆すべき異常はありません',
      body: '現在の期間・スコープではデータ上の大きな乖離は検出されませんでした。引き続き現行ペースを維持してください。',
    });
  }

  return actions.sort((a, b) => a.priority - b.priority).slice(0, 5);
}

export default function ActionBoard({ callRecords, callListData, rankByPerson, ceoConnectLabels }) {
  const actions = useMemo(
    () => generateActions({ callRecords, callListData, rankByPerson, ceoConnectLabels }),
    [callRecords, callListData, rankByPerson, ceoConnectLabels]
  );

  const colorFor = (type) => {
    if (type === 'schedule') return { bg: '#FEF3C7', border: '#F59E0B', label: 'スケジュール' };
    if (type === 'coaching') return { bg: '#EDE9FE', border: '#7C3AED', label: 'コーチング' };
    if (type === 'list')     return { bg: '#FEE2E2', border: '#EF4444', label: 'リスト' };
    if (type === 'funnel')   return { bg: '#DBEAFE', border: '#2563EB', label: 'ファネル' };
    return { bg: '#F3F4F6', border: '#9CA3AF', label: '通知' };
  };

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, borderBottom: '2px solid ' + NAVY, paddingBottom: 6, marginBottom: 14 }}>
        今週の打ち手（Action Items）<span style={{ fontSize: 10, fontWeight: 500, color: C.textLight, marginLeft: 8 }}>データから自動生成</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10 }}>
        {actions.map((a, i) => {
          const c = colorFor(a.type);
          return (
            <div key={i} style={{ background: c.bg, border: '1px solid ' + c.border, borderLeft: '4px solid ' + c.border, borderRadius: 4, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: c.border, background: '#fff', padding: '2px 6px', borderRadius: 2, letterSpacing: '0.04em' }}>{c.label}</span>
                {a.priority === 1 && <span style={{ fontSize: 9, fontWeight: 700, color: '#B91C1C', background: '#fff', padding: '2px 6px', borderRadius: 2 }}>最優先</span>}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 4, lineHeight: 1.45 }}>{a.title}</div>
              <div style={{ fontSize: 11, color: C.textDark, lineHeight: 1.6 }}>{a.body}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
