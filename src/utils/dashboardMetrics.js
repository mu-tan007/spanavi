// ダッシュボード「結果を出す行動」の物差しと「次の一歩」の選び方。
// 上位＝月ごとのアポ上位4名、中位＝それ以外で月500件以上（上位と中位の差の分析 2026-10-06 と同じ人月の考え方）。

// 目安がまだ計算されていないとき（dashboard_benchmarks が空）に使う、3〜9月の分析の値
export const FALLBACK_BENCH = {
  top: { days_pct: 87, max_consec_weekdays: 4.8, offshift_pct: 37, start_first_med_min: 13, span_med_h: 6.5, recall50_pct: 22.9, lists_per_month: 36.9, keyman_appo_pct: 5.4, talk_med_sec: 80, mtg_pct: 79.5 },
  mid: { days_pct: 46, max_consec_weekdays: 3.0, offshift_pct: 18, start_first_med_min: 35, span_med_h: 5.0, recall50_pct: 4.8, lists_per_month: 14.3, keyman_appo_pct: 1.9, talk_med_sec: 66, mtg_pct: 31.8 },
};

// 記録がまだ無い項目（架電ページの改修で記録を取り始めたら出す）。目安は分析の値
const NOT_RECORDED = {
  reception_next_time_pct: { top: 52, mid: 24 },
  schedule_reach_pct: { top: 16, mid: 5 },
};

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const pick = (bench, side, key) => {
  const v = num(bench?.[side]?.[key]);
  return v === null ? FALLBACK_BENCH[side][key] : v;
};

// 期間の平日の数（JSTの日付文字列 YYYY-MM-DD）
export function countWeekdays(fromDate, toDate) {
  if (!fromDate || !toDate || fromDate > toDate) return 0;
  let n = 0;
  const d = new Date(fromDate + 'T00:00:00Z');
  const end = new Date(toDate + 'T00:00:00Z');
  while (d <= end) {
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

const daysBetween = (fromDate, toDate) => {
  if (!fromDate || !toDate) return 0;
  return Math.round((new Date(toDate + 'T00:00:00Z') - new Date(fromDate + 'T00:00:00Z')) / 86400000) + 1;
};

/**
 * 自分の行と目安から、物差しの一覧を作る。
 * row: dashboard_member_metrics の1行（無ければ null）
 * ctx: { fromDate, toDate }（JST、toDate は今日か期間の最終日）
 * 返り値: [{ group, items: [{ key, name, sub, me, unit, up, mid, higherIsBetter, recorded, status }] }]
 */
export function buildBehaviorGroups(row, bench, ctx) {
  const r = row || {};
  const weekdays = countWeekdays(ctx.fromDate, ctx.toDate);
  const calDays = Math.max(daysBetween(ctx.fromDate, ctx.toDate), 1);
  const days = num(r.days) ?? 0;
  const keyman = num(r.keyman) ?? 0;
  const appo = num(r.appo) ?? 0;
  const mtgTotal = num(r.mtg_total) ?? 0;

  const item = (key, name, sub, me, unit, higherIsBetter, opts = {}) => {
    const up = opts.up ?? pick(bench, 'top', key);
    const mid = opts.mid ?? pick(bench, 'mid', key);
    const recorded = opts.recorded !== false;
    return { key, name, sub, me: recorded ? me : null, unit, up, mid, higherIsBetter, recorded, status: statusOf(recorded ? me : null, up, mid, higherIsBetter, recorded) };
  };

  return [
    { group: '来る量と時間', items: [
      item('days_pct', '稼働日数', `平日${weekdays}日のうち${days}日`, weekdays ? Math.min(days / weekdays * 100, 100) : null, '%', true),
      item('max_consec_weekdays', '平日に続けて来た日数', '最長', num(r.max_consec_weekdays), '日', true),
      item('offshift_pct', 'シフトのない日の稼働', '架電した日のうち', num(r.offshift_pct), '%', true),
      item('start_first_med_min', 'シフト開始から最初の架電まで', '中央値', num(r.start_first_med_min), '分', false),
      item('span_med_h', '1日の幅', '最初〜最後の架電（中央値）', num(r.span_med_h), '時間', true),
    ]},
    { group: '再コールの作り方', items: [
      item('recall50_pct', '朝一50件に占める再コール', '直前が受付・キーマン再コールの会社', num(r.recall50_pct), '%', true),
      item('lists_per_month', 'かけたリストの数', '月に直すと', r.lists == null ? null : Math.round(num(r.lists) * 30 / calDays * 10) / 10, '本', true),
      item('reception_next_time_pct', '受付で、次の時刻を決めて切る', '受付再コールのうち', null, '%', true,
        { recorded: false, up: NOT_RECORDED.reception_next_time_pct.top, mid: NOT_RECORDED.reception_next_time_pct.mid }),
    ]},
    { group: 'キーマンとの会話', items: [
      item('keyman_appo_pct', 'キーマン会話からのアポ率', `接続${keyman}件のうち${appo}件`, keyman ? appo / keyman * 100 : null, '%', true),
      item('schedule_reach_pct', '日程の話まで進む率', 'キーマン会話のうち', null, '%', true,
        { recorded: false, up: NOT_RECORDED.schedule_reach_pct.top, mid: NOT_RECORDED.schedule_reach_pct.mid }),
      item('talk_med_sec', 'キーマン会話の長さ', `断り・再コール（中央値・${num(r.talk_n) ?? 0}件）`, num(r.talk_med_sec), '秒', true),
    ]},
    { group: '熱量', items: [
      item('mtg_pct', '週次MTGの出席率', mtgTotal ? `直近${mtgTotal}回のうち${num(r.mtg_attended) ?? 0}回` : '直近の回', mtgTotal ? (num(r.mtg_attended) ?? 0) / mtgTotal * 100 : null, '%', true),
    ]},
  ];
}

// 'up'（上位並み）/'near'（あと少し）/'far'（差が大きい）/'none'（データなし）/'unrecorded'（記録の準備中）
export function statusOf(me, up, mid, higherIsBetter, recorded = true) {
  if (!recorded) return 'unrecorded';
  if (me === null || me === undefined || Number.isNaN(me)) return 'none';
  const good = higherIsBetter ? me >= up : me <= up;
  const bad = higherIsBetter ? me <= mid : me >= mid;
  return good ? 'up' : bad ? 'far' : 'near';
}

// 上位までの距離（0=上位並み、1=中位の位置、1超=中位より下）
export function gapScore(it) {
  if (it.me === null || it.status === 'unrecorded' || it.status === 'none') return -Infinity;
  const span = it.higherIsBetter ? it.up - it.mid : it.mid - it.up;
  if (!span) return -Infinity;
  const d = it.higherIsBetter ? it.up - it.me : it.me - it.up;
  return d / span;
}

// 次の一歩に使う文面。シフトのない日の稼働は方針が未定（シフト外の再コールを明言するか判断待ち）なので候補にしない。
export const NEXT_STEP = {
  recall50_pct: { title: 'シフトの最初の30分は、今日かけ直す企業から', body: '上位は朝一の50件で再コールを先に片付け、最初の50件のキーマン接続が2倍（10.1%対5.2%）になっています。約束した時刻にかけるほど、キーマンが出ます。', action: 'recalls' },
  days_pct: { title: '来る日を増やす', body: '上位は平日のほぼ9割に来ています。来る日が多いほど、かけ直しの約束を守れて、アポの数が増えます。' },
  max_consec_weekdays: { title: '続けて来る', body: 'かけ直しの約束は翌日以降が多く、続けて来ないと守れません。上位は平日を長く続けて来ています。' },
  start_first_med_min: { title: 'シフト開始から15分以内に最初の1本', body: '上位は準備が早く、シフトが始まってすぐにかけ始めています。' },
  span_med_h: { title: '1日の幅を長く取る', body: '上位は1日の件数は同じでも、最初から最後の架電までが長く、その分を会話とかけ直しの待ちに使っています。' },
  lists_per_month: { title: '再コールを追ってリストをまたぐ', body: '上位はかけ直しの約束を追って、月に多くのリストをまたいでいます。1つのリストをかけ切るより、約束のある会社を先にかけましょう。' },
  keyman_appo_pct: { title: '断られた後に、日程の二択まで運ぶ', body: '上位は最初の断りのあと、相手の手がかり（県外の同業・相手の強み）を出し、理由を質問で聞き、30〜60秒で日時1点か二択まで進めています。' },
  talk_med_sec: { title: 'キーマンとの会話をあと15秒延ばす', body: 'キーマン会話の長さは、同じ人の中でもアポ率と結び付いていた唯一の腕の要素です。断られても、理由を質問で聞いてみましょう。' },
  mtg_pct: { title: '週次MTGに出る', body: '上位は週次MTGの8割に出ています。出られない回は、録画を最後まで見ましょう。' },
};

export function pickNextStep(groups) {
  const items = groups.flatMap(g => g.items).filter(it => NEXT_STEP[it.key]);
  let best = null;
  for (const it of items) {
    const s = gapScore(it);
    if (s > 0 && (!best || s > best.score)) best = { item: it, score: s };
  }
  if (!best) return null;
  return { ...NEXT_STEP[best.item.key], item: best.item };
}
