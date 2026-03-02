import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import React from "react";
import { updateCallList, insertCallList, deleteCallList, archiveCallList, restoreCallList, insertClient, updateClient, deleteClient, updateAppointment, insertAppointment, deleteAppointment, updatePreCheckResult, updateMember, insertMember, deleteMember, updateMemberReward, fetchCallListItems, updateCallListItem, insertCallListItems, fetchCallRecords, insertCallRecord, deleteCallRecord, deleteCallRecordsByListId, deleteCallListItemsByListId, fetchAllRecallRecords, updateCallRecordMemo, fetchShifts, insertShift, updateShift, deleteShift, fetchCalledItemCountsByListIds, fetchListIdsByItemCriteria, fetchItemsByCallStatus, fetchAllCallListItemsBasic, fetchCallListItemsByIds, fetchCallRecordsByItemIds, fetchCalledCountForSession, fetchZoomUserId, invokeAppoAiReport, invokeGetZoomRecording, updateCallRecordRecordingUrl, invokeTranscribeRecording, fetchCallRecordsByItemId } from "../lib/supabaseWrite";

// ============================================================
// LOGO (base64 embedded)
// ============================================================
const LOGO_SRC = "data:image/png;base64,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";

// ============================================================
// DATA: 架電リスト一覧（実データ90件）
// ============================================================
const CALL_LISTS = [
  { id: 1, company: "株式会社ゼニスキャピタルアドバイザーズ", type: "IFA", status: "架電可能", industry: "建設", count: 1326, manager: "安田 or 屋富祖", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ゼニスキャピタルアドバイザーズ", notes: "" },
  { id: 2, company: "株式会社ゼニスキャピタルアドバイザーズ", type: "IFA", status: "架電可能", industry: "製造", count: 1425, manager: "安田 or 屋富祖", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ゼニスキャピタルアドバイザーズ", notes: "" },
  { id: 3, company: "株式会社ゼニスキャピタルアドバイザーズ", type: "IFA", status: "架電可能", industry: "物流", count: 201, manager: "安田 or 屋富祖", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ゼニスキャピタルアドバイザーズ", notes: "" },
  { id: 4, company: "株式会社ゼニスキャピタルアドバイザーズ", type: "IFA", status: "架電可能", industry: "IT", count: 92, manager: "安田 or 屋富祖", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ゼニスキャピタルアドバイザーズ", notes: "" },
  { id: 5, company: "株式会社ゼニスキャピタルアドバイザーズ", type: "IFA", status: "架電可能", industry: "ガス", count: 14, manager: "安田 or 屋富祖", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ゼニスキャピタルアドバイザーズ", notes: "" },
  { id: 6, company: "株式会社ゼニスキャピタルアドバイザーズ", type: "IFA", status: "架電可能", industry: "全業種", count: 461, manager: "安田 or 屋富祖", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ゼニスキャピタルアドバイザーズ", notes: "" },
  { id: 7, company: "株式会社ユニヴィスコンサルティング", type: "M&A仲介", status: "架電可能", industry: "全業種", count: 1141, manager: "舟山", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ユニヴィスコンサルティング", notes: "" },
  { id: 8, company: "株式会社LST", type: "M&A仲介", status: "架電可能", industry: "建設", count: 5343, manager: "谷地", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_LST", notes: "" },
  { id: 9, company: "株式会社LST", type: "M&A仲介", status: "架電可能", industry: "物流", count: 1092, manager: "谷地", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_LST", notes: "" },
  { id: 10, company: "株式会社LST", type: "M&A仲介", status: "架電可能", industry: "食品関連", count: 516, manager: "谷地", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_LST", notes: "" },
  { id: 11, company: "株式会社LST", type: "M&A仲介", status: "架電可能", industry: "製造", count: 4600, manager: "谷地", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_LST", notes: "" },
  { id: 12, company: "株式会社LST", type: "M&A仲介", status: "架電可能", industry: "不動産", count: 1883, manager: "谷地", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_LST", notes: "" },
  { id: 13, company: "株式会社ジャーニーズ", type: "M&A仲介", status: "架電可能", industry: "全業種", count: 100, manager: "白井", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ジャーニーズ", notes: "" },
  { id: 14, company: "株式会社ジャパンM&Aインキュベーション", type: "M&A仲介", status: "架電可能", industry: "全業種④", count: 523, manager: "新井", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ジャパンM&Aインキュベーション", notes: "" },
  { id: 15, company: "株式会社ジャパンM&Aインキュベーション", type: "M&A仲介", status: "架電可能", industry: "ビルメンテナンス", count: 961, manager: "高野", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ジャパンM&Aインキュベーション", notes: "" },
  { id: 16, company: "株式会社ジャパンM&Aインキュベーション", type: "M&A仲介", status: "架電可能", industry: "福祉用具", count: 159, manager: "高野", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ジャパンM&Aインキュベーション", notes: "" },
  { id: 17, company: "株式会社ジャパンM&Aインキュベーション", type: "M&A仲介", status: "架電可能", industry: "全業種③", count: 110, manager: "高野", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ジャパンM&Aインキュベーション", notes: "" },
  { id: 18, company: "株式会社ジャパンM&Aインキュベーション", type: "M&A仲介", status: "架電可能", industry: "電気工事", count: 477, manager: "多田", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ジャパンM&Aインキュベーション", notes: "" },
  { id: 19, company: "株式会社ジャパンM&Aインキュベーション", type: "M&A仲介", status: "架電可能", industry: "製造②", count: 875, manager: "多田", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ジャパンM&Aインキュベーション", notes: "" },
  { id: 20, company: "株式会社ジャパンM&Aインキュベーション", type: "M&A仲介", status: "架電可能", industry: "管工事", count: 533, manager: "多田", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ジャパンM&Aインキュベーション", notes: "" },
  { id: 21, company: "株式会社ジャパンM&Aインキュベーション", type: "M&A仲介", status: "架電可能", industry: "不動産", count: 285, manager: "多田", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ジャパンM&Aインキュベーション", notes: "" },
  { id: 22, company: "株式会社and A company", type: "M&A仲介", status: "架電可能", industry: "食品⑤", count: 1946, manager: "宮本 or 本城 or 米倉", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_and A company", notes: "" },
  { id: 23, company: "株式会社and A company", type: "M&A仲介", status: "架電可能", industry: "タクシー", count: 167, manager: "本城", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_and A company", notes: "" },
  { id: 24, company: "乃木坂パートナーズ合同会社", type: "ファンド", status: "架電可能", industry: "全業種", count: 574, manager: "田中", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_乃木坂パートナーズ", notes: "スクリプトが基本とは異なるので注意！" },
  { id: 25, company: "乃木坂パートナーズ合同会社", type: "ファンド", status: "架電可能", industry: "受託開発", count: 339, manager: "田中", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_乃木坂パートナーズ", notes: "スクリプトが基本とは異なるので注意！" },
  { id: 26, company: "株式会社キャピタルプライム", type: "M&A仲介", status: "架電可能", industry: "全業種", count: 212, manager: "垣内&加藤", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_キャピタルプライム", notes: "" },
  { id: 27, company: "株式会社キャピタルプライム", type: "M&A仲介", status: "架電可能", industry: "食品製造⑤", count: 428, manager: "垣内&加藤", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_キャピタルプライム", notes: "" },
  { id: 28, company: "見える化株式会社", type: "M&A仲介", status: "架電可能", industry: "介護", count: 84, manager: "田崎", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_見える化", notes: "" },
  { id: 29, company: "見える化株式会社", type: "M&A仲介", status: "架電可能", industry: "建設", count: 49, manager: "田崎", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_見える化", notes: "" },
  { id: 30, company: "見える化株式会社", type: "M&A仲介", status: "架電可能", industry: "製造", count: 43, manager: "田崎", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_見える化", notes: "" },
  { id: 31, company: "見える化株式会社", type: "M&A仲介", status: "架電可能", industry: "全業種", count: 11, manager: "田崎", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_見える化", notes: "" },
  { id: 32, company: "株式会社M&A共創パートナーズ", type: "M&A仲介", status: "架電可能", industry: "IT・人材派遣", count: 1255, manager: "杉浦 or 篠浦 or 田中", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_M&A共創パートナーズ", notes: "" },
  { id: 33, company: "株式会社ハレバレ", type: "M&A仲介", status: "架電可能", industry: "エレベーター", count: 137, manager: "松本", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ハレバレ", notes: "" },
  { id: 34, company: "株式会社ハレバレ", type: "M&A仲介", status: "架電可能", industry: "ゴルフ", count: 286, manager: "松本", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ハレバレ", notes: "" },
  { id: 35, company: "株式会社ハレバレ", type: "M&A仲介", status: "架電可能", industry: "リネンサプライ", count: 131, manager: "松本", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ハレバレ", notes: "" },
  { id: 36, company: "株式会社ハレバレ", type: "M&A仲介", status: "架電可能", industry: "衣服裁縫修理業", count: 89, manager: "松本", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ハレバレ", notes: "" },
  { id: 37, company: "株式会社ハレバレ", type: "M&A仲介", status: "架電可能", industry: "飲食業", count: 635, manager: "松本", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ハレバレ", notes: "" },
  { id: 38, company: "株式会社ハレバレ", type: "M&A仲介", status: "架電可能", industry: "給食", count: 39, manager: "松本", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ハレバレ", notes: "" },
  { id: 39, company: "株式会社ハレバレ", type: "M&A仲介", status: "架電可能", industry: "警備業", count: 573, manager: "松本", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ハレバレ", notes: "" },
  { id: 40, company: "株式会社ハレバレ", type: "M&A仲介", status: "架電可能", industry: "建設コンサルタント", count: 546, manager: "松本", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ハレバレ", notes: "" },
  { id: 41, company: "株式会社ハレバレ", type: "M&A仲介", status: "架電可能", industry: "建物サービス業", count: 526, manager: "松本", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ハレバレ", notes: "" },
  { id: 42, company: "株式会社ハレバレ", type: "M&A仲介", status: "架電可能", industry: "産業廃棄物処理", count: 2054, manager: "松本", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ハレバレ", notes: "" },
  { id: 43, company: "株式会社ハレバレ", type: "M&A仲介", status: "架電可能", industry: "食料品製造", count: 483, manager: "松本", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ハレバレ", notes: "" },
  { id: 44, company: "株式会社ハレバレ", type: "M&A仲介", status: "架電可能", industry: "倉庫業", count: 60, manager: "松本", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ハレバレ", notes: "" },
  { id: 45, company: "株式会社ハレバレ", type: "M&A仲介", status: "架電可能", industry: "電気・設備工事業", count: 1635, manager: "松本", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ハレバレ", notes: "" },
  { id: 46, company: "株式会社ハレバレ", type: "M&A仲介", status: "架電可能", industry: "動物病院", count: 535, manager: "松本", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ハレバレ", notes: "" },
  { id: 47, company: "株式会社ROLEUP", type: "売り手FA", status: "架電可能", industry: "建設", count: 2223, manager: "根本", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ROLEUP", notes: "" },
  { id: 48, company: "株式会社ROLEUP", type: "売り手FA", status: "架電可能", industry: "製造", count: 1414, manager: "根本", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ROLEUP", notes: "" },
  { id: 49, company: "株式会社ROLEUP", type: "売り手FA", status: "架電可能", industry: "物流", count: 276, manager: "根本", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ROLEUP", notes: "" },
  { id: 50, company: "株式会社ROLEUP", type: "売り手FA", status: "架電可能", industry: "情報通信", count: 486, manager: "根本", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ROLEUP", notes: "" },
  { id: 51, company: "株式会社アールイーキャピタル", type: "M&A仲介", status: "架電可能", industry: "リフォーム工事", count: 975, manager: "棚木", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_アールイーキャピタル", notes: "" },
  { id: 52, company: "株式会社アールイーキャピタル", type: "M&A仲介", status: "架電可能", industry: "IT・人材", count: 1075, manager: "棚木", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_アールイーキャピタル", notes: "" },
  { id: 53, company: "株式会社アールイーキャピタル", type: "M&A仲介", status: "架電可能", industry: "不動産管理", count: 132, manager: "棚木", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_アールイーキャピタル", notes: "" },
  { id: 54, company: "合同会社ORCA Capital", type: "M&A仲介", status: "架電可能", industry: "建設", count: 1127, manager: "原田", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ORCA Capital", notes: "" },
  { id: 55, company: "株式会社The Desk", type: "M&A仲介", status: "架電可能", industry: "調剤薬局", count: 2918, manager: "渡邉", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_The Desk", notes: "" },
  { id: 56, company: "ブティックス株式会社", type: "M&A仲介", status: "架電可能", industry: "建設", count: 32529, manager: "—", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ブティックス", notes: "" },
  { id: 57, company: "株式会社Bond Capital", type: "M&A仲介", status: "架電可能", industry: "IT", count: 1786, manager: "金山 or 小泉", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_Bond Capital", notes: "" },
  { id: 58, company: "株式会社AMANE", type: "M&A仲介", status: "架電可能", industry: "自動車整備", count: 49, manager: "鈴木", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_AMANE", notes: "" },
  { id: 59, company: "アイシグマキャピタル株式会社", type: "ファンド", status: "架電可能", industry: "全業種", count: 132, manager: "中島", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_アイシグマキャピタル", notes: "" },
  { id: 60, company: "株式会社ジャパンM&Aインキュベーション", type: "M&A仲介", status: "架電停止", industry: "全業種⑤", count: 1671, manager: "小野寺", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ジャパンM&Aインキュベーション", notes: "" },
  { id: 61, company: "株式会社ジャパンM&Aインキュベーション", type: "M&A仲介", status: "架電停止", industry: "サブコン", count: 3002, manager: "小野寺", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ジャパンM&Aインキュベーション", notes: "買い手→大阪の電気工事会社" },
  { id: 62, company: "株式会社タグボート", type: "M&A仲介", status: "架電停止", industry: "不動産管理", count: 2980, manager: "西野", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_タグボート", notes: "" },
  { id: 63, company: "株式会社リガーレ", type: "M&A仲介", status: "架電停止", industry: "製造", count: 117, manager: "田澤", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_リガーレ", notes: "" },
  { id: 64, company: "株式会社リガーレ", type: "M&A仲介", status: "架電停止", industry: "古紙", count: 34, manager: "田澤", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_リガーレ", notes: "" },
  { id: 65, company: "株式会社リガーレ", type: "M&A仲介", status: "架電停止", industry: "建設", count: 5896, manager: "中川 or 清水 or 横山", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_リガーレ", notes: "" },
  { id: 66, company: "株式会社リガーレ", type: "M&A仲介", status: "架電停止", industry: "食肉関連", count: 105, manager: "中川 or 清水 or 横山", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_リガーレ", notes: "" },
  { id: 67, company: "Icon Capital株式会社", type: "M&A仲介", status: "架電停止", industry: "製造", count: 2179, manager: "梶山", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_Icon Capital", notes: "" },
  { id: 68, company: "株式会社Aston Partners", type: "売り手FA", status: "架電停止", industry: "建設", count: 2557, manager: "加藤", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_Aston Partners", notes: "" },
  { id: 69, company: "株式会社Aston Partners", type: "売り手FA", status: "架電停止", industry: "製造", count: 2565, manager: "加藤", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_Aston Partners", notes: "" },
  { id: 70, company: "株式会社Aston Partners", type: "売り手FA", status: "架電停止", industry: "物流", count: 422, manager: "加藤", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_Aston Partners", notes: "" },
  { id: 71, company: "株式会社Aston Partners", type: "売り手FA", status: "架電停止", industry: "不動産", count: 1206, manager: "加藤", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_Aston Partners", notes: "" },
  { id: 72, company: "株式会社Aston Partners", type: "売り手FA", status: "架電停止", industry: "ガス", count: 39, manager: "加藤", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_Aston Partners", notes: "" },
  { id: 73, company: "株式会社Aston Partners", type: "売り手FA", status: "架電停止", industry: "全業種①", count: 489, manager: "加藤", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_Aston Partners", notes: "" },
  { id: 74, company: "株式会社Aston Partners", type: "売り手FA", status: "架電停止", industry: "全業種②", count: 332, manager: "加藤", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_Aston Partners", notes: "" },
  { id: 75, company: "ジュノー合同会社", type: "M&A仲介", status: "架電停止", industry: "建設", count: 1752, manager: "大野", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ジュノー", notes: "" },
  { id: 76, company: "ジュノー合同会社", type: "M&A仲介", status: "架電停止", industry: "ニッチ製造", count: 897, manager: "大野", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ジュノー", notes: "" },
  { id: 77, company: "ジュノー合同会社", type: "M&A仲介", status: "架電停止", industry: "表面処理", count: 641, manager: "大野", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ジュノー", notes: "" },
  { id: 78, company: "ジュノー合同会社", type: "M&A仲介", status: "架電停止", industry: "溶接・加工", count: 89, manager: "大野", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ジュノー", notes: "" },
  { id: 79, company: "ジュノー合同会社", type: "M&A仲介", status: "架電停止", industry: "全業種", count: 200, manager: "大野", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ジュノー", notes: "" },
  { id: 80, company: "株式会社NEWOLD CAPITAL", type: "M&A仲介", status: "架電停止", industry: "土木・建築", count: 527, manager: "住友&塚原", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_NEWOLD CAPITAL", notes: "" },
  { id: 81, company: "株式会社NEWOLD CAPITAL", type: "M&A仲介", status: "架電停止", industry: "建築", count: 1051, manager: "塩沢", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_NEWOLD CAPITAL", notes: "" },
  { id: 82, company: "株式会社キャピタルプライム", type: "M&A仲介", status: "架電停止", industry: "食品製造①", count: 159, manager: "加藤", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_キャピタルプライム", notes: "" },
  { id: 83, company: "株式会社キャピタルプライム", type: "M&A仲介", status: "架電停止", industry: "食品製造②", count: 170, manager: "加藤", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_キャピタルプライム", notes: "" },
  { id: 84, company: "株式会社キャピタルプライム", type: "M&A仲介", status: "架電停止", industry: "食品製造③", count: 347, manager: "加藤", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_キャピタルプライム", notes: "" },
  { id: 85, company: "株式会社キャピタルプライム", type: "M&A仲介", status: "架電停止", industry: "食品製造④", count: 402, manager: "加藤", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_キャピタルプライム", notes: "" },
  { id: 86, company: "株式会社ジャパンM&Aインキュベーション", type: "M&A仲介", status: "架電停止", industry: "全業種②", count: 976, manager: "小野寺", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ジャパンM&Aインキュベーション", notes: "" },
  { id: 87, company: "株式会社ジャパンM&Aインキュベーション", type: "M&A仲介", status: "架電停止", industry: "自動車・電子機械器具卸", count: 476, manager: "小野寺", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ジャパンM&Aインキュベーション", notes: "" },
  { id: 88, company: "株式会社ジャパンM&Aインキュベーション", type: "M&A仲介", status: "架電停止", industry: "食料飲料卸", count: 447, manager: "小野寺", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ジャパンM&Aインキュベーション", notes: "" },
  { id: 89, company: "株式会社ジャパンM&Aインキュベーション", type: "M&A仲介", status: "架電停止", industry: "倉庫・不動産管理", count: 1001, manager: "小野寺", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ジャパンM&Aインキュベーション", notes: "" },
  { id: 90, company: "エナウトパートナーズ株式会社", type: "M&A仲介", status: "架電停止", industry: "税理士法人", count: 156, manager: "桃井", companyInfo: "", scriptBody: "", cautions: "", script: "スクリプト_ジャパンM&Aインキュベーション", notes: "" },
];

const INTERNS = [
  "成尾 拓輝", "武山 創", "小山 在人", "坂 玲央奈", "山村 蓮",
  "尾鼻 優吾", "古木 優作", "石井 智也", "半田 航希", "高橋 航世",
  "吉川 諒馬", "清水 慧吾", "竹野内 佑大", "伊藤 耶麻音", "上田 悠斗",
  "伊藤 航", "吉藤 永翔", "池田 紘規", "植木 帆希", "徳富 悠風",
  "石井 佑弥", "瀬尾 貫太", "高尾 諭良", "小中谷 樹斗", "岡田 大和",
  "山元 真滉", "浅井 佑", "粟飯原 柚月", "中村 光希", "能登谷 斗夢",
  "鍛冶 雅也", "篠原 大吾朗", "中島 稀里琥", "平 晴來", "羽室 れい",
  "伊藤 結音", "川又 友翔", "小林 武蔵", "渡部 陽生",
];

const DEFAULT_INDUSTRY_RULES = [
  { industry: "建設", rule: "社長は日中現場に出ていることが多い。朝8:00〜9:30と夕方16:00〜18:00が狙い目。平日のみ稼働。", goodDays: [1,2,3,4,5], badDays: [0,6], goodHours: "8:00〜10:00, 16:00〜18:00", badHours: "10:00〜16:00", level: "specific" },
  { industry: "製造", rule: "社長は日中工場に出ていることが多い。朝8:00〜9:30と夕方16:00〜18:00が狙い目。平日のみ稼働。", goodDays: [1,2,3,4,5], badDays: [0,6], goodHours: "8:00〜10:00, 16:00〜18:00", badHours: "10:00〜16:00", level: "specific" },
  { industry: "物流", rule: "社長は日中現場・配送管理で不在が多い。朝8:00〜9:30と夕方16:00〜18:00が狙い目。平日のみ稼働。", goodDays: [1,2,3,4,5], badDays: [0,6], goodHours: "8:00〜10:00, 16:00〜18:00", badHours: "10:00〜16:00", level: "specific" },
  { industry: "IT", rule: "時間帯の差は少ないが、社長の在宅ワーク率が高く通電率自体が低め。平日稼働。", goodDays: [1,2,3,4,5], badDays: [0,6], goodHours: "10:00〜12:00, 14:00〜17:00", badHours: "", level: "warning" },
  { industry: "不動産", rule: "水曜・日曜、または火曜・水曜が定休の会社が多い。水曜は特に避けるべき。", goodDays: [1,4,5,6], badDays: [0,3], goodHours: "8:00〜9:30, 16:00〜18:00", badHours: "", level: "warning" },
  { industry: "不動産管理", rule: "水曜・日曜、または火曜・水曜が定休の会社が多い。水曜は特に避けるべき。", goodDays: [1,4,5,6], badDays: [0,3], goodHours: "8:00〜9:30, 16:00〜18:00", badHours: "", level: "warning" },
  { industry: "調剤薬局", rule: "13:00〜15:00がつながりやすい。平日に加え土曜もつながる。", goodDays: [1,2,3,4,5,6], badDays: [0], goodHours: "13:00〜15:00", badHours: "", level: "specific" },
  { industry: "医療法人", rule: "13:00〜15:00がつながりやすい。平日に加え土曜もつながる。", goodDays: [1,2,3,4,5,6], badDays: [0], goodHours: "13:00〜15:00", badHours: "", level: "specific" },
  { industry: "介護", rule: "曜日を問わず朝早い時間や18:00前後でもつながる。土日もOK。", goodDays: [0,1,2,3,4,5,6], badDays: [], goodHours: "8:00〜10:00, 17:00〜19:00", badHours: "", level: "excellent" },
  { industry: "その他（平日一般）", rule: "平日稼働。朝と夕方がややつながりやすいが大きな差はない。", goodDays: [1,2,3,4,5], badDays: [0,6], goodHours: "8:00〜9:30, 16:00〜18:00", badHours: "", level: "normal" },
];

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

// ============================================================
// Members Data
// ============================================================
const DEFAULT_MEMBERS = [
  { id: 1, name: "成尾 拓輝", university: "大阪市立大学", year: 4, offer: "", team: "成尾", role: "チームリーダー", rank: "トレーニー", rate: 0.22, totalSales: 1880000, joinDate: "2025-09-01" },
  { id: 2, name: "武山 創", university: "立命館大学", year: 3, offer: "M&Aロイヤルアドバイザリー株式会社", team: "高橋", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 865000, joinDate: "2025-09-01" },
  { id: 3, name: "小山 在人", university: "立教大学", year: 4, offer: "株式会社M&A総合研究所", team: "", role: "営業統括", rank: "", rate: 0, totalSales: 0, joinDate: "2025-09-09" },
  { id: 4, name: "坂 玲央奈", university: "立教大学", year: 4, offer: "株式会社日本M&Aセンター", team: "", role: "営業統括", rank: "", rate: 0, totalSales: 0, joinDate: "2025-09-15" },
  { id: 5, name: "山村 蓮", university: "秋田県立大学", year: 3, offer: "", team: "クライアント開拓", role: "", rank: "", rate: 0, totalSales: 165000, joinDate: "2025-09-22" },
  { id: 6, name: "尾鼻 優吾", university: "同志社大学", year: 4, offer: "株式会社ストライク", team: "高橋", role: "副リーダー", rank: "プレイヤー", rate: 0.24, totalSales: 2765000, joinDate: "2025-09-23" },
  { id: 7, name: "古木 優作", university: "早稲田大学", year: 4, offer: "株式会社日本M&Aセンター", team: "成尾", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 1270000, joinDate: "2025-09-30" },
  { id: 8, name: "石井 智也", university: "同志社大学", year: 4, offer: "M&A Lead株式会社", team: "成尾", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 286000, joinDate: "2025-10-06" },
  { id: 9, name: "半田 航希", university: "立教大学", year: 4, offer: "", team: "高橋", role: "副リーダー", rank: "トレーニー", rate: 0.22, totalSales: 495000, joinDate: "2025-10-31" },
  { id: 10, name: "高橋 航世", university: "早稲田大学", year: 1, offer: "", team: "高橋", role: "チームリーダー", rank: "プレイヤー", rate: 0.24, totalSales: 2139000, joinDate: "2025-11-04" },
  { id: 11, name: "吉川 諒馬", university: "明治学院大学", year: 4, offer: "", team: "高橋", role: "副リーダー", rank: "トレーニー", rate: 0.22, totalSales: 902000, joinDate: "2025-11-11" },
  { id: 12, name: "清水 慧吾", university: "同志社大学", year: 4, offer: "株式会社日本M&Aセンター", team: "高橋", role: "副リーダー", rank: "プレイヤー", rate: 0.24, totalSales: 2334000, joinDate: "2025-11-11" },
  { id: 13, name: "竹野内 佑大", university: "立教大学", year: 3, offer: "", team: "成尾", role: "副リーダー", rank: "トレーニー", rate: 0.22, totalSales: 462000, joinDate: "2025-11-24" },
  { id: 14, name: "伊藤 耶麻音", university: "立命館大学", year: 4, offer: "M&Aロイヤルアドバイザリー株式会社", team: "成尾", role: "副リーダー", rank: "トレーニー", rate: 0.22, totalSales: 242000, joinDate: "2025-11-24" },
  { id: 15, name: "上田 悠斗", university: "同志社大学", year: 4, offer: "", team: "成尾", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 0, joinDate: "2025-11-25" },
  { id: 16, name: "伊藤 航", university: "慶應義塾大学", year: 3, offer: "", team: "高橋", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 220000, joinDate: "2025-12-06" },
  { id: 17, name: "吉藤 永翔", university: "金沢大学", year: 3, offer: "", team: "高橋", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 242000, joinDate: "2025-12-07" },
  { id: 18, name: "池田 紘規", university: "Brigham Young University", year: 3, offer: "", team: "成尾", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 0, joinDate: "2025-12-11" },
  { id: 19, name: "植木 帆希", university: "福岡大学", year: 3, offer: "", team: "高橋", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 0, joinDate: "2025-12-11" },
  { id: 20, name: "徳富 悠風", university: "東京科学大学", year: 4, offer: "", team: "成尾", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 220000, joinDate: "2025-12-13" },
  { id: 21, name: "石井 佑弥", university: "同志社大学", year: 3, offer: "", team: "高橋", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 0, joinDate: "2025-12-13" },
  { id: 22, name: "瀬尾 貫太", university: "上智大学", year: 3, offer: "株式会社ストライク", team: "成尾", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 231000, joinDate: "2025-12-17" },
  { id: 23, name: "高尾 諭良", university: "横浜国立大学", year: 3, offer: "", team: "高橋", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 0, joinDate: "2025-12-25" },
  { id: 24, name: "小中谷 樹斗", university: "早稲田大学", year: 1, offer: "", team: "高橋", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 0, joinDate: "2025-12-27" },
  { id: 25, name: "岡田 大和", university: "早稲田大学", year: 4, offer: "株式会社ストライク", team: "成尾", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 0, joinDate: "2025-12-27" },
  { id: 26, name: "山元 真滉", university: "早稲田大学", year: 2, offer: "", team: "成尾", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 495000, joinDate: "2026-01-05" },
  { id: 27, name: "浅井 佑", university: "岡山大学", year: 4, offer: "", team: "成尾", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 0, joinDate: "2026-01-06" },
  { id: 28, name: "粟飯原 柚月", university: "モナッシュ大学", year: 2, offer: "", team: "高橋", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 0, joinDate: "2026-01-07" },
  { id: 29, name: "中村 光希", university: "北海道大学", year: 1, offer: "", team: "成尾", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 0, joinDate: "2026-01-13" },
  { id: 30, name: "能登谷 斗夢", university: "新潟大学", year: 3, offer: "株式会社日本経営総合研究所", team: "成尾", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 0, joinDate: "2026-01-16" },
  { id: 31, name: "鍛冶 雅也", university: "関西大学", year: 3, offer: "株式会社ストライク", team: "高橋", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 0, joinDate: "2026-01-20" },
  { id: 32, name: "篠原 大吾朗", university: "早稲田大学", year: 1, offer: "", team: "高橋", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 0, joinDate: "2026-01-22" },
  { id: 33, name: "中島 稀里琥", university: "青山学院大学", year: 3, offer: "", team: "成尾", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 0, joinDate: "2026-01-23" },
  { id: 34, name: "平 晴來", university: "白百合女子大", year: 2, offer: "", team: "高橋", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 0, joinDate: "2026-01-27" },
  { id: 35, name: "羽室 れい", university: "立命館大学", year: 3, offer: "", team: "高橋", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 0, joinDate: "2026-01-29" },
  { id: 36, name: "伊藤 結音", university: "名古屋工業大学", year: 1, offer: "", team: "成尾", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 0, joinDate: "2026-01-29" },
  { id: 37, name: "川又 友翔", university: "ブラッドフォード大学大学院", year: 1, offer: "", team: "高橋", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 0, joinDate: "2026-01-30" },
  { id: 38, name: "小林 武蔵", university: "慶應義塾大学", year: 1, offer: "", team: "高橋", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 0, joinDate: "2026-01-30" },
  { id: 39, name: "渡部 陽生", university: "早稲田大学", year: 1, offer: "", team: "高橋", role: "メンバー", rank: "トレーニー", rate: 0.22, totalSales: 0, joinDate: "2026-02-09" },
];


// ============================================================
// Corporate Colors: Navy / Gold / White
// ============================================================
const C = {
  navy: "#1a3a5c",
  navyDark: "#0f2540",
  navyDeep: "#0a1929",
  navyLight: "#24537a",
  gold: "#c5a55a",
  goldLight: "#d4ba7a",
  goldDim: "#9e8545",
  goldGlow: "rgba(197, 165, 90, 0.12)",
  white: "#ffffff",
  offWhite: "#f5f3ef",
  cream: "#faf8f4",
  snow: "#fefdfb",
  textDark: "#1a2a3a",
  textMid: "#4a5e72",
  textLight: "#8a9bb0",
  border: "#d8d2c4",
  borderLight: "#e8e3da",
  borderDark: "#2a4a6a",
  green: "#2e8b57",
  greenLight: "rgba(46, 139, 87, 0.1)",
  red: "#c0392b",
  redLight: "rgba(192, 57, 43, 0.08)",
  orange: "#d4760a",
  orangeLight: "rgba(212, 118, 10, 0.1)",
};

// ============================================================
// 架電ステータス定数（全コンポーネント共通）
// ============================================================
const CALL_RESULTS = [
  { id: 'missed',           label: '不通',       excluded: false },
  { id: 'absent',           label: '社長不在',   excluded: false },
  { id: 'reception_block',  label: '受付ブロック', excluded: false },
  { id: 'reception_recall', label: '受付再コール', excluded: false },
  { id: 'ceo_recall',       label: '社長再コール', excluded: false },
  { id: 'appointment',      label: 'アポ獲得',   excluded: true  },
  { id: 'ceo_decline',      label: '社長お断り', excluded: false },
  { id: 'excluded',         label: '除外',       excluded: true  },
];

// ============================================================
// Utility functions
// ============================================================
const getIndustryCategory = (industry) => {
  if (industry.includes("建設") || industry.includes("土木") || industry.includes("サブコン") || industry.includes("管工事") || industry.includes("電気工事") || industry.includes("リフォーム") || industry.includes("建築") || industry.includes("建物") || industry === "建設コンサルタント") return "建設";
  if (industry.includes("製造") || industry.includes("溶接") || industry.includes("表面処理") || industry.includes("ニッチ製造") || industry.includes("食品製造") || industry.includes("食料品製造") || industry.includes("食品") || industry.includes("食肉") || industry.includes("食料") || industry === "給食") return "製造";
  if (industry.includes("不動産")) return "不動産";
  if (industry === "介護" || industry === "福祉用具") return "介護";
  if (industry === "調剤薬局") return "調剤薬局";
  if (industry === "医療法人") return "医療法人";
  if (industry.includes("IT") || industry.includes("情報通信") || industry.includes("受託開発") || industry.includes("人材")) return "IT";
  if (industry.includes("物流") || industry.includes("倉庫") || industry === "タクシー") return "物流";
  if (industry === "飲食業" || industry.includes("飲食")) return "製造";
  if (industry.includes("全業種")) return "その他（平日一般）";
  return "その他（平日一般）";
};

const parseTimeRange = (str) => {
  if (!str) return [];
  return str.split(",").map(s => s.trim()).filter(Boolean).map(range => {
    const [start, end] = range.split("〜").map(t => { const [h, m] = t.split(":").map(Number); return h + (m || 0) / 60; });
    return { start, end };
  });
};

const getCurrentRecommendation = (rules, industry, now, listId, callLogs) => {
  const dayOfWeek = now.getDay();
  const hour = now.getHours();
  const minutes = now.getMinutes();
  const currentTime = hour + minutes / 60;

  // 架電時間外チェック（7時以前・20時以降）
  if (hour < 7 || hour >= 20) {
    return { score: 0, label: "架電時間外", color: C.textLight, timeScore: 0, timeLabel: "架電時間外", recencyScore: 0, recencyLabel: "", isOutsideHours: true };
  }

  // --- Time/Day score (0-100) ---
  const cat = getIndustryCategory(industry);
  const rule = rules.find(r => r.industry === cat);
  let timeScore = 50;
  let timeLabel = "通常";

  if (rule) {
    if (rule.badDays.includes(dayOfWeek)) {
      timeScore = 5;
      timeLabel = "定休日";
    } else {
      const goodRanges = parseTimeRange(rule.goodHours);
      const badRanges = parseTimeRange(rule.badHours);
      const inBad = badRanges.some(r => currentTime >= r.start && currentTime < r.end);
      const inGood = goodRanges.some(r => currentTime >= r.start && currentTime < r.end);

      if (inBad) { timeScore = 20; timeLabel = "非推奨帯"; }
      else if (inGood && rule.goodDays.includes(dayOfWeek)) { timeScore = 95; timeLabel = "ゴールデン"; }
      else if (rule.goodDays.includes(dayOfWeek)) { timeScore = 60; timeLabel = "良好"; }
      else { timeScore = 40; }
    }
  }

  // --- Recency score (0-100): higher = longer since last called = more fresh ---
  let recencyScore = 100; // default: not recently called = highest priority
  let recencyLabel = "未架電";
  if (callLogs && callLogs.length > 0) {
    const listLogs = callLogs.filter(l => l.listId === listId);
    if (listLogs.length > 0) {
      const latestLog = listLogs.reduce((a, b) => new Date(a.date) > new Date(b.date) ? a : b);
      const daysSince = (now - new Date(latestLog.date)) / (1000 * 60 * 60 * 24);
      if (daysSince < 1) { recencyScore = 10; recencyLabel = "本日架電済"; }
      else if (daysSince < 2) { recencyScore = 30; recencyLabel = "昨日架電"; }
      else if (daysSince < 3) { recencyScore = 50; recencyLabel = "3日以内"; }
      else if (daysSince < 7) { recencyScore = 65; recencyLabel = "1週間以内"; }
      else if (daysSince < 14) { recencyScore = 80; recencyLabel = "2週間以内"; }
      else if (daysSince < 30) { recencyScore = 90; recencyLabel = "1ヶ月以内"; }
      else { recencyScore = 95; recencyLabel = Math.floor(daysSince) + "日前"; }
    }
  }

  // --- Combined score: 35% time, 65% recency ---
  const combined = Math.round(timeScore * 0.30 + recencyScore * 0.70);

  // --- Determine label and color ---
  let label, color;
  if (timeScore <= 10) {
    label = timeLabel;
    color = C.red;
  } else if (combined >= 80) {
    label = "おすすめ";
    color = C.green;
  } else if (combined >= 60) {
    label = "良好";
    color = C.navyLight;
  } else if (combined >= 40) {
    label = "通常";
    color = C.textLight;
  } else if (combined >= 20) {
    label = "低";
    color = C.orange;
  } else {
    label = timeLabel;
    color = C.red;
  }

  return { score: combined, label, color, timeScore, timeLabel, recencyScore, recencyLabel };
};

// ============================================================
// Sub-components
// ============================================================
const Badge = ({ children, color = C.navy, glow = false, small = false }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: small ? "1px 7px" : "2px 10px",
    borderRadius: 4, fontSize: small ? 10 : 11, fontWeight: 600, letterSpacing: 0.3,
    color, background: glow ? color + "14" : "transparent",
    border: "1px solid " + color + "30", whiteSpace: "nowrap",
  }}>{children}</span>
);

const ScorePill = ({ score, label, color }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 7,
    padding: "3px 10px 3px 4px", borderRadius: 20,
    background: color + "10", border: "1px solid " + color + "25",
    flexShrink: 0,
  }}>
    <div style={{
      width: 26, height: 26, minWidth: 26, minHeight: 26, borderRadius: "50%",
      background: "conic-gradient(" + color + " " + (score * 3.6) + "deg, " + C.borderLight + " 0deg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      <div style={{
        width: 18, height: 18, minWidth: 18, minHeight: 18, borderRadius: "50%", background: C.white,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 8, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace",
        flexShrink: 0,
      }}>{score}</div>
    </div>
    <span style={{ fontSize: 11, fontWeight: 600, color, whiteSpace: "nowrap" }}>{label}</span>
  </div>
);

const LOGO_VERTICAL = "data:image/png;base64,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";
const FONT_URL = "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700;900&family=Noto+Serif+JP:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Cinzel:wght@700;800;900&family=Outfit:wght@400;500;600;700;800;900&display=swap";

// ============================================================
// MAIN APP
// ============================================================
const CLIENT_DATA = [{"no": 1, "status": "支援中", "contract": "済", "company": "株式会社ゼニスキャピタルアドバイザーズ", "industry": "IFA", "target": 5, "rewardType": "G", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "Google", "contact": "LINE", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 2, "status": "支援中", "contract": "済", "company": "株式会社ユニヴィスコンサルティング", "industry": "M&A", "target": 10, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "2,3月は7割", "listSrc": "先方持ち", "calendar": "Google", "contact": "メール", "noteFirst": "2,3月は7割の金額\n・そちら\n・売り上げ2-30億\n・担当者複数（一人2000件ほど？）\n・希望は10件\n・ほぼ担ぎ\n・2月1日より\n・単価は7割で\n・グーグルカレンダー捨て垢\n・将来的な検討可否\n・面談経験\n・ちゃんとオーナーなのか\n・必ず聞く事項共有\n\n・2/16-\n・自社のインターン生と量と質どうか\n・舟山様メインで（直属が数名）\n・今週で2000件、その後追加で（1週間に1つ）\n・最低でも月10件（一人当たり）\n・近場、東京神奈川、東海道沿線\n・業種：食品、製造、飲食、卸、測量、医療法人、運送（5-6業種）\n・2-20億\n・グーグルカレンダー", "noteKickoff": "", "noteRegular": ""}, {"no": 3, "status": "支援中", "contract": "済", "company": "株式会社LST", "industry": "M&A", "target": 20, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "Google", "contact": "Chatwork", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 4, "status": "支援中", "contract": "済", "company": "株式会社ジャパンM&Aインキュベーション", "industry": "M&A", "target": 20, "rewardType": "A", "paySite": "末締め翌月末日", "payNote": "", "listSrc": "先方持ち", "calendar": "Spir", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 5, "status": "支援中", "contract": "済", "company": "株式会社and A company", "industry": "M&A", "target": 10, "rewardType": "A", "paySite": "末締め翌月末日", "payNote": "", "listSrc": "両方", "calendar": "Google", "contact": "Slack", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 6, "status": "支援中", "contract": "済", "company": "株式会社ハレバレ", "industry": "M&A", "target": 15, "rewardType": "A", "paySite": "末締め翌月末日", "payNote": "", "listSrc": "先方持ち", "calendar": "Google", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 7, "status": "支援中", "contract": "済", "company": "株式会社ROLEUP", "industry": "M&A", "target": 10, "rewardType": "A", "paySite": "末締め翌月末日", "payNote": "請求書宛先注意", "listSrc": "当社持ち", "calendar": "なし", "contact": "メール", "noteFirst": "■リスト\n・うちで\n・売上5億以上10億円未満\n・当期純利益30百万\n・社長の年齢\n・エリア：一都三県\n・業種：製造、物流、サブコン\n■スクリプト\n・仲介ではない、会計士を中心とした専門家集団でして（FA）\n■カレンダー\n・outlook\n・3,4名", "noteKickoff": "", "noteRegular": ""}, {"no": 8, "status": "支援中", "contract": "済", "company": "乃木坂パートナーズ合同会社", "industry": "M&A", "target": 3, "rewardType": "H", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "両方", "calendar": "Google", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 9, "status": "支援中", "contract": "済", "company": "株式会社ジャーニーズ", "industry": "M&A", "target": 4, "rewardType": "K", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "先方持ち", "calendar": "なし", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 10, "status": "支援中", "contract": "済", "company": "株式会社キャピタルプライム", "industry": "M&A", "target": 5, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "なし", "contact": "メール", "noteFirst": "・酒蔵\n・新規参入できない\n\n・食品製造業(清酒製造業含む)\n・東北地方を除く全国エリア\n・月5件の供給希望\n・譲渡意思が高いアポ供給を前提としているため、訪問希望\n・基本的には垣内・加藤の2名での訪問を想定\n・スクリプトのひな型共有\n・カレンダーは適宜ベタ打ちで", "noteKickoff": "", "noteRegular": ""}, {"no": 11, "status": "支援中", "contract": "済", "company": "見える化株式会社", "industry": "M&A", "target": 3, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "TimeRex", "contact": "メール", "noteFirst": "・宮崎県のみ\n・業種問わず\n・売上2-3億で\n・ほぼ紹介\n・営業代行入れてる\n・5万減額\n\n・リスト\n・業種しぼりなし\n・売上1億～10億\n・宮崎\n\n・スクリプトについて、\n・宮崎県特化で\n・最低手数料300万（補助金使えば100万）\n・完全成功報酬\n\n・タイムレックス\n・バッファー\n\n・3件", "noteKickoff": "", "noteRegular": ""}, {"no": 12, "status": "支援中", "contract": "済", "company": "株式会社アールイーキャピタル", "industry": "M&A", "target": 10, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "3件目までは70,000円", "listSrc": "当社持ち", "calendar": "Google", "contact": "メール", "noteFirst": "・リグロスのM&A仲介部門\n・買収もする（人材、受託開発、SES）\n・レウス？不動産会社のグループもある（賃貸管理の買収）\n・1件目～3件目は70,000円\n・月10件\n\n・うちで準備\n　業種：不動産管理、受託開発、SES、人材派遣\n　売上：3億\n　当期純利益：500万（SES、人材）、1000万（受託開発、不動産）\n　従業員数：5名（SES、受託開発、人材）、10名（不動産）\n　エリア：一都三県\n・スクリプト：会社名義で、リグロスのグループとしてと伝える、不動産はレウスの名前出していい、リグロスのバイネームでもいい\n　決算書いければ（事前確認時に）\n　M&Aのご面談経験\n・カレンダー連携：グーグル（棚木）、対面、1営業日空ける、土日も可能", "noteKickoff": "", "noteRegular": ""}, {"no": 13, "status": "支援中", "contract": "済", "company": "合同会社ORCA Capital", "industry": "M&A", "target": 3, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "TimeRex", "contact": "メール", "noteFirst": "・社名は電話ではなし\n・売上200億以上、利益20億、東海に本社を構える、全国展開のサブコン\n・M&Aの検討余地があるかをヒアリング\n・対面\n・TimeRex", "noteKickoff": "", "noteRegular": ""}, {"no": 14, "status": "支援中", "contract": "済", "company": "ライジング・ジャパン・エクイティ株式会社", "industry": "M&A", "target": 1, "rewardType": "D", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "先方持ち", "calendar": "なし", "contact": "メール", "noteFirst": "・コストについて、DDあたりから決済を取っていく。決済\n・あしもとはリストない\n・先方からリスト供給\n・業種：NGなし（金融を除き）、建設、アウトソーシング、自動車関連のメーカー（B2B）\n・EBITDA5億以上\n\n・B to B\n・製造、建設、アウトソーシング\n・検討しやすい分野\n・ノウハウ在り\n・事業承継的観点ニーズありそう\n・住友商事がバックに\n\n・防食は既存ある\n・DM\n\n・スクリプト通りで\n\n・出席者確定してない\n・仮で日程", "noteKickoff": "", "noteRegular": ""}, {"no": 15, "status": "支援中", "contract": "済", "company": "株式会社The Desk", "industry": "M&A", "target": 3, "rewardType": "B", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "先方持ち", "calendar": "なし", "contact": "メール", "noteFirst": "・一都三県\n・処方箋枚数12,000件\n・2万ずつ減額\n・まずは2億以上5億未満で2件ほど\n\n・リストは合わせ技\n・一都三県\n・5億未満\n\n・スクリプトはうちで任せる\n・御社をグループに迎え入れる形で一緒に成長したいという会社がいる\n・譲渡意向について\n\n・TimeRex\n・対面\n・3人かつ2つのスケジュール\n・渡邉様が行くと伝える", "noteKickoff": "", "noteRegular": ""}, {"no": 16, "status": "支援中", "contract": "済", "company": "株式会社M&A共創パートナーズ", "industry": "M&A", "target": 3, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "TimeRex", "contact": "Slack", "noteFirst": "・IT業界・人材派遣（グループ親会社がやっている）\n・前向きに（決済必要）\n・予算50万円", "noteKickoff": "", "noteRegular": ""}, {"no": 17, "status": "支援中", "contract": "済", "company": "株式会社タグボート", "industry": "M&A", "target": 3, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "先方持ち", "calendar": "Google", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 18, "status": "支援中", "contract": "済", "company": "ブティックス株式会社", "industry": "M&A", "target": 5, "rewardType": "M", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "なし", "contact": "メール", "noteFirst": "■リスト\n・建設業界でうち\n・売上5億未満、当期純利益はなしでOK\n・建築・内装・管工事・電気工事\n■スクリプト\n・基本通りでOK\n・スクリプト共有\n■カレンダー\n・\n■その他\n・月10件（それ以上でも可能）", "noteKickoff": "", "noteRegular": ""}, {"no": 19, "status": "支援中", "contract": "済", "company": "株式会社Bond Capital", "industry": "M&A", "target": 5, "rewardType": "H", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "両方", "calendar": "Google", "contact": "メール", "noteFirst": "対面(オンラインも可)、基本スクリプト、金山様と小泉様にアポ振り", "noteKickoff": "", "noteRegular": ""}, {"no": 20, "status": "支援中", "contract": "済", "company": "株式会社AMANE", "industry": "M&A", "target": 3, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "先方持ち", "calendar": "なし", "contact": "メール", "noteFirst": "自動車整備業界、交通事業者", "noteKickoff": "", "noteRegular": ""}, {"no": 21, "status": "支援中", "contract": "済", "company": "アイシグマキャピタル株式会社", "industry": "M&A", "target": 2, "rewardType": "J", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "先方持ち", "calendar": "Google", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 22, "status": "停止中", "contract": "済", "company": "M&A Lead株式会社", "industry": "M&A", "target": 0, "rewardType": "L", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "両方", "calendar": "Google", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 23, "status": "停止中", "contract": "済", "company": "株式会社リガーレ", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "TimeRex", "contact": "Chatwork", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 24, "status": "停止中", "contract": "済", "company": "株式会社承継支援機構", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "Google", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 25, "status": "停止中", "contract": "済", "company": "Icon Capital株式会社", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "末締め翌月25日", "payNote": "消費税支払い不可", "listSrc": "当社持ち", "calendar": "なし", "contact": "メール", "noteFirst": "スクリプト要注意、登録前は消費税不可", "noteKickoff": "", "noteRegular": ""}, {"no": 26, "status": "停止中", "contract": "済", "company": "株式会社Aston Partners", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "なし", "contact": "メール", "noteFirst": "・売り手、年始以降or年末で再キックオフ\n・担当もつける\n・リスト再抽出\n・案件20件\n・印刷（関西）、病院、介護、レジャー用品レンタル、補助金事業\n・現状すぐ投げられる案件が、4,5社。滞留気味\n・ISコンサルも\n・買い手FAとのつながり強くしたい。仲介で買い手FAのような動きができる会社紹介してほしいと\n\n・売りFA（小さいと仲介）\n・業種：問わず\n・主要都市：対面、地方都市：オンライン\n・当期純利益1億円以上\n・スクリプトは他社と同じで\n・訪問担当者：加藤さん\n・月次でMTG\n・レポートも出す\n・匠アドバイザリー\n・上限は特になし\n\n・奈良県のまたせめていい\n・ISコンサルもゆくゆくは", "noteKickoff": "", "noteRegular": ""}, {"no": 27, "status": "停止中", "contract": "済", "company": "ジュノー合同会社", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "耀伝心株式会社宛に請求", "listSrc": "当社持ち", "calendar": "TimeRex", "contact": "メール", "noteFirst": "年明けから建設リストスタート", "noteKickoff": "", "noteRegular": ""}, {"no": 28, "status": "停止中", "contract": "済", "company": "株式会社NEWOLD CAPITAL", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "※メール確認", "listSrc": "先方持ち", "calendar": "eeasy", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 29, "status": "停止中", "contract": "済", "company": "エナウトパートナーズ株式会社", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "末締め翌月末日", "payNote": "", "listSrc": "先方持ち", "calendar": "Spir", "contact": "メール", "noteFirst": "税理士法人、リスト100件、Spir、基本オンライン(都内は対面可)、注意事項多し", "noteKickoff": "", "noteRegular": ""}, {"no": 30, "status": "停止中", "contract": "済", "company": "株式会社経営承継支援", "industry": "M&A", "target": 0, "rewardType": "H", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "両方", "calendar": "Google", "contact": "Chatwork", "noteFirst": "未定", "noteKickoff": "", "noteRegular": ""}, {"no": 31, "status": "停止中", "contract": "済", "company": "株式会社M&A works", "industry": "M&A", "target": 0, "rewardType": "H", "paySite": "末締め翌月末日", "payNote": "リンクタイズワークスに請求", "listSrc": "当社持ち", "calendar": "なし", "contact": "Slack", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 32, "status": "停止中", "contract": "済", "company": "株式会社Unlock", "industry": "M&A", "target": 0, "rewardType": "L", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "先方持ち", "calendar": "Google", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 33, "status": "停止中", "contract": "済", "company": "株式会社メディカルエイド", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "先方持ち", "calendar": "なし", "contact": "メール", "noteFirst": "関東、1万社、対面、カレンダーはべたうち？", "noteKickoff": "", "noteRegular": ""}, {"no": 34, "status": "停止中", "contract": "済", "company": "あさひ国際会計株式会社", "industry": "M&A", "target": 0, "rewardType": "N", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "なし", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 35, "status": "停止中", "contract": "済", "company": "行政書士法人フォワード", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "なし", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 36, "status": "停止中", "contract": "済", "company": "ゴエンキャピタル株式会社", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "先方持ち", "calendar": "なし", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 37, "status": "停止中", "contract": "済", "company": "株式会社ベネフィットM&Aコンサルタンツ", "industry": "M&A", "target": 0, "rewardType": "L", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "先方持ち", "calendar": "なし", "contact": "Chatwork", "noteFirst": "カレンダーは5営業日取ってもらえればどこに入れてもいい。訪問は大阪府、神戸市、京都市、奈良市でその他オンライン", "noteKickoff": "", "noteRegular": ""}, {"no": 38, "status": "停止中", "contract": "済", "company": "株式会社AMI", "industry": "M&A", "target": 0, "rewardType": "H", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "先方持ち", "calendar": "なし", "contact": "Chatwork", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 39, "status": "停止中", "contract": "済", "company": "SoFun株式会社", "industry": "M&A", "target": 0, "rewardType": "L", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "Google", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 40, "status": "停止中", "contract": "", "company": "NYC株式会社", "industry": "M&A", "target": 0, "rewardType": "L", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "Google", "contact": "Slack", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 41, "status": "準備中", "contract": "済", "company": "株式会社NOAH", "industry": "M&A", "target": 30, "rewardType": "C", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "Google", "contact": "Slack", "noteFirst": "・売上30億円未満の企業様: 15万円/アポ(税別)\n・売上30億円以上の企業様: 20万円/アポ(税別)\n\n■リスト\n・当期純利益2000万以上、\n・売上5億以上100億未満\n・従業員20名以上（上限外し）\n・4000件がベスト\n■スクリプト\n・営業周りでトップライン目指せる（営業力の拡張）\n・ファンドとは言ってほしくない\n・代表と取締役\n・永続保有\n■カレンダー\n・遠藤さん、関（都合がつけば）\n・グーグル\n・一都三県：前後2時間\n・出張NG日には一都三県以外だめ\n・一都三県以外は翌週以降で\n■アポ数\n・毎月30アポ\n■その他\n・かける順番\n　-DEFI→GHO\n・ほかのアプローチでもよい\n・スラック\n・ゆくゆくは買い手名義で\n・テストコール、1000ごとにかけて、レポート提出", "noteKickoff": "", "noteRegular": ""}, {"no": 42, "status": "準備中", "contract": "", "company": "株式会社ユニヴ", "industry": "M&A", "target": 3, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "先方持ち", "calendar": "なし", "contact": "LINE", "noteFirst": "■リスト\n・ユニヴさんのリスト（調剤薬局）\n・都道府県順で（一都道府県あたり数百社）\n・関東一部、関西\n\n■実施形式について\n・対面\n・基本的には社長\n\n■希望アポ数\n・2-3件\n\n■スクリプト\n・事業譲渡（9割は）\n・事業譲渡寄りのトーク\n・独立希望の薬剤師、1000名いる\n・実績（譲渡実行100件）、登録数（1000名を超える）を交えて\n・スクリプト送る\n\n■カレンダー\n・ベタ打ち\n\n■今後の連携\n・LINE\n\n■担当\n・吉田こうき様\n・北関東", "noteKickoff": "", "noteRegular": ""}, {"no": 43, "status": "準備中", "contract": "", "company": "株式会社ウィルゲート", "industry": "M&A", "target": 0, "rewardType": "E", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・録音を提供\n・月5,6件\n・売上1億円以上をアプローチ\n・1～10億：10万円\n・10～30億：15万円\n・30億以上：20万円\n・最初5件から\n・スラック\n・ウィルのドメインで、メアド準備\n・2月16日\n・契約書ひな形", "noteKickoff": "", "noteRegular": ""}, {"no": 44, "status": "準備中", "contract": "", "company": "株式会社HBD", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "社名伝達は事前確認時がよさそう", "noteKickoff": "", "noteRegular": ""}, {"no": 45, "status": "準備中", "contract": "", "company": "株式会社エムステージマネジメントソリューションズ", "industry": "M&A", "target": 0, "rewardType": "F", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・外部でもやっている\n・リストは顧客で\n・クリニックとその周辺領域（サプリのメーカー、リハビリ機器）\n・最初は1,2件", "noteKickoff": "", "noteRegular": ""}, {"no": 46, "status": "準備中", "contract": "", "company": "ファストドクター株式会社", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・むらはしさん、エーネックス？\n・月20件（残り10件）\n・初回から対面\n・スコープ：保険診療の医療法人（歯医者は除く）、クリニック向けの決済サービス、内科・精神外科・訪問医療、全国\n・これまで5法人買収、次期終わりまでに20件\n・1.5～10億円、調整後EBITDA3,000万～　広がるかも\n・株式会社が非営利法人を買収するのが、広く知られるとよくない→スクリプト大事\n・単価相談", "noteKickoff": "", "noteRegular": ""}, {"no": 47, "status": "準備中", "contract": "", "company": "ジャパンキャピタル株式会社", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "まずは数件からか", "noteKickoff": "", "noteRegular": ""}, {"no": 48, "status": "準備中", "contract": "", "company": "株式会社みどり医療経営研究所", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・就労支援A型\n・みどり未来パートナーズのグループ\n・外注経験なし\n・金融機関なし\n・みどりで買収したい\n・就労継続支援A型の会社にアプローチしてほしい（買収したい）", "noteKickoff": "", "noteRegular": ""}, {"no": 49, "status": "準備中", "contract": "", "company": "株式会社スリーエスコンサルティング", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 50, "status": "準備中", "contract": "", "company": "Lキャタルトン", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・コンシューマー（B to C）※製造でも可能\n・中堅企業特化で\n・数十億～数百億\n・EBITDA10億以上\n・契約書、都度", "noteKickoff": "", "noteRegular": ""}, {"no": 51, "status": "保留", "contract": "済", "company": "株式会社ストックパートナーズ", "industry": "M&A", "target": 0, "rewardType": "I", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 52, "status": "保留", "contract": "済", "company": "高田承継合同会社", "industry": "M&A", "target": 0, "rewardType": "I", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 53, "status": "保留", "contract": "済", "company": "株式会社Arii", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "末締め翌月末日", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "向こうのリスト待ち。初回面談同席し仲介の立ち回りしたら20万", "noteKickoff": "", "noteRegular": ""}, {"no": 54, "status": "保留", "contract": "済", "company": "株式会社AB&Company", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 55, "status": "保留", "contract": "済", "company": "株式会社技術承継機構", "industry": "M&A", "target": 0, "rewardType": "H", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "9月ごろから開始か", "noteKickoff": "", "noteRegular": ""}, {"no": 56, "status": "保留", "contract": "済", "company": "株式会社九州経営研究所", "industry": "M&A", "target": 0, "rewardType": "L", "paySite": "末締め翌月末日", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "最初の5件（建設2件、病院3件）のみ5万円", "noteKickoff": "", "noteRegular": ""}, {"no": 57, "status": "保留", "contract": "済", "company": "株式会社ビズハブ", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "ISコンサルティングしてほしい、自社のインターン生をSPで面倒見てほしいと、ピンポイント依頼にさりそうと", "noteKickoff": "", "noteRegular": ""}, {"no": 58, "status": "中期フォロー", "contract": "", "company": "株式会社Unlock.ly", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 59, "status": "中期フォロー", "contract": "", "company": "コロニー株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 60, "status": "中期フォロー", "contract": "", "company": "DawnX株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 61, "status": "中期フォロー", "contract": "", "company": "クレアシオン・キャピタル株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 62, "status": "中期フォロー", "contract": "", "company": "株式会社M&Aクラウド", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 63, "status": "中期フォロー", "contract": "", "company": "Shopify Japan株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 64, "status": "中期フォロー", "contract": "", "company": "株式会社CINC Capital", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "末締め翌月末日", "payNote": "月額50万で6,7件供給希望", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 65, "status": "中期フォロー", "contract": "", "company": "株式会社グロースアドバンテッジ", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 66, "status": "中期フォロー", "contract": "", "company": "みらいエフピー株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 67, "status": "中期フォロー", "contract": "", "company": "インクグロウ株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 68, "status": "中期フォロー", "contract": "", "company": "インターリンク株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 69, "status": "中期フォロー", "contract": "", "company": "九州M&Aアドバイザーズ株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 70, "status": "中期フォロー", "contract": "", "company": "株式会社M&A Properties", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 71, "status": "中期フォロー", "contract": "", "company": "株式会社ユニヴィスコンサルティング", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 72, "status": "中期フォロー", "contract": "", "company": "ノアインドアステージ株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 73, "status": "中期フォロー", "contract": "", "company": "株式会社日本観光開発機構", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 74, "status": "中期フォロー", "contract": "", "company": "株式会社M&Aナビ", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 75, "status": "中期フォロー", "contract": "", "company": "株式会社ユナイテッド・フロント・パートナーズ", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "2か月限定で、10,12,15万の単価となるかも。予算年間1,000万", "noteKickoff": "", "noteRegular": ""}, {"no": 76, "status": "中期フォロー", "contract": "", "company": "Blue Works M&A株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 77, "status": "中期フォロー", "contract": "", "company": "合同会社JP-FORCE", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 78, "status": "中期フォロー", "contract": "", "company": "中之島キャピタル株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 79, "status": "中期フォロー", "contract": "", "company": "株式会社Blue Rose", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 80, "status": "中期フォロー", "contract": "", "company": "株式会社M&Aフォース", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 81, "status": "中期フォロー", "contract": "", "company": "マクスウェルグループ株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 82, "status": "中期フォロー", "contract": "", "company": "株式会社OAGコンサルティング", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 83, "status": "中期フォロー", "contract": "", "company": "株式会社弘優社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 84, "status": "中期フォロー", "contract": "", "company": "株式会社メディカルグロース", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 85, "status": "中期フォロー", "contract": "", "company": "株式会社SECURITY BRIDGE", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "他社との契約解除を進めている", "noteKickoff": "", "noteRegular": ""}, {"no": 86, "status": "中期フォロー", "contract": "", "company": "一般社団法人日本経営士会", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 87, "status": "中期フォロー", "contract": "", "company": "株式会社アンビュー", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 88, "status": "中期フォロー", "contract": "", "company": "株式会社ファイ・ブリッジ", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 89, "status": "中期フォロー", "contract": "", "company": "株式会社つなぐコンサルティング", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 90, "status": "中期フォロー", "contract": "", "company": "ノーススターアドバイザリー株式会社", "industry": "IFA", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 91, "status": "中期フォロー", "contract": "", "company": "株式会社ReBridge Partners", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 92, "status": "中期フォロー", "contract": "", "company": "M&A BASE株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "1月から支援開始となるか", "noteKickoff": "", "noteRegular": ""}, {"no": 93, "status": "中期フォロー", "contract": "", "company": "株式会社Linkrop", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 94, "status": "中期フォロー", "contract": "", "company": "山田＆パートナーズアドバイザリー株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "買い手マッチングお願いしたいと。1件5万×20アポで月額100万円の固定でどうかと", "noteKickoff": "", "noteRegular": ""}, {"no": 95, "status": "中期フォロー", "contract": "", "company": "山田コンサルティンググループ株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 96, "status": "中期フォロー", "contract": "", "company": "株式会社ファルコン・キャピタル", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 97, "status": "中期フォロー", "contract": "", "company": "Fore Bridge株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "製造、食品を中心に。3月までに業界特化型のファンドを蘇生", "noteKickoff": "", "noteRegular": ""}, {"no": 98, "status": "中期フォロー", "contract": "", "company": "株式会社YMFGキャピタル", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 99, "status": "中期フォロー", "contract": "", "company": "イノベーションフォース株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 100, "status": "中期フォロー", "contract": "", "company": "マラトンキャピタルパートナーズ株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 101, "status": "中期フォロー", "contract": "", "company": "日本プライベートエクイティ株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・JR四国とファンド立ち上げた、四国ソーシングしたい\n・NGは不動産、金融、農業、養鶏場、養殖（それ以外は検討可能）\n・ホテル、リネン、農産物加工、お菓子、こちらは検討経験あり\n・実質EBITDA1億円以上（少し低くても検討可能）\n・現状のリストで100社\n・exitについて、JR四国にグループインできるかもだが、あまり押しはしない\n・弟が不動産MAやってる、自社ビルターゲット、そちらも支援するかも", "noteKickoff": "", "noteRegular": ""}, {"no": 102, "status": "中期フォロー", "contract": "", "company": "株式会社エコ・ブレーンズ", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 103, "status": "中期フォロー", "contract": "", "company": "株式会社みどり未来パートナーズ", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "【買収】\n・社労士法人、税理士法人（東京）\n・WEBメディア（東京）\n\n【仲介】\n・建設、食品製造・加工、運送業", "noteKickoff": "", "noteRegular": ""}, {"no": 104, "status": "中期フォロー", "contract": "", "company": "みらいアーク株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 105, "status": "中期フォロー", "contract": "", "company": "株式会社日本産業推進機構", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・ロールアップ強化\n・ロールアップ→\n　日本語学校（5件）、\n　介護（施設系、ホスピス、首都圏、中部地域、その間、、規模が多ければその他も、3件）\n　アパマン（賃貸管理）\n・全部合わせて100件前後", "noteKickoff": "", "noteRegular": ""}, {"no": 106, "status": "中期フォロー", "contract": "", "company": "株式会社ロータスアドバイザリー", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・仲介会社ではないので、事業改善のコンサルなどもしている\n・5億以上で", "noteKickoff": "", "noteRegular": ""}, {"no": 107, "status": "中期フォロー", "contract": "", "company": "株式会社タイミー", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・全国の人材会社ロールアップ\n・M&Aチーム3名\n・中途\n・人材派遣\n・HR全般\n・業務請負（特に物流）", "noteKickoff": "", "noteRegular": ""}, {"no": 108, "status": "中期フォロー", "contract": "", "company": "株式会社LEG", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "買い手マッチング需要ある", "noteKickoff": "", "noteRegular": ""}, {"no": 109, "status": "中期フォロー", "contract": "", "company": "合同会社RenDan", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・福祉施設、飲食店、一都三県\n・最低報酬150万\n・2,3か月でCL\n・その分件数担保\n・月2件/人（今は月1件）\n・買い手も脱サラ等が多い\n・売りは紹介（月10件）\n・1月以降で福祉系でLP出す\n・うちでリスト\n・福祉だけで5件\n・飲食と福祉系のリストの条件を送ってもらう", "noteKickoff": "", "noteRegular": ""}, {"no": 110, "status": "中期フォロー", "contract": "", "company": "株式会社事業承継通信社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 111, "status": "中期フォロー", "contract": "", "company": "みなと不動産株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・買収していきたい\n・ビルメンテ、薬局\n・自走できるものであれば、2-3億\n・仲介入ってほしい\n・ビルメンCLしそう\n・管工事、土木設計", "noteKickoff": "", "noteRegular": ""}, {"no": 112, "status": "中期フォロー", "contract": "", "company": "株式会社メディカルアシスト", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・医師会と提携しており、売りは月5,6件くる\n・M&Aは2名体制\n・買い手が欲しい\n・現状は売りFA主体", "noteKickoff": "", "noteRegular": ""}, {"no": 113, "status": "中期フォロー", "contract": "", "company": "リゾルトパートナーズ株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・ファンドよりもアドバイザリーの方でお願いしたいと", "noteKickoff": "", "noteRegular": ""}, {"no": 114, "status": "中期フォロー", "contract": "", "company": "宏和印刷株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 115, "status": "中期フォロー", "contract": "", "company": "ウィズアップコンサルティング株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 116, "status": "中期フォロー", "contract": "", "company": "イシン株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・ベストベンチャー100からの流入が多い\n・翌月末支払いにしたい", "noteKickoff": "", "noteRegular": ""}, {"no": 117, "status": "中期フォロー", "contract": "", "company": "株式会社M&A総研ホールディングス", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "リストは総研から（システムも）\nインターン採用は辞めてる", "noteKickoff": "", "noteRegular": ""}, {"no": 118, "status": "中期フォロー", "contract": "", "company": "サンライズキャピタル株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 119, "status": "中期フォロー", "contract": "", "company": "Trustar Capital Partners Japan", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 120, "status": "中期フォロー", "contract": "", "company": "きらぼしキャピタル株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・ロールアップでピンポイントで依頼将来できるかも\n・バイアウトでレガシー産業見ている。（金融と不動産以外）業種は問わず\n・EBITDA1億～5億\n・LBO活用して、もう少し大きいところも", "noteKickoff": "", "noteRegular": ""}, {"no": 121, "status": "中期フォロー", "contract": "", "company": "杉山亜夢里税理士事務所", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・不動産MAが多い\n・買い手マッチングニーズもある？", "noteKickoff": "", "noteRegular": ""}, {"no": 122, "status": "中期フォロー", "contract": "", "company": "株式会社刈田・アンド・カンパニー", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 123, "status": "中期フォロー", "contract": "", "company": "ニューホライズンキャピタル株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・規模は50億未満かな？\n・ロングリストの質\n・案件がなくなってきた", "noteKickoff": "", "noteRegular": ""}, {"no": 124, "status": "中期フォロー", "contract": "", "company": "百五みらい投資株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・EBITDA1億\n・年間1-2件\n・重点は東海、関東、関西\n・業種は建設飲食以外\n・銀行系なので、断った際にちょいハレーション起きる", "noteKickoff": "", "noteRegular": ""}, {"no": 125, "status": "中期フォロー", "contract": "", "company": "日本グロース・キャピタル株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・俺が仲介やる\n・業種、エリア、問わず\n・EBITDA1億以上\n・自己勘定であればもう少し低い\n・6号280億レイズした", "noteKickoff": "", "noteRegular": ""}, {"no": 126, "status": "中期フォロー", "contract": "", "company": "株式会社日本創生投資", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・アポの時点ではNN、事前確認時に名前伝えてほしいと", "noteKickoff": "", "noteRegular": ""}, {"no": 127, "status": "中期フォロー", "contract": "", "company": "静岡キャピタル株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・テレアポサービスとの取引あった\n・ノンネームベースで\n・無借金先がほしい", "noteKickoff": "", "noteRegular": ""}, {"no": 128, "status": "中期フォロー", "contract": "", "company": "日本みらいキャピタル株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "1件1件大切にする系で現状は厳しい", "noteKickoff": "", "noteRegular": ""}, {"no": 129, "status": "中期フォロー", "contract": "", "company": "株式会社日立ソリューションズ", "industry": "SaaS", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・値段手頃だなと（他社だと成果報酬の場合5-10万円）", "noteKickoff": "", "noteRegular": ""}, {"no": 130, "status": "中期フォロー", "contract": "", "company": "京都キャピタルパートナーズ株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・関西注力\n・仲介会社との接点も増えてきた", "noteKickoff": "", "noteRegular": ""}, {"no": 131, "status": "中期フォロー", "contract": "", "company": "株式会社事業開発", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・10,20件ほど架電している", "noteKickoff": "", "noteRegular": ""}, {"no": 132, "status": "中期フォロー", "contract": "", "company": "株式会社バリュークリエイション・アドバイザリー", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・リストの項目知りたい\n・熊本福岡、売上希望問わず、黒字", "noteKickoff": "", "noteRegular": ""}, {"no": 133, "status": "中期フォロー", "contract": "", "company": "税理士法人中山会計", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・顧問先メイン\n・買い手出てきた際には使用してくれそう", "noteKickoff": "", "noteRegular": ""}, {"no": 134, "status": "中期フォロー", "contract": "", "company": "株式会社マイツ", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・中国買い手、日本売り手（売り手FA）\n・製造業、金属加工、自動車部品\n・中国からのニーズ、ペット食品、不動産\n・ロングリスト作成しアプローチ\n・M&A仲介会社との提携（その際は買い手FA）", "noteKickoff": "", "noteRegular": ""}, {"no": 135, "status": "中期フォロー", "contract": "", "company": "ヒルズ＆パートナーズ株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・M&A仲介は年2,3回\n・普通", "noteKickoff": "", "noteRegular": ""}, {"no": 136, "status": "中期フォロー", "contract": "", "company": "木村会計グループ\n", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・仲介になげている", "noteKickoff": "", "noteRegular": ""}, {"no": 137, "status": "中期フォロー", "contract": "", "company": "Fintegrity株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "買い手マッチング希望？", "noteKickoff": "", "noteRegular": ""}, {"no": 138, "status": "中期フォロー", "contract": "", "company": "株式会社経営戦略室", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・調剤中心（買い手から要望があり）\n・コンサル中心、入りはコンサル\n・紹介、口コミ\n・目的は経営革新\n・福島県、相双地区・川俣町・飯館村の調剤薬局。買い手も薬局。門前薬局なのか、処方箋枚数等", "noteKickoff": "", "noteRegular": ""}, {"no": 139, "status": "中期フォロー", "contract": "", "company": "合同会社平家商事", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 140, "status": "中期フォロー", "contract": "", "company": "石田恭也", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "3月に立ち上げ後、依頼いただける可能性あり", "noteKickoff": "", "noteRegular": ""}];

const REWARD_MASTER = [{"id": "A", "name": "標準売上連動4段階", "timing": "面談実施", "basis": "売上高", "tax": "税別", "lo": 0, "hi": 500000000, "price": 100000, "memo": "5億円未満：10万円"}, {"id": "A", "name": "標準売上連動4段階", "timing": "面談実施", "basis": "売上高", "tax": "税別", "lo": 500000000, "hi": 1000000000, "price": 150000, "memo": "5億〜10億：15万円"}, {"id": "A", "name": "標準売上連動4段階", "timing": "面談実施", "basis": "売上高", "tax": "税別", "lo": 1000000000, "hi": 3000000000, "price": 200000, "memo": "10億〜30億：20万円"}, {"id": "A", "name": "標準売上連動4段階", "timing": "面談実施", "basis": "売上高", "tax": "税別", "lo": 3000000000, "hi": 999999999999, "price": 300000, "memo": "30億以上：30万円"}, {"id": "B", "name": "低単価売上連動4段階", "timing": "面談実施", "basis": "売上高", "tax": "税別", "lo": 0, "hi": 500000000, "price": 80000, "memo": "5億円未満：8万円"}, {"id": "B", "name": "低単価売上連動4段階", "timing": "面談実施", "basis": "売上高", "tax": "税別", "lo": 500000000, "hi": 1000000000, "price": 130000, "memo": "5億〜10億：13万円"}, {"id": "B", "name": "低単価売上連動4段階", "timing": "面談実施", "basis": "売上高", "tax": "税別", "lo": 1000000000, "hi": 3000000000, "price": 180000, "memo": "10億〜30億：18万円"}, {"id": "B", "name": "低単価売上連動4段階", "timing": "面談実施", "basis": "売上高", "tax": "税別", "lo": 3000000000, "hi": 999999999999, "price": 280000, "memo": "30億以上：28万円"}, {"id": "C", "name": "シンプル2段階", "timing": "面談実施", "basis": "売上高", "tax": "税別", "lo": 0, "hi": 3000000000, "price": 150000, "memo": "30億円未満：15万円"}, {"id": "C", "name": "シンプル2段階", "timing": "面談実施", "basis": "売上高", "tax": "税別", "lo": 3000000000, "hi": 999999999999, "price": 200000, "memo": "30億円以上：20万円"}, {"id": "D", "name": "基本合意報酬5段階", "timing": "基本合意", "basis": "売上高", "tax": "税別", "lo": 0, "hi": 3000000000, "price": 1200000, "memo": "30億円未満：120万円"}, {"id": "D", "name": "基本合意報酬5段階", "timing": "基本合意", "basis": "売上高", "tax": "税別", "lo": 3000000000, "hi": 5000000000, "price": 2000000, "memo": "30億〜50億：200万円"}, {"id": "D", "name": "基本合意報酬5段階", "timing": "基本合意", "basis": "売上高", "tax": "税別", "lo": 5000000000, "hi": 10000000000, "price": 3000000, "memo": "50億〜100億：300万円"}, {"id": "D", "name": "基本合意報酬5段階", "timing": "基本合意", "basis": "売上高", "tax": "税別", "lo": 10000000000, "hi": 20000000000, "price": 4000000, "memo": "100億〜200億：400万円"}, {"id": "D", "name": "基本合意報酬5段階", "timing": "基本合意", "basis": "売上高", "tax": "税別", "lo": 20000000000, "hi": 999999999999, "price": 8000000, "memo": "200億以上：800万円"}, {"id": "E", "name": "1億円スタート3段階", "timing": "面談実施", "basis": "売上高", "tax": "税別", "lo": 100000000, "hi": 1000000000, "price": 100000, "memo": "1億〜10億：10万円"}, {"id": "E", "name": "1億円スタート3段階", "timing": "面談実施", "basis": "売上高", "tax": "税別", "lo": 1000000000, "hi": 3000000000, "price": 150000, "memo": "10億〜30億：15万円"}, {"id": "E", "name": "1億円スタート3段階", "timing": "面談実施", "basis": "売上高", "tax": "税別", "lo": 3000000000, "hi": 999999999999, "price": 200000, "memo": "30億以上：20万円"}, {"id": "F", "name": "高単価売上連動4段階", "timing": "面談実施", "basis": "売上高", "tax": "税別", "lo": 0, "hi": 500000000, "price": 150000, "memo": "5億円未満：15万円"}, {"id": "F", "name": "高単価売上連動4段階", "timing": "面談実施", "basis": "売上高", "tax": "税別", "lo": 500000000, "hi": 1000000000, "price": 200000, "memo": "5億〜10億：20万円"}, {"id": "F", "name": "高単価売上連動4段階", "timing": "面談実施", "basis": "売上高", "tax": "税別", "lo": 1000000000, "hi": 3000000000, "price": 300000, "memo": "10億〜30億：30万円"}, {"id": "F", "name": "高単価売上連動4段階", "timing": "面談実施", "basis": "売上高", "tax": "税別", "lo": 3000000000, "hi": 999999999999, "price": 500000, "memo": "30億以上：50万円"}, {"id": "G", "name": "高単価利益連動4段階", "timing": "面談実施", "basis": "当期純利益", "tax": "税込", "lo": 0, "hi": 50000000, "price": 300000, "memo": "5000万円未満：30万円"}, {"id": "G", "name": "高単価利益連動4段階", "timing": "面談実施", "basis": "当期純利益", "tax": "税込", "lo": 50000000, "hi": 100000000, "price": 400000, "memo": "5000万〜1億：40万円"}, {"id": "G", "name": "高単価利益連動4段階", "timing": "面談実施", "basis": "当期純利益", "tax": "税込", "lo": 100000000, "hi": 300000000, "price": 600000, "memo": "1億〜3億：60万円"}, {"id": "G", "name": "高単価利益連動4段階", "timing": "面談実施", "basis": "当期純利益", "tax": "税込", "lo": 300000000, "hi": 999999999999, "price": 1000000, "memo": "3億以上：100万円"}, {"id": "H", "name": "中単価利益連動4段階", "timing": "面談実施", "basis": "当期純利益", "tax": "税込", "lo": 0, "hi": 50000000, "price": 150000, "memo": "5000万円未満：15万円"}, {"id": "H", "name": "中単価利益連動4段階", "timing": "面談実施", "basis": "当期純利益", "tax": "税込", "lo": 50000000, "hi": 100000000, "price": 200000, "memo": "5000万〜1億：20万円"}, {"id": "H", "name": "中単価利益連動4段階", "timing": "面談実施", "basis": "当期純利益", "tax": "税込", "lo": 100000000, "hi": 300000000, "price": 300000, "memo": "1億〜3億：30万円"}, {"id": "H", "name": "中単価利益連動4段階", "timing": "面談実施", "basis": "当期純利益", "tax": "税込", "lo": 300000000, "hi": 999999999999, "price": 500000, "memo": "3億以上：50万円"}, {"id": "I", "name": "低単価利益連動4段階", "timing": "面談実施", "basis": "当期純利益", "tax": "税込", "lo": 0, "hi": 50000000, "price": 100000, "memo": "5000万円未満：10万円"}, {"id": "I", "name": "低単価利益連動4段階", "timing": "面談実施", "basis": "当期純利益", "tax": "税込", "lo": 50000000, "hi": 100000000, "price": 150000, "memo": "5000万〜1億：15万円"}, {"id": "I", "name": "低単価利益連動4段階", "timing": "面談実施", "basis": "当期純利益", "tax": "税込", "lo": 100000000, "hi": 300000000, "price": 200000, "memo": "1億〜3億：20万円"}, {"id": "I", "name": "低単価利益連動4段階", "timing": "面談実施", "basis": "当期純利益", "tax": "税込", "lo": 300000000, "hi": 999999999999, "price": 300000, "memo": "3億以上：30万円"}, {"id": "J", "name": "固定30万円", "timing": "面談実施", "basis": "-", "tax": "税別", "lo": 0, "hi": 999999999999, "price": 300000, "memo": "売上高・利益問わず一律30万円"}, {"id": "K", "name": "固定10万円", "timing": "面談実施", "basis": "-", "tax": "税別", "lo": 0, "hi": 999999999999, "price": 100000, "memo": "売上高・利益問わず一律10万円"}, {"id": "L", "name": "固定10万円（税込）", "timing": "面談実施", "basis": "-", "tax": "税込", "lo": 0, "hi": 999999999999, "price": 100000, "memo": "売上高・利益問わず一律10万円（税込）"}, {"id": "M", "name": "固定7万円", "timing": "面談実施", "basis": "-", "tax": "税別", "lo": 0, "hi": 999999999999, "price": 70000, "memo": "売上高・利益問わず一律7万円"}, {"id": "N", "name": "固定2万円", "timing": "面談実施", "basis": "-", "tax": "税別", "lo": 0, "hi": 999999999999, "price": 20000, "memo": "売上高・利益問わず一律2万円"}];

const APPO_DATA = [
  { client: "株式会社LST", company: "有限会社太陽ホーム", getter: "山元 真滉", getDate: "2026-01-15", meetDate: "2026-02-02", status: "事前確認済", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "株式会社NEWOLD CAPITAL", company: "株式会社宮崎産業開発", getter: "吉川 諒馬", getDate: "2026-01-15", meetDate: "2026-02-02", status: "事前確認済", sales: 165000, reward: 36300, note: "", month: "2月" },
  { client: "株式会社ジャパンM&Aインキュベーション", company: "アイパル株式会社", getter: "高橋 航世", getDate: "2026-01-19", meetDate: "2026-02-02", status: "事前確認済", sales: 100000, reward: 22000, note: "", month: "2月" },
  { client: "株式会社ジャパンM&Aインキュベーション", company: "株式会社凌勇興業", getter: "吉川 諒馬", getDate: "2026-01-19", meetDate: "2026-02-02", status: "事前確認済", sales: 165000, reward: 36300, note: "", month: "2月" },
  { client: "株式会社LST", company: "株式会社岡田地建", getter: "山元 真滉", getDate: "2026-01-15", meetDate: "2026-02-03", status: "事前確認済", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "株式会社LST", company: "大幸リビング株式会社", getter: "石井 佑弥", getDate: "2026-01-24", meetDate: "2026-02-03", status: "事前確認済", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "株式会社AMANE", company: "博愛自動車工業株式会社", getter: "能登谷 斗夢", getDate: "2026-01-21", meetDate: "2026-02-04", status: "事前確認済", sales: 165000, reward: 36300, note: "", month: "2月" },
  { client: "株式会社ジャーニーズ", company: "有限会社ワンダリウム", getter: "高橋 航世", getDate: "2026-01-26", meetDate: "2026-02-04", status: "事前確認済", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "株式会社ハレバレ", company: "株式会社盛和", getter: "竹野内 佑大", getDate: "2026-01-19", meetDate: "2026-02-05", status: "事前確認済", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "株式会社NEWOLD CAPITAL", company: "株式会社東条設計", getter: "山元 真滉", getDate: "2026-01-15", meetDate: "2026-02-05", status: "事前確認済", sales: 165000, reward: 36300, note: "", month: "2月" },
  { client: "株式会社ハレバレ", company: "株式会社メルカートピッコロ", getter: "瀬尾 貫太", getDate: "2026-01-26", meetDate: "2026-02-06", status: "事前確認済", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "株式会社LST", company: "三栄不動産株式会社", getter: "山元 真滉", getDate: "2026-01-15", meetDate: "2026-02-07", status: "事前確認済", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "株式会社LST", company: "株式会社エムズハウジング", getter: "高尾 諭良", getDate: "2026-01-17", meetDate: "2026-02-09", status: "事前確認済", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "株式会社キャピタルプライム", company: "株式会社やまか", getter: "山元 真滉", getDate: "2026-01-26", meetDate: "2026-02-09", status: "事前確認済", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "ブティックス株式会社", company: "株式会社神子島通信", getter: "瀬尾 貫太", getDate: "2026-01-21", meetDate: "2026-02-10", status: "事前確認済", sales: 77000, reward: 16940, note: "", month: "2月" },
  { client: "株式会社LST", company: "株式会社ウルトラセキュリティ", getter: "吉藤 永翔", getDate: "2026-01-07", meetDate: "2026-02-10", status: "事前確認済", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "株式会社LST", company: "株式会社庄内スティール製作所", getter: "吉川 諒馬", getDate: "2026-02-02", meetDate: "2026-02-12", status: "事前確認済", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "株式会社and A company", company: "有限会社中島食品", getter: "山元 真滉", getDate: "2026-02-06", meetDate: "2026-02-16", status: "事前確認済", sales: 165000, reward: 36300, note: "18日か20日で調整できないかとクライアントより打診あり。", month: "2月" },
  { client: "株式会社リガーレ", company: "アイシー測器株式会社", getter: "高橋 航世", getDate: "2026-01-19", meetDate: "2026-02-16", status: "事前確認済", sales: 110000, reward: 24200, note: "2/5より再調整。", month: "2月" },
  { client: "株式会社LST", company: "株式会社レインズ", getter: "小中谷 樹斗", getDate: "2026-01-29", meetDate: "2026-02-16", status: "事前確認済", sales: 165000, reward: 36300, note: "ボーナス10,000円対象！", month: "2月" },
  { client: "乃木坂パートナーズ合同会社", company: "豊栄通商株式会社", getter: "小中谷 樹斗", getDate: "2026-02-09", meetDate: "2026-02-17", status: "事前確認済", sales: 300000, reward: 66000, note: "", month: "2月" },
  { client: "株式会社and A company", company: "田原罐詰株式会社", getter: "吉川 諒馬", getDate: "2026-02-10", meetDate: "2026-02-17", status: "事前確認済", sales: 220000, reward: 48400, note: "", month: "2月" },
  { client: "株式会社LST", company: "株式会社川口工務店", getter: "鍛冶 雅也", getDate: "2026-02-06", meetDate: "2026-02-17", status: "事前確認済", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "株式会社キャピタルプライム", company: "有限会社トーブ", getter: "池田 紘規", getDate: "2026-01-27", meetDate: "2026-02-19", status: "事前確認済", sales: 220000, reward: 48400, note: "12日に事前確認。リスナビより事前確認（録音の提出）", month: "2月" },
  { client: "株式会社キャピタルプライム", company: "有限会社肥後そう川", getter: "池田 紘規", getDate: "2026-01-30", meetDate: "2026-02-20", status: "事前確認済", sales: 110000, reward: 24200, note: "12日に事前確認。リスナビより事前確認（録音の提出）", month: "2月" },
  { client: "株式会社LST", company: "テイ・シイ・ビイ・セイワ株式会社", getter: "植木 帆希", getDate: "2026-01-07", meetDate: "2026-02-17", status: "アポ取得", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "株式会社ジャパンM&Aインキュベーション", company: "株式会社東京フラワーセンター", getter: "吉川 諒馬", getDate: "2026-02-12", meetDate: "2026-02-17", status: "アポ取得", sales: 110000, reward: 24200, note: "カフェでの面談のため、社長の携帯番号を回収してほしいとのこと。", month: "2月" },
  { client: "株式会社ジャパンM&Aインキュベーション", company: "神谷醸造食品株式会社", getter: "尾鼻 優吾", getDate: "2026-01-26", meetDate: "2026-02-18", status: "アポ取得", sales: 165000, reward: 36300, note: "", month: "2月" },
  { client: "株式会社LST", company: "有限会社長瀬建設", getter: "山元 真滉", getDate: "2026-01-15", meetDate: "2026-02-18", status: "アポ取得", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "株式会社ジャパンM&Aインキュベーション", company: "有限会社リアル", getter: "中村 光希", getDate: "2026-02-11", meetDate: "2026-02-18", status: "アポ取得", sales: 110000, reward: 24200, note: "オンラインに誘導してほしいとのこと。", month: "2月" },
  { client: "株式会社ジャパンM&Aインキュベーション", company: "株式会社パワープレイ", getter: "吉川 諒馬", getDate: "2026-02-12", meetDate: "2026-02-18", status: "アポ取得", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "株式会社アールイーキャピタル", company: "株式会社FGGコーポレーション", getter: "中村 光希", getDate: "2026-02-07", meetDate: "2026-02-19", status: "アポ取得", sales: 220000, reward: 48400, note: "", month: "2月" },
  { client: "株式会社LST", company: "栄共有限会社", getter: "吉川 諒馬", getDate: "2026-02-05", meetDate: "2026-02-19", status: "アポ取得", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "株式会社LST", company: "株式会社ケン工業", getter: "高橋 航世", getDate: "2026-02-06", meetDate: "2026-02-19", status: "アポ取得", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "株式会社ジャパンM&Aインキュベーション", company: "長野精器株式会社", getter: "竹野内 佑大", getDate: "2026-02-10", meetDate: "2026-02-19", status: "アポ取得", sales: 110000, reward: 24200, note: "オンラインへの変更を打診。", month: "2月" },
  { client: "見える化株式会社", company: "森重木材株式会社", getter: "吉藤 永翔", getDate: "2026-02-10", meetDate: "2026-02-19", status: "アポ取得", sales: 165000, reward: 36300, note: "アポ取得報告共有前", month: "2月" },
  { client: "株式会社ジャパンM&Aインキュベーション", company: "カワムラテキスタイル株式会社", getter: "吉川 諒馬", getDate: "2026-02-12", meetDate: "2026-02-19", status: "アポ取得", sales: 110000, reward: 24200, note: "指名ではないことを明確に伝えてほしいとのこと。", month: "2月" },
  { client: "株式会社and A company", company: "有限会社亀山紋蔵", getter: "吉川 諒馬", getDate: "2026-02-13", meetDate: "2026-02-19", status: "アポ取得", sales: 165000, reward: 36300, note: "", month: "2月" },
  { client: "株式会社ハレバレ", company: "株式会社もり", getter: "吉川 諒馬", getDate: "2026-02-10", meetDate: "2026-02-20", status: "アポ取得", sales: 165000, reward: 36300, note: "", month: "2月" },
  { client: "株式会社ジャパンM&Aインキュベーション", company: "大和染工株式会社", getter: "吉藤 永翔", getDate: "2026-02-12", meetDate: "2026-02-20", status: "アポ取得", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "株式会社ジャパンM&Aインキュベーション", company: "株式会社自然化粧品研究所", getter: "吉川 諒馬", getDate: "2026-02-12", meetDate: "2026-02-20", status: "アポ取得", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "株式会社ユニヴィスコンサルティング", company: "株式会社カネク水産", getter: "吉川 諒馬", getDate: "2026-02-13", meetDate: "2026-02-20", status: "アポ取得", sales: 77000, reward: 16940, note: "", month: "2月" },
  { client: "株式会社Aston Partners", company: "ツカサ機工株式会社", getter: "高橋 航世", getDate: "2026-01-08", meetDate: "2026-02-23", status: "アポ取得", sales: 165000, reward: 36300, note: "", month: "2月" },
  { client: "株式会社LST", company: "増一エレベーター工業株式会社", getter: "吉川 諒馬", getDate: "2026-02-05", meetDate: "2026-02-24", status: "アポ取得", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "株式会社and A company", company: "中浦食品株式会社", getter: "武山 創", getDate: "2026-01-19", meetDate: "2026-02-24", status: "アポ取得", sales: 330000, reward: 72600, note: "", month: "2月" },
  { client: "株式会社LST", company: "松井運輸有限会社", getter: "山元 真滉", getDate: "2026-02-05", meetDate: "2026-02-25", status: "アポ取得", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "株式会社LST", company: "カラーズ商事株式会社", getter: "石井 佑弥", getDate: "2026-02-13", meetDate: "2026-02-26", status: "アポ取得", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "株式会社and A company", company: "株式会社おはなはん", getter: "吉川 諒馬", getDate: "2026-02-09", meetDate: "2026-02-27", status: "アポ取得", sales: 220000, reward: 48400, note: "", month: "2月" },
  { client: "株式会社ジャパンM&Aインキュベーション", company: "株式会社バンハイム", getter: "鍛冶 雅也", getDate: "2026-02-12", meetDate: "2026-02-27", status: "アポ取得", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "株式会社ジャパンM&Aインキュベーション", company: "株式会社アパレル・ウラベ", getter: "吉川 諒馬", getDate: "2026-02-12", meetDate: "2026-02-27", status: "アポ取得", sales: 110000, reward: 24200, note: "温度感が低いことから、改めて社長に面談承諾の背景と秘密保持契約の締結可否をヒアリングすること。", month: "2月" },
  { client: "株式会社ハレバレ", company: "那覇相互警備保障株式会社", getter: "吉藤 永翔", getDate: "2026-01-09", meetDate: "2026-02-02", status: "リスケ中", sales: 110000, reward: 24200, note: "社長が危篤中とのこと。", month: "2月" },
  { client: "株式会社LST", company: "有限会社テクノプラザ", getter: "清水 慧吾", getDate: "2026-01-19", meetDate: "2026-02-09", status: "リスケ中", sales: 110000, reward: 24200, note: "2月下旬にリスケジュールのお電話をする予定。", month: "2月" },
  { client: "株式会社LST", company: "ウエスト・イースト株式会社", getter: "清水 慧吾", getDate: "2026-01-19", meetDate: "2026-02-10", status: "リスケ中", sales: 110000, reward: 24200, note: "電話つながらず。", month: "2月" },
  { client: "株式会社ハレバレ", company: "株式会社山北中村商店", getter: "植木 帆希", getDate: "2026-01-22", meetDate: "2026-02-10", status: "リスケ中", sales: 165000, reward: 36300, note: "カレンダー登録ミスによりクライアントに訪問可否確認中。", month: "2月" },
  { client: "株式会社LST", company: "株式会社マーケティングイン谷屋", getter: "浅井 佑", getDate: "2026-01-15", meetDate: "2026-02-13", status: "リスケ中", sales: 165000, reward: 36300, note: "", month: "2月" },
  { client: "株式会社LST", company: "有限会社トヨテック", getter: "池田 紘規", getDate: "2026-02-10", meetDate: "2026-02-24", status: "リスケ中", sales: 110000, reward: 24200, note: "アポ取得報告共有前", month: "2月" },
  { client: "株式会社LST", company: "有限会社サン電機", getter: "池田 紘規", getDate: "2026-02-06", meetDate: "2026-02-25", status: "リスケ中", sales: 110000, reward: 24200, note: "アポ取得報告共有前", month: "2月" },
  { client: "株式会社ジャパンM&Aインキュベーション", company: "株式会社イワサキ金属", getter: "吉川 諒馬", getDate: "2026-01-15", meetDate: "2026-02-02", status: "キャンセル", sales: 165000, reward: 36300, note: "社長がM&Aとの認識なく、早期に面談打ち切りになったとのこと。", month: "2月" },
  { client: "株式会社LST", company: "株式会社つくばＴＸプランニング", getter: "会社管理", getDate: "2026-01-09", meetDate: "2026-02-02", status: "キャンセル", sales: 110000, reward: 24200, note: "社長が不在だったとのこと。", month: "2月" },
  { client: "株式会社キャピタルプライム", company: "鈴木鉱泉株式会社", getter: "吉川 諒馬", getDate: "2026-01-29", meetDate: "2026-02-03", status: "キャンセル", sales: 165000, reward: 36300, note: "リストに記載の代表者とは違う、若い人が出てきたとのこと。", month: "2月" },
  { client: "株式会社キャピタルプライム", company: "有限会社ニューアリアンサ", getter: "山元 真滉", getDate: "2026-01-26", meetDate: "2026-02-04", status: "キャンセル", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "株式会社ジャーニーズ", company: "新日本信用保証株式会社", getter: "高橋 航世", getDate: "2026-02-02", meetDate: "2026-02-05", status: "キャンセル", sales: 110000, reward: 24200, note: "株主同席不可のため。", month: "2月" },
  { client: "合同会社ORCA Capital", company: "株式会社茎泉", getter: "園城 幹樹", getDate: "2026-01-16", meetDate: "2026-02-05", status: "キャンセル", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "株式会社LST", company: "アバイディング・ハウス株式会社", getter: "会社管理", getDate: "2026-01-09", meetDate: "2026-02-06", status: "キャンセル", sales: 110000, reward: 24200, note: "社長がアポを失念していたとのこと。", month: "2月" },
  { client: "株式会社ジャパンM&Aインキュベーション", company: "有限会社ミハタ電子", getter: "吉川 諒馬", getDate: "2026-01-19", meetDate: "2026-02-09", status: "キャンセル", sales: 110000, reward: 24200, note: "", month: "2月" },
  { client: "ブティックス株式会社", company: "株式会社辰喜建築工芸", getter: "瀬尾 貫太", getDate: "2026-02-02", meetDate: "2026-02-12", status: "キャンセル", sales: 77000, reward: 16940, note: "中嶋様が担当。", month: "2月" },
  { client: "株式会社ジャパンM&Aインキュベーション", company: "常陸興業株式会社", getter: "山元 真滉", getDate: "2026-01-27", meetDate: "2026-02-13", status: "キャンセル", sales: 110000, reward: 24200, note: "話を聞く気が全くなく、早期打ち切りになったとのこと。", month: "2月" },
  { client: "株式会社ハレバレ", company: "有限会社与那嶺鰹節店", getter: "竹野内 佑大", getDate: "2026-02-02", meetDate: "2026-02-13", status: "キャンセル", sales: 110000, reward: 24200, note: "他社と専任契約を結んでおり、面談が一瞬で終わったとのこと。", month: "2月" },
  { client: "株式会社LST", company: "株式会社ステップワン", getter: "池田 紘規", getDate: "2026-02-03", meetDate: "2026-02-13", status: "キャンセル", sales: 165000, reward: 36300, note: "", month: "2月" },
  { client: "株式会社ハレバレ", company: "株式会社ミシマックス", getter: "浅井 佑", getDate: "2026-02-05", meetDate: "2026-02-16", status: "キャンセル", sales: 220000, reward: 48400, note: "すでに別ルートから面談実施済みとのこと。", month: "2月" },
  { client: "株式会社ジャパンM&Aインキュベーション", company: "有限会社ファイバー浜松", getter: "吉川 諒馬", getDate: "2026-02-10", meetDate: "2026-02-17", status: "キャンセル", sales: 110000, reward: 24200, note: "何度も電話口で断られているので、キャンセルでお願いしたいと。", month: "2月" },
  { client: "株式会社ジャパンM&Aインキュベーション", company: "有限会社スキル・トラスト・ラボ", getter: "能登谷 斗夢", getDate: "2026-02-10", meetDate: "2026-02-19", status: "キャンセル", sales: 110000, reward: 24200, note: "クライアントより、確度が低くキャンセルしてほしいとのこと。", month: "2月" },
  { client: "株式会社ジャパンM&Aインキュベーション", company: "丸昂建設株式会社", getter: "成尾 拓輝", getDate: "2026-02-10", meetDate: "2026-03-02", status: "面談済", sales: 110000, reward: 24200, note: "", month: "3月" },
  { client: "株式会社ハレバレ", company: "株式会社山北中村商店", getter: "植木 帆希", getDate: "2026-01-22", meetDate: "2026-03-02", status: "アポ取得", sales: 165000, reward: 36300, note: "2/10よりリスケ", month: "3月" },
  { client: "株式会社and A company", company: "株式会社マルソ", getter: "池田 紘規", getDate: "2026-02-10", meetDate: "2026-03-03", status: "アポ取得", sales: 165000, reward: 36300, note: "オンラインに誘導してほしいとのこと。", month: "3月" },
  { client: "株式会社LST", company: "株式会社精工ドリル", getter: "吉川 諒馬", getDate: "2026-02-13", meetDate: "2026-03-03", status: "アポ取得", sales: 165000, reward: 36300, note: "", month: "3月" },
  { client: "株式会社LST", company: "有限会社吉野屋", getter: "瀬尾 貫太", getDate: "2026-02-05", meetDate: "2026-03-05", status: "アポ取得", sales: 110000, reward: 24200, note: "", month: "3月" }
];

// 選択可能月: 2026年3月固定スタート〜翌々月
const AVAILABLE_MONTHS = (() => {
  const now = new Date();
  const result = [];
  let y = 2026, m = 3; // 3月固定スタート
  const endD = new Date(now.getFullYear(), now.getMonth() + 3, 0); // 翌々月末
  while (new Date(y, m - 1, 1) <= endD) {
    result.push({ label: m + "月", yyyymm: `${y}-${String(m).padStart(2, "0")}`, year: y, month: m });
    if (++m > 12) { m = 1; y++; }
  }
  return result;
})();

// Helper: trigger phone call via hidden iframe (no page navigation, allows rapid sequential calls)
const dialPhone = (phoneNumber) => {
  const num = phoneNumber.replace(/[-\s]/g, "");
  const uri = "zoomphonecall://" + num;
  let iframe = document.getElementById("__dial_iframe");
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "__dial_iframe";
    iframe.style.display = "none";
    document.body.appendChild(iframe);
  }
  iframe.src = uri;
};

// 🎙 インライン録音プレーヤー（全画面共通）
function InlineAudioPlayer({ url, onClose }) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey     = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const audioSrc = url.includes('/storage/v1/object/public/')
    ? url
    : `${supabaseUrl}/functions/v1/get-zoom-recording?mode=download&recording_url=${encodeURIComponent(url)}&token=${anonKey}`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px',
      borderRadius: 5, background: C.offWhite, marginTop: 4, flexWrap: 'wrap' }}>
      <audio controls autoPlay src={audioSrc} style={{ height: 32, flex: 1, minWidth: 200 }} />
      <button onClick={onClose} title="閉じる"
        style={{ fontSize: 14, background: 'none', border: 'none', cursor: 'pointer',
          color: C.textLight, padding: '0 2px', lineHeight: 1 }}>✕</button>
    </div>
  );
}

function SpanaviApp({ userName, isAdmin: isAdminProp, onLogout, supabaseData, onDataRefetch }) {
  const [callListData, setCallListData] = useState(supabaseData?.callLists ?? []);
  useEffect(() => {
    // _supaId が付いているデータのみ保存（古いキャッシュの上書きを防ぐ）
    if (callListData.length > 0 && callListData.every(l => l._supaId)) {
      try { localStorage.setItem("masp_v2_callListData", JSON.stringify(callListData)); } catch(e) {}
    }
  }, [callListData]);
  const [importedCSVs, setImportedCSVs] = useState(() => {
    try { const saved = localStorage.getItem("masp_v2_importedCSVs"); return saved ? JSON.parse(saved) : {}; } catch(e) { return {}; }
  });
  // Persist importedCSVs to localStorage
  useEffect(() => {
    try { localStorage.setItem("masp_v2_importedCSVs", JSON.stringify(importedCSVs)); } catch(e) {}
  }, [importedCSVs]);
  const [callingScreen, setCallingScreen] = useState(null); // { listId, list } - when set, shows full calling screen
  const [callFlowScreen, setCallFlowScreen] = useState(null); // { list } - when set, shows call flow screen
  const callFlowRestoredRef = useRef(false);
  // コンポーネント初期化時（effectsより前）に localStorage を読む。
  // callFlowScreen の useEffect が null 時にキーを削除してしまうため、
  // effect が走る前に値を捕捉しておく必要がある。
  const _savedCallFlowRef = useRef((() => {
    try {
      const raw = localStorage.getItem('masp_v2_callFlowScreen');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  })());
  useEffect(() => {
    try {
      if (callFlowScreen) {
        localStorage.setItem("masp_v2_callFlowScreen", JSON.stringify({
          listSupaId: callFlowScreen.list?._supaId,
          startNo: callFlowScreen.startNo ?? null,
          endNo: callFlowScreen.endNo ?? null,
        }));
      } else if (callFlowRestoredRef.current) {
        // 復元処理が完了した後のみ削除（初回レンダリングで誤って削除しない）
        localStorage.removeItem("masp_v2_callFlowScreen");
      }
    } catch(e) {}
  }, [callFlowScreen]);
  const [currentUser, setCurrentUser] = useState(userName || "管理者");
  const [appoData, setAppoData] = useState(supabaseData?.appoData?.length ? supabaseData.appoData : APPO_DATA);
  const [clientData, setClientData] = useState(supabaseData?.clientData?.length ? supabaseData.clientData : CLIENT_DATA);
  const [members, setMembers] = useState(() => {
    if (supabaseData?.membersDetailed?.length) return supabaseData.membersDetailed;
    try {
      const saved = localStorage.getItem("masp_v2_members");
      return saved ? JSON.parse(saved) : DEFAULT_MEMBERS;
    } catch(e) { return DEFAULT_MEMBERS; }
  });
  useEffect(() => {
    try { if (currentUser) localStorage.setItem("masp_v2_currentUser", currentUser); } catch(e) {}
  }, [currentUser]);
  useEffect(() => {
    try { localStorage.setItem("masp_v2_members", JSON.stringify(members)); } catch(e) {}
  }, [members]);
  // supabaseData が非同期で届いた後に各 state を同期する
  useEffect(() => {
    if (supabaseData?.appoData?.length) setAppoData(supabaseData.appoData);
    if (supabaseData?.clientData?.length) setClientData(supabaseData.clientData);
    if (supabaseData?.callLists?.length) {
      setCallListData(supabaseData.callLists);
      if (!callFlowRestoredRef.current) {
        callFlowRestoredRef.current = true;
        try {
          const savedData = _savedCallFlowRef.current;
          _savedCallFlowRef.current = null; // 二重復元防止
          if (savedData) {
            const { listSupaId, startNo, endNo } = savedData;
            const list = supabaseData.callLists.find(l => l._supaId === listSupaId);
            if (list) setCallFlowScreen({ list, startNo: startNo ?? undefined, endNo: endNo ?? undefined });
          }
        } catch(e) {}
      }
    }
    if (supabaseData?.membersDetailed?.length) setMembers(supabaseData.membersDetailed);
  }, [supabaseData]);
  const isAdmin = isAdminProp || currentUser === "管理者";
  // コンボボックス用の名前リスト（文字列配列）
  const memberNames = useMemo(() => members.map(m => (typeof m === 'string' ? m : (m.name || ''))), [members]);
  const _VALID_TABS = ["live","lists","appo","precheck","crm","members","search","stats","recall","payroll","shift","rules","mypage","edu_script","edu_rules","edu_roleplay","ai"];
  const [currentTab, setCurrentTab] = useState(() => {
    try {
      const saved = localStorage.getItem("masp_v2_currentTab");
      return (saved && _VALID_TABS.includes(saved)) ? saved : "lists";
    } catch(e) { return "lists"; }
  });
  useEffect(() => {
    try { localStorage.setItem("masp_v2_currentTab", currentTab); } catch(e) {}
  }, [currentTab]);
  const [listSubTab, setListSubTab] = useState(() => {
    try {
      const saved = localStorage.getItem("masp_v2_listSubTab");
      return (saved === "seller" || saved === "client") ? saved : "seller";
    } catch(e) { return "seller"; }
  });
  useEffect(() => {
    try { localStorage.setItem("masp_v2_listSubTab", listSubTab); } catch(e) {}
  }, [listSubTab]);
  const [now, setNow] = useState(new Date());
  const [callLogs, setCallLogs] = useState(() => {
    try { const saved = localStorage.getItem("masp_v2_callLogs"); return saved ? JSON.parse(saved) : []; } catch(e) { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem("masp_v2_callLogs", JSON.stringify(callLogs)); } catch(e) {}
  }, [callLogs]);
  const [industryRules, setIndustryRules] = useState(DEFAULT_INDUSTRY_RULES);
  const [filterStatus, setFilterStatus] = useState("架電可能");
  const [filterType, setFilterType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedList, setSelectedList] = useState(null);
  const [logFormOpen, setLogFormOpen] = useState(false);
  const [ruleEditorOpen, setRuleEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [sortBy, setSortBy] = useState("date");
  const [listFormOpen, setListFormOpen] = useState(false);
  const [editingListId, setEditingListId] = useState(null);
  const [liveStatuses, setLiveStatuses] = useState(() => {
    try { const saved = localStorage.getItem("masp_v2_liveStatuses"); return saved ? JSON.parse(saved) : {}; } catch(e) { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem("masp_v2_liveStatuses", JSON.stringify(liveStatuses)); } catch(e) {}
  }, [liveStatuses]);

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);

  // ── 再コール・ベル通知 ──
  const [supaRecalls, setSupaRecalls] = useState([]);
  const [showBellDropdown, setShowBellDropdown] = useState(false);
  const notifiedIdsRef = React.useRef(new Set());
  const completedIdsRef = React.useRef(new Set());

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const fetchSupaRecalls = async () => {
    const { data } = await fetchAllRecallRecords();
    const fresh = (data || []).filter(r => !completedIdsRef.current.has(r.id));
    setSupaRecalls(fresh);
  };
  useEffect(() => { fetchSupaRecalls(); }, []);
  useEffect(() => { fetchSupaRecalls(); }, [now]);

  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const nowTimeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    supaRecalls.forEach(r => {
      const rDate = r._memoObj.recall_date;
      const rTime = r._memoObj.recall_time;
      const assignee = r._memoObj.assignee || '';
      if (assignee !== currentUser) return;
      if (rDate === todayStr && rTime === nowTimeStr && !notifiedIdsRef.current.has(r.id)) {
        new Notification("再コール予定", { body: `${r._item.company || ''} - ${r.status} ${rTime}` });
        notifiedIdsRef.current.add(r.id);
      }
    });
    Object.entries(importedCSVs).forEach(([listIdStr, rows]) => {
      rows.forEach((row, rowIdx) => {
        if (!row.rounds) return;
        Object.entries(row.rounds).forEach(([round, data]) => {
          if ((data.status === "reception_recall" || data.status === "ceo_recall") && data.recall) {
            const { recallDate, recallTime, assignee: csvAssignee } = data.recall;
            if ((csvAssignee || '') !== currentUser) return;
            const notifId = `csv-${listIdStr}-${rowIdx}-${round}`;
            if (recallDate === todayStr && recallTime === nowTimeStr && !notifiedIdsRef.current.has(notifId)) {
              new Notification("再コール予定", { body: `${row.company} - ${data.status} ${recallTime}` });
              notifiedIdsRef.current.add(notifId);
            }
          }
        });
      });
    });
  }, [now]);

  const enrichedLists = useMemo(() => callListData.map(list => {
    const rec = getCurrentRecommendation(industryRules, list.industry, now, list.id, callLogs);
    const recentLogs = callLogs.filter(l => l.listId === list.id);
    const todayLogs = recentLogs.filter(l => new Date(l.date).toDateString() === now.toDateString());
    return { ...list, recommendation: rec, recentLogs, todayLogs };
  }), [now, callLogs, industryRules, callListData]);

  const filteredLists = useMemo(() => {
    let lists = enrichedLists;
    lists = lists.filter(l => !l.is_archived);
    if (filterStatus !== "all") lists = lists.filter(l => l.status === filterStatus);
    if (filterType !== "all") lists = lists.filter(l => l.type === filterType);
    if (searchQuery) { const q = searchQuery.toLowerCase(); lists = lists.filter(l => l.company.toLowerCase().includes(q) || l.industry.toLowerCase().includes(q) || l.manager.toLowerCase().includes(q)); }
    if (sortBy === "date") lists = [...lists].sort((a, b) => a.id - b.id);
    else if (sortBy === "manager") lists = [...lists].sort((a, b) => (a.manager || '').localeCompare(b.manager || ''));
    return lists;
  }, [enrichedLists, filterStatus, filterType, searchQuery, sortBy]);

  const activeCount = enrichedLists.filter(l => l.status === "架電可能").length;
  const recommendedCount = enrichedLists.filter(l => l.status === "架電可能" && l.recommendation.score >= 80).length;
  const todayLogCount = callLogs.filter(l => new Date(l.date).toDateString() === now.toDateString()).length;
  const addCallLog = useCallback((log) => { setCallLogs(prev => [...prev, { ...log, id: Date.now(), date: new Date().toISOString() }]); setLogFormOpen(false); }, []);

  const timeStr = now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" });

  const isOverdue = (date, time) => {
    if (!date) return false;
    return new Date(`${date}T${time || '00:00'}:00`) <= now;
  };
  const overdueSupaRecalls = supaRecalls.filter(r =>
    isOverdue(r._memoObj.recall_date, r._memoObj.recall_time) &&
    (isAdmin || (r._memoObj.assignee || '') === currentUser)
  );
  let overdueCsvCount = 0;
  Object.values(importedCSVs).forEach(rows => rows.forEach(row => {
    if (!row.rounds) return;
    Object.values(row.rounds).forEach(data => {
      if ((data.status === "reception_recall" || data.status === "ceo_recall") && data.recall) {
        if (isOverdue(data.recall.recallDate, data.recall.recallTime) &&
            (isAdmin || (data.recall.assignee || '') === currentUser)) overdueCsvCount++;
      }
    });
  }));
  // 事前確認未完了通知（面談1営業日前以内）
  const _addBizDay = (d) => { const r = new Date(d); while (true) { r.setDate(r.getDate() + 1); if (r.getDay() !== 0 && r.getDay() !== 6) return r; } };
  const _toDS = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const _pcToday = new Date(); _pcToday.setHours(0, 0, 0, 0);
  const _pcT1 = _addBizDay(_pcToday);
  const preCheckPendingAppos = appoData.filter(a => {
    if (a.status !== "アポ取得") return false;
    if (['確認完了', 'リスケ', 'キャンセル'].includes(a.preCheckStatus)) return false;
    const md = a.meetDate;
    if (!md) return false;
    if (md !== _toDS(_pcToday) && md !== _toDS(_pcT1)) return false;
    return isAdmin || a.getter === currentUser;
  });
  const overdueCount = overdueSupaRecalls.length + overdueCsvCount + preCheckPendingAppos.length;

  const handleSupaRecallComplete = async (item) => {
    const memoObj = { ...item._memoObj, recall_completed: true };
    const error = await updateCallRecordMemo(item.id, memoObj);
    if (error) {
      alert('再コール完了の保存に失敗しました: ' + (error.message || '不明なエラー'));
      return;
    }
    completedIdsRef.current.add(item.id);
    setSupaRecalls(prev => prev.filter(r => r.id !== item.id));
  };

  const navGroups = [
    { id: "g_call", label: "架電", children: [
      { id: "live", label: "架電状況" },
      { id: "lists", label: "リスト一覧" },
      { id: "search", label: "企業・リスト検索" },
      { id: "recall", label: "再コール一覧" },
      { id: "rules", label: "業種ルール" },
    ]},
    { id: "g_appo", label: "アポ管理", children: [
      { id: "appo", label: "アポ一覧" },
      { id: "precheck", label: "事前確認" },
    ]},
    { id: "stats", label: "ダッシュボード", children: null },
    { id: "g_other", label: "その他", children: [
      { id: "crm", label: "顧客管理" },
      { id: "members", label: "従業員名簿" },
      { id: "payroll", label: "報酬計算" },
      { id: "shift", label: "シフト管理" },
    ]},
    { id: "g_education", label: "教育", children: [
      { id: "edu_script", label: "スクリプト" },
      { id: "edu_rules", label: "ルール" },
      { id: "edu_roleplay", label: "ロープレ" },
    ]},
    { id: "mypage", label: "MyPage", children: null },
    { id: "ai", label: "AIアシスタント", children: null },
  ];

  const getActiveGroup = () => {
    for (const g of navGroups) {
      if (g.children) { if (g.children.some(c => c.id === currentTab)) return g.id; }
      else { if (g.id === currentTab) return g.id; }
    }
    return null;
  };
  const [hoveredGroup, setHoveredGroup] = useState(null);
  const hoverTimeout = React.useRef(null);

  // Login screen
  // Login is handled by App.jsx via Supabase auth
  // if (!currentUser) { return <LoginScreen ... />; }

  return (
    <div style={{ minHeight: "100vh", background: C.cream, color: C.textDark, fontFamily: "'Noto Sans JP', sans-serif" }}>
      <link href={FONT_URL} rel="stylesheet" />
      <style>{String.raw`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: ${C.cream}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
        input, select, textarea { font-family: 'Noto Sans JP', sans-serif; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>

      {/* ===== HEADER ===== */}
      <header onClick={() => setShowBellDropdown(false)} style={{
        background: C.white,
        padding: "10px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "3px solid " + C.gold,
        boxShadow: "0 1px 6px rgba(26,58,92,0.06)",
      }}>
        <div onClick={() => setCurrentTab('live')} style={{ display: "flex", alignItems: "center", gap: 14, cursor: 'pointer' }}>
          <svg width="36" height="42" viewBox="0 0 52 60">
            <defs>
              <linearGradient id="spShieldHeader" x1="0" y1="0" x2="0.3" y2="1">
                <stop offset="0%" stopColor="#1a3a5c"/>
                <stop offset="100%" stopColor="#22496e"/>
              </linearGradient>
              <clipPath id="shieldClipH"><path d="M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z"/></clipPath>
            </defs>
            <path d="M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z" fill="url(#spShieldHeader)"/>
            <g clipPath="url(#shieldClipH)" stroke="white" fill="none">
              <g opacity="0.45" strokeWidth="1.2">
                <line x1="26" y1="30" x2="26" y2="-5"/><line x1="26" y1="30" x2="55" y2="30"/>
                <line x1="26" y1="30" x2="26" y2="65"/><line x1="26" y1="30" x2="-3" y2="30"/>
                <line x1="26" y1="30" x2="47" y2="5"/><line x1="26" y1="30" x2="47" y2="55"/>
                <line x1="26" y1="30" x2="5" y2="55"/><line x1="26" y1="30" x2="5" y2="5"/>
              </g>
              <g opacity="0.30" strokeWidth="0.8">
                <line x1="26" y1="30" x2="37" y2="-2"/><line x1="26" y1="30" x2="53" y2="16"/>
                <line x1="26" y1="30" x2="53" y2="44"/><line x1="26" y1="30" x2="37" y2="62"/>
                <line x1="26" y1="30" x2="15" y2="62"/><line x1="26" y1="30" x2="-1" y2="44"/>
                <line x1="26" y1="30" x2="-1" y2="16"/><line x1="26" y1="30" x2="15" y2="-2"/>
              </g>
            </g>
          </svg>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 24, fontWeight: 800, color: C.navy, letterSpacing: 2, lineHeight: 1 }}>
            Spa<span style={{ background: "linear-gradient(180deg, #c6a358, #a8883a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>navi</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* ベルマーク */}
          <div style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowBellDropdown(p => !p)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, fontSize: 20, color: C.gold, lineHeight: 1 }}>
              🔔
            </button>
            {overdueCount > 0 && (
              <div style={{ position: "absolute", top: 0, right: 0, minWidth: 16, height: 16, borderRadius: 8,
                background: "#e53e3e", color: "white", fontSize: 9, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", pointerEvents: "none" }}>
                {overdueCount}
              </div>
            )}
            {showBellDropdown && (
              <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 300,
                background: C.white, borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
                border: "1px solid " + C.borderLight, zIndex: 10000, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", background: C.navy, color: C.white, fontSize: 11, fontWeight: 700 }}>
                  🔔 通知（{overdueCount}件）
                </div>
                <div style={{ maxHeight: 280, overflowY: "auto" }}>
                  {/* 事前確認未完了 */}
                  {preCheckPendingAppos.length > 0 && (<>
                    <div style={{ padding: "6px 14px", background: "#fff8ed", fontSize: 10, fontWeight: 700, color: C.orange, borderBottom: "1px solid " + C.borderLight }}>
                      ⚠ 事前確認が必要なアポ（{preCheckPendingAppos.length}件）
                    </div>
                    {preCheckPendingAppos.map((a, i) => (
                      <div key={i} onClick={() => { setCurrentTab("precheck"); setShowBellDropdown(false); }}
                        onMouseEnter={e => { e.currentTarget.style.background = C.offWhite; }}
                        onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                        style={{ padding: "8px 14px", borderBottom: "1px solid " + C.borderLight, cursor: "pointer" }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.navy }}>{a.company}</div>
                        <div style={{ fontSize: 9, color: C.textLight }}>{a.client} ／ 面談: {a.meetDate?.slice(5)} ／ {a.preCheckStatus || '未確認'}</div>
                      </div>
                    ))}
                  </>)}
                  {/* 期限超過の再コール */}
                  {(overdueSupaRecalls.length + overdueCsvCount) > 0 && (<>
                    <div style={{ padding: "6px 14px", background: C.navy + "08", fontSize: 10, fontWeight: 700, color: C.navy, borderBottom: "1px solid " + C.borderLight }}>
                      📞 期限超過の再コール（{overdueSupaRecalls.length + overdueCsvCount}件）
                    </div>
                    {overdueSupaRecalls.map(r => (
                      <div key={r.id} style={{ padding: "8px 14px", borderBottom: "1px solid " + C.borderLight, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: C.navy }}>{r._item.company || "企業名不明"}</div>
                          <div style={{ fontSize: 9, color: C.textLight }}>{r.status} / {r._memoObj.recall_time || "--:--"}</div>
                        </div>
                      </div>
                    ))}
                    {overdueCsvCount > 0 && (
                      <div style={{ padding: "8px 14px", borderBottom: "1px solid " + C.borderLight, fontSize: 10, color: C.textMid }}>
                        CSV架電リストから {overdueCsvCount}件
                      </div>
                    )}
                  </>)}
                  {overdueCount === 0 && (
                    <div style={{ padding: "20px 14px", textAlign: "center", color: C.textLight, fontSize: 11 }}>通知なし</div>
                  )}
                </div>
                <div style={{ padding: "8px 14px", borderTop: "1px solid " + C.borderLight, display: "flex", flexDirection: "column", gap: 6 }}>
                  {preCheckPendingAppos.length > 0 && (
                    <button onClick={() => { setCurrentTab("precheck"); setShowBellDropdown(false); }}
                      style={{ width: "100%", padding: "6px", borderRadius: 5, border: "none", background: C.orange, color: C.white, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Sans JP'" }}>
                      事前確認ページを開く
                    </button>
                  )}
                  <button onClick={() => { setCurrentTab("recall"); setShowBellDropdown(false); }}
                    style={{ width: "100%", padding: "6px", borderRadius: 5, border: "none",
                      background: C.navy, color: C.white, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Sans JP'" }}>
                    再コール一覧を開く
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* 時刻表示 */}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: C.navy }}>{timeStr}</div>
            <div style={{ fontSize: 10, color: C.textLight }}>{dateStr}</div>
          </div>
        </div>
      </header>

      {/* ===== NAV ===== */}
      <nav style={{
        display: "flex", gap: 0,
        background: C.navy,
        padding: "0 28px",
        position: "relative",
      }}>
        {navGroups.map(group => {
          const isActiveGroup = group.children
            ? group.children.some(c => c.id === currentTab)
            : group.id === currentTab;
          const isHovered = hoveredGroup === group.id;
          const showDropdown = isHovered && group.children;

          return (
            <div key={group.id}
              style={{ position: "relative" }}
              onMouseEnter={() => {
                if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
                setHoveredGroup(group.id);
              }}
              onMouseLeave={() => {
                hoverTimeout.current = setTimeout(() => setHoveredGroup(null), 150);
              }}
            >
              <button onClick={() => {
                if (!group.children) { setCurrentTab(group.id); setHoveredGroup(null); }
                else if (group.children.length > 0) { setCurrentTab(group.children[0].id); setHoveredGroup(null); }
              }} style={{
                padding: "11px 22px",
                background: isActiveGroup ? C.gold + "18" : "transparent",
                border: "none",
                borderBottom: isActiveGroup ? "2px solid " + C.gold : "2px solid transparent",
                color: isActiveGroup ? C.goldLight : C.white + "90",
                cursor: "pointer", fontSize: 12, fontWeight: isActiveGroup ? 700 : 400,
                fontFamily: "'Noto Sans JP', sans-serif",
                display: "flex", alignItems: "center", gap: 5,
                transition: "all 0.2s", letterSpacing: 0.5,
              }}>
                {group.label}
                {group.children && <span style={{ fontSize: 8, marginLeft: 2, opacity: 0.6 }}>▼</span>}
              </button>
              {showDropdown && (
                <div style={{
                  position: "absolute", top: "100%", left: 0,
                  background: C.white, borderRadius: "0 0 8px 8px",
                  boxShadow: "0 8px 24px rgba(26,58,92,0.18)",
                  minWidth: 160, zIndex: 100,
                  border: "1px solid " + C.borderLight, borderTop: "2px solid " + C.gold,
                  overflow: "hidden",
                }}>
                  {group.children.map(child => {
                    const isActive = currentTab === child.id;
                    return (
                      <button key={child.id} onClick={() => { setCurrentTab(child.id); setHoveredGroup(null); }} style={{
                        display: "block", width: "100%", padding: "10px 18px",
                        border: "none", background: isActive ? C.gold + "12" : C.white,
                        color: isActive ? C.navy : C.textDark,
                        fontSize: 12, fontWeight: isActive ? 700 : 400,
                        fontFamily: "'Noto Sans JP', sans-serif",
                        cursor: "pointer", textAlign: "left",
                        borderLeft: isActive ? "3px solid " + C.gold : "3px solid transparent",
                        transition: "all 0.1s",
                      }}
                      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = C.offWhite; } }}
                      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = C.white; } }}
                      >{child.label}</button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, paddingRight: 4 }}>
          <span style={{ fontSize: 11, color: C.goldLight, fontWeight: 500 }}>{currentUser}</span>
          <button onClick={() => { if (onLogout) onLogout(); else { setCurrentUser(null); try { localStorage.removeItem("masp_v2_currentUser"); } catch(e) {} } }} style={{
            padding: "4px 10px", borderRadius: 4, border: "1px solid " + C.white + "30",
            background: "transparent", cursor: "pointer", fontSize: 10, color: C.white + "90",
            fontFamily: "'Noto Sans JP'",
          }}>ログアウト</button>
        </div>
      </nav>

      {/* ===== CONTENT ===== */}
      <main style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
        {currentTab === "live" && <LiveStatusView now={now} callListData={callListData} />}
        {currentTab === "lists" && (() => {
          const CLIENT_CATEGORIES = [
            { id: "ma", label: "M&A仲介", color: C.navy },
            { id: "fund", label: "ファンド", color: C.gold },
            { id: "biz", label: "事業会社", color: C.green },
            { id: "ifa", label: "IFA", color: "#9c27b0" },
            { id: "saas", label: "SaaS", color: "#2196f3" },
            { id: "hr", label: "人材", color: "#ff9800" },
          ];
          return (
            <div>
              <div style={{ display: "flex", gap: 0, marginBottom: 16 }}>
                {[
                  { id: "seller", label: "リスト一覧（売り手開拓）" },
                  { id: "client", label: "リスト一覧（クライアント開拓）" },
                ].map(tab => (
                  <button key={tab.id} onClick={() => setListSubTab(tab.id)} style={{
                    padding: "10px 20px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                    fontFamily: "'Noto Sans JP'", border: "1px solid " + C.borderLight,
                    borderBottom: listSubTab === tab.id ? "2px solid " + C.gold : "1px solid " + C.borderLight,
                    background: listSubTab === tab.id ? C.white : C.offWhite,
                    color: listSubTab === tab.id ? C.navy : C.textLight,
                    borderRadius: "8px 8px 0 0", marginRight: -1,
                  }}>{tab.label}</button>
                ))}
              </div>
              {listSubTab === "seller" && <ListView filteredLists={filteredLists} filterStatus={filterStatus} setFilterStatus={setFilterStatus} filterType={filterType} setFilterType={setFilterType} searchQuery={searchQuery} setSearchQuery={setSearchQuery} sortBy={sortBy} setSortBy={setSortBy} setSelectedList={setSelectedList} callListData={callListData} setCallListData={setCallListData} listFormOpen={listFormOpen} setListFormOpen={setListFormOpen} editingListId={editingListId} setEditingListId={setEditingListId} now={now} isAdmin={isAdmin} clientData={clientData} />}
              {listSubTab === "client" && (
                <div style={{ animation: "fadeIn 0.3s ease" }}>
                  <div style={{
                    padding: "14px 18px", background: C.white, borderRadius: 10, marginBottom: 16,
                    border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>クライアント開拓リスト</span>
                      <span style={{ fontSize: 10, color: C.textLight }}>業種別にCSVを取り込み・管理</span>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    {CLIENT_CATEGORIES.map(cat => {
                      const key = "clientList_" + cat.id;
                      const stored = importedCSVs[key];
                      const count = stored ? stored.length : 0;
                      return (
                        <div key={cat.id} style={{
                          background: C.white, borderRadius: 10, overflow: "hidden",
                          border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)",
                          transition: "box-shadow 0.2s",
                        }}>
                          <div style={{
                            padding: "12px 16px", background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")",
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: cat.color }}></span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: C.white }}>{cat.label}</span>
                            </div>
                            <span style={{ fontSize: 10, color: C.goldLight, fontFamily: "'JetBrains Mono'" }}>{count}件</span>
                          </div>
                          <div style={{ padding: "16px" }}>
                            {count > 0 ? (
                              <div>
                                <div style={{ fontSize: 28, fontWeight: 900, color: C.navy, fontFamily: "'JetBrains Mono'", marginBottom: 4 }}>{count}</div>
                                <div style={{ fontSize: 10, color: C.textLight, marginBottom: 12 }}>企業がインポート済み</div>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <label style={{
                                    flex: 1, padding: "6px 0", borderRadius: 5, border: "1px solid " + C.border,
                                    background: C.offWhite, cursor: "pointer", fontSize: 10, fontWeight: 600,
                                    color: C.textMid, textAlign: "center", fontFamily: "'Noto Sans JP'",
                                  }}>
                                    再取込
                                    <input type="file" accept=".csv" style={{ display: "none" }} onChange={e => {
                                      const file = e.target.files[0]; if (!file) return;
                                      const reader = new FileReader();
                                      reader.onload = ev => {
                                        const text = ev.target.result;
                                        const lines = text.split("\\n").filter(l => l.trim());
                                        const headers = lines[0].split(",");
                                        const rows = lines.slice(1).map((line, idx) => {
                                          const vals = line.split(",");
                                          const obj = { _id: idx }; headers.forEach((h, hi) => { obj[h.trim()] = (vals[hi] || "").trim(); }); return obj;
                                        });
                                        setImportedCSVs(prev => ({ ...prev, [key]: rows }));
                                      };
                                      reader.readAsText(file, "Shift_JIS");
                                      e.target.value = "";
                                    }} />
                                  </label>
                                  <button onClick={() => { setImportedCSVs(prev => { const n = { ...prev }; delete n[key]; return n; }); }} style={{
                                    flex: 1, padding: "6px 0", borderRadius: 5, border: "1px solid #e5383530",
                                    background: C.white, cursor: "pointer", fontSize: 10, fontWeight: 600,
                                    color: "#e53835", fontFamily: "'Noto Sans JP'",
                                  }}>クリア</button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ textAlign: "center", padding: "10px 0" }}>
                                <div style={{ fontSize: 11, color: C.textLight, marginBottom: 10 }}>CSVをインポートしてください</div>
                                <label style={{
                                  display: "inline-block", padding: "8px 20px", borderRadius: 6,
                                  background: "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")",
                                  cursor: "pointer", fontSize: 11, fontWeight: 700, color: C.white, fontFamily: "'Noto Sans JP'",
                                }}>
                                  CSV取込
                                  <input type="file" accept=".csv" style={{ display: "none" }} onChange={e => {
                                    const file = e.target.files[0]; if (!file) return;
                                    const reader = new FileReader();
                                    reader.onload = ev => {
                                      const text = ev.target.result;
                                      const lines = text.split("\\n").filter(l => l.trim());
                                      const headers = lines[0].split(",");
                                      const rows = lines.slice(1).map((line, idx) => {
                                        const vals = line.split(",");
                                        const obj = { _id: idx }; headers.forEach((h, hi) => { obj[h.trim()] = (vals[hi] || "").trim(); }); return obj;
                                      });
                                      setImportedCSVs(prev => ({ ...prev, [key]: rows }));
                                    };
                                    reader.readAsText(file, "Shift_JIS");
                                    e.target.value = "";
                                  }} />
                                </label>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
        {currentTab === "appo" && <AppoListView appoData={appoData} setAppoData={isAdmin ? setAppoData : null} members={members} setMembers={isAdmin ? setMembers : null} clientData={clientData} />}
        {currentTab === "precheck" && <PreCheckView appoData={appoData} setAppoData={isAdmin ? setAppoData : null} />}
        {currentTab === "crm" && <CRMView isAdmin={isAdmin} clientData={clientData} setClientData={isAdmin ? setClientData : null} />}
        {currentTab === "members" && <MembersView members={members} setMembers={isAdmin ? setMembers : null} />}
        {currentTab === "search" && <CompanySearchView importedCSVs={importedCSVs} callListData={callListData} setCallingScreen={setCallingScreen} setImportedCSVs={setImportedCSVs} clientData={clientData} currentUser={currentUser} members={members} setCallFlowScreen={setCallFlowScreen} />}
        {currentTab === "stats" && <StatsView importedCSVs={importedCSVs} callListData={callListData} currentUser={currentUser} appoData={appoData} members={members} now={now} />}
        {currentTab === "recall" && <RecallListView importedCSVs={importedCSVs} setImportedCSVs={setImportedCSVs} callListData={callListData} supaRecalls={supaRecalls} onRecallComplete={handleSupaRecallComplete} members={memberNames} currentUser={currentUser} isAdmin={isAdmin} onRefresh={fetchSupaRecalls} />}
        {currentTab === "payroll" && <PayrollView members={members} appoData={appoData} />}
        {currentTab === "shift" && <ShiftManagementView members={members} currentUser={currentUser} isAdmin={isAdmin} />}
        {currentTab === "rules" && <RulesView industryRules={industryRules} setIndustryRules={setIndustryRules} ruleEditorOpen={ruleEditorOpen} setRuleEditorOpen={setRuleEditorOpen} editingRule={editingRule} setEditingRule={setEditingRule} isAdmin={isAdmin} />}
        {currentTab === "mypage" && <MyPageView currentUser={currentUser} importedCSVs={importedCSVs} callListData={callListData} members={members} now={now} appoData={appoData} />}
        {currentTab === "edu_script" && <ScriptView isAdmin={isAdmin} clientData={clientData} callListData={callListData} />}
        {currentTab === "edu_rules" && <PlaceholderView title="ルール管理ページ" />}
        {currentTab === "edu_roleplay" && <RoleplayView currentUser={currentUser} />}
        {currentTab === "ai" && <AIAssistantView appoData={appoData} members={members} callListData={callListData} industryRules={industryRules} currentUser={currentUser} />}
      </main>

      {callingScreen && <CallingScreen listId={callingScreen.listId} list={callingScreen.list} importedCSVs={importedCSVs} setImportedCSVs={setImportedCSVs} onClose={() => setCallingScreen(null)} currentUser={currentUser} liveStatuses={liveStatuses} setLiveStatuses={setLiveStatuses} members={members} />}
      {selectedList && <DetailModal list={enrichedLists.find(l => l.id === selectedList)} callLogs={callLogs} onClose={() => setSelectedList(null)} onAddLog={() => { setLogFormOpen(true); setCurrentTab("logs"); }} industryRules={industryRules} now={now} callListData={callListData} setCallListData={setCallListData} setCallFlowScreen={setCallFlowScreen} isAdmin={isAdmin} onDelete={(id) => { setCallListData(prev => prev.filter(l => l.id !== id)); setSelectedList(null); }} />}
      {callFlowScreen && <CallFlowView list={callFlowScreen.list} startNo={callFlowScreen.startNo} endNo={callFlowScreen.endNo} statusFilter={callFlowScreen.statusFilter ?? null} onClose={() => setCallFlowScreen(null)} setAppoData={isAdmin ? setAppoData : null} members={members} currentUser={currentUser} defaultItemId={callFlowScreen.defaultItemId ?? null} />}
    </div>
  );
}


// ============================================================
// Live Status View (架電状況)
// ============================================================
function LiveStatusView({ now }) {
  const CF_SESSIONS_KEY = 'callflow_sessions_v1';

  // ── localStorageからセッション情報を読み込む ──────────────────────
  const readSessions = () => {
    try { return JSON.parse(localStorage.getItem(CF_SESSIONS_KEY) || '[]'); } catch { return []; }
  };
  const [sessions, setSessions] = useState(readSessions);
  // ── Supabaseから取得した架電済み件数 { sessionId: count } ────────
  const [calledCounts, setCalledCounts] = useState({});
  // ── 過去日セクションの折りたたみ状態（デフォルト折りたたみ） ────
  const [collapsedDays, setCollapsedDays] = useState({ 1: true, 2: true });

  // ── 営業日（月〜金）をn日分遡る ──────────────────────────────────
  const getPastBusinessDays = (baseDate, n) => {
    const days = [];
    let d = new Date(baseDate);
    while (days.length < n) {
      d = new Date(d);
      d.setDate(d.getDate() - 1);
      const dow = d.getDay(); // 0=日, 6=土
      if (dow !== 0 && dow !== 6) days.push(new Date(d));
    }
    return days;
  };

  // 2秒ごとにlocalStorageを再読み込み
  useEffect(() => {
    setSessions(readSessions());
    const id = setInterval(() => setSessions(readSessions()), 2000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 2秒ごとにSupabaseから架電済み件数を取得（3営業日分）
  useEffect(() => {
    const fetchCounts = async () => {
      const pastDays = getPastBusinessDays(new Date(), 2);
      const validDates = new Set([
        new Date().toDateString(),
        ...pastDays.map(d => d.toDateString()),
      ]);
      const allSessions = readSessions();
      const targetSessions = allSessions.filter(s => validDates.has(new Date(s.startedAt).toDateString()));
      if (!targetSessions.length) return;
      const results = await Promise.all(
        targetSessions.map(async (s) => {
          if (!s.listSupaId) return { id: s.id, count: 0, total: 0 };
          const { count, total } = await fetchCalledCountForSession(
            s.listSupaId, s.startedAt, s.finishedAt || null,
            s.startNo ?? null, s.endNo ?? null
          );
          return { id: s.id, count, total };
        })
      );
      const map = {};
      results.forEach(r => { map[r.id] = { count: r.count, total: r.total }; });
      setCalledCounts(map);
    };
    fetchCounts();
    const id = setInterval(fetchCounts, 2000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── listId 単位でグルーピング（1リスト1カード） ──────────────────
  const groupSessions = (daySessions) => {
    const map = {};
    daySessions.forEach(s => {
      if (!map[s.listId]) {
        map[s.listId] = {
          listId: s.listId,
          listName: s.listName,
          industry: s.industry,
          callers: new Set(),
          isActive: false,
          startedAt: s.startedAt,
          lastCalledAt: s.lastCalledAt || null,
          activeSession: null,
          latestSession: s,
        };
      }
      const g = map[s.listId];
      if (s.callerName) g.callers.add(s.callerName);
      if (!s.finishedAt) { g.isActive = true; g.activeSession = s; }
      if (s.startedAt > g.latestSession.startedAt) g.latestSession = s;
      if (s.lastCalledAt && (!g.lastCalledAt || s.lastCalledAt > g.lastCalledAt)) {
        g.lastCalledAt = s.lastCalledAt;
      }
      if (s.startedAt < g.startedAt) g.startedAt = s.startedAt;
    });
    return Object.values(map);
  };

  // ── 3営業日分のday groupsを構築 ─────────────────────────────────
  const dayGroups = React.useMemo(() => {
    const pastDays = getPastBusinessDays(now, 2);
    const days = [
      { date: now,       label: '本日',      key: 0 },
      { date: pastDays[0], label: '1営業日前', key: 1 },
      { date: pastDays[1], label: '2営業日前', key: 2 },
    ];
    return days.map(({ date, label, key }) => {
      const dateStr = date.toDateString();
      const daySessions = sessions.filter(s => new Date(s.startedAt).toDateString() === dateStr);
      const groups = groupSessions(daySessions);
      return {
        key, label, date,
        groups,
        activeLists: groups.filter(g => g.isActive),
        finishedLists: groups.filter(g => !g.isActive),
      };
    });
  }, [sessions, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const getElapsed = (startedAt) => {
    const diff = Math.floor((now - new Date(startedAt)) / 60000);
    if (diff < 60) return diff + '分';
    return Math.floor(diff / 60) + 'h' + (diff % 60) + 'm';
  };

  const formatDateLabel = (date) =>
    date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });

  const renderGroupCard = (g) => {
    const refSess = g.activeSession || g.latestSession;
    const dbEntry    = calledCounts[refSess?.id];
    const calledCount = dbEntry?.count ?? refSess?.calledCount ?? 0;
    const totalCount  = dbEntry?.total || refSess?.totalCount || refSess?.totalInRange || 0;
    const progress    = totalCount > 0 ? Math.round((calledCount / totalCount) * 100) : 0;
    const callerArr   = [...g.callers];
    const nameOnly    = callerArr.filter(n => !n.includes('@'));
    const callerStr   = (nameOnly.length > 0 ? nameOnly : callerArr).join(' / ') || '—';
    const lastActivity = g.lastCalledAt
      ? new Date(g.lastCalledAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
      : null;

    return (
      <div key={g.listId} style={{
        background: C.white, borderRadius: 8, padding: '12px 16px',
        border: '1px solid ' + C.borderLight, boxShadow: '0 1px 4px rgba(26,58,92,0.04)',
        borderLeft: '3px solid ' + (g.isActive ? C.green : C.textLight),
        opacity: g.isActive ? 1 : 0.8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {g.isActive && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
            )}
            <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{callerStr}</span>
          </div>
          <span style={{ fontSize: 9, color: C.textLight, fontFamily: "'JetBrains Mono'" }}>
            {new Date(g.startedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}〜（{getElapsed(g.startedAt)}）
          </span>
        </div>
        <div style={{ fontSize: 10, color: C.textMid, marginBottom: 6 }}>
          {g.listName}
          {g.industry ? <span style={{ marginLeft: 4, color: C.textLight }}>› {g.industry}</span> : ''}
          {refSess?.startNo != null && refSess?.endNo != null && (
            <span style={{ marginLeft: 8, fontWeight: 600, color: C.navy, fontFamily: "'JetBrains Mono'" }}>
              No.{refSess.startNo}〜{refSess.endNo}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ flex: 1, height: 6, background: C.offWhite, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3, width: progress + '%', transition: 'width 0.3s',
              background: g.isActive
                ? 'linear-gradient(90deg, ' + C.gold + ', ' + C.green + ')'
                : C.textLight,
            }} />
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.navy, fontFamily: "'JetBrains Mono'", minWidth: 32 }}>
            {progress}%
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 10, color: C.textLight }}>
          <span>架電済 <span style={{ fontWeight: 700, color: C.navy }}>{calledCount}</span> / {totalCount}</span>
          {lastActivity && (
            <span>最終架電 <span style={{ fontWeight: 700, color: C.navy }}>{lastActivity}</span></span>
          )}
          {!g.isActive && <span>完了</span>}
        </div>
      </div>
    );
  };

  const todayGroup = dayGroups[0];
  const pastGroups = dayGroups.slice(1);

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.navy, fontFamily: "'Noto Serif JP', serif" }}>架電状況ボード</h2>
          <div style={{ fontSize: 11, color: C.textLight, marginTop: 2 }}>架電開始時に自動登録されます。直近3営業日分を表示中</div>
        </div>
        <button
          onClick={() => { localStorage.setItem('callflow_sessions_v1', '[]'); setSessions([]); setCalledCounts({}); }}
          style={{ fontSize: 10, padding: '4px 10px', borderRadius: 4, border: '1px solid ' + C.border, background: C.white, color: C.textMid, cursor: 'pointer', fontFamily: "'Noto Sans JP'" }}
        >セッションリセット</button>
      </div>

      {/* 本日セクション */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 10, paddingBottom: 6, borderBottom: '2px solid ' + C.navy + '20' }}>
          本日 — {formatDateLabel(todayGroup.date)}
        </div>
        {todayGroup.groups.length > 0 ? (
          <>
            {todayGroup.activeLists.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
                  現在架電中（{todayGroup.activeLists.length}件）
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                  {todayGroup.activeLists.map(g => renderGroupCard(g))}
                </div>
              </div>
            )}
            {todayGroup.finishedLists.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMid, marginBottom: 8 }}>
                  完了（{todayGroup.finishedLists.length}件）
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                  {todayGroup.finishedLists.map(g => renderGroupCard(g))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{
            background: C.white, borderRadius: 10, padding: '32px 40px',
            border: '1px solid ' + C.borderLight, textAlign: 'center',
            boxShadow: '0 1px 4px rgba(26,58,92,0.04)',
          }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📞</div>
            <div style={{ fontSize: 13, color: C.textMid }}>本日の架電記録がありません</div>
            <div style={{ fontSize: 11, color: C.textLight, marginTop: 4 }}>架電リストから「架電開始」を押すと表示されます</div>
          </div>
        )}
      </div>

      {/* 過去日セクション（折りたたみ） */}
      {pastGroups.map((dg) => {
        const isCollapsed = collapsedDays[dg.key];
        return (
          <div key={dg.key} style={{ marginBottom: 12 }}>
            <button
              onClick={() => setCollapsedDays(prev => ({ ...prev, [dg.key]: !prev[dg.key] }))}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', borderRadius: isCollapsed ? 6 : '6px 6px 0 0',
                border: '1px solid ' + C.borderLight,
                borderBottom: isCollapsed ? '1px solid ' + C.borderLight : '1px solid ' + C.borderLight,
                background: C.offWhite, cursor: 'pointer', fontFamily: "'Noto Sans JP'",
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.textMid }}>
                  {dg.label} — {formatDateLabel(dg.date)}
                </span>
                {dg.groups.length > 0 ? (
                  <span style={{ fontSize: 10, color: C.textLight, background: C.borderLight, padding: '1px 7px', borderRadius: 10 }}>
                    {dg.groups.length}件
                  </span>
                ) : (
                  <span style={{ fontSize: 10, color: C.textLight }}>記録なし</span>
                )}
              </div>
              <span style={{
                fontSize: 9, color: C.textLight,
                display: 'inline-block',
                transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
                transition: 'transform 0.2s',
              }}>▼</span>
            </button>
            {!isCollapsed && (
              <div style={{ padding: '10px', border: '1px solid ' + C.borderLight, borderTop: 'none', borderRadius: '0 0 6px 6px', background: C.white }}>
                {dg.groups.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                    {dg.groups.map(g => renderGroupCard(g))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '16px', color: C.textLight, fontSize: 12 }}>
                    この日の架電記録はありません
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


// ============================================================
// List View
// ============================================================
function ListView({ filteredLists, filterStatus, setFilterStatus, filterType, setFilterType, searchQuery, setSearchQuery, sortBy, setSortBy, setSelectedList, callListData, setCallListData, listFormOpen, setListFormOpen, editingListId, setEditingListId, now, isAdmin = false, clientData = [] }) {
  const clientOptions = clientData.filter(c => c.status === "支援中" || c.status === "停止中");
  const emptyForm = { company: "", type: "M&A仲介", status: "架電可能", industry: "", count: "", manager: "", companyInfo: "", scriptBody: "", cautions: "", notes: "" };
  const [formData, setFormData] = useState(emptyForm);
  const [showRec, setShowRec] = useState(true);

  const topRecommended = filteredLists.filter(l => l.status === "架電可能" && l.recommendation && l.recommendation.score >= 80).sort((a, b) => b.recommendation.score - a.recommendation.score);

  const handleOpenAdd = () => {
    setFormData(emptyForm);
    setEditingListId(null);
    setListFormOpen(true);
  };

  const handleOpenEdit = (list) => {
    setFormData({
      company: list.company, type: list.type, status: list.status,
      industry: list.industry, count: String(list.count), manager: list.manager,
      companyInfo: list.companyInfo || "", scriptBody: list.scriptBody || "", cautions: list.cautions || "", notes: list.notes || "",
    });
    setEditingListId(list.id);
    setListFormOpen(true);
  };

  const handleSave = async () => {
    if (!formData.company || !formData.industry || !formData.count) return;
    if (editingListId !== null) {
      const target = callListData.find(l => l.id === editingListId);
      if (target?._supaId) {
        const error = await updateCallList(target._supaId, formData);
        if (error) { alert('保存に失敗しました: ' + (error.message || '不明なエラー')); return; }
      }
      setCallListData(prev => prev.map(l => l.id === editingListId ? { ...l, company: formData.company, type: formData.type, status: formData.status, industry: formData.industry, count: parseInt(formData.count) || 0, manager: formData.manager, companyInfo: formData.companyInfo, scriptBody: formData.scriptBody, cautions: formData.cautions, notes: formData.notes } : l));
    } else {
      const { result, error } = await insertCallList(formData);
      if (error || !result) { alert('保存に失敗しました: ' + (error?.message || '不明なエラー')); return; }
      const newId = Math.max(0, ...callListData.map(l => l.id)) + 1;
      setCallListData(prev => [...prev, { id: newId, ...formData, count: parseInt(formData.count) || 0, _supaId: result.id }]);
    }
    setListFormOpen(false);
    setEditingListId(null);
    setFormData(emptyForm);
  };

  const handleDelete = async (id) => {
    const target = callListData.find(l => l.id === id);
    if (!target?._supaId) { alert('Supabase IDが未設定のためアーカイブできません。'); return; }
    if (!window.confirm('このリストをアーカイブしますか？')) return;
    const error = await archiveCallList(target._supaId);
    if (error) { alert('アーカイブに失敗しました: ' + (error.message || '不明なエラー')); return; }
    setCallListData(prev => prev.map(l => l.id === id ? { ...l, is_archived: true } : l));
  };

  const inputStyle = {
    padding: "8px 12px", borderRadius: 6,
    background: C.white, border: "1px solid " + C.border,
    color: C.textDark, fontSize: 12, fontFamily: "'Noto Sans JP'", outline: "none",
  };
  const formInputStyle = {
    padding: "10px 14px", borderRadius: 6,
    background: C.offWhite, border: "1px solid " + C.border,
    color: C.textDark, fontSize: 13, fontFamily: "'Noto Sans JP'", outline: "none", width: "100%",
  };

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      {/* 時間外メッセージ */}
      {now && (now.getHours() < 7 || now.getHours() >= 20) && (
        <div style={{ background: C.white, borderRadius: 10, padding: "14px 20px", marginBottom: 16, border: "1px solid " + C.borderLight, borderLeft: "4px solid " + C.textLight, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13 }}>🌙</span>
          <span style={{ fontSize: 12, color: C.textMid, fontWeight: 600 }}>この時間帯は架電時間外です</span>
          <span style={{ fontSize: 10, color: C.textLight }}>（7:00〜20:00が架電推奨時間帯）</span>
        </div>
      )}

      {/* Recommendation Banner */}
      {topRecommended.length > 0 && showRec && !(now && (now.getHours() < 7 || now.getHours() >= 20)) && (
        <div style={{
          background: C.white, borderRadius: 10, padding: "16px 20px", marginBottom: 16,
          border: "1px solid " + C.borderLight, borderLeft: "4px solid " + C.gold,
          boxShadow: "0 2px 8px rgba(26,58,92,0.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, animation: "pulse 2s infinite", boxShadow: "0 0 8px " + C.green + "60" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>現在のおすすめリスト</span>
              <span style={{ fontSize: 10, color: C.textLight }}>
                {now ? (DAY_NAMES[now.getDay()] + "曜日 " + now.getHours() + "時台") : ""}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.gold, background: C.gold + "15", padding: "1px 8px", borderRadius: 8 }}>
                {topRecommended.length}件
              </span>
            </div>
            <button onClick={() => setShowRec(false)} style={{
              background: "transparent", border: "none", cursor: "pointer",
              fontSize: 14, color: C.textLight, padding: "2px 6px",
            }}>×</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
            {topRecommended.slice(0, 8).map((list, i) => (
              <button key={list.id} onClick={() => setSelectedList(list.id)} style={{
                background: C.offWhite, border: "1px solid " + C.borderLight,
                borderRadius: 8, padding: "10px 14px", cursor: "pointer",
                textAlign: "left", color: C.textDark,
                fontFamily: "'Noto Sans JP', sans-serif",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.gold + "0c"; e.currentTarget.style.borderColor = C.gold + "50"; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.offWhite; e.currentTarget.style.borderColor = C.borderLight; }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, flex: 1, minWidth: 0, wordBreak: "break-all" }}>{list.company}</span>
                  <ScorePill score={list.recommendation.score} label={list.recommendation.label} color={list.recommendation.color} />
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <Badge color={C.textLight} small>{list.industry}</Badge>
                  <Badge color={C.textLight} small>{list.count.toLocaleString()}社</Badge>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{
        display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center",
        padding: "14px 18px", background: C.white, borderRadius: 10,
        border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)",
      }}>
        <input type="text" placeholder="企業名・業種・担当者で検索..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ ...inputStyle, flex: "1 1 200px", minWidth: 180 }} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={inputStyle}>
          <option value="all">全ステータス</option>
          <option value="架電可能">架電可能</option>
          <option value="架電停止">架電停止</option>
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={inputStyle}>
          <option value="all">全種別</option>
          <option value="M&A仲介">M&A仲介</option>
          <option value="IFA">IFA</option>
          <option value="ファンド">ファンド</option>
          <option value="売り手FA">売り手FA</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={inputStyle}>
          <option value="date">日付順</option>
          <option value="manager">担当者別</option>
        </select>
        <span style={{ fontSize: 11, color: C.textLight, fontWeight: 600 }}>{filteredLists.length}件</span>
        {isAdmin && <button onClick={handleOpenAdd} style={{
          padding: "8px 18px", borderRadius: 8, marginLeft: "auto",
          background: "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")",
          border: "none", color: C.white, cursor: "pointer",
          fontSize: 12, fontWeight: 600, fontFamily: "'Noto Sans JP'",
          whiteSpace: "nowrap",
        }}>＋ リスト追加</button>}
      </div>

      {/* Add/Edit Form */}
      {listFormOpen && (
        <div style={{
          background: C.white, border: "1px solid " + C.gold + "40", borderRadius: 12,
          padding: 24, marginBottom: 20, animation: "fadeIn 0.2s ease",
          borderLeft: "4px solid " + C.gold,
          boxShadow: "0 2px 8px rgba(26,58,92,0.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{editingListId !== null ? "リストを編集" : "新しいリストを追加"}</div>
            <button onClick={() => { setListFormOpen(false); setEditingListId(null); }} style={{
              width: 28, height: 28, borderRadius: 6, background: C.offWhite,
              border: "1px solid " + C.border, color: C.textMid, cursor: "pointer", fontSize: 14,
            }}>✕</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>クライアント企業名 *</label>
              <select value={formData.company} onChange={e => setFormData(p => ({ ...p, company: e.target.value }))} style={formInputStyle}>
                <option value="">クライアントを選択...</option>
                {clientOptions.map(c => (
                  <option key={c._supaId || c.company} value={c.company}>
                    {c.company}{c.status === "停止中" ? "（停止中）" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>種別</label>
              <select value={formData.type} onChange={e => setFormData(p => ({ ...p, type: e.target.value }))} style={formInputStyle}>
                <option value="M&A仲介">M&A仲介</option>
                <option value="IFA">IFA</option>
                <option value="ファンド">ファンド</option>
                <option value="売り手FA">売り手FA</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>業種 *</label>
              <input value={formData.industry} onChange={e => setFormData(p => ({ ...p, industry: e.target.value }))} style={formInputStyle} placeholder="例: 建設" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>リスト社数 *</label>
              <input type="number" value={formData.count} onChange={e => setFormData(p => ({ ...p, count: e.target.value }))} style={formInputStyle} placeholder="例: 1000" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>ステータス</label>
              <select value={formData.status} onChange={e => setFormData(p => ({ ...p, status: e.target.value }))} style={formInputStyle}>
                <option value="架電可能">架電可能</option>
                <option value="架電停止">架電停止</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>クライアント担当者</label>
              <input value={formData.manager} onChange={e => setFormData(p => ({ ...p, manager: e.target.value }))} style={formInputStyle} placeholder="例: 田中" />
            </div>
<div style={{ gridColumn: "span 3" }}>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>企業概要</label>
              <textarea value={formData.companyInfo} onChange={e => setFormData(p => ({ ...p, companyInfo: e.target.value }))} style={{ ...formInputStyle, minHeight: 60, resize: "vertical" }} placeholder="クライアントの企業概要を入力..." />
            </div>
            <div style={{ gridColumn: "span 3" }}>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>スクリプト</label>
              <textarea value={formData.scriptBody} onChange={e => setFormData(p => ({ ...p, scriptBody: e.target.value }))} style={{ ...formInputStyle, minHeight: 80, resize: "vertical" }} placeholder="架電スクリプトを入力..." />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>注意事項</label>
              <textarea value={formData.cautions} onChange={e => setFormData(p => ({ ...p, cautions: e.target.value }))} style={{ ...formInputStyle, minHeight: 50, resize: "vertical" }} placeholder="架電時の注意事項を入力..." />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>備考</label>
              <textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} style={{ ...formInputStyle, minHeight: 50, resize: "vertical" }} placeholder="任意" />
            </div>
          </div>
          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <button onClick={handleSave} disabled={!formData.company || !formData.industry || !formData.count} style={{
              padding: "10px 28px", borderRadius: 8,
              background: formData.company && formData.industry && formData.count ? C.navy : C.border,
              border: "none", color: C.white,
              cursor: formData.company && formData.industry && formData.count ? "pointer" : "not-allowed",
              fontSize: 13, fontWeight: 600, fontFamily: "'Noto Sans JP'",
            }}>{editingListId !== null ? "更新する" : "追加する"}</button>
            <button onClick={() => { setListFormOpen(false); setEditingListId(null); }} style={{
              padding: "10px 20px", borderRadius: 8,
              background: C.offWhite, border: "1px solid " + C.border,
              color: C.textMid, cursor: "pointer", fontSize: 13, fontFamily: "'Noto Sans JP'",
            }}>キャンセル</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{
        background: C.white, border: "1px solid " + C.borderLight,
        borderRadius: 10, overflow: "hidden",
        boxShadow: "0 1px 6px rgba(26,58,92,0.06)",
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "2fr 70px 1fr 70px 0.8fr 90px 60px",
          padding: "10px 16px", background: C.navyDeep,
          fontSize: 10, fontWeight: 600, color: C.goldLight, letterSpacing: 1,
        }}>
          <span>クライアント</span><span>種別</span><span>業種</span><span>社数</span><span>担当者</span><span style={{ textAlign: "right" }}>おすすめ度</span><span></span>
        </div>
        <div style={{ maxHeight: 600, overflowY: "auto" }}>
          {(() => {
            const grouped = {};
            filteredLists.forEach(list => {
              const key = list.company;
              if (!grouped[key]) grouped[key] = [];
              grouped[key].push(list);
            });
            let idx = 0;
            return Object.entries(grouped).map(([client, lists]) => (
              <div key={client}>
                <div style={{
                  padding: "6px 16px", background: C.navy + "08",
                  borderBottom: "1px solid " + C.borderLight,
                  display: "flex", alignItems: "center", gap: 8,
                  position: "sticky", top: 0, zIndex: 1,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>{client}</span>
                  <span style={{ fontSize: 10, color: C.textLight }}>{lists.length}リスト・{lists.reduce((s,l)=>s+l.count,0).toLocaleString()}社</span>
                </div>
                {lists.map((list) => {
                  const i = idx++;
                  return (
                    <div key={list.id} style={{
                      display: "grid", gridTemplateColumns: "2fr 70px 1fr 70px 0.8fr 90px 60px",
                      padding: "10px 16px",
                      borderBottom: "1px solid " + C.borderLight,
                      fontSize: 12, alignItems: "center",
                      transition: "background 0.15s",
                      opacity: list.status === "架電停止" ? 0.4 : 1,
                      animation: "fadeIn 0.2s ease " + (i * 0.015) + "s both",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = C.gold + "08"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <span onClick={() => setSelectedList(list.id)} style={{ fontWeight: 500, paddingRight: 8, cursor: "pointer", wordBreak: "break-all" }}>
                        {list.status === "架電停止" && <span style={{ color: C.red, marginRight: 4 }}>■</span>}
                        {list.company}
        
                      </span>
                      <span><Badge color={list.type === "M&A仲介" ? C.navy : list.type === "IFA" ? C.gold : list.type === "ファンド" ? C.green : C.orange} small>{list.type}</Badge></span>
                      <span style={{ color: C.textMid }}>{list.industry}</span>
                      <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: C.textMid }}>{list.count.toLocaleString()}</span>
                      <span style={{ color: C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{list.manager}</span>
                      <span style={{ textAlign: "right" }}>{list.status === "架電可能" && <ScorePill score={list.recommendation.score} label={list.recommendation.label} color={list.recommendation.color} />}</span>
                      <span style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        {isAdmin && <>
                          <button onClick={() => handleOpenEdit(list)} title="編集" style={{
                            width: 26, height: 26, borderRadius: 4, background: C.offWhite,
                            border: "1px solid " + C.border, color: C.textMid, cursor: "pointer",
                            fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center",
                          }}>✎</button>
                          <button onClick={() => { handleDelete(list.id); }} title="削除" style={{
                            width: 26, height: 26, borderRadius: 4, background: C.redLight,
                            border: "1px solid " + C.red + "20", color: C.red, cursor: "pointer",
                            fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center",
                          }}>✕</button>
                        </>}
                      </span>
                    </div>
                  );
                })}
              </div>
            ));
          })()}
        </div>
        {/* アーカイブ済みリスト */}
        {isAdmin && (() => {
          const archivedLists = callListData.filter(l => l.is_archived);
          if (archivedLists.length === 0) return null;
          return (
            <div style={{ marginTop: 16 }}>
              <div style={{
                padding: "8px 16px", background: C.offWhite,
                border: "1px solid " + C.borderLight, borderRadius: "8px 8px 0 0",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.textLight }}>
                  アーカイブ済み ({archivedLists.length}件)
                </span>
              </div>
              <div style={{ border: "1px solid " + C.borderLight, borderTop: "none", borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
                {archivedLists.map(list => (
                  <div key={list.id} style={{
                    display: "grid", gridTemplateColumns: "2fr 70px 1fr 70px 0.8fr 80px",
                    padding: "8px 16px", fontSize: 11, alignItems: "center",
                    borderBottom: "1px solid " + C.borderLight,
                    opacity: 0.5, background: C.offWhite,
                  }}>
                    <span style={{ color: C.textMid, fontWeight: 500 }}>{list.company}</span>
                    <span style={{ color: C.textLight, fontSize: 10 }}>{list.type}</span>
                    <span style={{ color: C.textLight }}>{list.industry}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.textLight }}>{list.count.toLocaleString()}</span>
                    <span style={{ color: C.textLight }}>{list.manager}</span>
                    <span style={{ textAlign: "right" }}>
                      <button onClick={async () => {
                        const error = await restoreCallList(list._supaId);
                        if (error) { alert('復元に失敗しました: ' + (error.message || '不明なエラー')); return; }
                        setCallListData(prev => prev.map(l => l.id === list.id ? { ...l, is_archived: false } : l));
                      }} style={{
                        padding: "3px 10px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                        background: C.navy, color: C.white, border: "none", cursor: "pointer",
                        fontFamily: "'Noto Sans JP'",
                      }}>復元</button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ============================================================
// Log View
// ============================================================
function LogView({ callLogs, logFormOpen, setLogFormOpen, addCallLog, enrichedLists, now, callListData }) {
  const [formData, setFormData] = useState({ listId: "", caller: "", startNum: "", endNum: "", memo: "" });
  const availableLists = enrichedLists.filter(l => l.status === "架電可能");
  const todayLogs = callLogs.filter(l => new Date(l.date).toDateString() === now.toDateString());
  const recentLogs = [...callLogs].reverse().slice(0, 30);

  const handleSubmit = () => {
    if (!formData.listId || !formData.caller) return;
    addCallLog({ listId: parseInt(formData.listId), caller: formData.caller, startNum: formData.startNum ? parseInt(formData.startNum) : null, endNum: formData.endNum ? parseInt(formData.endNum) : null, memo: formData.memo });
    setFormData({ listId: "", caller: "", startNum: "", endNum: "", memo: "" });
  };

  const inputStyle = { padding: "10px 14px", borderRadius: 6, background: C.offWhite, border: "1px solid " + C.border, color: C.textDark, fontSize: 13, fontFamily: "'Noto Sans JP'", outline: "none", width: "100%" };

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.navy, fontFamily: "'Noto Serif JP', serif" }}>架電ログ</h2>
        <button onClick={() => setLogFormOpen(!logFormOpen)} style={{
          padding: "8px 20px", borderRadius: 8,
          background: logFormOpen ? C.white : "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")",
          border: logFormOpen ? "1px solid " + C.border : "none",
          color: logFormOpen ? C.textDark : C.white, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'Noto Sans JP'",
        }}>{logFormOpen ? "✕ 閉じる" : "＋ ログを記録"}</button>
      </div>

      {logFormOpen && (
        <div style={{ background: C.white, border: "1px solid " + C.gold + "40", borderRadius: 12, padding: 24, marginBottom: 24, animation: "fadeIn 0.3s ease", borderLeft: "4px solid " + C.gold }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: C.navy }}>新しい架電ログ</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>リスト *</label>
              <select value={formData.listId} onChange={e => setFormData(p => ({ ...p, listId: e.target.value }))} style={inputStyle}>
                <option value="">選択してください</option>
                {availableLists.map(l => <option key={l.id} value={l.id}>{l.company} - {l.industry}（{l.count.toLocaleString()}社）</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>架電者 *</label>
              <select value={formData.caller} onChange={e => setFormData(p => ({ ...p, caller: e.target.value }))} style={inputStyle}>
                <option value="">選択してください</option>
                {INTERNS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>開始番号</label>
              <input type="number" placeholder="" value={formData.startNum} onChange={e => setFormData(p => ({ ...p, startNum: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>終了番号</label>
              <input type="number" placeholder="" value={formData.endNum} onChange={e => setFormData(p => ({ ...p, endNum: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>メモ</label>
              <textarea value={formData.memo} onChange={e => setFormData(p => ({ ...p, memo: e.target.value }))} style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} placeholder="特記事項があれば..." />
            </div>
          </div>
          {formData.listId && formData.startNum && (() => {
            const conflicts = callLogs.filter(l => {
              if (l.listId !== parseInt(formData.listId)) return false;
              const daysDiff = (now - new Date(l.date)) / (1000*60*60*24);
              if (daysDiff > 2) return false;
              const s = parseInt(formData.startNum), e = parseInt(formData.endNum) || s;
              return l.startNum && l.endNum && !(e < l.startNum || s > l.endNum);
            });
            if (conflicts.length > 0) return (
              <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 6, background: C.redLight, border: "1px solid " + C.red + "30", fontSize: 12, color: C.red }}>
                ⚠ 直近2日以内にこの番号範囲で架電記録があります：{conflicts.map(c => c.caller + "（" + c.startNum + "〜" + c.endNum + "番）").join("、")}
              </div>
            );
            return null;
          })()}
          <div style={{ marginTop: 16 }}>
            <button onClick={handleSubmit} disabled={!formData.listId || !formData.caller} style={{
              padding: "10px 28px", borderRadius: 8,
              background: formData.listId && formData.caller ? C.navy : C.border,
              border: "none", color: C.white, cursor: formData.listId && formData.caller ? "pointer" : "not-allowed",
              fontSize: 13, fontWeight: 600, fontFamily: "'Noto Sans JP'",
            }}>記録する</button>
          </div>
        </div>
      )}

      {todayLogs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: C.textMid }}>本日の架電ログ（{todayLogs.length}件）</div>
          {todayLogs.map(log => { const list = callListData.find(l => l.id === log.listId); return (
            <div key={log.id} style={{ background: C.white, border: "1px solid " + C.borderLight, borderRadius: 8, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, fontSize: 12, marginBottom: 6 }}>
              <span style={{ fontWeight: 600, color: C.navy }}>{log.caller}</span>
              <span style={{ color: C.textLight }}>→</span>
              <span style={{ fontWeight: 500 }}>{list?.company}</span>
              <Badge color={C.textLight} small>{list?.industry}</Badge>
              {log.startNum && log.endNum && <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: C.green }}>#{log.startNum}〜{log.endNum}</span>}
              <span style={{ fontSize: 10, color: C.textLight, marginLeft: "auto" }}>{new Date(log.date).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          ); })}
        </div>
      )}

      {recentLogs.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: C.textMid }}>直近の架電ログ</div>
          {recentLogs.map(log => { const list = callListData.find(l => l.id === log.listId); return (
            <div key={log.id} style={{ background: C.white, border: "1px solid " + C.borderLight, borderRadius: 6, padding: "8px 14px", display: "flex", alignItems: "center", gap: 10, fontSize: 11, marginBottom: 4 }}>
              <span style={{ fontFamily: "'JetBrains Mono'", color: C.textLight, minWidth: 50, fontSize: 10 }}>{new Date(log.date).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}</span>
              <span style={{ fontWeight: 600, color: C.navy, minWidth: 70 }}>{log.caller}</span>
              <span style={{ color: C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{list?.company} - {list?.industry}</span>
              {log.startNum && <span style={{ color: C.green, fontFamily: "'JetBrains Mono'", fontSize: 10 }}>#{log.startNum}〜{log.endNum}</span>}
            </div>
          ); })}
        </div>
      )}

      {callLogs.length === 0 && !logFormOpen && (
        <div style={{ textAlign: "center", padding: "60px 0", color: C.textLight }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📝</div>
          <div style={{ fontSize: 14 }}>まだ架電ログがありません</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>「＋ ログを記録」ボタンから始めましょう</div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Login Screen
// ============================================================
function LoginScreen({ onLogin, members }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const allOptions = [{ id: 0, name: "管理者" }, ...members];
  const filtered = allOptions.filter(m => !search || m.name.includes(search));

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(160deg, " + C.navyDeep + " 0%, " + C.navy + " 35%, #2a5d8f 60%, " + C.navyLight + " 100%)",
      fontFamily: "'Noto Sans JP', sans-serif", position: "relative", overflow: "hidden",
    }}>
      {/* Decorative circles */}
      <div style={{ position: "absolute", top: -80, right: -80, width: 300, height: 300, borderRadius: "50%", background: C.gold + "12" }}></div>
      <div style={{ position: "absolute", bottom: -60, left: -60, width: 200, height: 200, borderRadius: "50%", background: C.gold + "08" }}></div>
      <div style={{ position: "absolute", top: "30%", left: "10%", width: 120, height: 120, borderRadius: "50%", background: C.white + "05" }}></div>

      <div style={{
        background: C.white, borderRadius: 20, padding: "40px 40px 32px", width: 380,
        boxShadow: "0 16px 64px rgba(0,0,0,0.35)", position: "relative", zIndex: 1,
        borderTop: "4px solid " + C.gold,
      }}>
        <div style={{ textAlign: "center", marginBottom: 28, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <svg width="72" height="82" viewBox="0 0 52 60" style={{ marginBottom: 16 }}>
            <defs>
              <linearGradient id="spShieldBg" x1="0" y1="0" x2="0.3" y2="1">
                <stop offset="0%" stopColor="#1a3a5c"/>
                <stop offset="100%" stopColor="#22496e"/>
              </linearGradient>
              <clipPath id="shieldClipL"><path d="M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z"/></clipPath>
            </defs>
            <path d="M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z" fill="url(#spShieldBg)"/>
            <g clipPath="url(#shieldClipL)" stroke="white" fill="none">
              <g opacity="0.45" strokeWidth="1.2">
                <line x1="26" y1="30" x2="26" y2="-5"/><line x1="26" y1="30" x2="55" y2="30"/>
                <line x1="26" y1="30" x2="26" y2="65"/><line x1="26" y1="30" x2="-3" y2="30"/>
                <line x1="26" y1="30" x2="47" y2="5"/><line x1="26" y1="30" x2="47" y2="55"/>
                <line x1="26" y1="30" x2="5" y2="55"/><line x1="26" y1="30" x2="5" y2="5"/>
              </g>
              <g opacity="0.30" strokeWidth="0.8">
                <line x1="26" y1="30" x2="37" y2="-2"/><line x1="26" y1="30" x2="53" y2="16"/>
                <line x1="26" y1="30" x2="53" y2="44"/><line x1="26" y1="30" x2="37" y2="62"/>
                <line x1="26" y1="30" x2="15" y2="62"/><line x1="26" y1="30" x2="-1" y2="44"/>
                <line x1="26" y1="30" x2="-1" y2="16"/><line x1="26" y1="30" x2="15" y2="-2"/>
              </g>
            </g>
          </svg>
          <div style={{
            fontSize: 38, fontWeight: 800, letterSpacing: 2, color: C.navy,
            fontFamily: "'Outfit', sans-serif",
          }}>Spa<span style={{ background: "linear-gradient(180deg, #c6a358, #a8883a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>navi</span></div>
        </div>

        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.navy, marginBottom: 6, letterSpacing: 1 }}>ログインユーザーを選択</div>
          <input value={search} onChange={e => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="名前を入力して選択..."
            style={{
              width: "100%", padding: "12px 14px", borderRadius: 8,
              border: "2px solid " + (open ? C.gold : C.border), fontSize: 13,
              fontFamily: "'Noto Sans JP'", outline: "none",
              transition: "border-color 0.2s",
            }} />

          {open && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
              background: C.white, borderRadius: 8, border: "1px solid " + C.border,
              boxShadow: "0 4px 16px rgba(0,0,0,0.15)", maxHeight: 280, overflowY: "auto", zIndex: 10,
            }}>
              {filtered.map(m => (
                <button key={m.id} onClick={() => onLogin(m.name)} style={{
                  width: "100%", padding: "10px 14px", border: "none",
                  borderBottom: "1px solid " + C.borderLight, background: "transparent",
                  cursor: "pointer", textAlign: "left",
                  fontSize: 13, fontWeight: 500, color: C.navy,
                  fontFamily: "'Noto Sans JP'",
                }}>{m.name}</button>
              ))}
              {filtered.length === 0 && (
                <div style={{ padding: "16px 0", textAlign: "center", color: C.textLight, fontSize: 12 }}>該当なし</div>
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: 24, textAlign: "center", fontSize: 9, color: C.textLight, letterSpacing: 1 }}>
          © 2026 M&A Sourcing Partners Co., Ltd.
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CRM View (Customer Management)
// ============================================================
function CRMView({ isAdmin, clientData, setClientData }) {
  const [statusFilter, setStatusFilter] = useState("支援中");
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);
  const [showRewardDetail, setShowRewardDetail] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [addForm, setAddForm] = useState(null);
  const [addSaving, setAddSaving] = useState(false);
  const [addToast, setAddToast] = useState(null);

  const statusList = ["支援中", "準備中", "停止中", "保留", "中期フォロー"];
  const statusStyle = (st) => {
    if (st === "支援中") return { bg: C.green + "15", color: C.green, dot: C.green };
    if (st === "準備中") return { bg: C.gold + "15", color: C.gold, dot: C.gold };
    if (st === "停止中") return { bg: "#e5383515", color: "#e53835", dot: "#e53835" };
    if (st === "保留") return { bg: C.textLight + "15", color: C.textLight, dot: C.textLight };
    if (st === "中期フォロー") return { bg: C.navy + "10", color: C.navy, dot: C.navy };
    return { bg: C.textLight + "10", color: C.textLight, dot: C.textLight };
  };

  const filtered = clientData.filter(c => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (search && !c.company.includes(search) && !c.industry.includes(search)) return false;
    return true;
  });

  const statusCounts = {};
  clientData.forEach(c => { statusCounts[c.status] = (statusCounts[c.status] || 0) + 1; });

  const rewardMap = {};
  REWARD_MASTER.forEach(r => {
    if (!rewardMap[r.id]) rewardMap[r.id] = { name: r.name, timing: r.timing, basis: r.basis, tax: r.tax, tiers: [] };
    rewardMap[r.id].tiers.push(r);
  });

  const getRewardSummary = (typeId) => {
    const rm = rewardMap[typeId];
    if (!rm) return "-";
    if (rm.tiers.length === 1) return rm.tiers[0].memo;
    return rm.name;
  };

  const contactIcon = (ct) => {
    if (ct === "LINE") return "\u{1F4AC}";
    if (ct === "Slack") return "\u{1F4BC}";
    if (ct === "Chatwork") return "\u{1F4DD}";
    if (ct === "メール") return "\u2709";
    return "\u{1F4DE}";
  };

  const colTemplate = setClientData
    ? "0.8fr 2fr 0.6fr 0.5fr 0.7fr 0.6fr 0.6fr 0.5fr 32px"
    : "0.8fr 2fr 0.6fr 0.5fr 0.7fr 0.6fr 0.6fr 0.5fr";

  const handleSaveEdit = async () => {
    if (!editForm || !setClientData) return;
    const idx = editForm._idx;
    const updated = { ...editForm };
    delete updated._idx;
    if (updated._supaId) {
      const error = await updateClient(updated._supaId, updated);
      if (error) { alert('保存に失敗しました: ' + (error.message || '不明なエラー')); return; }
    }
    setClientData(prev => prev.map((c, i) => i === idx ? updated : c));
    setEditForm(null);
    setSelectedClient(updated);
  };

  const handleSaveAdd = async () => {
    if (!addForm || !setClientData) return;
    if (!addForm.company?.trim()) { alert('企業名を入力してください'); return; }
    setAddSaving(true);
    const { result, error } = await insertClient(addForm);
    setAddSaving(false);
    if (error) { alert('保存に失敗しました: ' + (error.message || '不明なエラー')); return; }
    const newClient = {
      _supaId: result.id,
      no: result.sort_order || 0,
      status: result.status || addForm.status || '準備中',
      contract: result.contract_status || addForm.contract || '未',
      company: result.name || addForm.company,
      industry: result.industry || addForm.industry || '',
      target: result.supply_target || addForm.target || 0,
      rewardType: result.reward_type || addForm.rewardType || '',
      paySite: result.payment_site || addForm.paySite || '',
      payNote: result.payment_note || addForm.payNote || '',
      listSrc: result.list_source || addForm.listSrc || '',
      calendar: result.calendar_type || addForm.calendar || '',
      contact: result.contact_method || addForm.contact || '',
      noteFirst: (result.notes || addForm.noteFirst || '').replace(/\\n/g, '\n'),
      noteKickoff: (result.note_kickoff || '').replace(/\\n/g, '\n'),
      noteRegular: (result.note_regular || '').replace(/\\n/g, '\n'),
    };
    setClientData(prev => [newClient, ...prev]);
    setAddForm(null);
    setAddToast('✅ 顧客を追加しました');
    setTimeout(() => setAddToast(null), 3000);
  };

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16,
        padding: "14px 18px", background: C.white, borderRadius: 10,
        border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>顧客管理（CRM）</span>
          <span style={{ fontSize: 11, color: C.textLight }}>{filtered.length}社</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="企業名・業界..."
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", width: 180 }} />
          {setClientData && (
            <button onClick={() => setAddForm({ status: '準備中', contract: '未', company: '', industry: '', target: 0, rewardType: '', paySite: '', payNote: '', listSrc: '', calendar: '', contact: '', noteFirst: '' })}
              style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")", color: C.white, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Noto Sans JP'", whiteSpace: "nowrap" }}>
              ＋ 新規顧客追加
            </button>
          )}
        </div>
      </div>

      {/* Status tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => setStatusFilter("all")} style={{
          padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Sans JP'",
          border: "1px solid " + (statusFilter === "all" ? C.navy : C.border),
          background: statusFilter === "all" ? C.navy : C.white, color: statusFilter === "all" ? C.white : C.textMid,
        }}>全て <span style={{ fontSize: 10, opacity: 0.7 }}>{clientData.length}</span></button>
        {statusList.map(st => {
          const sc = statusStyle(st);
          const active = statusFilter === st;
          return (
            <button key={st} onClick={() => setStatusFilter(st)} style={{
              padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Sans JP'",
              border: "1px solid " + (active ? sc.color : C.border),
              background: active ? sc.bg : C.white, color: active ? sc.color : C.textMid,
              display: "flex", alignItems: "center", gap: 4,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.dot }}></span>
              {st} <span style={{ fontSize: 10, opacity: 0.7 }}>{statusCounts[st] || 0}</span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div style={{ background: C.white, borderRadius: 10, overflow: "hidden", border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)" }}>
        <div style={{
          display: "grid", gridTemplateColumns: colTemplate,
          padding: "8px 16px", background: C.navyDeep,
          fontSize: 9, fontWeight: 600, color: C.goldLight, letterSpacing: 0.5,
        }}>
          <span>ステータス</span><span>企業名</span><span>業界</span><span>目標</span><span>報酬体系</span><span>リスト</span><span>カレンダー</span><span>連絡</span>{setClientData && <span></span>}
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: "30px 0", textAlign: "center", color: C.textLight, fontSize: 12 }}>データがありません</div>
        ) : filtered.map((c, i) => {
          const sc = statusStyle(c.status);
          const globalIdx = clientData.indexOf(c);
          return (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: colTemplate,
              padding: "9px 16px", fontSize: 11, alignItems: "center",
              borderBottom: "1px solid " + C.borderLight,
              cursor: "pointer", transition: "background 0.15s",
            }} onClick={() => setSelectedClient(c)}
              onMouseEnter={e => e.currentTarget.style.background = C.offWhite}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <span style={{
                fontSize: 9, padding: "2px 6px", borderRadius: 3, textAlign: "center", fontWeight: 600,
                background: sc.bg, color: sc.color, display: "inline-block", width: "fit-content",
              }}>{c.status}</span>
              <span style={{ fontWeight: 600, color: C.navy }}>{c.company}</span>
              <span style={{ color: C.textMid, fontSize: 10 }}>{c.industry}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, fontWeight: 700, color: c.target > 0 ? C.navy : C.textLight }}>{c.target > 0 ? c.target + "件" : "-"}</span>
              <span onClick={e => { e.stopPropagation(); setShowRewardDetail(c.rewardType); }} style={{
                fontSize: 10, fontWeight: 600, color: C.gold, cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted",
              }}>{c.rewardType ? c.rewardType + " " + getRewardSummary(c.rewardType).slice(0, 10) : "-"}</span>
              <span style={{ fontSize: 10, color: C.textMid }}>{c.listSrc || "-"}</span>
              <span style={{ fontSize: 10, color: C.textMid }}>{c.calendar || "-"}</span>
              <span style={{ fontSize: 12 }}>{contactIcon(c.contact)}</span>
              {setClientData && <span style={{ textAlign: "center" }}><button onClick={e => { e.stopPropagation(); setEditForm({ ...c, _idx: globalIdx }); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 2 }}>&#9998;</button></span>}
            </div>
          );
        })}
      </div>

      {/* Client Detail Modal */}
      {selectedClient && !editForm && (() => {
        const c = selectedClient;
        const sc = statusStyle(c.status);
        const rm = rewardMap[c.rewardType];
        const globalIdx = clientData.indexOf(c);
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => setSelectedClient(null)}>
            <div style={{ background: C.white, borderRadius: 12, width: 600, maxHeight: "90vh", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ padding: "16px 20px", background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")", borderRadius: "12px 12px 0 0", color: C.white }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 3, background: sc.bg, color: sc.color, fontWeight: 700 }}>{c.status}</span>
                  <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 3, background: "rgba(255,255,255,0.15)", color: C.goldLight }}>{c.contract === "済" ? "契約済" : c.contract}</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>{c.company}</div>
                <div style={{ fontSize: 10, color: C.goldLight, marginTop: 2 }}>{c.industry}{c.target > 0 ? " ・ 月間目標 " + c.target + "件" : ""}</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  {[
                    { label: "報酬体系", val: c.rewardType ? c.rewardType + " (" + (rm ? rm.name : "") + ")" : "-" },
                    { label: "税区分", val: rm ? rm.tax : "-" },
                    { label: "支払サイト", val: c.paySite || "-" },
                    { label: "支払特記", val: c.payNote || "-" },
                    { label: "リスト負担", val: c.listSrc || "-" },
                    { label: "カレンダー", val: c.calendar || "-" },
                    { label: "連絡手段", val: c.contact || "-" },
                    { label: "供給目標", val: c.target > 0 ? c.target + "件/月" : "-" },
                  ].map((item, idx) => (
                    <div key={idx}>
                      <div style={{ fontSize: 9, fontWeight: 600, color: C.textLight, marginBottom: 2 }}>{item.label}</div>
                      <div style={{ fontSize: 12, color: C.textDark, fontWeight: 500 }}>{item.val}</div>
                    </div>
                  ))}
                </div>
                {rm && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.navy, marginBottom: 6, borderBottom: "1px solid " + C.borderLight, paddingBottom: 4 }}>報酬体系詳細（{c.rewardType}）</div>
                    <div style={{ fontSize: 10, color: C.textLight, marginBottom: 6 }}>{rm.timing} ・ {rm.basis} ・ {rm.tax}</div>
                    {rm.tiers.map((t, ti) => (
                      <div key={ti} style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", fontSize: 11, background: ti % 2 === 0 ? C.offWhite : "transparent", borderRadius: 4 }}>
                        <span style={{ color: C.textMid }}>{t.memo}</span>
                        <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, color: C.gold }}>{(t.price / 10000).toFixed(0)}万円</span>
                      </div>
                    ))}
                  </div>
                )}
                {(c.noteFirst || c.noteKickoff || c.noteRegular) && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.navy, marginBottom: 6, borderBottom: "1px solid " + C.borderLight, paddingBottom: 4 }}>備考</div>
                    {[
                      { label: "初回面談時", val: c.noteFirst },
                      { label: "キックオフミーティング時", val: c.noteKickoff },
                      { label: "定期ミーティング時", val: c.noteRegular },
                    ].filter(n => n.val).map((n, ni) => (
                      <div key={ni} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: C.gold, marginBottom: 2, display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.gold, display: "inline-block" }}></span>{n.label}
                        </div>
                        <div style={{ fontSize: 11, color: C.textMid, whiteSpace: "pre-wrap", lineHeight: 1.6, padding: "4px 0 4px 8px", borderLeft: "2px solid " + C.borderLight, maxHeight: 150, overflow: "auto" }}>{n.val.replace(/\\n/g, "\n")}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ padding: "10px 20px", borderTop: "1px solid " + C.borderLight, display: "flex", justifyContent: "space-between" }}>
                {setClientData ? <button onClick={() => { setSelectedClient(null); setEditForm({ ...c, _idx: globalIdx }); }} style={{
                  padding: "8px 18px", borderRadius: 6, border: "1px solid " + C.gold + "40", background: C.white,
                  cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.gold, fontFamily: "'Noto Sans JP'",
                }}>&#9998; 編集</button> : <div></div>}
                <button onClick={() => setSelectedClient(null)} style={{
                  padding: "8px 24px", borderRadius: 6, border: "none",
                  background: "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")",
                  cursor: "pointer", fontSize: 11, fontWeight: 700, color: C.white, fontFamily: "'Noto Sans JP'",
                }}>閉じる</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Toast */}
      {addToast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: C.navy, color: C.white, padding: "10px 20px", borderRadius: 8, fontSize: 12, fontWeight: 600, zIndex: 30000, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", fontFamily: "'Noto Sans JP'" }}>
          {addToast}
        </div>
      )}

      {/* Add Modal */}
      {addForm && setClientData && (() => {
        const inputStyle = { width: "100%", padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", background: C.offWhite };
        const labelStyle = { fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 2, display: "block" };
        const u = (k, v) => setAddForm(p => ({ ...p, [k]: v }));
        const rewardIds = [...new Set(REWARD_MASTER.map(r => r.id))].sort();
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20001, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: C.white, borderRadius: 12, width: 580, maxHeight: "90vh", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
              <div style={{ padding: "14px 20px", background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")", borderRadius: "12px 12px 0 0", color: C.white }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>新規顧客を追加</div>
                <div style={{ fontSize: 10, color: C.goldLight, marginTop: 2 }}>顧客情報を入力してください</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={labelStyle}>ステータス</label>
                    <select value={addForm.status} onChange={e => u("status", e.target.value)} style={inputStyle}>
                      {["支援中", "準備中", "停止中", "保留", "中期フォロー"].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div><label style={labelStyle}>契約</label>
                    <select value={addForm.contract} onChange={e => u("contract", e.target.value)} style={inputStyle}>
                      <option value="済">済</option><option value="未">未</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ ...labelStyle, color: C.red }}>企業名 <span style={{ fontWeight: 400 }}>*</span></label>
                    <input value={addForm.company} onChange={e => u("company", e.target.value)} placeholder="株式会社○○" style={inputStyle} />
                  </div>
                  <div><label style={labelStyle}>業界</label><input value={addForm.industry} onChange={e => u("industry", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>供給目標（件/月）</label><input type="number" value={addForm.target} onChange={e => u("target", Number(e.target.value))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>報酬体系</label>
                    <select value={addForm.rewardType} onChange={e => u("rewardType", e.target.value)} style={inputStyle}>
                      <option value="">-</option>
                      {rewardIds.map(id => <option key={id} value={id}>{id} - {rewardMap[id] ? rewardMap[id].name : ""}</option>)}
                    </select>
                  </div>
                  <div><label style={labelStyle}>支払サイト</label><input value={addForm.paySite} onChange={e => u("paySite", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>支払特記事項</label><input value={addForm.payNote} onChange={e => u("payNote", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>リスト負担</label>
                    <select value={addForm.listSrc} onChange={e => u("listSrc", e.target.value)} style={inputStyle}>
                      <option value="">-</option><option value="当社持ち">当社持ち</option><option value="先方持ち">先方持ち</option><option value="両方">両方</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>カレンダー</label>
                    <select value={addForm.calendar} onChange={e => u("calendar", e.target.value)} style={inputStyle}>
                      <option value="">-</option><option value="Google">Google</option><option value="Spir">Spir</option><option value="Outlook">Outlook</option><option value="なし">なし</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>連絡手段</label>
                    <select value={addForm.contact} onChange={e => u("contact", e.target.value)} style={inputStyle}>
                      <option value="">-</option><option value="LINE">LINE</option><option value="Slack">Slack</option><option value="Chatwork">Chatwork</option><option value="メール">メール</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ ...labelStyle, color: C.gold }}>初回面談メモ</label>
                    <textarea value={addForm.noteFirst} onChange={e => u("noteFirst", e.target.value)} rows={4}
                      style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
                  </div>
                </div>
              </div>
              <div style={{ padding: "10px 20px", borderTop: "1px solid " + C.borderLight, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setAddForm(null)} style={{ padding: "8px 20px", borderRadius: 6, border: "1px solid " + C.border, background: C.white, cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.textMid, fontFamily: "'Noto Sans JP'" }}>キャンセル</button>
                <button onClick={handleSaveAdd} disabled={addSaving} style={{ padding: "8px 24px", borderRadius: 6, border: "none", background: addSaving ? C.textLight : "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")", cursor: addSaving ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 700, color: C.white, fontFamily: "'Noto Sans JP'" }}>
                  {addSaving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit Modal */}
      {editForm && setClientData && (() => {
        const inputStyle = { width: "100%", padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", background: C.offWhite };
        const labelStyle = { fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 2, display: "block" };
        const u = (k, v) => setEditForm(p => ({ ...p, [k]: v }));
        const rewardIds = [...new Set(REWARD_MASTER.map(r => r.id))].sort();
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20001, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: C.white, borderRadius: 12, width: 580, maxHeight: "90vh", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
              <div style={{ padding: "14px 20px", background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")", borderRadius: "12px 12px 0 0", color: C.white }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>顧客情報を編集</div>
                <div style={{ fontSize: 10, color: C.goldLight, marginTop: 2 }}>{editForm.company}</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={labelStyle}>ステータス</label>
                    <select value={editForm.status} onChange={e => u("status", e.target.value)} style={inputStyle}>
                      {statusList.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div><label style={labelStyle}>契約</label>
                    <select value={editForm.contract} onChange={e => u("contract", e.target.value)} style={inputStyle}>
                      <option value="済">済</option><option value="未">未</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>企業名</label><input value={editForm.company} onChange={e => u("company", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>業界</label><input value={editForm.industry} onChange={e => u("industry", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>供給目標（件/月）</label><input type="number" value={editForm.target} onChange={e => u("target", Number(e.target.value))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>報酬体系</label>
                    <select value={editForm.rewardType} onChange={e => u("rewardType", e.target.value)} style={inputStyle}>
                      <option value="">-</option>
                      {rewardIds.map(id => <option key={id} value={id}>{id} - {rewardMap[id] ? rewardMap[id].name : ""}</option>)}
                    </select>
                  </div>
                  <div><label style={labelStyle}>支払サイト</label><input value={editForm.paySite} onChange={e => u("paySite", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>支払特記事項</label><input value={editForm.payNote} onChange={e => u("payNote", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>リスト負担</label>
                    <select value={editForm.listSrc} onChange={e => u("listSrc", e.target.value)} style={inputStyle}>
                      <option value="当社持ち">当社持ち</option><option value="先方持ち">先方持ち</option><option value="両方">両方</option><option value="">-</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>カレンダー</label>
                    <select value={editForm.calendar} onChange={e => u("calendar", e.target.value)} style={inputStyle}>
                      <option value="Google">Google</option><option value="Spir">Spir</option><option value="Outlook">Outlook</option><option value="なし">なし</option><option value="">-</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>連絡手段</label>
                    <select value={editForm.contact} onChange={e => u("contact", e.target.value)} style={inputStyle}>
                      <option value="LINE">LINE</option><option value="Slack">Slack</option><option value="Chatwork">Chatwork</option><option value="メール">メール</option><option value="">-</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.navy, marginBottom: 6, marginTop: 4, borderBottom: "1px solid " + C.borderLight, paddingBottom: 4 }}>備考</div>
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ ...labelStyle, color: C.gold }}>初回面談時</label>
                      <textarea value={(editForm.noteFirst || "").replace(/\\n/g, "\n")} onChange={e => u("noteFirst", e.target.value)} rows={4}
                        style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ ...labelStyle, color: C.gold }}>キックオフミーティング時</label>
                      <textarea value={(editForm.noteKickoff || "").replace(/\\n/g, "\n")} onChange={e => u("noteKickoff", e.target.value)} rows={4}
                        style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, color: C.gold }}>定期ミーティング時</label>
                      <textarea value={(editForm.noteRegular || "").replace(/\\n/g, "\n")} onChange={e => u("noteRegular", e.target.value)} rows={4}
                        style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ padding: "10px 20px", borderTop: "1px solid " + C.borderLight, display: "flex", justifyContent: "space-between" }}>
                <button onClick={async () => {
                  if (editForm._supaId) {
                    const error = await deleteClient(editForm._supaId);
                    if (error) { alert('削除に失敗しました: ' + (error.message || '不明なエラー')); return; }
                  }
                  setClientData(prev => prev.filter((_, i) => i !== editForm._idx));
                  setEditForm(null); setSelectedClient(null);
                }} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #e5383530", background: C.white, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#e53835", fontFamily: "'Noto Sans JP'" }}>削除</button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setEditForm(null)} style={{ padding: "8px 20px", borderRadius: 6, border: "1px solid " + C.border, background: C.white, cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.textMid, fontFamily: "'Noto Sans JP'" }}>キャンセル</button>
                  <button onClick={handleSaveEdit} style={{
                    padding: "8px 24px", borderRadius: 6, border: "none",
                    background: "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")",
                    cursor: "pointer", fontSize: 11, fontWeight: 700, color: C.white, fontFamily: "'Noto Sans JP'",
                  }}>保存</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Reward Detail Popup */}
      {showRewardDetail && rewardMap[showRewardDetail] && (() => {
        const rm = rewardMap[showRewardDetail];
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.4)", zIndex: 20002, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => setShowRewardDetail(null)}>
            <div style={{ background: C.white, borderRadius: 10, width: 440, boxShadow: "0 8px 32px rgba(0,0,0,0.3)", overflow: "hidden" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ padding: "12px 18px", background: C.navyDeep, color: C.white }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>報酬体系 {showRewardDetail}: {rm.name}</div>
                <div style={{ fontSize: 10, color: C.goldLight, marginTop: 2 }}>{rm.timing} ・ {rm.basis} ・ {rm.tax}</div>
              </div>
              <div style={{ padding: "12px 18px" }}>
                {rm.tiers.map((t, ti) => (
                  <div key={ti} style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", fontSize: 12, background: ti % 2 === 0 ? C.offWhite : "transparent", borderRadius: 4 }}>
                    <span style={{ color: C.textDark }}>{t.memo}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, color: C.gold }}>{(t.price / 10000).toFixed(0)}万円</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: "8px 18px", borderTop: "1px solid " + C.borderLight, textAlign: "right" }}>
                <button onClick={() => setShowRewardDetail(null)} style={{
                  padding: "6px 18px", borderRadius: 5, border: "none", background: C.navy,
                  cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.white, fontFamily: "'Noto Sans JP'",
                }}>閉じる</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ============================================================
// Appointment List View
// ============================================================
// ============================================================
// Pre-Check View (事前確認)
// ============================================================
function PreCheckModal({ appo, onSave, onCancel }) {
  const PRE_CHECK_OPTIONS = ['確認完了', '確認中', 'リスケ', 'キャンセル'];
  const [form, setForm] = React.useState({
    preCheckStatus: appo.preCheckStatus || '',
    rescheduleStatus: appo.rescheduledAt ? '日時確定' : '調整中',
    rescheduledAt: appo.rescheduledAt || '',
    cancelReason: appo.cancelReason || '',
    preCheckMemo: appo.preCheckMemo || '',
  });
  const [saving, setSaving] = React.useState(false);
  const [showRecording, setShowRecording] = React.useState(false);
  const u = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.preCheckStatus) { alert('事前確認結果を選択してください'); return; }
    setSaving(true);
    let newStatus = appo.status;
    if (form.preCheckStatus === '確認完了') newStatus = '事前確認済';
    else if (form.preCheckStatus === 'リスケ') newStatus = 'リスケ中';
    else if (form.preCheckStatus === 'キャンセル') newStatus = 'キャンセル';
    const rescheduledAt = (form.preCheckStatus === 'リスケ' && form.rescheduleStatus === '日時確定')
      ? form.rescheduledAt || null : null;
    await onSave({
      preCheckStatus: form.preCheckStatus,
      preCheckMemo: form.preCheckMemo,
      rescheduledAt,
      rescheduleStatus: form.preCheckStatus === 'リスケ' ? form.rescheduleStatus : '',
      cancelReason: form.preCheckStatus === 'キャンセル' ? form.cancelReason : '',
      status: newStatus,
    });
    setSaving(false);
  };

  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid ' + C.border, fontSize: 13, color: C.textDark, background: C.white, outline: 'none', boxSizing: 'border-box', fontFamily: "'Noto Sans JP'" };
  const labelStyle = { fontSize: 11, fontWeight: 600, color: C.textMid, display: 'block', marginBottom: 4 };

  const appoMonth = appo.meetDate ? (parseInt(appo.meetDate.slice(5, 7), 10) + '月') : '';
  // noteに埋め込まれた電話番号を抽出（例: "電話番号：03-xxxx-xxxx"）
  const phoneFromNote = (() => {
    if (!appo.note) return '';
    const m = appo.note.match(/電話番号：([^\n]+)/);
    return m ? m[1].trim() : '';
  })();
  const displayPhone = appo.phone || phoneFromNote;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: C.white, borderRadius: 14, width: 560, maxWidth: '92vw', maxHeight: '90vh', boxShadow: '0 8px 40px rgba(26,58,92,0.18)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* ── ヘッダー ── */}
        <div style={{ background: 'linear-gradient(135deg, ' + C.navyDeep + ', ' + C.navy + ')', padding: '14px 20px', color: C.white, flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>事前確認入力</div>
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>{appo.company} ／ {appo.client}</div>
        </div>

        {/* ── スクロール可能なコンテンツエリア ── */}
        <div style={{ overflowY: 'auto', flex: 1 }}>

          {/* ── アポ取得報告セクション ── */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid ' + C.borderLight }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.navy }}>{appo.company}</div>
              {displayPhone ? (
                <a href={'tel:' + displayPhone} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 10,
                  fontSize: 11, color: C.white, background: C.navy,
                  borderRadius: 6, padding: '5px 12px', textDecoration: 'none',
                  fontFamily: "'JetBrains Mono'", fontWeight: 600,
                }}>📞 {displayPhone}</a>
              ) : (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 10,
                  fontSize: 11, color: C.textLight, background: C.offWhite,
                  borderRadius: 6, padding: '5px 12px',
                  border: '1px solid ' + C.borderLight, fontFamily: "'JetBrains Mono'",
                }}>📞 登録なし</span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              {[
                { label: 'クライアント', value: appo.client },
                { label: '取得者', value: appo.getter },
                { label: '取得日', value: appo.getDate },
                { label: '面談日', value: appo.meetDate },
                { label: 'ステータス', value: appo.status },
                { label: '月', value: appoMonth },
              ].map((item, i) => (
                <div key={i} style={{ padding: '6px 10px', borderRadius: 6, background: C.offWhite, border: '1px solid ' + C.borderLight }}>
                  <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.navy }}>{item.value || '—'}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div style={{ padding: '8px 12px', borderRadius: 8, background: C.navy + '08', border: '1px solid ' + C.navy + '15' }}>
                <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>当社売上</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: C.navy, fontFamily: "'JetBrains Mono'" }}>{appo.sales > 0 ? '¥' + appo.sales.toLocaleString() : '—'}</div>
              </div>
              <div style={{ padding: '8px 12px', borderRadius: 8, background: C.gold + '08', border: '1px solid ' + C.gold + '15' }}>
                <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>インターン報酬</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: C.gold, fontFamily: "'JetBrains Mono'" }}>{appo.reward > 0 ? '¥' + appo.reward.toLocaleString() : '—'}</div>
              </div>
            </div>
            <div style={{ padding: '8px 12px', borderRadius: 6, background: C.gold + '06', border: '1px solid ' + C.gold + '20', borderLeft: '3px solid ' + C.gold, marginTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.gold, marginBottom: 6 }}>📋 アポ取得報告</div>
              {appo.note
                ? <div style={{ fontSize: 11, color: C.textDark, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{appo.note}</div>
                : <div style={{ fontSize: 11, color: C.textLight }}>アポ取得報告が登録されていません</div>
              }
            </div>
            {(() => {
              const m = (appo.note || '').match(/録音URL[：:]\s*(https?:\/\/\S+)/);
              const recUrl = m?.[1]?.trim() || '';
              return (
                <div style={{ marginTop: 8 }}>
                  <div style={{ padding: '5px 8px', borderRadius: 5, background: C.offWhite,
                    display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: C.navy, whiteSpace: 'nowrap' }}>🎙 録音</span>
                    {recUrl
                      ? <button onClick={() => setShowRecording(v => !v)}
                          title={showRecording ? "閉じる" : "録音を再生"}
                          style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
                            padding: 0, lineHeight: 1, color: showRecording ? C.red : 'inherit' }}>🎙</button>
                      : <span style={{ fontSize: 11, color: C.textLight }}>録音なし</span>
                    }
                  </div>
                  {showRecording && recUrl && (
                    <InlineAudioPlayer url={recUrl} onClose={() => setShowRecording(false)} />
                  )}
                </div>
              );
            })()}
          </div>

          {/* ── 事前確認フォーム ── */}
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>事前確認結果 <span style={{ color: C.red }}>*</span></label>
              <select value={form.preCheckStatus} onChange={e => u('preCheckStatus', e.target.value)} style={inputStyle}>
                <option value=''>選択してください</option>
                {PRE_CHECK_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {form.preCheckStatus === 'リスケ' && (
              <div style={{ background: '#fff8ed', borderRadius: 8, padding: '12px 14px', border: '1px solid #f0d080', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={labelStyle}>状況</label>
                  <select value={form.rescheduleStatus} onChange={e => u('rescheduleStatus', e.target.value)} style={inputStyle}>
                    <option value='調整中'>調整中</option>
                    <option value='日時確定'>日時確定</option>
                  </select>
                </div>
                {form.rescheduleStatus === '日時確定' && (
                  <div>
                    <label style={labelStyle}>リスケ先日時</label>
                    <input type='datetime-local' value={form.rescheduledAt} onChange={e => u('rescheduledAt', e.target.value)} style={inputStyle} />
                  </div>
                )}
              </div>
            )}
            {form.preCheckStatus === 'キャンセル' && (
              <div style={{ background: '#fff5f5', borderRadius: 8, padding: '12px 14px', border: '1px solid #ffd0d0' }}>
                <label style={labelStyle}>キャンセル理由</label>
                <input type='text' value={form.cancelReason} onChange={e => u('cancelReason', e.target.value)} placeholder='例：先方都合によりキャンセル' style={inputStyle} />
              </div>
            )}
            <div>
              <label style={labelStyle}>メモ</label>
              <textarea value={form.preCheckMemo} onChange={e => u('preCheckMemo', e.target.value)} rows={3} placeholder='備考・引き継ぎ事項など' style={{ ...inputStyle, resize: 'vertical', fontSize: 12 }} />
            </div>
          </div>
        </div>

        {/* ── ボタン ── */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid ' + C.borderLight, display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid ' + C.border, background: C.white, color: C.textMid, fontSize: 12, cursor: 'pointer', fontFamily: "'Noto Sans JP'" }}>キャンセル</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: saving ? C.border : 'linear-gradient(135deg, ' + C.navyDeep + ', ' + C.navy + ')', color: C.white, fontSize: 12, cursor: saving ? 'default' : 'pointer', fontWeight: 600, fontFamily: "'Noto Sans JP'" }}>{saving ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </div>
  );
}

const PRECHECK_SLACK_WEBHOOK = 'https://hooks.slack.com/services/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';

function PreCheckView({ appoData, setAppoData }) {
  const [selectedAppo, setSelectedAppo] = React.useState(null);

  const handlePreCheckSave = async (saveData) => {
    if (!selectedAppo?._supaId) { alert('保存先が見つかりません'); return; }
    const error = await updatePreCheckResult(selectedAppo._supaId, saveData);
    if (error) { alert('保存に失敗しました: ' + (error.message || '不明なエラー')); return; }
    setAppoData(prev => prev.map(a =>
      a._supaId === selectedAppo._supaId
        ? { ...a, status: saveData.status, preCheckStatus: saveData.preCheckStatus, preCheckMemo: saveData.preCheckMemo, rescheduledAt: saveData.rescheduledAt, cancelReason: saveData.cancelReason }
        : a
    ));
    setSelectedAppo(null);
    // Slack通知（非同期・エラー無視）
    try {
      const appo = selectedAppo;
      let msg = `【事前確認報告】 *${appo.company}* ／ ${appo.client}\n`;
      msg += `・取得者：${appo.getter}\n`;
      msg += `・面談日：${appo.meetDate}\n`;
      msg += `・事前確認結果：${saveData.preCheckStatus}\n`;
      if (saveData.preCheckStatus === 'リスケ') {
        msg += `・状況：${saveData.rescheduleStatus || '調整中'}\n`;
        if (saveData.rescheduledAt) msg += `・リスケ先日時：${saveData.rescheduledAt.replace('T', ' ')}\n`;
      }
      if (saveData.preCheckStatus === 'キャンセル' && saveData.cancelReason) msg += `・キャンセル理由：${saveData.cancelReason}\n`;
      if (saveData.preCheckMemo) msg += `・メモ：${saveData.preCheckMemo}\n`;
      fetch(PRECHECK_SLACK_WEBHOOK, { method: 'POST', body: JSON.stringify({ text: msg }) })
        .catch(e => console.error('[Slack] precheck notification error:', e));
    } catch (e) {
      console.error('[Slack] precheck notification error:', e);
    }
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const addBusinessDays = (start, days) => {
    const d = new Date(start);
    let added = 0;
    while (added < days) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) added++;
    }
    return d;
  };

  const subtractBusinessDays = (target, days) => {
    const d = new Date(target);
    let sub = 0;
    while (sub < days) {
      d.setDate(d.getDate() - 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) sub++;
    }
    return d;
  };

  const toDateStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + dd;
  };

  const dayLabel = (d) => {
    const days = ["日", "月", "火", "水", "木", "金", "土"];
    return (d.getMonth() + 1) + "/" + d.getDate() + "（" + days[d.getDay()] + "）";
  };

  // Target dates: today, 1BD ahead, 2BD ahead
  const t0 = today;
  const t1 = addBusinessDays(today, 1);
  const t2 = addBusinessDays(today, 2);

  // Filter: status === "アポ取得" AND meetDate is today/1BD/2BD AND pre_check_status not resolved
  const targets = appoData.filter(a => {
    if (a.status !== "アポ取得") return false;
    if (['確認完了', 'リスケ', 'キャンセル'].includes(a.preCheckStatus)) return false;
    const md = a.meetDate;
    return md === toDateStr(t0) || md === toDateStr(t1) || md === toDateStr(t2);
  }).map(a => {
    const md = a.meetDate;
    let urgency = 0;
    let urgLabel = "";
    if (md === toDateStr(t0)) { urgency = 0; urgLabel = "当日"; }
    else if (md === toDateStr(t1)) { urgency = 1; urgLabel = "1営業日前"; }
    else { urgency = 2; urgLabel = "2営業日前"; }
    return { ...a, urgency, urgLabel };
  }).sort((a, b) => a.urgency - b.urgency);

  const groups = [
    { key: 0, label: "当日", date: t0, color: "#e53835", bgColor: "#e5383508", borderColor: "#e5383520", icon: "🔴" },
    { key: 1, label: "1営業日前", date: t1, color: C.gold, bgColor: C.gold + "08", borderColor: C.gold + "20", icon: "🟡" },
    { key: 2, label: "2営業日前", date: t2, color: C.navy, bgColor: C.navy + "06", borderColor: C.navy + "15", icon: "🟢" },
  ];

  const totalCount = targets.length;

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      {/* Summary */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: C.white, borderRadius: 10, padding: "14px 20px", marginBottom: 16,
        border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, color: C.white,
          }}>☎</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>事前確認</div>
            <div style={{ fontSize: 10, color: C.textLight }}>ステータス「アポ取得」で面談が近いアポイント</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          {groups.map(g => {
            const cnt = targets.filter(t => t.urgency === g.key).length;
            return (
              <div key={g.key} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600 }}>{g.icon} {g.label}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: g.color, fontFamily: "'JetBrains Mono'" }}>{cnt}</div>
              </div>
            );
          })}
          <div style={{ textAlign: "center", borderLeft: "1px solid " + C.borderLight, paddingLeft: 16 }}>
            <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600 }}>合計</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.navy, fontFamily: "'JetBrains Mono'" }}>{totalCount}</div>
          </div>
        </div>
      </div>

      {/* Groups */}
      {groups.map(g => {
        const items = targets.filter(t => t.urgency === g.key);
        if (items.length === 0) return (
          <div key={g.key} style={{
            background: C.white, borderRadius: 10, padding: "16px 20px", marginBottom: 12,
            border: "1px solid " + C.borderLight, opacity: 0.6,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>{g.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: g.color }}>{g.label}</span>
              <span style={{ fontSize: 11, color: C.textLight }}>─ 面談日: {dayLabel(g.date)}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: C.textLight }}>対象なし</span>
            </div>
          </div>
        );
        return (
          <div key={g.key} style={{
            background: C.white, borderRadius: 10, marginBottom: 12,
            border: "1px solid " + C.borderLight, overflow: "hidden",
          }}>
            {/* Group header */}
            <div style={{
              padding: "12px 20px", background: g.bgColor,
              borderBottom: "1px solid " + g.borderColor,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>{g.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: g.color }}>{g.label}</span>
                <span style={{ fontSize: 11, color: C.textMid }}>─ 面談日: {dayLabel(g.date)}</span>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700, color: g.color,
                background: g.color + "12", padding: "2px 10px", borderRadius: 10,
              }}>{items.length}件</span>
            </div>
            {/* Table header */}
            <div style={{
              display: "grid", gridTemplateColumns: "2fr 1.5fr 0.8fr 0.8fr 1fr",
              padding: "6px 20px", background: C.offWhite, fontSize: 9, fontWeight: 600, color: C.textLight,
              borderBottom: "1px solid " + C.borderLight,
            }}>
              <span>企業名</span>
              <span>クライアント</span>
              <span>取得者</span>
              <span>面談日</span>
              <span>確認状況</span>
            </div>
            {/* Rows */}
            {items.map((a, i) => {
              const pcs = a.preCheckStatus;
              const badgeColor = pcs === '確認完了' ? C.green : pcs === '確認中' ? C.gold : pcs === 'リスケ' ? C.orange : pcs === 'キャンセル' ? C.red : null;
              return (
                <div key={i}
                  onClick={() => setSelectedAppo(a)}
                  onMouseEnter={e => { e.currentTarget.style.background = C.offWhite; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                  style={{
                    display: "grid", gridTemplateColumns: "2fr 1.5fr 0.8fr 0.8fr 1fr",
                    padding: "10px 20px", fontSize: 12, alignItems: "center",
                    borderBottom: i < items.length - 1 ? "1px solid " + C.borderLight : "none",
                    borderLeft: "3px solid " + g.color,
                    cursor: "pointer",
                  }}>
                  <span style={{ fontWeight: 600, color: C.navy }}>{a.company}</span>
                  <span style={{ color: C.textMid, fontSize: 11 }}>{a.client}</span>
                  <span style={{ fontWeight: 600, color: C.textDark }}>{a.getter}</span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.textLight }}>{a.meetDate.slice(5)}</span>
                  <span>
                    {badgeColor
                      ? <span style={{ fontSize: 10, fontWeight: 700, color: badgeColor, background: badgeColor + '15', padding: '2px 8px', borderRadius: 10 }}>{pcs}</span>
                      : <span style={{ fontSize: 10, color: C.textLight }}>未入力 →</span>
                    }
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}

      {totalCount === 0 && (
        <div style={{
          background: C.white, borderRadius: 10, padding: "40px 20px",
          border: "1px solid " + C.borderLight, textAlign: "center",
        }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, marginBottom: 4 }}>事前確認の対象はありません</div>
          <div style={{ fontSize: 11, color: C.textLight }}>直近の面談で「アポ取得」ステータスのものはすべて確認済みです</div>
        </div>
      )}
      {selectedAppo && (
        <PreCheckModal
          appo={selectedAppo}
          onSave={handlePreCheckSave}
          onCancel={() => setSelectedAppo(null)}
        />
      )}
    </div>
  );
}

function MemberSuggestInput({ value, onChange, members = [], style, placeholder = '名前を入力して絞り込み' }) {
  const [suggs, setSuggs] = React.useState([]);
  const [show, setShow] = React.useState(false);
  const [rect, setRect] = React.useState(null);
  const inputRef = React.useRef(null);
  const memberNames = React.useMemo(
    () => members.map(m => typeof m === 'string' ? m : m.name || '').filter(Boolean),
    [members]
  );
  const open = (val) => {
    const r = inputRef.current?.getBoundingClientRect();
    if (r) setRect({ top: r.bottom + 2, left: r.left, width: r.width });
    const filtered = val ? memberNames.filter(n => n.includes(val)) : memberNames;
    setSuggs(filtered);
    setShow(filtered.length > 0);
  };
  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={value}
        onChange={e => { onChange(e.target.value); open(e.target.value); }}
        onFocus={() => open('')}
        onBlur={() => setTimeout(() => setShow(false), 150)}
        style={style}
        placeholder={placeholder}
      />
      {show && rect && (
        <div style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width,
          background: C.white, border: '1px solid ' + C.border, borderRadius: 4,
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)', zIndex: 99999, maxHeight: 180, overflowY: 'auto' }}>
          {suggs.map((name, i) => (
            <div key={i}
              onMouseDown={() => { onChange(name); setShow(false); }}
              style={{ padding: '7px 12px', fontSize: 11, cursor: 'pointer', color: C.textDark, fontFamily: "'Noto Sans JP'" }}
              onMouseEnter={e => e.currentTarget.style.background = C.offWhite}
              onMouseLeave={e => e.currentTarget.style.background = C.white}
            >{name}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function AppoListView({ appoData, setAppoData, members = [], setMembers, clientData = [] }) {
  const clientOptions = clientData.filter(c => c.status === "支援中" || c.status === "停止中");
  // ── ランク・レート自動計算 ──────────────────────────────────────
  const calcRankAndRate = (totalSales) => {
    if (totalSales >= 10000000) return { rank: 'Super Spartan', rate: 0.28 };
    if (totalSales >= 5000000)  return { rank: 'Spartan',       rate: 0.26 };
    if (totalSales >= 2000000)  return { rank: 'Player',        rate: 0.24 };
    return { rank: 'Trainee', rate: 0.22 };
  };
  const [apPeriod, setApPeriod] = useState(() =>
    localStorage.getItem('spanavi_appo_period') || "all"
  );
  const [apSelectedMonth, setApSelectedMonth] = useState(() => {
    const s = localStorage.getItem('spanavi_appo_month');
    return (s && AVAILABLE_MONTHS.some(m => m.yyyymm === s)) ? s : (AVAILABLE_MONTHS[0]?.yyyymm || "2026-03");
  });
  const [apCustomFrom, setApCustomFrom] = useState(() =>
    localStorage.getItem('spanavi_appo_from') || ""
  );
  const [apCustomTo, setApCustomTo] = useState(() =>
    localStorage.getItem('spanavi_appo_to') || ""
  );
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editForm, setEditForm] = useState(null);
  const [addAppoForm, setAddAppoForm] = useState(null);
  const [reportDetail, setReportDetail] = useState(null); // Appointment detail modal
  const [showRecordingDetail, setShowRecordingDetail] = useState(false);
  useEffect(() => { setShowRecordingDetail(false); }, [reportDetail]);

  useEffect(() => {
    localStorage.setItem('spanavi_appo_period', apPeriod);
    localStorage.setItem('spanavi_appo_month', apSelectedMonth);
    localStorage.setItem('spanavi_appo_from', apCustomFrom);
    localStorage.setItem('spanavi_appo_to', apCustomTo);
  }, [apPeriod, apSelectedMonth, apCustomFrom, apCustomTo]);

  const statuses = [...new Set(appoData.map(a => a.status))];

  const statusOrder = { "面談済": 0, "事前確認済": 1, "アポ取得": 2, "リスケ中": 3, "キャンセル": 4 };
  const filtered = appoData.filter(a => {
    const dm = a.meetDate ? a.meetDate.slice(0, 7) : "";
    if (dm < "2026-03") return false; // 2月以前を除外
    if (apPeriod === "month") { if (dm !== apSelectedMonth) return false; }
    else if (apPeriod === "custom") {
      if (apCustomFrom && dm < apCustomFrom) return false;
      if (apCustomTo && dm > apCustomTo) return false;
    }
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (search && !a.company.includes(search) && !a.client.includes(search) && !a.getter.includes(search)) return false;
    return true;
  }).sort((a, b) => {
    const sa = statusOrder[a.status] ?? 99;
    const sb = statusOrder[b.status] ?? 99;
    if (sa !== sb) return sa - sb;
    return (a.meetDate || "").localeCompare(b.meetDate || "");
  });

  const countableStatuses = ["面談済", "事前確認済", "アポ取得"];
  const countable = filtered.filter(a => countableStatuses.includes(a.status));
  const totalSales = countable.reduce((s, a) => s + (a.sales || 0), 0);
  const totalReward = countable.reduce((s, a) => s + (a.reward || 0), 0);

  const monthStats = AVAILABLE_MONTHS.map(({ label, yyyymm }) => {
    const items = appoData.filter(a =>
      a.meetDate && a.meetDate.slice(0, 7) === yyyymm && countableStatuses.includes(a.status)
    );
    return { month: label, count: items.length,
      sales: items.reduce((s, a) => s + (a.sales || 0), 0),
      reward: items.reduce((s, a) => s + (a.reward || 0), 0) };
  });

  const statusColor = (st) => {
    if (st === "面談済") return { bg: C.green + "12", color: C.green };
    if (st === "事前確認済") return { bg: C.navy + "10", color: C.navy };
    if (st === "アポ取得") return { bg: C.gold + "15", color: C.gold };
    if (st === "リスケ中") return { bg: "#ff980012", color: "#ff9800" };
    if (st === "キャンセル" || st.includes("キャンセル")) return { bg: "#e5383512", color: "#e53835" };
    return { bg: C.textLight + "10", color: C.textLight };
  };

  const colTemplate = setAppoData
    ? "1.2fr 1.2fr 0.6fr 0.6fr 0.6fr 0.5fr 0.6fr 0.6fr 32px"
    : "1.2fr 1.2fr 0.6fr 0.6fr 0.6fr 0.5fr 0.6fr 0.6fr";

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16,
        padding: "14px 18px", background: C.white, borderRadius: 10,
        border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>アポ一覧</span>
          <span style={{ fontSize: 11, color: C.textLight }}>{filtered.length}件</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="企業名・クライアント・取得者..."
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", width: 200 }} />
          {/* 月 / 期間指定 */}
          <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
            {[["all", "全月"], ["month", "月"], ["custom", "期間指定"]].map(([k, l]) => (
              <button key={k} onClick={() => setApPeriod(k)} style={{
                padding: "5px 10px", borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: "pointer",
                fontFamily: "'Noto Sans JP'",
                background: apPeriod === k ? C.navy : C.white,
                color: apPeriod === k ? C.white : C.textMid,
                border: "1px solid " + (apPeriod === k ? C.navy : C.border),
              }}>{l}</button>
            ))}
            {apPeriod === "month" && (
              <select value={apSelectedMonth} onChange={e => setApSelectedMonth(e.target.value)}
                style={{ padding: "4px 8px", borderRadius: 5, border: "1px solid " + C.border,
                  fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none" }}>
                {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
              </select>
            )}
            {apPeriod === "custom" && (
              <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                <select value={apCustomFrom} onChange={e => setApCustomFrom(e.target.value)}
                  style={{ padding: "4px 8px", borderRadius: 5, border: "1px solid " + C.border,
                    fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none" }}>
                  <option value="">開始月</option>
                  {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
                </select>
                <span style={{ fontSize: 10, color: C.textLight }}>〜</span>
                <select value={apCustomTo} onChange={e => setApCustomTo(e.target.value)}
                  style={{ padding: "4px 8px", borderRadius: 5, border: "1px solid " + C.border,
                    fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none" }}>
                  <option value="">終了月</option>
                  {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
                </select>
              </div>
            )}
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none" }}>
            <option value="all">全ステータス</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {setAppoData && (
            <button onClick={() => setAddAppoForm({ client: "", company: "", getter: "", getDate: "", meetDate: "", status: "アポ取得", sales: 0, reward: 0, note: "" })} style={{
              padding: "8px 18px", borderRadius: 8,
              background: "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")",
              border: "none", color: C.white, cursor: "pointer", fontSize: 12, fontWeight: 600,
              fontFamily: "'Noto Sans JP'", whiteSpace: "nowrap",
            }}>＋ アポ追加</button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div style={{ marginBottom: 16 }}>
        {/* Total row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 10 }}>
          <div style={{ padding: "14px 18px", background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight }}>
            <div style={{ fontSize: 10, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>アポ件数 <span style={{ fontSize: 9, color: C.textLight + "90" }}>（有効）</span></div>
            <div style={{ fontSize: 24, fontWeight: 900, color: C.navy, fontFamily: "'JetBrains Mono'" }}>{countable.length}<span style={{ fontSize: 11, fontWeight: 500, color: C.textLight, marginLeft: 4 }}>/ {filtered.length}件</span></div>
          </div>
          <div style={{ padding: "14px 18px", background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight }}>
            <div style={{ fontSize: 10, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>当社売上合計</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: C.gold, fontFamily: "'JetBrains Mono'" }}>{(totalSales / 10000).toFixed(1)}<span style={{ fontSize: 11, fontWeight: 500 }}>万円</span></div>
          </div>
          <div style={{ padding: "14px 18px", background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight }}>
            <div style={{ fontSize: 10, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>インターン報酬合計</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: C.green, fontFamily: "'JetBrains Mono'" }}>{(totalReward / 10000).toFixed(1)}<span style={{ fontSize: 11, fontWeight: 500 }}>万円</span></div>
          </div>
        </div>
        {/* Monthly breakdown */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(" + AVAILABLE_MONTHS.length + ", 1fr)", gap: 10 }}>
          {monthStats.map(ms => (
            <div key={ms.month} style={{
              padding: "10px 14px", background: C.white, borderRadius: 8,
              border: "1px solid " + C.borderLight,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 6, borderBottom: "1px solid " + C.borderLight, paddingBottom: 4 }}>{ms.month}</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}>
                <span style={{ color: C.textLight }}>有効アポ</span>
                <span style={{ fontWeight: 700, color: C.navy, fontFamily: "'JetBrains Mono'" }}>{ms.count}件</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}>
                <span style={{ color: C.textLight }}>売上</span>
                <span style={{ fontWeight: 700, color: C.gold, fontFamily: "'JetBrains Mono'" }}>{(ms.sales / 10000).toFixed(1)}万</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                <span style={{ color: C.textLight }}>報酬</span>
                <span style={{ fontWeight: 700, color: C.green, fontFamily: "'JetBrains Mono'" }}>{(ms.reward / 10000).toFixed(1)}万</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: C.white, borderRadius: 10, overflow: "hidden", border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)" }}>
        <div style={{
          display: "grid", gridTemplateColumns: colTemplate,
          padding: "8px 16px", background: C.navyDeep,
          fontSize: 9, fontWeight: 600, color: C.goldLight, letterSpacing: 0.5,
        }}>
          <span>クライアント</span><span>企業名</span><span>取得者</span><span>取得日</span><span>面談日</span><span>ステータス</span><span>当社売上</span><span>インターン報酬</span>{setAppoData && <span></span>}
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: "30px 0", textAlign: "center", color: C.textLight, fontSize: 12 }}>データがありません</div>
        ) : filtered.map((a, i) => {
          const sc = statusColor(a.status);
          return (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: colTemplate,
              padding: "8px 16px", fontSize: 11, alignItems: "center",
              borderBottom: "1px solid " + C.borderLight,
            }}>
              <span style={{ color: C.textMid, fontSize: 10 }}>{a.client}</span>
              <span style={{ fontWeight: 600, color: C.navy, cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 2 }} onClick={() => setReportDetail(a)}>{a.company}</span>
              <span style={{ color: C.textDark }}>{a.getter}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, color: C.textLight }}>{a.getDate.slice(5)}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, color: C.textLight }}>{a.meetDate.slice(5)}</span>
              <span style={{
                fontSize: 9, padding: "2px 6px", borderRadius: 3, textAlign: "center", fontWeight: 600,
                background: sc.bg, color: sc.color,
              }}>{a.status}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, fontWeight: 600, color: C.navy }}>{a.sales > 0 ? (a.sales / 10000).toFixed(1) + "万" : "-"}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.textMid }}>{a.reward > 0 ? (a.reward / 10000).toFixed(1) + "万" : "-"}</span>
              {setAppoData && <span style={{ textAlign: "center" }}><button onClick={() => setEditForm({ ...a, _idx: appoData.indexOf(a) })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 2 }}>&#9998;</button></span>}
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {editForm && setAppoData && (() => {
        const inputStyle = { width: "100%", padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", background: C.offWhite };
        const labelStyle = { fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 2, display: "block" };
        const u = (k, v) => setEditForm(p => ({ ...p, [k]: v }));
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: C.white, borderRadius: 12, width: 520, maxHeight: "90vh", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
              <div style={{ padding: "14px 20px", background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")", borderRadius: "12px 12px 0 0", color: C.white }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>アポ情報を編集</div>
                <div style={{ fontSize: 10, color: C.goldLight, marginTop: 2 }}>{editForm.company}</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={labelStyle}>クライアント</label>
                    <select value={editForm.client} onChange={e => {
                      const name = e.target.value;
                      const client = clientOptions.find(c => c.company === name);
                      const rewardRow = client?.rewardType ? REWARD_MASTER.find(r => r.id === client.rewardType) : null;
                      setEditForm(p => ({ ...p, client: name, ...(name && rewardRow ? { sales: rewardRow.price } : {}) }));
                    }} style={inputStyle}>
                      <option value="">選択...</option>
                      {clientOptions.map(c => (
                        <option key={c._supaId || c.company} value={c.company}>
                          {c.company}{c.status === "停止中" ? "（停止中）" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div><label style={labelStyle}>企業名</label><input value={editForm.company} onChange={e => u("company", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>取得者</label><MemberSuggestInput value={editForm.getter} onChange={v => u("getter", v)} members={members} style={inputStyle} /></div>
                  <div><label style={labelStyle}>ステータス</label>
                    <select value={editForm.status} onChange={e => u("status", e.target.value)} style={inputStyle}>
                      <option value="面談済">面談済</option><option value="事前確認済">事前確認済</option><option value="アポ取得">アポ取得</option><option value="リスケ中">リスケ中</option><option value="キャンセル">キャンセル</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>取得日</label><input type="date" value={editForm.getDate} onChange={e => u("getDate", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>面談日</label><input type="date" value={editForm.meetDate} onChange={e => u("meetDate", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>当社売上</label><input type="number" value={editForm.sales} onChange={e => u("sales", Number(e.target.value))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>インターン報酬</label><input type="number" value={editForm.reward} onChange={e => u("reward", Number(e.target.value))} style={inputStyle} /></div>
                  <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>備考</label><input value={editForm.note} onChange={e => u("note", e.target.value)} style={inputStyle} /></div>
                </div>
              </div>
              <div style={{ padding: "10px 20px", borderTop: "1px solid " + C.borderLight, display: "flex", justifyContent: "space-between" }}>
                <button onClick={async () => {
                  if (editForm._supaId) {
                    const error = await deleteAppointment(editForm._supaId);
                    if (error) { alert('削除に失敗しました: ' + (error.message || '不明なエラー')); return; }
                  }
                  setAppoData(prev => prev.filter((_, i) => i !== editForm._idx));
                  setEditForm(null);
                }} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #e5383530", background: C.white, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#e53835", fontFamily: "'Noto Sans JP'" }}>削除</button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setEditForm(null)} style={{ padding: "8px 20px", borderRadius: 6, border: "1px solid " + C.border, background: C.white, cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.textMid, fontFamily: "'Noto Sans JP'" }}>キャンセル</button>
                  <button onClick={async () => {
                    const idx = editForm._idx;
                    const original = appoData[idx];
                    const updated = { ...editForm };
                    delete updated._idx;

                    const wasKanryo = original?.status === '面談済';
                    const isKanryo  = updated.status === '面談済';

                    // ── 面談済ステータス変更時の報酬自動計算 ──────────
                    if ((isKanryo || wasKanryo) && setMembers) {
                      const member = members.find(m => typeof m !== 'string' && m.name === updated.getter);
                      if (member?._supaId) {
                        // intern_reward = sales × incentive_rate（面談済移行時のみ）
                        if (isKanryo && !wasKanryo) {
                          updated.reward = Math.round((updated.sales || 0) * (member.rate || 0));
                        }
                        // cumulative_sales の増減
                        const delta = (isKanryo && !wasKanryo)  ?  (updated.sales  || 0)
                                    : (!isKanryo && wasKanryo)  ? -(original.sales || 0)
                                    : 0;
                        if (delta !== 0) {
                          const newTotal = Math.max(0, (member.totalSales || 0) + delta);
                          const { rank: newRank, rate: newRate } = calcRankAndRate(newTotal);
                          await updateMemberReward(member._supaId, {
                            cumulativeSales: newTotal,
                            rank: newRank,
                            incentiveRate: newRate,
                          });
                          setMembers(prev => prev.map(m =>
                            (typeof m !== 'string' && m._supaId === member._supaId)
                              ? { ...m, totalSales: newTotal, rank: newRank, rate: newRate }
                              : m
                          ));
                        }
                      }
                    }

                    if (updated._supaId) {
                      const error = await updateAppointment(updated._supaId, updated);
                      if (error) { alert('保存に失敗しました: ' + (error.message || '不明なエラー')); return; }
                    }
                    setAppoData(prev => prev.map((a, i) => i === idx ? updated : a));
                    setEditForm(null);
                  }} style={{
                    padding: "8px 24px", borderRadius: 6, border: "none",
                    background: "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")",
                    cursor: "pointer", fontSize: 11, fontWeight: 700, color: C.white, fontFamily: "'Noto Sans JP'",
                  }}>保存</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Appo Modal */}
      {addAppoForm && setAppoData && (() => {
        const inputStyle = { width: "100%", padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", background: C.offWhite };
        const labelStyle = { fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 2, display: "block" };
        const u = (k, v) => setAddAppoForm(p => ({ ...p, [k]: v }));
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: C.white, borderRadius: 12, width: 520, maxHeight: "90vh", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
              <div style={{ padding: "14px 20px", background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")", borderRadius: "12px 12px 0 0", color: C.white }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>アポを追加</div>
                <div style={{ fontSize: 10, color: C.goldLight, marginTop: 2 }}>新規アポイント登録</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={labelStyle}>クライアント名</label>
                    <select value={addAppoForm.client} onChange={e => {
                      const name = e.target.value;
                      const client = clientOptions.find(c => c.company === name);
                      const rewardRow = client?.rewardType ? REWARD_MASTER.find(r => r.id === client.rewardType) : null;
                      setAddAppoForm(p => ({ ...p, client: name, ...(name && rewardRow ? { sales: rewardRow.price } : {}) }));
                    }} style={inputStyle}>
                      <option value="">選択...</option>
                      {clientOptions.map(c => (
                        <option key={c._supaId || c.company} value={c.company}>
                          {c.company}{c.status === "停止中" ? "（停止中）" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div><label style={labelStyle}>企業名 <span style={{ color: "#e53835" }}>*</span></label><input value={addAppoForm.company} onChange={e => u("company", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>取得者名</label><MemberSuggestInput value={addAppoForm.getter} onChange={v => u("getter", v)} members={members} style={inputStyle} /></div>
                  <div><label style={labelStyle}>ステータス</label>
                    <select value={addAppoForm.status} onChange={e => u("status", e.target.value)} style={inputStyle}>
                      <option value="面談済">面談済</option><option value="事前確認済">事前確認済</option><option value="アポ取得">アポ取得</option><option value="リスケ中">リスケ中</option><option value="キャンセル">キャンセル</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>取得日</label><input type="date" value={addAppoForm.getDate} onChange={e => u("getDate", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>面談日</label><input type="date" value={addAppoForm.meetDate} onChange={e => u("meetDate", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>当社売上</label><input type="number" value={addAppoForm.sales} onChange={e => u("sales", Number(e.target.value))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>インターン報酬</label><input type="number" value={addAppoForm.reward} onChange={e => u("reward", Number(e.target.value))} style={inputStyle} /></div>
                  <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>備考</label><input value={addAppoForm.note} onChange={e => u("note", e.target.value)} style={inputStyle} /></div>
                </div>
              </div>
              <div style={{ padding: "10px 20px", borderTop: "1px solid " + C.borderLight, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setAddAppoForm(null)} style={{ padding: "8px 20px", borderRadius: 6, border: "1px solid " + C.border, background: C.white, cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.textMid, fontFamily: "'Noto Sans JP'" }}>キャンセル</button>
                <button onClick={async () => {
                  if (!addAppoForm.company.trim()) return;
                  const newAppo = {
                    client: addAppoForm.client,
                    company: addAppoForm.company,
                    getter: addAppoForm.getter,
                    getDate: addAppoForm.getDate,
                    meetDate: addAppoForm.meetDate,
                    status: addAppoForm.status,
                    sales: addAppoForm.sales,
                    reward: addAppoForm.reward,
                    note: addAppoForm.note,
                    month: addAppoForm.meetDate ? (parseInt(addAppoForm.meetDate.slice(5, 7), 10) + '月') : '',
                  };
                  const { result, error } = await insertAppointment(addAppoForm);
                  if (error || !result) { alert('保存に失敗しました: ' + (error?.message || '不明なエラー')); return; }
                  newAppo._supaId = result.id;
                  setAppoData(prev => [...prev, newAppo]);
                  setAddAppoForm(null);
                }} style={{
                  padding: "8px 24px", borderRadius: 6, border: "none",
                  background: "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")",
                  cursor: "pointer", fontSize: 11, fontWeight: 700, color: C.white, fontFamily: "'Noto Sans JP'",
                }}>保存</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Appointment Detail Modal */}
      {reportDetail && (
        <div onClick={() => setReportDetail(null)} style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(10,25,41,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 200, animation: "fadeIn 0.2s ease",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: C.white, borderRadius: 12, width: 520, maxHeight: "80vh", overflow: "auto",
            boxShadow: "0 20px 60px rgba(10,25,41,0.3)",
          }}>
            <div style={{
              background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")",
              padding: "16px 20px", borderRadius: "12px 12px 0 0",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.white }}>アポイント詳細</span>
              <button onClick={() => setReportDetail(null)} style={{ width: 28, height: 28, borderRadius: 6, background: C.white + "15", border: "none", color: C.white, cursor: "pointer", fontSize: 14 }}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.navy, marginBottom: 12 }}>{reportDetail.company}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                {[
                  { label: "クライアント", value: reportDetail.client },
                  { label: "取得者", value: reportDetail.getter },
                  { label: "取得日", value: reportDetail.getDate },
                  { label: "面談日", value: reportDetail.meetDate },
                  { label: "ステータス", value: reportDetail.status },
                  { label: "月", value: reportDetail.meetDate ? (parseInt(reportDetail.meetDate.slice(5, 7), 10) + "月") : null },
                ].map((item, i) => (
                  <div key={i} style={{ padding: "8px 12px", borderRadius: 6, background: C.offWhite, border: "1px solid " + C.borderLight }}>
                    <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.navy }}>{item.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                <div style={{ padding: "10px 14px", borderRadius: 8, background: C.navy + "08", border: "1px solid " + C.navy + "15" }}>
                  <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>当社売上</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: C.navy, fontFamily: "'JetBrains Mono'" }}>{reportDetail.sales > 0 ? "¥" + reportDetail.sales.toLocaleString() : "-"}</div>
                </div>
                <div style={{ padding: "10px 14px", borderRadius: 8, background: C.gold + "08", border: "1px solid " + C.gold + "15" }}>
                  <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>インターン報酬</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: C.gold, fontFamily: "'JetBrains Mono'" }}>{reportDetail.reward > 0 ? "¥" + reportDetail.reward.toLocaleString() : "-"}</div>
                </div>
              </div>
              {reportDetail.note && (
                <div style={{ padding: "10px 14px", borderRadius: 8, background: C.offWhite, border: "1px solid " + C.borderLight, marginBottom: 12 }}>
                  <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>備考</div>
                  <div style={{ fontSize: 12, color: C.textDark, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{reportDetail.note}</div>
                </div>
              )}
              {reportDetail.appoReport ? (
                <div style={{ padding: "10px 14px", borderRadius: 8, background: C.gold + "06", border: "1px solid " + C.gold + "20", borderLeft: "3px solid " + C.gold }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.gold, marginBottom: 6 }}>📋 アポ取得報告</div>
                  <div style={{ fontSize: 11, color: C.textDark, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{reportDetail.appoReport}</div>
                </div>
              ) : (
                <div style={{ padding: "12px", borderRadius: 6, background: C.offWhite, textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: C.textLight }}>アポ取得報告はまだ登録されていません</div>
                </div>
              )}
              {(() => {
                const src = reportDetail.appoReport || reportDetail.note || '';
                const m = src.match(/録音URL[：:]\s*(https?:\/\/\S+)/);
                const recUrl = m?.[1]?.trim() || '';
                return (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ padding: '5px 8px', borderRadius: 5, background: C.offWhite,
                      display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: C.navy, whiteSpace: 'nowrap' }}>🎙 録音</span>
                      {recUrl
                        ? <button onClick={() => setShowRecordingDetail(v => !v)}
                            title={showRecordingDetail ? "閉じる" : "録音を再生"}
                            style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
                              padding: 0, lineHeight: 1, color: showRecordingDetail ? C.red : 'inherit' }}>🎙</button>
                        : <span style={{ fontSize: 11, color: C.textLight }}>録音なし</span>
                      }
                    </div>
                    {showRecordingDetail && recUrl && (
                      <InlineAudioPlayer url={recUrl} onClose={() => setShowRecordingDetail(false)} />
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Members View (Employee Directory)
// ============================================================
function MembersView({ members, setMembers }) {
  const [search, setSearch] = useState("");
  const [addForm, setAddForm] = useState(null);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const filtered = members.filter(m => {
    if (search && !m.name.includes(search) && !m.university.includes(search)) return false;
    return true;
  });

  // Group by team
  const teamOrder = ["代表取締役", "営業統括", "成尾", "高橋", "クライアント開拓"];
  const grouped = {};
  filtered.forEach(m => {
    const t = m.team || (m.role === "営業統括" ? "営業統括" : "その他");
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push(m);
  });
  const sortedTeams = Object.keys(grouped).sort((a, b) => {
    const ai = teamOrder.indexOf(a); const bi = teamOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const formatCurrency = (val) => {
    if (!val) return "-";
    return (val / 10000).toFixed(1) + "万";
  };

  const colTemplate = setMembers ? "3% 10% 15% 4% 10% 8% 10% 10% 10% 10% 10%" : "3% 11% 17% 4% 11% 9% 11% 11% 12% 11%";

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16,
        padding: "14px 18px", background: C.white, borderRadius: 10,
        border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>👥</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>従業員名簿</span>
          <span style={{ fontSize: 11, color: C.textLight }}>{members.length}名</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="名前・大学で検索..."
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", width: 180 }} />
          {setMembers && <button onClick={() => setAddForm({ name: "", university: "", year: 1, team: "成尾", role: "メンバー", rank: "トレーニー", rate: 0.22, referrerName: "" })} style={{
            padding: "6px 12px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 600,
            background: "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")",
            color: C.white, cursor: "pointer", fontFamily: "'Noto Sans JP'",
          }}>+ 追加</button>}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {sortedTeams.map(team => (
          <div key={team} style={{
            background: C.white, borderRadius: 10, overflow: "hidden",
            border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)",
          }}>
            <div style={{
              padding: "10px 16px", background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.white }}>{(team === "営業統括" || team === "代表取締役") ? team : team + "チーム"}</span>
              <span style={{ fontSize: 10, color: C.goldLight }}>{grouped[team].length}名</span>
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: colTemplate,
              padding: "6px 16px", background: C.offWhite, borderBottom: "1px solid " + C.borderLight,
              fontSize: 9, fontWeight: 600, color: C.textLight, letterSpacing: 0.5,
            }}>
              <span style={{ textAlign: "center" }}>No</span><span>氏名</span><span>大学名</span><span style={{ textAlign: "center" }}>学年</span><span style={{ textAlign: "center" }}>役職</span><span style={{ textAlign: "center" }}>ランク</span><span style={{ textAlign: "right" }}>累計売上</span><span style={{ textAlign: "center" }}>インセンティブ率</span><span style={{ textAlign: "center" }}>入社日</span><span style={{ textAlign: "center" }}>稼働開始日</span>{setMembers && <span></span>}
            </div>
            {grouped[team].sort((a, b) => {
              const order = { "チームリーダー": 0, "副リーダー": 1, "営業統括": 2, "メンバー": 3, "": 4 };
              return (order[a.role] ?? 4) - (order[b.role] ?? 4);
            }).map((m, idx) => (
              <div key={m.id} style={{
                display: "grid", gridTemplateColumns: colTemplate,
                padding: "8px 16px", fontSize: 11, alignItems: "center",
                borderBottom: "1px solid " + C.borderLight,
              }}>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.textLight, textAlign: "center" }}>{idx + 1}</span>
                <span style={{ fontWeight: 600, color: C.navy }}>{m.name}</span>
                <span style={{ color: C.textMid, fontSize: 10 }}>{m.university}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", color: C.textLight, textAlign: "center" }}>{m.year}</span>
                <span style={{
                  fontSize: 9, padding: "1px 5px", borderRadius: 3, textAlign: "center",
                  background: m.role === "チームリーダー" ? C.gold + "15" : m.role === "副リーダー" ? C.navy + "10" : m.role === "営業統括" ? C.green + "10" : "transparent",
                  color: m.role === "チームリーダー" ? C.gold : m.role === "副リーダー" ? C.navy : m.role === "営業統括" ? C.green : C.textLight,
                  fontWeight: 600,
                }}>{m.role || "メンバー"}</span>
                <span style={{ fontSize: 10, textAlign: "center", color: m.rank === "プレイヤー" ? C.gold : C.textLight }}>{m.rank || "-"}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, fontWeight: 500, textAlign: "right", color: m.totalSales > 0 ? C.navy : C.textLight }}>{formatCurrency(m.totalSales)}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, textAlign: "center", color: m.rate > 0 ? C.green : C.textLight }}>{m.rate > 0 ? (m.rate * 100).toFixed(0) + "%" : "-"}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, textAlign: "center", color: C.textLight }}>{(m.joinDate || '').slice(2)}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, textAlign: "center", color: C.textLight }}>{m.operationStartDate ? m.operationStartDate.slice(2) : '-'}</span>
                {setMembers && <span style={{ textAlign: "center" }}><button onClick={() => setEditForm({ ...m })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 2 }}>&#9998;</button></span>}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Edit Member Modal */}
      {editForm && setMembers && (() => {
        const inputStyle = {
          width: "100%", padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.border,
          fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", background: C.offWhite,
        };
        const labelStyle = { fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 2, display: "block" };
        const u = (k, v) => setEditForm(p => ({ ...p, [k]: v }));
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: C.white, borderRadius: 12, width: 440, boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
              <div style={{ padding: "14px 20px", background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")", borderRadius: "12px 12px 0 0", color: C.white }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{editForm.name} を編集</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={labelStyle}>氏名 *</label><input value={editForm.name} onChange={e => u("name", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>大学名</label><input value={editForm.university || ""} onChange={e => u("university", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>学年</label><input type="number" value={editForm.year} onChange={e => u("year", Number(e.target.value))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>チーム</label>
                    <select value={editForm.team} onChange={e => u("team", e.target.value)} style={inputStyle}>
                      <option value="成尾">成尾</option><option value="高橋">高橋</option><option value="クライアント開拓">クライアント開拓</option><option value="">営業統括</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>役職</label>
                    <select value={editForm.role} onChange={e => u("role", e.target.value)} style={inputStyle}>
                      <option value="メンバー">メンバー</option><option value="副リーダー">副リーダー</option><option value="チームリーダー">チームリーダー</option><option value="営業統括">営業統括</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>ランク</label>
                    <select value={editForm.rank} onChange={e => u("rank", e.target.value)} style={inputStyle}>
                      <option value="トレーニー">トレーニー</option><option value="プレイヤー">プレイヤー</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>内定先</label><input value={editForm.offer || ""} onChange={e => u("offer", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>インセンティブ率</label><input type="number" step="0.01" value={editForm.rate} onChange={e => u("rate", Number(e.target.value))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>入社日</label><input type="date" value={editForm.joinDate || ""} onChange={e => u("joinDate", e.target.value)} style={inputStyle} /></div>
                  <div>
                    <label style={labelStyle}>稼働開始日</label>
                    <input type="date" value={editForm.operationStartDate || ""} onChange={e => u("operationStartDate", e.target.value)} style={inputStyle} />
                  </div>
                  <div><label style={labelStyle}>紹介者</label>
                    <select value={editForm.referrerName || ""} onChange={e => u("referrerName", e.target.value)} style={inputStyle}>
                      <option value="">（なし）</option>
                      {members.filter(m => m.id !== editForm.id).map(m => <option key={m.id || m.name} value={m.name}>{m.name}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ ...labelStyle, color: C.gold }}>Zoom User ID <span style={{ fontWeight: 400, color: C.textLight }}>（管理者専用）</span></label>
                    <input value={editForm.zoomUserId || ""} onChange={e => u("zoomUserId", e.target.value)} style={inputStyle} placeholder="例: lXsqw8miT5iHmX7cKz0R5w" />
                  </div>
                </div>
              </div>
              <div style={{ padding: "10px 20px", borderTop: "1px solid " + C.borderLight }}>
                {deleteError && <div style={{ fontSize: 11, color: "#e53835", marginBottom: 8, padding: "6px 10px", background: "#fde8e8", borderRadius: 4 }}>削除エラー: {deleteError}</div>}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                <button onClick={async () => {
                  if (!editForm._supaId) { setDeleteError('IDが見つかりません。ページを再読み込みしてください。'); return; }
                  if (!window.confirm(`「${editForm.name}」を削除しますか？`)) return;
                  setDeleteSaving(true);
                  setDeleteError(null);
                  const error = await deleteMember(editForm._supaId);
                  setDeleteSaving(false);
                  if (error) { setDeleteError(error.message || 'DBからの削除に失敗しました。'); return; }
                  setMembers(prev => prev.filter(x => x.id !== editForm.id));
                  setEditForm(null);
                  setDeleteError(null);
                }} disabled={deleteSaving} style={{
                  padding: "8px 16px", borderRadius: 6, border: "1px solid #e5383530",
                  background: C.white, cursor: deleteSaving ? "default" : "pointer", fontSize: 11, fontWeight: 600, color: "#e53835", fontFamily: "'Noto Sans JP'",
                }}>{deleteSaving ? '削除中...' : '削除'}</button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setEditForm(null); setDeleteError(null); }} style={{ padding: "8px 20px", borderRadius: 6, border: "1px solid " + C.border, background: C.white, cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.textMid, fontFamily: "'Noto Sans JP'" }}>キャンセル</button>
                  <button onClick={async () => {
                    if (!editForm.name.trim()) return;
                    if (editForm._supaId) {
                      const error = await updateMember(editForm._supaId, editForm);
                      if (error) { alert('保存に失敗しました: ' + (error.message || '不明なエラー')); return; }
                    }
                    setMembers(prev => prev.map(m => m.id === editForm.id ? { ...m, ...editForm } : m));
                    setEditForm(null);
                  }} style={{
                    padding: "8px 24px", borderRadius: 6, border: "none",
                    background: "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")",
                    cursor: "pointer", fontSize: 11, fontWeight: 700, color: C.white, fontFamily: "'Noto Sans JP'",
                  }}>保存</button>
                </div>
              </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Member Modal */}
      {addForm && setMembers && (() => {
        const inputStyle = {
          width: "100%", padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.border,
          fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", background: C.offWhite,
        };
        const labelStyle = { fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 2, display: "block" };
        const u = (k, v) => setAddForm(p => ({ ...p, [k]: v }));
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: C.white, borderRadius: 12, width: 440, boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
              <div style={{ padding: "14px 20px", background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")", borderRadius: "12px 12px 0 0", color: C.white }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>従業員を追加</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={labelStyle}>氏名 *</label><input value={addForm.name} onChange={e => u("name", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>大学名</label><input value={addForm.university || ""} onChange={e => u("university", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>学年</label><input type="number" value={addForm.year} onChange={e => u("year", Number(e.target.value))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>チーム</label>
                    <select value={addForm.team} onChange={e => u("team", e.target.value)} style={inputStyle}>
                      <option value="成尾">成尾</option><option value="高橋">高橋</option><option value="クライアント開拓">クライアント開拓</option><option value="">営業統括</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>役職</label>
                    <select value={addForm.role} onChange={e => u("role", e.target.value)} style={inputStyle}>
                      <option value="メンバー">メンバー</option><option value="副リーダー">副リーダー</option><option value="チームリーダー">チームリーダー</option><option value="営業統括">営業統括</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>ランク</label>
                    <select value={addForm.rank} onChange={e => u("rank", e.target.value)} style={inputStyle}>
                      <option value="トレーニー">トレーニー</option><option value="プレイヤー">プレイヤー</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>紹介者</label>
                    <select value={addForm.referrerName || ""} onChange={e => u("referrerName", e.target.value)} style={inputStyle}>
                      <option value="">（なし）</option>
                      {members.map(m => <option key={m.id || m.name} value={m.name}>{m.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div style={{ padding: "10px 20px", borderTop: "1px solid " + C.borderLight }}>
                {addError && <div style={{ fontSize: 11, color: "#e53835", marginBottom: 8, padding: "6px 10px", background: "#fde8e8", borderRadius: 4 }}>エラー: {addError}</div>}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => { setAddForm(null); setAddError(null); }} style={{ padding: "8px 20px", borderRadius: 6, border: "1px solid " + C.border, background: C.white, cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.textMid, fontFamily: "'Noto Sans JP'" }}>キャンセル</button>
                  <button onClick={async () => {
                    if (!addForm.name.trim()) return;
                    setAddSaving(true);
                    setAddError(null);
                    const today = new Date().toISOString().slice(0, 10);
                    const { result, error } = await insertMember(addForm);
                    setAddSaving(false);
                    if (error || !result) {
                      setAddError(error?.message || 'DBへの保存に失敗しました。RLSポリシーを確認してください。');
                      return;
                    }
                    setMembers(prev => [...prev, {
                      ...addForm,
                      id: result.id,
                      _supaId: result.id,
                      offer: addForm.offer || "",
                      totalSales: 0,
                      joinDate: today,
                    }]);
                    setAddForm(null);
                    setAddError(null);
                  }} disabled={!addForm.name.trim() || addSaving} style={{
                    padding: "8px 24px", borderRadius: 6, border: "none",
                    background: addForm.name.trim() && !addSaving ? "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")" : C.border,
                    cursor: addForm.name.trim() && !addSaving ? "pointer" : "default", fontSize: 11, fontWeight: 700, color: C.white, fontFamily: "'Noto Sans JP'",
                  }}>{addSaving ? '保存中...' : '追加'}</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ============================================================
// Stats View (Performance Dashboard)
// ============================================================
// ============================================================
// Company Search View (企業検索)
// ============================================================
function CompanySearchView({ importedCSVs, callListData, setCallingScreen, setImportedCSVs, clientData = [], currentUser, members = [], setCallFlowScreen }) {
  const [subTab, setSubTab] = useState("company");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchField, setSearchField] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientSortBy, setClientSortBy] = useState(null);
  const [clientSortDir, setClientSortDir] = useState("asc");

  // List search state（リスト検索）
  const [lsClientInput, setLsClientInput] = useState("");
  const [lsClientFocused, setLsClientFocused] = useState(false);
  const [lsIndustry, setLsIndustry] = useState("");
  const [lsIndustryFocused, setLsIndustryFocused] = useState(false);
  const [lsPref, setLsPref] = useState("");
  const [lsRevenueMin, setLsRevenueMin] = useState("");
  const [lsRevenueMax, setLsRevenueMax] = useState("");
  const [lsNetIncomeMin, setLsNetIncomeMin] = useState("");
  const [lsNetIncomeMax, setLsNetIncomeMax] = useState("");
  const [lsStatus, setLsStatus] = useState([]);
  const [lsCallCountMin, setLsCallCountMin] = useState("");
  const [lsCallCountMax, setLsCallCountMax] = useState("");
  const [lsResults, setLsResults] = useState(null); // null = 未検索（リストレベル）
  const [lsItemResults, setLsItemResults] = useState(null); // null = 未検索（企業レベル）
  const [lsCalledCounts, setLsCalledCounts] = useState({});
  const [lsSearching, setLsSearching] = useState(false);
  const [lsExporting, setLsExporting] = useState(null); // エクスポート中の _supaId

  // Supabase-based company search
  const STATUS_ID_TO_JP = {
    normal: "不通", excluded: "除外", absent: "社長不在",
    reception_block: "受付ブロック", reception_recall: "受付再コール",
    ceo_recall: "社長再コール", appointment: "アポ獲得", ceo_decline: "社長お断り",
  };
  const JP_STATUS_COLOR = {
    "不通": C.navy, "除外": "#e53835", "社長不在": C.gold,
    "受付ブロック": C.navy, "受付再コール": "#d69e2e",
    "社長再コール": "#d69e2e", "アポ獲得": "#38a169", "社長お断り": "#805ad5",
  };
  const JP_STATUS_ABBR = {
    "不通": "不通", "除外": "除外", "社長不在": "不在",
    "受付ブロック": "受ブ", "受付再コール": "受再",
    "社長再コール": "社再", "アポ獲得": "アポ", "社長お断り": "社断",
  };

  const [allItems, setAllItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  useEffect(() => {
    fetchAllCallListItemsBasic().then(({ data }) => {
      setAllItems(data || []);
      setLoadingItems(false);
    });
  }, []);

  const [selectedItem, setSelectedItem] = useState(null);
  const [itemRecords, setItemRecords] = useState([]);
  const [loadingItemRecords, setLoadingItemRecords] = useState(false);
  useEffect(() => {
    if (!selectedItem) {
      setItemRecords([]); setSelectedItemFull(null); setActiveRecordingId(null);
      return;
    }
    setLoadingItemRecords(true);
    setSelectedItemFull(null);
    setActiveRecordingId(null);
    Promise.all([
      fetchCallRecordsByItemId(selectedItem.id),
      fetchCallListItemsByIds([selectedItem.id]),
    ]).then(([recordsRes, fullItemRes]) => {
      const recs = (recordsRes.data || []).sort((a, b) => a.round - b.round);
      setItemRecords(recs);
      const full = fullItemRes.data?.[0] || null;
      setSelectedItemFull(full);
      const nextRound = recs.length === 0 ? 1 : Math.min(Math.max(...recs.map(r => r.round)) + 1, 8);
      setSelectedRound(nextRound);
      const key = 'cf_note_' + selectedItem.id;
      setLocalMemo(localStorage.getItem(key) || '');
      setSubPhone(full?.sub_phone_number || '');
      setLoadingItemRecords(false);
    });
  }, [selectedItem?.id]);

  const [pageRecords, setPageRecords] = useState({});

  // Detail panel state
  const [selectedRound, setSelectedRound] = useState(null);
  const [localMemo, setLocalMemo] = useState('');
  const [savingMemo, setSavingMemo] = useState(false);
  const [subPhone, setSubPhone] = useState('');
  const [activeRecordingId, setActiveRecordingId] = useState(null);
  const [selectedItemFull, setSelectedItemFull] = useState(null);

  // Filter
  const filtered = useMemo(() => {
    let list = allItems;
    if (statusFilter !== "all") {
      if (statusFilter === "uncalled") list = list.filter(c => !c.call_status);
      else {
        const jpStatus = STATUS_ID_TO_JP[statusFilter];
        list = list.filter(c => c.call_status === jpStatus);
      }
    }
    if (!searchTerm.trim()) return list;
    const term = searchTerm.trim().toLowerCase();
    return list.filter(c => {
      if (searchField === "company") return (c.company || "").toLowerCase().includes(term);
      if (searchField === "representative") return (c.representative || "").toLowerCase().includes(term);
      if (searchField === "phone") return (c.phone || "").includes(term);
      if (searchField === "status") return (c.call_status || "").includes(term);
      return (c.company || "").toLowerCase().includes(term) ||
        (c.representative || "").toLowerCase().includes(term) ||
        (c.phone || "").includes(term) ||
        (c.call_status || "").toLowerCase().includes(term) ||
        (c.business || "").toLowerCase().includes(term);
    });
  }, [allItems, searchTerm, searchField, statusFilter]);

  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const sortedFiltered = clientSortBy ? [...filtered].sort((a, b) => {
    let va, vb;
    if (clientSortBy === "company") { va = a.company || ""; vb = b.company || ""; }
    else if (clientSortBy === "representative") { va = a.representative || ""; vb = b.representative || ""; }
    else if (clientSortBy === "phone") { va = a.phone || ""; vb = b.phone || ""; }
    else if (clientSortBy === "list") {
      const la = callListData.find(l => l._supaId === a.list_id); const lb = callListData.find(l => l._supaId === b.list_id);
      va = la ? la.company : ""; vb = lb ? lb.company : "";
    }
    else if (clientSortBy === "industry") {
      const la = callListData.find(l => l._supaId === a.list_id); const lb = callListData.find(l => l._supaId === b.list_id);
      va = la?.industry || ""; vb = lb?.industry || "";
    }
    else if (clientSortBy === "lastCall") {
      const getLC = (c) => { const recs = pageRecords[c.id]; if (!recs) return ""; let latest = ""; Object.values(recs).forEach(r => { if (r.called_at && r.called_at > latest) latest = r.called_at; }); return latest; };
      va = getLC(a); vb = getLC(b);
    }
    else if (clientSortBy === "status") { va = a.call_status || ""; vb = b.call_status || ""; }
    else { va = 0; vb = 0; }
    if (typeof va === "number") return clientSortDir === "asc" ? va - vb : vb - va;
    return clientSortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
  }) : filtered;
  const paged = sortedFiltered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sortedFiltered.length / PAGE_SIZE);

  // Lazy-load call records for current page items
  const pagedItemIdKey = useMemo(() => paged.map(i => i.id).join(','), [paged]);
  useEffect(() => {
    if (!paged.length) { setPageRecords({}); return; }
    const itemIds = paged.map(i => i.id).filter(Boolean);
    fetchCallRecordsByItemIds(itemIds).then(({ data }) => {
      const map = {};
      (data || []).forEach(r => {
        if (!map[r.item_id]) map[r.item_id] = {};
        map[r.item_id][r.round] = r;
      });
      setPageRecords(map);
    });
  }, [pagedItemIdKey]);

  // Reset page on search change
  useEffect(() => setPage(0), [searchTerm, searchField, statusFilter]);

  const statusOptions = [
    { id: "all", label: "すべて" }, { id: "uncalled", label: "未架電" },
    { id: "normal", label: "不通" }, { id: "excluded", label: "除外" },
    { id: "absent", label: "社長不在" }, { id: "reception_block", label: "受付ブロック" },
    { id: "reception_recall", label: "受付再コール" }, { id: "ceo_recall", label: "社長再コール" },
    { id: "appointment", label: "アポ獲得" }, { id: "ceo_decline", label: "社長お断り" },
  ];

  const fieldOptions = [
    { id: "all", label: "全項目" }, { id: "company", label: "企業名" },
    { id: "representative", label: "代表者名" }, { id: "phone", label: "電話番号" },
    { id: "status", label: "ステータス" },
  ];

  const statusColor = (sid) => {
    const map = { normal: C.navy, excluded: "#e53835", absent: C.gold, reception_block: C.navy, reception_recall: C.gold, ceo_recall: C.gold, appointment: C.gold, ceo_decline: C.navy };
    return map[sid] || C.textLight;
  };

  // === List search computed values ===
  const clientCandidates = useMemo(() => {
    return (clientData || [])
      .filter(c => c.status === "支援中" || c.status === "停止中")
      .map(c => c.company)
      .sort();
  }, [clientData]);

  const filteredClientCandidates = useMemo(() => {
    if (!lsClientInput) return clientCandidates;
    return clientCandidates.filter(n => n.includes(lsClientInput));
  }, [clientCandidates, lsClientInput]);

  const industryOptions = useMemo(() => {
    const set = new Set();
    (callListData || []).forEach(l => { if (l.industry) set.add(l.industry); });
    return [...set].sort();
  }, [callListData]);

  const filteredIndustryCandidates = useMemo(() => {
    if (!lsIndustry) return industryOptions;
    return industryOptions.filter(v => v.includes(lsIndustry));
  }, [industryOptions, lsIndustry]);

  const handleListSearch = async () => {
    setLsSearching(true);
    try {
      if (lsStatus.length > 0) {
        // ステータスフィルター選択時: 企業レベルで絞り込み（個別架電先企業を表示）
        const { data: items } = await fetchItemsByCallStatus(lsStatus);
        let filteredItems = items || [];
        // クライアント名・業種フィルターが指定されている場合は追加絞り込み
        if (lsClientInput || lsIndustry) {
          const listMap = {};
          callListData.forEach(l => { if (l._supaId) listMap[l._supaId] = l; });
          filteredItems = filteredItems.filter(item => {
            const list = listMap[item.list_id];
            if (!list) return false;
            if (lsClientInput && !list.company.includes(lsClientInput)) return false;
            if (lsIndustry && !(list.industry || "").includes(lsIndustry)) return false;
            return true;
          });
        }
        setLsItemResults(filteredItems);
        setLsResults(null);
      } else {
        // ステータスフィルターなし: リストレベルで絞り込み（従来動作）
        setLsItemResults(null);
        let results = callListData;
        if (lsClientInput) results = results.filter(l => l.company.includes(lsClientInput));
        if (lsIndustry) results = results.filter(l => (l.industry || "").includes(lsIndustry));
        const hasItemFilter = lsPref || lsRevenueMin || lsRevenueMax || lsNetIncomeMin || lsNetIncomeMax || lsCallCountMin || lsCallCountMax;
        if (hasItemFilter) {
          const matchingListIds = await fetchListIdsByItemCriteria({
            prefecture: lsPref || null,
            revenueMin: lsRevenueMin !== "" ? Number(lsRevenueMin) : null,
            revenueMax: lsRevenueMax !== "" ? Number(lsRevenueMax) : null,
            netIncomeMin: lsNetIncomeMin !== "" ? Number(lsNetIncomeMin) : null,
            netIncomeMax: lsNetIncomeMax !== "" ? Number(lsNetIncomeMax) : null,
            callCountMin: lsCallCountMin !== "" ? Number(lsCallCountMin) : null,
            callCountMax: lsCallCountMax !== "" ? Number(lsCallCountMax) : null,
          });
          if (matchingListIds !== null) {
            const idSet = new Set(matchingListIds);
            results = results.filter(l => l._supaId && idSet.has(l._supaId));
          } else {
            results = []; // DBエラー時は空結果
          }
        }
        setLsResults(results);
        const supaIds = results.map(l => l._supaId).filter(Boolean);
        if (supaIds.length > 0) {
          const counts = await fetchCalledItemCountsByListIds(supaIds);
          setLsCalledCounts(counts);
        }
      }
    } catch (e) {
      console.error("[handleListSearch] error:", e);
      setLsItemResults([]);
      setLsResults(null);
    }
    setLsSearching(false);
  };

  const handleExport = async (list) => {
    if (!list._supaId) { alert("このリストはSupabase未連携のためエクスポートできません"); return; }
    setLsExporting(list._supaId);
    try {
      const [itemsRes, recordsRes] = await Promise.all([
        fetchCallListItems(list._supaId),
        fetchCallRecords(list._supaId),
      ]);
      const items = itemsRes.data || [];
      const records = recordsRes.data || [];

      // item_id -> {round -> {status, date}} マップ
      const recordMap = {};
      records.forEach(r => {
        if (!recordMap[r.item_id]) recordMap[r.item_id] = {};
        const calledAt = r.called_at
          ? new Date(new Date(r.called_at).getTime() + 9 * 60 * 60 * 1000)
              .toISOString().slice(0, 10).replace(/-/g, '/')
          : '';
        recordMap[r.item_id][r.round] = { status: r.status, date: calledAt };
      });
      const maxRound = records.length > 0 ? Math.max(...records.map(r => r.round)) : 0;

      const { default: ExcelJS } = await import("exceljs");
      const wb = new ExcelJS.Workbook();

      // ======== Sheet 1: リストデータ ========
      const ws = wb.addWorksheet("リストデータ");
      const colWidths = [6, 30, 20, 40, 14, 14, 15, 16, 20];
      const header = ["No.", "企業名", "事業内容", "住所", "売上高（千円）", "当期純利益（千円）", "代表者", "電話番号", "備考"];
      for (let i = 1; i <= maxRound; i++) { header.push(`${i}回目日付`); colWidths.push(14); header.push(`${i}回目結果`); colWidths.push(16); }
      ws.columns = header.map((h, i) => ({ header: h, key: String(i), width: colWidths[i] || 16 }));

      const NAVY_ARGB = "FF1A3A5C";
      const GOLD_ARGB = "FFCBA040";
      const WHITE_ARGB = "FFFFFFFF";
      const RED_ARGB = "FFE53835";

      const headerRow = ws.getRow(1);
      headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: WHITE_ARGB }, size: 10 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_ARGB } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = { bottom: { style: "thin", color: { argb: GOLD_ARGB } } };
      });
      headerRow.height = 20;

      items.forEach(item => {
        const netIncome = item.net_income ?? "";
        const address = (item.address || "").replace(/\/$/, "");
        const memoText = (() => { try { const p = JSON.parse(item.memo || ""); return p.biko ?? ""; } catch { return item.memo || ""; } })();
        const rowData = [
          item.no, item.company || "", item.business || "", address,
          item.revenue ?? "", netIncome, item.representative || "", item.phone || "", memoText,
        ];
        const itemRecs = recordMap[item.id] || {};
        for (let i = 1; i <= maxRound; i++) { rowData.push(itemRecs[i]?.date || ""); rowData.push(itemRecs[i]?.status || ""); }
        const dataRow = ws.addRow(rowData);
        dataRow.getCell(1).alignment = { horizontal: "center" };
        // 売上高・当期純利益: 数値フォーマット + 右寄せ
        if (item.revenue != null && item.revenue !== "") {
          dataRow.getCell(5).numFmt = '#,##0';
          dataRow.getCell(5).alignment = { horizontal: "right" };
        }
        if (netIncome !== "") {
          dataRow.getCell(6).numFmt = '#,##0';
          dataRow.getCell(6).alignment = { horizontal: "right" };
        }
        // 電話番号: 中央寄せ
        dataRow.getCell(8).alignment = { horizontal: "center" };
      });

      // ======== Sheet 2: レポート ========
      const rs = wb.addWorksheet("レポート");
      rs.columns = [
        { key: "a", width: 16 }, { key: "b", width: 12 }, { key: "c", width: 12 },
        { key: "d", width: 12 }, { key: "e", width: 12 }, { key: "f", width: 12 },
      ];

      const CONNECTED = new Set(["社長不在", "社長再コール", "社長お断り", "アポ獲得"]);
      const weekMap = {};
      records.forEach(r => {
        if (!r.called_at) return;
        const d = new Date(r.called_at);
        const dow = (d.getDay() + 6) % 7;
        const mon = new Date(d); mon.setDate(d.getDate() - dow);
        const wk = mon.toISOString().slice(0, 10);
        if (!weekMap[wk]) weekMap[wk] = { calls: 0, connected: 0, appo: 0 };
        weekMap[wk].calls++;
        if (CONNECTED.has(r.status)) weekMap[wk].connected++;
        if (r.status === "アポ獲得") weekMap[wk].appo++;
      });
      const weeks = Object.keys(weekMap).sort();
      const totalCalls = records.length;
      const totalConnected = records.filter(r => CONNECTED.has(r.status)).length;
      const totalAppo = records.filter(r => r.status === "アポ獲得").length;
      const connRateTotal = totalCalls > 0 ? (totalConnected / totalCalls * 100).toFixed(1) + "%" : "0.0%";
      const appoRateTotal = totalCalls > 0 ? (totalAppo / totalCalls * 100).toFixed(1) + "%" : "0.0%";
      const dates = records.map(r => r.called_at?.slice(0, 10)).filter(Boolean).sort();
      const firstDate = dates[0] || ""; const lastDate = dates[dates.length - 1] || "";

      // テーブルヘッダー行
      const rh = rs.addRow(["週", "架電件数", "通電数", "通電率", "アポ数", "アポ率"]);
      rh.eachCell(cell => {
        cell.font = { bold: true, color: { argb: WHITE_ARGB } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_ARGB } };
        cell.alignment = { horizontal: "center" };
      });
      rh.height = 18;

      // 週ごとの行
      weeks.forEach(wk => {
        const { calls, connected, appo } = weekMap[wk];
        const cr = calls > 0 ? (connected / calls * 100).toFixed(1) + "%" : "0.0%";
        const ar = calls > 0 ? (appo / calls * 100).toFixed(1) + "%" : "0.0%";
        const dr = rs.addRow([`${wk}〜`, calls, connected, cr, appo, ar]);
        dr.getCell(4).alignment = { horizontal: "right" };
        dr.getCell(6).alignment = { horizontal: "right" };
        if (calls > 0 && connected / calls < 0.05) dr.getCell(4).font = { color: { argb: RED_ARGB } };
      });

      // 月間合計行（ゴールド背景）
      const totRow = rs.addRow(["月間合計", totalCalls, totalConnected, connRateTotal, totalAppo, appoRateTotal]);
      totRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: NAVY_ARGB } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD_ARGB } };
        cell.alignment = { horizontal: "center" };
      });

      // 空行
      rs.addRow([]);

      // レポートサマリーセクション
      const fmt = d => d ? d.replace(/-/g, "/") : "";
      const addSumRow = (text, bold = false) => {
        const row = rs.addRow([text]);
        row.getCell(1).font = { bold, color: { argb: NAVY_ARGB } };
        return row;
      };
      const sumHdr = rs.addRow(["【レポートサマリー】"]);
      sumHdr.getCell(1).font = { bold: true, size: 12, color: { argb: WHITE_ARGB } };
      sumHdr.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_ARGB } };
      sumHdr.height = 22;
      rs.mergeCells(sumHdr.number, 1, sumHdr.number, 6);

      addSumRow(`対象期間: ${fmt(firstDate)} 〜 ${fmt(lastDate)}`);
      addSumRow(`総架電件数: ${totalCalls}件`);
      addSumRow(`社長通電数: ${totalConnected}件（通電率: ${connRateTotal}）`);
      addSumRow(`アポ取得数: ${totalAppo}件（アポ率: ${appoRateTotal}）`);
      addSumRow(`週平均架電件数: ${weeks.length > 0 ? Math.round(totalCalls / weeks.length) : 0}件`);

      // ダウンロード
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      a.download = `${list.company || "クライアント"}_${list.industry || "リスト"}_${today}.xlsx`;
      a.href = url; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("[Export] error:", e);
      alert("エクスポートに失敗しました: " + e.message);
    }
    setLsExporting(null);
  };

  const handleExportItems = async () => {
    if (!lsItemResults?.length) return;
    setLsExporting('__items__');
    try {
      const itemIds = lsItemResults.map(i => i.id).filter(Boolean);
      const [itemsRes, recordsRes] = await Promise.all([
        fetchCallListItemsByIds(itemIds),
        fetchCallRecordsByItemIds(itemIds),
      ]);
      const items = itemsRes.data || [];
      const records = recordsRes.data || [];

      const itemListMap = {};
      callListData.forEach(l => { if (l._supaId) itemListMap[l._supaId] = l; });

      const recordMap = {};
      records.forEach(r => {
        if (!recordMap[r.item_id]) recordMap[r.item_id] = {};
        const calledAt = r.called_at
          ? new Date(new Date(r.called_at).getTime() + 9 * 60 * 60 * 1000)
              .toISOString().slice(0, 10).replace(/-/g, '/')
          : '';
        recordMap[r.item_id][r.round] = { status: r.status, date: calledAt };
      });
      const maxRound = records.length > 0 ? Math.max(...records.map(r => r.round)) : 0;

      const { default: ExcelJS } = await import("exceljs");
      const wb = new ExcelJS.Workbook();

      // ======== Sheet 1: リストデータ ========
      const ws = wb.addWorksheet("リストデータ");
      const colWidths = [6, 30, 20, 40, 14, 14, 15, 16, 20];
      const header = ["No.", "企業名", "事業内容", "住所", "売上高（千円）", "当期純利益（千円）", "代表者", "電話番号", "備考"];
      for (let i = 1; i <= maxRound; i++) { header.push(`${i}回目日付`); colWidths.push(14); header.push(`${i}回目結果`); colWidths.push(16); }
      ws.columns = header.map((h, i) => ({ header: h, key: String(i), width: colWidths[i] || 16 }));

      const NAVY_ARGB = "FF1A3A5C";
      const GOLD_ARGB = "FFCBA040";
      const WHITE_ARGB = "FFFFFFFF";
      const RED_ARGB = "FFE53835";

      const headerRow = ws.getRow(1);
      headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: WHITE_ARGB }, size: 10 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_ARGB } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = { bottom: { style: "thin", color: { argb: GOLD_ARGB } } };
      });
      headerRow.height = 20;

      items.forEach(item => {
        const netIncome = item.net_income ?? "";
        const address = (item.address || "").replace(/\/$/, "");
        const memoText = (() => { try { const p = JSON.parse(item.memo || ""); return p.biko ?? ""; } catch { return item.memo || ""; } })();
        const rowData = [
          item.no, item.company || "", item.business || "", address,
          item.revenue ?? "", netIncome, item.representative || "", item.phone || "", memoText,
        ];
        const itemRecs = recordMap[item.id] || {};
        for (let i = 1; i <= maxRound; i++) { rowData.push(itemRecs[i]?.date || ""); rowData.push(itemRecs[i]?.status || ""); }
        const dataRow = ws.addRow(rowData);
        dataRow.getCell(1).alignment = { horizontal: "center" };
        if (item.revenue != null && item.revenue !== "") {
          dataRow.getCell(5).numFmt = '#,##0';
          dataRow.getCell(5).alignment = { horizontal: "right" };
        }
        if (netIncome !== "") {
          dataRow.getCell(6).numFmt = '#,##0';
          dataRow.getCell(6).alignment = { horizontal: "right" };
        }
        dataRow.getCell(8).alignment = { horizontal: "center" };
      });

      // ======== Sheet 2: レポート ========
      const rs = wb.addWorksheet("レポート");
      rs.columns = [
        { key: "a", width: 16 }, { key: "b", width: 12 }, { key: "c", width: 12 },
        { key: "d", width: 12 }, { key: "e", width: 12 }, { key: "f", width: 12 },
      ];
      const CONNECTED = new Set(["社長不在", "社長再コール", "社長お断り", "アポ獲得"]);
      const weekMap = {};
      records.forEach(r => {
        if (!r.called_at) return;
        const d = new Date(r.called_at);
        const dow = (d.getDay() + 6) % 7;
        const mon = new Date(d); mon.setDate(d.getDate() - dow);
        const wk = mon.toISOString().slice(0, 10);
        if (!weekMap[wk]) weekMap[wk] = { calls: 0, connected: 0, appo: 0 };
        weekMap[wk].calls++;
        if (CONNECTED.has(r.status)) weekMap[wk].connected++;
        if (r.status === "アポ獲得") weekMap[wk].appo++;
      });
      const weeks = Object.keys(weekMap).sort();
      const totalCalls = records.length;
      const totalConnected = records.filter(r => CONNECTED.has(r.status)).length;
      const totalAppo = records.filter(r => r.status === "アポ獲得").length;
      const connRateTotal = totalCalls > 0 ? (totalConnected / totalCalls * 100).toFixed(1) + "%" : "0.0%";
      const appoRateTotal = totalCalls > 0 ? (totalAppo / totalCalls * 100).toFixed(1) + "%" : "0.0%";
      const dates = records.map(r => r.called_at?.slice(0, 10)).filter(Boolean).sort();
      const firstDate = dates[0] || ""; const lastDate = dates[dates.length - 1] || "";

      const rh = rs.addRow(["週", "架電件数", "通電数", "通電率", "アポ数", "アポ率"]);
      rh.eachCell(cell => {
        cell.font = { bold: true, color: { argb: WHITE_ARGB } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_ARGB } };
        cell.alignment = { horizontal: "center" };
      });
      rh.height = 18;
      weeks.forEach(wk => {
        const { calls, connected, appo } = weekMap[wk];
        const cr = calls > 0 ? (connected / calls * 100).toFixed(1) + "%" : "0.0%";
        const ar = calls > 0 ? (appo / calls * 100).toFixed(1) + "%" : "0.0%";
        const dr = rs.addRow([`${wk}〜`, calls, connected, cr, appo, ar]);
        dr.getCell(4).alignment = { horizontal: "right" };
        dr.getCell(6).alignment = { horizontal: "right" };
        if (calls > 0 && connected / calls < 0.05) dr.getCell(4).font = { color: { argb: RED_ARGB } };
      });
      const totRow = rs.addRow(["合計", totalCalls, totalConnected, connRateTotal, totalAppo, appoRateTotal]);
      totRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: NAVY_ARGB } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD_ARGB } };
        cell.alignment = { horizontal: "center" };
      });
      rs.addRow([]);
      const fmt = d => d ? d.replace(/-/g, "/") : "";
      const addSumRow = (text) => {
        const row = rs.addRow([text]);
        row.getCell(1).font = { color: { argb: NAVY_ARGB } };
        return row;
      };
      const sumHdr = rs.addRow(["【レポートサマリー】"]);
      sumHdr.getCell(1).font = { bold: true, size: 12, color: { argb: WHITE_ARGB } };
      sumHdr.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_ARGB } };
      sumHdr.height = 22;
      rs.mergeCells(sumHdr.number, 1, sumHdr.number, 6);
      addSumRow(`対象期間: ${fmt(firstDate)} 〜 ${fmt(lastDate)}`);
      addSumRow(`総架電件数: ${totalCalls}件`);
      addSumRow(`社長通電数: ${totalConnected}件（通電率: ${connRateTotal}）`);
      addSumRow(`アポ取得数: ${totalAppo}件（アポ率: ${appoRateTotal}）`);
      addSumRow(`週平均架電件数: ${weeks.length > 0 ? Math.round(totalCalls / weeks.length) : 0}件`);

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const statusLabel = lsStatus.length > 0 ? lsStatus.join("_") : "検索結果";
      a.download = `企業リスト_${statusLabel}_${today}.xlsx`;
      a.href = url; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("[ExportItems] error:", e);
      alert("エクスポートに失敗しました: " + e.message);
    }
    setLsExporting(null);
  };

  const inputStyle2 = {
    padding: "8px 12px", borderRadius: 6, border: "1px solid " + C.border,
    background: C.offWhite, fontSize: 12, color: C.navy, fontFamily: "'Noto Sans JP'", outline: "none",
  };

  // ── 詳細パネル用ヘルパー ──
  const detailCallStatusColor = (st) => {
    const s = st || '未架電';
    if (s === '未架電')       return { bg: 'transparent', color: C.textLight };
    if (s === '不通')         return { bg: '#f0f0f0',     color: '#999' };
    if (s === '社長不在')     return { bg: '#fefce8',     color: '#d69e2e' };
    if (s === '受付ブロック') return { bg: '#fff7ed',     color: '#dd6b20' };
    if (s === '受付再コール') return { bg: '#ebf8ff',     color: '#3182ce' };
    if (s === '社長再コール') return { bg: '#ebf8ff',     color: '#3182ce' };
    if (s === 'アポ獲得')     return { bg: '#f0fff4',     color: '#38a169' };
    if (s === '社長お断り')   return { bg: '#faf5ff',     color: '#805ad5' };
    if (s === '除外')         return { bg: '#fee2e2',     color: '#e53e3e' };
    return { bg: C.offWhite, color: C.textLight };
  };

  const handleDetailResult = async (label) => {
    if (!selectedItem || selectedRound === null) return;
    const calledAt = new Date().toISOString();
    const { result: newRec, error } = await insertCallRecord({
      item_id: selectedItem.id,
      list_id: selectedItem.list_id,
      round: selectedRound,
      status: label,
      memo: localMemo || null,
      called_at: calledAt,
      getter_name: currentUser || null,
    });
    if (error || !newRec) { console.error('[DetailResult] insertCallRecord 失敗', error); return; }
    const newRecs = [...itemRecords, newRec].sort((a, b) => a.round - b.round);
    setItemRecords(newRecs);
    await updateCallListItem(selectedItem.id, { call_status: label });
    setAllItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, call_status: label } : i));
    const newNext = Math.min(Math.max(...newRecs.map(r => r.round)) + 1, 8);
    setSelectedRound(newNext);
    setPageRecords(prev => {
      const itemMap = { ...(prev[selectedItem.id] || {}) };
      itemMap[selectedRound] = newRec;
      return { ...prev, [selectedItem.id]: itemMap };
    });
  };

  const handleDetailDeleteRecord = async (record) => {
    await deleteCallRecord(record.id);
    const newRecs = itemRecords.filter(r => r.id !== record.id).sort((a, b) => a.round - b.round);
    setItemRecords(newRecs);
    const lastRec = [...newRecs].sort((a, b) => b.round - a.round)[0];
    const newStatus = lastRec?.status || null;
    await updateCallListItem(selectedItem.id, { call_status: newStatus });
    setAllItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, call_status: newStatus } : i));
    setSelectedRound(record.round);
    setPageRecords(prev => {
      const itemMap = { ...(prev[selectedItem.id] || {}) };
      delete itemMap[record.round];
      return { ...prev, [selectedItem.id]: itemMap };
    });
  };

  const handleDetailMemoBlur = () => {
    if (!selectedItem) return;
    const key = 'cf_note_' + selectedItem.id;
    if (localMemo === (localStorage.getItem(key) || '')) return;
    localStorage.setItem(key, localMemo);
  };

  const handleDetailSubPhoneBlur = async () => {
    if (!selectedItem) return;
    const err = await updateCallListItem(selectedItem.id, { sub_phone_number: subPhone });
    if (err) { console.error('[subPhone] DB保存失敗', err); return; }
    setSelectedItemFull(prev => prev ? { ...prev, sub_phone_number: subPhone } : prev);
  };

  const handleDetailFetchRecording = async (rec) => {
    if (!selectedItem?.phone) return;
    const member = (members || []).find(m => (typeof m === 'string' ? m : m.name) === currentUser);
    const zoomUserId = typeof member === 'object' ? member?.zoomUserId : null;
    if (!zoomUserId) { alert('ZoomユーザーIDが設定されていません'); return; }
    try {
      const { data } = await invokeGetZoomRecording({ zoom_user_id: zoomUserId, callee_phone: selectedItem.phone.replace(/[^\d]/g, ''), called_at: rec.called_at, prev_called_at: null });
      const url = data?.recording_url || null;
      if (!url) { alert('録音URLを取得できませんでした'); return; }
      const dbError = await updateCallRecordRecordingUrl(rec.id, url);
      if (dbError) { alert('録音URLのDB保存に失敗しました: ' + dbError.message); return; }
      setItemRecords(prev => prev.map(r => r.id === rec.id ? { ...r, recording_url: url } : r));
    } catch (e) {
      console.error('[DetailFetchRecording] error:', e);
      alert('録音URL取得に失敗しました');
    }
  };

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      {/* Sub tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16 }}>
        {[
          { id: "company", label: "企業検索" },
          { id: "listSearch", label: "リスト検索" },
        ].map(tab => (
          <button key={tab.id} onClick={() => setSubTab(tab.id)} style={{
            padding: "10px 24px", fontSize: 12, fontWeight: 700, cursor: "pointer",
            fontFamily: "'Noto Sans JP'", border: "1px solid " + C.borderLight,
            borderBottom: subTab === tab.id ? "2px solid " + C.gold : "1px solid " + C.borderLight,
            background: subTab === tab.id ? C.white : C.offWhite,
            color: subTab === tab.id ? C.navy : C.textLight,
            borderRadius: "8px 8px 0 0", marginRight: -1,
          }}>{tab.label}</button>
        ))}
      </div>

      {subTab === "company" && (<div>
      {/* Search bar */}
      <div style={{
        background: C.white, borderRadius: 10, padding: "16px 20px", marginBottom: 16,
        border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>企業検索</span>
          <span style={{ fontSize: 10, color: C.textLight }}>全リストから横断検索（{loadingItems ? "読込中..." : allItems.length.toLocaleString() + "社"}）</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={searchField} onChange={e => setSearchField(e.target.value)} style={{
            padding: "8px 12px", borderRadius: 6, border: "1px solid " + C.border,
            background: C.offWhite, fontSize: 12, color: C.navy, fontFamily: "'Noto Sans JP'", outline: "none",
          }}>
            {fieldOptions.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="企業名、代表者名、電話番号などを入力..."
            style={{
              flex: 1, padding: "8px 14px", borderRadius: 6, border: "1px solid " + C.border,
              background: C.white, fontSize: 13, color: C.textDark, fontFamily: "'Noto Sans JP'", outline: "none",
            }} />
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 10, flexWrap: "wrap" }}>
          {statusOptions.map(s => (
            <button key={s.id} onClick={() => setStatusFilter(s.id)} style={{
              padding: "4px 10px", borderRadius: 12, fontSize: 10, fontWeight: 600,
              cursor: "pointer", fontFamily: "'Noto Sans JP'", transition: "all 0.15s",
              border: statusFilter === s.id ? "1px solid " + C.gold : "1px solid " + C.borderLight,
              background: statusFilter === s.id ? C.gold + "15" : C.white,
              color: statusFilter === s.id ? C.navy : C.textMid,
            }}>{s.label}</button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <div style={{ fontSize: 11, color: C.textLight, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
        <span>検索結果: <span style={{ fontWeight: 700, color: C.navy }}>{filtered.length.toLocaleString()}</span>件</span>
        {totalPages > 1 && <span>ページ {page + 1} / {totalPages}</span>}
      </div>

      {/* Results table */}
      <div style={{ background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight, overflow: "hidden", boxShadow: "0 1px 4px rgba(26,58,92,0.04)" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "2fr 1fr 1.2fr 1.2fr 1fr 90px 90px",
          padding: "8px 14px", background: C.navyDeep, fontSize: 9, fontWeight: 600, color: C.goldLight, letterSpacing: 0.5,
        }}>
          {[["company","企業名"],["representative","代表者"],["phone","電話番号"],["list","クライアント名"],["industry","業種"],["lastCall","最終発信日"],["status","最終ステータス"]].map(([key, label]) => (
            <span key={key} onClick={() => { if (clientSortBy === key) { setClientSortBy(null); setClientSortDir("asc"); } else { setClientSortBy(key); setClientSortDir("desc"); } setPage(0); }} style={{ cursor: "pointer", userSelect: "none" }}>
              {label}{clientSortBy === key ? " ▲" : " ▽"}
            </span>
          ))}
        </div>
        {loadingItems ? (
          <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: C.textLight }}>データを読み込み中...</div>
        ) : paged.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: C.textLight }}>
            {searchTerm || statusFilter !== "all" ? "該当する企業が見つかりませんでした" : "検索条件を入力してください"}
          </div>
        ) : paged.map((c, i) => {
          const listInfo = callListData.find(l => l._supaId === c.list_id);
          const rounds = pageRecords[c.id] || {};
          const latestCalled = (() => { let latest = ""; Object.values(rounds).forEach(r => { if (r.called_at && r.called_at > latest) latest = r.called_at; }); return latest; })();
          const stColor = JP_STATUS_COLOR[c.call_status] || C.textLight;
          return (
            <div key={c.id} onClick={() => setSelectedItem(c)} style={{
              display: "grid", gridTemplateColumns: "2fr 1fr 1.2fr 1.2fr 1fr 90px 90px",
              padding: "6px 14px", fontSize: 11, alignItems: "center",
              borderBottom: "1px solid " + C.borderLight,
              background: i % 2 === 0 ? C.white : C.offWhite + "80",
              cursor: "pointer",
            }}>
              <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.company}</span>
              <span style={{ color: C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.representative || "-"}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.navy }}>{c.phone || "-"}</span>
              <span style={{ fontSize: 10, color: C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {listInfo ? listInfo.company : "-"}
              </span>
              <span style={{ fontSize: 10, color: C.textLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {listInfo?.industry || "-"}
              </span>
              <span style={{ fontSize: 9, color: C.textLight, fontFamily: "'JetBrains Mono'" }}>
                {latestCalled ? new Date(new Date(latestCalled).getTime() + 9*60*60*1000).toISOString().slice(0,10).replace(/-/g, '/') : "-"}
              </span>
              <span>
                {c.call_status ? (
                  <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, background: stColor + "18", color: stColor, fontWeight: 600, whiteSpace: "nowrap" }}>
                    {c.call_status}
                  </span>
                ) : (
                  <span style={{ fontSize: 9, color: C.textLight }}>未架電</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 12 }}>
          <button disabled={page === 0} onClick={() => setPage(page - 1)} style={{
            padding: "5px 14px", borderRadius: 4, border: "1px solid " + C.border,
            background: page === 0 ? C.offWhite : C.white, cursor: page === 0 ? "default" : "pointer",
            fontSize: 11, color: C.textMid, fontFamily: "'Noto Sans JP'",
          }}>← 前へ</button>
          <span style={{ fontSize: 11, color: C.textMid, padding: "5px 8px" }}>{page + 1} / {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} style={{
            padding: "5px 14px", borderRadius: 4, border: "1px solid " + C.border,
            background: page >= totalPages - 1 ? C.offWhite : C.white, cursor: page >= totalPages - 1 ? "default" : "pointer",
            fontSize: 11, color: C.textMid, fontFamily: "'Noto Sans JP'",
          }}>次へ →</button>
        </div>
      )}
      {/* 企業詳細モーダル */}
      {selectedItem && (
        <div onClick={() => setSelectedItem(null)} style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.55)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: C.cream, borderRadius: 12, width: "min(480px, 96vw)",
            maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column",
            boxShadow: "0 8px 40px rgba(26,58,92,0.22)",
          }}>
            {/* ヘッダー */}
            <div style={{
              padding: "12px 16px", borderBottom: "1px solid " + C.borderLight,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")",
              flexShrink: 0,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: C.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selectedItem.company}
                </div>
                {(() => { const l = callListData.find(li => li._supaId === selectedItem.list_id); return l ? (
                  <div style={{ fontSize: 10, color: C.goldLight, marginTop: 2 }}>{l.company} / {l.industry || ''}</div>
                ) : null; })()}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, marginLeft: 12 }}>
                <button
                  onClick={() => {
                    const l = callListData.find(li => li._supaId === selectedItem.list_id);
                    if (!l) { alert('リスト情報が見つかりません'); return; }
                    setSelectedItem(null);
                    if (setCallFlowScreen) setCallFlowScreen({ list: l, defaultItemId: selectedItem.id });
                    else setCallingScreen({ listId: l.id, list: l });
                  }}
                  style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid ' + C.goldLight, background: C.gold, color: C.navy, fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Noto Sans JP'" }}>
                  架電フローへ
                </button>
                <button onClick={() => setSelectedItem(null)} style={{
                  width: 28, height: 28, borderRadius: 6, background: C.white + '15',
                  border: '1px solid ' + C.white + '30', color: C.white, cursor: "pointer", fontSize: 16, lineHeight: 1,
                }}>✕</button>
              </div>
            </div>

            {/* 本体スクロール */}
            <div style={{ overflowY: "auto", padding: "14px 16px", flex: 1 }}>
              {loadingItemRecords ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: C.textLight, fontSize: 13 }}>読み込み中...</div>
              ) : (
                <>
                  {/* 📋 基本情報 */}
                  {(() => {
                    const latest = itemRecords.length > 0 ? itemRecords.reduce((a, b) => a.round >= b.round ? a : b) : null;
                    return (
                      <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid ' + C.borderLight }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 8 }}>📋 基本情報</div>
                        {[
                          { label: '事業内容', value: selectedItemFull?.business || selectedItem.business },
                          { label: '住所', value: (selectedItemFull?.address || '').replace(/\/\s*$/, '') },
                          { label: '代表者', value: selectedItemFull?.representative || selectedItem.representative },
                          { label: '前回架電結果', value: latest ? latest.status : '未架電' },
                        ].map(({ label, value }) => (
                          <div key={label} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
                            <span style={{ fontSize: 11, color: C.textLight, flexShrink: 0, width: 84 }}>{label}</span>
                            <span style={{ fontSize: 13, color: C.navy, fontWeight: 500, flex: 1, wordBreak: 'break-all' }}>{value || '-'}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* 📊 詳細情報 */}
                  {(() => {
                    const full = selectedItemFull;
                    let parsedMemo = null;
                    if (full?.memo) { try { parsedMemo = JSON.parse(full.memo); } catch { /* plain text */ } }
                    const netIncome = full?.net_income ?? parsedMemo?.net_income ?? null;
                    const biko = parsedMemo?.biko ?? (full?.memo && !parsedMemo ? full.memo : null);
                    return (
                      <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid ' + C.borderLight }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 8 }}>📊 詳細情報</div>
                        {[
                          { label: '売上', value: full?.revenue != null ? Number(full.revenue).toLocaleString() + ' 千円' : '-' },
                          { label: '当期純利益', value: netIncome != null ? Number(netIncome).toLocaleString() + ' 千円' : '-' },
                          { label: '備考', value: biko || '-' },
                        ].map(({ label, value }) => (
                          <div key={label} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
                            <span style={{ fontSize: 11, color: C.textLight, flexShrink: 0, width: 84 }}>{label}</span>
                            <span style={{ fontSize: 13, color: C.navy, fontWeight: 500, flex: 1, wordBreak: 'break-all' }}>{value}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* 電話発信ボタン */}
                  {selectedItem.phone && (
                    <div onClick={() => dialPhone(selectedItem.phone)} style={{ display: 'block', marginBottom: 10, padding: '10px 16px', borderRadius: 10, background: 'linear-gradient(135deg, ' + C.navyDeep + ', ' + C.navy + ')', textAlign: 'center', boxShadow: '0 2px 8px ' + C.navy + '40', cursor: 'pointer' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.white + 'cc', marginBottom: 2 }}>📞 電話をかける</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: C.white, fontFamily: "'JetBrains Mono'" }}>{selectedItem.phone}</div>
                    </div>
                  )}

                  {/* サブ電話番号 */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
                    <input type="tel" value={subPhone} onChange={e => setSubPhone(e.target.value)} onBlur={handleDetailSubPhoneBlur}
                      placeholder="別の番号に架電"
                      style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid ' + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', background: C.offWhite, color: C.textDark }} />
                    <button onClick={() => { if (!subPhone.trim()) return; dialPhone(subPhone.trim()); }}
                      disabled={!subPhone.trim()}
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid ' + C.border, background: C.white, cursor: subPhone.trim() ? 'pointer' : 'default', fontSize: 13, opacity: subPhone.trim() ? 1 : 0.4, lineHeight: 1 }}>📞</button>
                  </div>

                  {/* ラウンドボタン */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 5, letterSpacing: 0.5 }}>架電ラウンド選択</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[1,2,3,4,5,6,7,8].map(r => {
                        const roundRec = itemRecords.find(rec => rec.round === r);
                        const nextRound = itemRecords.length === 0 ? 1 : Math.min(Math.max(...itemRecords.map(rec => rec.round)) + 1, 8);
                        const isCompleted = !!roundRec;
                        const isCurrent = r === nextRound && !isCompleted;
                        const isFuture = r > nextRound;
                        const isSelected = r === selectedRound;
                        const bg = isCompleted ? C.border : isCurrent ? C.gold : 'transparent';
                        const color = isCompleted ? C.textLight : isCurrent ? C.navy : C.textLight;
                        const border = isSelected
                          ? '2px solid ' + C.navy
                          : isFuture ? '1px solid ' + C.borderLight
                          : isCompleted ? '1px solid ' + C.border
                          : '1px solid ' + C.gold;
                        return (
                          <button key={r} disabled={isFuture} onClick={() => !isFuture && setSelectedRound(r)}
                            style={{ width: 34, height: 34, borderRadius: 6, fontSize: 12, fontWeight: 700,
                              background: bg, color, border, cursor: isFuture ? 'default' : 'pointer',
                              fontFamily: "'JetBrains Mono'", opacity: isFuture ? 0.3 : 1, flexShrink: 0 }}>
                            {r}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ステータスエリア */}
                  {(() => {
                    const roundRec = itemRecords.find(r => r.round === selectedRound);
                    const sc = roundRec ? detailCallStatusColor(roundRec.status) : null;
                    return roundRec ? (
                      <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8,
                        background: sc.bg, border: '1.5px solid ' + sc.color + '40',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: sc.color }}>
                          {selectedRound}回目の結果：{roundRec.status}
                        </span>
                        <button onClick={() => handleDetailDeleteRecord(roundRec)}
                          style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4,
                            border: '1px solid ' + C.border, background: C.white,
                            cursor: 'pointer', color: C.textMid, fontFamily: "'Noto Sans JP'" }}>取消</button>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
                        {CALL_RESULTS.map(r => {
                          const isAppo = r.id === 'appointment';
                          const isExcl = r.id === 'excluded';
                          const btnBg    = isAppo ? C.gold    : isExcl ? C.red + '10' : C.navy + '08';
                          const btnColor = isAppo ? C.white   : isExcl ? C.red        : C.navy;
                          const btnBdr   = isAppo ? '1.5px solid ' + C.gold : isExcl ? '1.5px solid ' + C.red + '40' : '1px solid ' + C.navy + '25';
                          return (
                            <button key={r.id} onClick={() => handleDetailResult(r.label)}
                              style={{ padding: '9px 6px', borderRadius: 7, border: btnBdr, background: btnBg, color: btnColor, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: "'Noto Sans JP'", lineHeight: 1.2 }}>
                              {r.label}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* メモ */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      メモ
                      {savingMemo && <span style={{ fontSize: 9, color: C.textLight, fontWeight: 400 }}>保存中...</span>}
                    </div>
                    <textarea value={localMemo} onChange={e => setLocalMemo(e.target.value)} onBlur={handleDetailMemoBlur}
                      placeholder="架電メモを入力（フォーカスを外すと自動保存）..."
                      style={{ width: '100%', minHeight: 64, padding: '8px', borderRadius: 6, border: '1px solid ' + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', resize: 'vertical', boxSizing: 'border-box', background: C.offWhite }} />
                  </div>

                  {/* 架電履歴 */}
                  {itemRecords.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 6 }}>📋 架電履歴</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {itemRecords.map(rec => {
                          const sc = detailCallStatusColor(rec.status);
                          const dt = rec.called_at ? new Date(rec.called_at) : null;
                          const dtStr = dt
                            ? `${dt.getMonth()+1}/${dt.getDate()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`
                            : '';
                          return (
                            <div key={rec.id}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                                padding: '5px 8px', borderRadius: 5, background: C.offWhite, fontSize: 11 }}>
                                <span style={{ fontWeight: 700, color: C.navy, minWidth: 36, fontFamily: "'JetBrains Mono'", fontSize: 10 }}>{rec.round}回目</span>
                                <span style={{ flex: 1, color: sc.color, fontWeight: 600 }}>{rec.status}</span>
                                <span style={{ color: C.textLight, fontSize: 10 }}>{rec.getter_name || '-'}</span>
                                <span style={{ color: C.textLight, fontSize: 10 }}>{dtStr}</span>
                                {rec.recording_url
                                  ? <button onClick={() => setActiveRecordingId(activeRecordingId === rec.id ? null : rec.id)}
                                      title={activeRecordingId === rec.id ? "閉じる" : "録音を再生"}
                                      style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: activeRecordingId === rec.id ? C.red : 'inherit' }}>🎙</button>
                                  : <button onClick={() => handleDetailFetchRecording(rec)} title="録音URLを手動取得"
                                      style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>🔄</button>
                                }
                              </div>
                              {activeRecordingId === rec.id && rec.recording_url && (
                                <InlineAudioPlayer url={rec.recording_url} onClose={() => setActiveRecordingId(null)} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
      </div>)}

      {subTab === "listSearch" && (<div>
        {/* 検索フォーム */}
        <div style={{
          background: C.white, borderRadius: 10, padding: "16px 20px", marginBottom: 16,
          border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>リスト検索</span>
            <span style={{ fontSize: 10, color: C.textLight }}>クライアント・業種・企業属性でSupabaseの架電リストを絞り込み</span>
          </div>
          {/* 1行目: クライアント名 + 業種 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            {/* クライアント名コンボボックス */}
            <div style={{ position: "relative" }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 3, display: "block" }}>クライアント名</label>
              <input
                type="text"
                value={lsClientInput}
                onChange={e => { setLsClientInput(e.target.value); setLsClientFocused(true); }}
                onFocus={() => setLsClientFocused(true)}
                onBlur={() => setTimeout(() => setLsClientFocused(false), 150)}
                placeholder="クライアント名を入力..."
                style={{ ...inputStyle2, width: "100%", boxSizing: "border-box" }}
              />
              {lsClientFocused && filteredClientCandidates.length > 0 && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0, zIndex: 500,
                  background: C.white, border: "1px solid " + C.border, borderRadius: 6,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.12)", maxHeight: 180, overflowY: "auto",
                }}>
                  {filteredClientCandidates.map(name => (
                    <div key={name}
                      onMouseDown={() => { setLsClientInput(name); setLsClientFocused(false); }}
                      style={{ padding: "7px 12px", fontSize: 12, cursor: "pointer", color: C.textDark, borderBottom: "1px solid " + C.borderLight + "60" }}
                      onMouseEnter={e => e.currentTarget.style.background = C.offWhite}
                      onMouseLeave={e => e.currentTarget.style.background = C.white}
                    >{name}</div>
                  ))}
                </div>
              )}
            </div>
            {/* 業種コンボボックス */}
            <div style={{ position: "relative" }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 3, display: "block" }}>業種</label>
              <input
                type="text"
                value={lsIndustry}
                onChange={e => { setLsIndustry(e.target.value); setLsIndustryFocused(true); }}
                onFocus={() => setLsIndustryFocused(true)}
                onBlur={() => setTimeout(() => setLsIndustryFocused(false), 150)}
                placeholder="業種を入力..."
                style={{ ...inputStyle2, width: "100%", boxSizing: "border-box" }}
              />
              {lsIndustryFocused && filteredIndustryCandidates.length > 0 && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0, zIndex: 500,
                  background: C.white, border: "1px solid " + C.border, borderRadius: 6,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.12)", maxHeight: 180, overflowY: "auto",
                }}>
                  {filteredIndustryCandidates.map(v => (
                    <div key={v}
                      onMouseDown={() => { setLsIndustry(v); setLsIndustryFocused(false); }}
                      style={{ padding: "7px 12px", fontSize: 12, cursor: "pointer", color: C.textDark, borderBottom: "1px solid " + C.borderLight + "60" }}
                      onMouseEnter={e => e.currentTarget.style.background = C.offWhite}
                      onMouseLeave={e => e.currentTarget.style.background = C.white}
                    >{v}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* 2行目: 都道府県 + ステータス */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 3, display: "block" }}>都道府県（企業住所）</label>
              <input type="text" placeholder="例: 東京都、大阪府..." value={lsPref}
                onChange={e => setLsPref(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleListSearch()}
                style={{ ...inputStyle2, width: "100%", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 3, display: "block" }}>
                架電ステータス
                {lsStatus.length > 0 && <span style={{ marginLeft: 5, color: C.navy, fontWeight: 700 }}>{lsStatus.length}件選択</span>}
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", padding: "6px 8px",
                border: "1px solid " + C.border, borderRadius: 5, background: C.white, boxSizing: "border-box", width: "100%" }}>
                {["受付ブロック","受付再コール","社長不在","社長再コール","社長お断り","アポ獲得","除外"].map(s => (
                  <label key={s} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, cursor: "pointer", whiteSpace: "nowrap", color: C.textMid }}>
                    <input type="checkbox" checked={lsStatus.includes(s)}
                      onChange={e => setLsStatus(prev => e.target.checked ? [...prev, s] : prev.filter(x => x !== s))}
                      style={{ cursor: "pointer", accentColor: C.navy }} />
                    {s}
                  </label>
                ))}
              </div>
            </div>
          </div>
          {/* 3行目: 売上高 range + 純利益 range */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 3, display: "block" }}>売上高（千円）</label>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="number" placeholder="下限" value={lsRevenueMin}
                  onChange={e => setLsRevenueMin(e.target.value)}
                  style={{ ...inputStyle2, flex: 1, minWidth: 0 }} />
                <span style={{ color: C.textLight, fontSize: 11 }}>〜</span>
                <input type="number" placeholder="上限" value={lsRevenueMax}
                  onChange={e => setLsRevenueMax(e.target.value)}
                  style={{ ...inputStyle2, flex: 1, minWidth: 0 }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 3, display: "block" }}>当期純利益（千円）</label>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="number" placeholder="下限" value={lsNetIncomeMin}
                  onChange={e => setLsNetIncomeMin(e.target.value)}
                  style={{ ...inputStyle2, flex: 1, minWidth: 0 }} />
                <span style={{ color: C.textLight, fontSize: 11 }}>〜</span>
                <input type="number" placeholder="上限" value={lsNetIncomeMax}
                  onChange={e => setLsNetIncomeMax(e.target.value)}
                  style={{ ...inputStyle2, flex: 1, minWidth: 0 }} />
              </div>
            </div>
          </div>
          {/* 4行目: 架電回数 range */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 3, display: "block" }}>架電回数</label>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="number" placeholder="下限" value={lsCallCountMin}
                  onChange={e => setLsCallCountMin(e.target.value)}
                  style={{ ...inputStyle2, flex: 1, minWidth: 0 }} />
                <span style={{ color: C.textLight, fontSize: 11 }}>〜</span>
                <input type="number" placeholder="上限" value={lsCallCountMax}
                  onChange={e => setLsCallCountMax(e.target.value)}
                  style={{ ...inputStyle2, flex: 1, minWidth: 0 }} />
              </div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={() => {
              setLsClientInput(""); setLsIndustry(""); setLsPref("");
              setLsRevenueMin(""); setLsRevenueMax("");
              setLsNetIncomeMin(""); setLsNetIncomeMax("");
              setLsStatus([]); setLsCallCountMin(""); setLsCallCountMax("");
              setLsResults(null); setLsItemResults(null); setLsCalledCounts({});
            }} style={{
              padding: "8px 16px", borderRadius: 6, border: "1px solid " + C.borderLight,
              background: C.offWhite, cursor: "pointer", fontSize: 11, fontWeight: 600,
              color: C.textMid, fontFamily: "'Noto Sans JP'",
            }}>条件クリア</button>
            <button onClick={handleListSearch} disabled={lsSearching} style={{
              padding: "8px 22px", borderRadius: 6, border: "none",
              background: lsSearching ? C.textLight : C.navy, color: C.white,
              cursor: lsSearching ? "default" : "pointer", fontSize: 12, fontWeight: 700,
              fontFamily: "'Noto Sans JP'",
            }}>{lsSearching ? "検索中..." : "検索"}</button>
          </div>
        </div>

        {/* 検索結果テーブル */}
        {lsResults === null && lsItemResults === null ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: C.textLight, fontSize: 12 }}>
            条件を入力して「検索」ボタンを押してください
          </div>
        ) : lsItemResults !== null ? (
          // ステータスフィルター選択時: 企業レベルの結果
          lsItemResults.length === 0 ? (
            <div style={{ padding: "48px 0", textAlign: "center", color: C.textLight, fontSize: 12 }}>
              条件に一致する企業が見つかりませんでした
            </div>
          ) : (() => {
            const itemListMap = {};
            callListData.forEach(l => { if (l._supaId) itemListMap[l._supaId] = l; });
            const statusBg = { "受付ブロック": "#fff7ed", "受付再コール": "#ebf8ff", "社長不在": "#fefce8", "社長再コール": "#ebf8ff", "社長お断り": "#faf5ff", "アポ獲得": "#f0fff4", "除外": "#fee2e2" };
            const statusFg = { "受付ブロック": "#dd6b20", "受付再コール": "#3182ce", "社長不在": "#d69e2e", "社長再コール": "#3182ce", "社長お断り": "#805ad5", "アポ獲得": "#38a169", "除外": "#e53e3e" };
            return (
              <div style={{ background: C.white, borderRadius: 10, overflow: "hidden", border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)" }}>
                <div style={{ padding: "8px 16px", background: C.offWhite, borderBottom: "1px solid " + C.borderLight, fontSize: 10, color: C.textLight, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>架電先企業 {lsItemResults.length.toLocaleString()} 件</span>
                  <button
                    onClick={handleExportItems}
                    disabled={lsExporting === '__items__'}
                    style={{
                      padding: "5px 14px", borderRadius: 5, border: "none",
                      background: lsExporting === '__items__' ? C.textLight : C.navy,
                      color: C.white, cursor: lsExporting === '__items__' ? "default" : "pointer",
                      fontSize: 11, fontWeight: 600, fontFamily: "'Noto Sans JP'",
                    }}
                  >{lsExporting === '__items__' ? "処理中..." : "エクスポート"}</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.2fr 1fr 1.5fr", padding: "10px 16px", background: C.navyDeep, fontSize: 10, fontWeight: 600, color: C.goldLight, letterSpacing: 0.5 }}>
                  <span>企業名</span><span>代表者名</span><span>電話番号</span><span>最新ステータス</span><span>リスト名</span>
                </div>
                {lsItemResults.map((item, i) => {
                  const list = itemListMap[item.list_id];
                  return (
                    <div key={item.id || i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.2fr 1fr 1.5fr", padding: "8px 16px", fontSize: 11, alignItems: "center", borderBottom: "1px solid " + C.borderLight, background: i % 2 === 0 ? C.white : C.offWhite }}>
                      <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.company || "-"}</span>
                      <span style={{ color: C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.representative || "-"}</span>
                      <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.navy }}>{item.phone || "-"}</span>
                      <span>
                        <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: statusBg[item.call_status] || C.offWhite, color: statusFg[item.call_status] || C.textLight, fontWeight: 600 }}>
                          {item.call_status || "-"}
                        </span>
                      </span>
                      <span style={{ color: C.textLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10 }}>
                        {list ? `${list.company}${list.industry ? ` - ${list.industry}` : ""}` : "-"}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()
        ) : lsResults !== null && lsResults.length === 0 ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: C.textLight, fontSize: 12 }}>
            条件に一致するリストが見つかりませんでした
          </div>
        ) : lsResults !== null && (
          <div style={{ background: C.white, borderRadius: 10, overflow: "hidden", border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)" }}>
            <div style={{
              display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 80px 80px 110px",
              padding: "10px 16px", background: C.navyDeep, fontSize: 10,
              fontWeight: 600, color: C.goldLight, letterSpacing: 0.5,
            }}>
              <span>リスト名</span>
              <span>クライアント名</span>
              <span>業種</span>
              <span style={{ textAlign: "center" }}>企業数</span>
              <span style={{ textAlign: "center" }}>架電済み</span>
              <span style={{ textAlign: "center" }}>操作</span>
            </div>
            {lsResults.map((list, i) => (
              <div key={list._supaId || i} style={{
                display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 80px 80px 110px",
                padding: "10px 16px", fontSize: 11, alignItems: "center",
                borderBottom: "1px solid " + C.borderLight,
                background: i % 2 === 0 ? C.white : C.offWhite,
              }}>
                <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {list.company}{list.industry ? ` - ${list.industry}` : ""}
                </span>
                <span style={{ color: C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{list.company}</span>
                <span style={{ color: C.textLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{list.industry || "-"}</span>
                <span style={{ textAlign: "center", fontFamily: "'JetBrains Mono'", fontWeight: 700, color: C.navy }}>{(list.count || 0).toLocaleString()}</span>
                <span style={{ textAlign: "center", fontFamily: "'JetBrains Mono'", color: C.textMid }}>
                  {lsCalledCounts[list._supaId] != null ? lsCalledCounts[list._supaId].toLocaleString() : "-"}
                </span>
                <div style={{ textAlign: "center" }}>
                  <button
                    onClick={() => handleExport(list)}
                    disabled={lsExporting === list._supaId}
                    style={{
                      padding: "5px 12px", borderRadius: 5, border: "none",
                      background: lsExporting === list._supaId ? C.textLight : C.navy,
                      color: C.white, cursor: lsExporting === list._supaId ? "default" : "pointer",
                      fontSize: 11, fontWeight: 600, fontFamily: "'Noto Sans JP'",
                    }}
                  >{lsExporting === list._supaId ? "処理中..." : "エクスポート"}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>)}
    </div>
  );
}

function StatsView({ importedCSVs, callListData, currentUser, appoData, members, now: nowProp }) {
  const [callTab, setCallTab] = useState("team");
  const [callPeriod, setCallPeriod] = useState(() =>
    localStorage.getItem('spanavi_stats_callPeriod') || "week"
  );
  const [callCustomFrom, setCallCustomFrom] = useState(() =>
    localStorage.getItem('spanavi_stats_callFrom') || ""
  );
  const [callCustomTo, setCallCustomTo] = useState(() =>
    localStorage.getItem('spanavi_stats_callTo') || ""
  );
  const [callSelectedMonth, setCallSelectedMonth] = useState(() => {
    const s = localStorage.getItem('spanavi_stats_callMonth');
    return (s && AVAILABLE_MONTHS.some(m => m.yyyymm === s)) ? s : (AVAILABLE_MONTHS[0]?.yyyymm || "2026-03");
  });
  const [salesTab, setSalesTab] = useState("team");
  const [salesPeriod, setSalesPeriod] = useState(() =>
    localStorage.getItem('spanavi_stats_salesPeriod') || "month"
  );
  const [salesCustomFrom, setSalesCustomFrom] = useState(() =>
    localStorage.getItem('spanavi_stats_salesFrom') || ""
  );
  const [salesCustomTo, setSalesCustomTo] = useState(() =>
    localStorage.getItem('spanavi_stats_salesTo') || ""
  );
  const [salesSelectedMonth, setSalesSelectedMonth] = useState(() => {
    const s = localStorage.getItem('spanavi_stats_salesMonth');
    return (s && AVAILABLE_MONTHS.some(m => m.yyyymm === s)) ? s : (AVAILABLE_MONTHS[0]?.yyyymm || "2026-03");
  });
  const [notification, setNotification] = useState(null);
  const lastNotifTime = React.useRef(0);

  useEffect(() => {
    localStorage.setItem('spanavi_stats_callPeriod', callPeriod);
    localStorage.setItem('spanavi_stats_callMonth', callSelectedMonth);
    localStorage.setItem('spanavi_stats_callFrom', callCustomFrom);
    localStorage.setItem('spanavi_stats_callTo', callCustomTo);
    localStorage.setItem('spanavi_stats_salesPeriod', salesPeriod);
    localStorage.setItem('spanavi_stats_salesMonth', salesSelectedMonth);
    localStorage.setItem('spanavi_stats_salesFrom', salesCustomFrom);
    localStorage.setItem('spanavi_stats_salesTo', salesCustomTo);
  }, [callPeriod, callSelectedMonth, callCustomFrom, callCustomTo,
      salesPeriod, salesSelectedMonth, salesCustomFrom, salesCustomTo]);

  const now = nowProp ? new Date(nowProp) : new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const todayD = new Date(todayStr);
  const dayOfWeek = todayD.getDay();
  const weekStart = new Date(todayD); weekStart.setDate(todayD.getDate() - ((dayOfWeek + 6) % 7));
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const monthStr = todayStr.slice(0, 7);

  // Helper: check if date string falls in a period
  const inPeriod = (dateStr, period, customFrom, customTo, selectedMonth = monthStr) => {
    if (!dateStr) return false;
    const d = dateStr.slice(0, 10);
    if (period === "day") return d === todayStr;
    if (period === "week") return d >= weekStartStr && d <= todayStr;
    if (period === "month") return d.startsWith(selectedMonth);
    if (period === "custom") {
      const dm = d.slice(0, 7); // "YYYY-MM"
      if (customFrom && dm < customFrom) return false;
      if (customTo && dm > customTo) return false;
      return true;
    }
    return true;
  };

  const periodLabel = (period, customFrom, customTo) => {
    if (period === "day") return todayStr;
    if (period === "week") return weekStartStr + "〜" + todayStr;
    if (period === "month") return monthStr;
    if (period === "custom" && customFrom) return customFrom + "〜" + (customTo || "");
    return "";
  };

  // Collect all call records
  const allRecords = [];
  Object.entries(importedCSVs).forEach(([listIdStr, rows]) => {
    const listId = Number(listIdStr);
    const listInfo = callListData.find(l => l.id === listId);
    rows.forEach(row => {
      if (!row.rounds) return;
      Object.entries(row.rounds).forEach(([round, data]) => {
        allRecords.push({
          listId, listInfo, company: row.company,
          round: Number(round), status: data.status,
          caller: data.caller || "", timestamp: data.timestamp || "",
          hasAppoReport: !!data.appoReport,
        });
      });
    });
  });

  // Build team map
  const teamMap = {};
  members.forEach(m => { teamMap[m.name] = m.team ? (m.team + "チーム") : "営業統括"; });

  // === Call Ranking ===
  const callFiltered = allRecords.filter(r => inPeriod(r.timestamp, callPeriod, callCustomFrom, callCustomTo, callSelectedMonth));
  const callByCaller = {};
  callFiltered.forEach(r => {
    const key = r.caller || "不明";
    if (!callByCaller[key]) callByCaller[key] = { total: 0, ceoConnect: 0, appo: 0 };
    callByCaller[key].total++;
    if (["absent", "ceo_recall", "ceo_decline", "ceo_claim", "appointment"].includes(r.status)) callByCaller[key].ceoConnect++;
    if (r.status === "appointment") callByCaller[key].appo++;
  });

  const callIndiv = Object.entries(callByCaller).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.total - a.total);
  const callIndivRanked = callIndiv.map((item, idx) => ({
    ...item,
    rank: (idx === 0 || item.total !== callIndiv[idx - 1]?.total) ? idx + 1 : callIndiv[idx - 1]?._rank || idx + 1,
    _rank: (idx === 0 || item.total !== callIndiv[idx - 1]?.total) ? idx + 1 : callIndiv[idx - 1]?._rank || idx + 1,
  }));
  // team aggregation for calls
  const callByTeam = {};
  callFiltered.forEach(r => {
    const tn = teamMap[r.caller] || "その他";
    if (!callByTeam[tn]) callByTeam[tn] = { total: 0, ceoConnect: 0, appo: 0 };
    callByTeam[tn].total++;
    if (["absent", "ceo_recall", "ceo_decline", "ceo_claim", "appointment"].includes(r.status)) callByTeam[tn].ceoConnect++;
    if (r.status === "appointment") callByTeam[tn].appo++;
  });
  const callTeamRank = Object.entries(callByTeam).sort((a, b) => b[1].total - a[1].total);

  // === Sales Ranking ===
  const countableStatuses = new Set(["面談済", "事前確認済", "アポ取得"]);
  const salesFiltered = (appoData || []).filter(a => {
    if (!countableStatuses.has(a.status)) return false;
    const d = a.meetDate || a.appoDate || "";
    return inPeriod(d, salesPeriod, salesCustomFrom, salesCustomTo, salesSelectedMonth);
  });
  // team sales
  const salesByTeam = {};
  salesFiltered.forEach(a => {
    const tn = teamMap[a.getter] || "その他";
    if (!salesByTeam[tn]) salesByTeam[tn] = { total: 0, count: 0 };
    salesByTeam[tn].total += a.sales || 0;
    salesByTeam[tn].count++;
  });
  const salesTeamRank = Object.entries(salesByTeam).sort((a, b) => b[1].total - a[1].total);
  // individual sales
  const salesByIndiv = {};
  salesFiltered.forEach(a => {
    if (!salesByIndiv[a.getter]) salesByIndiv[a.getter] = { total: 0, reward: 0, count: 0 };
    salesByIndiv[a.getter].total += a.sales || 0;
    salesByIndiv[a.getter].reward += a.reward || 0;
    salesByIndiv[a.getter].count++;
  });
  const salesIndivRank = Object.entries(salesByIndiv).sort((a, b) => b[1].total - a[1].total);
  const maxIndivSales = salesIndivRank.length > 0 ? salesIndivRank[0][1].total : 1;

  // === Today realtime for notification & display ===
  const todayRecords = allRecords.filter(r => r.timestamp.slice(0, 10) === todayStr);
  const todayByCaller = {};
  todayRecords.forEach(r => {
    const key = r.caller || "不明";
    if (!todayByCaller[key]) todayByCaller[key] = { total: 0, ceoConnect: 0, appo: 0, sales: 0 };
    todayByCaller[key].total++;
    if (["absent", "ceo_recall", "ceo_decline", "ceo_claim", "appointment"].includes(r.status)) todayByCaller[key].ceoConnect++;
    if (r.status === "appointment") todayByCaller[key].appo++;
  });
  // Add sales from appoData for today
  const countableToday = new Set(["面談済", "事前確認済", "アポ取得"]);
  (appoData || []).forEach(a => {
    if (!countableToday.has(a.status)) return;
    const d = a.appoDate || a.meetDate || "";
    if (d.slice(0, 10) !== todayStr) return;
    const key = a.getter || "不明";
    if (!todayByCaller[key]) todayByCaller[key] = { total: 0, ceoConnect: 0, appo: 0, sales: 0 };
    todayByCaller[key].sales += (a.sales || 0);
  });
  const todayRank = Object.entries(todayByCaller).map(([name, d]) => ({ name, ...d }));
  const rankByTotal = [...todayRank].sort((a, b) => b.total - a.total);
  const rankByCeo = [...todayRank].sort((a, b) => b.ceoConnect - a.ceoConnect);
  const rankByAppo = [...todayRank].sort((a, b) => b.appo - a.appo);
  const rankBySales = [...todayRank].sort((a, b) => b.sales - a.sales);

  useEffect(() => {
    const interval = setInterval(() => {
      const nowMs = Date.now();
      if (nowMs - lastNotifTime.current < 29 * 60 * 1000) return;
      lastNotifTime.current = nowMs;
      const topCall = rankByTotal[0]; const topCeo = rankByCeo[0]; const topAppo = rankByAppo[0];
      if (!topCall) return;
      setNotification({
        time: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
        callChamp: topCall ? topCall.name + "（" + topCall.total + "件）" : "-",
        ceoChamp: topCeo && topCeo.ceoConnect > 0 ? topCeo.name + "（" + topCeo.ceoConnect + "件）" : "-",
        appoChamp: topAppo && topAppo.appo > 0 ? topAppo.name + "（" + topAppo.appo + "件）" : "-",
      });
    }, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [todayRecords.length]);

  // === Shared UI components ===
  const inputStyle = {
    padding: "6px 10px", borderRadius: 5, background: C.white, border: "1px solid " + C.border,
    color: C.textDark, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none",
  };
  const tabBtn = (active, color) => ({
    padding: "5px 12px", borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: "pointer",
    fontFamily: "'Noto Sans JP'", border: "1px solid " + (active ? color : C.border),
    background: active ? color : C.white, color: active ? C.white : C.textMid,
  });
  const monthSelectStyle = {
    padding: "3px 6px", borderRadius: 4, border: "1px solid " + C.border,
    fontSize: 11, color: C.textDark, outline: "none", fontFamily: "'Noto Sans JP'",
  };
  const periodSelector = (period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, selectedMonth, setSelectedMonth, accent) => (
    <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
      {[["week", "週"], ["month", "月"], ["custom", "期間指定"]].map(([k, l]) => (
        <button key={k} onClick={() => setPeriod(k)} style={tabBtn(period === k, accent)}>{l}</button>
      ))}
      {period === "month" && (
        <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={monthSelectStyle}>
          {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
        </select>
      )}
      {period === "custom" && (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <select value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={monthSelectStyle}>
            <option value="">開始月</option>
            {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
          </select>
          <span style={{ fontSize: 10, color: C.textLight }}>〜</span>
          <select value={customTo} onChange={e => setCustomTo(e.target.value)} style={monthSelectStyle}>
            <option value="">終了月</option>
            {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
          </select>
        </div>
      )}
    </div>
  );
  const rankBadge = (rank) => ({
    width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: rank <= 3 ? 12 : 9, fontWeight: 700, flexShrink: 0,
    background: rank === 1 ? C.gold : rank === 2 ? "#C0C0C0" : rank === 3 ? "#cd7f32" : C.offWhite,
    color: rank <= 3 ? C.white : C.textLight,
    border: rank <= 3 ? "none" : "1px solid " + C.borderLight,
  });

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      {/* 30-min Notification Banner */}
      {notification && (
        <div style={{
          background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")", borderRadius: 10, padding: "14px 20px", marginBottom: 16,
          color: C.white, position: "relative", animation: "slideIn 0.4s ease",
        }}>
          <button onClick={() => setNotification(null)} style={{ position: "absolute", top: 8, right: 12, background: "transparent", border: "none", color: C.white + "80", cursor: "pointer", fontSize: 14 }}>×</button>
          <div style={{ fontSize: 10, color: C.goldLight, marginBottom: 6 }}>🏆 {notification.time} 時点のランキング速報</div>
          <div style={{ display: "flex", gap: 20, fontSize: 12 }}>
            <span>📞 架電1位: <b style={{ color: C.goldLight }}>{notification.callChamp}</b></span>
            <span>👔 接続1位: <b style={{ color: C.goldLight }}>{notification.ceoChamp}</b></span>
            <span>🎯 アポ1位: <b style={{ color: C.goldLight }}>{notification.appoChamp}</b></span>
          </div>
        </div>
      )}

      {/* ============ REALTIME TODAY RANKING ============ */}
      <div style={{
        background: C.white, borderRadius: 10, padding: "16px 20px", marginBottom: 20,
        border: "1px solid " + C.gold + "30", boxShadow: "0 2px 8px " + C.gold + "10",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 16 }}>🔥</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>本日のリアルタイムランキング</span>
          <span style={{ fontSize: 10, color: C.textLight }}>{todayRecords.length}件の架電</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
          {[
            { title: "架電件数", data: rankByTotal, key: "total", emoji: "📞" },
            { title: "社長接続", data: rankByCeo, key: "ceoConnect", emoji: "👔" },
            { title: "アポ取得", data: rankByAppo, key: "appo", emoji: "🎯" },
            { title: "売上", data: rankBySales, key: "sales", emoji: "💰", fmt: "money" },
          ].map((cat) => (
            <div key={cat.key} style={{ background: C.offWhite, borderRadius: 8, overflow: "hidden", border: "1px solid " + C.borderLight }}>
              <div style={{ padding: "8px 12px", background: C.navy + "08", fontSize: 11, fontWeight: 700, color: C.navy, borderBottom: "1px solid " + C.borderLight }}>
                {cat.emoji} {cat.title}
              </div>
              {cat.data.length === 0 ? (
                <div style={{ padding: 16, textAlign: "center", fontSize: 11, color: C.textLight }}>データなし</div>
              ) : cat.data.map((p, i) => {
                const isFirst = i === 0 && p[cat.key] > 0;
                return (
                  <div key={p.name} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
                    background: isFirst ? C.gold + "12" : "transparent",
                    borderBottom: "1px solid " + C.borderLight + "60",
                  }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: isFirst ? 12 : 9, fontWeight: 700, flexShrink: 0,
                      background: isFirst ? C.gold : C.offWhite, color: isFirst ? C.white : C.textLight,
                      border: isFirst ? "none" : "1px solid " + C.borderLight,
                    }}>{isFirst ? "👑" : i + 1}</span>
                    <span style={{ fontSize: 11, fontWeight: isFirst ? 700 : 400, color: isFirst ? C.navy : C.textDark, flex: 1 }}>{p.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "'JetBrains Mono'", color: isFirst ? C.gold : C.navy }}>
                      {cat.fmt === "money" ? (p[cat.key] / 10000).toFixed(1) + "万" : p[cat.key]}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ============ CALL RANKING ============ */}
      <div style={{
        background: C.white, borderRadius: 10, padding: "18px 20px", marginBottom: 20,
        border: "1px solid " + C.borderLight, boxShadow: "0 2px 8px rgba(26,58,92,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>📞</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>架電ランキング</span>
            <span style={{ fontSize: 10, color: C.textLight }}>({callFiltered.length}件)</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {periodSelector(callPeriod, setCallPeriod, callCustomFrom, setCallCustomFrom, callCustomTo, setCallCustomTo, callSelectedMonth, setCallSelectedMonth, C.navy)}
            <div style={{ width: 1, height: 18, background: C.border, margin: "0 4px" }}></div>
            {["team", "individual", "chart"].map(t => (
              <button key={t} onClick={() => setCallTab(t)} style={tabBtn(callTab === t, C.navy)}>
                {t === "team" ? "チーム別" : t === "individual" ? "個人別" : "グラフ"}
              </button>
            ))}
          </div>
        </div>

        {/* Call - Team */}
        {callTab === "team" && (
          <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid " + C.borderLight }}>
            <div style={{ display: "grid", gridTemplateColumns: "36px 1.5fr 0.8fr 0.8fr 0.8fr", padding: "8px 16px", background: C.navyDeep, fontSize: 9, fontWeight: 600, color: C.goldLight }}>
              <span>#</span><span>チーム</span><span>架電件数</span><span>社長接続</span><span>アポ取得</span>
            </div>
            {callTeamRank.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: C.textLight, fontSize: 12 }}>データなし</div>
            ) : callTeamRank.map(([tn, d], idx) => (
              <div key={tn} style={{ display: "grid", gridTemplateColumns: "36px 1.5fr 0.8fr 0.8fr 0.8fr", padding: "10px 16px", fontSize: 12, alignItems: "center", borderBottom: "1px solid " + C.borderLight }}>
                <span style={rankBadge(idx + 1)}>{idx === 0 ? "👑" : idx + 1}</span>
                <span style={{ fontWeight: 700, color: C.navy }}>{tn}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, color: C.textDark }}>{d.total}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, color: C.textDark }}>{d.ceoConnect}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 800, color: C.gold }}>{d.appo}</span>
              </div>
            ))}
          </div>
        )}

        {/* Call - Individual */}
        {callTab === "individual" && (
          <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid " + C.borderLight }}>
            <div style={{ display: "grid", gridTemplateColumns: "36px 1.2fr 0.8fr 0.8fr 0.8fr", padding: "8px 16px", background: C.navyDeep, fontSize: 9, fontWeight: 600, color: C.goldLight }}>
              <span>#</span><span>名前</span><span>架電件数</span><span>社長接続</span><span>アポ取得</span>
            </div>
            {callIndivRanked.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: C.textLight, fontSize: 12 }}>データなし</div>
            ) : callIndivRanked.map((p, idx) => {
              const isMe = p.name === currentUser;
              return (
                <div key={p.name} style={{
                  display: "grid", gridTemplateColumns: "36px 1.2fr 0.8fr 0.8fr 0.8fr", padding: "10px 16px", fontSize: 12, alignItems: "center",
                  borderBottom: "1px solid " + C.borderLight, background: isMe ? C.navy + "08" : "transparent",
                  borderLeft: isMe ? "3px solid " + C.navy : "3px solid transparent",
                }}>
                  <span style={rankBadge(idx + 1)}>{idx === 0 ? "👑" : idx + 1}</span>
                  <span style={{ fontWeight: isMe ? 700 : 500, color: isMe ? C.navy : C.textDark }}>{p.name}{isMe ? " ★" : ""}</span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700 }}>{p.total}</span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700 }}>{p.ceoConnect}</span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 800, color: C.gold }}>{p.appo}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Call - Chart */}
        {callTab === "chart" && (
          <div style={{ borderRadius: 8, border: "1px solid " + C.borderLight, padding: "16px 14px" }}>
            {callIndivRanked.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: C.textLight, fontSize: 12 }}>データなし</div>
            ) : callIndivRanked.map((p, idx) => {
              const maxVal = callIndivRanked[0]?.total || 1;
              return (
                <div key={p.name} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 10, width: 18, textAlign: "right", color: idx === 0 ? C.gold : C.textLight }}>{idx + 1}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: C.textDark, width: 72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ height: 18, borderRadius: 3, background: "linear-gradient(90deg, " + C.navy + ", " + C.navyLight + ")", width: Math.max(p.total / maxVal * 100, 2) + "%", transition: "width 0.4s ease", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 4 }}>
                        {p.total / maxVal > 0.2 && <span style={{ fontSize: 8, fontWeight: 700, color: C.white }}>{p.total}</span>}
                      </div>
                      <span style={{ fontSize: 9, color: C.textMid, whiteSpace: "nowrap" }}>{p.total}件 / 接続{p.ceoConnect} / アポ{p.appo}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ============ SALES RANKING ============ */}
      <div style={{
        background: C.white, borderRadius: 10, padding: "18px 20px", marginBottom: 20,
        border: "1px solid " + C.borderLight, boxShadow: "0 2px 8px rgba(26,58,92,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>💰</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>売上ランキング</span>
            <span style={{ fontSize: 10, color: C.textLight }}>（有効ステータスのみ / {salesFiltered.length}件）</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {periodSelector(salesPeriod, setSalesPeriod, salesCustomFrom, setSalesCustomFrom, salesCustomTo, setSalesCustomTo, salesSelectedMonth, setSalesSelectedMonth, C.gold)}
            <div style={{ width: 1, height: 18, background: C.border, margin: "0 4px" }}></div>
            {["team", "individual", "chart"].map(t => (
              <button key={t} onClick={() => setSalesTab(t)} style={tabBtn(salesTab === t, C.gold)}>
                {t === "team" ? "チーム別" : t === "individual" ? "個人別" : "グラフ"}
              </button>
            ))}
          </div>
        </div>

        {/* Sales - Team */}
        {salesTab === "team" && (
          <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid " + C.borderLight }}>
            <div style={{ display: "grid", gridTemplateColumns: "36px 1.5fr 0.6fr 1fr", padding: "8px 16px", background: C.navyDeep, fontSize: 9, fontWeight: 600, color: C.goldLight }}>
              <span>#</span><span>チーム</span><span>件数</span><span>売上</span>
            </div>
            {salesTeamRank.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: C.textLight, fontSize: 12 }}>データなし</div>
            ) : salesTeamRank.map(([tn, d], idx) => (
              <div key={tn} style={{ display: "grid", gridTemplateColumns: "36px 1.5fr 0.6fr 1fr", padding: "10px 16px", fontSize: 12, alignItems: "center", borderBottom: "1px solid " + C.borderLight }}>
                <span style={rankBadge(idx + 1)}>{idx === 0 ? "👑" : idx + 1}</span>
                <span style={{ fontWeight: 700, color: C.navy }}>{tn}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 600 }}>{d.count}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, fontWeight: 900, color: C.gold }}>{(d.total / 10000).toFixed(1)}<span style={{ fontSize: 9, fontWeight: 500 }}>万円</span></span>
              </div>
            ))}
          </div>
        )}

        {/* Sales - Individual */}
        {salesTab === "individual" && (
          <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid " + C.borderLight }}>
            <div style={{ display: "grid", gridTemplateColumns: "36px 1.2fr 0.6fr 0.8fr 0.8fr", padding: "8px 16px", background: C.navyDeep, fontSize: 9, fontWeight: 600, color: C.goldLight }}>
              <span>#</span><span>名前</span><span>件数</span><span>売上</span><span>報酬</span>
            </div>
            {salesIndivRank.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: C.textLight, fontSize: 12 }}>データなし</div>
            ) : salesIndivRank.map(([name, d], idx) => {
              const isMe = name === currentUser;
              return (
                <div key={name} style={{
                  display: "grid", gridTemplateColumns: "36px 1.2fr 0.6fr 0.8fr 0.8fr", padding: "10px 16px", fontSize: 12, alignItems: "center",
                  borderBottom: "1px solid " + C.borderLight, background: isMe ? C.gold + "08" : "transparent",
                  borderLeft: isMe ? "3px solid " + C.gold : "3px solid transparent",
                }}>
                  <span style={rankBadge(idx + 1)}>{idx === 0 ? "👑" : idx + 1}</span>
                  <span style={{ fontWeight: isMe ? 700 : 500, color: isMe ? C.navy : C.textDark }}>{name}{isMe ? " ★" : ""}</span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 600 }}>{d.count}</span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, fontWeight: 900, color: C.gold }}>{(d.total / 10000).toFixed(1)}<span style={{ fontSize: 9, fontWeight: 500 }}>万</span></span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, fontWeight: 600, color: C.green }}>{(d.reward / 10000).toFixed(1)}<span style={{ fontSize: 9, fontWeight: 500 }}>万</span></span>
                </div>
              );
            })}
          </div>
        )}

        {/* Sales - Chart */}
        {salesTab === "chart" && (
          <div style={{ borderRadius: 8, border: "1px solid " + C.borderLight, padding: "16px 14px" }}>
            {salesIndivRank.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: C.textLight, fontSize: 12 }}>データなし</div>
            ) : salesIndivRank.map(([name, d], idx) => {
              const barMax = maxIndivSales > 0 ? maxIndivSales : 1;
              return (
                <div key={name} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 10, width: 18, textAlign: "right", color: idx === 0 ? C.gold : C.textLight }}>{idx + 1}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: C.textDark, width: 72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ height: 18, borderRadius: 3, background: "linear-gradient(90deg, " + C.gold + ", " + C.goldLight + ")", width: Math.max(d.total / barMax * 100, 2) + "%", transition: "width 0.4s ease", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 4 }}>
                        {d.total / barMax > 0.2 && <span style={{ fontSize: 8, fontWeight: 700, color: C.white }}>{d.count}件</span>}
                      </div>
                      <span style={{ fontSize: 9, color: C.gold, fontWeight: 700, whiteSpace: "nowrap" }}>{(d.total / 10000).toFixed(1)}万</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

// ============================================================
// Recall List View
// ============================================================
// ============================================================
// Payroll View (報酬計算)
// ============================================================
const PAYROLL_DATA = [];

function PayrollView({ members, appoData }) {
  const payrollMonths = (() => {
    const now = new Date();
    const result = [];
    let y = 2026, m = 3; // 3月固定スタート（要件通り）
    const endD = new Date(now.getFullYear(), now.getMonth() + 3, 0); // 翌々月末日
    while (new Date(y, m - 1, 1) <= endD) {
      result.push({ label: m + "月", year: y, month: m });
      if (++m > 12) { m = 1; y++; }
    }
    return result;
  })();
  const [monthTab, setMonthTab] = useState(() => {
    const s = localStorage.getItem('spanavi_payroll_month');
    return (s && payrollMonths.some(x => x.label === s)) ? s : (payrollMonths[payrollMonths.length - 1]?.label || "3月");
  });
  useEffect(() => {
    localStorage.setItem('spanavi_payroll_month', monthTab);
  }, [monthTab]);
  const [teamFilter, setTeamFilter] = useState("all");
  const [sortKey, setSortKey] = useState("total");

  // リファラル採用インセンティブ計算
  // 条件: 紹介された人がoperation_start_dateから30日以内にcumulative_sales >= 100,000
  const referralMap = React.useMemo(() => {
    const map = {};
    const sel = payrollMonths.find(x => x.label === monthTab) ?? { year: 2026, month: 3 };
    const monthNum = sel.month;
    const year = sel.year;
    const monthStart = new Date(year, monthNum - 1, 1);
    const monthEnd = new Date(year, monthNum, 0); // 月末日
    members.forEach(m => {
      if (!m.referrerName || !m.operationStartDate || (m.totalSales || 0) < 100000) return;
      const opDate = new Date(m.operationStartDate);
      const deadline = new Date(opDate);
      deadline.setDate(deadline.getDate() + 30);
      // 30日ウィンドウが今月と重なる場合に支給
      if (opDate <= monthEnd && deadline >= monthStart) {
        map[m.referrerName] = (map[m.referrerName] || 0) + 50000;
      }
    });
    return map;
  }, [members, monthTab]);

  const PAYROLL_COUNTABLE = new Set(["面談済", "事前確認済", "アポ取得"]);
  const data = React.useMemo(() => {
    const sel = payrollMonths.find(x => x.label === monthTab) ?? { year: 2026, month: 3 };
    const yyyymm = `${sel.year}-${String(sel.month).padStart(2, "0")}`;
    const monthAppos = (appoData || []).filter(a =>
      a.meetDate && a.meetDate.slice(0, 7) === yyyymm &&
      PAYROLL_COUNTABLE.has(a.status)
    );
    const memberMap = {};
    members.forEach(m => { memberMap[m.name] = m; });
    const byGetter = {};
    monthAppos.forEach(a => {
      if (!byGetter[a.getter]) {
        const mem = memberMap[a.getter] || {};
        byGetter[a.getter] = {
          name: a.getter,
          team: mem.team || "",
          rank: mem.rank || "",
          rate: mem.rate || 0,
          sales: 0, incentive: 0, teamBonus: 0, referral: 0, total: 0, bonus: 0,
        };
      }
      byGetter[a.getter].sales += a.sales || 0;
    });
    Object.values(byGetter).forEach(p => {
      p.incentive = Math.round(p.sales * p.rate);
      p.total = p.incentive + p.teamBonus;
    });
    return Object.values(byGetter);
  }, [appoData, members, monthTab]);
  const filtered = data.filter(p => {
    if (teamFilter !== "all" && p.team !== teamFilter) return false;
    return true;
  }).sort((a, b) => b[sortKey] - a[sortKey]);

  const teams = [...new Set(data.map(p => p.team))];
  const grandTotal = data.reduce((s, p) => s + p.total + (referralMap[p.name] || 0), 0);
  const grandSales = data.reduce((s, p) => s + p.sales, 0);
  const paidCount = data.filter(p => p.total > 0).length;

  const fmt = (v) => v > 0 ? "¥" + v.toLocaleString() : "-";

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { label: "総支給額", value: fmt(grandTotal), color: C.navy },
          { label: "総売上", value: fmt(grandSales), color: C.green },
          { label: "支給対象者", value: paidCount + "名", color: C.gold },
          { label: "対象月", value: monthTab, color: C.navyLight },
        ].map((s, i) => (
          <div key={i} style={{
            background: C.white, borderRadius: 10, padding: "14px 18px",
            border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)",
          }}>
            <div style={{ fontSize: 10, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color, fontFamily: "'JetBrains Mono'" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {payrollMonths.map(({ label }) => (
            <button key={label} onClick={() => setMonthTab(label)} style={{
              padding: "5px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
              fontFamily: "'Noto Sans JP'",
              background: monthTab === label ? C.navy : C.white,
              color: monthTab === label ? C.white : C.textMid,
              border: "1px solid " + (monthTab === label ? C.navy : C.borderLight),
            }}>{label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4, marginLeft: 12 }}>
          {["all", ...teams].map(t => (
            <button key={t} onClick={() => setTeamFilter(t)} style={{
              padding: "4px 10px", borderRadius: 12, fontSize: 10, fontWeight: 600, cursor: "pointer",
              fontFamily: "'Noto Sans JP'",
              background: teamFilter === t ? C.gold + "15" : C.white,
              color: teamFilter === t ? C.navy : C.textMid,
              border: "1px solid " + (teamFilter === t ? C.gold : C.borderLight),
            }}>{t === "all" ? "全チーム" : t + "チーム"}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "1.2fr 0.6fr 0.6fr 0.5fr 0.8fr 0.8fr 0.7fr 0.6fr 0.9fr 0.5fr",
          padding: "8px 14px", background: C.navyDeep, fontSize: 9, fontWeight: 600, color: C.goldLight,
        }}>
          {["名前", "チーム", "ランク", "率", "今月売上", "①インセンティブ", "②チームボーナス", "③紹介", "合計支給額", "賞与"].map((h, i) => (
            <span key={i} style={{ cursor: ["sales", "incentive", "teamBonus", "total"][i-4] ? "pointer" : "default" }}
              onClick={() => {
                const keys = [null, null, null, null, "sales", "incentive", "teamBonus", "referral", "total", "bonus"];
                if (keys[i]) setSortKey(keys[i]);
              }}>{h}{sortKey === ["", "", "", "", "sales", "incentive", "teamBonus", "referral", "total", "bonus"][i] ? " ▼" : ""}</span>
          ))}
        </div>
        {filtered.map((p, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "1.2fr 0.6fr 0.6fr 0.5fr 0.8fr 0.8fr 0.7fr 0.6fr 0.9fr 0.5fr",
            padding: "7px 14px", fontSize: 11, alignItems: "center",
            borderBottom: "1px solid " + C.borderLight,
            background: p.total > 100000 ? C.gold + "06" : i % 2 === 0 ? C.white : C.offWhite + "80",
          }}>
            <span style={{ fontWeight: 600, color: C.navy }}>{p.name}</span>
            <span style={{ fontSize: 10, color: C.textMid }}>{p.team}</span>
            <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: p.rank === "プレイヤー" ? C.gold + "15" : C.offWhite, color: p.rank === "プレイヤー" ? C.gold : C.textLight, fontWeight: 600 }}>{p.rank || "-"}</span>
            <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono'", color: C.textLight }}>{p.rate ? (p.rate * 100).toFixed(0) + "%" : "-"}</span>
            <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono'", fontWeight: 600, color: C.navy }}>{fmt(p.sales)}</span>
            <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono'", color: C.green }}>{fmt(p.incentive)}</span>
            <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono'", color: C.textMid }}>{fmt(p.teamBonus)}</span>
            <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono'", color: referralMap[p.name] ? C.green : C.textMid }}>{fmt(referralMap[p.name] || p.referral)}</span>
            <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono'", fontWeight: 800, color: C.navy }}>{fmt(p.total + (referralMap[p.name] || 0))}</span>
            <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono'", color: C.gold }}>{p.bonus ? fmt(p.bonus) : "-"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Shift Management View (シフト管理)
// ============================================================
function ShiftManagementView({ members, currentUser, isAdmin }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [viewMode, setViewMode] = useState('month');
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [shiftModal, setShiftModal] = useState(null);

  // Fix3: 入社日昇順（古い順）
  const sortedMembers = React.useMemo(() => {
    return [...members]
      .filter(m => typeof m === 'object' && m.name)
      .sort((a, b) => (a.joinDate || '').localeCompare(b.joinDate || ''));
  }, [members]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // 週表示: selectedDay が属する7日ブロック（1-7, 8-14, 15-21, 22-28, 29-末日）
  const weekBlockStart = Math.floor((selectedDay - 1) / 7) * 7 + 1;
  const weekBlockEnd = Math.min(weekBlockStart + 6, daysInMonth);
  const weekDays = Array.from({ length: weekBlockEnd - weekBlockStart + 1 }, (_, i) => weekBlockStart + i);

  React.useEffect(() => { loadShifts(); }, [year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadShifts = async () => {
    setLoading(true);
    const { data } = await fetchShifts(`${year}-${String(month).padStart(2, '0')}`);
    setShifts(data || []);
    setLoading(false);
  };

  const getShift = (memberId, day) => {
    if (!memberId) return null;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return shifts.find(s => s.member_id === memberId && s.shift_date === dateStr) || null;
  };

  // Fix5: シフト時間（時間単位）
  const shiftHours = (shift) => {
    if (!shift) return 0;
    const parse = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    return (parse(shift.end_time) - parse(shift.start_time)) / 60;
  };
  const getMemberHours = (memberId, displayDays) => {
    if (!memberId) return 0;
    return displayDays.reduce((sum, d) => sum + shiftHours(getShift(memberId, d)), 0);
  };

  // Fix2: 30分スロットごとの同時稼働数
  const SLOTS_30 = (() => {
    const s = [];
    for (let h = 8; h < 22; h++) { s.push(`${String(h).padStart(2,'0')}:00`); s.push(`${String(h).padStart(2,'0')}:30`); }
    return s;
  })();
  const getConcurrentCount = (slotStr, dateStr) => {
    const [sh, sm] = slotStr.split(':').map(Number);
    const slotStart = sh * 60 + sm;
    const slotEnd = slotStart + 30;
    return shifts.filter(s => {
      if (s.shift_date !== dateStr) return false;
      const [startH, startM] = s.start_time.split(':').map(Number);
      const [endH, endM] = s.end_time.split(':').map(Number);
      return (startH * 60 + startM) < slotEnd && (endH * 60 + endM) > slotStart;
    }).length;
  };

  // 管理者は全員分、一般ユーザーは自分のシフトのみ編集可能
  const canEdit = (member) => isAdmin || member.name === currentUser;

  const handleCellClick = (member, day) => {
    if (!canEdit(member)) return;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const memId = member._supaId || member.id;
    const shift = getShift(memId, day);
    setShiftModal({ member, dateStr, shift });
  };

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };
  const prevWeek = () => setSelectedDay(d => Math.max(1, d - 7));
  const nextWeek = () => setSelectedDay(d => Math.min(daysInMonth, d + 7));
  const prevDay = () => setSelectedDay(d => Math.max(1, d - 1));
  const nextDay = () => setSelectedDay(d => Math.min(daysInMonth, d + 1));

  const DAY_JP = '日月火水木金土';
  const getDayMeta = (day) => {
    const dow = new Date(year, month - 1, day).getDay();
    return { dow, isSun: dow === 0, isSat: dow === 6, name: DAY_JP[dow] };
  };

  const fmtTime = (t) => t ? t.slice(0, 5) : '';
  const navBtn = { border: '1px solid ' + C.border, cursor: 'pointer', fontFamily: "'Noto Sans JP'", fontWeight: 600, borderRadius: 5, padding: '5px 10px', background: C.offWhite, color: C.navy, fontSize: 12 };
  const modeBtn = (active) => ({ border: '1px solid ' + C.border, cursor: 'pointer', fontFamily: "'Noto Sans JP'", fontWeight: 600, borderRadius: 5, padding: '5px 12px', background: active ? C.navy : C.white, color: active ? C.white : C.navy, fontSize: 11 });

  // Fix4・Fix5: isMonthView=trueのとき⚠アラートと赤字。合計列を右端にsticky追加
  const renderGridView = (displayDays, isMonthView) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 140 + displayDays.length * 72 + 76 }}>
        <thead>
          <tr style={{ background: C.navy }}>
            <th style={{ position: 'sticky', left: 0, width: 130, minWidth: 130, padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: C.white, borderRight: '2px solid rgba(255,255,255,0.2)', background: C.navy, zIndex: 3 }}>メンバー</th>
            {displayDays.map(d => {
              const { isSun, isSat, name } = getDayMeta(d);
              return (
                <th key={d} style={{ width: 72, minWidth: 72, padding: '6px 4px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: isSun ? '#fc8181' : isSat ? '#90cdf4' : C.white, borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ fontSize: 12 }}>{d}</div>
                  <div style={{ fontSize: 9, opacity: 0.8 }}>{name}</div>
                </th>
              );
            })}
            <th style={{ position: 'sticky', right: 0, width: 76, minWidth: 76, padding: '6px 8px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: C.navy, background: C.offWhite, borderLeft: '2px solid ' + C.gold, zIndex: 3 }}>合計</th>
          </tr>
        </thead>
        <tbody>
          {sortedMembers.map((member, mi) => {
            const memId = member._supaId || member.id;
            const isMe = member.name === currentUser;
            const isEditable = canEdit(member);
            const rowBg = isMe ? C.gold + '18' : mi % 2 === 0 ? C.white : C.cream;
            const totalH = getMemberHours(memId, displayDays);
            const monthlyH = isMonthView ? totalH : getMemberHours(memId, days);
            const isUnder80 = isMonthView && monthlyH < 80;
            return (
              <tr key={memId || mi} style={{ borderBottom: '1px solid ' + C.borderLight }}>
                <td style={{ position: 'sticky', left: 0, padding: '6px 12px', fontWeight: isMe ? 700 : 500, fontSize: 11, color: isMe ? C.navy : C.textDark, background: rowBg, borderRight: '2px solid ' + C.border, whiteSpace: 'nowrap', zIndex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{member.name}</span>
                    {/* Fix4: 80時間未達アラート */}
                    {isUnder80 && (
                      <span title={`今月の稼働時間: ${monthlyH.toFixed(1)}時間（80時間未達）`}
                        style={{ color: '#ed8936', fontSize: 13, cursor: 'help', lineHeight: 1 }}>⚠</span>
                    )}
                  </div>
                </td>
                {displayDays.map(d => {
                  const { isSun, isSat } = getDayMeta(d);
                  const shift = getShift(memId, d);
                  const cellBg = shift ? 'transparent' : isSun ? '#fff5f5' : isSat ? '#ebf8ff' : rowBg;
                  return (
                    <td key={d}
                      style={{ padding: '3px 4px', textAlign: 'center', background: cellBg, borderRight: '1px solid ' + C.borderLight, cursor: 'default', verticalAlign: 'middle' }}>
                      {shift ? (
                        <div style={{ background: isMe ? C.gold : C.navy + '18', border: '1px solid ' + (isMe ? C.gold + '80' : C.navy + '30'), borderRadius: 4, padding: '3px 4px', fontSize: 9, fontWeight: 700, color: isMe ? '#7d5c00' : C.navy, lineHeight: 1.5 }}>
                          <div>{fmtTime(shift.start_time)}</div>
                          <div>{fmtTime(shift.end_time)}</div>
                        </div>
                      ) : (
                        <div style={{ height: 36 }} />
                      )}
                    </td>
                  );
                })}
                {/* Fix5: 合計時間列（sticky right） */}
                <td style={{ position: 'sticky', right: 0, padding: '6px 8px', textAlign: 'center', background: C.offWhite, borderLeft: '2px solid ' + C.gold, whiteSpace: 'nowrap', zIndex: 1 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: isUnder80 ? '#e53e3e' : C.navy }}>
                    {totalH > 0 ? totalH.toFixed(1) + 'h' : '-'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const renderDayView = () => {
    const TIMELINE_START = 8 * 60;
    const TIMELINE_END = 22 * 60;
    const TIMELINE_TOTAL = TIMELINE_END - TIMELINE_START;
    const HOURS = Array.from({ length: 15 }, (_, i) => i + 8);
    const NAME_W = 130;
    const TOTAL_W = 72;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
    const { isSun, isSat } = getDayMeta(selectedDay);
    const timeToPercent = (t) => {
      const [h, m] = t.split(':').map(Number);
      return ((h * 60 + m - TIMELINE_START) / TIMELINE_TOTAL) * 100;
    };
    return (
      <div>
        {/* 日付ピッカー */}
        <div style={{ padding: '12px 16px', background: C.white, borderBottom: '1px solid ' + C.borderLight, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {days.map(d => {
            const { isSun: s, isSat: sat } = getDayMeta(d);
            return (
              <button key={d} onClick={() => setSelectedDay(d)}
                style={{ width: 30, height: 30, borderRadius: 5, border: '1px solid ' + C.border, fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: "'Noto Sans JP'",
                  background: selectedDay === d ? C.navy : s ? '#fff5f5' : sat ? '#ebf8ff' : C.offWhite,
                  color: selectedDay === d ? C.white : s ? '#c53030' : sat ? '#2b6cb0' : C.navy }}>
                {d}
              </button>
            );
          })}
        </div>
        {/* タイムラインカード */}
        <div style={{ margin: '16px 20px 0', background: C.white, borderRadius: 10, border: '1px solid ' + C.borderLight, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', background: isSun ? '#c53030' : isSat ? '#2b6cb0' : C.navy, color: C.white, fontSize: 13, fontWeight: 700 }}>
            {year}年{month}月{selectedDay}日（{getDayMeta(selectedDay).name}）のシフト
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 700, padding: '12px 16px' }}>
              {/* 時間軸ヘッダー */}
              <div style={{ display: 'flex', marginBottom: 8, paddingLeft: NAME_W, paddingRight: TOTAL_W + 8 }}>
                {HOURS.map(h => (
                  <div key={h} style={{ flex: 1, fontSize: 9, color: C.textLight, borderLeft: '1px solid ' + C.borderLight, paddingLeft: 2 }}>{h}:00</div>
                ))}
              </div>
              {/* メンバー行 */}
              {sortedMembers.map((member, mi) => {
                const memId = member._supaId || member.id;
                const isMe = member.name === currentUser;
                const isEditable = canEdit(member);
                const shift = memId ? shifts.find(s => s.member_id === memId && s.shift_date === dateStr) : null;
                const dayH = shiftHours(shift);
                return (
                  <div key={memId || mi} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ width: NAME_W, flexShrink: 0, fontSize: 11, fontWeight: isMe ? 700 : 500, color: isMe ? C.navy : C.textDark, paddingRight: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.name}</div>
                    <div style={{ flex: 1, height: 32, background: C.cream, borderRadius: 5, position: 'relative', cursor: isEditable ? 'pointer' : 'default', border: '1px solid ' + C.borderLight }}
                      onClick={() => isEditable && handleCellClick(member, selectedDay)}>
                      {HOURS.slice(1).map((h, i) => (
                        <div key={h} style={{ position: 'absolute', top: 0, bottom: 0, left: ((i + 1) / (HOURS.length - 1)) * 100 + '%', width: 1, background: C.borderLight }} />
                      ))}
                      {shift && (
                        <div style={{
                          position: 'absolute', top: 3, bottom: 3, borderRadius: 4,
                          left: timeToPercent(shift.start_time) + '%',
                          width: Math.max(timeToPercent(shift.end_time) - timeToPercent(shift.start_time), 0) + '%',
                          background: isMe ? C.gold : C.navy + '25',
                          border: '1px solid ' + (isMe ? C.gold + '80' : C.navy + '40'),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, fontWeight: 700, color: isMe ? '#7d5c00' : C.navy, overflow: 'hidden', whiteSpace: 'nowrap'
                        }}>
                          {fmtTime(shift.start_time)}–{fmtTime(shift.end_time)}
                        </div>
                      )}
                    </div>
                    {/* Fix5: 日別合計時間 */}
                    <div style={{ width: TOTAL_W, flexShrink: 0, marginLeft: 8, textAlign: 'center', background: C.offWhite, borderLeft: '2px solid ' + C.gold, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0 4px 4px 0' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: C.navy }}>
                        {dayH > 0 ? dayH.toFixed(1) + 'h' : '-'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Fix2: 同時稼働数フッター（sticky bottom） */}
        <div style={{ position: 'sticky', bottom: 0, background: C.navy, borderTop: '2px solid ' + C.gold, zIndex: 5, marginTop: 4 }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 700, display: 'flex', alignItems: 'center', padding: '6px 16px' }}>
              <div style={{ width: NAME_W, flexShrink: 0, fontSize: 10, fontWeight: 700, color: C.white, paddingRight: 8 }}>同時稼働数</div>
              <div style={{ flex: 1, display: 'flex' }}>
                {SLOTS_30.map(slot => {
                  const count = getConcurrentCount(slot, dateStr);
                  return (
                    <div key={slot} style={{ flex: 1, textAlign: 'center', fontSize: count > 0 ? 10 : 9, fontWeight: 700, color: count > 0 ? C.gold : 'rgba(255,255,255,0.25)', minWidth: 0, paddingTop: 2, paddingBottom: 2 }}>
                      {count > 0 ? count : '·'}
                    </div>
                  );
                })}
              </div>
              <div style={{ width: TOTAL_W + 8, flexShrink: 0 }} />
            </div>
          </div>
        </div>

        <div style={{ height: 16 }} />
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ヘッダー */}
      <div style={{ padding: '14px 24px', background: C.white, borderBottom: '1px solid ' + C.borderLight, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.navy }}>シフト管理</div>
        {/* 月ナビ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={prevMonth} style={navBtn}>◀</button>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, minWidth: 88, textAlign: 'center' }}>{year}年{month}月</div>
          <button onClick={nextMonth} style={navBtn}>▶</button>
        </div>
        {/* 週ナビ（週表示時のみ） */}
        {viewMode === 'week' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={prevWeek} style={navBtn}>← 前週</button>
            <span style={{ fontSize: 11, color: C.textMid, fontWeight: 600, minWidth: 72, textAlign: 'center' }}>{weekBlockStart}日〜{weekBlockEnd}日</span>
            <button onClick={nextWeek} style={navBtn}>次週 →</button>
          </div>
        )}
        {/* 日ナビ（日表示時のみ） */}
        {viewMode === 'day' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={prevDay} style={navBtn}>← 前日</button>
            <span style={{ fontSize: 11, color: C.textMid, fontWeight: 600, minWidth: 36, textAlign: 'center' }}>{selectedDay}日</span>
            <button onClick={nextDay} style={navBtn}>次日 →</button>
          </div>
        )}
        {/* 表示切替 + 更新 */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {[['month', '月間表示'], ['week', '週間表示'], ['day', '日別表示']].map(([mode, label]) => (
            <button key={mode} onClick={() => setViewMode(mode)} style={modeBtn(viewMode === mode)}>{label}</button>
          ))}
          <button onClick={loadShifts} style={{ ...navBtn, marginLeft: 4 }}>↻ 更新</button>
        </div>
      </div>

      {/* コンテンツ */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: C.textLight, fontSize: 13 }}>読み込み中...</div>
        ) : viewMode === 'month' ? renderGridView(days, true)
          : viewMode === 'week' ? renderGridView(weekDays, false)
          : renderDayView()}
      </div>

      {shiftModal && (
        <ShiftInputModal
          modal={shiftModal}
          onClose={() => setShiftModal(null)}
          onSaved={(newShifts) => { setShifts(newShifts); setShiftModal(null); }}
          year={year}
          month={month}
        />
      )}
    </div>
  );
}

function ShiftInputModal({ modal, onClose, onSaved, year, month }) {
  const { member, dateStr, shift } = modal;
  const memId = member._supaId || member.id;

  const timeOptions = [];
  for (let h = 8; h <= 22; h++) {
    timeOptions.push(`${String(h).padStart(2, '0')}:00`);
    if (h < 22) timeOptions.push(`${String(h).padStart(2, '0')}:30`);
  }

  const [startTime, setStartTime] = useState(shift ? shift.start_time.slice(0, 5) : '09:00');
  const [endTime, setEndTime] = useState(shift ? shift.end_time.slice(0, 5) : '18:00');
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const handleSave = async () => {
    if (startTime >= endTime) { setErrMsg('開始時間は終了時間より前にしてください'); return; }
    setSaving(true);
    setErrMsg('');
    console.log('[Shift] handleSave: member=', member.name, '_supaId=', member._supaId, 'id=', member.id, 'memId=', memId, 'dateStr=', dateStr, 'start=', startTime, 'end=', endTime);
    if (shift) {
      const err = await updateShift(shift.id, { start_time: startTime + ':00', end_time: endTime + ':00' });
      if (err) {
        const msg = err.message || JSON.stringify(err);
        console.error('[Shift] updateShift failed:', msg);
        alert('保存に失敗しました: ' + msg);
        setErrMsg('保存に失敗しました: ' + msg);
        setSaving(false); return;
      }
    } else {
      if (!memId) { console.warn('[Shift] memId missing for', member.name); }
      const { error: err } = await insertShift({ member_id: memId || null, member_name: member.name, shift_date: dateStr, start_time: startTime + ':00', end_time: endTime + ':00' });
      if (err) {
        const msg = err.message || JSON.stringify(err);
        console.error('[Shift] insertShift failed:', msg);
        alert('保存に失敗しました: ' + msg);
        setErrMsg('保存に失敗しました: ' + msg);
        setSaving(false); return;
      }
    }
    const { data } = await fetchShifts(`${year}-${String(month).padStart(2, '0')}`);
    onSaved(data || []);
  };

  const handleDelete = async () => {
    if (!shift) return;
    setSaving(true);
    await deleteShift(shift.id);
    const { data } = await fetchShifts(`${year}-${String(month).padStart(2, '0')}`);
    onSaved(data || []);
  };

  const btnStyle = (bg, color) => ({ border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'Noto Sans JP'", fontWeight: 700, borderRadius: 6, padding: '9px 18px', fontSize: 12, background: bg, color, opacity: saving ? 0.65 : 1 });
  const selStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid ' + C.border, fontSize: 13, fontFamily: "'Noto Sans JP'", background: C.white, color: C.navy, outline: 'none', cursor: 'pointer' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}
      onClick={onClose}>
      <div style={{ background: C.white, borderRadius: 14, padding: 28, width: 350, boxShadow: '0 8px 36px rgba(0,0,0,0.22)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.navy, marginBottom: 20 }}>シフト{shift ? '編集' : '入力'}</div>
        {/* メンバー・日付（読み取り専用） */}
        {[{ label: 'メンバー', value: member.name }, { label: '日付', value: dateStr }].map(({ label, value }) => (
          <div key={label} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: C.textLight, fontWeight: 600, marginBottom: 4, letterSpacing: 0.5 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.navy, padding: '8px 12px', background: C.cream, borderRadius: 6, border: '1px solid ' + C.borderLight }}>{value}</div>
          </div>
        ))}
        {/* 時間選択 */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: C.textLight, fontWeight: 600, marginBottom: 4, letterSpacing: 0.5 }}>開始時間</div>
            <select value={startTime} onChange={e => setStartTime(e.target.value)} style={selStyle}>
              {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: C.textLight, fontWeight: 600, marginBottom: 4, letterSpacing: 0.5 }}>終了時間</div>
            <select value={endTime} onChange={e => setEndTime(e.target.value)} style={selStyle}>
              {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        {errMsg && (
          <div style={{ fontSize: 11, color: '#c53030', marginBottom: 12, padding: '6px 10px', background: '#fff5f5', borderRadius: 5, border: '1px solid #fed7d7' }}>{errMsg}</div>
        )}
        {/* ボタン */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSave} disabled={saving} style={btnStyle(C.navy, C.white)}>
            {saving ? '保存中...' : '保存'}
          </button>
          {shift && (
            <button onClick={handleDelete} disabled={saving} style={btnStyle('#fed7d7', '#c53030')}>削除</button>
          )}
          <button onClick={onClose} style={{ ...btnStyle(C.offWhite, C.textMid), marginLeft: 'auto' }}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

function RecallListView({ importedCSVs, setImportedCSVs, callListData, supaRecalls = [], onRecallComplete, members = [], currentUser = '', isAdmin = false, onRefresh }) {
  const [sortBy, setSortBy] = useState("date");
  const [selectedItem, setSelectedItem] = useState(null);
  const [rightMemo, setRightMemo] = useState('');
  const [inlineRecallModal, setInlineRecallModal] = useState(null);
  const [filterAssignee, setFilterAssignee] = useState('');
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [showAssigneeSugg, setShowAssigneeSugg] = useState(false);
  const [itemCallHistory, setItemCallHistory] = useState([]);
  const [activeRecordingId, setActiveRecordingId] = useState(null);

  useEffect(() => {
    if (!selectedItem?._supaRecord?.item_id) { setItemCallHistory([]); setActiveRecordingId(null); return; }
    fetchCallRecordsByItemId(selectedItem._supaRecord.item_id)
      .then(({ data }) => setItemCallHistory(data || []));
  }, [selectedItem]);

  const assigneeSuggestions = members.filter(m =>
    !assigneeQuery || m.toLowerCase().includes(assigneeQuery.toLowerCase())
  );
  const handleAssigneeInput = (v) => {
    setAssigneeQuery(v);
    if (!v) setFilterAssignee('');
    setShowAssigneeSugg(true);
  };
  const handleAssigneeSelect = (name) => {
    setAssigneeQuery(name);
    setFilterAssignee(name);
    setShowAssigneeSugg(false);
  };
  const handleAssigneeClear = () => {
    setAssigneeQuery('');
    setFilterAssignee('');
    setShowAssigneeSugg(false);
  };

  const handleStatusClick = async (item, statusLabel, statusId) => {
    console.log('[handleStatusClick] 開始 — status:', statusLabel, '/ item._source:', item._source, '/ component: RecallListView');
    if (item._source !== 'supabase') { console.warn('[handleStatusClick] 早期リターン — sourceがsupabaseでない:', item._source); return; }
    const r = item._supaRecord;
    if (statusLabel === '受付再コール' || statusLabel === '社長再コール') {
      setInlineRecallModal({ item, statusId, label: statusLabel });
      return;
    }
    await insertCallRecord({ item_id: r.item_id, list_id: r.list_id, round: r.round + 1, status: statusLabel, memo: rightMemo || null, getter_name: currentUser });
    await updateCallListItem(r.item_id, { call_status: statusLabel });
    await onRecallComplete(r);
    setSelectedItem(null);
  };

  const handleInlineRecallSave = async (recallData) => {
    if (!inlineRecallModal) return;
    const { item, label } = inlineRecallModal;
    const r = item._supaRecord;
    const memoJson = JSON.stringify({ recall_date: recallData.recallDate, recall_time: recallData.recallTime, assignee: recallData.assignee, note: recallData.note, recall_completed: false });
    await insertCallRecord({ item_id: r.item_id, list_id: r.list_id, round: r.round + 1, status: label, memo: memoJson, getter_name: currentUser });
    await updateCallListItem(r.item_id, { call_status: label });
    await onRecallComplete(r);
    setInlineRecallModal(null);
    setSelectedItem(null);
    if (onRefresh) onRefresh();
  };

  // Collect recall items
  const recallItems = [];
  Object.entries(importedCSVs).forEach(([listIdStr, rows]) => {
    const listId = Number(listIdStr);
    const listInfo = callListData.find(l => l.id === listId);
    rows.forEach((row, rowIdx) => {
      if (!row.rounds) return;
      Object.entries(row.rounds).forEach(([round, data]) => {
        if ((data.status === "reception_recall" || data.status === "ceo_recall") && data.recall) {
          recallItems.push({ listId, listInfo, row, rowIdx, round: Number(round), status: data.status, recallDate: data.recall.recallDate || "", recallTime: data.recall.recallTime || "", assignee: data.recall.assignee || "", note: data.recall.note || "", company: row.company, phone: row.phone, representative: row.representative, address: row.address || '', timestamp: data.timestamp });
        }
      });
    });
  });
  (supaRecalls || []).forEach(r => {
    recallItems.push({ _source: 'supabase', _supaRecord: r, company: r._item.company || '企業名不明', phone: r._item.phone || '', representative: r._item.representative || '', address: r._item.address || '', status: r.status, recallDate: r._memoObj.recall_date || '', recallTime: r._memoObj.recall_time || '', assignee: r._memoObj.assignee || '', note: r._memoObj.note || '', listInfo: null, _list_name: r._list_name || '', _list_industry: r._list_industry || '', _client_name: r._client_name || '' });
  });

  // 一般ユーザーは自分担当分のみ表示
  const baseRecallItems = isAdmin
    ? recallItems
    : recallItems.filter(item => (item.assignee || '') === currentUser);
  const filteredRecallItems = filterAssignee
    ? baseRecallItems.filter(item => item.assignee === filterAssignee)
    : baseRecallItems;

  const sorted = [...filteredRecallItems].sort((a, b) => {
    if (sortBy === "date") return (a.recallDate + a.recallTime).localeCompare(b.recallDate + b.recallTime);
    if (sortBy === "assignee") return (a.assignee || "未設定").localeCompare(b.assignee || "未設定");
    return 0;
  });

  const today = new Date().toISOString().slice(0, 10);
  const nowDt = new Date();
  const isOverdue = (date, time) => { if (!date) return false; return new Date(`${date}T${time || '00:00'}:00`) <= nowDt; };

  const inputStyle = { padding: "6px 10px", borderRadius: 6, background: C.white, border: "1px solid " + C.border, color: C.textDark, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none" };

  return (
    <div style={{ animation: "fadeIn 0.3s ease", display: 'flex', gap: 14, height: 'calc(100vh - 210px)' }}>
      {/* ── 左パネル ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.white, borderRadius: 10, border: '1px solid ' + C.borderLight }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid ' + C.borderLight, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15 }}>📞</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>再コール一覧</span>
            <span style={{ fontSize: 10, color: C.textLight }}>{sorted.length}{filterAssignee ? `/${baseRecallItems.length}` : ''}件</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* 担当者フィルター combobox（管理者のみ表示） */}
            {isAdmin && <div style={{ position: 'relative' }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                border: '1px solid ' + C.navy, borderRadius: 6, background: C.white,
              }}>
                {filterAssignee && (
                  <div style={{
                    background: C.gold, color: C.white, fontSize: 10, fontWeight: 700,
                    padding: '0 8px', display: 'flex', alignItems: 'center',
                    whiteSpace: 'nowrap', alignSelf: 'stretch', borderRadius: '5px 0 0 5px',
                  }}>
                    {filterAssignee}
                  </div>
                )}
                <input
                  type="text"
                  placeholder="担当者で絞り込み..."
                  value={assigneeQuery}
                  onChange={e => handleAssigneeInput(e.target.value)}
                  onFocus={() => setShowAssigneeSugg(true)}
                  onBlur={() => setTimeout(() => setShowAssigneeSugg(false), 150)}
                  style={{ ...inputStyle, border: 'none', outline: 'none', minWidth: 130, background: 'transparent' }}
                />
                {filterAssignee && (
                  <button onMouseDown={handleAssigneeClear} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: C.textLight, padding: '4px 8px', fontSize: 13, lineHeight: 1,
                  }}>✕</button>
                )}
              </div>
              {showAssigneeSugg && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0,
                  background: C.white, border: '1px solid ' + C.navy + '40',
                  borderRadius: 6, boxShadow: '0 4px 12px rgba(26,58,92,0.15)',
                  zIndex: 200, maxHeight: 200, overflowY: 'auto', minWidth: '100%',
                }}>
                  <div
                    onMouseDown={handleAssigneeClear}
                    style={{
                      padding: '7px 12px', fontSize: 11, color: C.navy,
                      cursor: 'pointer', fontWeight: 600,
                      borderBottom: '1px solid ' + C.borderLight,
                      background: !filterAssignee ? C.navy + '08' : 'transparent',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = C.navy + '10'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = !filterAssignee ? C.navy + '08' : 'transparent'; }}
                  >
                    全員（全件表示）
                  </div>
                  {assigneeSuggestions.map(m => (
                    <div
                      key={m}
                      onMouseDown={() => handleAssigneeSelect(m)}
                      style={{
                        padding: '7px 12px', fontSize: 11, color: C.navy,
                        cursor: 'pointer',
                        background: m === filterAssignee ? C.gold + '15' : 'transparent',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = C.gold + '20'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = m === filterAssignee ? C.gold + '15' : 'transparent'; }}
                    >
                      {m}
                    </div>
                  ))}
                  {assigneeSuggestions.length === 0 && (
                    <div style={{ padding: '7px 12px', fontSize: 11, color: C.textLight }}>候補なし</div>
                  )}
                </div>
              )}
            </div>}
            {/* ソート */}
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={inputStyle}>
              <option value="date">日時順</option>
              <option value="assignee">担当者別</option>
            </select>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {sorted.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: C.textLight, fontSize: 13 }}>再コール予定はありません</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '78px 1.6fr 0.8fr 110px 58px 0.7fr', padding: '5px 14px', background: C.offWhite, borderBottom: '1px solid ' + C.borderLight, fontSize: 9, fontWeight: 700, color: C.textLight, letterSpacing: 0.5, flexShrink: 0 }}>
                <span>予定日時</span><span>企業名</span><span>代表者</span><span>電話番号</span><span>種別</span><span>担当</span>
              </div>
              {sorted.map((item, i) => {
                const past = isOverdue(item.recallDate, item.recallTime);
                const isSel = selectedItem && (item._source === 'supabase' ? item._supaRecord?.id === selectedItem._supaRecord?.id : (item.listId === selectedItem.listId && item.rowIdx === selectedItem.rowIdx && item.round === selectedItem.round));
                return (
                  <div key={i} onClick={() => { setSelectedItem(item); setRightMemo(item.note || ''); }}
                    style={{ display: 'grid', gridTemplateColumns: '78px 1.6fr 0.8fr 110px 58px 0.7fr', padding: '8px 14px', fontSize: 11, alignItems: 'center', borderBottom: '1px solid ' + C.borderLight, borderLeft: isSel ? '3px solid ' + C.gold : '3px solid transparent', background: isSel ? C.gold + '10' : past ? '#fff5f5' : 'transparent', cursor: 'pointer' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: past ? '#e53e3e' : C.navy, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>{item.recallTime || '--:--'}</div>
                      <div style={{ fontSize: 9, color: C.textLight }}>{item.recallDate ? item.recallDate.slice(5).replace('-', '/') : '日時未設定'}</div>
                    </div>
                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.company}</span>
                    <span style={{ color: C.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10 }}>{item.representative}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.navy, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.phone}</span>
                    <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3, background: C.gold + '10', color: C.gold, fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {item.status === 'ceo_recall' || item.status === '社長再コール' ? '社長' : '受付'}
                    </span>
                    <span style={{ fontSize: 10, color: C.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.assignee || '—'}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* ── 右パネル ── */}
      <div style={{ width: 380, background: C.white, borderRadius: 10, border: '1px solid ' + C.borderLight, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
        {!selectedItem ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textLight, fontSize: 12, flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 28 }}>📋</span>
            <span>左のリストから企業を選択</span>
          </div>
        ) : (
          <>
            <div style={{ padding: '12px 16px', background: 'linear-gradient(135deg, ' + C.navyDeep + ', ' + C.navy + ')', flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedItem.company}</div>
              <div style={{ fontSize: 10, color: selectedItem.status === '社長再コール' || selectedItem.status === 'ceo_recall' ? '#fc8181' : C.goldLight, marginTop: 2 }}>
                {selectedItem.status === '社長再コール' || selectedItem.status === 'ceo_recall' ? '社長再コール' : '受付再コール'}
                {selectedItem.recallDate && ` / ${selectedItem.recallDate.slice(5).replace('-', '/')} ${selectedItem.recallTime || ''}`}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
              {/* クライアント・リスト情報 */}
              {selectedItem._source === 'supabase' && (selectedItem._client_name || selectedItem._list_industry) && (
                <div style={{ marginBottom: 12, fontSize: 11, color: C.navy, fontWeight: 500 }}>
                  {selectedItem._client_name && <span>{selectedItem._client_name}</span>}
                  {selectedItem._client_name && selectedItem._list_industry && <span style={{ color: C.textLight, margin: '0 5px' }}>›</span>}
                  {selectedItem._list_industry && <span style={{ color: C.textMid }}>{selectedItem._list_industry}</span>}
                </div>
              )}
              {selectedItem._source !== 'supabase' && selectedItem.listInfo && (
                <div style={{ marginBottom: 12, fontSize: 11, color: C.navy, fontWeight: 500 }}>{selectedItem.listInfo.company}</div>
              )}
              {/* 企業情報 */}
              <div style={{ padding: '10px 12px', background: C.offWhite, borderRadius: 8, border: '1px solid ' + C.borderLight, marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.navy, marginBottom: 8 }}>🏢 企業情報</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {selectedItem.representative && (
                    <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                      <span style={{ color: C.textLight, minWidth: 40, flexShrink: 0 }}>代表者</span>
                      <span style={{ color: C.textDark, fontWeight: 500 }}>{selectedItem.representative}</span>
                    </div>
                  )}
                  {selectedItem.address && (
                    <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                      <span style={{ color: C.textLight, minWidth: 40, flexShrink: 0 }}>住所</span>
                      <span style={{ color: C.textDark }}>{selectedItem.address}</span>
                    </div>
                  )}
                  {selectedItem.phone && (
                    <div style={{ display: 'flex', gap: 8, fontSize: 11, alignItems: 'center' }}>
                      <span style={{ color: C.textLight, minWidth: 40, flexShrink: 0 }}>電話</span>
                      <span style={{ color: C.navy, fontWeight: 600, fontFamily: "'JetBrains Mono'", whiteSpace: 'nowrap' }}>{selectedItem.phone}</span>
                      <button onClick={() => dialPhone(selectedItem.phone)} style={{ padding: '3px 10px', borderRadius: 4, border: 'none', background: C.navy, color: C.white, fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: "'Noto Sans JP'", flexShrink: 0 }}>📞 発信</button>
                    </div>
                  )}
                </div>
              </div>
              {/* ステータスボタン (supabase only) */}
              {selectedItem._source === 'supabase' && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.navy, marginBottom: 8 }}>📋 架電結果</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {CALL_RESULTS.map(r => {
                      const isAppo = r.id === 'appointment';
                      const isExcl = r.id === 'excluded';
                      const btnBg    = isAppo ? C.gold  : isExcl ? C.red + '10' : C.navy + '08';
                      const btnColor = isAppo ? C.white : isExcl ? C.red        : C.navy;
                      const btnBdr   = isAppo ? '1.5px solid ' + C.gold : isExcl ? '1.5px solid ' + C.red + '40' : '1px solid ' + C.navy + '25';
                      return (
                        <button key={r.id} onClick={() => { console.log('[STATUS CLICK]', 'clicked', r.label, '/ component: RecallListView / handleStatusClick'); handleStatusClick(selectedItem, r.label, r.id); }}
                          style={{ padding: '9px 6px', borderRadius: 7, border: btnBdr, background: btnBg, color: btnColor, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: "'Noto Sans JP'", lineHeight: 1.2 }}>
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* 担当者表示 */}
              {selectedItem.assignee && (
                <div style={{ marginBottom: 8, fontSize: 11, color: C.textMid }}>担当: {selectedItem.assignee}</div>
              )}
              {/* 架電履歴 */}
              {itemCallHistory.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 6 }}>📋 架電履歴</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {itemCallHistory.map(rec => {
                      const dt = rec.called_at ? new Date(rec.called_at) : null;
                      const dtStr = dt
                        ? `${dt.getMonth()+1}/${dt.getDate()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`
                        : '';
                      return (
                        <div key={rec.id}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                            padding: '5px 8px', borderRadius: 5, background: C.offWhite, fontSize: 11 }}>
                            <span style={{ fontWeight: 700, color: C.navy, minWidth: 36,
                              fontFamily: "'JetBrains Mono'", fontSize: 10 }}>{rec.round}回目</span>
                            <span style={{ flex: 1, color: C.textMid, fontWeight: 600 }}>{rec.status}</span>
                            <span style={{ color: C.textLight, fontSize: 10 }}>{dtStr}</span>
                            {rec.recording_url && (
                              <button
                                onClick={() => setActiveRecordingId(activeRecordingId === rec.id ? null : rec.id)}
                                title={activeRecordingId === rec.id ? "閉じる" : "録音を再生"}
                                style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
                                  padding: 0, lineHeight: 1, color: activeRecordingId === rec.id ? C.red : 'inherit' }}>🎙</button>
                            )}
                          </div>
                          {activeRecordingId === rec.id && rec.recording_url && (
                            <InlineAudioPlayer url={rec.recording_url} onClose={() => setActiveRecordingId(null)} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* メモ */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 5 }}>メモ</div>
                <textarea value={rightMemo} onChange={e => setRightMemo(e.target.value)} placeholder="架電前のメモ等..."
                  style={{ width: '100%', minHeight: 60, padding: '6px 10px', borderRadius: 6, border: '1px solid ' + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', resize: 'vertical', background: C.offWhite, boxSizing: 'border-box' }} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* インライン再コールモーダル */}
      {inlineRecallModal && (
        <RecallModal
          row={{ company: inlineRecallModal.item.company }}
          statusId={inlineRecallModal.statusId}
          onSubmit={handleInlineRecallSave}
          onCancel={() => setInlineRecallModal(null)}
          members={members}
        />
      )}
    </div>
  );
}

// ============================================================
// Rules View
// ============================================================
// ============================================================
// MyPage View
// ============================================================
function MyPageView({ currentUser, importedCSVs, callListData, members, now, appoData }) {
  const [periodTab, setPeriodTab] = useState("daily"); // daily, weekly, monthly, cumulative
  const [trainingExpanded, setTrainingExpanded] = useState(true);
  const profileImageKey = "spanavi_profile_" + (currentUser || '');
  const [profileImage, setProfileImage] = useState(() => {
    try { return localStorage.getItem(profileImageKey) || null; } catch(e) { return null; }
  });
  const fileInputRef = React.useRef(null);
  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const b64 = evt.target.result;
      setProfileImage(b64);
      try { localStorage.setItem(profileImageKey, b64); } catch(e) {}
    };
    reader.readAsDataURL(file);
  };

  // Collect all records for this user
  const myRecords = useMemo(() => {
    const records = [];
    Object.entries(importedCSVs).forEach(([listIdStr, rows]) => {
      rows.forEach(row => {
        if (!row.rounds) return;
        Object.entries(row.rounds).forEach(([round, data]) => {
          if (data.caller === currentUser) {
            records.push({
              status: data.status,
              timestamp: data.timestamp || "",
              date: (data.timestamp || "").slice(0, 10),
            });
          }
        });
      });
    });
    return records;
  }, [importedCSVs, currentUser]);

  const todayStr2 = now.toISOString().slice(0, 10);

  // Sales data from appoData for this user
  const mySales = useMemo(() => {
    const countable = new Set(["面談済", "事前確認済", "アポ取得"]);
    return (appoData || []).filter(a => a.getter === currentUser && countable.has(a.status)).map(a => ({
      sales: parseFloat(a.sales) || 0,
      date: a.appoDate || "",
    }));
  }, [appoData, currentUser]);

  const salesAggregate = (salesList) => salesList.reduce((s, r) => s + r.sales, 0);

  // Aggregate by period
  const aggregate = (records) => {
    let total = 0, ceoConnect = 0, appo = 0;
    records.forEach(r => {
      total++;
      if (["absent", "ceo_recall", "ceo_decline", "ceo_claim", "appointment"].includes(r.status)) ceoConnect++;
      if (r.status === "appointment") appo++;
    });
    return { total, ceoConnect, appo };
  };

  // Get week start (Monday)
  const getWeekStart = (d) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff)).toISOString().slice(0, 10);
  };

  const todayAgg = aggregate(myRecords.filter(r => r.date === todayStr2));
  const thisWeekStart = getWeekStart(now);
  const weekAgg = aggregate(myRecords.filter(r => r.date >= thisWeekStart));
  const monthStart = todayStr2.slice(0, 7) + "-01";
  const monthAgg = aggregate(myRecords.filter(r => r.date >= monthStart));
  const cumAgg = aggregate(myRecords);

  // Sales aggregates by period
  const todaySalesVal = salesAggregate(mySales.filter(s => s.date === todayStr2));
  const weekSalesVal = salesAggregate(mySales.filter(s => s.date >= thisWeekStart));
  const monthSalesVal = salesAggregate(mySales.filter(s => s.date >= monthStart));
  const cumSalesVal = salesAggregate(mySales);

  // Daily breakdown for chart (last 14 days)
  const dailyData = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      const dayRecords = myRecords.filter(r => r.date === dateStr);
      const agg = aggregate(dayRecords);
      days.push({ date: dateStr, label: (d.getMonth() + 1) + "/" + d.getDate(), ...agg });
    }
    return days;
  }, [myRecords, todayStr2]);

  // Weekly breakdown (last 8 weeks)
  const weeklyData = useMemo(() => {
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const ws = getWeekStart(d);
      const we = new Date(new Date(ws).getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const weekRecords = myRecords.filter(r => r.date >= ws && r.date <= we);
      const agg = aggregate(weekRecords);
      weeks.push({ label: ws.slice(5) + "〜", ...agg });
    }
    return weeks;
  }, [myRecords, todayStr2]);

  // Monthly breakdown (last 6 months)
  const monthlyData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ms = d.toISOString().slice(0, 7);
      const mRecords = myRecords.filter(r => r.date.startsWith(ms));
      const agg = aggregate(mRecords);
      months.push({ label: (d.getMonth() + 1) + "月", ...agg });
    }
    return months;
  }, [myRecords, todayStr2]);

  const chartData = periodTab === "daily" ? dailyData : periodTab === "weekly" ? weeklyData : periodTab === "monthly" ? monthlyData : [{ label: "累計", ...cumAgg }];
  const maxVal = Math.max(1, ...chartData.map(d => d.total));

  // Member info
  const memberInfo = members.find(m => m.name === currentUser);

  // Training stages
  const trainingStages = [
    { id: "orientation", label: "オリエンテーション", desc: "会社紹介・事業理解", default: true },
    { id: "script_study", label: "スクリプト学習", desc: "架電トークの暗記・理解", default: true },
    { id: "roleplay1", label: "ロープレ①", desc: "受付突破ロープレ", default: false },
    { id: "roleplay2", label: "ロープレ②", desc: "社長対応ロープレ", default: false },
    { id: "roleplay3", label: "ロープレ③", desc: "切り返しロープレ", default: false },
    { id: "live_call", label: "実架電デビュー", desc: "OJTでの初架電", default: false },
    { id: "independent", label: "独り立ち", desc: "一人での架電開始", default: false },
  ];
  const completedCount = trainingStages.filter(s => s.default).length;

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      {/* Profile Header */}
      <div style={{
        background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")", borderRadius: 12, padding: "24px 28px", marginBottom: 16,
        color: C.white, display: "flex", alignItems: "center", gap: 20,
      }}>
        <div
          onClick={() => fileInputRef.current?.click()}
          title="クリックして画像を変更"
          style={{
            width: 56, height: 56, borderRadius: "50%", background: C.gold,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, fontWeight: 800, color: C.navyDeep, flexShrink: 0,
            cursor: "pointer", overflow: "hidden",
          }}
        >
          {profileImage
            ? <img src={profileImage} alt="profile" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", display: "block" }} />
            : (currentUser || "?").charAt(0)
          }
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} style={{ display: "none" }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{currentUser}</div>
          <div style={{ display: "flex", gap: 12, fontSize: 11, color: C.goldLight }}>
            {memberInfo && <span>{memberInfo.team}</span>}
            {memberInfo && <span>{memberInfo.rank}</span>}
            <span>累計架電: {cumAgg.total}件</span>
            <span>累計アポ: {cumAgg.appo}件</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { label: "本日", val: todayAgg.total, sub: "件架電" },
            { label: "今週", val: weekAgg.total, sub: "件架電" },
            { label: "今月", val: monthAgg.appo, sub: "件アポ" },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: "center", padding: "8px 14px", borderRadius: 8, background: C.white + "12" }}>
              <div style={{ fontSize: 9, color: C.goldLight, marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono'" }}>{s.val}</div>
              <div style={{ fontSize: 8, color: C.white + "80" }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Training Progress */}
      <div style={{
        background: C.white, borderRadius: 10, padding: "16px 20px", marginBottom: 16,
        border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 14 }}>📚</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>研修・ロープレ進捗</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
          padding: "24px 0", gap: 10, color: C.textLight }}>
          <span style={{ fontSize: 22 }}>🚧</span>
          <span style={{ fontSize: 12 }}>工事中 - 近日実装予定</span>
        </div>
      </div>

      {/* Performance Data */}
      <div style={{
        background: C.white, borderRadius: 10, padding: "16px 20px", marginBottom: 16,
        border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>📈</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>実績データ</span>
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            {[
              { id: "daily", label: "日別" },
              { id: "weekly", label: "週別" },
              { id: "monthly", label: "月別" },
              { id: "cumulative", label: "累計" },
            ].map(t => (
              <button key={t.id} onClick={() => setPeriodTab(t.id)} style={{
                padding: "5px 14px", borderRadius: 4, border: "1px solid " + C.borderLight,
                background: periodTab === t.id ? C.navy : C.white,
                color: periodTab === t.id ? C.white : C.textMid,
                fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Sans JP'",
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          {[
            { label: "架電件数", val: periodTab === "cumulative" ? cumAgg.total : periodTab === "monthly" ? monthAgg.total : periodTab === "weekly" ? weekAgg.total : todayAgg.total, color: C.navy, emoji: "📞" },
            { label: "社長接続数", val: periodTab === "cumulative" ? cumAgg.ceoConnect : periodTab === "monthly" ? monthAgg.ceoConnect : periodTab === "weekly" ? weekAgg.ceoConnect : todayAgg.ceoConnect, color: C.gold, emoji: "👔" },
            { label: "アポ取得数", val: periodTab === "cumulative" ? cumAgg.appo : periodTab === "monthly" ? monthAgg.appo : periodTab === "weekly" ? weekAgg.appo : todayAgg.appo, color: C.green, emoji: "🎯" },
            { label: "売上", val: periodTab === "cumulative" ? cumSalesVal : periodTab === "monthly" ? monthSalesVal : periodTab === "weekly" ? weekSalesVal : todaySalesVal, color: "#d4760a", emoji: "💰", isMoney: true },
          ].map((card, i) => (
            <div key={i} style={{
              padding: "14px 16px", borderRadius: 8, background: card.color + "08",
              border: "1px solid " + card.color + "20", textAlign: "center",
            }}>
              <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>{card.emoji} {card.label}</div>
              <div style={{ fontSize: card.isMoney ? 22 : 28, fontWeight: 800, fontFamily: "'JetBrains Mono'", color: card.color }}>{card.isMoney ? card.val.toFixed(1) + "万" : card.val}</div>
            </div>
          ))}
        </div>

        {/* Bar chart */}
        {periodTab !== "cumulative" && chartData.length > 1 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 8 }}>
              {periodTab === "daily" ? "過去14日間" : periodTab === "weekly" ? "過去8週間" : "過去6ヶ月"}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120, padding: "0 4px" }}>
              {chartData.map((d, i) => {
                const h = maxVal > 0 ? (d.total / maxVal) * 100 : 0;
                const isToday = d.date === todayStr2;
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <span style={{ fontSize: 8, fontWeight: 700, color: C.navy, fontFamily: "'JetBrains Mono'" }}>{d.total > 0 ? d.total : ""}</span>
                    <div style={{ position: "relative", width: "100%", maxWidth: 28 }}>
                      <div style={{
                        height: Math.max(2, h) + "%", minHeight: 2,
                        background: isToday ? "linear-gradient(180deg, " + C.gold + ", " + C.navy + ")" : d.appo > 0 ? C.gold : C.navy + "60",
                        borderRadius: "3px 3px 0 0", transition: "height 0.3s",
                      }}></div>
                      {d.ceoConnect > 0 && (
                        <div style={{
                          position: "absolute", bottom: 0, left: 0, right: 0,
                          height: (maxVal > 0 ? (d.ceoConnect / maxVal) * 100 : 0) + "%",
                          background: C.gold + "40", borderRadius: "0 0 0 0", minHeight: 1,
                        }}></div>
                      )}
                    </div>
                    <span style={{ fontSize: 7, color: isToday ? C.navy : C.textLight, fontWeight: isToday ? 700 : 400 }}>{d.label}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 8, fontSize: 9, color: C.textLight }}>
              <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: C.navy + "60", marginRight: 3, verticalAlign: "middle" }}></span>架電数</span>
              <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: C.gold + "40", marginRight: 3, verticalAlign: "middle" }}></span>社長接続</span>
              <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: C.gold, marginRight: 3, verticalAlign: "middle" }}></span>アポ含む</span>
            </div>
          </div>
        )}
      </div>

      {/* Sales Data */}
      {(() => {
        const countableStatuses = new Set(["面談済", "事前確認済", "アポ取得"]);
        const myAppos = (appoData || []).filter(a => a.getter === currentUser && countableStatuses.has(a.status));

        const getSalesForPeriod = (appos) => {
          let count = 0, totalSales = 0, totalReward = 0;
          appos.forEach(a => {
            count++;
            totalSales += parseFloat(a.sales) || 0;
            totalReward += parseFloat(a.incentive) || 0;
          });
          return { count, totalSales, totalReward };
        };

        const todaySales = getSalesForPeriod(myAppos.filter(a => a.appoDate === todayStr2));
        const thisWeekSales = getSalesForPeriod(myAppos.filter(a => a.appoDate >= thisWeekStart));
        const thisMonthSales = getSalesForPeriod(myAppos.filter(a => a.appoDate >= monthStart));
        const cumSales = getSalesForPeriod(myAppos);
        const currentSales = periodTab === "cumulative" ? cumSales : periodTab === "monthly" ? thisMonthSales : periodTab === "weekly" ? thisWeekSales : todaySales;

        return (
          <div style={{
            background: C.white, borderRadius: 10, padding: "16px 20px", marginBottom: 16,
            border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 14 }}>💰</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>売上データ</span>
              <span style={{ fontSize: 10, color: C.textLight }}>（有効ステータスのアポのみ）</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div style={{ padding: "14px 16px", borderRadius: 8, background: C.gold + "08", border: "1px solid " + C.gold + "20", textAlign: "center" }}>
                <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>📋 アポ件数</div>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'JetBrains Mono'", color: C.gold }}>{currentSales.count}</div>
              </div>
              <div style={{ padding: "14px 16px", borderRadius: 8, background: C.navy + "08", border: "1px solid " + C.navy + "20", textAlign: "center" }}>
                <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>💰 当社売上</div>
                <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'JetBrains Mono'", color: C.navy }}>{currentSales.totalSales.toFixed(1)}<span style={{ fontSize: 11, fontWeight: 400 }}>万円</span></div>
              </div>
              <div style={{ padding: "14px 16px", borderRadius: 8, background: C.green + "08", border: "1px solid " + C.green + "20", textAlign: "center" }}>
                <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>🎁 インターン報酬</div>
                <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'JetBrains Mono'", color: C.green }}>{currentSales.totalReward.toFixed(1)}<span style={{ fontSize: 11, fontWeight: 400 }}>万円</span></div>
              </div>
            </div>

            {/* Monthly breakdown table */}
            {myAppos.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 6 }}>月別推移</div>
                <div style={{
                  display: "grid", gridTemplateColumns: "60px repeat(3, 1fr)", gap: 0,
                  background: C.navy + "08", borderRadius: 6, overflow: "hidden", fontSize: 10,
                }}>
                  <div style={{ padding: "6px 10px", fontWeight: 700, color: C.navy, borderBottom: "1px solid " + C.borderLight }}>月</div>
                  <div style={{ padding: "6px 10px", fontWeight: 700, color: C.navy, textAlign: "right", borderBottom: "1px solid " + C.borderLight }}>件数</div>
                  <div style={{ padding: "6px 10px", fontWeight: 700, color: C.navy, textAlign: "right", borderBottom: "1px solid " + C.borderLight }}>売上</div>
                  <div style={{ padding: "6px 10px", fontWeight: 700, color: C.navy, textAlign: "right", borderBottom: "1px solid " + C.borderLight }}>報酬</div>
                  {(() => {
                    const monthMap = {};
                    myAppos.forEach(a => {
                      const m = (a.appoDate || "").slice(0, 7);
                      if (!m) return;
                      if (!monthMap[m]) monthMap[m] = { count: 0, sales: 0, reward: 0 };
                      monthMap[m].count++;
                      monthMap[m].sales += parseFloat(a.sales) || 0;
                      monthMap[m].reward += parseFloat(a.incentive) || 0;
                    });
                    return Object.entries(monthMap).sort((a, b) => b[0].localeCompare(a[0])).map(([m, d]) => (
                      <React.Fragment key={m}>
                        <div style={{ padding: "5px 10px", background: C.white, borderBottom: "1px solid " + C.borderLight + "60", fontWeight: 600, color: C.navy }}>{m.slice(5)}月</div>
                        <div style={{ padding: "5px 10px", background: C.white, borderBottom: "1px solid " + C.borderLight + "60", textAlign: "right", fontFamily: "'JetBrains Mono'" }}>{d.count}</div>
                        <div style={{ padding: "5px 10px", background: C.white, borderBottom: "1px solid " + C.borderLight + "60", textAlign: "right", fontFamily: "'JetBrains Mono'", color: C.navy, fontWeight: 600 }}>{d.sales.toFixed(1)}万</div>
                        <div style={{ padding: "5px 10px", background: C.white, borderBottom: "1px solid " + C.borderLight + "60", textAlign: "right", fontFamily: "'JetBrains Mono'", color: C.green, fontWeight: 600 }}>{d.reward.toFixed(1)}万</div>
                      </React.Fragment>
                    ));
                  })()}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ============================================================
// AI Assistant View (Claude Chat)
// ============================================================
function AIAssistantView({ appoData, members, callListData, industryRules, currentUser }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = React.useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const buildSystemPrompt = () => {
    const countableStatuses = new Set(["面談済", "事前確認済", "アポ取得"]);
    const activeAppo = appoData.filter(a => countableStatuses.has(a.status));
    const totalSales = activeAppo.reduce((s, a) => s + a.sales, 0);
    const totalReward = activeAppo.reduce((s, a) => s + a.reward, 0);

    const teamSummary = {};
    members.forEach(m => {
      const t = m.team || "その他";
      if (!teamSummary[t]) teamSummary[t] = 0;
      teamSummary[t]++;
    });

    const rulesText = industryRules.map(r => `${r.industry}: ${r.rule}`).join("\n");

    return `あなたはMASP（M&A Sourcing Partners）の社内AIアシスタント「MASP AI」です。
テレアポ（電話営業）によるM&A仲介企業向けアポイント獲得サービスを運営する会社のスタッフをサポートします。

【会社概要】
・M&A仲介会社・PEファンド・事業会社向けにアポイント獲得代行サービスを提供
・約${members.length}名のインターン生が架電業務を担当
・成果報酬型（アポ1件あたり11万〜16.5万円）
・チーム制：${Object.entries(teamSummary).map(([t, c]) => t + "（" + c + "名）").join("、")}

【現在の実績サマリ】
・有効アポ数: ${activeAppo.length}件（全${appoData.length}件中）
・当社売上合計: ¥${totalSales.toLocaleString()}
・インターン報酬合計: ¥${totalReward.toLocaleString()}
・クライアント数: ${callListData.length}社（架電リスト）

【業種別架電ルール】
${rulesText}

【社内ルール・方針】
・架電時間帯: 基本は平日9:00〜18:00（業種により異なる）
・社長通電が最優先目標。受付突破が重要
・アポ取得時は必ずアポ取得報告を提出
・ステータス管理: 不通、社長不在、受付ブロック、受付再コール、社長再コール、社長お断り、除外（廃止番号・クレーム等）、アポ獲得
・報酬体系: トレーニー(22%)、プレイヤー(24%)、スパルタン(26%)、スーパースパルタン(28%)
・チームボーナス制度あり

【あなたの役割】
1. 架電のアドバイス（受付突破トーク、社長への切り返し、業種別の攻め方など）
2. 社内規定やルールの説明
3. 業務に関する一般的な質問への回答
4. モチベーション向上のサポート

回答は簡潔かつ実践的に。日本語で回答してください。
架電アドバイスでは、具体的なトーク例を交えて回答してください。`;
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: buildSystemPrompt(),
          messages: apiMessages,
        }),
      });
      const data = await response.json();
      const assistantText = data.content?.map(b => b.type === "text" ? b.text : "").join("") || "回答を取得できませんでした。";
      setMessages(prev => [...prev, { role: "assistant", content: assistantText }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: "エラーが発生しました: " + err.message }]);
    }
    setLoading(false);
  };

  const quickQuestions = [
    "受付突破のコツを教えて",
    "建設業への架電で気をつけることは？",
    "社長に断られた時の切り返しトーク",
    "アポ取得報告の書き方",
    "再コールのベストタイミングは？",
    "報酬体系について教えて",
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 130px)", animation: "fadeIn 0.3s ease" }}>
      {/* Header */}
      <div style={{
        background: C.white, borderRadius: 10, padding: "14px 20px", marginBottom: 12,
        border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, color: C.white, fontWeight: 900,
          }}>AI</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>MASP AI アシスタント</div>
            <div style={{ fontSize: 10, color: C.textLight }}>架電アドバイス・社内ルール・業務サポート</div>
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])} style={{
            padding: "4px 12px", borderRadius: 6, border: "1px solid " + C.borderLight,
            background: C.white, cursor: "pointer", fontSize: 10, color: C.textMid,
            fontFamily: "'Noto Sans JP'", fontWeight: 600,
          }}>チャットをクリア</button>
        )}
      </div>

      {/* Chat area */}
      <div style={{
        flex: 1, overflowY: "auto", background: C.white, borderRadius: 10,
        border: "1px solid " + C.borderLight, padding: 16,
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        {messages.length === 0 ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
            <div style={{
              width: 60, height: 60, borderRadius: 16,
              background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24, color: C.white, fontWeight: 900,
            }}>AI</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.navy, marginBottom: 4 }}>MASP AI アシスタント</div>
              <div style={{ fontSize: 12, color: C.textLight }}>架電のコツや社内ルールなど、何でも聞いてください</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", maxWidth: 500 }}>
              {quickQuestions.map((q, i) => (
                <button key={i} onClick={() => { setInput(q); }} style={{
                  padding: "6px 12px", borderRadius: 16, border: "1px solid " + C.borderLight,
                  background: C.offWhite, cursor: "pointer", fontSize: 11, color: C.navy,
                  fontFamily: "'Noto Sans JP'", fontWeight: 500, transition: "all 0.15s",
                }}>{q}</button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} style={{
              display: "flex", gap: 10, justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}>
              {msg.role === "assistant" && (
                <div style={{
                  width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                  background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, color: C.white, fontWeight: 900,
                }}>AI</div>
              )}
              <div style={{
                maxWidth: "75%", padding: "10px 14px", borderRadius: 12,
                background: msg.role === "user" ? C.navy : C.offWhite,
                color: msg.role === "user" ? C.white : C.textDark,
                fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap",
                borderBottomRightRadius: msg.role === "user" ? 4 : 12,
                borderBottomLeftRadius: msg.role === "assistant" ? 4 : 12,
              }}>{msg.content}</div>
              {msg.role === "user" && (
                <div style={{
                  width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                  background: C.gold + "20", border: "1px solid " + C.gold + "40",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, color: C.navy, fontWeight: 700,
                }}>{(currentUser || "?").slice(0, 1)}</div>
              )}
            </div>
          ))
        )}
        {loading && (
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, flexShrink: 0,
              background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, color: C.white, fontWeight: 900,
            }}>AI</div>
            <div style={{
              padding: "10px 14px", borderRadius: 12, background: C.offWhite,
              fontSize: 13, color: C.textLight, animation: "pulse 1.5s infinite",
            }}>考え中...</div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input area */}
      <div style={{
        display: "flex", gap: 8, marginTop: 12, padding: "12px 16px",
        background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight,
        boxShadow: "0 -1px 4px rgba(26,58,92,0.04)",
      }}>
        <input
          type="text" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="質問を入力... (Enter で送信)"
          style={{
            flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid " + C.border,
            background: C.offWhite, fontSize: 13, color: C.textDark,
            fontFamily: "'Noto Sans JP'", outline: "none",
          }}
        />
        <button onClick={sendMessage} disabled={loading || !input.trim()} style={{
          padding: "10px 20px", borderRadius: 8,
          background: loading || !input.trim() ? C.borderLight : "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")",
          border: "none", color: C.white, cursor: loading || !input.trim() ? "default" : "pointer",
          fontSize: 13, fontWeight: 700, fontFamily: "'Noto Sans JP'",
          opacity: loading || !input.trim() ? 0.5 : 1,
          transition: "all 0.15s",
        }}>送信</button>
      </div>
    </div>
  );
}

function RulesView({ industryRules, setIndustryRules, ruleEditorOpen, setRuleEditorOpen, editingRule, setEditingRule, isAdmin = false }) {
  const [newRule, setNewRule] = useState({ industry: "", rule: "", goodDays: [], badDays: [], goodHours: "", badHours: "", level: "normal" });
  const inputStyle = { padding: "10px 14px", borderRadius: 6, background: C.offWhite, border: "1px solid " + C.border, color: C.textDark, fontSize: 13, fontFamily: "'Noto Sans JP'", outline: "none", width: "100%" };

  const toggleDay = (day, field) => setNewRule(prev => { const arr = [...prev[field]]; const idx = arr.indexOf(day); if (idx >= 0) arr.splice(idx, 1); else arr.push(day); return { ...prev, [field]: arr }; });

  const handleSave = () => {
    if (!newRule.industry || !newRule.rule) return;
    if (editingRule !== null) setIndustryRules(prev => prev.map((r, i) => i === editingRule ? { ...newRule } : r));
    else setIndustryRules(prev => [...prev, { ...newRule }]);
    setNewRule({ industry: "", rule: "", goodDays: [], badDays: [], goodHours: "", badHours: "", level: "normal" });
    setRuleEditorOpen(false); setEditingRule(null);
  };

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.navy, fontFamily: "'Noto Serif JP', serif" }}>業種別架電ルール管理</h2>
        {isAdmin && <button onClick={() => { setRuleEditorOpen(!ruleEditorOpen); setEditingRule(null); setNewRule({ industry: "", rule: "", goodDays: [], badDays: [], goodHours: "", badHours: "", level: "normal" }); }} style={{
          padding: "8px 20px", borderRadius: 8,
          background: ruleEditorOpen ? C.white : "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")",
          border: ruleEditorOpen ? "1px solid " + C.border : "none",
          color: ruleEditorOpen ? C.textDark : C.white, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'Noto Sans JP'",
        }}>{ruleEditorOpen ? "✕ 閉じる" : "＋ ルールを追加"}</button>}
      </div>

      {ruleEditorOpen && (
        <div style={{ background: C.white, border: "1px solid " + C.gold + "40", borderRadius: 12, padding: 24, marginBottom: 24, animation: "fadeIn 0.3s ease", borderLeft: "4px solid " + C.gold }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: C.navy }}>{editingRule !== null ? "ルールを編集" : "新しいルール"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>業種名 *</label>
              <input value={newRule.industry} onChange={e => setNewRule(p => ({ ...p, industry: e.target.value }))} style={inputStyle} placeholder="例: 不動産" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>レベル</label>
              <select value={newRule.level} onChange={e => setNewRule(p => ({ ...p, level: e.target.value }))} style={inputStyle}>
                <option value="excellent">優良</option><option value="normal">通常</option><option value="specific">特定時間のみ</option><option value="warning">注意が必要</option>
              </select>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>ルール説明 *</label>
              <input value={newRule.rule} onChange={e => setNewRule(p => ({ ...p, rule: e.target.value }))} style={inputStyle} placeholder="例: 水曜・日曜はつながりにくい" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 6, fontWeight: 600 }}>架電OK曜日</label>
              <div style={{ display: "flex", gap: 4 }}>
                {DAY_NAMES.map((d, i) => (
                  <button key={i} onClick={() => toggleDay(i, "goodDays")} style={{
                    width: 36, height: 32, borderRadius: 4, background: newRule.goodDays.includes(i) ? C.green + "20" : C.offWhite,
                    border: "1px solid " + (newRule.goodDays.includes(i) ? C.green : C.border),
                    color: newRule.goodDays.includes(i) ? C.green : C.textLight,
                    cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Noto Sans JP'",
                  }}>{d}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 6, fontWeight: 600 }}>架電NG曜日</label>
              <div style={{ display: "flex", gap: 4 }}>
                {DAY_NAMES.map((d, i) => (
                  <button key={i} onClick={() => toggleDay(i, "badDays")} style={{
                    width: 36, height: 32, borderRadius: 4, background: newRule.badDays.includes(i) ? C.red + "20" : C.offWhite,
                    border: "1px solid " + (newRule.badDays.includes(i) ? C.red : C.border),
                    color: newRule.badDays.includes(i) ? C.red : C.textLight,
                    cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Noto Sans JP'",
                  }}>{d}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>つながりやすい時間帯</label>
              <input value={newRule.goodHours} onChange={e => setNewRule(p => ({ ...p, goodHours: e.target.value }))} style={inputStyle} placeholder="例: 10:00〜12:00, 14:00〜17:00" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 4, fontWeight: 600 }}>つながりにくい時間帯</label>
              <input value={newRule.badHours} onChange={e => setNewRule(p => ({ ...p, badHours: e.target.value }))} style={inputStyle} placeholder="例: 12:00〜13:00" />
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <button onClick={handleSave} disabled={!newRule.industry || !newRule.rule} style={{
              padding: "10px 28px", borderRadius: 8, background: newRule.industry && newRule.rule ? C.navy : C.border,
              border: "none", color: C.white, cursor: newRule.industry && newRule.rule ? "pointer" : "not-allowed",
              fontSize: 13, fontWeight: 600, fontFamily: "'Noto Sans JP'",
            }}>{editingRule !== null ? "更新する" : "保存する"}</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {industryRules.map((rule, i) => (
          <div key={i} style={{
            background: C.white, border: "1px solid " + C.borderLight, borderRadius: 10, padding: "14px 18px",
            boxShadow: "0 1px 3px rgba(26,58,92,0.04)",
            animation: "slideIn 0.2s ease " + (i * 0.03) + "s both",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{rule.industry}</span>
                <Badge color={rule.level === "excellent" ? C.green : rule.level === "warning" ? C.orange : rule.level === "specific" ? C.goldDim : C.navyLight} glow>
                  {rule.level === "excellent" ? "優良" : rule.level === "warning" ? "注意" : rule.level === "specific" ? "特定時間" : "通常"}
                </Badge>
              </div>
              {isAdmin && <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { setNewRule({ ...rule }); setEditingRule(i); setRuleEditorOpen(true); }} style={{
                  padding: "4px 10px", borderRadius: 4, background: C.offWhite, border: "1px solid " + C.border,
                  color: C.textMid, cursor: "pointer", fontSize: 11, fontFamily: "'Noto Sans JP'",
                }}>編集</button>
                <button onClick={() => setIndustryRules(prev => prev.filter((_, idx) => idx !== i))} style={{
                  padding: "4px 10px", borderRadius: 4, background: C.redLight, border: "1px solid " + C.red + "25",
                  color: C.red, cursor: "pointer", fontSize: 11, fontFamily: "'Noto Sans JP'",
                }}>削除</button>
              </div>}
            </div>
            <div style={{ fontSize: 12, color: C.textMid, marginBottom: 8 }}>{rule.rule}</div>
            <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
              <div><span style={{ color: C.textLight }}>OK: </span><span style={{ color: C.green, fontWeight: 600 }}>{rule.goodDays.map(d => DAY_NAMES[d]).join("・") || "—"}</span></div>
              <div><span style={{ color: C.textLight }}>NG: </span><span style={{ color: C.red, fontWeight: 600 }}>{rule.badDays.map(d => DAY_NAMES[d]).join("・") || "—"}</span></div>
              {rule.goodHours && <div><span style={{ color: C.textLight }}>推奨: </span><span style={{ color: C.green }}>{rule.goodHours}</span></div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Calling Screen (Full-screen overlay)
// ============================================================
function CallingScreen({ listId, list, importedCSVs, setImportedCSVs, onClose, currentUser, liveStatuses, setLiveStatuses, members = [] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [pageStart, setPageStart] = useState(0);
  const [selectedRow, setSelectedRow] = useState(null);
  const [memo, setMemo] = useState("");
  const [currentRound, setCurrentRound] = useState(1);
  const [filterMode, setFilterMode] = useState("callable"); // "all", "callable", "excluded"
  const [listSortBy, setListSortBy] = useState(null);
  const [listSortDir, setListSortDir] = useState("asc");
  const [appoModal, setAppoModal] = useState(null); // { idx, row } when appointment selected
  const [recallModal, setRecallModal] = useState(null); // { idx, row, statusId } when recall selected
  const [editRound, setEditRound] = useState(1);
  useEffect(() => { setEditRound(currentRound); }, [currentRound]);
  const [showScript, setShowScript] = useState(false);
  const PAGE_SIZE = 30;
  const [sessionKey] = useState(() => "self_" + (currentUser || "unknown") + "_" + Date.now());
  const csvData = importedCSVs[listId] || [];

  // Range input
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [rangeConfirmed, setRangeConfirmed] = useState(false);

  const rangeStartNum = rangeConfirmed ? parseInt(rangeStart) || 1 : null;
  const rangeEndNum = rangeConfirmed ? parseInt(rangeEnd) || csvData.length : null;

  // Sync live status on mount, row change, round change
  const updateLiveStatus = useCallback((extra) => {
    if (!setLiveStatuses || !currentUser) return;
    const calledCount = csvData.filter(r => r.rounds && r.rounds[currentRound]).length;
    const totalCallable = csvData.filter(r => !r._excluded).length;
    setLiveStatuses(prev => ({
      ...prev,
      [sessionKey]: {
        active: true,
        user: currentUser,
        listName: list ? list.client + " / " + (list.industry || "") : listId,
        listId,
        round: currentRound,
        calledCount,
        totalCallable,
        selectedRow: selectedRow !== null ? selectedRow + 1 : null,
        rangeStart: rangeStartNum,
        rangeEnd: rangeEndNum,
        startedAt: (prev[sessionKey] && prev[sessionKey].startedAt) || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...(extra || {}),
      }
    }));
  }, [currentUser, listId, list, currentRound, selectedRow, csvData.length, setLiveStatuses, sessionKey, rangeStartNum, rangeEndNum]);

  useEffect(() => { updateLiveStatus(); }, [currentRound, selectedRow]);

  const handleClose = () => {
    if (setLiveStatuses) {
      setLiveStatuses(prev => prev[sessionKey] ? { ...prev, [sessionKey]: { ...prev[sessionKey], active: false, finishedAt: new Date().toISOString() } } : prev);
    }
    onClose();
  };

  // Status definitions
  const STATUSES = [
    { id: "normal", label: "不通", desc: "電話がつながらなかった", color: C.navy, bg: C.navy + "08", excluded: false },
    { id: "excluded", label: "除外", desc: "廃止番号・着信拒否・クレーム等", color: "#e53835", bg: "#e5383510", excluded: true },
    { id: "absent", label: "社長不在", desc: "社長が外出中", color: C.gold, bg: C.gold + "10", excluded: false },
    { id: "reception_block", label: "受付ブロック", desc: "受付に断られた", color: C.navy, bg: C.navy + "08", excluded: false },
    { id: "reception_recall", label: "受付再コール", desc: "時間を置いて再度", color: C.gold, bg: C.gold + "10", excluded: false },
    { id: "ceo_recall", label: "社長再コール", desc: "社長から再度依頼", color: C.gold, bg: C.gold + "10", excluded: false },
    { id: "appointment", label: "アポ獲得", desc: "アポイント獲得！", color: C.gold, bg: C.gold + "10", excluded: true },
    { id: "ceo_decline", label: "社長お断り", desc: "社長本人に断られた", color: C.navy, bg: C.navy + "08", excluded: false },
  ];

  // Legacy status migration: map old IDs to new
  const LEGACY_MAP = { rejected: "excluded", discontinued: "excluded", reception_claim: "excluded", ceo_claim: "excluded" };

  const EXCLUDED_IDS = STATUSES.filter(s => s.excluded).map(s => s.id);
  // IDs hidden from callable view
  const HIDDEN_FROM_CALLABLE = ["excluded", "reception_recall", "ceo_recall", "appointment"];

  const getStatusDef = (id) => STATUSES.find(s => s.id === (LEGACY_MAP[id] || id)) || STATUSES[0];

  // Check if row is permanently excluded
  const isExcluded = (row) => {
    if (!row.rounds) return false;
    return Object.values(row.rounds).some(r => EXCLUDED_IDS.includes(r.status));
  };

  // Get current round status for a row
  const getRoundStatus = (row, round) => {
    if (!row.rounds || !row.rounds[round]) return null;
    return row.rounds[round];
  };

  // Check if row is callable: show everything EXCEPT excluded/recall/appointment
  const isCallable = (row) => {
    if (!row.rounds) return true;
    const latestRound = Math.max(...Object.keys(row.rounds).map(Number));
    const latestStatus = row.rounds[latestRound]?.status;
    if (latestStatus && HIDDEN_FROM_CALLABLE.includes(latestStatus)) return false;
    return true;
  };

  const markStatus = (idx, statusId, extraData) => {
    setImportedCSVs(prev => {
      const updated = [...(prev[listId] || [])];
      const row = { ...updated[idx] };
      if (!row.rounds) row.rounds = {};
      row.rounds = { ...row.rounds, [currentRound]: { status: statusId, memo: memo, timestamp: new Date().toISOString(), caller: currentUser || "", ...extraData } };
      // Keep legacy fields for compatibility
      row.called = true;
      row.result = getStatusDef(statusId).label;
      updated[idx] = row;
      return { ...prev, [listId]: updated };
    });
    // Auto-advance to next callable
    const next = csvData.findIndex((r, i) => i > idx && isCallable(r));
    if (next >= 0) { setSelectedRow(next); setMemo(""); }
    // Update live status after marking
    setTimeout(() => updateLiveStatus(), 100);
  };

  const saveMemo = (idx, memoText) => {
    setImportedCSVs(prev => {
      const updated = [...(prev[listId] || [])];
      updated[idx] = { ...updated[idx], memo: memoText };
      return { ...prev, [listId]: updated };
    });
  };

  const undoStatus = (idx, round) => {
    setImportedCSVs(prev => {
      const updated = [...(prev[listId] || [])];
      const row = { ...updated[idx] };
      if (row.rounds) {
        const newRounds = { ...row.rounds };
        delete newRounds[round];
        row.rounds = newRounds;
        // Update legacy fields
        const remaining = Object.values(newRounds);
        row.called = remaining.length > 0;
        row.result = remaining.length > 0 ? getStatusDef(remaining[remaining.length - 1].status).label : "";
      }
      updated[idx] = row;
      return { ...prev, [listId]: updated };
    });
  };

  // Filtered list
  // Helper: get last call datetime for a row
  const getLastCallDate = (row) => {
    let latest = "";
    for (let w = 5; w >= 1; w--) {
      const rd = getRoundStatus(row, w);
      if (rd && rd.timestamp) {
        if (rd.timestamp > latest) latest = rd.timestamp;
      }
    }
    return latest;
  };

  const filtered = csvData.filter(r => {
    // Range filter
    if (rangeConfirmed && rangeStartNum && rangeEndNum) {
      const rowNo = r.no || 0;
      if (rowNo < rangeStartNum || rowNo > rangeEndNum) return false;
    }
    if (searchTerm && !(
      r.company.includes(searchTerm) ||
      r.representative.includes(searchTerm) ||
      r.phone.includes(searchTerm) ||
      String(r.no).includes(searchTerm)
    )) return false;
    if (filterMode === "callable") return isCallable(r);
    if (filterMode === "excluded") return isExcluded(r);
    return true;
  });

  const sorted = listSortBy ? [...filtered].sort((a, b) => {
    let va, vb;
    if (listSortBy === "no") { va = a.no || 0; vb = b.no || 0; }
    else if (listSortBy === "company") { va = a.company || ""; vb = b.company || ""; }
    else if (listSortBy === "business") { va = a.business || ""; vb = b.business || ""; }
    else if (listSortBy === "representative") { va = a.representative || ""; vb = b.representative || ""; }
    else if (listSortBy === "phone") { va = a.phone || ""; vb = b.phone || ""; }
    else if (listSortBy === "lastCall") { va = getLastCallDate(a); vb = getLastCallDate(b); }
    else { va = 0; vb = 0; }
    if (typeof va === "number") return listSortDir === "asc" ? va - vb : vb - va;
    return listSortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
  }) : filtered;

  const paged = sorted.slice(pageStart, pageStart + PAGE_SIZE);

  // Stats
  const totalCount = csvData.length;
  const excludedCount = csvData.filter(r => isExcluded(r)).length;
  const roundDoneCount = csvData.filter(r => getRoundStatus(r, currentRound) && !isExcluded(r)).length;
  const callableCount = csvData.filter(r => isCallable(r)).length;
  const appoCount = csvData.filter(r => {
    if (!r.rounds) return false;
    return Object.values(r.rounds).some(rd => rd.status === "appointment");
  }).length;

  // Max round used
  const maxRound = csvData.reduce((max, r) => {
    if (!r.rounds) return max;
    return Math.max(max, ...Object.keys(r.rounds).map(Number));
  }, 0);

  const activeRow = selectedRow !== null ? csvData[selectedRow] : null;
  const activeRoundData = activeRow ? getRoundStatus(activeRow, currentRound) : null;
  const activeExcluded = activeRow ? isExcluded(activeRow) : false;
  const activeExcludedRound = activeRow && activeRow.rounds ? Object.entries(activeRow.rounds).find(([_, v]) => EXCLUDED_IDS.includes(v.status)) : null;

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: C.offWhite, zIndex: 10000,
      display: "flex", flexDirection: "column",
      fontFamily: "'Noto Sans JP', sans-serif",
    }}>
      {/* Range Input Modal */}
      {csvData.length > 0 && !rangeConfirmed && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(26,58,92,0.6)", zIndex: 10001,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: C.white, borderRadius: 12, width: 400, overflow: "hidden",
            boxShadow: "0 20px 40px rgba(26,58,92,0.3)",
          }}>
            <div style={{
              background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")",
              padding: "16px 20px", color: C.white,
            }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>架電範囲の指定</div>
              <div style={{ fontSize: 11, color: C.goldLight, marginTop: 2 }}>
                {list?.company || ""} ─ {list?.industry || ""} （全{csvData.length}件）
              </div>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 12, color: C.textMid, marginBottom: 12 }}>
                架電する番号の範囲を入力してください
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 4, display: "block" }}>開始番号</label>
                  <input type="number" value={rangeStart} onChange={e => setRangeStart(e.target.value)}
                    placeholder="1" min={1} max={csvData.length}
                    style={{
                      width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid " + C.border,
                      fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono'", textAlign: "center",
                      color: C.navy, outline: "none",
                    }}
                  />
                </div>
                <span style={{ fontSize: 16, color: C.textLight, marginTop: 14 }}>〜</span>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 4, display: "block" }}>終了番号</label>
                  <input type="number" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)}
                    placeholder={String(csvData.length)} min={1} max={csvData.length}
                    style={{
                      width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid " + C.border,
                      fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono'", textAlign: "center",
                      color: C.navy, outline: "none",
                    }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setRangeStart("1"); setRangeEnd(String(csvData.length)); setRangeConfirmed(true); updateLiveStatus(); }} style={{
                  flex: 1, padding: "10px", borderRadius: 6, border: "1px solid " + C.borderLight,
                  background: C.offWhite, cursor: "pointer", fontSize: 12, fontWeight: 600,
                  color: C.textMid, fontFamily: "'Noto Sans JP'",
                }}>全件かける</button>
                <button onClick={() => { if (!rangeStart) setRangeStart("1"); if (!rangeEnd) setRangeEnd(String(csvData.length)); setRangeConfirmed(true); updateLiveStatus(); }} style={{
                  flex: 1, padding: "10px", borderRadius: 6, border: "none",
                  background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")",
                  cursor: "pointer", fontSize: 12, fontWeight: 700,
                  color: C.white, fontFamily: "'Noto Sans JP'",
                }}>この範囲で開始</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")",
        padding: "8px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 18 }}>📞</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{list.company}</div>
            <div style={{ fontSize: 10, color: C.goldLight }}>{list.industry}　担当: {list.manager}{rangeConfirmed && rangeStartNum && rangeEndNum ? "　📋 No." + rangeStartNum + " 〜 " + rangeEndNum : ""}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Stats */}
          <div style={{ display: "flex", gap: 10 }}>
            {[
              { label: "総数", val: totalCount, color: C.white },
              { label: "架電可能", val: callableCount, color: C.goldLight },
              { label: currentRound + "周目済", val: roundDoneCount, color: "#90EE90" },
              { label: "除外", val: excludedCount, color: "#ff9999" },
              { label: "アポ", val: appoCount, color: C.green },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 8, color: C.goldLight + "90", letterSpacing: 0.3 }}>{s.label}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: s.color, fontFamily: "'JetBrains Mono'" }}>{s.val}</div>
              </div>
            ))}
          </div>
          {/* Progress */}
          <div style={{ width: 100 }}>
            <div style={{ height: 5, background: C.white + "20", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: ((roundDoneCount + excludedCount) / Math.max(totalCount, 1) * 100) + "%", background: "linear-gradient(90deg, " + C.gold + ", " + C.green + ")", borderRadius: 3, transition: "width 0.3s" }} />
            </div>
            <div style={{ fontSize: 8, color: C.goldLight, textAlign: "right", marginTop: 1 }}>{Math.round((roundDoneCount + excludedCount) / Math.max(totalCount, 1) * 100)}%</div>
          </div>
          <button onClick={handleClose} style={{
            padding: "5px 14px", borderRadius: 6, background: C.white + "15",
            border: "1px solid " + C.white + "30", color: C.white, cursor: "pointer",
            fontSize: 11, fontWeight: 600, fontFamily: "'Noto Sans JP'",
          }}>✕ 終了</button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left: List */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: "1px solid " + C.borderLight }}>
          {/* Search + filter */}
          <div style={{ padding: "6px 12px", background: C.white, borderBottom: "1px solid " + C.borderLight, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="text" placeholder="番号・企業名・代表者で検索..." value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setPageStart(0); }}
              style={{ flex: 1, padding: "5px 10px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none" }} />
            {["callable", "all", "excluded"].map(m => (
              <button key={m} onClick={() => { setFilterMode(m); setPageStart(0); }} style={{
                padding: "4px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600,
                border: "1px solid " + (filterMode === m ? C.navy : C.border),
                background: filterMode === m ? C.navy + "10" : C.white,
                color: filterMode === m ? C.navy : C.textLight, cursor: "pointer",
              }}>{m === "callable" ? "架電可能" : m === "all" ? "全件" : "除外"}</button>
            ))}
            <span style={{ fontSize: 9, color: C.textLight, whiteSpace: "nowrap" }}>
              {filtered.length}件
            </span>
          </div>

          {/* Table header */}
          <div style={{
            display: "grid", gridTemplateColumns: "32px 1.4fr 0.6fr 0.6fr 85px 68px repeat(5, 46px)",
            padding: "5px 10px", background: C.navyDeep, flexShrink: 0,
            fontSize: 9, fontWeight: 600, color: C.goldLight, letterSpacing: 0.5,
          }}>
            {[["no","No"],["company","企業名"],["business","事業内容"],["representative","代表者"],["phone","電話番号"],["lastCall","最終発信"]].map(([key, label]) => (
              <span key={key} onClick={() => { if (listSortBy === key) { setListSortBy(null); setListSortDir("asc"); } else { setListSortBy(key); setListSortDir("desc"); } setPageStart(0); }} style={{ cursor: "pointer", userSelect: "none" }}>
                {label}{listSortBy === key ? " ▲" : " ▽"}
              </span>
            ))}
            {[1,2,3,4,5].map(w => <span key={w} style={{ textAlign: "center", color: w === currentRound ? C.gold : C.goldLight + "80" }}>{w}周</span>)}
          </div>

          {/* Table body */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {paged.map((row) => {
              const globalIdx = csvData.findIndex(r => r.no === row.no);
              const isSelected = selectedRow === globalIdx;
              const excluded = isExcluded(row);
              const roundData = getRoundStatus(row, currentRound);
              const statusDef = roundData ? getStatusDef(roundData.status) : null;

              return (
                <div key={row.no} onClick={() => { setSelectedRow(globalIdx); setMemo(csvData[globalIdx]?.memo || ""); }}
                  style={{
                    display: "grid", gridTemplateColumns: "32px 1.4fr 0.6fr 0.6fr 85px 68px repeat(5, 46px)",
                    padding: "6px 10px", fontSize: 11, alignItems: "center", cursor: "pointer",
                    borderBottom: "1px solid " + C.borderLight,
                    background: isSelected ? C.gold + "12" : excluded ? "#fee2e2" + "40" : roundData ? C.offWhite : C.white,
                    borderLeft: isSelected ? "3px solid " + C.gold : "3px solid transparent",
                    opacity: excluded ? 0.5 : 1,
                    transition: "all 0.1s",
                  }}>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.textLight }}>{row.no}</span>
                  <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.company}</span>
                  <span style={{ color: C.textLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10 }}>{row.business}</span>
                  <span style={{ color: C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.representative}</span>
                  <span>
                    {row.phone && !excluded ? (
                      <span onClick={e => { e.stopPropagation(); dialPhone(row.phone); setSelectedRow(globalIdx); setMemo(csvData[globalIdx]?.memo || ""); }} style={{
                        color: C.navy, fontWeight: 600, fontSize: 10,
                        fontFamily: "'JetBrains Mono'",
                        padding: "2px 5px", borderRadius: 4, cursor: "pointer",
                        background: C.gold + "15",
                        border: "1px solid " + C.gold + "30",
                      }}>{row.phone}</span>
                    ) : (
                      <span style={{ fontSize: 10, color: C.textLight, fontFamily: "'JetBrains Mono'" }}>{row.phone || "-"}</span>
                    )}
                  </span>
                  <span style={{ fontSize: 9, color: C.textLight, fontFamily: "'JetBrains Mono'", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {(() => { const lcd = getLastCallDate(row); return lcd ? lcd.replace(/T/, " ").slice(5, 16) : "-"; })()}
                  </span>
                  {[1,2,3,4,5].map(w => {
                    const wd = getRoundStatus(row, w);
                    const wsd = wd ? getStatusDef(wd.status) : null;
                    return (
                      <span key={w} style={{ textAlign: "center" }} title={wd?.caller ? "担当: " + wd.caller : ""}>
                        {excluded && EXCLUDED_IDS.includes(wd?.status) ? (
                          <span style={{ fontSize: 7, padding: "1px 3px", borderRadius: 3, background: "#e5383510", color: "#e53835", fontWeight: 600 }}>除外</span>
                        ) : wsd ? (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
                            <span style={{ fontSize: 7, padding: "1px 3px", borderRadius: 3, background: wsd.bg, color: wsd.color, fontWeight: 600 }}>{wsd.label}</span>
                            {wd.caller && <span style={{ fontSize: 6, color: C.textLight, lineHeight: 1, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 48 }}>{wd.caller}</span>}
                          </div>
                        ) : (
                          <span style={{ fontSize: 8, color: C.textLight + "60" }}>-</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {filtered.length > PAGE_SIZE && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "5px 0", background: C.white, borderTop: "1px solid " + C.borderLight, flexShrink: 0 }}>
              <button disabled={pageStart === 0} onClick={() => setPageStart(Math.max(0, pageStart - PAGE_SIZE))} style={{
                padding: "3px 14px", borderRadius: 4, border: "1px solid " + C.border,
                background: pageStart === 0 ? C.offWhite : C.white, cursor: pageStart === 0 ? "default" : "pointer",
                fontSize: 11, color: C.textMid,
              }}>← 前</button>
              <button disabled={pageStart + PAGE_SIZE >= filtered.length} onClick={() => setPageStart(pageStart + PAGE_SIZE)} style={{
                padding: "3px 14px", borderRadius: 4, border: "1px solid " + C.border,
                background: pageStart + PAGE_SIZE >= filtered.length ? C.offWhite : C.white,
                cursor: pageStart + PAGE_SIZE >= filtered.length ? "default" : "pointer",
                fontSize: 11, color: C.textMid,
              }}>次 →</button>
            </div>
          )}
        </div>

        {/* Right: Detail panel */}
        <div style={{ width: 400, display: "flex", flexDirection: "column", background: C.white, overflow: "hidden" }}>
          {activeRow ? (
            <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
              {/* Selected company info */}
              <div style={{ marginBottom: 12, padding: "10px 12px", background: C.offWhite, borderRadius: 8, border: "1px solid " + C.borderLight }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, marginBottom: 4 }}>{activeRow.company}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, fontSize: 11 }}>
                  <div><span style={{ color: C.textLight }}>代表者: </span><span style={{ fontWeight: 500 }}>{activeRow.representative}</span></div>
                  <div><span style={{ color: C.textLight }}>業種: </span><span>{activeRow.business}</span></div>
                  <div style={{ gridColumn: "span 2" }}><span style={{ color: C.textLight }}>住所: </span><span style={{ fontSize: 10 }}>{activeRow.address}</span></div>
                </div>
                {activeRow.phone && !activeExcluded && (
                  <div style={{ marginTop: 8 }}>
                    <span onClick={() => dialPhone(activeRow.phone)} style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "8px 20px", borderRadius: 6, cursor: "pointer",
                      background: "linear-gradient(135deg, " + C.green + ", #2d8a4e)",
                      color: C.white,
                      fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono'",
                      boxShadow: "0 2px 8px " + C.green + "40",
                    }}>📞 {activeRow.phone}</span>
                  </div>
                )}
              </div>

              {/* Excluded notice */}
              {activeExcluded && activeExcludedRound && (
                <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 6, background: C.navy + "08", border: "1px solid " + C.navy + "20" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 2 }}>⛔ 架電除外</div>
                      <div style={{ fontSize: 10, color: C.textMid }}>
                        {activeExcludedRound[0]}周目で「{getStatusDef(activeExcludedRound[1].status).label}」のため除外
                        {activeExcludedRound[1].memo && <span>（メモ: {activeExcludedRound[1].memo}）</span>}
                      </div>
                    </div>
                    <button onClick={() => undoStatus(selectedRow, Number(activeExcludedRound[0]))} style={{
                      padding: "4px 10px", borderRadius: 4, border: "1px solid " + C.navy + "30",
                      background: C.white, cursor: "pointer", fontSize: 9, fontWeight: 600,
                      color: C.navy, fontFamily: "'Noto Sans JP'", whiteSpace: "nowrap",
                    }}>取り消す</button>
                  </div>
                </div>
              )}

              {/* Status buttons for current round */}
              {!activeExcluded && (() => {
                const editRoundData = getRoundStatus(activeRow, editRound);
                const editStatusDef = editRoundData ? getStatusDef(editRoundData.status) : null;
                return (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", gap: 2, marginBottom: 6 }}>
                      {[1,2,3,4,5].map(w => {
                        const wd = getRoundStatus(activeRow, w);
                        const wsd = wd ? getStatusDef(wd.status) : null;
                        return (
                          <button key={w} onClick={() => setEditRound(w)} style={{
                            flex: 1, padding: "4px 0", borderRadius: 4, fontSize: 9, fontWeight: 700,
                            cursor: "pointer", fontFamily: "'Noto Sans JP'", transition: "all 0.15s",
                            border: editRound === w ? "1px solid " + C.gold : "1px solid " + C.borderLight,
                            background: editRound === w ? C.gold + "15" : wsd ? wsd.bg : C.white,
                            color: editRound === w ? C.navy : wsd ? wsd.color : C.textLight,
                          }}>
                            {w}周{wsd ? " ✓" : ""}
                          </button>
                        );
                      })}
                    </div>
                    {editRoundData ? (
                      <div style={{ padding: "8px 12px", borderRadius: 6, background: editStatusDef.bg, border: "1px solid " + editStatusDef.color + "20" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: editStatusDef.color }}>{editRound}周目: {editStatusDef.label}</div>
                            {editRoundData.caller && <div style={{ fontSize: 9, color: C.textLight, marginTop: 1 }}>架電者: {editRoundData.caller}</div>}
                            {editRoundData.memo && <div style={{ fontSize: 10, color: C.textMid, marginTop: 2 }}>メモ: {editRoundData.memo}</div>}
                          </div>
                          <button onClick={() => undoStatus(selectedRow, editRound)} style={{
                            padding: "4px 10px", borderRadius: 4, border: "1px solid " + C.navy + "30",
                            background: C.white, cursor: "pointer", fontSize: 9, fontWeight: 600,
                            color: C.navy, fontFamily: "'Noto Sans JP'", whiteSpace: "nowrap",
                          }}>取り消す</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 6 }}>{editRound}周目 架電結果を記録</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                          {STATUSES.map(s => (
                            <button key={s.id} onClick={() => {
                              if (memo) saveMemo(selectedRow, memo);
                              const prevRound = currentRound;
                              // Temporarily set currentRound for markStatus to use correct round
                              if (s.id === "appointment") {
                                setAppoModal({ idx: selectedRow, row: csvData[selectedRow], round: editRound });
                              } else if (s.id === "reception_recall" || s.id === "ceo_recall") {
                                setRecallModal({ idx: selectedRow, row: csvData[selectedRow], statusId: s.id, round: editRound });
                              } else {
                                // Mark status for specific round
                                setImportedCSVs(prev => {
                                  const updated = [...(prev[listId] || [])];
                                  const row = { ...updated[selectedRow] };
                                  if (!row.rounds) row.rounds = {};
                                  row.rounds = { ...row.rounds, [editRound]: { status: s.id, memo: memo, timestamp: new Date().toISOString(), caller: currentUser || "" } };
                                  row.called = true;
                                  row.result = getStatusDef(s.id).label;
                                  updated[selectedRow] = row;
                                  return { ...prev, [listId]: updated };
                                });
                              }
                            }} style={{
                              padding: "7px 6px", borderRadius: 6,
                              background: s.bg, border: "1px solid " + s.color + "30",
                              cursor: "pointer", textAlign: "left",
                              fontFamily: "'Noto Sans JP'",
                            }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: s.color }}>{s.label}</div>
                              <div style={{ fontSize: 8, color: s.color + "90" }}>{s.desc}</div>
                              {s.excluded && <div style={{ fontSize: 7, color: "#e53e3e", marginTop: 1 }}>※ 以降架電除外</div>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Round history */}
              {activeRow.rounds && Object.keys(activeRow.rounds).length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 4 }}>架電履歴</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {Object.entries(activeRow.rounds).sort(([a],[b]) => Number(a) - Number(b)).map(([round, data]) => {
                      const sd = getStatusDef(data.status);
                      return (
                        <div key={round} style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "4px 8px", borderRadius: 4,
                          background: Number(round) === currentRound ? sd.bg : C.offWhite,
                          border: "1px solid " + (Number(round) === currentRound ? sd.color + "20" : "transparent"),
                        }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: C.navy, fontFamily: "'JetBrains Mono'", minWidth: 36 }}>{round}周目</span>
                          <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: sd.bg, color: sd.color, fontWeight: 600 }}>{sd.label}</span>
                          {data.memo && <span style={{ fontSize: 9, color: C.textLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{data.memo}</span>}
                          <button onClick={() => undoStatus(selectedRow, Number(round))} style={{
                            padding: "1px 6px", borderRadius: 3, border: "1px solid " + C.border,
                            background: C.white, cursor: "pointer", fontSize: 8, color: C.textLight,
                            fontFamily: "'Noto Sans JP'", marginLeft: "auto", flexShrink: 0,
                          }}>取消</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Memo */}
              {!activeExcluded && !activeRoundData && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 4 }}>メモ</div>
                  <textarea value={memo} onChange={e => setMemo(e.target.value)}
                    onBlur={() => saveMemo(selectedRow, memo)}
                    placeholder="架電時のメモをここに記入..."
                    style={{
                      width: "100%", minHeight: 60, padding: "6px 10px", borderRadius: 6,
                      border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'",
                      outline: "none", resize: "vertical", background: C.offWhite,
                    }} />
                </div>
              )}

              {/* Script & Notes from list */}
              {(list.scriptBody || list.companyInfo || list.cautions) && (
                <div style={{ borderTop: "1px solid " + C.borderLight, paddingTop: 10 }}>
                  {list.companyInfo && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.navy, marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>🏢 企業概要</div>
                      <div style={{ fontSize: 11, color: C.textMid, lineHeight: 1.6, padding: "6px 10px", background: C.offWhite, borderRadius: 6, whiteSpace: "pre-wrap" }}>{list.companyInfo}</div>
                    </div>
                  )}
                  {list.scriptBody && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.navy, marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>📝 スクリプト</div>
                      <div style={{ fontSize: 11, color: C.textMid, lineHeight: 1.6, padding: "6px 10px", background: C.gold + "08", borderRadius: 6, border: "1px solid " + C.gold + "20", whiteSpace: "pre-wrap" }}>{list.scriptBody}</div>
                    </div>
                  )}
                  {list.cautions && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.red, marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>⚠ 注意事項</div>
                      <div style={{ fontSize: 11, color: C.textMid, lineHeight: 1.6, padding: "6px 10px", background: C.red + "06", borderRadius: 6, border: "1px solid " + C.red + "15", whiteSpace: "pre-wrap" }}>{list.cautions}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 32 }}>👈</span>
              <span style={{ fontSize: 12, color: C.textLight }}>左のリストから企業を選択してください</span>
            </div>
          )}
        </div>
      </div>

      {/* Appointment Report Modal */}
      {appoModal && <AppoReportModal
        row={appoModal.row}
        list={list}
        currentUser={currentUser}
        members={members}
        onClose={() => setAppoModal(null)}
        onSave={(formData) => {
          markStatus(appoModal.idx, "appointment", { appoReport: formData.note });
        }}
        onDone={() => setAppoModal(null)}
      />}

      {/* Recall Modal */}
      {recallModal && <RecallModal
        row={recallModal.row}
        statusId={recallModal.statusId}
        onSubmit={(recallData) => {
          markStatus(recallModal.idx, recallModal.statusId, { recall: recallData });
          setRecallModal(null);
        }}
        onCancel={() => setRecallModal(null)}
      />}
    </div>
  );
}

// ============================================================
// Recall Modal
// ============================================================
function RecallModal({ row, statusId, onSubmit, onCancel, members = [] }) {
  // membersは文字列配列またはオブジェクト配列のどちらでも受け付ける
  const memberNames = members.map(m => typeof m === 'string' ? m : (m?.name || ''));
  const [form, setForm] = useState({
    recallDate: "",
    recallTime: "",
    assignee: "",
    note: "",
  });
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const u = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const inputStyle = {
    width: "100%", padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.border,
    fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", background: C.offWhite,
  };
  const labelStyle = { fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 2, display: "block" };

  const handleAssigneeChange = (v) => {
    u("assignee", v);
    const filtered = v ? memberNames.filter(m => m.includes(v)) : memberNames;
    setSuggestions(filtered);
    setShowSuggestions(filtered.length > 0);
  };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: C.white, borderRadius: 12, width: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
        <div style={{ padding: "14px 20px", background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")", borderRadius: "12px 12px 0 0", color: C.white }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>📞 再コール設定</div>
          <div style={{ fontSize: 11, color: C.goldLight }}>{row.company}　{statusId === "ceo_recall" ? "（社長再コール）" : "（受付再コール）"}</div>
        </div>
        <div style={{ padding: "16px 20px" }}>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={labelStyle}>再コール日</label>
                <input type="date" value={form.recallDate} onChange={e => u("recallDate", e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>時間</label>
                <input type="time" value={form.recallTime} onChange={e => u("recallTime", e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div style={{ position: "relative" }}>
              <label style={labelStyle}>再コール担当者</label>
              <input
                value={form.assignee}
                onChange={e => handleAssigneeChange(e.target.value)}
                onFocus={() => { const f = form.assignee ? memberNames.filter(m => m.includes(form.assignee)) : memberNames; setSuggestions(f); setShowSuggestions(f.length > 0); }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                style={inputStyle}
                placeholder="架電担当者名"
              />
              {showSuggestions && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.white, border: "1px solid " + C.border, borderRadius: 4, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", zIndex: 100, maxHeight: 160, overflowY: "auto" }}>
                  {suggestions.map((m, i) => (
                    <div key={i} onMouseDown={() => { u("assignee", m); setShowSuggestions(false); }}
                      style={{ padding: "6px 10px", fontSize: 11, cursor: "pointer", color: C.textDark, fontFamily: "'Noto Sans JP'" }}
                      onMouseEnter={e => e.currentTarget.style.background = C.offWhite}
                      onMouseLeave={e => e.currentTarget.style.background = C.white}
                    >{m}</div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label style={labelStyle}>メモ</label>
              <textarea value={form.note} onChange={e => u("note", e.target.value)} style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} placeholder="先方から伝えられたこと等" />
            </div>
          </div>
        </div>
        <div style={{ padding: "10px 20px", borderTop: "1px solid " + C.borderLight, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{
            padding: "8px 20px", borderRadius: 6, border: "1px solid " + C.border,
            background: C.white, cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.textMid, fontFamily: "'Noto Sans JP'",
          }}>キャンセル</button>
          <button onClick={() => onSubmit(form)} style={{
            padding: "8px 24px", borderRadius: 6, border: "none",
            background: "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")",
            cursor: "pointer", fontSize: 11, fontWeight: 700, color: C.white, fontFamily: "'Noto Sans JP'",
          }}>保存</button>
        </div>
      </div>
    </div>
  );
}


// ============================================================
// CSV Phone List (Import + Zoom Phone)
// ============================================================
function CSVPhoneList({ listId, list, importedCSVs, setImportedCSVs, setCallingScreen, setCallFlowScreen }) {
  const [expanded, setExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [pageStart, setPageStart] = useState(0);
  const [flowStartNo, setFlowStartNo] = useState('');
  const [flowEndNo, setFlowEndNo] = useState('');
  const PAGE_SIZE = 20;
  const csvData = importedCSVs[listId] || [];

  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return;

      // ── ヘッダー正規化（全角→半角、括弧統一、trim）──────────────
      const normalizeHeader = (s) => s
        .replace(/^\uFEFF/, '')
        .trim()
        .replace(/\u3000/g, ' ')
        .replace(/（/g, '(').replace(/）/g, ')')
        .replace(/．/g, '.').replace(/／/g, '/')
        .replace(/[Ａ-Ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(/[ａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

      // ── CSV行パース（ダブルクォート・カンマ対応）──────────────────
      const parseCSVLine = (line) => {
        const result = []; let cur = ''; let inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (!inQ) { inQ = true; }
            else if (line[i + 1] === '"') { cur += '"'; i++; }
            else { inQ = false; }
          } else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
          else { cur += ch; }
        }
        result.push(cur.trim());
        return result;
      };

      const rawHeaders = parseCSVLine(lines[0]).map(normalizeHeader);

      // ── 単位検出（売上高・純利益用）─────────────────────────────
      const detectUnit = (h) => {
        if (h.includes('(億円)')) return '億円';
        if (h.includes('(百万円)')) return '百万円';
        if (h.includes('(千円)')) return '千円';
        if (h.includes('(円)')) return '円';
        return '千円'; // 単位なし → 千円とみなす
      };

      // ── 千円単位に統一変換 ────────────────────────────────────
      const toSenEn = (val, unit) => {
        const n = parseFloat(String(val).replace(/,/g, '').replace(/[^\d.-]/g, ''));
        if (isNaN(n)) return null;
        if (unit === '円') return Math.floor(n / 1000);
        if (unit === '百万円') return Math.floor(n * 1000);
        if (unit === '億円') return Math.floor(n * 100000);
        return Math.floor(n); // 千円（デフォルト）
      };

      // ── 汎用数値パース（カンマ・全角数字対応）────────────────────
      const parseNum = (val) => {
        if (!val && val !== 0) return null;
        const n = parseFloat(String(val).replace(/,/g, '').replace(/[^\d.-]/g, ''));
        return isNaN(n) ? null : n;
      };

      // ── ヘッダー名 → DBカラム名マッピング ────────────────────────
      const getField = (h) => {
        const base = h.replace(/\(.*?\)/g, '').trim(); // 単位括弧を除去した基本名
        // No
        if (/^(No\.|NO|no|No|番号)$/.test(h)) return 'no';
        // 企業名
        if (base === '企業名' || base === '会社名' || base === '社名') return 'company';
        // 事業内容
        if (base === '事業内容' || base === '事業概要' || base === '業種' || base === '業態') return 'business';
        // 代表者
        if (base === '代表者名' || base === '代表者' || base === '代表') return 'representative';
        // 電話番号
        if (base === '電話番号' || base === '電話' || base.toUpperCase() === 'TEL') return 'phone';
        // 住所（単体）
        if (base === '住所' || base === '所在地') return 'address';
        // 住所分割列
        if (base === '都道府県') return 'pref';
        if (base === '市区町村' || base === '市町村' || base === '区市町村') return 'city';
        if (base === '番地' || base === '番地以降' || base === '番地・号' || base === '丁目番地') return 'ward';
        // 売上高
        if (base === '売上高' || base === '売上') return 'revenue';
        // 当期純利益
        if (base === '当期純利益' || base === '純利益') return 'net_income';
        // 備考・メモ
        if (base === '備考' || base === 'メモ' || base === '注記') return 'memo_text';
        // 従業員数
        if (base === '従業員数' || base === '社員数' || base === '従業員') return 'employees';
        // URL・HP
        if (base === 'URL' || base === 'url' || base === 'HP' || base.includes('ホームページ')) return 'url';
        // 代表者年齢
        if (base === '代表者年齢' || base === '年齢') return 'age';
        return null; // 未知 → memoにJSON追記
      };

      // フィールドインデックスマップを構築
      const fieldIndices = {}; // field -> { idx, unit? }
      const unknownCols = []; // { idx, header } — memoに追記する未知列
      rawHeaders.forEach((h, idx) => {
        const field = getField(h);
        if (field) {
          if (!fieldIndices[field]) { // 最初にマッチした列を使用
            const unit = (field === 'revenue' || field === 'net_income') ? detectUnit(h) : null;
            fieldIndices[field] = { idx, unit };
          }
        } else {
          unknownCols.push({ idx, header: h });
        }
      });

      const revenueUnit = fieldIndices.revenue?.unit || '千円';
      const netIncomeUnit = fieldIndices.net_income?.unit || '千円';

      // ── 行データのパース ──────────────────────────────────────
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length < 2 || cols.every(c => !c)) continue;

        const get = (field) => {
          const fi = fieldIndices[field];
          return fi ? ((cols[fi.idx] || '').trim()) : '';
        };

        // ── 住所結合ロジック ──────────────────────────────────
        const addrRaw = get('address');
        const prefVal = get('pref');
        const cityVal = get('city');
        const wardVal = get('ward');
        let address = '';
        if (addrRaw) {
          // address列がある: prefが重複しないよう先頭に結合
          address = (prefVal && !addrRaw.startsWith(prefVal))
            ? prefVal + addrRaw
            : addrRaw;
        } else {
          // address列がない: pref + city + ward を連結
          address = prefVal + cityVal + wardVal;
        }
        address = address.replace(/\/\s*$/, ''); // 末尾の/を削除

        // ── memo JSON構築（備考・年齢・未知列）────────────────
        const extraInfo = {};
        const memoText = get('memo_text');
        if (memoText) extraInfo.biko = memoText;
        const ageVal = get('age');
        if (ageVal) extraInfo.age = ageVal;
        unknownCols.forEach(({ idx, header }) => {
          const v = (cols[idx] || '').trim();
          if (v) extraInfo[header] = v;
        });

        // フォーミュラインジェクション対策: =,+,-,@,タブ,改行で始まる文字列の先頭にシングルクォートを付加
        const sanitizeCSV = (v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : v);
        // 電話番号正規化: 数字のみ抽出 → 先頭0補完
        const normalizePhone = (v) => { const d = v.replace(/[^\d]/g, ''); return d ? (d.startsWith('0') ? d : '0' + d) : ''; };

        rows.push({
          no: rows.length + 1,
          company: sanitizeCSV(get('company') || ''),
          business: sanitizeCSV(get('business') || ''),
          address: sanitizeCSV(address),
          representative: sanitizeCSV(get('representative') || ''),
          phone: normalizePhone(get('phone') || ''),
          revenue: (() => { const v = get('revenue'); return v ? toSenEn(v, revenueUnit) : null; })(),
          net_income: (() => { const v = get('net_income'); return v ? toSenEn(v, netIncomeUnit) : null; })(),
          employees: (() => { const v = get('employees'); return v ? parseNum(v) : null; })(),
          url: get('url') || null,
          memo: Object.keys(extraInfo).length > 0 ? JSON.stringify(extraInfo) : null,
          called: false,
          result: '',
        });
      }

      if (list._supaId) {
        const { error } = await insertCallListItems(list._supaId, rows);
        if (error) { alert('CSV取込に失敗しました: ' + (error.message || '不明なエラー')); return; }
      }
      setImportedCSVs(prev => ({ ...prev, [listId]: rows }));
      setExpanded(true);
      setPageStart(0);
      setCallingScreen({ listId, list });
    };
    reader.readAsText(file, "UTF-8");
  };

  const markCalled = (idx, result) => {
    setImportedCSVs(prev => {
      const updated = [...(prev[listId] || [])];
      updated[idx] = { ...updated[idx], called: true, result };
      return { ...prev, [listId]: updated };
    });
  };

  const filtered = csvData.filter(r =>
    !searchTerm ||
    r.company.includes(searchTerm) ||
    r.representative.includes(searchTerm) ||
    r.phone.includes(searchTerm) ||
    String(r.no).includes(searchTerm)
  );

  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const calledCount = csvData.filter(r => r.called).length;

  return (
    <div style={{ marginBottom: 16 }}>
      <div onClick={() => csvData.length > 0 && setExpanded(!expanded)} style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        cursor: csvData.length > 0 ? "pointer" : "default",
        padding: "10px 14px", borderRadius: expanded ? "8px 8px 0 0" : 8,
        background: csvData.length > 0 ? (expanded ? "#f0f7f0" : C.offWhite) : C.offWhite,
        border: "1px solid " + (csvData.length > 0 ? C.green + "30" : C.borderLight),
        borderBottom: expanded ? "none" : undefined,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>📞</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>架電リスト</span>
          {csvData.length > 0 && (
            <span style={{ fontSize: 10, color: C.green, fontWeight: 600 }}>
              {csvData.length}件（架電済: {calledCount}）
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {setCallFlowScreen && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={e => e.stopPropagation()}>
              <span style={{ fontSize: 10, color: C.textMid, whiteSpace: "nowrap" }}>No.</span>
              <input type="number" value={flowStartNo} onChange={e => setFlowStartNo(e.target.value)} placeholder="開始"
                style={{ width: 52, padding: "3px 5px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 10, fontFamily: "'JetBrains Mono'", textAlign: "center", outline: "none" }} />
              <span style={{ fontSize: 10, color: C.textMid }}>〜</span>
              <input type="number" value={flowEndNo} onChange={e => setFlowEndNo(e.target.value)} placeholder="終了"
                style={{ width: 52, padding: "3px 5px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 10, fontFamily: "'JetBrains Mono'", textAlign: "center", outline: "none" }} />
              <button onClick={() => setCallFlowScreen({ list, startNo: flowStartNo ? parseInt(flowStartNo) : undefined, endNo: flowEndNo ? parseInt(flowEndNo) : undefined })} style={{
                padding: "4px 12px", borderRadius: 6,
                background: C.navy, color: C.white, cursor: "pointer",
                fontSize: 10, fontWeight: 600, fontFamily: "'Noto Sans JP'",
                border: "none",
              }}>架電開始</button>
            </div>
          )}
          {csvData.length > 0 && (
            <button onClick={() => setCallingScreen({ listId, list })} style={{
              padding: "4px 12px", borderRadius: 6,
              background: C.navy + 'cc', color: C.white, cursor: "pointer",
              fontSize: 10, fontWeight: 600, fontFamily: "'Noto Sans JP'",
              border: "none",
            }}>CSV架電</button>
          )}
          <label style={{
            padding: "4px 12px", borderRadius: 6,
            background: C.offWhite, color: C.navy, cursor: "pointer",
            fontSize: 10, fontWeight: 600, fontFamily: "'Noto Sans JP'",
            border: "1px solid " + C.border,
          }}>
            CSV取込
            <input type="file" accept=".csv" onChange={handleCSVImport} style={{ display: "none" }} />
          </label>
          {csvData.length > 0 && (
            <span style={{ fontSize: 11, color: C.textLight, transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>▼</span>
          )}
        </div>
      </div>

      {expanded && csvData.length > 0 && (
        <div style={{
          background: C.white, border: "1px solid " + C.green + "30",
          borderTop: "none", borderRadius: "0 0 8px 8px",
          padding: "10px 14px", animation: "fadeIn 0.2s ease",
        }}>
          {/* Search + pagination */}
          <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <input type="text" placeholder="番号・企業名・代表者で検索..." value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setPageStart(0); }}
              style={{ flex: 1, padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none" }} />
            <span style={{ fontSize: 10, color: C.textLight, whiteSpace: "nowrap" }}>
              {pageStart + 1}〜{Math.min(pageStart + PAGE_SIZE, filtered.length)} / {filtered.length}件
            </span>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <div style={{
              display: "grid", gridTemplateColumns: "40px 1.5fr 1fr 0.8fr 100px 60px",
              padding: "6px 8px", background: C.navyDeep, borderRadius: "4px 4px 0 0",
              fontSize: 9, fontWeight: 600, color: C.goldLight, letterSpacing: 0.5,
            }}>
              <span>No</span><span>企業名</span><span>事業内容</span><span>代表者</span><span>電話番号</span><span>状態</span>
            </div>
            {paged.map((row, i) => {
              const globalIdx = csvData.findIndex(r => r.no === row.no);
              return (
                <div key={row.no} style={{
                  display: "grid", gridTemplateColumns: "40px 1.5fr 1fr 0.8fr 100px 60px",
                  padding: "6px 8px", fontSize: 11, alignItems: "center",
                  borderBottom: "1px solid " + C.borderLight,
                  background: row.called ? (row.result === "アポ" ? C.green + "08" : C.offWhite) : C.white,
                  opacity: row.called ? 0.6 : 1,
                }}>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.textLight }}>{row.no}</span>
                  <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.company}</span>
                  <span style={{ color: C.textLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10 }}>{row.business}</span>
                  <span style={{ color: C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.representative}</span>
                  <span>
                    {row.phone ? (
                      <span onClick={() => dialPhone(row.phone)} style={{
                        color: C.navy, fontWeight: 600, fontSize: 11,
                        fontFamily: "'JetBrains Mono'", cursor: "pointer",
                        padding: "2px 6px", borderRadius: 4,
                        background: C.gold + "15",
                        border: "1px solid " + C.gold + "30",
                      }}>{row.phone}</span>
                    ) : "-"}
                  </span>
                  <span>
                    {row.called ? (
                      <span style={{
                        fontSize: 9, padding: "2px 6px", borderRadius: 3,
                        background: row.result === "アポ" ? C.green + "20" : C.border,
                        color: row.result === "アポ" ? C.green : C.textLight,
                        fontWeight: 600,
                      }}>{row.result || "済"}</span>
                    ) : (
                      <div style={{ display: "flex", gap: 2 }}>
                        <button onClick={() => markCalled(globalIdx, "不通")} title="不通" style={{
                          width: 20, height: 20, borderRadius: 3, border: "1px solid " + C.border,
                          background: C.offWhite, cursor: "pointer", fontSize: 8, color: C.textLight,
                        }}>✕</button>
                        <button onClick={() => markCalled(globalIdx, "通電")} title="通電" style={{
                          width: 20, height: 20, borderRadius: 3, border: "1px solid " + C.navy + "30",
                          background: C.navy + "10", cursor: "pointer", fontSize: 8, color: C.navy,
                        }}>○</button>
                        <button onClick={() => markCalled(globalIdx, "アポ")} title="アポ" style={{
                          width: 20, height: 20, borderRadius: 3, border: "1px solid " + C.green + "30",
                          background: C.green + "10", cursor: "pointer", fontSize: 8, color: C.green,
                        }}>◎</button>
                      </div>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {filtered.length > PAGE_SIZE && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 8 }}>
              <button disabled={pageStart === 0} onClick={() => setPageStart(Math.max(0, pageStart - PAGE_SIZE))} style={{
                padding: "4px 12px", borderRadius: 4, border: "1px solid " + C.border,
                background: pageStart === 0 ? C.offWhite : C.white, cursor: pageStart === 0 ? "default" : "pointer",
                fontSize: 11, color: C.textMid, fontFamily: "'Noto Sans JP'",
              }}>← 前</button>
              <button disabled={pageStart + PAGE_SIZE >= filtered.length} onClick={() => setPageStart(pageStart + PAGE_SIZE)} style={{
                padding: "4px 12px", borderRadius: 4, border: "1px solid " + C.border,
                background: pageStart + PAGE_SIZE >= filtered.length ? C.offWhite : C.white,
                cursor: pageStart + PAGE_SIZE >= filtered.length ? "default" : "pointer",
                fontSize: 11, color: C.textMid, fontFamily: "'Noto Sans JP'",
              }}>次 →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Appo Report Modal (アポ取得報告モーダル)
// ============================================================
function AppoReportModal({ row, list, currentUser = '', members = [], onClose, onSave, onDone, initialRecordingUrl = '', onFetchRecordingUrl }) {
  console.log('[AppoReportModal] members:', members.length, 'currentUser:', currentUser);
  const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

  // クライアントの報酬タイプを特定
  const clientInfo = CLIENT_DATA.find(c => c.company === list.company);
  const rewardType = clientInfo?.rewardType || '';
  const rewardRows = REWARD_MASTER.filter(r => r.id === rewardType);
  const isFixed = rewardRows.length > 0 && rewardRows[0].basis === '-';

  // 右パネルと同じフォーマット（千円単位の数値 → "1,004,947千円"）
  const initialSalesAmount = row.revenue    != null ? Number(row.revenue).toLocaleString()    + '千円' : '';
  const initialNetIncome   = row.net_income != null ? Number(row.net_income).toLocaleString() + '千円' : '';
  // フォームオープン時に ourSales も計算済みにする
  const initialOurSales = (() => {
    if (isFixed) return String(rewardRows[0].price);
    if (!rewardRows.length) return '';
    const basis = rewardRows[0].basis;
    const amount = basis === '売上高'
      ? (row.revenue    != null ? row.revenue    * 1000 : null)
      : (row.net_income != null ? row.net_income * 1000 : null);
    if (amount === null) return '';
    const match = rewardRows.find(r => amount >= r.lo && amount < r.hi);
    return match ? String(match.price) : '';
  })();

  const [form, setForm] = React.useState({
    contactName:    row.representative || '',
    contactTitle:   '代表取締役',
    appoDate:       '',
    appoTime:       '',
    visitLocation:  (row.address || '').replace(/\/\s*$/, ''),
    businessDetail: row.business || '',
    salesAmount:    initialSalesAmount,
    netIncome:      initialNetIncome,
    phone:          row.phone || '',
    email:          '',
    hp:             '',
    temperature:    '',
    meetingExp:     '',
    futureConsider: '',
    other:          '',
    recordingUrl:   initialRecordingUrl,
    acquirer:       currentUser,
    ourSales:       initialOurSales,
  });
  const [copied, setCopied] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  // 'idle' | 'saving' | 'slack' | 'ai' | 'done_slack' | 'done_no_slack' | 'error'
  const [aiStatus, setAiStatus] = React.useState('idle');
  const [slackAppoFailed, setSlackAppoFailed] = React.useState(false);
  // 'idle' | 'transcribing' | 'enhancing' | 'done' | 'error'
  const [generateStep, setGenerateStep] = React.useState('idle');
  const [recordingUrlLoading, setRecordingUrlLoading] = React.useState(false);
  const [recordingUrlError, setRecordingUrlError] = React.useState(false);
  const set = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const handleRefetchRecordingUrl = async () => {
    if (!onFetchRecordingUrl) { setRecordingUrlError(true); return; }
    setRecordingUrlLoading(true);
    setRecordingUrlError(false);
    try {
      const url = await onFetchRecordingUrl();
      if (url) {
        setForm(prev => ({ ...prev, recordingUrl: url }));
        setRecordingUrlError(false);
      } else {
        setRecordingUrlError(true);
      }
    } catch (e) {
      console.warn('[AppoReportModal] 録音URL取得失敗:', e);
      setRecordingUrlError(true);
    } finally {
      setRecordingUrlLoading(false);
    }
  };

  // モーダルを開いた直後に Zoom 録音 URL を自動取得（既存 URL がない場合のみ）
  React.useEffect(() => {
    if (!initialRecordingUrl) handleRefetchRecordingUrl();
  }, []);

  // 日本語金額テキスト（"5.0億円"、"3000万円"等）を円に変換
  const parseJpAmount = (str) => {
    if (!str) return null;
    const s = String(str)
      .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[,，\s]/g, '');
    let m;
    if ((m = s.match(/^([0-9.]+)億([0-9.]+)?万?/))) return Math.round(parseFloat(m[1]) * 1e8 + (m[2] ? parseFloat(m[2]) * 1e4 : 0));
    if ((m = s.match(/^([0-9.]+)千万/))) return Math.round(parseFloat(m[1]) * 1e7);
    if ((m = s.match(/^([0-9.]+)万/))) return Math.round(parseFloat(m[1]) * 1e4);
    if ((m = s.match(/^([0-9.]+)千/))) return Math.round(parseFloat(m[1]) * 1e3);
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  };

  // REWARD_MASTERから当社売上を自動計算
  const computeOurSales = (salesYen, netYen) => {
    if (!rewardRows.length) return null;
    const basis = rewardRows[0].basis;
    if (basis === '-') return rewardRows[0].price; // 固定単価
    const amount = basis === '売上高' ? salesYen : netYen;
    if (amount === null) return null;
    const match = rewardRows.find(r => amount >= r.lo && amount < r.hi);
    return match ? match.price : null;
  };

  const dateWithWeekday = (d) => {
    if (!d) return '';
    const [y, m, dy] = d.split('-').map(Number);
    const dow = WEEKDAYS[new Date(y, m - 1, dy).getDay()];
    return `${d}（${dow}）`;
  };

  const generateReport = () =>
`【アポ取得報告】
企業名：${row.company}
担当者：${form.contactName}様（${form.contactTitle}）
日時：${dateWithWeekday(form.appoDate)} ${form.appoTime}～
訪問先：${form.visitLocation}
事業内容：${form.businessDetail}
財務：売上${form.salesAmount}、当期純利益${form.netIncome}
当社売上：${form.ourSales !== '' ? '¥' + Number(form.ourSales).toLocaleString() : ''}
電話番号：${form.phone}
メール：${form.email}
HP：${form.hp}
メモ：
　・先方の温度感→${form.temperature}
　・面談経験の有無→${form.meetingExp}
　・将来的な検討可否→${form.futureConsider}
　・その他→${form.other}
　・録音URL：${form.recordingUrl}
　・アポ取得者→${form.acquirer}`;

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(generateReport()); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch (e) { console.error('Copy failed:', e); }
  };

  const handleGenerateReport = async () => {
    if (!form.recordingUrl) {
      alert('録音URLを先に取得してください');
      return;
    }
    setGenerateStep('transcribing');
    try {
      const { data, error } = await invokeTranscribeRecording({
        recording_url:  form.recordingUrl,
        item_id:        row?.id || '',
        temperature:    form.temperature,
        meetingExp:     form.meetingExp,
        futureConsider: form.futureConsider,
        other:          form.other,
      });
      console.log('[handleGenerateReport] response:', { data, error });
      if (error || data?.error) throw new Error(error?.message || data?.error);
      setGenerateStep('enhancing');
      setForm(prev => ({
        ...prev,
        temperature:    data.temperature    || prev.temperature,
        meetingExp:     data.meetingExp     || prev.meetingExp,
        futureConsider: data.futureConsider || prev.futureConsider,
        other:          data.other          || prev.other,
        recordingUrl:   data.publicRecordingUrl || prev.recordingUrl,
      }));
      setGenerateStep('done');
      setTimeout(() => setGenerateStep('idle'), 3000);
    } catch (e) {
      console.error('[handleGenerateReport]', e);
      setGenerateStep('error');
      setTimeout(() => setGenerateStep('idle'), 4000);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setAiStatus('saving');
    // 当社売上・インターン報酬の計算
    const salesVal = parseInt(form.ourSales) || 0;
    const acquirerMember = members.find(m => (typeof m === 'string' ? m : (m.name || '')) === form.acquirer);
    const acquirerRate = parseFloat(acquirerMember?.rate ?? acquirerMember?.incentive_rate ?? 0) || 0;
    const rewardVal = salesVal && acquirerRate ? Math.round(salesVal * acquirerRate) : 0;
    console.log('[handleSave] ourSales:', form.ourSales, '→ salesVal:', salesVal);
    console.log('[handleSave] acquirer:', form.acquirer, '→ member:', acquirerMember, '→ rate:', acquirerRate, '→ rewardVal:', rewardVal);
    console.log('[handleSave] members 件数:', members.length, '先頭サンプル:', members[0]);
    const reportNote = generateReport();
    // Step 1: アポをDBに登録（appointments テーブルへ insert + ローカル状態更新）
    const { result: insResult } = await insertAppointment({
      company:  row.company,
      client:   list.company,
      meetDate: form.appoDate,
      getDate:  form.appoDate,
      getter:   form.acquirer,
      note:     reportNote,
      status:   'アポ取得',
      sales:    salesVal,
      reward:   rewardVal,
    });
    console.log('[AppoReportModal] insertAppointment result:', insResult, 'sales:', salesVal, 'reward:', rewardVal);
    await onSave({
      company:  row.company,
      client:   list.company,
      meetDate: form.appoDate,
      getDate:  form.appoDate,
      getter:   form.acquirer,
      note:     reportNote,
      sales:    salesVal,
      reward:   rewardVal,
      supaId:   insResult?.id,
    });
    // Step 2: #アポ取得報告チャンネルへSlack即時投稿
    setAiStatus('slack');
    setSlackAppoFailed(false);
    let slackAppoOk = false;
    try {
      const supabaseUrlEnv = import.meta.env.VITE_SUPABASE_URL;
      const anonKeyEnv     = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const slackRes = await fetch(`${supabaseUrlEnv}/functions/v1/post-appo-to-slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': anonKeyEnv },
        body: JSON.stringify({ text: reportNote }),
      });
      slackAppoOk = slackRes.ok;
      if (!slackRes.ok) {
        console.warn('[handleSave] post-appo-to-slack failed:', slackRes.status);
        setSlackAppoFailed(true);
      }
    } catch (slackErr) {
      console.error('[handleSave] post-appo-to-slack error:', slackErr);
      setSlackAppoFailed(true);
    }

    // Step 3: zoom_user_id取得 → Edge Function（録音→Claude→Slack）
    setAiStatus('ai');
    try {
      const zoomUserId = await fetchZoomUserId(currentUser);
      const { data, error } = await invokeAppoAiReport({
        zoom_user_id: zoomUserId,
        callee_phone: form.phone,
        report_text:  generateReport(),
        company_name: row.company,
        client_name:  list.company,
      });
      if (error) throw error;
      const nextStatus = (data?.slackPosted || slackAppoOk) ? 'done_slack' : 'done_no_slack';
      setAiStatus(nextStatus);
      // 成功時は2秒後に自動クローズ
      setTimeout(() => { (onDone || onClose)(); }, 2000);
    } catch (err) {
      console.error('[AppoReportModal] Edge Function error:', err);
      setAiStatus(slackAppoOk ? 'done_slack' : 'error');
    }
    setSaving(false);
  };

  const iStyle = { width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid ' + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', background: C.offWhite, boxSizing: 'border-box' };
  const lStyle = { fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 2, display: 'block' };

  const FIELDS = [
    { key: 'contactName',    label: '担当者名',       span: 1 },
    { key: 'contactTitle',   label: '役職',           span: 1 },
    { key: 'appoDate',       label: 'アポ日',          span: 1, type: 'date' },
    { key: 'appoTime',       label: '時間',           span: 1, type: 'time' },
    { key: 'visitLocation',  label: '訪問先',          span: 2, placeholder: '例：本社、Zoom等' },
    { key: 'businessDetail', label: '事業内容',        span: 2 },
    { key: 'salesAmount',    label: '売上',           span: 1, placeholder: '例：5.0億円' },
    { key: 'netIncome',      label: '当期純利益',       span: 1, placeholder: '例：3000万円' },
    { key: 'phone',          label: '電話番号',        span: 1 },
    { key: 'email',          label: 'メール',          span: 1 },
    { key: 'hp',             label: 'HP',             span: 2 },
    { key: 'temperature',    label: '先方の温度感',     span: 2 },
    { key: 'meetingExp',     label: '面談経験の有無',   span: 2 },
    { key: 'futureConsider', label: '将来的な検討可否', span: 2 },
    { key: 'other',          label: 'その他',          span: 2 },
    { key: 'recordingUrl',   label: '録音URL',         span: 2 },
    { key: 'ourSales',       label: '当社売上（自動計算・上書き可）', span: 2, type: 'number',
      placeholder: rewardType ? `タイプ${rewardType}（${rewardRows[0]?.name || ''}）に基づき自動計算` : 'クライアント不明 — 手動入力' },
  ];

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: C.white, borderRadius: 12, width: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
        {/* ヘッダー */}
        <div style={{ padding: '14px 20px', background: 'linear-gradient(135deg, ' + C.navyDeep + ', ' + C.navy + ')', borderRadius: '12px 12px 0 0', color: C.white, flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>🎉 アポ取得報告</div>
          <div style={{ fontSize: 10, color: C.goldLight, marginTop: 2 }}>{row.company}</div>
        </div>
        {/* フォーム */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {FIELDS.map(f => {
              const isRecUrl = f.key === 'recordingUrl';
              const isLoading = isRecUrl && recordingUrlLoading;
              return (
                <div key={f.key} style={{ gridColumn: f.span === 2 ? '1 / -1' : undefined }}>
                  <label style={{ ...lStyle, display: 'flex', alignItems: 'center' }}>
                    <span>{f.label}</span>
                    {isRecUrl && isLoading && <span style={{ marginLeft: 6, fontSize: 10, color: C.textLight, fontWeight: 400 }}>🔄 取得中...</span>}
                    {isRecUrl && !isLoading && form.recordingUrl && <span style={{ marginLeft: 6, fontSize: 10, color: C.green, fontWeight: 400 }}>✓ 自動取得済み</span>}
                    {isRecUrl && !isLoading && recordingUrlError && <span style={{ marginLeft: 6, fontSize: 10, color: '#c53030', fontWeight: 400 }}>録音の準備中です。数秒後に再度お試しください</span>}
                    {isRecUrl && !isLoading && (
                      <button onClick={handleRefetchRecordingUrl}
                        title="録音URLを再取得"
                        style={{ marginLeft: 6, fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: C.navy }}>🔄</button>
                    )}
                  </label>
                  <input type={f.type || 'text'} value={form[f.key]}
                    placeholder={isLoading ? '録音URLを取得中...' : (f.placeholder || '')}
                    disabled={isLoading}
                    onChange={e => {
                      const val = e.target.value;
                      set(f.key, val);
                      if (f.key === 'salesAmount' || f.key === 'netIncome') {
                        const salesYen = parseJpAmount(f.key === 'salesAmount' ? val : form.salesAmount);
                        const netYen   = parseJpAmount(f.key === 'netIncome'   ? val : form.netIncome);
                        const computed = computeOurSales(salesYen, netYen);
                        if (computed !== null) set('ourSales', String(computed));
                      }
                    }} style={isLoading ? { ...iStyle, background: '#f0f0f0', color: C.textLight } : iStyle} />
                </div>
              );
            })}
            {/* アポ取得者：インクリメンタルサーチ */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lStyle}>アポ取得者</label>
              <MemberSuggestInput value={form.acquirer} onChange={v => set('acquirer', v)} members={members} style={iStyle} />
            </div>
          </div>
          {/* 報告プレビュー */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 4 }}>報告プレビュー</div>
            <pre style={{ background: C.offWhite, border: '1px solid ' + C.border, borderRadius: 6, padding: 10, fontSize: 10, whiteSpace: 'pre-wrap', fontFamily: "'JetBrains Mono'", lineHeight: 1.6, color: C.textDark, margin: 0 }}>{generateReport()}</pre>
          </div>
        </div>
        {/* フッター */}
        <div style={{ padding: '10px 20px', borderTop: '1px solid ' + C.borderLight, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {/* 文字起こし＋AI添削ボタン */}
            <button onClick={handleGenerateReport} disabled={saving || generateStep !== 'idle'}
              style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid ' + C.navy + '40', background: C.navy + '08', cursor: (saving || generateStep !== 'idle') ? 'default' : 'pointer', fontSize: 11, fontWeight: 600, color: C.navy, fontFamily: "'Noto Sans JP'", opacity: (saving || generateStep !== 'idle') ? 0.5 : 1 }}>
              {generateStep === 'transcribing' && '🎙 文字起こし中...'}
              {generateStep === 'enhancing'    && '🤖 AI添削中...'}
              {generateStep === 'done'         && '✅ 添削完了'}
              {generateStep === 'error'        && '⚠ エラー'}
              {generateStep === 'idle'         && '🎙 文字起こし＋AI添削'}
            </button>
            {/* コピーボタン */}
            <button onClick={handleCopy} disabled={saving}
              style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid ' + C.navy + '40', background: C.navy + '08', cursor: saving ? 'default' : 'pointer', fontSize: 11, fontWeight: 600, color: C.navy, fontFamily: "'Noto Sans JP'", opacity: saving ? 0.5 : 1 }}>
              {copied ? '✅ コピー済み' : '📋 コピー'}
            </button>
          </div>
          {/* AI処理ステータス表示 */}
          {aiStatus !== 'idle' && (
            <div style={{ fontFamily: "'Noto Sans JP'" }}>
              <div style={{ fontSize: 11, color: aiStatus === 'error' ? '#c00' : aiStatus.startsWith('done') ? '#0a0' : C.textMid }}>
                {aiStatus === 'saving'        && '💾 アポ登録中...'}
                {aiStatus === 'slack'         && '📤 #アポ取得報告 に投稿中...'}
                {aiStatus === 'ai'            && '🤖 AI処理中（録音取得・レポート強化・Slack投稿）...'}
                {aiStatus === 'done_slack'    && '✅ 完了！Slackに投稿しました'}
                {aiStatus === 'done_no_slack' && '✅ AI処理完了（Slack未設定）'}
                {aiStatus === 'error'         && '⚠ AI処理でエラーが発生しました（アポ登録は完了）'}
              </div>
              {slackAppoFailed && aiStatus !== 'slack' && (
                <div style={{ fontSize: 10, color: '#c00', marginTop: 2 }}>⚠ #アポ取得報告 への投稿に失敗しました</div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            {aiStatus === 'idle' && (
              <button onClick={onClose}
                style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid ' + C.border, background: C.white, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: C.textMid, fontFamily: "'Noto Sans JP'" }}>キャンセル</button>
            )}
            {aiStatus.startsWith('done') || aiStatus === 'error' ? (
              <button onClick={onDone || onClose}
                style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid ' + C.border, background: C.white, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: C.textMid, fontFamily: "'Noto Sans JP'" }}>閉じる</button>
            ) : (
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '8px 24px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg, ' + C.navyDeep + ', ' + C.navy + ')', cursor: saving ? 'default' : 'pointer', fontSize: 11, fontWeight: 700, color: C.white, fontFamily: "'Noto Sans JP'", opacity: saving ? 0.7 : 1 }}>
                {saving ? '処理中...' : '保存してアポ登録'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Call Flow View (架電フロー) — 左右分割レイアウト
// ============================================================
function CallFlowView({ list, startNo, endNo, statusFilter = null, onClose, setAppoData, members = [], currentUser = '', defaultItemId = null }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRow, setSelectedRow] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [localMemo, setLocalMemo] = useState('');
  const [savingMemo, setSavingMemo] = useState(false);
  const [appoModal, setAppoModal] = useState(null); // holds selectedRow when アポ獲得 is clicked
  const [scriptPanelOpen, setScriptPanelOpen] = useState(true);
  const [scriptTab, setScriptTab] = useState('script');
  const [sortState, setSortState] = useState({ column: null, direction: null });
  const [callRecords, setCallRecords] = useState([]);
  const [selectedRound, setSelectedRound] = useState(null);
  const [filterMode, setFilterMode] = useState('callable');
  const [recallModal, setRecallModal] = useState(null); // { row, statusId, round, label }
  const [subPhone, setSubPhone] = useState('');
  const [lastDialedPhone, setLastDialedPhone] = useState(null);
  const [activeRecordingId, setActiveRecordingId] = useState(null);
  const PAGE_SIZE = 30;
  const sessionIdRef = React.useRef(null);
  const isRealCloseRef = React.useRef(false);
  const CF_SESSIONS_KEY = 'callflow_sessions_v1';
  const [autoDial, setAutoDial] = useState(() => {
    try { return localStorage.getItem('cf_autocall') === 'true'; } catch { return false; }
  });
  const toggleAutoDial = () => {
    setAutoDial(prev => {
      const next = !prev;
      try { localStorage.setItem('cf_autocall', String(next)); } catch {}
      return next;
    });
  };
  const _readSessions = () => { try { return JSON.parse(localStorage.getItem(CF_SESSIONS_KEY) || '[]'); } catch { return []; } };
  const _updateSession = (updates) => {
    if (!sessionIdRef.current) { console.warn('[Session] _updateSession — sessionIdRef.current が null のためスキップ'); return; }
    const sessions = _readSessions();
    const idx = sessions.findIndex(s => s.id === sessionIdRef.current);
    if (idx >= 0) {
      sessions[idx] = { ...sessions[idx], ...updates };
      localStorage.setItem(CF_SESSIONS_KEY, JSON.stringify(sessions));
      console.log('[Session] localStorage書き込み完了 — id:', sessionIdRef.current, '/ updates:', updates, '/ 全セッション数:', sessions.length);
    } else {
      console.warn('[Session] _updateSession — セッションが見つからない — id:', sessionIdRef.current, '/ sessions:', sessions.map(s => s.id));
    }
  };

  useEffect(() => {
    console.log('[CallFlowView] mount — list:', list, '/ list._supaId:', list._supaId, '/ startNo:', startNo, '/ endNo:', endNo);
    if (!list._supaId) {
      console.warn('[CallFlowView] list._supaId が未設定 — データ取得をスキップ');
      setLoading(false);
      return;
    }
    Promise.all([
      fetchCallListItems(list._supaId),
      fetchCallRecords(list._supaId),
    ]).then(([itemsRes, recordsRes]) => {
      const fetchedItems = itemsRes.data || [];
      const fetchedRecords = recordsRes.data || [];
      console.log('[CallFlowView] fetchCallListItems — 件数:', fetchedItems.length, '/ error:', itemsRes.error, '/ 先頭3件:', fetchedItems.slice(0, 3));
      console.log('[CallFlowView] fetchCallRecords — 件数:', fetchedRecords.length, '/ error:', recordsRes.error);
      setItems(fetchedItems);
      setCallRecords(fetchedRecords);
      if (defaultItemId) {
        const target = fetchedItems.find(i => i.id === defaultItemId);
        if (target) setSelectedRow(target);
      }
      setLoading(false);
    });
  }, [list._supaId]);

  useEffect(() => {
    setLocalMemo(selectedRow?.id ? (localStorage.getItem('cf_note_' + selectedRow.id) || '') : '');
    console.log('[subPhone] 企業切り替え — item_id:', selectedRow?.id, '/ sub_phone_number:', selectedRow?.sub_phone_number);
    setSubPhone(selectedRow?.sub_phone_number || '');
    setLastDialedPhone(null);
  }, [selectedRow?.id]);

  useEffect(() => {
    if (!selectedRow) { setSelectedRound(null); return; }
    const recs = callRecords.filter(r => r.item_id === selectedRow.id);
    const maxRound = recs.length > 0 ? Math.max(...recs.map(r => r.round)) : 0;
    setSelectedRound(Math.min(maxRound + 1, 8));
  }, [selectedRow?.id]);

  // Session creation on mount + beforeunload guard
  React.useEffect(() => {
    const id = `cf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    sessionIdRef.current = id;
    const sessions = _readSessions();
    sessions.push({
      id,
      listId: list.id,
      listSupaId: list._supaId || null,
      listName: list.company || '',
      industry: list.industry || '',
      callerName: currentUser || '不明',
      startNo: startNo ?? null,
      endNo: endNo ?? null,
      // 範囲指定あり → 作成時に確定。なし → items ロード後に更新
      totalCount: (startNo != null && endNo != null)
        ? (Number(endNo) - Number(startNo) + 1)
        : 0,
      calledCount: 0,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      lastCalledAt: null,
    });
    localStorage.setItem(CF_SESSIONS_KEY, JSON.stringify(sessions));
    console.log('[Session] セッション作成 — id:', id, '/ listId:', list.id, '/ totalCount:', sessions[sessions.length - 1].totalCount, '/ localStorage key:', CF_SESSIONS_KEY);

    // タブ閉じ・リロード時にも finishedAt を書き込む
    const handleBeforeUnload = () => {
      _updateSession({ finishedAt: new Date().toISOString() });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // React Strict Modeの偽unmountでは finishedAt を設定しない
      if (isRealCloseRef.current) {
        _updateSession({ finishedAt: new Date().toISOString() });
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    isRealCloseRef.current = true;
    _updateSession({ finishedAt: new Date().toISOString() });
    onClose();
  };

  const EXCLUDED_STATUSES = new Set(['アポ獲得', '除外']);
  const getRecordsForItem = (itemId) => callRecords.filter(r => r.item_id === itemId);
  const getNextRound = (itemId) => {
    const recs = getRecordsForItem(itemId);
    return recs.length === 0 ? 1 : Math.min(Math.max(...recs.map(r => r.round)) + 1, 8);
  };
  const isExcludedItem = (itemId) => callRecords.some(r => r.item_id === itemId && EXCLUDED_STATUSES.has(r.status));

  // Range filter (Number() で型統一: DBからstringで返る場合も安全)
  const rangeItems = (() => {
    if (startNo != null && endNo != null) {
      const s = Number(startNo), e = Number(endNo);
      const result = items.filter(i => Number(i.no) >= s && Number(i.no) <= e);
      console.log('[CallFlowView] rangeFilter — startNo:', s, 'endNo:', e, '/ 全件:', items.length, '/ 絞込後:', result.length);
      return result;
    }
    console.log('[CallFlowView] rangeFilter — 範囲指定なし, 全件:', items.length);
    return items;
  })();

  // Status filter (statusFilter=null は絞り込みなし)
  const statusFilteredItems = (() => {
    if (!statusFilter || statusFilter.length === 0) return rangeItems;
    return rangeItems.filter(item => {
      const records = getRecordsForItem(item.id);
      if (records.length === 0) return statusFilter.includes('未架電');
      const latestRecord = records.reduce((a, b) => (a.round || 0) >= (b.round || 0) ? a : b);
      return statusFilter.includes(latestRecord.status);
    });
  })();

  // 範囲指定なし時のみ: items ロード完了後に totalCount を実件数で確定
  React.useEffect(() => {
    if (!loading && items.length > 0 && (startNo == null || endNo == null)) {
      _updateSession({ totalCount: items.length });
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // call_record 追加のたびに calledCount を +1（セッション開始後の架電件数を積算）
  const _updateSessionProgress = () => {
    if (!sessionIdRef.current) { console.warn('[Session] _updateSessionProgress — sessionIdRef.current が null'); return; }
    const current = _readSessions().find(s => s.id === sessionIdRef.current);
    if (!current) { console.warn('[Session] _updateSessionProgress — セッションが見つからない — id:', sessionIdRef.current); return; }
    const prev = current.calledCount ?? 0;
    const newCalledCount = prev + 1;
    console.log('[Session] calledCount更新:', prev, '→', newCalledCount, '/ sessionId:', sessionIdRef.current);
    _updateSession({ calledCount: newCalledCount, lastCalledAt: new Date().toISOString() });
  };

  const filtered = (() => {
    const result = statusFilteredItems.filter(item => {
      const matchSearch = !search || item.company?.includes(search) || item.representative?.includes(search) || item.phone?.includes(search);
      if (!matchSearch) return false;
      if (filterMode === 'callable') return !isExcludedItem(item.id);
      if (filterMode === 'excluded') return isExcludedItem(item.id);
      return true;
    });
    console.log('[CallFlowView] filtered — filterMode:', filterMode, '/ statusFilteredItems:', statusFilteredItems.length, '→ filtered:', result.length);
    return result;
  })();

  const COL_KEY_MAP = { 'No': 'no', '企業名': 'company', '事業内容': 'business', '代表者': 'representative', '電話番号': 'phone', '結果': 'call_status' };
  const sorted = sortState.column && sortState.direction
    ? [...filtered].sort((a, b) => {
        const key = COL_KEY_MAP[sortState.column];
        const av = a[key] ?? '';
        const bv = b[key] ?? '';
        const cmp = key === 'no'
          ? (Number(av) || 0) - (Number(bv) || 0)
          : String(av).localeCompare(String(bv), 'ja');
        return sortState.direction === 'desc' ? -cmp : cmp;
      })
    : filtered;

  const handleSort = (col) => {
    setSortState(prev => {
      if (prev.column === col && prev.direction === 'desc') return { column: null, direction: null };
      return { column: col, direction: 'desc' };
    });
    setPage(0);
  };

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageItems = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const stats = {
    total: statusFilteredItems.length,
    called: statusFilteredItems.filter(i => getRecordsForItem(i.id).length > 0).length,
    excluded: statusFilteredItems.filter(i => isExcludedItem(i.id)).length,
    appo: statusFilteredItems.filter(i => getRecordsForItem(i.id).some(r => r.status === 'アポ獲得')).length,
  };
  const progress = stats.total > 0 ? Math.round(stats.called / stats.total * 100) : 0;

  // selectedRow 変更時は録音プレーヤーをリセット
  useEffect(() => { setActiveRecordingId(null); }, [selectedRow]);

  // 録音URLを同期取得して返す（insert前に呼び出す）
  // calledAt: 架電日時（insert直前に生成したISO文字列）
  // prevCalledAt: 同一企業の1つ前の架電レコードの called_at（時間窓の下限）
  const fetchRecordingUrl = async (phone, calledAt, prevCalledAt = null) => {
    try {
      const member = members.find(m => (typeof m === 'string' ? m : m.name) === currentUser);
      const zoomUserId = typeof member === 'object' ? member?.zoomUserId : null;
      if (!zoomUserId || !phone) return null;
      const normalizedPhone = phone.replace(/[^\d]/g, '');
      const { data } = await invokeGetZoomRecording({ zoom_user_id: zoomUserId, callee_phone: normalizedPhone, called_at: calledAt, prev_called_at: prevCalledAt });
      return data?.recording_url || null;
    } catch (e) {
      console.error('[fetchRecordingUrl] error:', e);
      return null;
    }
  };

  const callStatusColor = (st, isExcluded) => {
    if (isExcluded) return { bg: '#fee2e2', color: '#e53e3e' };
    const s = st || '未架電';
    if (s === '未架電')      return { bg: 'transparent', color: C.textLight };
    if (s === '不通')        return { bg: '#f0f0f0',     color: '#999' };
    if (s === '社長不在')    return { bg: '#fefce8',     color: '#d69e2e' };
    if (s === '受付ブロック') return { bg: '#fff7ed',    color: '#dd6b20' };
    if (s === '受付再コール') return { bg: '#ebf8ff',    color: '#3182ce' };
    if (s === '社長再コール') return { bg: '#ebf8ff',    color: '#3182ce' };
    if (s === 'アポ獲得')    return { bg: '#f0fff4',     color: '#38a169' };
    if (s === '社長お断り')  return { bg: '#faf5ff',     color: '#805ad5' };
    if (s === '除外')        return { bg: '#fee2e2',     color: '#e53e3e' };
    return { bg: C.offWhite, color: C.textLight };
  };

  const handleResult = async (result) => {
    console.log('[handleResult] 開始');
    console.log('[handleResult] 開始 — status:', result, '/ itemId:', selectedRow?.id, '/ selectedRow:', selectedRow, '/ selectedRound:', selectedRound);
    if (!selectedRow || selectedRound === null) { console.warn('[handleResult] 早期リターン — selectedRow:', selectedRow, '/ selectedRound:', selectedRound); return; }
    if (result === 'アポ獲得') { setAppoModal(selectedRow); return; }
    if (result === '受付再コール' || result === '社長再コール') {
      setRecallModal({
        row: selectedRow,
        statusId: result === '受付再コール' ? 'reception_recall' : 'ceo_recall',
        round: selectedRound,
        label: result,
      });
      return;
    }

    const calledAt = new Date().toISOString();
    const _prevRecResult = callRecords
      .filter(r => r.item_id === selectedRow.id)
      .sort((a, b) => (b.called_at || '').localeCompare(a.called_at || ''))[0];
    const _prevCalledAtResult = _prevRecResult?.called_at || null;

    const recordingUrl = await fetchRecordingUrl(lastDialedPhone || selectedRow.phone, calledAt, _prevCalledAtResult);

    console.log('[handleResult] insertCallRecord 呼び出し — list._supaId:', list._supaId, '/ item_id:', selectedRow.id, '/ status:', result);
    const { result: newRec, error } = await insertCallRecord({
      item_id: selectedRow.id, list_id: list._supaId,
      round: selectedRound, status: result, memo: localMemo || null,
      called_at: calledAt, recording_url: recordingUrl, getter_name: currentUser,
    });
    console.log('[handleResult] insertCallRecord 結果 — newRec:', newRec, '/ error:', error);
    if (error || !newRec) {
      console.error('[handleResult] insertCallRecord 失敗 — calledCountは更新しない');
      return;
    }

    try {
      const key = "callflow_sessions_v1";
      const raw = localStorage.getItem(key);
      console.log("[handleResult] localStorage raw:", raw);
      if (raw) {
        const arr = JSON.parse(raw);
        const sid = sessionIdRef.current;
        console.log("[handleResult] sessionId:", sid, "sessions数:", arr.length);
        const idx = arr.findIndex(s => s.id === sid);
        if (idx >= 0) {
          arr[idx].calledCount = (arr[idx].calledCount || 0) + 1;
          localStorage.setItem(key, JSON.stringify(arr));
          console.log("[handleResult] calledCount更新成功:", arr[idx].calledCount, "/", arr[idx].totalCount);
        } else {
          console.warn("[handleResult] セッションがlocalStorageに見つからない。sid:", sid, "keys:", arr.map(s=>s.id));
        }
      } else {
        console.warn("[handleResult] localStorageにcallflow_sessions_v1が存在しない");
      }
    } catch(e) {
      console.error("[handleResult] localStorage更新エラー:", e);
    }

    const newRecords = [...callRecords, newRec];

    const itemRecs = newRecords.filter(r => r.item_id === selectedRow.id);
    const newIsExcl = itemRecs.some(r => EXCLUDED_STATUSES.has(r.status));
    await updateCallListItem(selectedRow.id, { call_status: result, is_excluded: newIsExcl });
    const updatedItem = { ...selectedRow, call_status: result, is_excluded: newIsExcl };
    const newItems = items.map(i => i.id === selectedRow.id ? updatedItem : i);
    setItems(newItems);
    setCallRecords(newRecords);
    _updateSessionProgress();

    const idx = newItems.findIndex(i => i.id === selectedRow.id);
    let next = null;
    for (let j = idx + 1; j < newItems.length; j++) {
      const ni = newItems[j];
      const niRecs = newRecords.filter(r => r.item_id === ni.id);
      const niExcl = niRecs.some(r => EXCLUDED_STATUSES.has(r.status));
      const niNext = niRecs.length === 0 ? 1 : Math.min(Math.max(...niRecs.map(r => r.round)) + 1, 8);
      if (!niExcl && niNext <= 8) { next = ni; break; }
    }
    setSelectedRow(next || updatedItem);
    if (autoDial && next?.phone) dialPhone(next.phone);
  };

  const handleDeleteRecord = async (record) => {
    await deleteCallRecord(record.id);
    const newRecords = callRecords.filter(r => r.id !== record.id);
    setCallRecords(newRecords);
    const itemRecs = newRecords.filter(r => r.item_id === selectedRow.id);
    const lastRec = [...itemRecs].sort((a, b) => b.round - a.round)[0];
    const newStatus = lastRec?.status || '未架電';
    const newIsExcl = itemRecs.some(r => EXCLUDED_STATUSES.has(r.status));
    await updateCallListItem(selectedRow.id, { call_status: newStatus, is_excluded: newIsExcl });
    setItems(prev => prev.map(i => i.id === selectedRow.id ? { ...i, call_status: newStatus, is_excluded: newIsExcl } : i));
    setSelectedRow(prev => prev ? { ...prev, call_status: newStatus, is_excluded: newIsExcl } : prev);
    setSelectedRound(record.round);
  };

  const handleFetchRecording = async (rec) => {
    const item = items.find(i => i.id === rec.item_id);
    if (!item) return;
    console.log('[handleFetchRecording] rec.id=', rec.id, 'item.phone=', item.phone, 'rec.called_at=', rec.called_at);
    const url = await fetchRecordingUrl(item.phone, rec.called_at, null);
    console.log('[handleFetchRecording] fetchRecordingUrl result=', url);
    if (!url) { alert('録音URLを取得できませんでした'); return; }
    const dbError = await updateCallRecordRecordingUrl(rec.id, url);
    console.log('[handleFetchRecording] DB更新結果 error=', dbError);
    if (dbError) { alert('録音URLのDB保存に失敗しました: ' + dbError.message); return; }
    setCallRecords(prev => prev.map(r => r.id === rec.id ? { ...r, recording_url: url } : r));
  };

  // アポ報告フォーム用録音URL取得（callRecords state → Supabase DB → Zoom API の順に検索）
  const handleAppoFetchRecording = async (itemId, phone) => {
    // Step 1: callRecords state に既にある場合
    const stateRec = callRecords
      .filter(r => r.item_id === itemId && r.recording_url)
      .sort((a, b) => (b.called_at || '').localeCompare(a.called_at || ''))[0];
    if (stateRec?.recording_url) return stateRec.recording_url;

    // Step 2: Supabase の call_records を直接確認（state が古い・まだ保存されていない可能性）
    const { data: freshRecs } = await fetchCallRecords(list._supaId);
    if (freshRecs?.length) {
      const freshRec = freshRecs
        .filter(r => r.item_id === itemId && r.recording_url)
        .sort((a, b) => (b.called_at || '').localeCompare(a.called_at || ''))[0];
      if (freshRec?.recording_url) {
        setCallRecords(freshRecs);
        return freshRec.recording_url;
      }
    }

    // Step 3: Zoom API から取得（called_at = 現在時刻で直近の通話を対象にする）
    return await fetchRecordingUrl(phone, new Date().toISOString(), null);
  };

  const handleAppoSave = async (formData) => {
    if (!appoModal || selectedRound === null) return;

    const calledAtAppo = new Date().toISOString();
    const _prevRecAppo = callRecords
      .filter(r => r.item_id === appoModal.id)
      .sort((a, b) => (b.called_at || '').localeCompare(a.called_at || ''))[0];
    const _prevCalledAtAppo = _prevRecAppo?.called_at || null;

    const recordingUrlAppo = await fetchRecordingUrl(appoModal.phone, calledAtAppo, _prevCalledAtAppo);

    console.log('[handleAppoSave] insertCallRecord 呼び出し — list._supaId:', list._supaId, '/ item_id:', appoModal.id);
    const { result: newRec, error: recErr } = await insertCallRecord({
      item_id: appoModal.id, list_id: list._supaId,
      round: selectedRound, status: 'アポ獲得', memo: localMemo || null,
      called_at: calledAtAppo, recording_url: recordingUrlAppo, getter_name: currentUser,
    });
    console.log('[handleAppoSave] insertCallRecord 結果 — newRec:', newRec, '/ error:', recErr);
    if (recErr || !newRec) {
      console.error('[handleAppoSave] insertCallRecord 失敗 — calledCountは更新しない');
      return;
    }

    try {
      const key = "callflow_sessions_v1";
      const raw = localStorage.getItem(key);
      console.log("[handleAppoSave] localStorage raw:", raw);
      if (raw) {
        const arr = JSON.parse(raw);
        const sid = sessionIdRef.current;
        console.log("[handleAppoSave] sessionId:", sid, "sessions数:", arr.length);
        const idx = arr.findIndex(s => s.id === sid);
        if (idx >= 0) {
          arr[idx].calledCount = (arr[idx].calledCount || 0) + 1;
          localStorage.setItem(key, JSON.stringify(arr));
          console.log("[handleAppoSave] calledCount更新成功:", arr[idx].calledCount, "/", arr[idx].totalCount);
        } else {
          console.warn("[handleAppoSave] セッションがlocalStorageに見つからない。sid:", sid, "keys:", arr.map(s=>s.id));
        }
      } else {
        console.warn("[handleAppoSave] localStorageにcallflow_sessions_v1が存在しない");
      }
    } catch(e) {
      console.error("[handleAppoSave] localStorage更新エラー:", e);
    }

    const newRecords = [...callRecords, newRec];
    setCallRecords(newRecords);

    const itemRecs = newRecords.filter(r => r.item_id === appoModal.id);
    await updateCallListItem(appoModal.id, { call_status: 'アポ獲得', is_excluded: true });
    const updatedItem = { ...appoModal, call_status: 'アポ獲得', is_excluded: true };
    const newItems = items.map(i => i.id === appoModal.id ? updatedItem : i);
    setItems(newItems);
    _updateSessionProgress();

    if (setAppoData) {
      const salesVal  = formData.sales  || 0;
      const rewardVal = formData.reward || 0;
      console.log('[handleAppoSave] sales:', salesVal, '/ reward:', rewardVal, '/ getter:', formData.getter, '/ supaId:', formData.supaId);
      const newAppo = {
        client:   formData.client,
        company:  formData.company,
        getter:   formData.getter,
        getDate:  formData.getDate,
        meetDate: formData.meetDate,
        status:   'アポ取得',
        note:     formData.note,
        sales:    salesVal,
        reward:   rewardVal,
        month:    formData.meetDate ? (parseInt(formData.meetDate.slice(5, 7), 10) + '月') : '',
      };
      if (formData.supaId) newAppo._supaId = formData.supaId;
      setAppoData(prev => [...prev, newAppo]);
    }

    const idx = newItems.findIndex(i => i.id === appoModal.id);
    let next = null;
    for (let j = idx + 1; j < newItems.length; j++) {
      const ni = newItems[j];
      const niRecs = newRecords.filter(r => r.item_id === ni.id);
      const niExcl = niRecs.some(r => EXCLUDED_STATUSES.has(r.status));
      const niNext = niRecs.length === 0 ? 1 : Math.min(Math.max(...niRecs.map(r => r.round)) + 1, 8);
      if (!niExcl && niNext <= 8) { next = ni; break; }
    }
    setSelectedRow(next || updatedItem);
    if (autoDial && next?.phone) dialPhone(next.phone);
    setAppoModal(null);
  };

  const handleRecallSave = async (recallData) => {
    if (!recallModal) return;
    const { row, round, label } = recallModal;
    const memoJson = JSON.stringify({
      recall_date: recallData.recallDate,
      recall_time: recallData.recallTime,
      assignee: recallData.assignee,
      note: recallData.note,
      recall_completed: false,
    });
    const calledAtRecall = new Date().toISOString();
    const _prevRecRecall = callRecords
      .filter(r => r.item_id === row.id)
      .sort((a, b) => (b.called_at || '').localeCompare(a.called_at || ''))[0];

    const recordingUrlRecall = await fetchRecordingUrl(row.phone, calledAtRecall, _prevRecRecall?.called_at || null);

    const { result: newRec, error } = await insertCallRecord({
      item_id: row.id, list_id: list._supaId,
      round, status: label, memo: memoJson,
      called_at: calledAtRecall, recording_url: recordingUrlRecall, getter_name: currentUser,
    });
    if (error || !newRec) { setRecallModal(null); return; }

    const newRecords = [...callRecords, newRec];
    setCallRecords(newRecords);
    const itemRecs = newRecords.filter(r => r.item_id === row.id);
    const newIsExcl = itemRecs.some(r => EXCLUDED_STATUSES.has(r.status));
    await updateCallListItem(row.id, { call_status: label, is_excluded: newIsExcl });
    const updatedItem = { ...row, call_status: label, is_excluded: newIsExcl };
    const newItems = items.map(i => i.id === row.id ? updatedItem : i);
    setItems(newItems);
    _updateSessionProgress();

    const idx = newItems.findIndex(i => i.id === row.id);
    let next = null;
    for (let j = idx + 1; j < newItems.length; j++) {
      const ni = newItems[j];
      const niRecs = newRecords.filter(r => r.item_id === ni.id);
      const niExcl = niRecs.some(r => EXCLUDED_STATUSES.has(r.status));
      const niNext = niRecs.length === 0 ? 1 : Math.min(Math.max(...niRecs.map(r => r.round)) + 1, 8);
      if (!niExcl && niNext <= 8) { next = ni; break; }
    }
    setSelectedRow(next || updatedItem);
    if (autoDial && next?.phone) dialPhone(next.phone);
    setRecallModal(null);
  };

  const handleMemoBlur = () => {
    if (!selectedRow) return;
    const key = 'cf_note_' + selectedRow.id;
    if (localMemo === (localStorage.getItem(key) || '')) return;
    localStorage.setItem(key, localMemo);
  };

  const handleSubPhoneBlur = async () => {
    if (!selectedRow) return;
    console.log('[subPhone] 保存開始 — item_id:', selectedRow.id, '/ value:', subPhone);
    const err = await updateCallListItem(selectedRow.id, { sub_phone_number: subPhone });
    if (err) {
      console.error('[subPhone] DB保存失敗 — call_list_items.sub_phone_numberカラムが存在しない可能性があります。SQL: ALTER TABLE call_list_items ADD COLUMN IF NOT EXISTS sub_phone_number TEXT;', err);
      return;
    }
    console.log('[subPhone] DB保存成功 — item_id:', selectedRow.id, '/ value:', subPhone);
    // DB保存後にメモリ上のitemsも更新（企業切り替え後に復元できるように）
    setItems(prev => prev.map(i => i.id === selectedRow.id ? { ...i, sub_phone_number: subPhone } : i));
    setSelectedRow(prev => prev?.id === selectedRow.id ? { ...prev, sub_phone_number: subPhone } : prev);
  };

  const inputStyle = { width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid ' + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', background: C.offWhite, boxSizing: 'border-box' };
  const labelStyle = { fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 2, display: 'block' };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: C.cream, zIndex: 10000, display: 'flex', flexDirection: 'column', fontFamily: "'Noto Sans JP'" }}>
      {/* ─── ヘッダー ─── */}
      <div style={{ padding: '10px 20px 8px', background: 'linear-gradient(135deg, ' + C.navyDeep + ', ' + C.navy + ')', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{list.company}</div>
            <div style={{ fontSize: 10, color: C.goldLight, marginTop: 1 }}>{list.industry} / 担当: {list.manager}</div>
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            {[
              { label: '総数',   value: stats.total,    color: C.white },
              { label: '架電済', value: stats.called,   color: C.goldLight },
              { label: '除外',   value: stats.excluded, color: '#fc8181' },
              { label: 'アポ',   value: stats.appo,     color: '#6fcf97' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: s.color, fontFamily: "'JetBrains Mono'", lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 9, color: C.white + '80', fontWeight: 600, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <button onClick={toggleAutoDial} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 10px', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
            border: '1px solid ' + (autoDial ? C.gold : C.white + '30'),
            background: autoDial ? C.gold : C.white + '10',
            color: autoDial ? C.navy : C.white + 'aa',
            fontSize: 10, fontWeight: 700, fontFamily: "'Noto Sans JP'",
          }}>
            <span style={{ fontSize: 12 }}>{autoDial ? '🔁' : '▶'}</span>
            オートコール {autoDial ? 'ON' : 'OFF'}
          </button>
          <button onClick={handleClose} style={{ width: 32, height: 32, borderRadius: 6, background: C.white + '15', border: '1px solid ' + C.white + '30', color: C.white, cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ height: 4, background: C.white + '20', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: progress + '%', height: '100%', background: 'linear-gradient(90deg, ' + C.goldLight + ', #6fcf97)', borderRadius: 2, transition: 'width 0.4s ease' }} />
        </div>
        <div style={{ fontSize: 9, color: C.white + '60', marginTop: 3, textAlign: 'right' }}>{progress}% 架電済（{stats.called} / {stats.total}件）</div>
      </div>

      {/* ─── ボディ（左右分割 + 下部パネル） ─── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── 左パネル：企業一覧 ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid ' + C.borderLight }}>
          <div style={{ padding: '8px 12px', background: C.white, borderBottom: '1px solid ' + C.borderLight, flexShrink: 0, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="企業名・代表者・電話番号で検索..."
              style={{ flex: 1, padding: '6px 12px', borderRadius: 6, border: '1px solid ' + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', boxSizing: 'border-box' }} />
            {[['callable','架電可能'],['all','全件'],['excluded','除外']].map(([mode, label]) => (
              <button key={mode} onClick={() => { setFilterMode(mode); setPage(0); }}
                style={{ padding: '4px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Noto Sans JP'", whiteSpace: 'nowrap',
                  background: filterMode === mode ? C.navy : 'transparent',
                  color: filterMode === mode ? C.white : C.textMid,
                  border: '1px solid ' + (filterMode === mode ? C.navy : C.border),
                }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: C.textLight, fontSize: 13 }}>読み込み中...</div>
            ) : !list._supaId ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: C.textLight, fontSize: 13 }}>Supabase未登録リストです</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: C.navyDeep, position: 'sticky', top: 0, zIndex: 1 }}>
                    {[['No', '36px'], ['企業名', null], ['事業内容', null], ['代表者', '90px'], ['電話番号', '112px'], ['結果', '76px']].map(([h, w]) => {
                      const isActive = sortState.column === h && sortState.direction === 'desc';
                      return (
                        <th key={h} onClick={() => handleSort(h)}
                          style={{ padding: '7px 8px', textAlign: 'left', fontSize: 9, fontWeight: 600, color: C.goldLight, letterSpacing: 0.5, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', ...(w ? { width: w } : {}) }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            {h}
                            <svg width="8" height="7" viewBox="0 0 8 7" style={{ flexShrink: 0 }}>
                              {isActive
                                ? <polygon points="2,7 8,7 5,2" fill={C.goldLight} />
                                : <polygon points="2,2 8,2 5,7" fill="none" stroke={C.goldLight + '80'} strokeWidth="1" />
                              }
                            </svg>
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((item, i) => {
                    const isSelected = selectedRow?.id === item.id;
                    const isCalled = item.call_status && item.call_status !== '未架電';
                    const sc = callStatusColor(item.call_status, item.is_excluded);
                    return (
                      <tr key={item.id} onClick={() => setSelectedRow(item)}
                        style={{ cursor: 'pointer', background: isSelected ? C.gold + '18' : isCalled ? '#f5f3ef' : i % 2 === 0 ? C.white : C.cream, borderLeft: isSelected ? '3px solid ' + C.gold : '3px solid transparent', transition: 'background 0.12s' }}>
                        <td style={{ padding: '6px 8px', fontFamily: "'JetBrains Mono'", fontSize: 9, color: C.textLight }}>{item.no}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 600, color: C.navy, maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.company}</td>
                        <td style={{ padding: '6px 8px', color: C.textMid, fontSize: 10, maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.business}</td>
                        <td style={{ padding: '6px 8px', color: C.textMid, fontSize: 10, whiteSpace: 'nowrap' }}>{item.representative}</td>
                        <td style={{ padding: '6px 8px' }}>
                          {item.phone
                            ? <span onClick={() => { dialPhone(item.phone); setSelectedRow(item); }} style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.navy, fontWeight: 600, padding: '2px 5px', borderRadius: 3, background: isCalled ? 'transparent' : C.gold + '25', whiteSpace: 'nowrap', cursor: 'pointer' }}>{item.phone}</span>
                            : <span style={{ color: C.textLight, fontSize: 10 }}>-</span>}
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3, fontWeight: 600, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>
                            {getRecordsForItem(item.id).length > 0
                              ? (() => {
                                  const recs = getRecordsForItem(item.id);
                                  const statusVal = item.call_status || recs.reduce((a, b) => a.round >= b.round ? a : b).status;
                                  return `${recs.length}回/${statusVal}`;
                                })()
                              : '未架電'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {totalPages > 1 && (
            <div style={{ padding: '8px 12px', borderTop: '1px solid ' + C.borderLight, background: C.white, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                style={{ padding: '4px 12px', borderRadius: 5, border: '1px solid ' + C.border, background: C.offWhite, cursor: page === 0 ? 'default' : 'pointer', fontSize: 11, color: page === 0 ? C.textLight : C.navy, fontFamily: "'Noto Sans JP'" }}>← 前</button>
              <span style={{ fontSize: 11, color: C.textMid }}>{page + 1} / {totalPages}（{sorted.length}件）</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                style={{ padding: '4px 12px', borderRadius: 5, border: '1px solid ' + C.border, background: C.offWhite, cursor: page === totalPages - 1 ? 'default' : 'pointer', fontSize: 11, color: page === totalPages - 1 ? C.textLight : C.navy, fontFamily: "'Noto Sans JP'" }}>次 →</button>
            </div>
          )}
        </div>

        {/* ── 右パネル：企業詳細 ── */}
        <div style={{ width: 380, flexShrink: 0, overflow: 'auto', background: C.white }}>
          {!selectedRow ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textLight, fontSize: 13, padding: 24, textAlign: 'center' }}>
              👈 左のリストから企業を選択してください
            </div>
          ) : (
            <div style={{ padding: 16 }}>
              {/* 企業名 */}
              <div style={{ fontSize: 17, fontWeight: 800, color: C.navy, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid ' + C.borderLight }}>
                {selectedRow.company}
              </div>

              {/* 📋 基本情報 */}
              {(() => {
                const recs = getRecordsForItem(selectedRow.id);
                const latest = recs.length > 0 ? recs.reduce((a, b) => a.round >= b.round ? a : b) : null;
                const lastResult = latest ? latest.status : '未架電';
                return (
                  <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid ' + C.borderLight }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 8 }}>📋 基本情報</div>
                    {[
                      { label: '事業内容', value: selectedRow.business },
                      { label: '住所', value: (selectedRow.address || '').replace(/\/\s*$/, '') },
                      { label: '代表者', value: selectedRow.representative },
                      { label: '前回架電結果', value: lastResult },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 11, color: C.textLight, flexShrink: 0, width: 84 }}>{label}</span>
                        <span style={{ fontSize: 13, color: C.navy, fontWeight: 500, flex: 1, wordBreak: 'break-all' }}>{value || '-'}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* 📊 詳細情報 */}
              {(() => {
                let parsedMemo = null;
                if (selectedRow.memo) { try { parsedMemo = JSON.parse(selectedRow.memo); } catch { /* plain text */ } }
                const netIncome = selectedRow.net_income ?? parsedMemo?.net_income ?? null;
                const biko = parsedMemo?.biko ?? (selectedRow.memo && !parsedMemo ? selectedRow.memo : null);
                return (
                  <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid ' + C.borderLight }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 8 }}>📊 詳細情報</div>
                    {[
                      { label: '売上', value: selectedRow.revenue != null ? Number(selectedRow.revenue).toLocaleString() + ' 千円' : '-' },
                      { label: '当期純利益', value: netIncome != null ? Number(netIncome).toLocaleString() + ' 千円' : '-' },
                      { label: '備考', value: biko || '-' },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 11, color: C.textLight, flexShrink: 0, width: 84 }}>{label}</span>
                        <span style={{ fontSize: 13, color: C.navy, fontWeight: 500, flex: 1, wordBreak: 'break-all' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* 電話発信ボタン */}
              {selectedRow.phone && (
                <div onClick={() => { dialPhone(selectedRow.phone); setLastDialedPhone(selectedRow.phone); }} style={{ display: 'block', marginBottom: 12, padding: '12px 16px', borderRadius: 10, background: 'linear-gradient(135deg, ' + C.navyDeep + ', ' + C.navy + ')', textAlign: 'center', boxShadow: '0 2px 8px ' + C.navy + '40', cursor: 'pointer' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.white + 'cc', marginBottom: 3 }}>📞 電話をかける</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: C.white, fontFamily: "'JetBrains Mono'" }}>{selectedRow.phone}</div>
                </div>
              )}

              {/* サブ電話番号入力・発信 */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
                <input
                  type="tel"
                  value={subPhone}
                  onChange={e => setSubPhone(e.target.value)}
                  onBlur={handleSubPhoneBlur}
                  placeholder="別の番号に架電"
                  style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid ' + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', background: C.offWhite, color: C.textDark }}
                />
                <button
                  onClick={() => { if (!subPhone.trim()) return; dialPhone(subPhone.trim()); setLastDialedPhone(subPhone.trim()); }}
                  disabled={!subPhone.trim()}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid ' + C.border, background: C.white, cursor: subPhone.trim() ? 'pointer' : 'default', fontSize: 13, opacity: subPhone.trim() ? 1 : 0.4, lineHeight: 1 }}
                >📞</button>
              </div>

              {/* ラウンドボタン */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 5, letterSpacing: 0.5 }}>架電ラウンド選択</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[1,2,3,4,5,6,7,8].map(r => {
                    const roundRec = getRecordsForItem(selectedRow.id).find(rec => rec.round === r);
                    const nextRound = getNextRound(selectedRow.id);
                    const isCompleted = !!roundRec;
                    const isCurrent = r === nextRound && !isCompleted;
                    const isFuture = r > nextRound;
                    const isSelected = r === selectedRound;
                    const bg = isCompleted ? C.border : isCurrent ? C.gold : 'transparent';
                    const color = isCompleted ? C.textLight : isCurrent ? C.navy : C.textLight;
                    const border = isSelected
                      ? '2px solid ' + C.navy
                      : isFuture ? '1px solid ' + C.borderLight
                      : isCompleted ? '1px solid ' + C.border
                      : '1px solid ' + C.gold;
                    return (
                      <button key={r} disabled={isFuture}
                        onClick={() => !isFuture && setSelectedRound(r)}
                        style={{ width: 34, height: 34, borderRadius: 6, fontSize: 12, fontWeight: 700,
                          background: bg, color, border, cursor: isFuture ? 'default' : 'pointer',
                          fontFamily: "'JetBrains Mono'", opacity: isFuture ? 0.3 : 1, flexShrink: 0,
                        }}>
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ステータスエリア：ラウンド記録済み→バッジ+取消 / 未記録→8ボタン */}
              {(() => {
                const roundRec = getRecordsForItem(selectedRow.id).find(r => r.round === selectedRound);
                const sc = roundRec ? callStatusColor(roundRec.status) : null;
                return roundRec ? (
                  <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 8,
                    background: sc.bg, border: '1.5px solid ' + sc.color + '40',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: sc.color }}>
                      {selectedRound}回目の結果：{roundRec.status}
                    </span>
                    <button onClick={() => handleDeleteRecord(roundRec)}
                      style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4,
                        border: '1px solid ' + C.border, background: C.white,
                        cursor: 'pointer', color: C.textMid, fontFamily: "'Noto Sans JP'" }}>取消</button>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
                    {CALL_RESULTS.map(r => {
                      const isAppo = r.id === 'appointment';
                      const isExcl = r.id === 'excluded';
                      const btnBg    = isAppo ? C.gold    : isExcl ? C.red + '10' : C.navy + '08';
                      const btnColor = isAppo ? C.white   : isExcl ? C.red        : C.navy;
                      const btnBdr   = isAppo ? '1.5px solid ' + C.gold : isExcl ? '1.5px solid ' + C.red + '40' : '1px solid ' + C.navy + '25';
                      return (
                        <button key={r.id} onClick={() => { console.log('[ステータスボタン] クリック:', r.label, '/ selectedRow:', selectedRow?.id, '/ selectedRound:', selectedRound); handleResult(r.label); }}
                          style={{ padding: '9px 6px', borderRadius: 7, border: btnBdr, background: btnBg, color: btnColor, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: "'Noto Sans JP'", lineHeight: 1.2 }}>
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}

              {/* メモ（onBlurで自動保存） */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  メモ
                  {savingMemo && <span style={{ fontSize: 9, color: C.textLight, fontWeight: 400 }}>保存中...</span>}
                </div>
                <textarea value={localMemo} onChange={e => setLocalMemo(e.target.value)} onBlur={handleMemoBlur}
                  placeholder="架電メモを入力（フォーカスを外すと自動保存）..."
                  style={{ width: '100%', minHeight: 72, padding: '8px', borderRadius: 6, border: '1px solid ' + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', resize: 'vertical', boxSizing: 'border-box', background: C.offWhite }} />
              </div>

              {/* 架電履歴 */}
              {(() => {
                const recs = getRecordsForItem(selectedRow.id).slice().sort((a, b) => a.round - b.round);
                if (recs.length === 0) return null;
                return (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 6 }}>📋 架電履歴</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {recs.map(rec => {
                        const sc = callStatusColor(rec.status);
                        const dt = rec.called_at ? new Date(rec.called_at) : null;
                        const dtStr = dt
                          ? `${dt.getMonth()+1}/${dt.getDate()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`
                          : '';
                        return (
                          <div key={rec.id}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                              padding: '5px 8px', borderRadius: 5, background: C.offWhite, fontSize: 11 }}>
                              <span style={{ fontWeight: 700, color: C.navy, minWidth: 36, fontFamily: "'JetBrains Mono'", fontSize: 10 }}>{rec.round}回目</span>
                              <span style={{ flex: 1, color: sc.color, fontWeight: 600 }}>{rec.status}</span>
                              <span style={{ color: C.textLight, fontSize: 10 }}>{dtStr}</span>
                              {rec.recording_url
                                ? <button
                                    onClick={() => setActiveRecordingId(activeRecordingId === rec.id ? null : rec.id)}
                                    title={activeRecordingId === rec.id ? "閉じる" : "録音を再生"}
                                    style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
                                      padding: 0, lineHeight: 1, color: activeRecordingId === rec.id ? C.red : 'inherit' }}>🎙</button>
                                : <button onClick={() => handleFetchRecording(rec)}
                                    title="録音URLを手動取得"
                                    style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>🔄</button>
                              }
                            </div>
                            {activeRecordingId === rec.id && rec.recording_url && (
                              <InlineAudioPlayer url={rec.recording_url} onClose={() => setActiveRecordingId(null)} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

            </div>
          )}
        </div>
      </div>

      {/* ── 下部スクリプトパネル ── */}
      <div style={{ flexShrink: 0, background: C.white, borderTop: '2px solid ' + C.gold }}>
        <div onClick={() => setScriptPanelOpen(p => !p)}
          style={{ cursor: 'pointer', padding: '5px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none', background: C.gold + '08' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>📝 スクリプト</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {scriptPanelOpen && [
              { key: 'script',   label: '📝 スクリプト' },
              { key: 'info',     label: '🏢 企業概要' },
              { key: 'cautions', label: '⚠ 注意事項' },
            ].map(tab => (
              <button key={tab.key} onClick={e => { e.stopPropagation(); setScriptTab(tab.key); }}
                style={{ fontSize: 9, padding: '2px 10px', borderRadius: 4, border: scriptTab === tab.key ? '1px solid ' + C.gold : '1px solid ' + C.borderLight, background: scriptTab === tab.key ? C.gold + '20' : C.white, color: scriptTab === tab.key ? C.navy : C.textMid, cursor: 'pointer', fontFamily: "'Noto Sans JP'", fontWeight: scriptTab === tab.key ? 700 : 400 }}>
                {tab.label}
              </button>
            ))}
            <span style={{ fontSize: 11, color: C.textMid, lineHeight: 1 }}>{scriptPanelOpen ? '▲' : '▼'}</span>
          </div>
        </div>
        {scriptPanelOpen && (
          <div style={{ height: 120, overflowY: 'auto', padding: '8px 16px' }}>
            {scriptTab === 'script' && (
              list.scriptBody
                ? <pre style={{ fontSize: 11, color: C.textDark, whiteSpace: 'pre-wrap', lineHeight: 1.7, margin: 0, fontFamily: "'Noto Sans JP'" }}>{list.scriptBody}</pre>
                : <div style={{ color: C.textLight, fontSize: 11 }}>スクリプト未設定</div>
            )}
            {scriptTab === 'info' && (
              list.companyInfo
                ? <pre style={{ fontSize: 11, color: C.textMid, whiteSpace: 'pre-wrap', lineHeight: 1.7, margin: 0, fontFamily: "'Noto Sans JP'" }}>{list.companyInfo}</pre>
                : <div style={{ color: C.textLight, fontSize: 11 }}>企業概要未設定</div>
            )}
            {scriptTab === 'cautions' && (
              list.cautions
                ? <pre style={{ fontSize: 11, color: C.orange, whiteSpace: 'pre-wrap', lineHeight: 1.7, margin: 0, fontFamily: "'Noto Sans JP'" }}>{list.cautions}</pre>
                : <div style={{ color: C.textLight, fontSize: 11 }}>注意事項未設定</div>
            )}
          </div>
        )}
      </div>
      </div>

      {/* ─── アポ取得報告モーダル ─── */}
      {appoModal && (
        <AppoReportModal
          row={appoModal}
          list={list}
          currentUser={currentUser}
          members={members}
          onClose={() => setAppoModal(null)}
          onSave={handleAppoSave}
          initialRecordingUrl={
            callRecords
              .filter(r => r.item_id === appoModal.id && r.recording_url)
              .sort((a, b) => (b.called_at || '').localeCompare(a.called_at || ''))[0]?.recording_url || ''
          }
          onFetchRecordingUrl={() => handleAppoFetchRecording(appoModal.id, appoModal.phone)}
        />
      )}

      {/* ─── 再コール日時設定モーダル ─── */}
      {recallModal && (
        <RecallModal
          row={recallModal.row}
          statusId={recallModal.statusId}
          onSubmit={handleRecallSave}
          onCancel={() => setRecallModal(null)}
          members={members}
        />
      )}
    </div>
  );
}

function DetailModal({ list, callLogs, onClose, onAddLog, industryRules, now, callListData, setCallListData, setCallFlowScreen, isAdmin, onDelete }) {
  if (!list) return null;
  const listLogs = callLogs.filter(l => l.listId === list.id).reverse();
  const cat = getIndustryCategory(list.industry);
  const rule = industryRules.find(r => r.industry === cat);

  const isOutsideHours = list.recommendation?.isOutsideHours;

  const [csvImported, setCsvImported] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteList = async () => {
    if (!list._supaId) { alert('このリストはSupabase IDが未設定のためクリアできません。'); return; }
    if (!window.confirm('インポート済みのデータをクリアしますか？リストの箱は残ります')) return;
    setDeleting(true);
    const e1 = await deleteCallRecordsByListId(list._supaId);
    if (e1) { alert('架電履歴の削除に失敗しました: ' + (e1.message || '不明なエラー')); setDeleting(false); return; }
    const e2 = await deleteCallListItemsByListId(list._supaId);
    if (e2) { alert('企業データの削除に失敗しました: ' + (e2.message || '不明なエラー')); setDeleting(false); return; }
    const e3 = await updateCallList(list._supaId, { ...list, count: 0 });
    if (e3) { alert('件数更新に失敗しました: ' + (e3.message || '不明なエラー')); setDeleting(false); return; }
    setDeleting(false);
    setItemCount(0);
    setCsvImported(false);
    if (setCallListData) setCallListData(prev => prev.map(l => l.id === list.id ? { ...l, count: 0 } : l));
    alert('CSVデータをクリアしました');
    onClose();
  };
  const [flowStartNo, setFlowStartNo] = useState('');
  const [flowEndNo, setFlowEndNo] = useState('');
  const [itemCount, setItemCount] = useState(null);
  const [selectedStatuses, setSelectedStatuses] = useState([]); // 空配列=全ステータス

  useEffect(() => {
    if (!list._supaId) {
      console.log('[DetailModal] _supaId が未設定のため call_list_items を取得できません');
      return;
    }
    fetchCallListItems(list._supaId).then(({ data }) => {
      const count = data?.length ?? 0;
      console.log('[DetailModal] call_list_items 件数 (list._supaId=' + list._supaId + '):', count);
      setItemCount(count);
    });
  }, [list._supaId]);

  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    console.log('[CSV取込] ファイル選択:', file.name, '/ list._supaId:', list._supaId);
    if (!list._supaId) {
      alert('このリストはSupabase IDが未設定のためインポートできません。');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      console.log('[CSV取込] 行数 (ヘッダー含む):', lines.length);
      if (lines.length < 2) {
        alert('CSVが空か、データ行がありません。');
        return;
      }

      const normalizeHeader = (s) => s
        .replace(/^\uFEFF/, '').trim()
        .replace(/\u3000/g, ' ')
        .replace(/（/g, '(').replace(/）/g, ')')
        .replace(/．/g, '.').replace(/／/g, '/')
        .replace(/[Ａ-Ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(/[ａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

      const parseCSVLine = (line) => {
        const result = []; let cur = ''; let inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (!inQ) { inQ = true; }
            else if (line[i + 1] === '"') { cur += '"'; i++; }
            else { inQ = false; }
          } else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
          else { cur += ch; }
        }
        result.push(cur.trim());
        return result;
      };

      const rawHeaders = parseCSVLine(lines[0]).map(normalizeHeader);
      console.log('[CSV取込] 正規化ヘッダー:', rawHeaders);

      const detectUnit = (h) => {
        if (h.includes('(億円)')) return '億円';
        if (h.includes('(百万円)')) return '百万円';
        if (h.includes('(千円)')) return '千円';
        if (h.includes('(円)')) return '円';
        return '千円';
      };
      const toSenEn = (val, unit) => {
        const n = parseFloat(String(val).replace(/,/g, '').replace(/[^\d.-]/g, ''));
        if (isNaN(n)) return null;
        if (unit === '円') return Math.floor(n / 1000);
        if (unit === '百万円') return Math.floor(n * 1000);
        if (unit === '億円') return Math.floor(n * 100000);
        return Math.floor(n);
      };
      const parseNum = (val) => {
        if (!val && val !== 0) return null;
        const n = parseFloat(String(val).replace(/,/g, '').replace(/[^\d.-]/g, ''));
        return isNaN(n) ? null : n;
      };
      const getField = (h) => {
        const base = h.replace(/\(.*?\)/g, '').trim();
        if (/^(No\.|NO|no|No|番号)$/.test(h)) return 'no';
        if (base === '企業名' || base === '会社名' || base === '社名') return 'company';
        if (base === '事業内容' || base === '事業概要' || base === '業種' || base === '業態') return 'business';
        if (base === '代表者名' || base === '代表者' || base === '代表') return 'representative';
        if (base === '電話番号' || base === '電話' || base.toUpperCase() === 'TEL') return 'phone';
        if (base === '住所' || base === '所在地') return 'address';
        if (base === '都道府県') return 'pref';
        if (base === '市区町村' || base === '市町村' || base === '区市町村') return 'city';
        if (base === '番地' || base === '番地以降' || base === '番地・号' || base === '丁目番地') return 'ward';
        if (base === '売上高' || base === '売上') return 'revenue';
        if (base === '当期純利益' || base === '純利益') return 'net_income';
        if (base === '備考' || base === 'メモ' || base === '注記') return 'memo_text';
        if (base === '従業員数' || base === '社員数' || base === '従業員') return 'employees';
        if (base === 'URL' || base === 'url' || base === 'HP' || base.includes('ホームページ')) return 'url';
        if (base === '代表者年齢' || base === '年齢') return 'age';
        return null;
      };

      const fieldIndices = {};
      const unknownCols = [];
      rawHeaders.forEach((h, idx) => {
        const field = getField(h);
        if (field) {
          if (!fieldIndices[field]) {
            const unit = (field === 'revenue' || field === 'net_income') ? detectUnit(h) : null;
            fieldIndices[field] = { idx, unit };
          }
        } else {
          unknownCols.push({ idx, header: h });
        }
      });
      console.log('[CSV取込] マッピング結果:', fieldIndices, '/ 未知列:', unknownCols.map(c => c.header));

      const revenueUnit = fieldIndices.revenue?.unit || '千円';
      const netIncomeUnit = fieldIndices.net_income?.unit || '千円';

      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length < 2 || cols.every(c => !c)) continue;
        const get = (field) => {
          const fi = fieldIndices[field];
          return fi ? ((cols[fi.idx] || '').trim()) : '';
        };
        const addrRaw = get('address');
        const prefVal = get('pref');
        const cityVal = get('city');
        const wardVal = get('ward');
        let address = '';
        if (addrRaw) {
          address = (prefVal && !addrRaw.startsWith(prefVal)) ? prefVal + addrRaw : addrRaw;
        } else {
          address = prefVal + cityVal + wardVal;
        }
        address = address.replace(/\/\s*$/, '');
        const extraInfo = {};
        const memoText = get('memo_text');
        if (memoText) extraInfo.biko = memoText;
        const ageVal = get('age');
        if (ageVal) extraInfo.age = ageVal;
        unknownCols.forEach(({ idx, header }) => {
          const v = (cols[idx] || '').trim();
          if (v) extraInfo[header] = v;
        });
        // フォーミュラインジェクション対策: =,+,-,@,タブ,改行で始まる文字列の先頭にシングルクォートを付加
        const sanitizeCSV = (v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : v);
        // 電話番号正規化: 数字のみ抽出 → 先頭0補完
        const normalizePhone = (v) => { const d = v.replace(/[^\d]/g, ''); return d ? (d.startsWith('0') ? d : '0' + d) : ''; };

        rows.push({
          no: rows.length + 1,
          company: sanitizeCSV(get('company') || ''),
          business: sanitizeCSV(get('business') || ''),
          address: sanitizeCSV(address),
          representative: sanitizeCSV(get('representative') || ''),
          phone: normalizePhone(get('phone') || ''),
          revenue: (() => { const v = get('revenue'); return v ? toSenEn(v, revenueUnit) : null; })(),
          net_income: (() => { const v = get('net_income'); return v ? toSenEn(v, netIncomeUnit) : null; })(),
          employees: (() => { const v = get('employees'); return v ? parseNum(v) : null; })(),
          url: get('url') || null,
          memo: Object.keys(extraInfo).length > 0 ? JSON.stringify(extraInfo) : null,
        });
      }

      console.log('[CSV取込] パース完了 — 行数:', rows.length, '/ 先頭3件:', rows.slice(0, 3));
      if (rows.length === 0) {
        alert('CSVのパース結果が0件です。ヘッダー名を確認してください。\n検出したヘッダー: ' + rawHeaders.join(', '));
        return;
      }

      setCsvImporting(true);
      console.log('[CSV取込] insertCallListItems 呼び出し — supaId:', list._supaId, '/ 件数:', rows.length);
      const { data, error } = await insertCallListItems(list._supaId, rows);
      setCsvImporting(false);
      if (error) {
        console.error('[CSV取込] Supabase エラー:', error);
        alert('CSV取込に失敗しました: ' + (error.message || JSON.stringify(error)));
        return;
      }
      console.log('[CSV取込] Supabaseに保存完了:', rows.length, '件 / 返却data:', data?.length, '件');
      setCsvImported(rows.length);
      setItemCount(prev => (prev ?? 0) + (data?.length ?? rows.length));
    };
    reader.readAsText(file, "UTF-8");
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(10,25,41,0.6)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 200, animation: "fadeIn 0.2s ease",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.white, border: "1px solid " + C.borderLight,
        borderRadius: 14, width: "90%", maxWidth: 820, maxHeight: "85vh",
        overflowY: "auto", padding: 28,
        boxShadow: "0 20px 60px rgba(10,25,41,0.25)",
      }}>

        {/* ── タイトル行 ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.navy, marginBottom: 6, fontFamily: "'Noto Serif JP', serif" }}>{list.company}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Badge color={C.navy} glow>{list.type}</Badge>
              <Badge color={list.status === "架電可能" ? C.gold : C.red} glow>{list.status}</Badge>
              <Badge color={C.goldDim} glow>{list.industry}</Badge>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 6, background: C.offWhite, border: "1px solid " + C.border, color: C.textMid, cursor: "pointer", fontSize: 16, flexShrink: 0 }}>✕</button>
        </div>

        {/* (a) おすすめ度合い・総合スコア */}
        {isOutsideHours ? (
          <div style={{ padding: "12px 16px", borderRadius: 8, background: C.offWhite, border: "1px solid " + C.borderLight, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>🌙</span>
            <span style={{ fontSize: 12, color: C.textMid, fontWeight: 600 }}>この時間帯は架電時間外です</span>
            <span style={{ fontSize: 10, color: C.textLight }}>（7:00〜20:00が架電推奨時間帯）</span>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1.2, padding: "14px 18px", borderRadius: 8, background: C.navy + "06", border: "1px solid " + C.navy + "15" }}>
              <div style={{ fontSize: 10, color: C.textLight, marginBottom: 6, fontWeight: 600 }}>総合スコア</div>
              <ScorePill score={list.recommendation.score} label={list.recommendation.label} color={list.recommendation.color} />
            </div>
            <div style={{ flex: 1, padding: "14px 18px", borderRadius: 8, background: C.offWhite, border: "1px solid " + C.borderLight }}>
              <div style={{ fontSize: 10, color: C.textLight, marginBottom: 6, fontWeight: 600 }}>時間帯スコア（30%）</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono'", color: C.navy }}>{list.recommendation.timeScore}</span>
                <span style={{ fontSize: 11, color: C.textLight }}>{list.recommendation.timeLabel}</span>
              </div>
            </div>
            <div style={{ flex: 1, padding: "14px 18px", borderRadius: 8, background: C.offWhite, border: "1px solid " + C.borderLight }}>
              <div style={{ fontSize: 10, color: C.textLight, marginBottom: 6, fontWeight: 600 }}>架電頻度スコア（70%）</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono'", color: C.navy }}>{list.recommendation.recencyScore}</span>
                <span style={{ fontSize: 11, color: C.textLight }}>{list.recommendation.recencyLabel || "未架電"}</span>
              </div>
            </div>
            <div style={{ flex: 0.7, padding: "14px 18px", borderRadius: 8, background: C.offWhite, border: "1px solid " + C.borderLight }}>
              <div style={{ fontSize: 10, color: C.textLight, marginBottom: 6, fontWeight: 600 }}>リスト企業数</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono'", color: C.navy }}>{list.count.toLocaleString()}</div>
            </div>
          </div>
        )}

        {/* (b) クライアント情報 | 注意事項 — 横並び */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, padding: "12px 16px", borderRadius: 8, background: C.offWhite, border: "1px solid " + C.borderLight }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 10, letterSpacing: 0.5 }}>🏢 クライアント情報</div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 11 }}>
              {[
                ["担当者", list.manager],
                ["業種",   list.industry],
                ["企業数", list.count.toLocaleString() + "社"],
                ["リストタイプ", list.type],
              ].map(([k, v]) => v ? [
                <span key={k + "_k"} style={{ color: C.textLight, whiteSpace: "nowrap" }}>{k}</span>,
                <span key={k + "_v"} style={{ color: C.textDark, fontWeight: 600 }}>{v}</span>,
              ] : null)}
            </div>
            {list.companyInfo && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid " + C.borderLight }}>
                <div style={{ fontSize: 10, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>企業概要</div>
                <div style={{ fontSize: 11, color: C.textMid, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{list.companyInfo}</div>
              </div>
            )}
          </div>
          <div style={{ flex: 1, padding: "12px 16px", borderRadius: 8, background: C.offWhite, border: "1px solid " + C.borderLight }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 8, letterSpacing: 0.5 }}>⚠ 注意事項</div>
            {list.cautions
              ? <div style={{ fontSize: 11, color: C.textDark, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{list.cautions}</div>
              : <div style={{ fontSize: 11, color: C.textLight }}>注意事項はありません</div>
            }
          </div>
        </div>

        {/* (c) 業界架電ルール */}
        {rule && (
          <div style={{ padding: "12px 16px", borderRadius: 8, background: C.offWhite, border: "1px solid " + C.borderLight, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.navy, marginBottom: 6 }}>📋 {cat}の架電ルール</div>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: C.textDark }}>{rule.rule}</div>
            <div style={{ display: "flex", gap: 16, fontSize: 11, marginBottom: 8 }}>
              {rule.goodHours && <div><span style={{ color: C.textLight }}>推奨: </span><span style={{ color: C.navy, fontWeight: 600 }}>{rule.goodHours}</span></div>}
              {rule.badHours && <div><span style={{ color: C.textLight }}>非推奨: </span><span style={{ color: C.red }}>{rule.badHours}</span></div>}
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              {DAY_NAMES.map((d, i) => (
                <span key={i} style={{
                  padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: 600,
                  background: rule.badDays.includes(i) ? C.red + "15" : rule.goodDays.includes(i) ? C.gold + "20" : C.offWhite,
                  color: rule.badDays.includes(i) ? C.red : rule.goodDays.includes(i) ? C.navy : C.textLight,
                  border: "1px solid " + (rule.badDays.includes(i) ? C.red + "30" : rule.goodDays.includes(i) ? C.gold + "50" : C.border),
                }}>{d}</span>
              ))}
            </div>
          </div>
        )}

        {/* (d) スクリプト・備考・CSVリスト */}
        {list.scriptBody && (
          <div style={{ padding: "12px 16px", borderRadius: 8, background: C.navy + "04", border: "1px solid " + C.navy + "12", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 6, letterSpacing: 0.5 }}>📝 スクリプト</div>
            <div style={{ fontSize: 12, color: C.textDark, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{list.scriptBody}</div>
          </div>
        )}

        {list.notes && (
          <div style={{ padding: "10px 14px", borderRadius: 6, background: C.offWhite, border: "1px solid " + C.borderLight, fontSize: 12, color: C.textMid, marginBottom: 12 }}>
            <span style={{ fontWeight: 600, color: C.navy }}>備考: </span>{list.notes}
          </div>
        )}

        {/* 架電開始 + CSV取込 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: C.textMid, whiteSpace: "nowrap" }}>No.</span>
          <input
            type="number" value={flowStartNo} onChange={e => setFlowStartNo(e.target.value)} placeholder="開始"
            style={{ width: 64, padding: "5px 8px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'JetBrains Mono'", textAlign: "center", outline: "none" }}
          />
          <span style={{ fontSize: 11, color: C.textMid }}>〜</span>
          <input
            type="number" value={flowEndNo} onChange={e => setFlowEndNo(e.target.value)} placeholder="終了"
            style={{ width: 64, padding: "5px 8px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'JetBrains Mono'", textAlign: "center", outline: "none" }}
          />
          <button
            onClick={() => {
              const sf = selectedStatuses.length > 0 ? selectedStatuses : null;
              console.log('[DetailModal] 架電開始 clicked — list:', list, 'startNo:', flowStartNo, 'endNo:', flowEndNo, 'statusFilter:', sf);
              setCallFlowScreen({ list, startNo: flowStartNo ? parseInt(flowStartNo) : undefined, endNo: flowEndNo ? parseInt(flowEndNo) : undefined, statusFilter: sf });
            }}
            style={{
              padding: "6px 20px", borderRadius: 6,
              background: C.navy, color: C.white, cursor: "pointer",
              fontSize: 11, fontWeight: 700, fontFamily: "'Noto Sans JP'",
              border: "none",
            }}
          >架電開始</button>
          {itemCount !== null && (
            <span style={{ fontSize: 10, color: C.textLight }}>
              リスト: {itemCount.toLocaleString()}件
            </span>
          )}
        </div>

        {/* ステータス絞り込みボタン */}
        {(() => {
          const STATUS_LABELS = ['未架電', ...CALL_RESULTS.map(r => r.label)];
          const isAll = selectedStatuses.length === 0;
          const toggleStatus = (label) => {
            if (label === '全ステータス') {
              setSelectedStatuses([]);
              return;
            }
            setSelectedStatuses(prev => {
              if (prev.includes(label)) {
                return prev.filter(s => s !== label);
              }
              return [...prev, label];
            });
          };
          return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
              {['全ステータス', ...STATUS_LABELS].map(label => {
                const isActive = label === '全ステータス' ? isAll : selectedStatuses.includes(label);
                return (
                  <button
                    key={label}
                    onClick={() => toggleStatus(label)}
                    style={{
                      padding: '3px 9px', borderRadius: 4, cursor: 'pointer',
                      fontSize: 10, fontWeight: 600, fontFamily: "'Noto Sans JP'",
                      background: isActive ? C.navy : C.offWhite,
                      color: isActive ? C.white : C.textMid,
                      border: '1px solid ' + (isActive ? C.navy : C.border),
                      transition: 'all 0.12s',
                    }}
                  >{label}</button>
                );
              })}
            </div>
          );
        })()}

        {/* CSV取込 / リスト削除（管理者のみ） */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
          {isAdmin && <>
            <label style={{
              padding: "6px 16px", borderRadius: 6,
              background: C.offWhite, color: C.navy, cursor: "pointer",
              fontSize: 11, fontWeight: 600, fontFamily: "'Noto Sans JP'",
              border: "1px solid " + C.border,
              opacity: csvImporting ? 0.6 : 1,
              pointerEvents: csvImporting ? "none" : "auto",
            }}>
              {csvImporting ? "取込中..." : "CSV取込"}
              <input type="file" accept=".csv" onChange={handleCSVImport} style={{ display: "none" }} />
            </label>
            <button
              onClick={handleDeleteList}
              disabled={deleting}
              style={{
                padding: "6px 16px", borderRadius: 6,
                background: deleting ? "#ccc" : "#e53835",
                color: "#fff", cursor: deleting ? "default" : "pointer",
                fontSize: 11, fontWeight: 600, fontFamily: "'Noto Sans JP'",
                border: "none", opacity: deleting ? 0.6 : 1,
              }}
            >{deleting ? "クリア中..." : "CSVクリア"}</button>
          </>}
          {csvImported && (
            <span style={{ fontSize: 11, color: C.green, fontWeight: 600 }}>
              ✓ {csvImported}件をSupabaseに保存しました
            </span>
          )}
          {!list._supaId && (
            <span style={{ fontSize: 10, color: C.textLight }}>※ Supabase IDが未設定のためインポートできません</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Script View (スクリプトページ)
// ============================================================
const DEFAULT_BASIC_SCRIPT = `■受付編
(篠宮)〇〇(クライアント名)の篠宮です!お世話様です!〇〇社長をお願いします!
(受付)ご用件はなんでしょうか?
(篠宮)〇〇(架電先企業の市区町村)市の〇〇(架電先企業の業界)アライアンスの件とお伝えください!
(受付)少々お待ちください。
(篠宮)お願いします!

■社長編
(社長)はい、〇〇です。
(篠宮)お世話になっております!私、〇〇(クライアント名)の篠宮と申します。〇〇社長、ただいまお時間1分だけよろしいでしょうか?すぐ終わらせます!
(社長)どうぞ。
(篠宮)ありがとうございます!まず我々が、〇〇(架電先企業の業界)業界に特化をして、いわるゆる資本提携のご支援をしておりまして、今回、我々と従前からお付き合いのある会社が、御社のような会社とぜひとも一緒に成長したいという、お話が上がっておりましてですね、そのお相手様が具体的にどういった会社で、どういった経緯でこのようなお話が上がったのか、そちらについてぜひともお話させていただきたく思っておりまして、で社長もなかなかお忙しいことかと思いますが、〇月〇日の〇曜日と〇日の〇曜日に、私の上長の者がちょうど御社のすぐ近くにおりましてですね、その際にぜひともそちらのお話をさせていただければと思いますが、〇〇社長、〇月〇日と〇日でしたら、どちらのほうが比較的ご都合よろしいでしょうか。
(社長)〇月〇日の13時だったら大丈夫。
(篠宮)ありがとうございます!お伺いさせていただく住所は、〇〇（リストに記載の住所）でお間違いございませんでしょうか?
(社長)そうです。
(篠宮)ありがとうございます!でしたら、〇月〇日の13時に、私の上長の〇〇という者がお伺いさせていただきますので、どうぞよろしくお願いいたします!
(社長)はーい、お願いします。
(篠宮)お忙しいところお時間を頂きましてありがとうございました!失礼いたします!`;

function ScriptView({ isAdmin, clientData, callListData }) {
  const [basicScript, setBasicScript] = useState(() => {
    try { return localStorage.getItem("basic_script") || DEFAULT_BASIC_SCRIPT; } catch(e) { return DEFAULT_BASIC_SCRIPT; }
  });
  const [basicScriptEdit, setBasicScriptEdit] = useState(() => {
    try { return localStorage.getItem("basic_script") || DEFAULT_BASIC_SCRIPT; } catch(e) { return DEFAULT_BASIC_SCRIPT; }
  });
  const [savedOk, setSavedOk] = useState(false);
  const [clientTabs, setClientTabs] = useState({});
  const [videoOpen, setVideoOpen] = useState(false);
  const VIDEO_ID = '1j465Gq-MIEqzcL3LreZmNRaC1zhWtHdt';

  const handleSaveBasicScript = () => {
    try { localStorage.setItem("basic_script", basicScriptEdit); } catch(e) {}
    setBasicScript(basicScriptEdit);
    setSavedOk(true);
    setTimeout(() => setSavedOk(false), 2000);
  };

  const activeClients = (clientData || []).filter(c => c.status === '支援中');

  return (
    <div style={{ animation: "fadeIn 0.3s ease", padding: "0 0 40px 0" }}>
      {/* 基本スクリプト */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700, color: C.navy }}>基本スクリプト</h2>

        <div style={{ background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight, padding: "16px 20px" }}>
          {isAdmin ? (
            <textarea
              value={basicScriptEdit}
              onChange={e => setBasicScriptEdit(e.target.value)}
              rows={10}
              style={{ width: "100%", border: "none", outline: "none", resize: "vertical",
                fontSize: 13, color: C.textDark, fontFamily: "'Noto Sans JP', sans-serif",
                background: "transparent", lineHeight: 1.8, boxSizing: "border-box" }}
              placeholder="基本スクリプトを入力してください..."
            />
          ) : (
            <div style={{ fontSize: 13, color: C.textDark, lineHeight: 1.8, whiteSpace: "pre-wrap", minHeight: 120 }}>
              {basicScript || <span style={{ color: C.textLight, fontStyle: "italic" }}>（スクリプト未設定）</span>}
            </div>
          )}
        </div>

        {/* 参考動画サムネイル */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 6 }}>📹 参考動画</div>
          <div onClick={() => setVideoOpen(true)}
            style={{ position: "relative", width: 200, height: 120, borderRadius: 8,
              overflow: "hidden", cursor: "pointer",
              boxShadow: "0 2px 10px rgba(0,0,0,0.18)", display: "inline-block" }}>
            <img
              src={`https://drive.google.com/thumbnail?id=${VIDEO_ID}&sz=w400`}
              alt="参考動画サムネイル"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.28)",
              display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 42, height: 42, borderRadius: "50%",
                background: "rgba(255,255,255,0.88)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 17, paddingLeft: 3 }}>
                ▶
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* クライアント別スクリプト */}
      <div>
        <h2 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700, color: C.navy }}>クライアント別スクリプト</h2>
        {activeClients.length === 0 ? (
          <div style={{ color: C.textLight, fontSize: 13, padding: "20px 0" }}>支援中のクライアントがありません</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {activeClients.map((client, cIdx) => {
              const lists = (callListData || []).filter(l => l.company === client.company && l.scriptBody);
              const allIndustries = [...new Set((callListData || []).filter(l => l.company === client.company).map(l => l.industry).filter(Boolean))];
              const activeTab = clientTabs[cIdx] ?? 0;
              const activeList = lists.find(l => l.industry === allIndustries[activeTab]) || lists[0];
              return (
                <div key={client._supaId || cIdx}
                  style={{ background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight, overflow: "hidden" }}>
                  <div style={{ background: C.navy, padding: "10px 16px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.white, wordBreak: "break-all" }}>{client.company}</div>
                    <div style={{ fontSize: 10, color: C.textLight, marginTop: 2 }}>{client.industry || ''}</div>
                  </div>
                  {allIndustries.length > 1 && (
                    <div style={{ display: "flex", overflowX: "auto", borderBottom: "1px solid " + C.borderLight, background: C.offWhite }}>
                      {allIndustries.map((ind, iIdx) => (
                        <button key={iIdx}
                          onClick={() => setClientTabs(prev => ({ ...prev, [cIdx]: iIdx }))}
                          style={{ padding: "5px 12px", border: "none", cursor: "pointer",
                            fontSize: 10, fontWeight: activeTab === iIdx ? 700 : 400,
                            background: "transparent",
                            color: activeTab === iIdx ? C.navy : C.textLight,
                            borderBottom: "2px solid " + (activeTab === iIdx ? C.gold : "transparent"),
                            whiteSpace: "nowrap", fontFamily: "'Noto Sans JP'" }}>
                          {ind}
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ padding: "14px 16px", maxHeight: 220, overflowY: "auto" }}>
                    {activeList?.scriptBody ? (
                      <div style={{ fontSize: 12, color: C.textDark, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                        {activeList.scriptBody}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: C.textLight, fontStyle: "italic" }}>スクリプト未設定</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 動画モーダル */}
      {videoOpen && (
        <div onClick={() => setVideoOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9500,
            display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ position: "relative", width: "80vw", maxWidth: 800, borderRadius: 8,
              overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,0.4)" }}>
            <button onClick={() => setVideoOpen(false)}
              style={{ position: "absolute", top: 8, right: 8, zIndex: 1,
                width: 32, height: 32, borderRadius: "50%",
                background: "rgba(0,0,0,0.55)", border: "none",
                color: "white", fontSize: 15, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                lineHeight: 1 }}>
              ✕
            </button>
            <iframe
              src={`https://drive.google.com/file/d/${VIDEO_ID}/preview`}
              width="100%"
              height="450"
              allow="autoplay"
              allowFullScreen
              style={{ display: "block", border: "none" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Roleplay View (ロープレページ)
// ============================================================
function RoleplayView({ currentUser }) {
  // ===== AI ロープレ =====
  const patterns = [
    { id: "strict_reception", label: "厳しい受付" },
    { id: "gentle_ceo", label: "優しい社長" },
    { id: "busy_ceo", label: "忙しい社長" },
    { id: "interested_ceo", label: "興味ある社長" },
    { id: "claim_ceo", label: "クレーム気質の社長" },
  ];
  const [selectedPattern, setSelectedPattern] = useState(null);
  const [chatStarted, setChatStarted] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const chatBottomRef = React.useRef(null);

  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  const handleStartRoleplay = () => {
    if (!selectedPattern) return;
    const label = patterns.find(p => p.id === selectedPattern)?.label || '';
    setChatStarted(true);
    setChatMessages([{ role: 'ai', text: `【${label}】モードでロープレを開始します。話しかけてください。` }]);
  };
  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    setChatMessages(prev => [...prev, { role: 'user', text: chatInput.trim() }]);
    setChatInput('');
    setTimeout(() => setChatMessages(prev => [...prev, { role: 'ai', text: '（AIロープレ機能は準備中です）' }]), 500);
  };

  // ===== Google Calendar =====
  const GCAL_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const GCAL_CAL_ID = import.meta.env.VITE_GOOGLE_CALENDAR_ID || 'primary';
  const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar email';
  const TOKEN_KEY = 'gcal_token_v1';
  const BOOKINGS_KEY = 'roleplay_bookings_v1';

  const loadToken = () => {
    try {
      const d = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
      if (!d) return null;
      if (Date.now() > d.exp) { localStorage.removeItem(TOKEN_KEY); return null; }
      return d.token;
    } catch(e) { return null; }
  };

  const [gcalToken, setGcalToken] = useState(loadToken);
  const [busySlots, setBusySlots] = useState(null);
  const [loadingBusy, setLoadingBusy] = useState(false);
  const [gcalError, setGcalError] = useState(null);
  const [confirmSlot, setConfirmSlot] = useState(null);
  const [bookings, setBookings] = useState(() => {
    try { return JSON.parse(localStorage.getItem(BOOKINGS_KEY) || '[]'); } catch(e) { return []; }
  });
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccessMsg, setBookingSuccessMsg] = useState('');
  const [userEmail, setUserEmail] = useState(() => {
    try { return localStorage.getItem('gcal_user_email') || ''; } catch(e) { return ''; }
  });
  const [modalEmail, setModalEmail] = useState('');
  const [selectedDay, setSelectedDay] = useState(0);
  const tokenClientRef = React.useRef(null);

  // Google Identity Services 初期化
  useEffect(() => {
    if (!GCAL_CLIENT_ID) return;
    const init = () => {
      if (!window.google?.accounts?.oauth2) return false;
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: GCAL_CLIENT_ID,
        scope: GCAL_SCOPE,
        callback: (resp) => {
          if (resp.error) { setGcalError('認証エラー: ' + (resp.error_description || resp.error)); return; }
          if (resp.access_token) {
            const data = { token: resp.access_token, exp: Date.now() + 55 * 60 * 1000 };
            try { localStorage.setItem(TOKEN_KEY, JSON.stringify(data)); } catch(e) {}
            setGcalToken(resp.access_token);
            setGcalError(null);
          }
        },
      });
      return true;
    };
    if (!init()) {
      const timer = setInterval(() => { if (init()) clearInterval(timer); }, 300);
      return () => clearInterval(timer);
    }
  }, [GCAL_CLIENT_ID]);

  const handleConnect = () => {
    setGcalError(null);
    if (!tokenClientRef.current) {
      setGcalError('Google APIが読み込まれていません。ページを再読み込みしてください。');
      return;
    }
    tokenClientRef.current.requestAccessToken({ prompt: '' });
  };

  const handleDisconnect = () => {
    setGcalToken(null);
    setBusySlots(null);
    setUserEmail('');
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem('gcal_user_email'); } catch(e) {}
  };

  // FreeBusy 取得
  const fetchBusy = async (token) => {
    setLoadingBusy(true);
    setGcalError(null);
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const timeMin = base.toISOString();
    const timeMax = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    try {
      const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeMin, timeMax, items: [{ id: GCAL_CAL_ID }] }),
      });
      if (res.status === 401) {
        setGcalToken(null);
        try { localStorage.removeItem(TOKEN_KEY); } catch(e) {}
        setGcalError('セッションが切れました。再度連携してください。');
        return;
      }
      const d = await res.json();
      setBusySlots(d.calendars?.[GCAL_CAL_ID]?.busy || []);
    } catch(e) {
      setGcalError('カレンダーの取得に失敗しました');
    } finally {
      setLoadingBusy(false);
    }
  };

  useEffect(() => { if (gcalToken) fetchBusy(gcalToken); }, [gcalToken]);

  // OAuth後にユーザーのメールアドレスを取得
  useEffect(() => {
    if (!gcalToken) return;
    (async () => {
      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { 'Authorization': 'Bearer ' + gcalToken },
        });
        if (res.ok) {
          const d = await res.json();
          if (d.email) {
            setUserEmail(d.email);
            try { localStorage.setItem('gcal_user_email', d.email); } catch(e) {}
          }
        }
      } catch(e) { /* メール取得失敗は無視 */ }
    })();
  }, [gcalToken]);

  // confirmSlotが開いたとき、取得済みメールをモーダル入力欄に設定
  useEffect(() => {
    if (confirmSlot) setModalEmail(userEmail || '');
  }, [confirmSlot]);

  // 7日分の日付リスト
  const days = useMemo(() => {
    const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { dateStr: ds, label: `${d.getMonth() + 1}/${d.getDate()} (${DAY_LABELS[d.getDay()]})`, isWeekend: d.getDay() === 0 || d.getDay() === 6 };
    });
  }, []);

  // 30分枠生成 (9:00-21:00)
  const getSlots = (dateStr) => {
    const slots = [];
    for (let h = 9; h < 21; h++) {
      for (let m = 0; m < 60; m += 30) {
        const eh = m + 30 >= 60 ? h + 1 : h;
        const em = (m + 30) % 60;
        const sl = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const el = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
        slots.push({
          startISO: `${dateStr}T${sl}:00+09:00`,
          endISO: `${dateStr}T${el}:00+09:00`,
          startLabel: sl,
          endLabel: el,
        });
      }
    }
    return slots;
  };

  // 各予定の前後90分バッファを加えたブロックを計算（重複はマージ）
  const bufferedBusyBlocks = useMemo(() => {
    if (!busySlots || busySlots.length === 0) return [];
    const BUFFER = 90 * 60 * 1000;
    const blocks = busySlots.map(b => ({
      s: new Date(b.start).getTime() - BUFFER,
      e: new Date(b.end).getTime() + BUFFER,
    })).sort((a, b) => a.s - b.s);
    // マージ
    const merged = [blocks[0]];
    for (let i = 1; i < blocks.length; i++) {
      const last = merged[merged.length - 1];
      if (blocks[i].s <= last.e) {
        last.e = Math.max(last.e, blocks[i].e);
      } else {
        merged.push({ ...blocks[i] });
      }
    }
    return merged;
  }, [busySlots]);

  const isBusy = (startISO, endISO) => {
    if (!busySlots) return false;
    const s = new Date(startISO).getTime(), e = new Date(endISO).getTime();
    return bufferedBusyBlocks.some(b => s < b.e && e > b.s);
  };
  const isBooked = (startISO) => bookings.some(b => b.startISO === startISO);
  const isPast = (startISO) => new Date(startISO) < new Date();

  // イベント作成
  const handleBook = async () => {
    if (!confirmSlot) return;

    // トークン有効性チェック
    const storedData = (() => { try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); } catch(e) { return null; } })();
    if (!storedData || Date.now() > storedData.exp) {
      setGcalToken(null);
      try { localStorage.removeItem(TOKEN_KEY); } catch(e) {}
      setGcalError('セッションが切れました。再度連携してください。');
      setConfirmSlot(null);
      return;
    }
    const activeToken = storedData.token;

    setBookingLoading(true);
    setGcalError(null);
    const title = `ロープレ - ${currentUser || 'インターン生'}`;
    const eventBody = {
      summary: title,
      start: { dateTime: confirmSlot.startISO, timeZone: 'Asia/Tokyo' },
      end: { dateTime: confirmSlot.endISO, timeZone: 'Asia/Tokyo' },
      description: 'Spanavi ロープレ予約',
      attendees: [
        ...(modalEmail ? [{ email: modalEmail }] : []),
        { email: 'shinomiya@ma-sp.co' },
      ],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 30 },
          { method: 'popup', minutes: 10 },
        ],
      },
    };

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GCAL_CAL_ID)}/events?sendUpdates=all`;
    console.log('[GCal] Creating event:', title, confirmSlot.startISO, '-', confirmSlot.endISO, 'attendees:', eventBody.attendees.map(a => a.email));

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + activeToken, 'Content-Type': 'application/json' },
        body: JSON.stringify(eventBody),
      });

      const resText = await res.text();
      console.log('[GCal] Response status:', res.status, resText.slice(0, 300));

      if (res.status === 401) {
        setGcalToken(null);
        try { localStorage.removeItem(TOKEN_KEY); } catch(e) {}
        setGcalError('セッションが切れました。再度連携してください。');
        setConfirmSlot(null);
        return;
      }

      if (!res.ok) {
        let errMsg = String(res.status);
        try { errMsg = JSON.parse(resText)?.error?.message || errMsg; } catch(e) {}
        console.error('[GCal] Event creation failed:', res.status, resText);
        setGcalError(`予約に失敗しました (${res.status}): ${errMsg}`);
        return;
      }

      const ev = JSON.parse(resText);
      console.log('[GCal] Event created successfully. id:', ev.id, 'link:', ev.htmlLink);

      const nb = {
        id: ev.id,
        title,
        startISO: confirmSlot.startISO,
        endISO: confirmSlot.endISO,
        dayLabel: confirmSlot.dayLabel,
        startLabel: confirmSlot.startLabel,
        endLabel: confirmSlot.endLabel,
        attendeeEmail: modalEmail,
      };
      const updated = [...bookings, nb];
      setBookings(updated);
      try { localStorage.setItem(BOOKINGS_KEY, JSON.stringify(updated)); } catch(e) {}
      await fetchBusy(activeToken);
      setBookingSuccessMsg('✅ Googleカレンダーに登録しました');
      setTimeout(() => setBookingSuccessMsg(''), 4000);
      setConfirmSlot(null);
    } catch(e) {
      console.error('[GCal] handleBook unexpected error:', e);
      setGcalError('予約の作成に失敗しました: ' + e.message);
    } finally {
      setBookingLoading(false);
    }
  };

  // イベント削除
  const handleCancel = async (booking) => {
    if (gcalToken && booking.id) {
      try {
        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GCAL_CAL_ID)}/events/${booking.id}`,
          { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + gcalToken } }
        );
        await fetchBusy(gcalToken);
      } catch(e) { /* ローカルからは削除する */ }
    }
    const updated = bookings.filter(b => b.id !== booking.id);
    setBookings(updated);
    try { localStorage.setItem(BOOKINGS_KEY, JSON.stringify(updated)); } catch(e) {}
  };

  const currentDaySlots = getSlots(days[selectedDay]?.dateStr || '');

  return (
    <div style={{ animation: "fadeIn 0.3s ease", display: "flex", gap: 20, minHeight: 520, position: "relative" }}>

      {/* 左: AIロープレ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.navy }}>AIロープレ</h2>
        <div style={{ background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight,
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>🚧</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 6 }}>工事中</div>
            <div style={{ fontSize: 12, color: C.textLight }}>近日実装予定</div>
          </div>
        </div>
      </div>

      {/* 右: 代表とのロープレ予約 */}
      <div style={{ width: 380, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.navy }}>代表とのロープレ予約</h2>

        {/* 未連携 */}
        {!gcalToken ? (
          <div style={{ background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight, padding: 20 }}>
            <div style={{ fontSize: 12, color: C.textMid, marginBottom: 16, lineHeight: 1.7 }}>
              Googleカレンダーと連携して、代表の空き時間を確認・予約できます。
            </div>
            <button onClick={handleConnect}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 8,
                border: "1.5px solid " + C.borderLight, background: C.white,
                color: C.textDark, fontSize: 12, fontWeight: 600, cursor: "pointer",
                fontFamily: "'Noto Sans JP'", width: "100%", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Googleカレンダーと連携
            </button>
            {gcalError && (
              <div style={{ marginTop: 10, fontSize: 11, color: C.red, background: C.redLight,
                padding: "6px 10px", borderRadius: 6 }}>
                {gcalError}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* 連携中ヘッダー */}
            <div style={{ background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight, padding: "10px 14px",
              display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green }} />
                <span style={{ fontSize: 11, color: C.textMid, fontWeight: 600 }}>Googleカレンダー連携中</span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={() => fetchBusy(gcalToken)} disabled={loadingBusy}
                  style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, border: "1px solid " + C.borderLight,
                    background: "transparent", color: C.textMid, cursor: "pointer", fontFamily: "'Noto Sans JP'" }}>
                  {loadingBusy ? '読込中...' : '更新'}
                </button>
                <button onClick={handleDisconnect}
                  style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, border: "1px solid " + C.borderLight,
                    background: "transparent", color: C.textLight, cursor: "pointer", fontFamily: "'Noto Sans JP'" }}>
                  連携解除
                </button>
              </div>
            </div>

            {gcalError && (
              <div style={{ fontSize: 11, color: C.red, background: C.redLight,
                padding: "6px 10px", borderRadius: 6 }}>
                {gcalError}
              </div>
            )}

            {/* 日付タブ */}
            <div style={{ background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight, overflow: "hidden" }}>
              <div style={{ display: "flex", overflowX: "auto", background: C.offWhite, borderBottom: "1px solid " + C.borderLight }}>
                {days.map((day, i) => (
                  <button key={i} onClick={() => setSelectedDay(i)}
                    style={{ padding: "7px 10px", border: "none", cursor: "pointer", whiteSpace: "nowrap",
                      background: "transparent",
                      color: selectedDay === i ? C.navy : (day.isWeekend ? C.red : C.textMid),
                      fontSize: 10, fontWeight: selectedDay === i ? 700 : 400,
                      borderBottom: "2px solid " + (selectedDay === i ? C.gold : "transparent"),
                      fontFamily: "'Noto Sans JP'" }}>
                    {day.label}
                  </button>
                ))}
              </div>

              {/* スロット一覧 */}
              <div style={{ padding: 12, maxHeight: 280, overflowY: "auto" }}>
                {loadingBusy ? (
                  <div style={{ textAlign: "center", padding: 20, color: C.textLight, fontSize: 12 }}>読み込み中...</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
                    {currentDaySlots.map((slot, si) => {
                      const busy = isBusy(slot.startISO, slot.endISO);
                      const booked = isBooked(slot.startISO);
                      const past = isPast(slot.startISO);
                      const disabled = busy || past;
                      return (
                        <button key={si}
                          onClick={() => !disabled && !booked && setConfirmSlot({ ...slot, dayLabel: days[selectedDay].label })}
                          disabled={disabled || booked}
                          style={{ padding: "5px 0", borderRadius: 5, fontSize: 10, fontWeight: 600, textAlign: "center",
                            cursor: disabled || booked ? "default" : "pointer",
                            border: booked ? "1.5px solid " + C.navy : (disabled ? "1px solid " + C.borderLight : "1.5px solid " + C.gold),
                            background: booked ? C.navy : (disabled ? C.offWhite : C.goldGlow),
                            color: booked ? C.white : (disabled ? C.textLight : C.navy),
                            fontFamily: "'JetBrains Mono', monospace" }}>
                          {slot.startLabel}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div style={{ marginTop: 10, display: "flex", gap: 12, fontSize: 9, color: C.textLight }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: C.goldGlow, border: "1.5px solid " + C.gold, display: "inline-block" }} />空き
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: C.offWhite, border: "1px solid " + C.borderLight, display: "inline-block" }} />予定あり
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: C.navy, display: "inline-block" }} />予約済
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* 予約完了メッセージ */}
        {bookingSuccessMsg && (
          <div style={{ background: "#f0faf4", border: "1px solid #34a853", borderRadius: 8,
            padding: "10px 14px", fontSize: 12, fontWeight: 600, color: C.green }}>
            {bookingSuccessMsg}
          </div>
        )}

        {/* 予約済み一覧 */}
        <div style={{ background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight, overflow: "hidden" }}>
          <div style={{ background: C.navy, padding: "8px 14px", fontSize: 11, fontWeight: 700, color: C.white }}>
            予約済み一覧 {bookings.length > 0 && <span style={{ opacity: 0.7, fontSize: 10 }}>({bookings.length}件)</span>}
          </div>
          {bookings.length === 0 ? (
            <div style={{ padding: "16px 14px", textAlign: "center", color: C.textLight, fontSize: 12 }}>予約はありません</div>
          ) : (
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              {bookings.map(b => (
                <div key={b.id} style={{ padding: "8px 14px", borderBottom: "1px solid " + C.borderLight,
                  display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.navy }}>{b.dayLabel}</div>
                    <div style={{ fontSize: 10, color: C.textMid, fontFamily: "'JetBrains Mono', monospace" }}>
                      {b.startLabel} – {b.endLabel}
                    </div>
                    <div style={{ fontSize: 9, color: C.textLight, marginTop: 1 }}>{b.title}</div>
                  </div>
                  <button onClick={() => handleCancel(b)}
                    style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5,
                      border: "1px solid " + C.borderLight, background: "transparent",
                      color: C.red, cursor: "pointer", fontFamily: "'Noto Sans JP'", flexShrink: 0 }}>
                    キャンセル
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 予約確認モーダル */}
      {confirmSlot && (
        <div onClick={() => setConfirmSlot(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9000,
            display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: C.white, borderRadius: 14, padding: "28px 32px", width: 340,
              boxShadow: "0 8px 40px rgba(0,0,0,0.25)" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, marginBottom: 6 }}>ロープレを予約する</div>
            <div style={{ fontSize: 13, color: C.textMid, marginBottom: 16, lineHeight: 1.7 }}>
              <strong style={{ color: C.navy }}>{confirmSlot.dayLabel}</strong>
              {'　'}
              <strong style={{ color: C.navy, fontFamily: "'JetBrains Mono', monospace" }}>
                {confirmSlot.startLabel} – {confirmSlot.endLabel}
              </strong>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: C.textMid, display: "block", marginBottom: 5 }}>
                メールアドレス（通知送付先）
              </label>
              <input
                type="email"
                value={modalEmail}
                onChange={e => setModalEmail(e.target.value)}
                placeholder="your@email.com"
                style={{ width: "100%", padding: "7px 10px", borderRadius: 6,
                  border: "1px solid " + C.borderLight, fontSize: 12, outline: "none",
                  fontFamily: "'Noto Sans JP'", boxSizing: "border-box" }}
              />
              <div style={{ fontSize: 9, color: C.textLight, marginTop: 4 }}>
                予約30分前にメール・10分前にポップアップ通知が届きます
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleBook} disabled={bookingLoading}
                style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none",
                  background: bookingLoading ? C.borderLight : C.navy,
                  color: bookingLoading ? C.textLight : C.white,
                  fontSize: 12, fontWeight: 700, cursor: bookingLoading ? "default" : "pointer",
                  fontFamily: "'Noto Sans JP'" }}>
                {bookingLoading ? '予約中...' : '予約する'}
              </button>
              <button onClick={() => setConfirmSlot(null)}
                style={{ flex: 1, padding: "9px", borderRadius: 8,
                  border: "1px solid " + C.borderLight, background: "transparent",
                  color: C.textMid, fontSize: 12, cursor: "pointer", fontFamily: "'Noto Sans JP'" }}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Placeholder View (準備中ページ)
// ============================================================
function PlaceholderView({ title }) {
  return (
    <div style={{ animation: "fadeIn 0.3s ease", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🚧</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: C.textLight }}>準備中</div>
      </div>
    </div>
  );
}

export default SpanaviApp;
