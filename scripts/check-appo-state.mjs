import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://baiiznjzvzhxwwqzsozn.supabase.co',
  'sb_secret_Qz4ZW8lkQmt-G-J1-Xjyqg_yJpKm06c'
);

async function main() {
  // 全 appointments を取得
  const { data: all, error } = await supabase
    .from('appointments')
    .select('id, appointment_date, meeting_date, company_name, getter_name, sales_amount, intern_reward, status, appo_month')
    .order('appointment_date', { ascending: true });

  if (error) { console.error(error.message); process.exit(1); }

  console.log(`=== 全アポ件数: ${all.length} 件 ===\n`);

  // appointment_date 月別集計
  const byAppoMonth = {};
  all.forEach(a => {
    const m = (a.appointment_date || '').slice(0, 7); // 'YYYY-MM'
    byAppoMonth[m] = (byAppoMonth[m] || 0) + 1;
  });
  console.log('【アポ獲得日 月別件数】');
  Object.entries(byAppoMonth).sort().forEach(([m, c]) => console.log(`  ${m}: ${c}件`));

  // meeting_date 月別集計
  const byMeetMonth = {};
  all.forEach(a => {
    if (!a.meeting_date) { byMeetMonth['(未設定)'] = (byMeetMonth['(未設定)'] || 0) + 1; return; }
    const m = a.meeting_date.slice(0, 7);
    byMeetMonth[m] = (byMeetMonth[m] || 0) + 1;
  });
  console.log('\n【面談実施日 月別件数】');
  Object.entries(byMeetMonth).sort().forEach(([m, c]) => console.log(`  ${m}: ${c}件`));

  // 3月面談分の詳細
  const marchMeet = all.filter(a => (a.meeting_date || '').startsWith('2026-03'));
  console.log(`\n=== 3月面談実施分: ${marchMeet.length} 件 ===`);
  marchMeet.slice(0, 10).forEach(a =>
    console.log(`  appo:${a.appointment_date} meet:${a.meeting_date?.slice(0,10)} | ${a.company_name} | ${a.getter_name} | 売上:${a.sales_amount}`)
  );

  // 2月アポ獲得分（まだ残っているもの）
  const febAppo = all.filter(a => (a.appointment_date || '').startsWith('2026-02'));
  console.log(`\n=== 2月アポ獲得分（残存）: ${febAppo.length} 件 ===`);
  console.log('合計売上:', febAppo.reduce((s,a) => s + (Number(a.sales_amount)||0), 0).toLocaleString());
  console.log('合計報酬:', febAppo.reduce((s,a) => s + (Number(a.intern_reward)||0), 0).toLocaleString());

  // appo_month 別集計
  const byAppoMonthField = {};
  all.forEach(a => {
    const m = a.appo_month || '(未設定)';
    byAppoMonthField[m] = (byAppoMonthField[m] || 0) + 1;
  });
  console.log('\n【appo_month フィールド 月別件数】');
  Object.entries(byAppoMonthField).sort().forEach(([m, c]) => console.log(`  ${m}: ${c}件`));
}

main().catch(console.error);
