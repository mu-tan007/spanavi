import { useEffect, useRef, useState } from 'react';
import { Button, Card, DataTable } from '../ui';
import { color, space, font } from '../../constants/design';
import { fetchDirectoryValues, setDirectoryLabel } from '../../lib/companyDirectoryApi';
import { DIRECTORY_EXPORT_COLUMNS } from '../../utils/companyDirectoryFilters';
import { DB_LABEL_OPTIONS } from '../../lib/companyMasterApi';

const excluded=new Set(['id','company_name','address','prefecture','city','postal_code','phone','representative','corporate_number','business_description','crm_stage','owner_name','address_match','next_action_at','registry_status']);
export default function CompanyDirectoryValues({companyId,onChanged}) {
 const [data,setData]=useState(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false);
 const activeId=useRef(companyId);activeId.current=companyId;
 useEffect(()=>{
  let active=true;const controller=new AbortController();activeId.current=companyId;setData(null);setError('');setBusy(false);
  fetchDirectoryValues(companyId,controller.signal).then(value=>{if(active)setData(value);}).catch(e=>{if(active)setError(e.message);});
  return()=>{active=false;controller.abort();activeId.current=null;};
 },[companyId,attempt]);
 const toggle=async label=>{
  const id=companyId;setBusy(true);setError('');
  try{
   const next=await setDirectoryLabel(id,label,!data.labels?.includes(label));
   if(activeId.current===id){setData(next);onChanged?.();}
  }catch(e){if(activeId.current===id)setError(e.message);}
  finally{if(activeId.current===id)setBusy(false);}
 };
 const rows=DIRECTORY_EXPORT_COLUMNS.filter(c=>!excluded.has(c.key)&&data?.values?.[c.key]!=null&&data.values[c.key]!=='').map(c=>{
  const value=data.values[c.key],source=data.sources?.[c.key];
  return {id:c.key,label:c.label,value:typeof value==='number'?value.toLocaleString('ja-JP'):value,
   source:[source?.provider,source?.file,source?.row?source.row+'行目':''].filter(Boolean).join(' ／ ')||'登録情報'};
 });
 return <Card title="企業の規模・属性" style={{marginTop:space[3]}}>
  {error&&<p role="alert" style={{color:color.danger}}>{error} <Button size="sm" variant="outline" onClick={()=>setAttempt(n=>n+1)}>再読み込み</Button></p>}
  {!data&&!error&&<p role="status">企業の属性を読み込んでいます…</p>}
  {data&&<>
   <div style={{display:'flex',alignItems:'center',gap:space[2],flexWrap:'wrap',marginBottom:space[3]}}>
    <span style={{color:color.textMid,fontSize:font.size.sm}}>企業ラベル</span>
    {DB_LABEL_OPTIONS.map(label=><Button key={label} size="sm" variant={data.labels?.includes(label)?'primary':'outline'}
     aria-pressed={!!data.labels?.includes(label)} disabled={busy} onClick={()=>toggle(label)}>{label}</Button>)}
   </div>
   <DataTable ariaLabel="検索に使う企業の属性" rows={rows} rowKey="id" height={300} emptyMessage="規模・属性の登録情報はありません"
    columns={[{key:'label',label:'項目',width:175,align:'left'},{key:'value',label:'値',width:320,align:'left'},{key:'source',label:'出典',width:400,align:'left'}]}/>
   <p style={{fontSize:font.size.xs,color:color.textMid,marginBottom:0}}>検索・CSVで使う値です。新たな取込で値がある項目を優先し、空欄は既存情報で補います。取り込んだ元の値は「出典・名寄せ」に残ります。</p>
  </>}
 </Card>;
}
