import React from 'react';
import { act,create } from 'react-test-renderer';
import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
vi.mock('../../hooks/useIsMobile',()=>({useIsMobile:()=>false}));
vi.mock('../../lib/companyProfileApi',()=>({fetchCompanyProfileStats:vi.fn()}));
vi.mock('../../lib/companyDirectoryApi',()=>({searchCompanyDirectory:vi.fn(),buildDirectoryCsv:vi.fn()}));
vi.mock('./CompanyDirectoryFilters',()=>({default:props=><div data-testid="filters" {...props}/>}));
vi.mock('./CompanyProfileDialog',()=>({default:props=><div data-testid="profile" {...props}/>}));
vi.mock('../database/DatabaseChatPanel',()=>({default:()=>null}));
vi.mock('../database/DatabaseExportColumnModal',()=>({default:props=><div data-testid="export" {...props}/>}));
import { fetchCompanyProfileStats } from '../../lib/companyProfileApi';
import { searchCompanyDirectory,buildDirectoryCsv } from '../../lib/companyDirectoryApi';
import CompanyDirectory from './CompanyDirectory';
let renderer;
const node=id=>renderer.root.findByProps({'data-testid':id});
const button=text=>renderer.root.findAllByType('button').find(n=>n.children.includes(text));
const result=(name,count=51)=>({rows:[{id:name,company_name:name,address_match:'same',revenue_k:0}],count});
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return{promise,resolve,reject};};
beforeEach(()=>{vi.clearAllMocks();fetchCompanyProfileStats.mockResolvedValue({total:512982});searchCompanyDirectory.mockResolvedValue(result('初回'));});
afterEach(()=>{if(renderer)act(()=>renderer.unmount());renderer=null;});
const mount=async()=>{await act(async()=>{renderer=create(<CompanyDirectory isAdmin/>);});};
describe('企業DBの検索を1画面で扱う',()=>{
 it('検索成功後に条件を閉じ、再編集時に同じ条件を保持する',async()=>{
  await mount();expect(node('filters')).toBeDefined();
  await act(async()=>node('filters').props.onChange('addressMatch','same'));
  await act(async()=>node('filters').props.onSearch());
  expect(renderer.root.findAllByProps({'data-testid':'filters'})).toHaveLength(0);
  expect(searchCompanyDirectory.mock.calls.at(-1)[0].addressMatch).toBe('same');
  await act(async()=>button('検索条件を変更').props.onClick());
  expect(node('filters').props.filters.addressMatch).toBe('same');
 });
 it('遅く返った以前の結果で新しい検索を上書きしない',async()=>{
  await mount();const old=deferred(),latest=deferred();
  searchCompanyDirectory.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
  await act(async()=>node('filters').props.onChange('keyword','以前'));
  await act(async()=>node('filters').props.onSearch());
  const signal=searchCompanyDirectory.mock.calls.at(-1)[1];
  await act(async()=>node('filters').props.onChange('keyword','最新'));
  await act(async()=>node('filters').props.onSearch());
  expect(signal.aborted).toBe(true);
  await act(async()=>latest.resolve(result('最新企業',1)));
  await act(async()=>old.resolve(result('古い企業',999)));
  const text=JSON.stringify(renderer.toJSON());expect(text).toContain('最新企業');expect(text).not.toContain('古い企業');
 });
 it('ページ移動は適用済みの条件で行い、編集中の条件を混ぜない',async()=>{
  await mount();await act(async()=>node('filters').props.onChange('keyword','未検索'));
  await act(async()=>button('次へ').props.onClick());
  const f=searchCompanyDirectory.mock.calls.at(-1)[0];expect(f.page).toBe(1);expect(f.keyword).toBe('');
 });
 it('失敗した検索で条件を閉じず、不正な範囲では問い合わせない',async()=>{
  await mount();await act(async()=>node('filters').props.onChange('revenueMin','100'));
  await act(async()=>node('filters').props.onChange('revenueMax','50'));
  await act(async()=>node('filters').props.onSearch());
  expect(searchCompanyDirectory).toHaveBeenCalledTimes(1);expect(node('filters').props.error).toContain('上限');
  await act(async()=>node('filters').props.onChange('revenueMax','200'));
  searchCompanyDirectory.mockRejectedValueOnce(new Error('検索失敗'));
  await act(async()=>node('filters').props.onSearch());
  expect(node('filters')).toBeDefined();expect(JSON.stringify(renderer.toJSON())).toContain('検索失敗');
 });
 it('CSVは最後に成功した検索条件を使う',async()=>{
  await mount();await act(async()=>node('filters').props.onChange('keyword','未検索'));
  await act(async()=>button('検索結果をCSV出力').props.onClick());
  buildDirectoryCsv.mockRejectedValueOnce(new Error('中断'));
  await act(async()=>node('export').props.onConfirm(['company_name']));
  expect(buildDirectoryCsv.mock.calls[0][0].keyword).toBe('');
  expect(buildDirectoryCsv.mock.calls[0][1]).toBe(51);
 });
});
