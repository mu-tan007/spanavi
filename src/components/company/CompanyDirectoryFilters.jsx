import { useEffect, useState } from 'react';
import { Card, Input, Select, Button } from '../ui';
import { color, space, font } from '../../constants/design';
import CategorySearchInput from '../database/CategorySearchInput';
import { fetchCategories, fetchPrefectures, DB_LABEL_OPTIONS } from '../../lib/companyMasterApi';
import { fetchDirectoryLists, fetchDirectoryCallOptions } from '../../lib/companyDirectoryApi';
import { DIRECTORY_RANGES } from '../../utils/companyDirectoryFilters';
import { COMPANY_CRM_STAGES, COMPANY_REGISTRY_STATUSES } from '../../utils/companyProfileIdentity';
import { IMPORT_PROVIDERS } from '../../utils/companyImportFields';
import { CALL_RESULTS } from '../../constants/callResults';

const grid={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:space[3]};
const all={value:'',label:'指定なし'};
const labelStyle={color:color.textMid,fontSize:font.size.sm,fontWeight:font.weight.semibold,marginBottom:4};
const homeOptions=[all,{value:'available',label:'住所あり'},{value:'unknown',label:'未確認'},{value:'conflict',label:'情報の相違あり'}];
function Multi({label,items=[],value=[],onChange}) {
 const options=items.map(item=>typeof item==='string'?{value:item,label:item}:item);
 const counts=new Map();for(const o of options)counts.set(o.label,(counts.get(o.label)||0)+1);
 const duplicated=new Set([...counts].filter(([,count])=>count>1).map(([name])=>name));
 const named=options.map(o=>({...o,name:duplicated.has(o.label)?o.label+' ('+o.value.slice(-6)+')':o.label}));
 // Retain saved selections even when a list is archived or a category disappears.
 for(const selected of value) if(!named.some(o=>o.value===selected)) named.push({value:selected,name:selected});
 return <div><div style={labelStyle}>{label}</div><CategorySearchInput ariaLabel={label} placeholder="入力して複数選択"
  items={named.map(o=>o.name)} value={value.map(v=>named.find(o=>o.value===v)?.name || v)}
  onChange={values=>onChange(values.map(v=>named.find(o=>o.name===v)?.value || v))}/></div>;
}
export default function CompanyDirectoryFilters({filters:f,onChange,onSearch,onReset,loading,error}) {
 const [options,setOptions]=useState({categories:[],prefectures:[],categoriesCall:[],engagements:[],lists:[]});
 const [optionError,setOptionError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();let active=true;
  Promise.allSettled([fetchCategories(),fetchPrefectures(),fetchDirectoryCallOptions('categories',controller.signal),fetchDirectoryCallOptions('engagements',controller.signal),fetchDirectoryLists(controller.signal)])
   .then(results=>{if(!active)return;const keys=['categories','prefectures','categoriesCall','engagements','lists'];
    setOptions(prev=>({...prev,...Object.fromEntries(results.flatMap((r,i)=>r.status==='fulfilled'?[[keys[i],r.value]]:[]))}));
    setOptionError(results.some(r=>r.status==='rejected')?'一部の検索候補を取得できませんでした。再読み込みしてください。':'');});
  return()=>{active=false;controller.abort();};
 },[attempt]);
 const input=(key,label,props={})=><Input key={key} size="sm" label={label} aria-label={label} value={f[key]||''} onChange={e=>onChange(key,e.target.value)} {...props}/>;
 const select=(key,label,items)=><Select key={key} size="sm" label={label} aria-label={label} value={f[key]||''} options={items} onChange={e=>onChange(key,e.target.value)}/>;
 const multi=(key,label,items)=><Multi key={key} label={label} items={items} value={f[key]} onChange={value=>onChange(key,value)}/>;
 const section=(title,children,hint)=><section style={{marginTop:space[4],paddingTop:space[3],borderTop:'1px solid '+color.borderLight}}>
  <div style={{fontWeight:font.weight.bold,color:color.navy,marginBottom:space[2]}}>{title}</div>
  <div style={grid}>{children}</div>{hint&&<p style={{fontSize:font.size.xs,color:color.textMid,marginBottom:0}}>{hint}</p>}</section>;
 const range=(key,label,missing=true)=><div key={key}><div style={labelStyle}>{label}</div>
  <div style={{display:'flex',gap:space[1],alignItems:'center'}}>
   <Input size="sm" type="number" aria-label={label+'の下限（以上）'} placeholder="下限（以上）" value={f[key+'Min']} disabled={f[key+'NullMode']==='only'} onChange={e=>onChange(key+'Min',e.target.value)}/>
   <span>〜</span>
   <Input size="sm" type="number" aria-label={label+(key==='established'?'の上限（以下）':'の上限（未満）')} placeholder={key==='established'?'上限（以下）':'上限（未満）'} value={f[key+'Max']} disabled={f[key+'NullMode']==='only'} onChange={e=>onChange(key+'Max',e.target.value)}/>
  </div>
  {missing&&<Select size="sm" aria-label={label+'が不明の企業'} value={f[key+'NullMode']} onChange={e=>onChange(key+'NullMode',e.target.value)} containerStyle={{marginTop:4}}
   options={[{value:'',label:'範囲指定時は不明を除く'},{value:'include',label:'範囲内 ＋ 不明も含める'},{value:'exclude',label:'不明を除く'},{value:'only',label:'不明のみ'}]}/>}
 </div>;
 const majors=[...new Set(options.categories.map(c=>c.daibunrui))];
 const subs=[...new Set(options.categories.filter(c=>!f.daibunrui.length || f.daibunrui.includes(c.daibunrui)).map(c=>c.saibunrui))];
 return <Card style={{marginBottom:space[3]}}>
  <form onSubmit={e=>{e.preventDefault();onSearch();}}>
   <div style={grid}>
    <Input size="sm" label="キーワード" aria-label="企業を検索" placeholder="企業名・電話・住所など／空白区切り" value={f.keyword} onChange={e=>onChange('keyword',e.target.value)}/>
    {select('logic','複数キーワードの一致方法',[{value:'AND',label:'すべて含む（AND）'},{value:'OR',label:'いずれかを含む（OR）'}])}
    {input('identifier','法人番号・提供元の企業コード',{placeholder:'完全一致・先頭の0も入力'})}
    {input('representative','代表者名')}
   </div>
   <div style={{display:'flex',gap:space[2],marginTop:space[3]}}><Button type="submit" loading={loading}>検索</Button><Button type="button" variant="outline" onClick={onReset}>条件を解除</Button></div>
   {section('業種・事業内容',[
    multi('daibunrui','業種大分類',majors),
    multi('saibunrui','業種細分類',subs),
    input('industry','業種名を含む'),input('business','事業内容を含む'),
   ],'提供元ごとの分類コードはそのまま保持します。分類体系の異なるリストは「業種名」「事業内容」でも検索できます。')}
   {section('地域・住所',[
    multi('prefecture','都道府県',options.prefectures),
    <Input key="city" size="sm" label="市区町村・会社住所" aria-label="市区町村・会社住所" value={f.cities.length?f.cities.join('、'):f.city} onChange={e=>onChange('city',e.target.value)}/>,
    input('phonePattern','電話番号の前方一致',{placeholder:'03, 06 など'}),
    select('addressMatch','会社住所と代表者自宅住所',[all,{value:'same',label:'一致'},{value:'different',label:'不一致'},{value:'unknown',label:'判定不可（住所不足・相違）'}]),
    select('home','代表者自宅住所の確認状況',homeOptions),
   ],'企業カルテの会社住所と、現在の代表者に紐付く自宅住所を比較します。どちらかの住所が不明な企業は「判定不可」です。')}
   {section('売上・規模',DIRECTORY_RANGES.map(([key,label])=>range(key,label)),'金額は千円。上限は「未満」（設立年のみ「以下」）、下限は「以上」です。欠損値と0を区別します。')}
   {section('企業の特徴',[
    multi('shareholderType','株主の構成（株主欄から判定）',[{value:'individual',label:'個人のみ'},{value:'corporate',label:'法人のみ'},{value:'mixed',label:'個人・法人混在'},{value:'empty',label:'不明'}]),
    <Select key="repShareholderMatch" size="sm" label="代表者と株主" aria-label="代表者と株主" value={f.repShareholderMatch?'yes':''} onChange={e=>onChange('repShareholderMatch',e.target.value==='yes')} options={[all,{value:'yes',label:'株主欄に代表者名を含む'}]}/>,
    multi('dbLabel','企業ラベル',DB_LABEL_OPTIONS.map(v=>typeof v==='string'?v:{value:v.value,label:v.label})),
    select('registry','登記の確認状況',[all,{value:'exclude_closed',label:'閉鎖確認済みを除く'},...COMPANY_REGISTRY_STATUSES]),
   ],'登記状況は登録・確認済みの情報で絞り込みます。法人番号があるだけでは存続確認済みにはなりません。')}
   {section('架電状況',[
    multi('listIds','含まれる架電リスト',options.lists.map(l=>({value:l.id,label:l.name+(l.is_archived?'（アーカイブ）':'')}))),
    multi('callCategory','架電の商材',options.categoriesCall.map(c=>({value:c.id,label:c.name}))),
    multi('callEngagement','架電のタイプ',options.engagements.filter(e=>!f.callCategory.length||f.callCategory.includes(e.category_id)||f.callEngagement.includes(e.id)).map(e=>({value:e.id,label:e.name}))),
    multi('callStatus','架電ステータス',['未架電','未登録',...CALL_RESULTS.map(c=>c.label)]),
    range('callCount','架電回数',false),input('lastCallFrom','最終架電日（開始）',{type:'date'}),input('lastCallTo','最終架電日（終了）',{type:'date'}),
   ],'選択したリスト・商材・タイプ内で集計します。ステータスは各リストの最新履歴のいずれかに該当。未登録はどの架電リストにもない企業です。')}
   {section('担当・次回対応',[
    select('stage','対応状況',[all,...COMPANY_CRM_STAGES.map(value=>({value,label:value}))]),input('owner','担当者名'),
    select('scope','確認・対応が必要な企業',[all,{value:'due',label:'次回対応の期限が到来'},{value:'review',label:'名寄せ・情報の確認が必要'}]),
    input('nextActionFrom','次回対応日（開始）',{type:'date'}),input('nextActionTo','次回対応日（終了）',{type:'date'}),
   ])}
   {section('取込元',[
    select('provider','データの出所',[all,...IMPORT_PROVIDERS,{value:'unknown',label:'出所未設定（過去の取込など）'}]),
    input('sourceQuery','提供元・ファイル名を含む',{placeholder:'クライアント名、元ファイル名など'}),
   ])}
   {optionError&&<p role="alert" style={{color:color.danger}}>{optionError} <Button type="button" size="sm" onClick={()=>setAttempt(n=>n+1)}>候補を再読み込み</Button></p>}
   {error&&<p role="alert" style={{color:color.danger}}>{error}</p>}
   <div style={{display:'flex',gap:space[2],marginTop:space[4],alignItems:'center'}}>
    <Button type="submit" loading={loading}>この条件で検索</Button>
    <Button type="button" variant="outline" onClick={onReset}>条件を解除</Button>
    <span style={{fontSize:font.size.xs,color:color.textMid}}>異なる条件はすべて満たす企業を検索します。</span>
   </div>
  </form>
 </Card>;
}
