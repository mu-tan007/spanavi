-- 面談後のキャンセル（クライアントから請求対象外・キャンセルの依頼があったもの）。30日後の再アプローチの対象にしない（2026-10-08）
alter table public.appointments drop constraint if exists appointments_cancel_type_check;
alter table public.appointments add constraint appointments_cancel_type_check check (cancel_type is null or cancel_type in ('client', 'prospect', 'after_meeting'));
