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
