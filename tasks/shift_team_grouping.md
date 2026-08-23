# シフトページのチーム別表示

メンバーページ（EngagementMembersView）と同じチーム分け・同じ並び順で、シフトページを表示する。

## 決定事項（2026-08-24）

- 適用範囲: 月間 / 週間 / 日別の**3ビュー全部**
- チーム内の並び順: **メンバーページと対応**（teams.display_order → team_members.display_order）
- チームごとの**合計時間の小計行を出す**

## 方針

- チーム情報は `useEngagementMembers(currentEngagement.id)` の `teamGroups` をそのまま使う（新規フェッチなし）
- **表示対象もメンバーページと完全に一致させる**（2026-08-24 むー様指示）。
  すなわち `member_engagements` でこの事業に所属している人だけ。他事業専任（大渕様・林様など）は出さない。
  当初は「members prop 全員を残して未所属に落とす」設計だったが、メンバーページに載っていない人が
  シフト表にだけ出るのは不整合なので取りやめ。
- シフト行の実体は今まで通り `members` prop（membersDetailed）。teamGroups に居て members prop に無い場合のみ
  teamGroups 側のオブジェクトで描く
- 見出し帯はメンバーページの `TeamBlock` ヘッダーと同じ配色（NAVY / チーム名 / (N名)）

## TODO

- [x] `ShiftManagementView` に `useEngagements` / `useEngagementMembers` を追加
- [x] `memberGroups`（チーム順に組み替えたグループ配列）を構築
- [x] 月間・週間の表にチーム見出し行 + チーム小計行を差し込む
- [x] 日別タイムラインにチーム見出し帯 + チーム小計行を差し込む
- [x] ビルド確認
- [x] 本番 push

## レビュー

- 変更ファイルは `src/components/views/ShiftManagementView.jsx` の1本のみ。DB変更なし。
- `sortedMembers` は `memberGroups` の flatMap から作り直したので、稼働人数フッターなど既存集計はそのまま動く。
- teamGroups 読み込み前（またはチーム未設定の事業）は見出しを出さず、従来通り入社日順の1枚表になる。
