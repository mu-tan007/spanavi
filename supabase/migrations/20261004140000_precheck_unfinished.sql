-- 1営業日前の19時になっても事前確認が終わっていないアポに、「未完了」の報告の下書きを作る（2026-10-04）
-- 自動で作る行は result='未完了'・caller_name='Spanavi（自動）'。インターンの画面からは選べない
set lock_timeout = '5s';
alter table public.precheck_events drop constraint if exists precheck_events_result_check;
alter table public.precheck_events add constraint precheck_events_result_check
  check (result in ('確認完了', 'リスケ', 'キャンセル', '不在', '不通', '未完了'));

-- 17時（催促）と19時（未完了の報告）を平日に動かす。土日・祝日は関数側で止める
-- （本番では cron.schedule('precheck-evening-remind', '0 8 * * 1-5', …) と
--   cron.schedule('precheck-evening-report', '0 10 * * 1-5', …) を登録済み。中身は precheck-evening を mode 付きで呼ぶだけ）
