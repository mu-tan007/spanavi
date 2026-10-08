# Zoomクラウド録画をR2へ移し、スパナビで見られるようにする（2026-10-08 むー様決定：案2）

背景：Zoomのクラウド容量（アカウント全体40GB）が満杯でクラウド録画が全員停止。容量の買い足しはしない。

## 手順
- [ ] Zoomアプリ「Spanavi」に cloud_recording 権限3つ（10/8 自動判定で止められ、むー様の操作待ち）
- [x] R2の保存期間を確認 → spacareer・recordings とも **180日で自動削除**（delete-session-videos-180d）。保存期間はむー様の判断待ち
- [x] 置き場の表 zoom_cloud_recordings（本番に作成済み・CLIのdb queryで流したので履歴表には無い）（会議ID・ホスト・題名・開始・長さ・R2の鍵・大きさ・Zoomの共有URL）
- [x] 移す処理 zoom-cloud-archive（本番に配置・合言葉 ZOOM_CLOUD_ARCHIVE_SECRET・scanで権限不足4711を確認）：Zoomの録画一覧→動画(mp4)をR2へ分割アップロード→大きさ照合→表に記録
- [ ] spacareer_sales_events.recording_url のZoom共有リンク137件を、スパナビ内の再生へ付け替え
- [ ] 営業ファネル画面の「録画」をスパナビ内で再生（r2 sign-get・権限確認つき）
- [ ] 照合済みのものだけZoomから外す（まずゴミ箱へ）→ 容量の減りを管理画面で確認
- [ ] 鍛冶さんの録画が再開できることを確認

## 確認
