import { supabase } from './supabase';
import { getOrgId } from './orgContext';
import { DIRECTORY_EXPORT_COLUMNS, directoryCsvQuote } from '../utils/companyDirectoryFilters';
export async function searchCompanyDirectory(filters, signal, includeCount = true) {
 let query = supabase.rpc('search_company_directory', { p_filters: filters, p_offset:(filters.page||0)*(filters.pageSize||50),
  p_limit: filters.pageSize||50,p_include_count:includeCount });
 if (signal) query=query.abortSignal(signal);
 const {data,error}=await query; if(error) throw error; return data;
}
export async function fetchDirectoryLists(signal) {
 const rows=[],orgId=getOrgId();
 for(let offset=0;;offset+=500){
  const {data,error}=await supabase.from('call_lists').select('id,name,is_archived').eq('org_id',orgId).order('name').order('id').range(offset,offset+499).abortSignal(signal);
  if(error) throw error; rows.push(...(data||[]));if(!data||data.length<500)return rows;
 }
}
export async function fetchDirectoryCallOptions(kind,signal) {
 const query=kind==='categories'?supabase.from('business_categories').select('id,name').eq('is_active',true):supabase.from('engagements').select('id,name,category_id').eq('status','active');
 const {data,error}=await query.eq('org_id',getOrgId()).order('display_order').abortSignal(signal);
 if(error)throw error;return data||[];
}
export async function fetchDirectoryValues(companyId,signal) {
 let q=supabase.rpc('get_company_directory_values',{p_company_id:companyId});
 if(signal) q=q.abortSignal(signal);
 const {data,error}=await q; if(error) throw error; return data;
}
export async function setDirectoryLabel(companyId,label,enabled) {
 const {data,error}=await supabase.rpc('set_company_directory_label',{p_company_id:companyId,p_label:label,p_enabled:enabled});
 if(error) throw error; return data;
}
export async function buildDirectoryCsv(filters,count,keys,{signal,onProgress}={}) {
 const columns=DIRECTORY_EXPORT_COLUMNS.filter(c=>keys.includes(c.key));
 if(!columns.length) throw new Error('出力する列を選択してください。');
 const lines=[columns.map(c=>directoryCsvQuote(c.label)).join(',')], seen=new Set();
 const exportFilters={...filters,sortCol:'id',sortDir:'asc',pageSize:1000};
 for(let page=0; seen.size<count;page++) {
  if(signal?.aborted) throw new Error('CSV出力を中断しました。');
  const result=await searchCompanyDirectory({...exportFilters,page},signal,false);
  for(const row of result.rows) {
   if(seen.has(row.id)) throw new Error('出力中に企業情報が変更されました。再検索してから出力してください。');
   seen.add(row.id); lines.push(columns.map(c=>directoryCsvQuote(c.get?c.get(row):row[c.key])).join(','));
  }
  onProgress?.(seen.size);
  if(result.rows.length<1000) break;
 }
 if(seen.size!==count) throw new Error('検索時と出力時の件数が変わりました。再検索してから出力してください。');
 return '\uFEFF'+lines.join('\r\n');
}
