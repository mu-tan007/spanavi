import { describe,it,expect,vi,beforeEach } from 'vitest';
vi.mock('./supabase',()=>({supabase:{rpc:vi.fn()}}));
import { supabase } from './supabase';
import { buildDirectoryCsv,searchCompanyDirectory } from './companyDirectoryApi';
import { DIRECTORY_FILTERS,DIRECTORY_EXPORT_COLUMNS,directoryCsvQuote,normalizeDirectoryFilters,validateDirectoryFilters } from '../utils/companyDirectoryFilters';
beforeEach(()=>vi.clearAllMocks());
describe('同じ企業ID・適用した条件で検索とCSVを揃える',()=>{
 it('新規インポートも対象とする共通検索RPCに、条件とページを渡す',async()=>{
  supabase.rpc.mockResolvedValue({data:{rows:[],count:0}});
  await searchCompanyDirectory({...DIRECTORY_FILTERS,addressMatch:'same',provider:'tdb',page:2});
  expect(supabase.rpc).toHaveBeenCalledWith('search_company_directory',expect.objectContaining({p_offset:100,p_limit:50,p_filters:expect.objectContaining({addressMatch:'same',provider:'tdb'})}));
 });
 it('1000件を超えても元の検索条件を保持し、企業ID順に全件出力する',async()=>{
  const f={...DIRECTORY_FILTERS,sourceQuery:'client.csv',revenueMin:'1000'};
  supabase.rpc.mockImplementation((_,args)=>{
   const rows=Array.from({length:args.p_offset===2000?3:1000},(_,i)=>({id:String(args.p_offset+i),company_name:'A'+i,phone:'0312345678',revenue_k:0}));
   f.sourceQuery='入力中の別条件';
   return Promise.resolve({data:{rows,count:null}});
  });
  const csv=await buildDirectoryCsv(f,2003,['company_name','revenue_k']);
  expect(csv.split('\r\n')).toHaveLength(2004);
  expect(supabase.rpc.mock.calls.every(([,a])=>a.p_filters.sourceQuery==='client.csv'&&a.p_filters.sortCol==='id'&&a.p_include_count===false)).toBe(true);
 });
 it('途中の件数不足・重複・APIエラーでは部分CSVを納品しない',async()=>{
  supabase.rpc.mockResolvedValue({data:{rows:[{id:'1'}]}});
  await expect(buildDirectoryCsv(DIRECTORY_FILTERS,2,['company_name'])).rejects.toThrow('件数');
  supabase.rpc.mockResolvedValue({data:{rows:[{id:'1'},{id:'1'}]}});
  await expect(buildDirectoryCsv(DIRECTORY_FILTERS,2,['company_name'])).rejects.toThrow('変更');
  supabase.rpc.mockResolvedValue({error:{message:'取得失敗'}});
  await expect(buildDirectoryCsv(DIRECTORY_FILTERS,2,['company_name'])).rejects.toMatchObject({message:'取得失敗'});
 });
 it('出力中断を尊重する',async()=>{
  const controller=new AbortController();controller.abort();
  await expect(buildDirectoryCsv(DIRECTORY_FILTERS,2,['company_name'],{signal:controller.signal})).rejects.toThrow('中断');
  expect(supabase.rpc).not.toHaveBeenCalled();
 });
 it('納品標準の14列を保持し、0と欠損を区別し、CSV数式を無効化する',()=>{
  expect(DIRECTORY_EXPORT_COLUMNS.filter(c=>c.defaultExport).map(c=>c.label)).toEqual(['企業名','tsr_id','都道府県','市区町村','住所','電話番号','売上千円','従業員数','設立年','代表者','業種','事業内容','株主','役員']);
  expect(directoryCsvQuote(0)).toBe('"0"');expect(directoryCsvQuote(null)).toBe('""');
  expect(directoryCsvQuote('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
  expect(directoryCsvQuote(-100)).toBe('"-100"');expect(directoryCsvQuote('A,\nB')).toBe('"A,\nB"');
 });
 it('AI・保存条件の複数語を表示に戻し、不正な期間や範囲を拒否する',()=>{
  const f=normalizeDirectoryFilters({keywords:['建設','工事'],cities:['港区','中央区'],queryEmbedding:[1,2]});
  expect(f.keyword).toBe('建設 工事');expect(f.cities).toEqual(['港区','中央区']);expect(f.queryEmbedding).toBeUndefined();
  expect(validateDirectoryFilters({...f,revenueMin:'100',revenueMax:'100'})).toContain('上限');
  expect(validateDirectoryFilters({...f,lastCallFrom:'2026-09-10',lastCallTo:'2026-09-01'})).toContain('終了日');
 });
});
