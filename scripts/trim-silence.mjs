#!/usr/bin/env node
// scripts/trim-silence.mjs
//
// 動画から長い無音区間を除去して時間を短縮するスクリプト。
// 音声と映像を同期してカットするので、通常の動画編集ソフトと同等の結果になる。
// Intel Iris Xe (h264_qsv) ハードウェアエンコードでデフォルト動作する。
//
// 使い方:
//   node scripts/trim-silence.mjs <input>
//   node scripts/trim-silence.mjs video.mp4 video_short.mp4
//
// 詳細は --help を参照。

import { spawn, spawnSync } from 'child_process';
import path from 'path';
import { existsSync, statSync } from 'fs';

const DEFAULTS = {
  threshold: -30,    // dB: これより小さい音量を「無音」と判定
  minSilence: 1.0,   // 秒: この時間以上続いた無音だけカット (短い間は残す)
  keepSilence: 0.3,  // 秒: カット箇所の前後にこの分だけ無音を残す (自然な間)
  qsv: true,         // Intel QSV (h264_qsv) を使うか
};

function parseArgs(argv) {
  const args = { positional: [], ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--threshold') args.threshold = Number(argv[++i]);
    else if (a === '--min-silence') args.minSilence = Number(argv[++i]);
    else if (a === '--keep-silence') args.keepSilence = Number(argv[++i]);
    else if (a === '--no-qsv') args.qsv = false;
    else if (a === '--help' || a === '-h') args.help = true;
    else args.positional.push(a);
  }
  return args;
}

function help() {
  console.log(`
動画から長い無音区間を除去して時間を短縮するスクリプト

使い方:
  node scripts/trim-silence.mjs <input> [output]

例:
  # 一番シンプル (動画と同じ場所に <name>_trimmed.mp4 が出る)
  node scripts/trim-silence.mjs ./video.mp4

  # 出力ファイル名を指定
  node scripts/trim-silence.mjs ./video.mp4 ./video_short.mp4

  # 厳しめにカット (短い間も削る、ただし不自然になりやすい)
  node scripts/trim-silence.mjs ./video.mp4 --threshold -25 --min-silence 0.6

オプション:
  --threshold <dB>     無音判定閾値 (default ${DEFAULTS.threshold}dB)
                       -25 にすると小さい話し声もカット候補に
                       -35 にすると静かな環境音まで残す
  --min-silence <秒>   無音と判定する最低継続時間 (default ${DEFAULTS.minSilence}秒)
                       小さくするとカットが増える、不自然になりやすい
  --keep-silence <秒>  カット箇所の前後に残す無音 (default ${DEFAULTS.keepSilence}秒)
                       0 にすると突然カットされる、0.5 で自然な間
  --no-qsv             Intel QSV を使わずに CPU エンコード (互換性確保用)
  --help, -h           このヘルプを表示

前提:
  ffmpeg がインストール済みであること (https://ffmpeg.org/)
  Windows なら winget install Gyan.FFmpeg, mac なら brew install ffmpeg

備考:
  - 映像と音声を同期してカットするので、通常の動画編集ソフトと同じ結果
  - QSV エンコード失敗時は自動で CPU エンコードにフォールバック
  - 1時間動画なら 5-10分 で処理完了 (Iris Xe + QSV)
  `);
}

function fmtBytes(b) {
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function fmtSec(s) {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}分${sec}秒`;
}

function checkFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf-8' });
  if (r.error || r.status !== 0) {
    console.error('[ERROR] ffmpeg が見つかりません。先にインストールしてください: https://ffmpeg.org/');
    process.exit(1);
  }
}

// silencedetect で無音区間を検出
async function detectSilence(input, threshold, minSilence) {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner',
      '-i', input,
      '-af', `silencedetect=noise=${threshold}dB:d=${minSilence}`,
      '-f', 'null', '-',
    ];
    const ff = spawn('ffmpeg', args);
    let stderr = '';
    ff.stderr.on('data', (d) => { stderr += d.toString(); });
    ff.on('error', reject);
    ff.on('close', (code) => {
      // silencedetect は exit code 0、解析できれば OK
      const silences = [];
      const lines = stderr.split('\n');
      let curStart = null;
      for (const line of lines) {
        const ms = line.match(/silence_start:\s*(-?[\d.]+)/);
        if (ms) { curStart = Math.max(0, parseFloat(ms[1])); continue; }
        const me = line.match(/silence_end:\s*(-?[\d.]+)/);
        if (me && curStart !== null) {
          silences.push({ start: curStart, end: parseFloat(me[1]) });
          curStart = null;
        }
      }
      const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      const duration = durMatch
        ? parseFloat(durMatch[1]) * 3600 + parseFloat(durMatch[2]) * 60 + parseFloat(durMatch[3])
        : 0;
      // 末尾に silence_start だけある場合 (動画の最後が無音) は終端まで
      if (curStart !== null && duration > 0) silences.push({ start: curStart, end: duration });
      if (duration === 0) return reject(new Error('動画の長さを取得できませんでした'));
      resolve({ silences, duration });
    });
  });
}

// 検出された無音区間から、保持する有声区間を計算
function buildIntervals(silences, duration, keepSilence) {
  const intervals = [];
  let cur = 0;
  for (const s of silences) {
    // カットする無音は前後に keepSilence 分の余白を残す
    const trimStart = s.start + keepSilence;
    const trimEnd = s.end - keepSilence;
    if (trimEnd <= trimStart) continue; // 短すぎる無音は丸ごとスキップ (=カットしない)
    if (cur < trimStart) intervals.push([cur, trimStart]);
    cur = trimEnd;
  }
  if (cur < duration) intervals.push([cur, duration]);
  return intervals;
}

async function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', args, { stdio: 'inherit' });
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

function buildSelectExpr(intervals) {
  // ffmpeg select フィルタ用: between(t,a,b)+between(t,c,d)+...
  return intervals.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join('+');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { help(); process.exit(0); }
  if (args.positional.length < 1) { help(); process.exit(1); }

  checkFfmpeg();

  const input = args.positional[0];
  if (!existsSync(input)) {
    console.error(`[ERROR] 入力ファイルが見つかりません: ${input}`);
    process.exit(1);
  }

  const output = args.positional[1] || (() => {
    const dir = path.dirname(input);
    const base = path.basename(input, path.extname(input));
    return path.join(dir, `${base}_trimmed.mp4`);
  })();

  const inputSize = statSync(input).size;
  console.log(`> 入力: ${input} (${fmtBytes(inputSize)})`);
  console.log(`> 出力: ${output}`);
  console.log(`  パラメータ: 閾値=${args.threshold}dB / 最低無音=${args.minSilence}秒 / 残す無音=${args.keepSilence}秒 / QSV=${args.qsv ? 'ON' : 'OFF'}`);
  console.log('');

  console.log('> Step 1/2: 無音区間を検出中...');
  const { silences, duration } = await detectSilence(input, args.threshold, args.minSilence);
  console.log(`  検出された無音区間: ${silences.length}個`);
  console.log(`  元の動画長さ: ${fmtSec(duration)}`);

  if (silences.length === 0) {
    console.log('');
    console.log('  → カット対象の無音がありません。');
    console.log('     閾値を緩める (例: --threshold -25) か');
    console.log('     最低無音時間を短くする (例: --min-silence 0.5) と検出されやすくなります。');
    process.exit(0);
  }

  const intervals = buildIntervals(silences, duration, args.keepSilence);
  if (intervals.length === 0) {
    console.log('  → 有声区間がありません (動画全体が無音?)。処理を中止します。');
    process.exit(0);
  }
  const newDur = intervals.reduce((s, [a, b]) => s + (b - a), 0);
  const reduction = ((1 - newDur / duration) * 100).toFixed(1);
  console.log(`  カット後の長さ: ${fmtSec(newDur)} (${reduction}% 削減)`);
  console.log('');

  console.log('> Step 2/2: ffmpeg でカット + エンコード中...');
  const selectExpr = buildSelectExpr(intervals);
  const baseArgs = [
    '-hide_banner',
    '-i', input,
    '-vf', `select='${selectExpr}',setpts=N/FRAME_RATE/TB`,
    '-af', `aselect='${selectExpr}',asetpts=N/SR/TB`,
  ];
  const audioArgs = ['-c:a', 'aac', '-b:a', '128k'];
  const qsvArgs = ['-c:v', 'h264_qsv', '-preset', 'medium', '-global_quality', '23'];
  const cpuArgs = ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23'];

  try {
    await runFfmpeg([...baseArgs, ...(args.qsv ? qsvArgs : cpuArgs), ...audioArgs, '-y', output]);
  } catch (err) {
    if (args.qsv) {
      console.warn('\n[WARN] QSV エンコードに失敗しました。CPU エンコードで再試行します...\n');
      await runFfmpeg([...baseArgs, ...cpuArgs, ...audioArgs, '-y', output]);
    } else {
      throw err;
    }
  }

  const outputSize = statSync(output).size;
  const sizeReduction = ((1 - outputSize / inputSize) * 100).toFixed(1);
  console.log('');
  console.log(`[完了] ${output}`);
  console.log(`  サイズ: ${fmtBytes(inputSize)} → ${fmtBytes(outputSize)} (${sizeReduction}% 削減)`);
  console.log(`  時間: ${fmtSec(duration)} → ${fmtSec(newDur)} (${reduction}% 削減)`);
  console.log('');
  console.log('  Library 画面でこの動画をアップロードしてください。');
}

main().catch((err) => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
