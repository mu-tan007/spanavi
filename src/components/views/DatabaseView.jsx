import { useState } from 'react';
import { Button } from '../ui';
import { Upload } from 'lucide-react';
import CompanyImportDialog from '../company/CompanyImportDialog';
import TsrIndustryModal from '../TsrIndustryModal';
import PageHeader from '../common/PageHeader';
import CompanyDirectory from '../company/CompanyDirectory';
export default function DatabaseView({isAdmin}) {
 const [showImport,setShowImport]=useState(false),[importTab,setImportTab]=useState('import');
 const [showTsrModal,setShowTsrModal]=useState(false),[showAiChat,setShowAiChat]=useState(false),[revision,setRevision]=useState(0);
 return <div style={{animation:'fadeIn 0.3s ease'}}>
  <PageHeader title="企業DB" description="企業情報・架電履歴・次回対応を、ひとつの企業カルテで共有" style={{marginBottom:24}} right={<>
   <Button variant="secondary" size="sm" onClick={()=>setShowAiChat(true)}>AI・保存した検索条件</Button>
   <Button variant="secondary" size="sm" onClick={()=>setShowTsrModal(true)}>TSR業種分類一覧</Button>
   {isAdmin&&<Button variant="outline" size="sm" onClick={()=>{setImportTab('settings');setShowImport(true);}}>項目・取込設定</Button>}
   {isAdmin&&<Button size="sm" iconLeft={<Upload size={14}/>} onClick={()=>{setImportTab('import');setShowImport(true);}}>リストインポート</Button>}
  </>}/>
  <CompanyDirectory revision={revision} isAdmin={isAdmin} aiOpen={showAiChat} onCloseAi={()=>setShowAiChat(false)}/>
  {showTsrModal&&<TsrIndustryModal onClose={()=>setShowTsrModal(false)}/>}
  {showImport&&<CompanyImportDialog initialTab={importTab} onClose={()=>setShowImport(false)} onDone={()=>setRevision(n=>n+1)}/>}
 </div>;
}
