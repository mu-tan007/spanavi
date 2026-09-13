import React from 'react';
import {act,create} from 'react-test-renderer';
import {describe,it,expect,vi,afterEach} from 'vitest';
vi.mock('../../hooks/useIsMobile',()=>({useIsMobile:()=>false}));
vi.mock('../../lib/companyMasterApi',()=>({DB_LABEL_OPTIONS:['M&Aニーズあり','買収候補先']}));
vi.mock('../../lib/companyDirectoryApi',()=>({fetchDirectoryValues:vi.fn(),setDirectoryLabel:vi.fn()}));
import {fetchDirectoryValues,setDirectoryLabel} from '../../lib/companyDirectoryApi';
import CompanyDirectoryValues from './CompanyDirectoryValues';
let renderer;
afterEach(()=>{if(renderer)act(()=>renderer.unmount());vi.clearAllMocks();});
describe('共通の属性・ラベル',()=>{
 it('検索と同じ属性・出典・ゼロを表示し、ラベルを企業IDに保存する',async()=>{
  fetchDirectoryValues.mockResolvedValue({values:{revenue_k:0,tsr_id:'000123'},sources:{revenue_k:{file:'client.csv',row:9}},labels:[]});
  const onChanged=vi.fn();
  await act(async()=>{renderer=create(<CompanyDirectoryValues companyId="canonical-id" onChanged={onChanged}/>);});
  const text=JSON.stringify(renderer.toJSON());expect(text).toContain('client.csv');expect(text).toContain('000123');expect(text).toContain('"0"');
  setDirectoryLabel.mockResolvedValue({values:{revenue_k:0},sources:{},labels:['M&Aニーズあり']});
  await act(async()=>renderer.root.findAllByType('button').find(n=>n.children.includes('M&Aニーズあり')).props.onClick());
  expect(setDirectoryLabel).toHaveBeenCalledWith('canonical-id','M&Aニーズあり',true);
  expect(onChanged).toHaveBeenCalledOnce();
 });
 it('別の企業を開いた後に以前の属性が遅れて返っても表示しない',async()=>{
  let resolveOld;fetchDirectoryValues.mockReturnValueOnce(new Promise(r=>{resolveOld=r;}));
  await act(async()=>{renderer=create(<CompanyDirectoryValues companyId="old"/>);});
  fetchDirectoryValues.mockResolvedValueOnce({values:{tsr_id:'新しい番号'},sources:{},labels:[]});
  await act(async()=>renderer.update(<CompanyDirectoryValues companyId="new"/>));
  await act(async()=>resolveOld({values:{tsr_id:'以前の番号'},sources:{},labels:[]}));
  const text=JSON.stringify(renderer.toJSON());expect(text).toContain('新しい番号');expect(text).not.toContain('以前の番号');
 });
});
