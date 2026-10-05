export const DIRECTORY_RANGES = [
 ['revenue','売上高（千円）'],['netIncome','当期純利益（千円）'],['ordinaryIncome','経常利益（千円）'],
 ['capital','資本金（千円）'],['employee','従業員数'],['age','代表者年齢'],['established','設立年'],
];
export const DIRECTORY_FILTERS = {
 directory: true, keyword:'',keywords:[],logic:'AND',representative:'',identifier:'',business:'',industry:'',
 daibunrui:[],saibunrui:[],prefecture:[],city:'',cities:[],phonePattern:'',phonePatterns:[],
 ...Object.fromEntries(DIRECTORY_RANGES.flatMap(([k])=>[[k+'Min',''],[k+'Max',''],[k+'NullMode','']])),
 shareholderType:[],repShareholderMatch:false,dbLabel:[],home:'',addressMatch:'',registry:'',
 stage:'',owner:'',scope:'',nextActionFrom:'',nextActionTo:'',
 listIds:[],callCategory:[],callEngagement:[],callStatus:[],lastCallFrom:'',lastCallTo:'',callCountMin:'',callCountMax:'',
 provider:'',sourceQuery:'',sortCol:'company_name',sortDir:'asc',page:0,pageSize:50,
};
export function normalizeDirectoryFilters(input = {}) {
 const filters = { ...DIRECTORY_FILTERS };
 for (const [key, value] of Object.entries(input)) if (Object.hasOwn(filters,key) && value != null) filters[key] = value;
 filters.directory = true;
 filters.keyword = input.keywords?.length ? input.keywords.join(' ') : input.keyword || input.query || '';
 filters.keywords = input.keywords?.length ? input.keywords : [];
 filters.phonePattern = String(filters.phonePatterns?.length ? filters.phonePatterns.join(', ') : filters.phonePattern).normalize('NFKC');
 if (input.cities?.length) { filters.city = ''; filters.cities = input.cities; }
 return filters;
}
export function validateDirectoryFilters(filters) {
 for (const [key,label] of [...DIRECTORY_RANGES,['callCount','架電回数']]) {
  const min = filters[key+'Min'], max = filters[key+'Max'];
  if (filters[key+'NullMode']==='only') continue;
  for (const value of [min,max]) if (value!=='' && !/^-?\d+(\.\d+)?$/.test(String(value))) return label+'は数値で指定してください。';
  if (key==='callCount' && [min,max].some(v=>v!=='' && !/^\d+$/.test(String(v)))) return '架電回数は0以上の整数で指定してください。';
  if (min!=='' && max!=='' && (Number(min)>Number(max) || (Number(min)===Number(max) && key!=='established'))) return label+'の上限は下限より大きくしてください。';
 }
 for (const key of ['lastCall','nextAction']) if (filters[key+'From'] && filters[key+'To'] && filters[key+'From']>filters[key+'To']) return '期間の終了日は開始日以降にしてください。';
 return '';
}
export function activeDirectoryConditionCount(filters) {
 return Object.keys(DIRECTORY_FILTERS).filter(k=>!['directory','logic','sortCol','sortDir','page','pageSize','keywords'].includes(k))
  .filter(k=>Array.isArray(filters[k]) ? filters[k].length>0 : filters[k]!=='' && filters[k]!==false && filters[k]!=null).length;
}
// The first fourteen delivery columns are intentionally stable.
export const DIRECTORY_EXPORT_COLUMNS = [
 ['company_name','企業名'],['tsr_id','tsr_id'],['prefecture','都道府県'],['city','市区町村'],['address','住所'],['phone','電話番号'],
 ['revenue_k','売上（千円）'],['employee_count','従業員数'],['established_year','設立年'],['representative','代表者'],
 ['industry_sub','業種',r=>r.industry_sub || r.industry || ''],['business_description','事業内容'],['shareholders','株主'],['officers','役員'],
 ['industry_major','大分類'],['net_income_k','当期純利益（千円）'],['representative_age','代表者年齢'],['capital_k','資本金（千円）'],
 ['clients','取引先'],['remarks','備考'],['id','企業ID'],['corporate_number','法人番号'],['tdb_code','TDB企業コード'],
 ['source_company_code','提供元の企業コード'],['ordinary_income_k','経常利益（千円）'],['crm_stage','対応状況'],['owner_name','担当者'],
 ['address_match','会社住所と代表者自宅住所',r=>({same:'一致',different:'不一致',unknown:'判定不可'}[r.address_match] || '')],
 ['next_action_at','次回対応'],['registry_status','登記確認状況'],
].map(([key,label,get],index)=>({key,label,get,defaultExport:index<14}));
export const directoryCsvQuote = value => {
 const text = String(value ?? '');
 const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? "'"+text : text;
 return '"'+safe.replaceAll('"','""')+'"';
};
export function directoryConditionSummary(f) {
 const labels=[];
 if(f.keyword)labels.push('キーワード：'+f.keyword);
 for(const [key,label] of [['prefecture','地域'],['daibunrui','業種'],['saibunrui','細分類'],['callStatus','架電'],['dbLabel','ラベル']])
  if(f[key]?.length)labels.push(label+'：'+f[key].join('・'));
 for(const [key,label] of [['representative','代表者'],['identifier','企業コード'],['business','事業内容'],['industry','業種名'],['city','住所'],['owner','担当'],['stage','対応'],['sourceQuery','取込元']])
  if(f[key])labels.push(label+'：'+f[key]);
 if(f.addressMatch)labels.push('会社・代表者住所：'+({same:'一致',different:'不一致',unknown:'判定不可'}[f.addressMatch]||f.addressMatch));
 for(const [key,label] of DIRECTORY_RANGES) {
  if(f[key+'NullMode']==='only'){labels.push(label+'：不明のみ');continue;}
  if(f[key+'Min']!==''||f[key+'Max']!=='')labels.push(label+'：'+(f[key+'Min']||'下限なし')+'〜'+(f[key+'Max']||'上限なし')+(f[key+'Max']!==''?(key==='established'?'以下':'未満'):''));
 }
 if(f.listIds?.length)labels.push('架電リスト：'+f.listIds.length+'件');
 if(f.callCategory?.length)labels.push('商材：'+f.callCategory.length+'件');
 if(f.callEngagement?.length)labels.push('タイプ：'+f.callEngagement.length+'件');
 if(f.provider)labels.push('出所：'+({client:'クライアント',tsr:'TSR',tdb:'TDB',other:'その他',unknown:'未設定'}[f.provider]||f.provider));
 return labels;
}

// ---------------------------------------------------------------------
// 企業DB の検索カード（Phalanx の企業DBにならう・2026-10-05）
//   基本の条件＝いつも見える（キーワード・架電リスト・担当者・業種・事業内容・所在地）
//   詳細条件＝畳む。閉じている間は入っている数をバッジで出す。
// ---------------------------------------------------------------------
const BASIC_KEYS = new Set(['keyword','keywords','logic','listIds','owner','daibunrui','saibunrui','business','prefecture','city','cities']);
const IGNORED_KEYS = new Set(['directory','sortCol','sortDir','page','pageSize']);
const filled = v => Array.isArray(v) ? v.length>0 : v!=='' && v!==false && v!=null;

// 詳細条件のうち入っている項目の数（範囲は下限・上限・不明の扱いをまとめて1つと数える）
export function advancedDirectoryConditionCount(f) {
 const rangeKeys = new Set([...DIRECTORY_RANGES.map(([k])=>k),'callCount']);
 let n = 0;
 for (const k of rangeKeys) if (filled(f[k+'Min']) || filled(f[k+'Max']) || filled(f[k+'NullMode'])) n += 1;
 for (const k of Object.keys(DIRECTORY_FILTERS)) {
  if (BASIC_KEYS.has(k) || IGNORED_KEYS.has(k)) continue;
  if ([...rangeKeys].some(r=>k===r+'Min'||k===r+'Max'||k===r+'NullMode')) continue;
  if (filled(f[k])) n += 1;
 }
 return n;
}

const PROVIDER_LABEL = {client:'クライアント',tsr:'TSR',tdb:'TDB',other:'その他',unknown:'出所未設定'};
const MATCH_LABEL = {same:'一致',different:'不一致',unknown:'判定不可'};
const HOME_LABEL = {available:'住所あり',unknown:'未確認',conflict:'情報の相違あり'};
const SHAREHOLDER_LABEL = {individual:'個人のみ',corporate:'法人のみ',mixed:'個人・法人混在',empty:'不明'};
const SCOPE_LABEL = {due:'次回対応の期限が到来',review:'名寄せ・情報の確認が必要'};

// 入っている条件を1つずつのチップにする。patch は×で戻す値（関係する値をまとめて戻す）。
// names は ID → 名前の表（架電リスト・商材・タイプ・登記の確認状況）。
export function directoryConditionChips(f, names = {}) {
 const out = [];
 const nameOf = (table, id) => names[table]?.get?.(id) || id;
 const keywords = f.keywords?.length ? f.keywords : (f.keyword ? [f.keyword] : []);
 if (keywords.length) out.push({k:'keyword',label:'キーワード：'+keywords.join(f.logic==='OR'?' または ':' '),patch:{keyword:'',keywords:[]}});
 const multi = (key, label, map) => (f[key]||[]).forEach(v=>out.push({k:key+':'+v,label:label+'：'+(map?map(v):v),
  patch:{[key]:(f[key]||[]).filter(x=>x!==v), ...(key==='daibunrui'?{saibunrui:[]}:{})}}));
 multi('listIds','架電リスト',v=>nameOf('lists',v));
 if (f.owner) out.push({k:'owner',label:'担当者：'+f.owner,patch:{owner:''}});
 multi('daibunrui','業種大分類');
 multi('saibunrui','業種細分類');
 if (f.business) out.push({k:'business',label:'事業内容：'+f.business,patch:{business:''}});
 multi('prefecture','都道府県');
 const cities = f.cities?.length ? f.cities : (f.city ? [f.city] : []);
 if (cities.length) out.push({k:'city',label:'市区町村・住所：'+cities.join('、'),patch:{city:'',cities:[]}});
 if (f.identifier) out.push({k:'identifier',label:'法人番号・企業コード：'+f.identifier,patch:{identifier:''}});
 if (f.representative) out.push({k:'representative',label:'代表者：'+f.representative,patch:{representative:''}});
 const phones = f.phonePatterns?.length ? f.phonePatterns : (f.phonePattern ? [f.phonePattern] : []);
 if (phones.length) out.push({k:'phone',label:'電話番号：'+phones.join('、')+'で始まる',patch:{phonePattern:'',phonePatterns:[]}});
 if (f.industry) out.push({k:'industry',label:'業種名：'+f.industry,patch:{industry:''}});
 for (const [key,label] of [...DIRECTORY_RANGES,['callCount','架電回数']]) {
  const min=f[key+'Min'], max=f[key+'Max'], mode=f[key+'NullMode'];
  if (!filled(min) && !filled(max) && !filled(mode)) continue;
  const name = label.replace(/（千円）$/, '');
  let text;
  if (mode==='only') text = '不明のみ';
  else {
   text = (min!==''?min:'下限なし')+'〜'+(max!==''?max:'上限なし')+(max!==''?(key==='established'?'以下':'未満'):'');
   if (mode==='include') text += '・不明も含める'; else if (mode==='exclude') text += '・不明を除く';
  }
  out.push({k:key,label:name+'：'+text,patch:{[key+'Min']:'',[key+'Max']:'',...(key==='callCount'?{}:{[key+'NullMode']:''})}});
 }
 multi('shareholderType','株主の構成',v=>SHAREHOLDER_LABEL[v]||v);
 if (f.repShareholderMatch) out.push({k:'repShareholderMatch',label:'株主欄に代表者名を含む',patch:{repShareholderMatch:false}});
 multi('dbLabel','企業ラベル');
 if (f.registry) out.push({k:'registry',label:'登記：'+(f.registry==='exclude_closed'?'閉鎖確認済みを除く':nameOf('registry',f.registry)),patch:{registry:''}});
 if (f.addressMatch) out.push({k:'addressMatch',label:'会社・代表者住所：'+(MATCH_LABEL[f.addressMatch]||f.addressMatch),patch:{addressMatch:''}});
 if (f.home) out.push({k:'home',label:'代表者自宅住所：'+(HOME_LABEL[f.home]||f.home),patch:{home:''}});
 multi('callCategory','架電の商材',v=>nameOf('categoriesCall',v));
 multi('callEngagement','架電のタイプ',v=>nameOf('engagements',v));
 multi('callStatus','架電ステータス');
 if (f.lastCallFrom || f.lastCallTo) out.push({k:'lastCall',label:'最終架電日：'+(f.lastCallFrom||'')+'〜'+(f.lastCallTo||''),patch:{lastCallFrom:'',lastCallTo:''}});
 if (f.stage) out.push({k:'stage',label:'対応状況：'+f.stage,patch:{stage:''}});
 if (f.scope) out.push({k:'scope',label:SCOPE_LABEL[f.scope]||f.scope,patch:{scope:''}});
 if (f.nextActionFrom || f.nextActionTo) out.push({k:'nextAction',label:'次回対応日：'+(f.nextActionFrom||'')+'〜'+(f.nextActionTo||''),patch:{nextActionFrom:'',nextActionTo:''}});
 if (f.provider) out.push({k:'provider',label:'データの出所：'+(PROVIDER_LABEL[f.provider]||f.provider),patch:{provider:''}});
 if (f.sourceQuery) out.push({k:'sourceQuery',label:'提供元・ファイル名：'+f.sourceQuery,patch:{sourceQuery:''}});
 return out;
}

// 表に既定で出す列（DIRECTORY_EXPORT_COLUMNS の key）。企業名はいつも左端に固定で出す。
export const DIRECTORY_DEFAULT_COLUMNS = ['prefecture','industry_sub','revenue_k','employee_count','representative','phone','crm_stage','owner_name','next_action_at'];
