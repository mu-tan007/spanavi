# Supabase Storage → Cloudflare R2 移設

2026-08-23 むー様指示。方針は **C案**（R2へ移す ＋ 古いものは自動で消す）。

## なぜやるか

Supabase の組織ストレージが 117.6GB / 100GB（118%）で超過し、
「Grace period is over・割り当てを使い切ると応答しなくなる」状態になっていた。
2026-08-23 にスペンドキャップを外して当座はしのいだが、容量そのものは減っていない。

内訳（実測 2026-08-23）

| プロジェクト | バケット | 件数 | 容量 |
|---|---|---|---|
| Spanavi | `recordings`（架電録音） | 150,800 | **80 GB** |
| Spanavi | `spacareer-session-videos`（講義録画） | 163 | **32 GB** |
| Spanavi | その他10バケット | — | 1.7 GB |
| Caesar | `email_attachments` | 1,426 | 1.2 GB |

**容量はほぼ全部スパナビにある。** 他プロジェクトを止めても1バイトも減らない。

## 進める順番

大きいのは録音だが、**件数が少ない講義動画（163件）から先に**やる。
仕組みを1本通してから15万件に移るほうが安全で、しかも32GBが落ちれば
100GBを下回って当面の危険が消える。

1. **講義動画 32GB**（この文書の対象）
2. 架電録音 80GB（同じ仕組みを流用。別途）

## 置き場所の決め

R2 側には既に2つのバケットがある（2026-08-23 時点でどちらも空）。

| バケット | 用途 |
|---|---|
| `dorayaki-recordings` | dorayaki の架電録音 |
| **`spacareer-videos`** | **講義録画・講座動画** ← 今回 |
| `spanavi-recordings`（未作成） | スパナビの架電録音80GB。あとで作る |

**自動削除の期間を用途ごとに変えたいので、バケットを分ける。**

⚠️ **`spacareer-videos` は講義録画の専用にする。前置きで分けない。**
移送は R2 の Data migration（バケット丸ごとの写し）で行うため、
移送先に前置きを足せない前提で組む。同じバケットに講座動画を混ぜると、
6か月の自動削除が**教材まで巻き込む**。

```
spacareer-videos       講義録画のみ。キーは <customer>/<session>.mp4
                       （Supabase の storage_path と同じ → そのまま r2_key に使える）
                       バケットまるごとに6か月の自動削除をかける
spacareer-courses（未作成） 講座動画。338MB・4件。急がない。消さない
```

Cloudflare Account ID は `50fba9661af3b964d3141cd6a8950eb9`（秘密ではない。S3の宛先に使う）。

## いま触っている場所（調査済み 2026-08-23）

| ファイル | 何をしている |
|---|---|
| `src/lib/spacareer/integrations/videoUpload.ts` | TUSでSupabase Storageへ。署名付きURL発行も |
| `src/components/spacareer/admin/_shared/SessionVideoModal.jsx` | 運営・トレーナーの再生 |
| `src/lib/spacareer/sessionMinutes.js` | AI議事録の入口 |
| `supabase/functions/analyze-spacareer-session/index.ts` | 動画から音声を取り出して文字起こし |

## 手順

### 0. 受け皿（むー様の操作が要る）

- [x] R2 に `spacareer-videos` バケットが既にある（新規作成は不要）
- [ ] R2 で API トークンを新しく作る（Object Read & Write / 対象は `spacareer-videos` だけ）
      ⚠️ dorayaki 用のトークンは Secret を読み出せないので使い回せない。
         作り直しても dorayaki 側は止まらない（古いトークンは有効なまま）
- [ ] **Spanavi の Supabase** の Edge Function Secrets に4つ登録
      ```
      R2_ACCOUNT_ID        50fba9661af3b964d3141cd6a8950eb9
      R2_BUCKET_SPACAREER  spacareer-videos
      R2_ACCESS_KEY_ID     （新しいトークン）
      R2_SECRET_ACCESS_KEY （新しいトークン）
      ```

### 1. 署名を出す Edge Function

- [ ] `supabase/functions/r2/index.ts` を作る（`verify_jwt=true`）
      - `POST {action:'sign-get', key, expires}` → 署名付きGET URL
      - `POST {action:'sign-put', key, contentType}` → 署名付きPUT URL
      - `POST {action:'delete', key}`
      - `POST {action:'copy-from-supabase', bucket, path, key}` → 移送用
      - AWS SigV4 は dorayaki の `r2-check` の実装をそのまま使う
- [ ] ⚠️ 署名付きURLは**発行そのものを認証で守る**。誰でも叩けると鍵を配るのと同じ

### 2. どちらに在るかを持つ

- [ ] `spacareer_session_videos` に `r2_key text` を追加
- [ ] `r2_key` があればR2、無ければSupabase Storage、という読み分けにする
      → 移送は1件ずつ進められ、途中で止めても壊れない

### 3. 読み書きの差し替え

- [ ] 再生：`createSessionVideoSignedUrl` を `r2_key` があればR2の署名に
- [ ] 新規アップロード：R2へ直接PUT（署名付きURL）。
      ⚠️ 200MB級なのでマルチパートが要る。単発PUTは5GBまで通るが、
      途中で切れたらやり直しになる。TUS相当の再開性は落ちるので、
      **失敗時は最初からやり直す**割り切りで良いか要確認
- [ ] AI議事録：R2から読めるようにする

### 4. 移送（元データは触らない）

⚠️ Edge Function 経由でコピーしてはいけない。**1本200MBあり、メモリ上限で落ちる**。
   R2 の **Data migration** で Cloudflare 側に直接吸わせる。こちらの回線を通さない。

- [ ] Supabase Storage の S3 アクセスキーを作る（`r2-migration` / **移送後に消す**）
      Endpoint `https://baiiznjzvzhxwwqzsozn.storage.supabase.co/storage/v1/s3`
      Region `ap-northeast-2`
      ⚠️ この鍵は**全バケットに届く**（80GBの録音も含む）。用が済んだら必ず消す
- [ ] R2 → Data migration → 移行元 S3互換 / 移行先 `spacareer-videos`
- [ ] 163件をコピー
- [ ] **件数とバイト数を突合**して一覧で出す
- [ ] 数本を実際に再生して確かめる

### 5. 削除（⚠️ ここだけ取り返しがつかない）

- [ ] 突合結果をむー様に見せて**確認を取ってから** Supabase 側を削除
- [ ] 削除後にストレージ使用量が 117.6 → 85.6GB に落ちることを確認

### 6. 自動削除

- [ ] R2 のライフサイクルで `spacareer/sessions/` を **6か月**で削除
- [ ] ⚠️ **議事録（テキスト）は消さない。** 消すのは動画だけ
- [ ] 画面に「動画は6か月で消えます」と出す

## 決めきれていないこと

- 新規アップロードの再開性（上の3を参照）
- 架電録音の保存期間（6か月で良いか。商談の証跡として長く要る可能性）
