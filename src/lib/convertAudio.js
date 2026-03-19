/**
 * アップロード前に音声/動画ファイルを Whisper 対応 MP3 に変換するユーティリティ
 *
 * - 24 MB 以下 かつ Whisper 対応形式(mp3/m4a/mp4/wav/webm/ogg/flac) の場合はそのまま返す
 * - それ以外（MOV・大きな MP4 など）は ffmpeg.wasm で MP3 64kbps に変換する
 *   初回のみ ~30MB の WASM をダウンロード（以降はキャッシュされる）
 */
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

// Whisper が直接受け付ける拡張子
const WHISPER_NATIVE = new Set(['mp3', 'mp4', 'm4a', 'wav', 'webm', 'ogg', 'flac', 'mpeg', 'mpga'])
const WHISPER_MAX_BYTES = 24 * 1024 * 1024 // 24 MB（余裕を持って設定）

let _ffmpeg = null
let _loadPromise = null

async function getFFmpeg() {
  if (_ffmpeg) return _ffmpeg
  if (_loadPromise) return _loadPromise

  _loadPromise = (async () => {
    const ff = new FFmpeg()
    const CDN = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
    await ff.load({
      coreURL: await toBlobURL(`${CDN}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CDN}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    _ffmpeg = ff
    return ff
  })()

  return _loadPromise
}

/**
 * @param {File} file
 * @param {(msg: string) => void} [onProgress]  変換中の状態メッセージコールバック
 * @returns {Promise<File>}  変換済みファイル（または元ファイル）
 */
export async function prepareAudioForWhisper(file, onProgress) {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  const needsConversion = !WHISPER_NATIVE.has(ext) || file.size > WHISPER_MAX_BYTES

  if (!needsConversion) return file

  onProgress?.('🔄 変換ライブラリを読み込み中...')
  const ff = await getFFmpeg()

  const inputName = `input.${ext}`
  const outputName = 'output.mp3'

  onProgress?.('📂 ファイルを読み込み中...')
  await ff.writeFile(inputName, await fetchFile(file))

  ff.on('progress', ({ progress }) => {
    if (progress > 0) onProgress?.(`🔄 変換中... ${Math.round(progress * 100)}%`)
  })

  onProgress?.('🔄 MP3 に変換中...')
  await ff.exec([
    '-i', inputName,
    '-vn',                  // 映像トラックを削除
    '-acodec', 'libmp3lame',
    '-ab', '64k',           // 64 kbps（音声ロープレに十分な品質）
    '-ar', '22050',         // 22050 Hz（音声に最適）
    '-ac', '1',             // モノラル
    outputName,
  ])

  const data = await ff.readFile(outputName)
  await ff.deleteFile(inputName).catch(() => {})
  await ff.deleteFile(outputName).catch(() => {})

  const baseName = file.name.replace(/\.[^.]+$/, '')
  return new File([data.buffer], `${baseName}.mp3`, { type: 'audio/mpeg' })
}

/** 変換が必要かどうかだけ判定する（UIのメッセージ表示用） */
export function needsConversion(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  return !WHISPER_NATIVE.has(ext) || file.size > WHISPER_MAX_BYTES
}
