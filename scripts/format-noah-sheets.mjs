// ============================================================
// NOAH スプレッドシートのデザイン統一 + スクリプトタブ書き込み
// ============================================================
import fs from 'fs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

// Load .env manually (no dotenv dependency needed)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const SPREADSHEET_ID = process.env.NOAH_SPREADSHEET_ID;
const CLIENT_ID = process.env.NOAH_CLIENT_ID;
const CLIENT_SECRET = process.env.NOAH_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.NOAH_REFRESH_TOKEN;

// ブランドカラー
const NAVY = { red: 0.05, green: 0.13, blue: 0.28 };
const GOLD = { red: 0.78, green: 0.66, blue: 0.29 };
const WHITE = { red: 1, green: 1, blue: 1 };
const LIGHT_GRAY = { red: 0.96, green: 0.97, blue: 0.98 };
const LIGHT_NAVY = { red: 0.92, green: 0.94, blue: 0.97 };
const BORDER_COLOR = { red: 0.85, green: 0.87, blue: 0.90 };
const TEXT_DARK = { red: 0.07, green: 0.09, blue: 0.11 };
const TEXT_MID = { red: 0.22, green: 0.25, blue: 0.31 };
const RED = { red: 0.90, green: 0.22, blue: 0.21 };
const GREEN = { red: 0.06, green: 0.62, blue: 0.35 };

const thinBorder = { style: 'SOLID', color: BORDER_COLOR, width: 1 };
const goldBorder = { style: 'SOLID', color: GOLD, width: 2 };

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: REFRESH_TOKEN, client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
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
// リストデータ / レポート タブのフォーマット
// ============================================================
function buildDataTabFormat(sheetId, rowCount, colCount) {
  const requests = [];

  // ヘッダー行 (row 0)
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount },
      cell: {
        userEnteredFormat: {
          backgroundColor: NAVY,
          textFormat: { bold: true, fontSize: 10, foregroundColor: WHITE },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
          borders: { bottom: goldBorder },
          padding: { top: 6, bottom: 6 },
        }
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders,padding)',
    }
  });
  requests.push({
    updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 36 }, fields: 'pixelSize' }
  });

  // データ行 (row 1+) ゼブラストライプ
  for (let r = 1; r < rowCount; r++) {
    const bg = r % 2 === 1 ? WHITE : LIGHT_GRAY;
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: colCount },
        cell: {
          userEnteredFormat: {
            backgroundColor: bg,
            textFormat: { fontSize: 10, foregroundColor: TEXT_DARK },
            verticalAlignment: 'MIDDLE',
            borders: { bottom: { style: 'DOTTED', color: BORDER_COLOR, width: 1 }, left: thinBorder, right: thinBorder },
            padding: { top: 2, bottom: 2, left: 4 },
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,borders,padding)',
      }
    });
  }

  // フリーズヘッダー
  requests.push({
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
      fields: 'gridProperties.frozenRowCount',
    }
  });

  return requests;
}

function buildReportTabFormat(sheetId, rowCount, colCount) {
  const requests = [];

  // ヘッダー行
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount },
      cell: {
        userEnteredFormat: {
          backgroundColor: NAVY,
          textFormat: { bold: true, fontSize: 10, foregroundColor: WHITE },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
          borders: { bottom: goldBorder },
          padding: { top: 6, bottom: 6 },
        }
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders,padding)',
    }
  });
  requests.push({
    updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 36 }, fields: 'pixelSize' }
  });

  // データ行
  for (let r = 1; r < rowCount; r++) {
    const bg = r % 2 === 1 ? WHITE : LIGHT_GRAY;
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: colCount },
        cell: {
          userEnteredFormat: {
            backgroundColor: bg,
            textFormat: { fontSize: 10, foregroundColor: TEXT_DARK },
            verticalAlignment: 'MIDDLE',
            horizontalAlignment: 'CENTER',
            borders: { bottom: { style: 'DOTTED', color: BORDER_COLOR, width: 1 }, left: thinBorder, right: thinBorder },
            padding: { top: 3, bottom: 3 },
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,horizontalAlignment,borders,padding)',
      }
    });
  }

  // 列幅
  const widths = [140, 100, 100, 100, 80, 80];
  for (let i = 0; i < Math.min(widths.length, colCount); i++) {
    requests.push({
      updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: widths[i] }, fields: 'pixelSize' }
    });
  }

  // 合計行（最後から少し上）を検出して金色背景にする — 後で特定
  // フリーズヘッダー
  requests.push({
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
      fields: 'gridProperties.frozenRowCount',
    }
  });

  return requests;
}

// ============================================================
// スクリプト タブ
// ============================================================
function buildScriptContent() {
  return [
    ['■受付編'],
    [''],
    ['(篠宮)', 'NOAHの篠宮です！お世話様です！〇〇社長をお願いします！'],
    ['(受付)', 'ご用件はなんでしょうか？'],
    ['(篠宮)', '〇〇（架電先企業の市区町村）市の製造アライアンスの件とお伝えください！'],
    ['(受付)', '少々お待ちください。'],
    ['(篠宮)', 'お願いします！'],
    [''],
    [''],
    ['■社長編'],
    [''],
    ['(社長)', 'はい、〇〇です。'],
    ['(篠宮)', 'お世話になっております！私、NOAHの篠宮と申します。〇〇社長、ただいまお時間1分だけよろしいでしょうか？すぐ終わらせます！'],
    ['(社長)', 'どうぞ。'],
    ['(篠宮)', 'ありがとうございます！まず我々が、製造業界に特化をして、営業組織の改革やDX化のご支援をしておりまして、今回、唐突なご提案で大変恐縮なのですが、弊社代表の遠藤という者が御社の事業内容や強みを一緒に調べておりまして、御社に強い魅力を感じております。遠藤自身、東大出身で製造業界における知見を長年蓄積してまいりましたほか、社内にはキーエンス出身の者もおりまして、製造業界の営業組織改革で多大なる実績を積んでまいりました。そういった知見を活かして、御社のお力添えができればと思い、お電話させていただきました。\nとはいえ、社長にとっても「何の話だ」ということかと思いますので、弊社の遠藤が御社に直接お伺いの上、詳細をお話しできればと思っておりましてですね。\nちなみに社長、〇月〇日の〇曜日と〇日の〇曜日に、ちょうど遠藤が御社の近くにおりますので、その際にぜひともお話ができればと思っておりましたが、〇月〇日と〇日でしたら、どちらの方がご都合よろしいでしょうか？'],
    ['(社長)', '〇月〇日の13時だったら大丈夫。'],
    ['(篠宮)', 'ありがとうございます！お伺いさせていただく住所は、〇〇（リストに記載の住所）でお間違いございませんでしょうか？'],
    ['(社長)', 'そうです。'],
    ['(篠宮)', 'ありがとうございます！ちなみに社長、何か今、営業関係でお困りのことがあれば、当日をより有意義な時間にするために、ざっくりしたことでもいいのでお聞かせいただきたいのですが、いかがですか？'],
    ['(社長)', '（ヒアリング内容）'],
    ['(篠宮)', '左様でございますか！ありがとうございます！また実は我々、事業承継に困っている企業様に資本提供をして、その上で企業の営業力を伸ばしていくということもやっているので、そちらについても当日お話しさせていただければと思います。でしたら、〇月〇日の13時に、弊社代表の遠藤という者がお伺いさせていただきますので、どうぞよろしくお願いいたします！'],
    ['(社長)', 'お願いします。'],
    ['(篠宮)', 'お忙しいところお時間を頂きましてありがとうございました！失礼いたします！'],
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

    // セクションヘッダー（■受付編、■社長編）
    if (text.startsWith('■')) {
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
      // セルを結合
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
    // 篠宮の発言行
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
    // 受付/社長の発言行
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
    // 空行
    else if (!text && (!row[1] || !row[1])) {
      requests.push({
        updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: 12 }, fields: 'pixelSize' }
      });
    }
  }

  return requests;
}

// ============================================================
// メイン
// ============================================================
async function main() {
  const accessToken = await getAccessToken();

  // メタデータ取得
  const meta = await sheetsApi(accessToken, '?fields=sheets(properties,data.rowData.values.formattedValue)&includeGridData=true');

  for (const sheet of meta.sheets) {
    const title = sheet.properties.title;
    const sheetId = sheet.properties.sheetId;
    const rowCount = sheet.properties.gridProperties.rowCount;
    const colCount = sheet.properties.gridProperties.columnCount;

    // 実データ行数を推定（空行ばかりのエリアを除外）
    const dataRows = (sheet.data?.[0]?.rowData || []).filter(r => r.values?.some(v => v.formattedValue)).length;

    if (title.startsWith('リストデータ_')) {
      console.log(`Formatting "${title}" (${dataRows} rows, ${colCount} cols)...`);
      const reqs = buildDataTabFormat(sheetId, Math.max(dataRows, 2), colCount);
      // 列幅: No.=50, 企業名=240, 事業内容=160, 住所=280, 売上高=110, 純利益=120, 代表者=120, 電話=130, 備考=160, 以降=110
      const widths = [50, 240, 160, 280, 110, 120, 120, 130, 160];
      for (let i = 0; i < Math.min(widths.length, colCount); i++) {
        reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: widths[i] }, fields: 'pixelSize' } });
      }
      // 残り列（日付/結果ペア）
      for (let i = widths.length; i < colCount; i++) {
        reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } });
      }
      await batchUpdate(accessToken, reqs);
      console.log(`  ✅ Done`);

    } else if (title.startsWith('レポート_')) {
      console.log(`Formatting "${title}" (${dataRows} rows, ${colCount} cols)...`);
      const reqs = buildReportTabFormat(sheetId, Math.max(dataRows, 2), colCount);

      // 「月間合計」行をゴールド背景にする
      const rowData = sheet.data?.[0]?.rowData || [];
      for (let r = 0; r < rowData.length; r++) {
        const firstVal = rowData[r]?.values?.[0]?.formattedValue || '';
        if (firstVal === '月間合計') {
          reqs.push({
            repeatCell: {
              range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: colCount },
              cell: {
                userEnteredFormat: {
                  backgroundColor: GOLD,
                  textFormat: { bold: true, fontSize: 11, foregroundColor: NAVY },
                  horizontalAlignment: 'CENTER',
                  verticalAlignment: 'MIDDLE',
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
            }
          });
        }
        // 【レポートサマリー】行
        if (firstVal.includes('レポートサマリー')) {
          reqs.push({
            repeatCell: {
              range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: colCount },
              cell: {
                userEnteredFormat: {
                  backgroundColor: NAVY,
                  textFormat: { bold: true, fontSize: 12, foregroundColor: WHITE },
                  padding: { top: 8, bottom: 8 },
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,padding)',
            }
          });
        }
      }
      await batchUpdate(accessToken, reqs);
      console.log(`  ✅ Done`);

    } else if (title === 'スクリプト') {
      console.log(`Writing and formatting "スクリプト"...`);
      const scriptRows = buildScriptContent();

      // 値書き込み
      await sheetsApi(accessToken, `/values/${encodeURIComponent(title)}:clear`, 'POST');
      await sheetsApi(accessToken, `/values/${encodeURIComponent(title)}?valueInputOption=RAW`, 'PUT', { values: scriptRows });

      // フォーマット
      const reqs = [
        ...buildScriptTabFormat(sheetId, scriptRows.length),
        ...buildScriptSectionFormat(sheetId, scriptRows),
      ];
      await batchUpdate(accessToken, reqs);
      console.log(`  ✅ Done`);
    }
  }

  console.log('\n🎉 All tabs formatted!');
}

main().catch(e => { console.error(e); process.exit(1); });
