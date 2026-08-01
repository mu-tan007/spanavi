# 架電リスト 都道府県フィルタに「除く」モードを追加（2026-08-01）

対象: 営業代行タブ > 架電リスト。本番=main。

## 背景
都道府県フィルタは「選んだ県だけに絞る」包含のみで、「この県を除きたい」ができなかった。
（例: 東京以外に架電したい、沖縄・北海道を外したい）

## 仕様
- 都道府県ドロップダウンの先頭に「含む / 除く」の2択トグルを追加。既定は「含む」＝従来動作。
- 「除く」時は選択した県の行を落とす。住所から県を取れない行（空欄・表記ゆれ）は該当なし扱いで**残す**。
- 県を1つも選んでいない間はモードに関わらず絞り込みなし（全件）。
- 除外中はボタンが赤系（`color.danger`）＋表記が `都道府県を除く(N)▼` になり、包含と一目で区別できる。

## 変更ファイル
- `src/components/views/CallFlowView.jsx`
  - `prefMode` state 追加（prop `initialPrefMode`、既定 `'include'`）
  - 絞り込み本体: `const hit = prefFilters.includes(extractPref(item.address)); if (prefMode === 'exclude' ? hit : !hit) return false;`
  - ドロップダウンに含む/除くトグル、ボタンの表記と配色を分岐
- `src/components/views/DetailModal.jsx`
  - 同じ `prefMode` state とトグル。「検索」「全件」で `prefMode` を架電フローへ引き渡し
- `src/components/SpanaviApp.jsx`
  - `masp_v2_callFlowScreen` の localStorage 保存／復元に `prefMode` を追加（リロードで除外が解けないように）
  - `CallFlowView` へ `initialPrefMode` を受け渡し

DB・RPC・マイグレーションの変更なし（フロントのメモリ上フィルタのみ）。

## 検証
- [x] `npm run build` 成功（既存 warning のみ）
- [x] 述語の単体確認: include[東京都]→東京のみ / exclude[東京都]→東京以外＋住所不明が残る / 未選択→全件
- [ ] 本番で目視（トグル切替、リロード後も除外が維持されること）

## 補足
CRM の `CRMLeadListDetailView` も架電フローへ `prefFilter` を渡すが `prefMode` 未指定＝`'include'` にフォールバックするため従来動作のまま。
CRM 側画面内の都道府県フィルタは今回の対象外（包含のみ）。
