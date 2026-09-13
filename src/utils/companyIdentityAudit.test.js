import { describe, expect, it } from 'vitest';
import { auditIdentities, prepareIdentity, corporateNumber } from '../../scripts/lib/companyIdentity.mjs';

const base={company:'株式会社テスト',representative:'山田 太郎',phone:'03-1234-5678',address:'東京都千代田区丸の内1-2-3'};
const row=(id,patch={})=>prepareIdentity({id,...base,...patch},'calls');
describe('企業名寄せ集計の誤統合防止',()=>{
  it('同名でも他の識別情報が違う企業を別会社として数える',()=>{
    const result=auditIdentities([row('a'),row('b',{representative:'別人',phone:'03-9999-0000',address:'大阪府大阪市中央区本町2-3-4'})]);
    expect(result.unique).toBe(2);
  });
  it.each(['representative','phone','address'])('会社名と%sの一致で表記ゆれを含めて名寄せ',field=>{
    const second=row('b',{company:'(株) テスト',representative:'別人',phone:'03-9999-0000',address:'大阪府大阪市中央区本町2-3-4',[field]:base[field]});
    expect(auditIdentities([row('a'),second]).unique).toBe(1);
  });
  it('欠損同士、市区町村だけの住所、住所コードを一致根拠にしない',()=>{
    const incomplete=id=>row(id,{representative:'不明',phone:'00000000000',address:'東京都千代田区'});
    expect(auditIdentities([incomplete('a'),incomplete('b')]).unique).toBe(2);
    expect(auditIdentities([incomplete('a')]).insufficient).toBe(1);
  });
  it('法人番号は13桁とチェックデジットを確認する',()=>{
    expect(corporateNumber('8700110005901')).toBe('8700110005901');
    expect(corporateNumber('1700110005901')).toBe('');
    expect(corporateNumber('700110005901')).toBe('');
  });
  it('異なる法人番号を持つグループでは、番号のない中間レコードを推測で割り当てない',()=>{
    const a=row('a',{memo:JSON.stringify({'法人番号':'8700110005901'})});
    const b=row('b',{memo:JSON.stringify({'法人番号':'9700110005900'})});
    expect(b.corp).not.toBe('');
    const result=auditIdentities([a,row('unknown'),b,{...a,id:'a-copy'}]);
    expect(result.candidateUnique).toBe(1);
    expect(result.unique).toBe(3);
    expect(result.conflictGroups).toBe(1);
  });
});
