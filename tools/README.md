# Spanavi Tools

## `compress_meeting.bat` — 週次ミーティング動画 圧縮バッチ

週次ミーティング録画を **Spanavi の Library にアップロードする前に** 圧縮するための Windows バッチです。Intel QSV によるハードウェア圧縮で高速に動作します。

### 使い方（ドラッグ & ドロップ）

1. エクスプローラで動画ファイル（mp4 / mov / mkv 等）を選択
2. `compress_meeting.bat` にドラッグ & ドロップ
3. 同じフォルダに `{元ファイル名}_compressed.mp4` が生成される

### 事前準備：ffmpeg のインストール

1. https://www.gyan.dev/ffmpeg/builds/ から **ffmpeg-release-essentials.zip** をダウンロード
2. `C:\ffmpeg` に解凍（または任意の場所）
3. 環境変数 PATH に `C:\ffmpeg\bin` を追加
4. PC を再起動

コマンドプロンプトで `ffmpeg -version` が動けばOK。

### 圧縮仕様

| 項目 | 値 |
|---|---|
| 映像コーデック | h264_qsv (Intel QSV ハードウェア加速) / fallback: libx264 |
| 画質 | `global_quality 25`（QSV） / `crf 23`（CPU） |
| 解像度 | 720p（アスペクト比維持） |
| 音声コーデック | AAC 96 kbps ステレオ |
| その他 | `faststart`（先頭シーク対応）|

1時間の会議動画（例：2GB）が **5-10分で 200-400MB** に圧縮されます。

### 圧縮後

生成された `_compressed.mp4` を Spanavi の Library → 週次ミーティングアーカイブ にアップロードしてください。500MB 以下になっていれば、Google Drive のトランスコード待ち時間もほぼ発生せず、すぐ埋め込み再生できます。

### 複数ファイルの一括圧縮

複数ファイルを選択してドラッグ & ドロップすると、順次圧縮されます。

### トラブルシュート

- **"ffmpeg が見つかりません"**: PATH 設定とPC再起動を確認
- **"Intel QSV が使用できない"**: 自動で libx264 CPU エンコードに切替わります（時間はかかりますが結果は出ます）
- **サイズが想定より大きい**: `-global_quality 25` → `30` 等に上げるとさらに小さくなります（品質は低下）
