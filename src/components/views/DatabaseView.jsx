import { useState } from 'react';
import { Button, ActionMenu } from '../ui';
import { Upload, MoreHorizontal } from 'lucide-react';
import { color, radius } from '../../constants/design';
import CompanyImportDialog from '../company/CompanyImportDialog';
import TsrIndustryModal from '../TsrIndustryModal';
import PageHeader from '../common/PageHeader';
import CompanyDirectory from '../company/CompanyDirectory';
export default function DatabaseView({isAdmin}) {
 const [showImport,setShowImport]=useState(false),[importTab,setImportTab]=useState('import');
 const [showTsrModal,setShowTsrModal]=useState(false),[revision,setRevision]=useState(0);
 return <div style={{animation:'fadeIn 0.3s ease'}}>
  {/* 見出しの右：毎日使う「リストインポート」だけを出す。設定の2つは「その他」の奥へ（Phalanx の企業DBにならう・2026-10-05）。
      AI検索・保存した条件は検索カードの中。 */}
  <PageHeader title="企業DB" description="企業情報・架電履歴・次回対応を、ひとつの企業カルテで共有" style={{marginBottom:20}} right={<>
   <ActionMenu title="その他" icon={<MoreHorizontal size={18}/>} minWidth={160}
    buttonStyle={{width:32,height:32,border:`1px solid ${color.border}`,borderRadius:radius.md}}
    items={[{key:'tsr',label:'TSR業種分類',onClick:()=>setShowTsrModal(true)},
     isAdmin&&{key:'settings',label:'項目・取込設定',onClick:()=>{setImportTab('settings');setShowImport(true);}}]}/>
   {isAdmin&&<Button size="sm" iconLeft={<Upload size={14}/>} onClick={()=>{setImportTab('import');setShowImport(true);}}>リストインポート</Button>}
  </>}/>
  <CompanyDirectory revision={revision} isAdmin={isAdmin}/>
  {showTsrModal&&<TsrIndustryModal onClose={()=>setShowTsrModal(false)}/>}
  {showImport&&<CompanyImportDialog initialTab={importTab} onClose={()=>setShowImport(false)} onDone={()=>setRevision(n=>n+1)}/>}
 </div>;
}
