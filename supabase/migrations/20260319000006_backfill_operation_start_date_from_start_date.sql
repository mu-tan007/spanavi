-- operation_start_date が空のメンバーに start_date を補完する
-- 「従業員名簿」ページで管理している start_date（入社日）を
-- メンバー管理の operation_start_date に反映させる
UPDATE members
SET operation_start_date = start_date
WHERE operation_start_date IS NULL
  AND start_date IS NOT NULL
  AND start_date <> '';
