import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import React from "react";
import { C } from '../constants/colors';
import { CALL_RESULTS } from '../constants/callResults';
import { DEFAULT_BASIC_SCRIPT } from '../constants/scripts';
import { calcRankAndRate, getCurrentRecommendation } from '../utils/calculations';
import { getIndustryCategory, parseTimeRange } from '../utils/industry';
import { dialPhone } from '../utils/phone';
import { extractUserNote, buildMemoWithNote } from '../utils/memo';
import RoleplayView from './views/RoleplayView';
import CompanySearchView from './views/CompanySearchView';
import StatsView from './views/StatsView';
import CallingScreen from './views/CallingScreen';
import RecallModal from './views/RecallModal';
import AppoReportModal from './views/AppoReportModal';
import CallFlowView from './views/CallFlowView';
import ScriptView from './views/ScriptView';
import MyPageView from './views/MyPageView';
import CRMView from './views/CRMView';
import AppoListView, { MembersView } from './views/AppoListView';
import PayrollView from './views/PayrollView';
import ListView from './views/ListView';

import { AVAILABLE_MONTHS } from '../constants/availableMonths';
import { updateCallList, insertCallList, deleteCallList, archiveCallList, restoreCallList, insertClient, updateClient, deleteClient, updateAppointment, insertAppointment, deleteAppointment, updatePreCheckResult, updateMember, insertMember, deleteMember, updateMemberReward, fetchCallListItems, updateCallListItem, insertCallListItems, fetchCallRecords, insertCallRecord, deleteCallRecord, deleteCallRecordByItemRound, deleteCallRecordsByListId, deleteCallListItemsByListId, fetchAllRecallRecords, updateCallRecordMemo, fetchShifts, insertShift, updateShift, deleteShift, fetchCalledItemCountsByListIds, fetchListIdsByItemCriteria, fetchItemsByCallStatus, fetchAllCallListItemsBasic, fetchCallListItemsByIds, fetchCallRecordsByItemIds, fetchCalledCountForSession, fetchZoomUserId, invokeAppoAiReport, invokeGetZoomRecording, updateCallRecordRecordingUrl, invokeTranscribeRecording, fetchCallRecordsByItemId, updateCallListCount, fetchCallRecordsForRanking, fetchMyCallRecords, insertCallSession, updateCallSession, fetchCallSessions, fetchRecentDuplicateSession, getProfileImageUrl, uploadProfileImage, fetchSetting, saveSetting, fetchLatestSessionPerList, updateAppoCounted, fetchRewardMaster } from "../lib/supabaseWrite";
import LoginScreen from './views/LoginScreen';
import LiveStatusView from './views/LiveStatusView';
import PreCheckView from './views/PreCheckView';
import IncomingCallBanner from './views/IncomingCallBanner';
// ZoomPhoneEmbed は Smart Embed 経由での架電が不可のため無効化
// import ZoomPhoneEmbed from './ZoomPhoneEmbed';
import IncomingCallsView from './views/IncomingCallsView';
import RecallListView from './views/RecallListView';
import ShiftManagementView from './views/ShiftManagementView';
import RulesView from './views/RulesView';
import PlaceholderView from './views/PlaceholderView';
import PerformanceView from './views/PerformanceView';
import TeleappoTipsView from './views/TeleappoTipsView';
import InternRulesView from './views/InternRulesView';
import AIAssistantView from './views/AIAssistantView';
import AdminView from './views/AdminView';
import ManagerAdminView from './views/ManagerAdminView';
import { Phone, Calendar, BarChart2, Settings, GraduationCap, User, Bot, Bell } from 'lucide-react';
import { useBranding } from '../hooks/useBranding';
import { supabase } from '../lib/supabase';
import { getOrgId } from '../lib/orgContext';
import DetailModal from './views/DetailModal';

// ============================================================
// LOGO (base64 embedded)
// ============================================================
const LOGO_SRC = "data:image/png;base64,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";

// calcRankAndRate はsrc/utils/calculations.jsからimport済み

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
// C はsrc/constants/colors.jsからimport済み

// CALL_RESULTS はsrc/constants/callResults.jsからimport済み

// getIndustryCategory, parseTimeRange はsrc/utils/industry.jsからimport済み
// getCurrentRecommendation はsrc/utils/calculations.jsからimport済み

// ============================================================
// Sub-components
// ============================================================
const LOGO_VERTICAL = "data:image/png;base64,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";
const FONT_URL = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@300;400;500;600;700;900&family=JetBrains+Mono:wght@400;500&family=Outfit:wght@400;500;600;700;800;900&display=swap";

// ============================================================
// MAIN APP
// ============================================================
const CLIENT_DATA = [{"no": 1, "status": "支援中", "contract": "済", "company": "株式会社ゼニスキャピタルアドバイザーズ", "industry": "IFA", "target": 5, "rewardType": "G", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "Google", "contact": "LINE", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 2, "status": "支援中", "contract": "済", "company": "株式会社ユニヴィスコンサルティング", "industry": "M&A", "target": 10, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "2,3月は7割", "listSrc": "先方持ち", "calendar": "Google", "contact": "メール", "noteFirst": "2,3月は7割の金額\n・そちら\n・売り上げ2-30億\n・担当者複数（一人2000件ほど？）\n・希望は10件\n・ほぼ担ぎ\n・2月1日より\n・単価は7割で\n・グーグルカレンダー捨て垢\n・将来的な検討可否\n・面談経験\n・ちゃんとオーナーなのか\n・必ず聞く事項共有\n\n・2/16-\n・自社のインターン生と量と質どうか\n・舟山様メインで（直属が数名）\n・今週で2000件、その後追加で（1週間に1つ）\n・最低でも月10件（一人当たり）\n・近場、東京神奈川、東海道沿線\n・業種：食品、製造、飲食、卸、測量、医療法人、運送（5-6業種）\n・2-20億\n・グーグルカレンダー", "noteKickoff": "", "noteRegular": ""}, {"no": 3, "status": "支援中", "contract": "済", "company": "株式会社LST", "industry": "M&A", "target": 20, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "Google", "contact": "Chatwork", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 4, "status": "支援中", "contract": "済", "company": "株式会社ジャパンM&Aインキュベーション", "industry": "M&A", "target": 20, "rewardType": "A", "paySite": "末締め翌月末日", "payNote": "", "listSrc": "先方持ち", "calendar": "Spir", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 5, "status": "支援中", "contract": "済", "company": "株式会社and A company", "industry": "M&A", "target": 10, "rewardType": "A", "paySite": "末締め翌月末日", "payNote": "", "listSrc": "両方", "calendar": "Google", "contact": "Slack", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 6, "status": "支援中", "contract": "済", "company": "株式会社ハレバレ", "industry": "M&A", "target": 15, "rewardType": "A", "paySite": "末締め翌月末日", "payNote": "", "listSrc": "先方持ち", "calendar": "Google", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 7, "status": "支援中", "contract": "済", "company": "株式会社ROLEUP", "industry": "M&A", "target": 10, "rewardType": "A", "paySite": "末締め翌月末日", "payNote": "請求書宛先注意", "listSrc": "当社持ち", "calendar": "なし", "contact": "メール", "noteFirst": "■リスト\n・うちで\n・売上5億以上10億円未満\n・当期純利益30百万\n・社長の年齢\n・エリア：一都三県\n・業種：製造、物流、サブコン\n■スクリプト\n・仲介ではない、会計士を中心とした専門家集団でして（FA）\n■カレンダー\n・outlook\n・3,4名", "noteKickoff": "", "noteRegular": ""}, {"no": 8, "status": "支援中", "contract": "済", "company": "乃木坂パートナーズ合同会社", "industry": "M&A", "target": 3, "rewardType": "H", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "両方", "calendar": "Google", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 9, "status": "支援中", "contract": "済", "company": "株式会社ジャーニーズ", "industry": "M&A", "target": 4, "rewardType": "K", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "先方持ち", "calendar": "なし", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 10, "status": "支援中", "contract": "済", "company": "株式会社キャピタルプライム", "industry": "M&A", "target": 5, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "なし", "contact": "メール", "noteFirst": "・酒蔵\n・新規参入できない\n\n・食品製造業(清酒製造業含む)\n・東北地方を除く全国エリア\n・月5件の供給希望\n・譲渡意思が高いアポ供給を前提としているため、訪問希望\n・基本的には垣内・加藤の2名での訪問を想定\n・スクリプトのひな型共有\n・カレンダーは適宜ベタ打ちで", "noteKickoff": "", "noteRegular": ""}, {"no": 11, "status": "支援中", "contract": "済", "company": "見える化株式会社", "industry": "M&A", "target": 3, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "TimeRex", "contact": "メール", "noteFirst": "・宮崎県のみ\n・業種問わず\n・売上2-3億で\n・ほぼ紹介\n・営業代行入れてる\n・5万減額\n\n・リスト\n・業種しぼりなし\n・売上1億～10億\n・宮崎\n\n・スクリプトについて、\n・宮崎県特化で\n・最低手数料300万（補助金使えば100万）\n・完全成功報酬\n\n・タイムレックス\n・バッファー\n\n・3件", "noteKickoff": "", "noteRegular": ""}, {"no": 12, "status": "支援中", "contract": "済", "company": "株式会社アールイーキャピタル", "industry": "M&A", "target": 10, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "3件目までは70,000円", "listSrc": "当社持ち", "calendar": "Google", "contact": "メール", "noteFirst": "・リグロスのM&A仲介部門\n・買収もする（人材、受託開発、SES）\n・レウス？不動産会社のグループもある（賃貸管理の買収）\n・1件目～3件目は70,000円\n・月10件\n\n・うちで準備\n　業種：不動産管理、受託開発、SES、人材派遣\n　売上：3億\n　当期純利益：500万（SES、人材）、1000万（受託開発、不動産）\n　従業員数：5名（SES、受託開発、人材）、10名（不動産）\n　エリア：一都三県\n・スクリプト：会社名義で、リグロスのグループとしてと伝える、不動産はレウスの名前出していい、リグロスのバイネームでもいい\n　決算書いければ（事前確認時に）\n　M&Aのご面談経験\n・カレンダー連携：グーグル（棚木）、対面、1営業日空ける、土日も可能", "noteKickoff": "", "noteRegular": ""}, {"no": 13, "status": "支援中", "contract": "済", "company": "合同会社ORCA Capital", "industry": "M&A", "target": 3, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "TimeRex", "contact": "メール", "noteFirst": "・社名は電話ではなし\n・売上200億以上、利益20億、東海に本社を構える、全国展開のサブコン\n・M&Aの検討余地があるかをヒアリング\n・対面\n・TimeRex", "noteKickoff": "", "noteRegular": ""}, {"no": 14, "status": "支援中", "contract": "済", "company": "ライジング・ジャパン・エクイティ株式会社", "industry": "M&A", "target": 1, "rewardType": "D", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "先方持ち", "calendar": "なし", "contact": "メール", "noteFirst": "・コストについて、DDあたりから決済を取っていく。決済\n・あしもとはリストない\n・先方からリスト供給\n・業種：NGなし（金融を除き）、建設、アウトソーシング、自動車関連のメーカー（B2B）\n・EBITDA5億以上\n\n・B to B\n・製造、建設、アウトソーシング\n・検討しやすい分野\n・ノウハウ在り\n・事業承継的観点ニーズありそう\n・住友商事がバックに\n\n・防食は既存ある\n・DM\n\n・スクリプト通りで\n\n・出席者確定してない\n・仮で日程", "noteKickoff": "", "noteRegular": ""}, {"no": 15, "status": "支援中", "contract": "済", "company": "株式会社The Desk", "industry": "M&A", "target": 3, "rewardType": "B", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "先方持ち", "calendar": "なし", "contact": "メール", "noteFirst": "・一都三県\n・処方箋枚数12,000件\n・2万ずつ減額\n・まずは2億以上5億未満で2件ほど\n\n・リストは合わせ技\n・一都三県\n・5億未満\n\n・スクリプトはうちで任せる\n・御社をグループに迎え入れる形で一緒に成長したいという会社がいる\n・譲渡意向について\n\n・TimeRex\n・対面\n・3人かつ2つのスケジュール\n・渡邉様が行くと伝える", "noteKickoff": "", "noteRegular": ""}, {"no": 16, "status": "支援中", "contract": "済", "company": "株式会社M&A共創パートナーズ", "industry": "M&A", "target": 3, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "TimeRex", "contact": "Slack", "noteFirst": "・IT業界・人材派遣（グループ親会社がやっている）\n・前向きに（決済必要）\n・予算50万円", "noteKickoff": "", "noteRegular": ""}, {"no": 17, "status": "支援中", "contract": "済", "company": "株式会社タグボート", "industry": "M&A", "target": 3, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "先方持ち", "calendar": "Google", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 18, "status": "支援中", "contract": "済", "company": "ブティックス株式会社", "industry": "M&A", "target": 5, "rewardType": "M", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "なし", "contact": "メール", "noteFirst": "■リスト\n・建設業界でうち\n・売上5億未満、当期純利益はなしでOK\n・建築・内装・管工事・電気工事\n■スクリプト\n・基本通りでOK\n・スクリプト共有\n■カレンダー\n・\n■その他\n・月10件（それ以上でも可能）", "noteKickoff": "", "noteRegular": ""}, {"no": 19, "status": "支援中", "contract": "済", "company": "株式会社Bond Capital", "industry": "M&A", "target": 5, "rewardType": "H", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "両方", "calendar": "Google", "contact": "メール", "noteFirst": "対面(オンラインも可)、基本スクリプト、金山様と小泉様にアポ振り", "noteKickoff": "", "noteRegular": ""}, {"no": 20, "status": "支援中", "contract": "済", "company": "株式会社AMANE", "industry": "M&A", "target": 3, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "先方持ち", "calendar": "なし", "contact": "メール", "noteFirst": "自動車整備業界、交通事業者", "noteKickoff": "", "noteRegular": ""}, {"no": 21, "status": "支援中", "contract": "済", "company": "アイシグマキャピタル株式会社", "industry": "M&A", "target": 2, "rewardType": "J", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "先方持ち", "calendar": "Google", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 22, "status": "停止中", "contract": "済", "company": "M&A Lead株式会社", "industry": "M&A", "target": 0, "rewardType": "L", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "両方", "calendar": "Google", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 23, "status": "停止中", "contract": "済", "company": "株式会社リガーレ", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "TimeRex", "contact": "Chatwork", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 24, "status": "停止中", "contract": "済", "company": "株式会社承継支援機構", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "Google", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 25, "status": "停止中", "contract": "済", "company": "Icon Capital株式会社", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "末締め翌月25日", "payNote": "消費税支払い不可", "listSrc": "当社持ち", "calendar": "なし", "contact": "メール", "noteFirst": "スクリプト要注意、登録前は消費税不可", "noteKickoff": "", "noteRegular": ""}, {"no": 26, "status": "停止中", "contract": "済", "company": "株式会社Aston Partners", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "なし", "contact": "メール", "noteFirst": "・売り手、年始以降or年末で再キックオフ\n・担当もつける\n・リスト再抽出\n・案件20件\n・印刷（関西）、病院、介護、レジャー用品レンタル、補助金事業\n・現状すぐ投げられる案件が、4,5社。滞留気味\n・ISコンサルも\n・買い手FAとのつながり強くしたい。仲介で買い手FAのような動きができる会社紹介してほしいと\n\n・売りFA（小さいと仲介）\n・業種：問わず\n・主要都市：対面、地方都市：オンライン\n・当期純利益1億円以上\n・スクリプトは他社と同じで\n・訪問担当者：加藤さん\n・月次でMTG\n・レポートも出す\n・匠アドバイザリー\n・上限は特になし\n\n・奈良県のまたせめていい\n・ISコンサルもゆくゆくは", "noteKickoff": "", "noteRegular": ""}, {"no": 27, "status": "停止中", "contract": "済", "company": "ジュノー合同会社", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "耀伝心株式会社宛に請求", "listSrc": "当社持ち", "calendar": "TimeRex", "contact": "メール", "noteFirst": "年明けから建設リストスタート", "noteKickoff": "", "noteRegular": ""}, {"no": 28, "status": "停止中", "contract": "済", "company": "株式会社NEWOLD CAPITAL", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "※メール確認", "listSrc": "先方持ち", "calendar": "eeasy", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 29, "status": "停止中", "contract": "済", "company": "エナウトパートナーズ株式会社", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "末締め翌月末日", "payNote": "", "listSrc": "先方持ち", "calendar": "Spir", "contact": "メール", "noteFirst": "税理士法人、リスト100件、Spir、基本オンライン(都内は対面可)、注意事項多し", "noteKickoff": "", "noteRegular": ""}, {"no": 30, "status": "停止中", "contract": "済", "company": "株式会社経営承継支援", "industry": "M&A", "target": 0, "rewardType": "H", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "両方", "calendar": "Google", "contact": "Chatwork", "noteFirst": "未定", "noteKickoff": "", "noteRegular": ""}, {"no": 31, "status": "停止中", "contract": "済", "company": "株式会社M&A works", "industry": "M&A", "target": 0, "rewardType": "H", "paySite": "末締め翌月末日", "payNote": "リンクタイズワークスに請求", "listSrc": "当社持ち", "calendar": "なし", "contact": "Slack", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 32, "status": "停止中", "contract": "済", "company": "株式会社Unlock", "industry": "M&A", "target": 0, "rewardType": "L", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "先方持ち", "calendar": "Google", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 33, "status": "停止中", "contract": "済", "company": "株式会社メディカルエイド", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "先方持ち", "calendar": "なし", "contact": "メール", "noteFirst": "関東、1万社、対面、カレンダーはべたうち？", "noteKickoff": "", "noteRegular": ""}, {"no": 34, "status": "停止中", "contract": "済", "company": "あさひ国際会計株式会社", "industry": "M&A", "target": 0, "rewardType": "N", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "なし", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 35, "status": "停止中", "contract": "済", "company": "行政書士法人フォワード", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "なし", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 36, "status": "停止中", "contract": "済", "company": "ゴエンキャピタル株式会社", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "先方持ち", "calendar": "なし", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 37, "status": "停止中", "contract": "済", "company": "株式会社ベネフィットM&Aコンサルタンツ", "industry": "M&A", "target": 0, "rewardType": "L", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "先方持ち", "calendar": "なし", "contact": "Chatwork", "noteFirst": "カレンダーは5営業日取ってもらえればどこに入れてもいい。訪問は大阪府、神戸市、京都市、奈良市でその他オンライン", "noteKickoff": "", "noteRegular": ""}, {"no": 38, "status": "停止中", "contract": "済", "company": "株式会社AMI", "industry": "M&A", "target": 0, "rewardType": "H", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "先方持ち", "calendar": "なし", "contact": "Chatwork", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 39, "status": "停止中", "contract": "済", "company": "SoFun株式会社", "industry": "M&A", "target": 0, "rewardType": "L", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "Google", "contact": "メール", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 40, "status": "停止中", "contract": "", "company": "NYC株式会社", "industry": "M&A", "target": 0, "rewardType": "L", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "Google", "contact": "Slack", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 41, "status": "準備中", "contract": "済", "company": "株式会社NOAH", "industry": "M&A", "target": 30, "rewardType": "C", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "当社持ち", "calendar": "Google", "contact": "Slack", "noteFirst": "・売上30億円未満の企業様: 15万円/アポ(税別)\n・売上30億円以上の企業様: 20万円/アポ(税別)\n\n■リスト\n・当期純利益2000万以上、\n・売上5億以上100億未満\n・従業員20名以上（上限外し）\n・4000件がベスト\n■スクリプト\n・営業周りでトップライン目指せる（営業力の拡張）\n・ファンドとは言ってほしくない\n・代表と取締役\n・永続保有\n■カレンダー\n・遠藤さん、関（都合がつけば）\n・グーグル\n・一都三県：前後2時間\n・出張NG日には一都三県以外だめ\n・一都三県以外は翌週以降で\n■アポ数\n・毎月30アポ\n■その他\n・かける順番\n　-DEFI→GHO\n・ほかのアプローチでもよい\n・スラック\n・ゆくゆくは買い手名義で\n・テストコール、1000ごとにかけて、レポート提出", "noteKickoff": "", "noteRegular": ""}, {"no": 42, "status": "準備中", "contract": "", "company": "株式会社ユニヴ", "industry": "M&A", "target": 3, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "先方持ち", "calendar": "なし", "contact": "LINE", "noteFirst": "■リスト\n・ユニヴさんのリスト（調剤薬局）\n・都道府県順で（一都道府県あたり数百社）\n・関東一部、関西\n\n■実施形式について\n・対面\n・基本的には社長\n\n■希望アポ数\n・2-3件\n\n■スクリプト\n・事業譲渡（9割は）\n・事業譲渡寄りのトーク\n・独立希望の薬剤師、1000名いる\n・実績（譲渡実行100件）、登録数（1000名を超える）を交えて\n・スクリプト送る\n\n■カレンダー\n・ベタ打ち\n\n■今後の連携\n・LINE\n\n■担当\n・吉田こうき様\n・北関東", "noteKickoff": "", "noteRegular": ""}, {"no": 43, "status": "準備中", "contract": "", "company": "株式会社ウィルゲート", "industry": "M&A", "target": 0, "rewardType": "E", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・録音を提供\n・月5,6件\n・売上1億円以上をアプローチ\n・1～10億：10万円\n・10～30億：15万円\n・30億以上：20万円\n・最初5件から\n・スラック\n・ウィルのドメインで、メアド準備\n・2月16日\n・契約書ひな形", "noteKickoff": "", "noteRegular": ""}, {"no": 44, "status": "準備中", "contract": "", "company": "株式会社HBD", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "社名伝達は事前確認時がよさそう", "noteKickoff": "", "noteRegular": ""}, {"no": 45, "status": "準備中", "contract": "", "company": "株式会社エムステージマネジメントソリューションズ", "industry": "M&A", "target": 0, "rewardType": "F", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・外部でもやっている\n・リストは顧客で\n・クリニックとその周辺領域（サプリのメーカー、リハビリ機器）\n・最初は1,2件", "noteKickoff": "", "noteRegular": ""}, {"no": 46, "status": "準備中", "contract": "", "company": "ファストドクター株式会社", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・むらはしさん、エーネックス？\n・月20件（残り10件）\n・初回から対面\n・スコープ：保険診療の医療法人（歯医者は除く）、クリニック向けの決済サービス、内科・精神外科・訪問医療、全国\n・これまで5法人買収、次期終わりまでに20件\n・1.5～10億円、調整後EBITDA3,000万～　広がるかも\n・株式会社が非営利法人を買収するのが、広く知られるとよくない→スクリプト大事\n・単価相談", "noteKickoff": "", "noteRegular": ""}, {"no": 47, "status": "準備中", "contract": "", "company": "ジャパンキャピタル株式会社", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "まずは数件からか", "noteKickoff": "", "noteRegular": ""}, {"no": 48, "status": "準備中", "contract": "", "company": "株式会社みどり医療経営研究所", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・就労支援A型\n・みどり未来パートナーズのグループ\n・外注経験なし\n・金融機関なし\n・みどりで買収したい\n・就労継続支援A型の会社にアプローチしてほしい（買収したい）", "noteKickoff": "", "noteRegular": ""}, {"no": 49, "status": "準備中", "contract": "", "company": "株式会社スリーエスコンサルティング", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 50, "status": "準備中", "contract": "", "company": "Lキャタルトン", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・コンシューマー（B to C）※製造でも可能\n・中堅企業特化で\n・数十億～数百億\n・EBITDA10億以上\n・契約書、都度", "noteKickoff": "", "noteRegular": ""}, {"no": 51, "status": "保留", "contract": "済", "company": "株式会社ストックパートナーズ", "industry": "M&A", "target": 0, "rewardType": "I", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 52, "status": "保留", "contract": "済", "company": "高田承継合同会社", "industry": "M&A", "target": 0, "rewardType": "I", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 53, "status": "保留", "contract": "済", "company": "株式会社Arii", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "末締め翌月末日", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "向こうのリスト待ち。初回面談同席し仲介の立ち回りしたら20万", "noteKickoff": "", "noteRegular": ""}, {"no": 54, "status": "保留", "contract": "済", "company": "株式会社AB&Company", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 55, "status": "保留", "contract": "済", "company": "株式会社技術承継機構", "industry": "M&A", "target": 0, "rewardType": "H", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "9月ごろから開始か", "noteKickoff": "", "noteRegular": ""}, {"no": 56, "status": "保留", "contract": "済", "company": "株式会社九州経営研究所", "industry": "M&A", "target": 0, "rewardType": "L", "paySite": "末締め翌月末日", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "最初の5件（建設2件、病院3件）のみ5万円", "noteKickoff": "", "noteRegular": ""}, {"no": 57, "status": "保留", "contract": "済", "company": "株式会社ビズハブ", "industry": "M&A", "target": 0, "rewardType": "A", "paySite": "末締め翌月15日", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "ISコンサルティングしてほしい、自社のインターン生をSPで面倒見てほしいと、ピンポイント依頼にさりそうと", "noteKickoff": "", "noteRegular": ""}, {"no": 58, "status": "中期フォロー", "contract": "", "company": "株式会社Unlock.ly", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 59, "status": "中期フォロー", "contract": "", "company": "コロニー株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 60, "status": "中期フォロー", "contract": "", "company": "DawnX株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 61, "status": "中期フォロー", "contract": "", "company": "クレアシオン・キャピタル株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 62, "status": "中期フォロー", "contract": "", "company": "株式会社M&Aクラウド", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 63, "status": "中期フォロー", "contract": "", "company": "Shopify Japan株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 64, "status": "中期フォロー", "contract": "", "company": "株式会社CINC Capital", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "末締め翌月末日", "payNote": "月額50万で6,7件供給希望", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 65, "status": "中期フォロー", "contract": "", "company": "株式会社グロースアドバンテッジ", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 66, "status": "中期フォロー", "contract": "", "company": "みらいエフピー株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 67, "status": "中期フォロー", "contract": "", "company": "インクグロウ株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 68, "status": "中期フォロー", "contract": "", "company": "インターリンク株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 69, "status": "中期フォロー", "contract": "", "company": "九州M&Aアドバイザーズ株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 70, "status": "中期フォロー", "contract": "", "company": "株式会社M&A Properties", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 71, "status": "中期フォロー", "contract": "", "company": "株式会社ユニヴィスコンサルティング", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 72, "status": "中期フォロー", "contract": "", "company": "ノアインドアステージ株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 73, "status": "中期フォロー", "contract": "", "company": "株式会社日本観光開発機構", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 74, "status": "中期フォロー", "contract": "", "company": "株式会社M&Aナビ", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 75, "status": "中期フォロー", "contract": "", "company": "株式会社ユナイテッド・フロント・パートナーズ", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "2か月限定で、10,12,15万の単価となるかも。予算年間1,000万", "noteKickoff": "", "noteRegular": ""}, {"no": 76, "status": "中期フォロー", "contract": "", "company": "Blue Works M&A株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 77, "status": "中期フォロー", "contract": "", "company": "合同会社JP-FORCE", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 78, "status": "中期フォロー", "contract": "", "company": "中之島キャピタル株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 79, "status": "中期フォロー", "contract": "", "company": "株式会社Blue Rose", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 80, "status": "中期フォロー", "contract": "", "company": "株式会社M&Aフォース", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 81, "status": "中期フォロー", "contract": "", "company": "マクスウェルグループ株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 82, "status": "中期フォロー", "contract": "", "company": "株式会社OAGコンサルティング", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 83, "status": "中期フォロー", "contract": "", "company": "株式会社弘優社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 84, "status": "中期フォロー", "contract": "", "company": "株式会社メディカルグロース", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 85, "status": "中期フォロー", "contract": "", "company": "株式会社SECURITY BRIDGE", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "他社との契約解除を進めている", "noteKickoff": "", "noteRegular": ""}, {"no": 86, "status": "中期フォロー", "contract": "", "company": "一般社団法人日本経営士会", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 87, "status": "中期フォロー", "contract": "", "company": "株式会社アンビュー", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 88, "status": "中期フォロー", "contract": "", "company": "株式会社ファイ・ブリッジ", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 89, "status": "中期フォロー", "contract": "", "company": "株式会社つなぐコンサルティング", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 90, "status": "中期フォロー", "contract": "", "company": "ノーススターアドバイザリー株式会社", "industry": "IFA", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 91, "status": "中期フォロー", "contract": "", "company": "株式会社ReBridge Partners", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 92, "status": "中期フォロー", "contract": "", "company": "M&A BASE株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "1月から支援開始となるか", "noteKickoff": "", "noteRegular": ""}, {"no": 93, "status": "中期フォロー", "contract": "", "company": "株式会社Linkrop", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 94, "status": "中期フォロー", "contract": "", "company": "山田＆パートナーズアドバイザリー株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "買い手マッチングお願いしたいと。1件5万×20アポで月額100万円の固定でどうかと", "noteKickoff": "", "noteRegular": ""}, {"no": 95, "status": "中期フォロー", "contract": "", "company": "山田コンサルティンググループ株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 96, "status": "中期フォロー", "contract": "", "company": "株式会社ファルコン・キャピタル", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 97, "status": "中期フォロー", "contract": "", "company": "Fore Bridge株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "製造、食品を中心に。3月までに業界特化型のファンドを蘇生", "noteKickoff": "", "noteRegular": ""}, {"no": 98, "status": "中期フォロー", "contract": "", "company": "株式会社YMFGキャピタル", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 99, "status": "中期フォロー", "contract": "", "company": "イノベーションフォース株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 100, "status": "中期フォロー", "contract": "", "company": "マラトンキャピタルパートナーズ株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 101, "status": "中期フォロー", "contract": "", "company": "日本プライベートエクイティ株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・JR四国とファンド立ち上げた、四国ソーシングしたい\n・NGは不動産、金融、農業、養鶏場、養殖（それ以外は検討可能）\n・ホテル、リネン、農産物加工、お菓子、こちらは検討経験あり\n・実質EBITDA1億円以上（少し低くても検討可能）\n・現状のリストで100社\n・exitについて、JR四国にグループインできるかもだが、あまり押しはしない\n・弟が不動産MAやってる、自社ビルターゲット、そちらも支援するかも", "noteKickoff": "", "noteRegular": ""}, {"no": 102, "status": "中期フォロー", "contract": "", "company": "株式会社エコ・ブレーンズ", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 103, "status": "中期フォロー", "contract": "", "company": "株式会社みどり未来パートナーズ", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "【買収】\n・社労士法人、税理士法人（東京）\n・WEBメディア（東京）\n\n【仲介】\n・建設、食品製造・加工、運送業", "noteKickoff": "", "noteRegular": ""}, {"no": 104, "status": "中期フォロー", "contract": "", "company": "みらいアーク株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 105, "status": "中期フォロー", "contract": "", "company": "株式会社日本産業推進機構", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・ロールアップ強化\n・ロールアップ→\n　日本語学校（5件）、\n　介護（施設系、ホスピス、首都圏、中部地域、その間、、規模が多ければその他も、3件）\n　アパマン（賃貸管理）\n・全部合わせて100件前後", "noteKickoff": "", "noteRegular": ""}, {"no": 106, "status": "中期フォロー", "contract": "", "company": "株式会社ロータスアドバイザリー", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・仲介会社ではないので、事業改善のコンサルなどもしている\n・5億以上で", "noteKickoff": "", "noteRegular": ""}, {"no": 107, "status": "中期フォロー", "contract": "", "company": "株式会社タイミー", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・全国の人材会社ロールアップ\n・M&Aチーム3名\n・中途\n・人材派遣\n・HR全般\n・業務請負（特に物流）", "noteKickoff": "", "noteRegular": ""}, {"no": 108, "status": "中期フォロー", "contract": "", "company": "株式会社LEG", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "買い手マッチング需要ある", "noteKickoff": "", "noteRegular": ""}, {"no": 109, "status": "中期フォロー", "contract": "", "company": "合同会社RenDan", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・福祉施設、飲食店、一都三県\n・最低報酬150万\n・2,3か月でCL\n・その分件数担保\n・月2件/人（今は月1件）\n・買い手も脱サラ等が多い\n・売りは紹介（月10件）\n・1月以降で福祉系でLP出す\n・うちでリスト\n・福祉だけで5件\n・飲食と福祉系のリストの条件を送ってもらう", "noteKickoff": "", "noteRegular": ""}, {"no": 110, "status": "中期フォロー", "contract": "", "company": "株式会社事業承継通信社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 111, "status": "中期フォロー", "contract": "", "company": "みなと不動産株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・買収していきたい\n・ビルメンテ、薬局\n・自走できるものであれば、2-3億\n・仲介入ってほしい\n・ビルメンCLしそう\n・管工事、土木設計", "noteKickoff": "", "noteRegular": ""}, {"no": 112, "status": "中期フォロー", "contract": "", "company": "株式会社メディカルアシスト", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・医師会と提携しており、売りは月5,6件くる\n・M&Aは2名体制\n・買い手が欲しい\n・現状は売りFA主体", "noteKickoff": "", "noteRegular": ""}, {"no": 113, "status": "中期フォロー", "contract": "", "company": "リゾルトパートナーズ株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・ファンドよりもアドバイザリーの方でお願いしたいと", "noteKickoff": "", "noteRegular": ""}, {"no": 114, "status": "中期フォロー", "contract": "", "company": "宏和印刷株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 115, "status": "中期フォロー", "contract": "", "company": "ウィズアップコンサルティング株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 116, "status": "中期フォロー", "contract": "", "company": "イシン株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・ベストベンチャー100からの流入が多い\n・翌月末支払いにしたい", "noteKickoff": "", "noteRegular": ""}, {"no": 117, "status": "中期フォロー", "contract": "", "company": "株式会社M&A総研ホールディングス", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "リストは総研から（システムも）\nインターン採用は辞めてる", "noteKickoff": "", "noteRegular": ""}, {"no": 118, "status": "中期フォロー", "contract": "", "company": "サンライズキャピタル株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 119, "status": "中期フォロー", "contract": "", "company": "Trustar Capital Partners Japan", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 120, "status": "中期フォロー", "contract": "", "company": "きらぼしキャピタル株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・ロールアップでピンポイントで依頼将来できるかも\n・バイアウトでレガシー産業見ている。（金融と不動産以外）業種は問わず\n・EBITDA1億～5億\n・LBO活用して、もう少し大きいところも", "noteKickoff": "", "noteRegular": ""}, {"no": 121, "status": "中期フォロー", "contract": "", "company": "杉山亜夢里税理士事務所", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・不動産MAが多い\n・買い手マッチングニーズもある？", "noteKickoff": "", "noteRegular": ""}, {"no": 122, "status": "中期フォロー", "contract": "", "company": "株式会社刈田・アンド・カンパニー", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 123, "status": "中期フォロー", "contract": "", "company": "ニューホライズンキャピタル株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・規模は50億未満かな？\n・ロングリストの質\n・案件がなくなってきた", "noteKickoff": "", "noteRegular": ""}, {"no": 124, "status": "中期フォロー", "contract": "", "company": "百五みらい投資株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・EBITDA1億\n・年間1-2件\n・重点は東海、関東、関西\n・業種は建設飲食以外\n・銀行系なので、断った際にちょいハレーション起きる", "noteKickoff": "", "noteRegular": ""}, {"no": 125, "status": "中期フォロー", "contract": "", "company": "日本グロース・キャピタル株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・俺が仲介やる\n・業種、エリア、問わず\n・EBITDA1億以上\n・自己勘定であればもう少し低い\n・6号280億レイズした", "noteKickoff": "", "noteRegular": ""}, {"no": 126, "status": "中期フォロー", "contract": "", "company": "株式会社日本創生投資", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・アポの時点ではNN、事前確認時に名前伝えてほしいと", "noteKickoff": "", "noteRegular": ""}, {"no": 127, "status": "中期フォロー", "contract": "", "company": "静岡キャピタル株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・テレアポサービスとの取引あった\n・ノンネームベースで\n・無借金先がほしい", "noteKickoff": "", "noteRegular": ""}, {"no": 128, "status": "中期フォロー", "contract": "", "company": "日本みらいキャピタル株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "1件1件大切にする系で現状は厳しい", "noteKickoff": "", "noteRegular": ""}, {"no": 129, "status": "中期フォロー", "contract": "", "company": "株式会社日立ソリューションズ", "industry": "SaaS", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・値段手頃だなと（他社だと成果報酬の場合5-10万円）", "noteKickoff": "", "noteRegular": ""}, {"no": 130, "status": "中期フォロー", "contract": "", "company": "京都キャピタルパートナーズ株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・関西注力\n・仲介会社との接点も増えてきた", "noteKickoff": "", "noteRegular": ""}, {"no": 131, "status": "中期フォロー", "contract": "", "company": "株式会社事業開発", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・10,20件ほど架電している", "noteKickoff": "", "noteRegular": ""}, {"no": 132, "status": "中期フォロー", "contract": "", "company": "株式会社バリュークリエイション・アドバイザリー", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・リストの項目知りたい\n・熊本福岡、売上希望問わず、黒字", "noteKickoff": "", "noteRegular": ""}, {"no": 133, "status": "中期フォロー", "contract": "", "company": "税理士法人中山会計", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・顧問先メイン\n・買い手出てきた際には使用してくれそう", "noteKickoff": "", "noteRegular": ""}, {"no": 134, "status": "中期フォロー", "contract": "", "company": "株式会社マイツ", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・中国買い手、日本売り手（売り手FA）\n・製造業、金属加工、自動車部品\n・中国からのニーズ、ペット食品、不動産\n・ロングリスト作成しアプローチ\n・M&A仲介会社との提携（その際は買い手FA）", "noteKickoff": "", "noteRegular": ""}, {"no": 135, "status": "中期フォロー", "contract": "", "company": "ヒルズ＆パートナーズ株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・M&A仲介は年2,3回\n・普通", "noteKickoff": "", "noteRegular": ""}, {"no": 136, "status": "中期フォロー", "contract": "", "company": "木村会計グループ\n", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・仲介になげている", "noteKickoff": "", "noteRegular": ""}, {"no": 137, "status": "中期フォロー", "contract": "", "company": "Fintegrity株式会社", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "買い手マッチング希望？", "noteKickoff": "", "noteRegular": ""}, {"no": 138, "status": "中期フォロー", "contract": "", "company": "株式会社経営戦略室", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "・調剤中心（買い手から要望があり）\n・コンサル中心、入りはコンサル\n・紹介、口コミ\n・目的は経営革新\n・福島県、相双地区・川俣町・飯館村の調剤薬局。買い手も薬局。門前薬局なのか、処方箋枚数等", "noteKickoff": "", "noteRegular": ""}, {"no": 139, "status": "中期フォロー", "contract": "", "company": "合同会社平家商事", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "", "noteKickoff": "", "noteRegular": ""}, {"no": 140, "status": "中期フォロー", "contract": "", "company": "石田恭也", "industry": "M&A", "target": 0, "rewardType": "", "paySite": "", "payNote": "", "listSrc": "", "calendar": "", "contact": "", "noteFirst": "3月に立ち上げ後、依頼いただける可能性あり", "noteKickoff": "", "noteRegular": ""}];

// REWARD_MASTER はsrc/constants/rewardMaster.jsからimport済み
// AVAILABLE_MONTHS は src/constants/availableMonths.js からimport済み

// Helper: trigger phone call via hidden iframe (no page navigation, allows rapid sequential calls)
// dialPhone はsrc/utils/phone.jsからimport済み

// インライン録音プレーヤー（全画面共通）
function SpanaviApp({ userName, userId, isAdmin: isAdminProp, onLogout, supabaseData, onDataRefetch }) {
  const branding = useBranding();
  const [callListData, setCallListData] = useState(supabaseData?.callLists ?? []);
  const [importedCSVs, setImportedCSVs] = useState({});
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
  const [appoData, setAppoData] = useState(supabaseData?.appoData ?? []);
  const [clientData, setClientData] = useState(supabaseData?.clientData?.length ? supabaseData.clientData : CLIENT_DATA);
  const [members, setMembers] = useState(supabaseData?.membersDetailed?.length ? supabaseData.membersDetailed : DEFAULT_MEMBERS);
  const [rewardMaster, setRewardMaster] = useState([]);
  useEffect(() => {
    fetchRewardMaster().then(({ data }) => { if (data?.length) setRewardMaster(data); });
  }, []);
  // supabaseData が非同期で届いた後に各 state を同期する
  useEffect(() => {
    if (supabaseData?.appoData) setAppoData(supabaseData.appoData);
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
            if (list) setCallFlowScreen({ list, startNo: startNo ?? null, endNo: endNo ?? null });
          }
        } catch(e) {}
      }
    }
    if (supabaseData?.membersDetailed?.length) setMembers(supabaseData.membersDetailed);
  }, [supabaseData]);
  const isAdmin = isAdminProp || currentUser === "管理者";
  const currentMemberDetail = useMemo(() => members.find(m => m.name === currentUser), [members, currentUser]);
  const isManagerRole = !isAdmin && (currentMemberDetail?.role === 'チームリーダー' || currentMemberDetail?.role === '営業統括');
  // コンボボックス用の名前リスト（文字列配列）
  const memberNames = useMemo(() => members.map(m => (typeof m === 'string' ? m : (m.name || ''))), [members]);
  const _VALID_TABS = ["live","incoming","lists","appo","precheck","crm","members","search","stats","recall","payroll","shift","rules","mypage","edu_script","edu_rules","edu_roleplay","edu_performance","ai","manager_admin"];
  const [currentTab, setCurrentTab] = useState(() => {
    try {
      const saved = localStorage.getItem("masp_v2_currentTab");
      return (saved && _VALID_TABS.includes(saved)) ? saved : "lists";
    } catch(e) { return "lists"; }
  });
  useEffect(() => {
    try { localStorage.setItem("masp_v2_currentTab", currentTab); } catch(e) {}
  }, [currentTab]);
  const [now, setNow] = useState(new Date());
  const [lastUpdated, setLastUpdated] = useState(() => new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  // call_sessions ベースの「リストごと最終架電日時」マップ { [supaId]: ISO string }
  const [latestSessionMap, setLatestSessionMap] = useState({});
  const [industryRules, setIndustryRules] = useState(DEFAULT_INDUSTRY_RULES);
  const [orgSettingsMap, setOrgSettingsMap] = useState({});
  // org_settings から業種ルール + スコア/ランク設定を一括取得
  useEffect(() => {
    supabase.from('org_settings').select('setting_key, setting_value').eq('org_id', getOrgId())
      .then(({ data }) => {
        if (!data) return;
        const map = {};
        data.forEach(r => { map[r.setting_key] = r.setting_value; });
        setOrgSettingsMap(map);
        if (map.industry_rules) {
          try { setIndustryRules(JSON.parse(map.industry_rules)); } catch { /* use defaults */ }
        }
      });
  }, []);
  const [filterStatus, setFilterStatus] = useState("架電可能");
  const [filterType, setFilterType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedList, setSelectedList] = useState(null);
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
  useEffect(() => {
    const id = setInterval(() => {
      setLastUpdated(new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 60000);
    return () => clearInterval(id);
  }, []);

  // callListData がロードされたら call_sessions から各リストの最終架電日時を取得
  useEffect(() => {
    const supaIds = (callListData || []).map(l => l._supaId).filter(Boolean);
    if (!supaIds.length) return;
    fetchLatestSessionPerList(supaIds).then(({ data }) => {
      setLatestSessionMap(data || {});
    });
  }, [callListData]);

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
  }, [now]);

  const enrichedLists = useMemo(() => callListData.map(list => {
    const latestCallAt = latestSessionMap[list._supaId] || null;
    const rec = getCurrentRecommendation(industryRules, list.industry, now, latestCallAt, list.created_at || null, orgSettingsMap);
    return { ...list, recommendation: rec };
  }), [now, latestSessionMap, industryRules, callListData, orgSettingsMap]);

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
  const recommendedCount = (() => {
    const c = enrichedLists.filter(l => {
      if (l.status !== "架電可能" || !l.recommendation || l.recommendation.timeScore <= 40) return false;
      if (!l.created_at) return false;
      const days = (Date.now() - new Date(l.created_at).getTime()) / (1000 * 60 * 60 * 24);
      return days <= 7;
    });
    return Math.min(c.length, 10);
  })();

  const timeStr = now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  const _dm = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][now.getMonth()];
  const _dw = ['SUN','MON','TUE','WED','THU','FRI','SAT'][now.getDay()];
  const dateStr = `${now.getDate()} ${_dm} ${now.getFullYear()}  ${_dw}`;

  const isOverdue = (date, time) => {
    if (!date) return false;
    return new Date(`${date}T${time || '00:00'}:00`) <= now;
  };
  const overdueSupaRecalls = supaRecalls.filter(r =>
    isOverdue(r._memoObj.recall_date, r._memoObj.recall_time) &&
    (isAdmin || (r._memoObj.assignee || '') === currentUser)
  );
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
  const overdueCsvCount = 0;
  const overdueCount = overdueSupaRecalls.length + preCheckPendingAppos.length + overdueCsvCount;

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
    { id: "g_call", label: "CALLING", children: [
      { id: "live", label: "Live Status" },
      { id: "lists", label: "Lists" },
      { id: "search", label: "Search" },
      { id: "recall", label: "Recall" },
      { id: "incoming", label: "Call History" },
      { id: "rules", label: "Industry Rules" },
    ]},
    { id: "g_appo", label: "PIPELINE", children: [
      { id: "appo", label: "Appointments" },
      { id: "precheck", label: "Pre-Check" },
    ]},
    { id: "stats", label: "Analytics", children: null },
    { id: "g_other", label: "OPERATIONS", children: [
      { id: "crm", label: "CRM" },
      { id: "members", label: "Members" },
      { id: "payroll", label: "Payroll" },
      { id: "shift", label: "Shifts" },
    ]},
    { id: "g_education", label: "DEVELOPMENT", children: [
      { id: "edu_performance", label: "Performance" },
      { id: "edu_script", label: "Scripts" },
      { id: "edu_tips", label: "Mastery" },
      { id: "edu_rules", label: "22 Rules" },
      { id: "edu_roleplay", label: "Role Play" },
    ]},
    ...(isManagerRole ? [{ id: "manager_admin", label: "Admin", children: null }] : []),
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

  // Keyboard shortcuts: Ctrl+↑↓ for main menu, Ctrl+←→ for sub-tabs
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!e.ctrlKey) return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const flatTabs = [];
        for (const g of navGroups) {
          if (g.children) g.children.forEach(c => flatTabs.push(c.id));
          else flatTabs.push(g.id);
        }
        flatTabs.push('mypage');
        const idx = flatTabs.indexOf(currentTab);
        if (idx === -1) return;
        e.preventDefault();
        setCurrentTab(flatTabs[e.key === 'ArrowUp'
          ? (idx - 1 + flatTabs.length) % flatTabs.length
          : (idx + 1) % flatTabs.length
        ]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTab, navGroups]);

  // Login screen
  // Login is handled by App.jsx via Supabase auth
  // if (!currentUser) { return <LoginScreen ... />; }

  return (
    <div style={{ minHeight: "100vh", background: '#F3F2F2', color: C.textDark, fontFamily: "'Noto Sans JP', sans-serif" }}>
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

      {/* ===== SIDEBAR ===== */}
      <div style={{ width: 220, position: 'fixed', left: 0, top: 0, height: '100vh', background: branding.primaryColor, overflowY: 'auto', zIndex: 200, boxShadow: '2px 0 8px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' }}>
        {/* Logo */}
        <div onClick={() => setCurrentTab('live')} style={{ padding: '16px 20px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 10 }}>
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.orgName} style={{ width: 28, height: 32, objectFit: 'contain' }} />
          ) : (
            <svg width="28" height="32" viewBox="0 0 52 60">
              <defs>
                <linearGradient id="spShieldSidebar" x1="0" y1="0" x2="0.3" y2="1">
                  <stop offset="0%" stopColor={branding.accentColor}/>
                  <stop offset="100%" stopColor={branding.primaryColor}/>
                </linearGradient>
                <clipPath id="shieldClipSB"><path d="M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z"/></clipPath>
              </defs>
              <path d="M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z" fill="url(#spShieldSidebar)"/>
              <g clipPath="url(#shieldClipSB)" stroke="white" fill="none">
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
          )}
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 800, letterSpacing: 2, lineHeight: 1 }}>
            <span style={{ color: branding.accentColor }}>{branding.orgName.slice(0, Math.ceil(branding.orgName.length / 2))}</span><span style={{ color: branding.highlightColor }}>{branding.orgName.slice(Math.ceil(branding.orgName.length / 2))}</span>
          </div>
        </div>
        {/* User area — クリックでマイページへ */}
        {(() => {
          const _currentMember = Array.isArray(members) ? members.find(m => (typeof m === 'object' ? m.name : m) === currentUser) : null;
          const _avatarUrl = typeof _currentMember === 'object' ? _currentMember?.avatarUrl : null;
          return (
            <div onClick={() => setCurrentTab('mypage')}
              onMouseEnter={() => setHoveredGroup('mypage')}
              onMouseLeave={() => setHoveredGroup(null)}
              style={{ padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: currentTab === 'mypage' ? 'rgba(255,255,255,0.12)' : hoveredGroup === 'mypage' ? 'rgba(255,255,255,0.07)' : 'transparent', borderLeft: '3px solid transparent', boxSizing: 'border-box' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#0176D3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0, overflow: 'hidden' }}>
                {_avatarUrl
                  ? <img src={_avatarUrl} alt={currentUser} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (currentUser || '?')[0]}
              </div>
              <span style={{ fontSize: 13, color: currentTab === 'mypage' ? '#FFFFFF' : 'rgba(255,255,255,0.75)', fontWeight: currentTab === 'mypage' ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser}</span>
            </div>
          );
        })()}
        {/* Navigation */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
          {navGroups.map(group => {
            const _sbIconMap = { g_call: Phone, g_appo: Calendar, stats: BarChart2, g_other: Settings, g_education: GraduationCap, mypage: User, ai: Bot };
            const SbIconComp = _sbIconMap[group.id];
            if (!group.children) {
              const _sbActive = currentTab === group.id;
              return (
                <button key={group.id} onClick={() => setCurrentTab(group.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '11px 20px',
                  background: _sbActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                  border: 'none', borderLeft: '3px solid transparent',
                  color: _sbActive ? '#FFFFFF' : 'rgba(255,255,255,0.75)',
                  fontSize: 13, fontWeight: _sbActive ? 600 : 400,
                  fontFamily: "'Noto Sans JP', sans-serif",
                  cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box',
                }}>
                  {SbIconComp && <SbIconComp size={14} />}{group.label}
                </button>
              );
            }
            return (
              <div key={group.id}>
                <div style={{ padding: '16px 20px 6px', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {SbIconComp && <SbIconComp size={12} />}{group.label}
                </div>
                {group.children.map(child => {
                  const _sbChildActive = currentTab === child.id;
                  return (
                    <button key={child.id} onClick={() => setCurrentTab(child.id)} style={{
                      display: 'block', width: '100%', padding: '8px 20px 8px 28px',
                      background: _sbChildActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                      border: 'none', borderLeft: '3px solid transparent',
                      color: _sbChildActive ? '#FFFFFF' : 'rgba(255,255,255,0.75)',
                      fontSize: 13, fontWeight: _sbChildActive ? 600 : 400,
                      fontFamily: "'Noto Sans JP', sans-serif",
                      cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box',
                    }}
                    onMouseEnter={e => { if (!_sbChildActive) e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
                    onMouseLeave={e => { if (!_sbChildActive) e.currentTarget.style.background = 'transparent'; }}
                    >{child.label}</button>
                  );
                })}
              </div>
            );
          })}
        </div>
        {/* Logout */}
        <div style={{ position: 'sticky', bottom: 0, background: '#021d47', padding: '12px 20px' }}>
          <button onClick={() => { if (onLogout) onLogout(); else setCurrentUser(null); }} style={{
            width: '100%', padding: '8px', borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.2)', background: 'transparent',
            color: '#fff', fontSize: 12, fontWeight: 600,
            fontFamily: "'Noto Sans JP', sans-serif", cursor: 'pointer',
          }}>ログアウト</button>
        </div>
      </div>

      {/* ===== NEW HEADER ===== */}
      <header style={{
        position: 'fixed', top: 0, left: 220, right: 0, width: 'calc(100% - 220px)', height: 54, zIndex: 150,
        background: '#FFFFFF', borderBottom: '1px solid #E5E7EB',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', boxSizing: 'border-box',
      }} onClick={() => setShowBellDropdown(false)}>
        <div style={{ fontSize: 11, fontWeight: 500, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {(() => {
            for (const _hg of navGroups) {
              if (!_hg.children && _hg.id === currentTab) return _hg.label;
              if (_hg.children) { const _hc = _hg.children.find(c => c.id === currentTab); if (_hc) return _hc.label; }
            }
            return '';
          })()}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowBellDropdown(p => !p)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: C.navy, lineHeight: 1, display: 'flex', alignItems: 'center' }}>
              <Bell size={18} />
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
                border: "1px solid " + C.borderLight, zIndex: 300, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", background: C.navy, color: C.white, fontSize: 11, fontWeight: 700 }}>
                  通知（{overdueCount}件）
                </div>
                <div style={{ maxHeight: 280, overflowY: "auto" }}>
                  {preCheckPendingAppos.length > 0 && (<>
                    <div style={{ padding: "6px 14px", background: "#fff8ed", fontSize: 10, fontWeight: 700, color: C.orange, borderBottom: "1px solid " + C.borderLight }}>
                      事前確認が必要なアポ（{preCheckPendingAppos.length}件）
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
                  {(overdueSupaRecalls.length + overdueCsvCount) > 0 && (<>
                    <div style={{ padding: "6px 14px", background: C.navy + "08", fontSize: 10, fontWeight: 700, color: C.navy, borderBottom: "1px solid " + C.borderLight }}>
                      期限超過の再コール（{overdueSupaRecalls.length + overdueCsvCount}件）
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: '#9CA3AF', letterSpacing: '0.05em' }}>最終更新</div>
              <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#6B7280' }}>{lastUpdated}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: C.navy }}>{timeStr}</div>
              <div style={{ fontSize: 10, color: C.textLight }}>{dateStr}</div>
            </div>
          </div>
        </div>
      </header>

      {/* OLD_HEADER_START */}
      {false && (<>
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
                <stop offset="0%" stopColor="#0176D3"/>
                <stop offset="100%" stopColor="#032D60"/>
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
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 24, fontWeight: 800, color: "#0176D3", letterSpacing: 2, lineHeight: 1 }}>
            Spa<span style={{ background: "linear-gradient(180deg, #c6a358, #a8883a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>navi</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* ベルマーク */}
          <div style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowBellDropdown(p => !p)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: C.navy, lineHeight: 1, display: 'flex', alignItems: 'center' }}>
              <Bell size={18} />
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
                  通知（{overdueCount}件）
                </div>
                <div style={{ maxHeight: 280, overflowY: "auto" }}>
                  {/* 事前確認未完了 */}
                  {preCheckPendingAppos.length > 0 && (<>
                    <div style={{ padding: "6px 14px", background: "#fff8ed", fontSize: 10, fontWeight: 700, color: C.orange, borderBottom: "1px solid " + C.borderLight }}>
                      事前確認が必要なアポ（{preCheckPendingAppos.length}件）
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
                      期限超過の再コール（{overdueSupaRecalls.length + overdueCsvCount}件）
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
          <button onClick={() => { if (onLogout) onLogout(); else setCurrentUser(null); }} style={{
            padding: "4px 10px", borderRadius: 4, border: "1px solid " + C.white + "30",
            background: "transparent", cursor: "pointer", fontSize: 10, color: C.white + "90",
            fontFamily: "'Noto Sans JP'",
          }}>ログアウト</button>
        </div>
      </nav>
      </>)}
      {/* OLD_HEADER_END */}

      {/* ===== CONTENT ===== */}
      <main style={{ marginLeft: 220, paddingTop: 54, paddingLeft: 28, paddingRight: 28, paddingBottom: 24, minHeight: '100vh', width: 'calc(100% - 220px)', boxSizing: 'border-box' }}>
        {currentTab === "live" && <LiveStatusView now={now} callListData={callListData} members={members} isAdmin={isAdmin} isManagerRole={isManagerRole} />}
        {currentTab === "incoming" && <IncomingCallsView setCallFlowScreen={setCallFlowScreen} />}
        {currentTab === "lists" && <ListView filteredLists={filteredLists} filterStatus={filterStatus} setFilterStatus={setFilterStatus} filterType={filterType} setFilterType={setFilterType} searchQuery={searchQuery} setSearchQuery={setSearchQuery} sortBy={sortBy} setSortBy={setSortBy} setSelectedList={setSelectedList} callListData={callListData} setCallListData={setCallListData} listFormOpen={listFormOpen} setListFormOpen={setListFormOpen} editingListId={editingListId} setEditingListId={setEditingListId} now={now} isAdmin={isAdmin} clientData={clientData} />}
        {currentTab === "appo" && <AppoListView appoData={appoData} setAppoData={isAdmin ? setAppoData : null} members={members} setMembers={isAdmin ? setMembers : null} clientData={clientData} rewardMaster={rewardMaster} setCallFlowScreen={setCallFlowScreen} callListData={callListData} />}
        {currentTab === "precheck" && <PreCheckView appoData={appoData} setAppoData={isAdmin ? setAppoData : null} setCallFlowScreen={setCallFlowScreen} />}
        {currentTab === "crm" && <CRMView isAdmin={isAdmin} clientData={clientData} setClientData={isAdmin ? setClientData : null} rewardMaster={rewardMaster} />}

        {currentTab === "members" && <MembersView members={members} setMembers={isAdmin ? setMembers : null} onDataRefetch={onDataRefetch} />}
        {currentTab === "search" && <CompanySearchView importedCSVs={importedCSVs} callListData={callListData} setCallingScreen={setCallingScreen} setImportedCSVs={setImportedCSVs} clientData={clientData} currentUser={currentUser} members={members} setCallFlowScreen={setCallFlowScreen} rewardMaster={rewardMaster} />}
        {currentTab === "stats" && <StatsView callListData={callListData} currentUser={currentUser} appoData={appoData} members={members} now={now} />}
        {currentTab === "recall" && <RecallListView callListData={callListData} supaRecalls={supaRecalls} onRecallComplete={handleSupaRecallComplete} members={memberNames} currentUser={currentUser} isAdmin={isAdmin} onRefresh={fetchSupaRecalls} setCallFlowScreen={setCallFlowScreen} />}
        {currentTab === "payroll" && <PayrollView members={members} appoData={appoData} isAdmin={isAdmin} setMembers={setMembers} onDataRefetch={onDataRefetch} currentUser={currentUser} />}
        {currentTab === "shift" && <ShiftManagementView members={members} currentUser={currentUser} isAdmin={isAdmin} />}
        {currentTab === "rules" && <RulesView />}
        {currentTab === "mypage" && isAdmin && <AdminView isAdmin={isAdmin} setCurrentTab={setCurrentTab} rewardMaster={rewardMaster} setRewardMaster={setRewardMaster} members={members} appoData={appoData} now={now} onDataRefetch={onDataRefetch} />}
        {currentTab === "mypage" && !isAdmin && <MyPageView currentUser={currentUser} userId={userId} callListData={callListData} members={members} now={now} appoData={appoData} onDataRefetch={onDataRefetch} isAdmin={isAdmin} />}
        {currentTab === "edu_performance" && <PerformanceView members={members} currentUser={currentUser} appoData={appoData} />}
        {currentTab === "edu_script" && <ScriptView isAdmin={isAdmin} clientData={clientData} callListData={callListData} />}
        {currentTab === "edu_tips" && <TeleappoTipsView />}
        {currentTab === "edu_rules" && <InternRulesView />}
        {currentTab === "edu_roleplay" && <RoleplayView currentUser={currentUser} userId={userId} />}
        {currentTab === "ai" && <AIAssistantView appoData={appoData} members={members} callListData={callListData} industryRules={industryRules} currentUser={currentUser} />}
        {currentTab === "manager_admin" && isManagerRole && <ManagerAdminView currentUser={currentUser} members={members} appoData={appoData} now={now} />}
      </main>

      {callingScreen && <CallingScreen listId={callingScreen.listId} list={callingScreen.list} importedCSVs={importedCSVs} setImportedCSVs={setImportedCSVs} onClose={() => setCallingScreen(null)} currentUser={currentUser} liveStatuses={liveStatuses} setLiveStatuses={setLiveStatuses} members={members} clientData={clientData} rewardMaster={rewardMaster} />}
      {selectedList && <DetailModal list={enrichedLists.find(l => l.id === selectedList)} onClose={() => setSelectedList(null)} industryRules={industryRules} now={now} callListData={callListData} setCallListData={setCallListData} setCallFlowScreen={setCallFlowScreen} isAdmin={isAdmin} onDelete={(id) => { setCallListData(prev => prev.filter(l => l.id !== id)); setSelectedList(null); }} />}
      {callFlowScreen && <CallFlowView list={callFlowScreen.list} startNo={callFlowScreen.startNo} endNo={callFlowScreen.endNo} statusFilter={callFlowScreen.statusFilter ?? null} onClose={() => setCallFlowScreen(null)} setAppoData={isAdmin ? setAppoData : null} members={members} currentUser={currentUser} defaultItemId={callFlowScreen.defaultItemId ?? null} defaultListMode={callFlowScreen.defaultListMode ?? null} clientData={clientData} rewardMaster={rewardMaster} initialRevenueMin={callFlowScreen.revenueMin ?? null} initialRevenueMax={callFlowScreen.revenueMax ?? null} initialPrefFilter={callFlowScreen.prefFilter ?? null} />}
      <IncomingCallBanner
        onNavigateToIncoming={() => setCurrentTab('incoming')}
        onOpenCompany={(itemId) => setCallFlowScreen({ list: { _supaId: null, id: null, company: '' }, defaultItemId: itemId, defaultListMode: false })}
      />
    </div>
  );
}


// ============================================================
// Live Status View (架電状況)
// ============================================================
export default SpanaviApp;
