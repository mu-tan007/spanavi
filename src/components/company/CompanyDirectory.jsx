import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Download, SlidersHorizontal } from 'lucide-react';
import { Button, Select, Card, Badge, DataTable } from '../ui';
import { color, space, font } from '../../constants/design';
import { fetchCompanyProfileStats } from '../../lib/companyProfileApi';
import { searchCompanyDirectory, buildDirectoryCsv } from '../../lib/companyDirectoryApi';
import { DIRECTORY_FILTERS, DIRECTORY_EXPORT_COLUMNS, normalizeDirectoryFilters, validateDirectoryFilters, activeDirectoryConditionCount, directoryConditionSummary } from '../../utils/companyDirectoryFilters';
import CompanyDirectoryFilters from './CompanyDirectoryFilters';
import CompanyProfileDialog from './CompanyProfileDialog';
import DatabaseChatPanel from '../database/DatabaseChatPanel';
import DatabaseExportColumnModal from '../database/DatabaseExportColumnModal';
const matchLabels={same:'一致',different:'不一致',unknown:'判定不可'};
const number=(r,key)=>r[key]==null?'—':Number(r[key]).toLocaleString('ja-JP');
const columns=[
 {key:'company_name',label:'企業名',width:230,align:'left',mobilePrimary:true},
 {key:'business_description',label:'事業内容',width:190,align:'left'},{key:'address',label:'会社住所',width:245,align:'left'},
 ...[['revenue_k','売上高（千円）',120],['net_income_k','当期純利益（千円）',140],['employee_count','従業員数',90]].map(([key,label,width])=>({key,label,width,align:'right',render:r=>number(r,key)})),
 {key:'representative',label:'代表者',width:100,align:'left'},{key:'representative_age',label:'代表者年齢',width:90,align:'right',render:r=>number(r,'representative_age')},
 {key:'phone',label:'電話番号',width:130,align:'left'},{key:'industry',label:'業種',width:160,align:'left',render:r=>r.industry||r.industry_sub||'—'},
 {key:'address_match',label:'会社・代表者住所',width:130,align:'center',render:r=><Badge variant={r.address_match==='same'?'success':'neutral'}>{matchLabels[r.address_match]}</Badge>},
 {key:'crm_stage',label:'対応状況',width:100,align:'center'},{key:'owner_name',label:'担当者',width:100,align:'left'},
 {key:'next_action_at',label:'次回対応',width:155,align:'left',render:r=>r.next_action_at?new Date(r.next_action_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'—'},
];
export default function CompanyDirectory({revision=0,isAdmin=false,aiOpen=false,onCloseAi}) {
 const [draft,setDraft]=useState(DIRECTORY_FILTERS),[request,setRequest]=useState({filters:DIRECTORY_FILTERS,collapse:false});
 const [result,setResult]=useState({rows:[],count:null,filters:DIRECTORY_FILTERS});
 const [stats,setStats]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [validation,setValidation]=useState(''),[expanded,setExpanded]=useState(true),[attempt,setAttempt]=useState(0),[target,setTarget]=useState(null);
 const [columnPicker,setColumnPicker]=useState(false),[exporting,setExporting]=useState(false),[exportProgress,setExportProgress]=useState(0),[exportError,setExportError]=useState('');
 const exportController=useRef(null),active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;exportController.current?.abort();};},[]);
 useEffect(()=>{
  const controller=new AbortController();let current=true;
  fetchCompanyProfileStats(controller.signal).then(data=>{if(current)setStats(data);}).catch(e=>{if(current)setError(e.message);});
  return()=>{current=false;controller.abort();};
 },[revision,attempt]);
 useEffect(()=>{
  const controller=new AbortController();let current=true;setLoading(true);setError('');
  searchCompanyDirectory(request.filters,controller.signal).then(data=>{
   if(current){setResult({...data,filters:request.filters});if(request.collapse)setExpanded(false);}
  }).catch(e=>{if(current)setError(e.message||'企業一覧を取得できませんでした');}).finally(()=>{if(current)setLoading(false);});
  return()=>{current=false;controller.abort();};
 },[request,revision,attempt]);
 const change=(key,value)=>setDraft(prev=>{
  const next={...prev,[key]:value};
  if(key==='keyword')next.keywords=[];
  if(key==='city'){next.cities=value.split(/[,、]/).map(s=>s.trim()).filter(Boolean);next.city=next.cities.length>1?'':value;if(next.cities.length<2)next.cities=[];}
  if(key==='phonePattern')next.phonePatterns=[];
  if(key==='daibunrui')next.saibunrui=[];
  if(key.endsWith('NullMode')&&value==='only'){next[key.replace('NullMode','Min')]='';next[key.replace('NullMode','Max')]='';}
  return next;
 });
 const apply=filters=>{
  const normalized=normalizeDirectoryFilters({...filters,page:0,pageSize:50}),message=validateDirectoryFilters(normalized);setValidation(message);
  if(message){setExpanded(true);return;}
  setDraft(normalized);setRequest({filters:normalized,collapse:true});
 };
 const clear=()=>{setDraft(DIRECTORY_FILTERS);setValidation('');setRequest({filters:DIRECTORY_FILTERS,collapse:false});};
 const page=index=>setRequest({filters:{...result.filters,page:index},collapse:false});
 const exportCsv=async keys=>{
  setColumnPicker(false);setExporting(true);setExportProgress(0);setExportError('');
  const controller=new AbortController();exportController.current=controller;
  try{
   const csv=await buildDirectoryCsv(result.filters,result.count,keys,{signal:controller.signal,onProgress:n=>{if(active.current)setExportProgress(n);}});
   if(!active.current||controller.signal.aborted)return;
   const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');
   a.href=url;a.download='企業リスト_'+new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'})+'.csv';a.click();URL.revokeObjectURL(url);
  }catch(e){if(active.current)setExportError(controller.signal.aborted?'CSV出力を中断しました。':e.message);}
  finally{if(active.current)setExporting(false);exportController.current=null;}
 };
 const count=result.count,conditionCount=activeDirectoryConditionCount(result.filters);
 return <>
  <div style={{display:'flex',gap:space[3],alignItems:'center',flexWrap:'wrap',marginBottom:space[3]}}>
   <span style={{color:color.textMid,fontSize:font.size.sm}}>登録企業 <strong style={{color:color.navy,fontSize:font.size.xl}}>{stats?stats.total.toLocaleString():'—'}</strong> 社</span>
   <Button size="sm" variant="outline" iconLeft={<SlidersHorizontal size={15}/>} aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'検索条件を閉じる':'検索条件を変更'}</Button>
   <span style={{color:color.textMid,fontSize:font.size.sm}}>{conditionCount?conditionCount+'項目の条件を適用':'すべての企業'}</span>
   <Button size="sm" variant="ghost" aria-label="企業一覧を再読み込み" iconLeft={<RefreshCw size={15}/>} onClick={()=>setAttempt(n=>n+1)} disabled={loading}>再読み込み</Button>
   {isAdmin&&<Button size="sm" variant="outline" iconLeft={<Download size={15}/>} disabled={loading||!!error||!count||exporting} onClick={()=>setColumnPicker(true)} style={{marginLeft:'auto'}}>検索結果をCSV出力</Button>}
  </div>
  {expanded&&<CompanyDirectoryFilters filters={draft} onChange={change} onSearch={()=>apply(draft)} onReset={clear} loading={loading} error={validation}/>}
  {!expanded&&<div style={{display:'flex',gap:space[1],flexWrap:'wrap',marginBottom:space[3]}}>{directoryConditionSummary(result.filters).map((label,i)=><Badge key={i} variant="neutral">{label}</Badge>)}</div>}
  {exporting&&<Card><span role="status">CSV出力用に {exportProgress.toLocaleString()} 社を取得しました。</span><Button size="sm" variant="ghost" onClick={()=>exportController.current?.abort()}>出力を中断</Button></Card>}
  {exportError&&<p role="alert" style={{color:color.danger}}>{exportError}</p>}
  <div style={{display:'flex',gap:space[3],alignItems:'center',justifyContent:'space-between',marginBottom:space[2],flexWrap:'wrap'}}>
   <span role="status" style={{color:color.textMid,fontSize:font.size.sm}}>{loading?'検索中…':count==null?'—':count.toLocaleString()+'社 ／ '+(result.filters.page+1)+' / '+Math.max(1,Math.ceil(count/50))+'ページ'}</span>
   <div style={{display:'flex',gap:space[2],alignItems:'center'}}>
    <Select size="sm" aria-label="企業一覧の並び順" value={result.filters.sortCol+':'+result.filters.sortDir} disabled={loading}
     onChange={e=>{const [sortCol,sortDir]=e.target.value.split(':');const filters={...result.filters,sortCol,sortDir,page:0};setDraft(prev=>({...prev,sortCol,sortDir}));setRequest({filters,collapse:false});}}
     options={[{value:'company_name:asc',label:'企業名順'},{value:'revenue_k:desc',label:'売上高が大きい順'},{value:'net_income_k:desc',label:'当期純利益が大きい順'},{value:'employee_count:desc',label:'従業員数が多い順'},{value:'representative_age:desc',label:'代表者年齢が高い順'},{value:'next_action_at:asc',label:'次回対応が近い順'}]}/>
    <Button size="sm" variant="outline" disabled={loading||!!error||result.filters.page===0} onClick={()=>page(result.filters.page-1)}>前へ</Button>
    <Button size="sm" variant="outline" disabled={loading||!!error||count==null||(result.filters.page+1)*50>=count} onClick={()=>page(result.filters.page+1)}>次へ</Button>
   </div>
  </div>
  <DataTable ariaLabel="企業一覧" loading={loading} error={error} rows={result.rows} rowKey="id" fillWidth height={expanded?440:'calc(100vh - 290px)'} showCount={false}
   onRowClick={row=>setTarget({companyId:row.id})} emptyMessage="条件に合う企業はありません" rowAccent={row=>row.needs_review?'warn':null} columns={columns}/>
  {target&&<CompanyProfileDialog target={target} onClose={()=>setTarget(null)} onChanged={()=>setAttempt(n=>n+1)} onSelectCompany={companyId=>setTarget({companyId})}/>}
  {columnPicker&&<DatabaseExportColumnModal columns={DIRECTORY_EXPORT_COLUMNS} totalCount={count} onCancel={()=>setColumnPicker(false)} onConfirm={exportCsv}/>}
  <DatabaseChatPanel open={aiOpen} onClose={onCloseAi} baseFilters={draft} onApplyFilters={filters=>{apply(filters);onCloseAi?.();}}/>
 </>;
}
