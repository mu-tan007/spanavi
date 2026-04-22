// Caesar の ma_agencies (3,396 行) を Spanavi の cap_ma_agencies に一括コピーする1回だけ使う。実行例:
//   CAESAR_SERVICE_ROLE=... SPANAVI_SERVICE_ROLE=... node scripts/migrate_ma_agencies.mjs
//
// service_role キーは以下から取得 (絶対にコミットしない):
//   Caesar : https://supabase.com/dashboard/project/qhrcvzhshqoteepqewir/settings/api
//   Spanavi: https://supabase.com/dashboard/project/baiiznjzvzhxwwqzsozn/settings/api
import { createClient } from '@supabase/supabase-js';

const CAESAR_URL = 'https://qhrcvzhshqoteepqewir.supabase.co';
const SPANAVI_URL = 'https://baiiznjzvzhxwwqzsozn.supabase.co';

const CAESAR_KEY = process.env.CAESAR_SERVICE_ROLE;
const SPANAVI_KEY = process.env.SPANAVI_SERVICE_ROLE;

if (!CAESAR_KEY || !SPANAVI_KEY) {
  console.error('環境変数 CAESAR_SERVICE_ROLE と SPANAVI_SERVICE_ROLE を設定してください。');
  process.exit(1);
}

const caesar = createClient(CAESAR_URL, CAESAR_KEY);
const spanavi = createClient(SPANAVI_URL, SPANAVI_KEY);

const BATCH = 500;

async function run() {
  let offset = 0;
  let totalInserted = 0;
  while (true) {
    const { data, error } = await caesar
      .from('ma_agencies')
      .select('*')
      .order('id')
      .range(offset, offset + BATCH - 1);
    if (error) { console.error('Caesar fetch失敗:', error); break; }
    if (!data || data.length === 0) break;

    // tenant_id を除外
    const payload = data.map(({ tenant_id: _tid, ...rest }) => rest);

    const { error: upErr, count } = await spanavi
      .from('cap_ma_agencies')
      .upsert(payload, { onConflict: 'id', ignoreDuplicates: false, count: 'exact' });
    if (upErr) { console.error('Spanavi upsert失敗 at offset=' + offset + ':', upErr); break; }
    totalInserted += payload.length;
    console.log('  offset=' + offset + ' rows=' + payload.length + ' (total=' + totalInserted + ')');

    if (data.length < BATCH) break;
    offset += BATCH;
  }
  console.log('完了: ' + totalInserted + ' 行を cap_ma_agencies にコピー');
}

run().catch(e => { console.error(e); process.exit(1); });
