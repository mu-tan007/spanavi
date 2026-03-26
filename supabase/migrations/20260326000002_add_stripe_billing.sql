-- organizations テーブルに課金カラムを追加
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS plan_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS seat_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS setup_fee_paid boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz;

-- 既存MASP組織を永久activeに設定
UPDATE public.organizations
  SET plan_status = 'active', setup_fee_paid = true
  WHERE id = 'a0000000-0000-0000-0000-000000000001';

-- テナント申込の仮レコードを管理するテーブル
CREATE TABLE IF NOT EXISTS public.pending_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  org_name text NOT NULL,
  stripe_checkout_session_id text UNIQUE,
  seat_count integer NOT NULL DEFAULT 1,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.pending_signups ENABLE ROW LEVEL SECURITY;
