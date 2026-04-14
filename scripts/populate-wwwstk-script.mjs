// ============================================================
// work work work 株式会社 スクリプトタブ書き込み
// - format-noah-sheets.mjs と同じデザイン体系を使用
// - スクリプトタブのみクリア→書き込み→フォーマット
// ============================================================
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

// Google OAuth資格情報（NOAH_ prefixだが同一Googleアカウント＝全シート共通）
const SPREADSHEET_ID = '1fHwcil0sS1ie3b1JBY_jQhVM0YAIfB18I6_4a5LDkfw';
const CLIENT_ID = process.env.NOAH_CLIENT_ID;
const CLIENT_SECRET = process.env.NOAH_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.NOAH_REFRESH_TOKEN;

// ブランドカラー（format-noah-sheets.mjs と同一）
const NAVY = { red: 0.05, green: 0.13, blue: 0.28 };
const GOLD = { red: 0.78, green: 0.66, blue: 0.29 };
const WHITE = { red: 1, green: 1, blue: 1 };
const LIGHT_NAVY = { red: 0.92, green: 0.94, blue: 0.97 };
const BORDER_COLOR = { red: 0.85, green: 0.87, blue: 0.90 };
const TEXT_DARK = { red: 0.07, green: 0.09, blue: 0.11 };
const TEXT_MID = { red: 0.22, green: 0.25, blue: 0.31 };

const thinBorder = { style: 'SOLID', color: BORDER_COLOR, width: 1 };

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: REFRESH_TOKEN,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('token failed: ' + JSON.stringify(j));
  return j.access_token;
}

async function sheetsApi(accessToken, path, method = 'GET', body = null) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}${path}`;
  const opts = { method, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const j = await r.json();
  if (!r.ok) throw new Error(`Sheets API ${path}: ${JSON.stringify(j)}`);
  return j;
}

async function batchUpdate(accessToken, requests) {
  for (let i = 0; i < requests.length; i += 100) {
    await sheetsApi(accessToken, ':batchUpdate', 'POST', { requests: requests.slice(i, i + 100) });
  }
}

// ============================================================
// スクリプト内容（ユーザー添付の原文を忠実に再現）
// ============================================================
function buildScriptContent() {
  return [
    ['☆基本スクリプト+ヒアリング事項×2'],
    [''],
    ['■受付編'],
    [''],
    ['(篠宮)', 'work work workの篠宮です!お世話様です!〇〇社長をお願いします!'],
    ['(受付)', 'ご用件はなんでしょうか?'],
    ['(篠宮)', '福岡県の〇〇業界のアライアンスの件とお伝えください!'],
    ['(受付)', '少々お待ちください。'],
    ['(篠宮)', 'お願いします!'],
    [''],
    [''],
    ['■社長編'],
    [''],
    ['(社長)', 'はい、〇〇です。'],
    ['(篠宮)', 'お世話になっております!私、work work workの篠宮と申します。〇〇社長、ただいまお時間1分だけよろしいでしょうか?すぐ終わらせます!'],
    ['(社長)', 'どうぞ。'],
    ['(篠宮)', 'ありがとうございます!まず我々が、福岡県の企業様に特化して、いわるゆる資本提携のご支援をしておりまして、今回、我々と従前からお付き合いのある会社が、指名ではないものの御社のような会社とぜひとも一緒に成長したいという、お話が上がっておりましてですね、そのお相手様が具体的にどういった会社で、どういった経緯でこのようなお話が上がったのか、そちらについてぜひともお話させていただきたく思っておりまして、で社長もなかなかお忙しいことかと思いますが、〇月〇日の〇曜日と〇日の〇曜日に、弊社の代表の者がちょうど御社のすぐ近くにおりましてですね、その際にぜひともそちらのお話をさせていただければと思いますが、〇〇社長、〇月〇日と〇日でしたら、どちらのほうが比較的ご都合よろしいでしょうか。'],
    ['(社長)', '〇月〇日の13時だったら大丈夫。'],
    ['(篠宮)', 'ありがとうございます!お伺いさせていただく住所は、〇〇(リストに記載の住所)でお間違いございませんでしょうか?'],
    ['(社長)', 'そうです。'],
    ['(篠宮)', 'ありがとうございます！ちなみに社長、今までにこういったM&Aのお話を聞かれたことはございますでしょうか？'],
    ['(社長)', 'あります。or ないです。'],
    ['(篠宮)', '左様でございますか！ちなみに、今回のお話は今すぐにでもM&Aを検討してほしいといった趣旨ではございませんでしたが、お相手様やお金額次第で、将来的にM&Aをする選択肢は、社長の中で少しでもございますでしょうか？'],
    ['(社長)', 'わからないです。'],
    ['(篠宮)', 'ありがとうございます!でしたら、〇月〇日の13時に、弊社代表の菊池という者がお伺いさせていただきますので、どうぞよろしくお願いいたします!'],
    ['(社長)', 'お願いします。'],
    ['(篠宮)', 'お忙しいところお時間を頂きましてありがとうございました!失礼いたします!'],
  ];
}

function buildScriptTabFormat(sheetId, rowCount) {
  const requests = [];

  // 列幅
  requests.push(
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 800 }, fields: 'pixelSize' } },
  );

  // 全行の基本スタイル
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: 2 },
      cell: {
        userEnteredFormat: {
          textFormat: { fontSize: 11, foregroundColor: TEXT_DARK },
          verticalAlignment: 'MIDDLE',
          wrapStrategy: 'WRAP',
          padding: { top: 6, bottom: 6, left: 8, right: 8 },
        }
      },
      fields: 'userEnteredFormat(textFormat,verticalAlignment,wrapStrategy,padding)',
    }
  });

  return requests;
}

function buildScriptSectionFormat(sheetId, scriptRows) {
  const requests = [];

  for (let i = 0; i < scriptRows.length; i++) {
    const row = scriptRows[i];
    const text = row[0] || '';

    // ☆タイトル行 — ゴールド背景・ネイビー太字（最上位見出し）
    if (text.startsWith('☆')) {
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: i, endRowIndex: i + 1, startColumnIndex: 0, endColumnIndex: 2 },
          cell: {
            userEnteredFormat: {
              backgroundColor: GOLD,
              textFormat: { bold: true, fontSize: 14, foregroundColor: NAVY },
              padding: { top: 12, bottom: 12, left: 12 },
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,padding)',
        }
      });
      requests.push({
        mergeCells: {
          range: { sheetId, startRowIndex: i, endRowIndex: i + 1, startColumnIndex: 0, endColumnIndex: 2 },
          mergeType: 'MERGE_ALL',
        }
      });
      requests.push({
        updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: 48 }, fields: 'pixelSize' }
      });
    }
    // ■セクションヘッダー — ネイビー背景・白太字
    else if (text.startsWith('■')) {
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: i, endRowIndex: i + 1, startColumnIndex: 0, endColumnIndex: 2 },
          cell: {
            userEnteredFormat: {
              backgroundColor: NAVY,
              textFormat: { bold: true, fontSize: 13, foregroundColor: WHITE },
              padding: { top: 10, bottom: 10, left: 12 },
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,padding)',
        }
      });
      requests.push({
        mergeCells: {
          range: { sheetId, startRowIndex: i, endRowIndex: i + 1, startColumnIndex: 0, endColumnIndex: 2 },
          mergeType: 'MERGE_ALL',
        }
      });
      requests.push({
        updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: 44 }, fields: 'pixelSize' }
      });
    }
    // 篠宮発言行 — ライトネイビー背景
    else if (text === '(篠宮)') {
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: i, endRowIndex: i + 1, startColumnIndex: 0, endColumnIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: LIGHT_NAVY,
              textFormat: { bold: true, fontSize: 11, foregroundColor: NAVY },
              horizontalAlignment: 'CENTER',
              borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,borders)',
        }
      });
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: i, endRowIndex: i + 1, startColumnIndex: 1, endColumnIndex: 2 },
          cell: {
            userEnteredFormat: {
              backgroundColor: LIGHT_NAVY,
              textFormat: { fontSize: 11, foregroundColor: NAVY },
              borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,borders)',
        }
      });
    }
    // 受付/社長発言行 — 白背景
    else if (text === '(受付)' || text === '(社長)') {
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: i, endRowIndex: i + 1, startColumnIndex: 0, endColumnIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: WHITE,
              textFormat: { bold: true, fontSize: 11, foregroundColor: TEXT_MID },
              horizontalAlignment: 'CENTER',
              borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,borders)',
        }
      });
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: i, endRowIndex: i + 1, startColumnIndex: 1, endColumnIndex: 2 },
          cell: {
            userEnteredFormat: {
              backgroundColor: WHITE,
              textFormat: { fontSize: 11, foregroundColor: TEXT_MID },
              borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,borders)',
        }
      });
    }
    // 空行 — 高さ圧縮
    else if (!text && !row[1]) {
      requests.push({
        updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: 12 }, fields: 'pixelSize' }
      });
    }
  }

  return requests;
}

async function main() {
  const accessToken = await getAccessToken();
  const meta = await sheetsApi(accessToken, '?fields=sheets(properties)');
  const scriptSheet = meta.sheets.find(s => s.properties.title === 'スクリプト');
  if (!scriptSheet) throw new Error('スクリプト tab not found in spreadsheet ' + SPREADSHEET_ID);
  const sheetId = scriptSheet.properties.sheetId;

  const scriptRows = buildScriptContent();
  console.log(`Writing ${scriptRows.length} rows to スクリプト tab...`);

  await sheetsApi(accessToken, `/values/${encodeURIComponent('スクリプト')}:clear`, 'POST');
  await sheetsApi(accessToken, `/values/${encodeURIComponent('スクリプト')}?valueInputOption=RAW`, 'PUT', { values: scriptRows });

  const reqs = [
    ...buildScriptTabFormat(sheetId, scriptRows.length),
    ...buildScriptSectionFormat(sheetId, scriptRows),
  ];
  await batchUpdate(accessToken, reqs);
  console.log('🎉 Done!');
}

main().catch(e => { console.error(e); process.exit(1); });
