import IndustryDataPanel from './IndustryDataPanel';
import UnifiedQueuePanel from './UnifiedQueuePanel';

// スマートキュー: 単一キュー設計
//   - 上段: 業種別 キーマン接続率データビュー（おすすめ業種シグナル）
//   - 下段: 単一キュー（期限超過再コール / 未接続フォロー / 未架電を混在表示）
//           プリセット切替・業種フィルタ・並び替えで絞り込み
export default function SmartQueueTab({ setCallFlowScreen, callListData }) {
  return (
    <div>
      <IndustryDataPanel />
      <UnifiedQueuePanel setCallFlowScreen={setCallFlowScreen} callListData={callListData} />
    </div>
  );
}
