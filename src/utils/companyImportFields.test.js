import { describe, it, expect } from 'vitest';
import { STANDARD_COMPANY_FIELDS as fields, detectCompanyImportMapping, validateCompanyImportMapping, normalizeCompanyImportRow,
  companyImportTemplateSettings, applyCompanyImportTemplate, normalizeImportPhone, selectCompanyImportHeader, guessImportProvider } from './companyImportFields';
import { parseImportFile, parseDelimitedText } from '../components/views/csvImportUtils';

describe('企業DB・架電リスト共通の列マッピング', () => {
  it('全角の提供元コードでも出所を認識する', () => {
    expect(guessImportProvider(['企業名','ＴＤＢ企業コード'])).toBe('tdb');
    expect(guessImportProvider(['企業名','ＴＳＲコード'])).toBe('tsr');
  });
  it('クライアント・英語の列名と提供元固有の番号をTSRコードに混ぜない', () => {
    const m=detectCompanyImportMapping(['Company Name','Phone Number','Company Address','企業コード','業種細分類'],'client');
    expect(m.map(x=>x.key)).toEqual(['company_name','phone','address','source_company_code','industry_sub']);
    const row=normalizeCompanyImportRow(['A社','03-1234-5678','東京都港区1-2-3','000012','製造'],m,fields);
    expect(row.source_company_code).toBe('000012'); expect(row.industry).toBe('製造'); expect(row.tsr_code).toBeUndefined();
  });
  it('重複した列・別名の衝突・旧住所を黙って現在値にしない', () => {
    const m=detectCompanyImportMapping(['会社名','企業名','住所（旧）','連絡先'],'other',[
      ...fields,{key:'custom_contact',label:'連絡先',aliases:[]},{key:'custom_phone',label:'連絡先2',aliases:['連絡先']},
    ]);
    expect(m.map(x=>x.key)).toEqual(['','','','']); expect(m[0].needsChoice).toBe(true); expect(m[3].candidates).toHaveLength(2);
  });
  it('角括弧・末尾に明示された金額の単位も認識する', () => {
    for(const h of ['売上高[百万円]','売上高千円']) {
      const m=detectCompanyImportMapping(['企業名',h],'other');expect(m[1].key).toBe('revenue_k');expect(m[1].unitConfirmed).toBe(true);
    }
  });
  it('TSRとTDBの同名コード・金額を出所別に分ける', () => {
    const headers = ['企業名','企業コード','売上高','資本金'];
    for (const provider of ['tsr','tdb']) {
      const mapping = detectCompanyImportMapping(headers, provider);
      expect(validateCompanyImportMapping(headers, mapping, fields, provider)).toHaveLength(2);
      mapping.filter(m => m.unit).forEach(m => { m.unitConfirmed = true; });
      expect(validateCompanyImportMapping(headers, mapping, fields, provider)).toEqual([]);
      const row = normalizeCompanyImportRow(['架空テスト株式会社','000001','12','30'], mapping, fields);
      expect(row[`${provider}_code`]).toBe('000001');
      expect(row.revenue_k).toBe(provider === 'tsr' ? 12 : 12000);
      expect(row.capital_k).toBe(provider === 'tsr' ? 30 : 300);
    }
  });
  it('原本の明示単位を優先し、千円へ換算する', () => {
    for (const [unit, expected] of [['円', 3],['千円',3000],['万円',30000],['百万円',3000000],['億円',300000000]]) {
      const h = ['企業名',`売上高（${unit}）`], m = detectCompanyImportMapping(h, 'tdb');
      expect(validateCompanyImportMapping(h, m, fields, 'tdb')).toEqual([]);
      expect(normalizeCompanyImportRow(['検証社','３，０００'], m, fields).revenue_k).toBe(expected);
    }
  });
  it('会社住所・代表者氏名・自宅住所を取り違えない', () => {
    const h = ['企業名','代表者現住所','代表者','所在地'];
    const m = detectCompanyImportMapping(h, 'client');
    expect(m.map(f => f.key)).toEqual(['company_name','representative_address','representative','address']);
    const r = normalizeCompanyImportRow(['検証社','東京都港区1-1','検証太郎','大阪府大阪市1-1'], m, fields);
    expect(r.address).toBe('大阪府大阪市1-1'); expect(r.representative_address).toBe('東京都港区1-1');
  });
  it('列の並び替え後も見出しで設定を適用し、別の出所には適用しない', () => {
    const h = ['会社名','連絡先','備考','備考'], mapping = [{key:'company_name'},{key:'phone'},{key:'remarks'},{key:''}];
    const template = { provider: 'tsr', active: true, settings: companyImportTemplateSettings(h, mapping) };
    expect(applyCompanyImportTemplate(['連絡先','備考','会社名','備考'],'tsr',template,fields).mapping.map(m => m.key)).toEqual(['phone','remarks','company_name','']);
    expect(() => applyCompanyImportTemplate(h,'tdb',template,fields)).toThrow('同じ出所');
  });
  it('保存した設定と原本単位が違う場合、確認なしに登録できない', () => {
    const h = ['企業名','売上高（百万円）'];
    const template = { provider: 'tdb', active: true, settings: companyImportTemplateSettings(h,[{key:'company_name'},{key:'revenue_k',unit:'千円',unitConfirmed:true}]) };
    const applied = applyCompanyImportTemplate(h,'tdb',template,fields);
    expect(applied.warnings).toHaveLength(1);
    expect(validateCompanyImportMapping(h,applied.mapping,fields,'tdb')).toHaveLength(1);
    expect(applied.mapping[1].unit).toBe('百万円');
  });
  it('重複した取込先、停止した項目、別出所のコードを拒否する', () => {
    expect(validateCompanyImportMapping(['企業名','別名'],[{key:'company_name'},{key:'company_name'}],fields,'client')).toHaveLength(1);
    expect(validateCompanyImportMapping(['企業名','顧客番号'],[{key:'company_name'},{key:'custom_old'}],fields,'client')).toHaveLength(1);
    expect(validateCompanyImportMapping(['企業名','番号'],[{key:'company_name'},{key:'tsr_code'}],fields,'tdb')).toHaveLength(1);
  });
  it('数値の欠損・形式不正・日付不正を0や部分的な値に変えない', () => {
    const custom = [...fields,{ key: 'custom_date', label:'確認日',type:'date' }];
    expect(normalizeCompanyImportRow(['検証社',''],[{key:'company_name'},{key:'employee_count'}],fields).employee_count).toBeUndefined();
    expect(() => normalizeCompanyImportRow(['検証社','12名'],[{key:'company_name'},{key:'employee_count'}],fields)).toThrow('数値');
    expect(() => normalizeCompanyImportRow(['検証社','2026/02/31'],[{key:'company_name'},{key:'custom_date'}],custom)).toThrow('日付');
    expect(normalizeCompanyImportRow(['検証社','2026/2/3'],[{key:'company_name'},{key:'custom_date'}],custom).custom_date).toBe('2026-02-03');
  });
  it('電話の先頭0・全角・+81を補正し、不正な番号を接続先として作らない', () => {
    for (const phone of ['03-1234-5678','３１２３４５６７８','+81 3 1234 5678']) expect(normalizeImportPhone(phone)).toBe('0312345678');
    for (const phone of ['不明','123','03-1234-5678 内線9']) expect(() => normalizeImportPhone(phone)).toThrow();
  });
  it('住所の都道府県や市区町村を重ねて連結しない', () => {
    const m = [{key:'company_name'},{key:'prefecture'},{key:'city'},{key:'address'}];
    for (const address of ['東京都港区三田1-1','港区三田1-1','三田1-1']) expect(normalizeCompanyImportRow(['検証社','東京都','港区',address],m,fields).address).toBe('東京都港区三田1-1');
  });
});

describe('出典の文字コード・行番号', () => {
  it('表題が先頭にあるファイルで見出しを選び直しても元の行番号を保持する', async () => {
    const book=await parseImportFile({name:'client.csv',text:async()=>'顧客提供一覧\n\n企業名,顧客番号\nA社,00001\nB社,00002'});
    const sheet=selectCompanyImportHeader(book.sheets[0],1);
    expect(sheet.headerRow).toBe(3);expect(sheet.headersOriginal).toEqual(['企業名','顧客番号']);expect(sheet.sourceRowNumbers).toEqual([4,5]);
    expect(selectCompanyImportHeader(sheet,0).dataRows).toHaveLength(3);
    expect(()=>selectCompanyImportHeader(sheet,3)).toThrow('見出し行');
  });
  it('Excelのゼロ埋め書式の企業コードを表示通り保持する', async () => {
    const ExcelJS=(await import('exceljs')).default, book=new ExcelJS.Workbook(), sheet=book.addWorksheet('Client');
    sheet.addRow(['会社名','顧客番号']);sheet.addRow(['A社',12]);sheet.getCell('B2').numFmt='000000000';
    const bytes=await book.xlsx.writeBuffer(), parsed=await parseImportFile({name:'client.xlsx',arrayBuffer:async()=>bytes});
    expect(parsed.sheets[0].dataRows[0][1]).toBe('000000012');
  }, 15000);
  it('空行やセル内改行を含むCSVでも元の行位置を保持する', () => {
    const positions = [];
    const rows = parseDelimitedText('\n会社名,メモ\n\nA,"一行目\n二行目"\n\nB,確認済み',',',positions);
    expect(positions).toEqual([2,4,7]); expect(rows[1][1]).toBe('一行目\n二行目');
  });
  it('Shift_JISのCSVを文字化けさせず読む', async () => {
    const bytes = new Uint8Array([0x89,0xef,0x8e,0xd0,0x96,0xbc,0x2c,0x54,0x45,0x4c,0x0a,0x41,0x2c,0x30,0x33]); // 会社名,TEL\nA,03
    const result = await parseImportFile({ name:'TSR.csv', arrayBuffer: async () => bytes.buffer });
    expect(result.sheets[0].headersOriginal).toEqual(['会社名','TEL']);
    expect(result.sheets[0].encoding).toBe('shift_jis'); expect(result.sheets[0].sourceRowNumbers).toEqual([2]);
  });
  it('Excelの複数シートと空行を含む元の行位置を保持する', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const book = new ExcelJS.Workbook();
    const a = book.addWorksheet('TSR'); a.getRow(2).values=['企業名','電話番号']; a.getRow(7).values=['検証社',312345678];
    const b = book.addWorksheet('TDB'); b.addRow(['企業名']); b.addRow(['別検証社']);
    const bytes = await book.xlsx.writeBuffer();
    const result = await parseImportFile({ name:'取込.xlsx', arrayBuffer: async () => bytes });
    expect(result.sheets.map(s => s.name)).toEqual(['TSR','TDB']); expect(result.sheets[0].sourceRowNumbers).toEqual([7]);
    expect(result.sheets[0].headerRow).toBe(2); expect(result.sheets[0].dataRows[0][1]).toBe('312345678');
  }, 20000);
});
