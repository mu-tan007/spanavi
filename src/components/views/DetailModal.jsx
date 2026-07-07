import React, { useState, useEffect } from "react";
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select } from '../ui';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useCallStatuses } from '../../hooks/useCallStatuses';
import { getIndustryCategory } from '../../utils/industry';
import { deleteCallRecordsByListId, deleteCallListItemsByListId, updateCallListCount, fetchCallListItems, insertCallListItems } from '../../lib/supabaseWrite';
import { Badge } from '../common/Badge';
import { ScorePill } from '../common/ScorePill';
import CallHistoryPanel from './CallHistoryPanel';

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

const PREFS = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
const extractPref = (address) => PREFS.find(p => address?.startsWith(p)) || '';

export default function DetailModal({ list, onClose, industryRules, now, callListData, setCallListData, setCallFlowScreen, isAdmin, onDelete }) {
  const isMobile = useIsMobile();
  const { statuses: callStatuses } = useCallStatuses();
  if (!list) return null;
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
    if (e1) { alert('架電履歴の削除に失敗しました: ' + (e1.message || JSON.stringify(e1))); setDeleting(false); return; }
    const e2 = await deleteCallListItemsByListId(list._supaId);
    if (e2) { alert('企業データの削除に失敗しました: ' + (e2.message || JSON.stringify(e2))); setDeleting(false); return; }
    const e3 = await updateCallListCount(list._supaId, 0);
    if (e3) { alert('件数更新に失敗しました: ' + (e3.message || JSON.stringify(e3))); setDeleting(false); return; }
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
  const [csvData, setCsvData] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]); // 空配列=全ステータス
  const [revenueMin, setRevenueMin] = useState('');
  const [revenueMax, setRevenueMax] = useState('');
  const [prefFilters, setPrefFilters] = useState([]);
  const [prefDropOpen, setPrefDropOpen] = useState(false);
  const [callCountMin, setCallCountMin] = useState('');
  const [callCountMax, setCallCountMax] = useState('');

  useEffect(() => {
    if (!list._supaId) {
      return;
    }
    fetchCallListItems(list._supaId).then(({ data }) => {
      const items = data || [];
      setItemCount(items.length);
      setCsvData(items);
    });
  }, [list._supaId]);

  const availablePrefs = [...new Set(csvData.map(r => extractPref(r.address)).filter(Boolean))].sort();

  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!list._supaId) {
      alert('このリストはSupabase IDが未設定のためインポートできません。');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
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

      if (rows.length === 0) {
        alert('CSVのパース結果が0件です。ヘッダー名を確認してください。\n検出したヘッダー: ' + rawHeaders.join(', '));
        return;
      }

      setCsvImporting(true);
      const { data, error } = await insertCallListItems(list._supaId, rows);
      setCsvImporting(false);
      if (error) {
        console.error('[CSV取込] Supabase エラー:', error);
        alert('CSV取込に失敗しました: ' + (error.message || JSON.stringify(error)));
        return;
      }
      const insertedCount = data?.length ?? rows.length;
      const newTotalCount = (itemCount ?? 0) + insertedCount;
      await updateCallListCount(list._supaId, newTotalCount);
      if (setCallListData) setCallListData(prev => prev.map(l => l.id === list.id ? { ...l, count: newTotalCount } : l));
      setCsvImported(insertedCount);
      setItemCount(newTotalCount);
    };
    reader.readAsText(file, "UTF-8");
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: alpha('#0A1929', 0.6), backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 200, animation: "fadeIn 0.2s ease",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: color.white, border: `1px solid ${color.border}`,
        borderRadius: isMobile ? 0 : radius.md, width: isMobile ? '100vw' : "90%", maxWidth: isMobile ? 'none' : 820, height: isMobile ? '100vh' : undefined, maxHeight: isMobile ? '100vh' : "85vh",
        overflowY: "auto", padding: isMobile ? space[4] : 28,
        boxShadow: shadow.xl,
      }}>

        {/* ── タイトル行 ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: space[5] }}>
          <div>
            <div style={{ fontSize: font.size.lg + 2, fontWeight: font.weight.black, color: color.navy, marginBottom: space[1.5], fontFamily: "'Noto Serif JP', serif" }}>{list.company}</div>
            <div style={{ display: "flex", gap: space[1.5], flexWrap: "wrap" }}>
              {(list.productCategoryName || list.engagementName || list.type) && (
                <Badge color={color.navy} glow>
                  {[list.productCategoryName, list.engagementName].filter(Boolean).join(' / ') || list.type}
                </Badge>
              )}
              <Badge color={list.status === "架電可能" ? '#1E40AF' : color.danger} glow>{list.status}</Badge>
              <Badge color={'#1E40AF'} glow>{list.industry}</Badge>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: radius.md, background: color.offWhite, border: `1px solid ${color.border}`, color: color.gray500, cursor: "pointer", fontSize: font.size.lg, flexShrink: 0 }}>✕</button>
        </div>

        {/* (a) おすすめ度合い・総合スコア */}
        {isOutsideHours ? (
          <div style={{ padding: `${space[3]}px ${space[4]}px`, borderRadius: radius.md, background: color.offWhite, border: `1px solid ${color.border}`, marginBottom: space[4], display: "flex", alignItems: "center", gap: space[2] }}>
            <span style={{ fontSize: font.size.sm, color: color.textMid, fontWeight: font.weight.semibold }}>この時間帯は架電時間外です</span>
            <span style={{ fontSize: font.size.xs - 1, color: color.textLight }}>（7:00〜20:00が架電推奨時間帯）</span>
          </div>
        ) : (
          <div style={{ display: "flex", gap: space[2.5], marginBottom: space[4] }}>
            <div style={{ flex: 1.2, padding: "14px 18px", borderRadius: radius.md, background: color.offWhite, border: `1px solid ${color.border}` }}>
              <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginBottom: space[1.5], fontWeight: font.weight.semibold }}>総合スコア</div>
              <ScorePill score={list.recommendation.score} label={list.recommendation.label} color={list.recommendation.color} />
            </div>
            <div style={{ flex: 1, padding: "14px 18px", borderRadius: radius.md, background: color.offWhite, border: `1px solid ${color.border}` }}>
              <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginBottom: space[1.5], fontWeight: font.weight.semibold }}>時間帯スコア（30%）</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: space[1.5] }}>
                <span style={{ fontSize: font.size.xl, fontWeight: font.weight.black, fontFamily: font.family.mono, color: color.navy }}>{list.recommendation.timeScore}</span>
                <span style={{ fontSize: font.size.xs, color: color.textLight }}>{list.recommendation.timeLabel}</span>
              </div>
            </div>
            <div style={{ flex: 1, padding: "14px 18px", borderRadius: radius.md, background: color.offWhite, border: `1px solid ${color.border}` }}>
              <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginBottom: space[1.5], fontWeight: font.weight.semibold }}>架電頻度スコア（70%）</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: space[1.5] }}>
                <span style={{ fontSize: font.size.xl, fontWeight: font.weight.black, fontFamily: font.family.mono, color: color.navy }}>{list.recommendation.recencyScore}</span>
                <span style={{ fontSize: font.size.xs, color: color.textLight }}>{list.recommendation.recencyLabel || "未架電"}</span>
              </div>
            </div>
            <div style={{ flex: 0.7, padding: "14px 18px", borderRadius: radius.md, background: color.offWhite, border: `1px solid ${color.border}` }}>
              <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginBottom: space[1.5], fontWeight: font.weight.semibold }}>リスト企業数</div>
              <div style={{ fontSize: font.size.xl, fontWeight: font.weight.black, fontFamily: font.family.mono, color: color.navy }}>{list.count.toLocaleString()}</div>
            </div>
          </div>
        )}

        {/* (b) クライアント情報 | 注意事項 — 横並び */}
        <div style={{ display: "flex", gap: space[3], marginBottom: space[4] }}>
          <div style={{ flex: 1, padding: `${space[3]}px ${space[4]}px`, borderRadius: radius.md, background: color.offWhite, border: `1px solid ${color.border}` }}>
            <div style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[2.5] }}>クライアント情報</div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: font.size.xs }}>
              {[
                ["担当者", list.manager],
                ["業種",   list.industry],
                ["企業数", list.count.toLocaleString() + "社"],
                ["商材", [list.productCategoryName, list.engagementName].filter(Boolean).join(' / ') || list.type],
              ].map(([k, v]) => v ? [
                <span key={k + "_k"} style={{ color: color.textLight, whiteSpace: "nowrap" }}>{k}</span>,
                <span key={k + "_v"} style={{ color: color.textDark, fontWeight: font.weight.semibold }}>{v}</span>,
              ] : null)}
            </div>
            {list.companyInfo && (
              <div style={{ marginTop: space[2.5], paddingTop: space[2.5], borderTop: `1px solid ${color.border}` }}>
                <div style={{ fontSize: font.size.xs - 1, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 4 }}>企業概要</div>
                <div style={{ fontSize: font.size.xs, color: color.textMid, lineHeight: font.lineHeight.normal + 0.1, whiteSpace: "pre-wrap" }}>{list.companyInfo}</div>
              </div>
            )}
          </div>
          <div style={{ flex: 1, padding: `${space[3]}px ${space[4]}px`, borderRadius: radius.md, background: color.offWhite, border: `1px solid ${color.border}` }}>
            <div style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[2] }}>注意事項</div>
            {list.cautions
              ? <div style={{ fontSize: font.size.xs, color: color.textDark, lineHeight: font.lineHeight.relaxed, whiteSpace: "pre-wrap" }}>{list.cautions}</div>
              : <div style={{ fontSize: font.size.xs, color: color.textLight }}>注意事項はありません</div>
            }
          </div>
        </div>

        {/* (c) 業界架電ルール */}
        {rule && (
          <div style={{ padding: `${space[3]}px ${space[4]}px`, borderRadius: radius.md, background: color.offWhite, border: `1px solid ${color.border}`, marginBottom: space[4] }}>
            <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.navy, marginBottom: space[1.5] }}>{cat}の架電ルール</div>
            <div style={{ fontSize: font.size.sm, fontWeight: font.weight.medium, marginBottom: space[2], color: color.textDark }}>{rule.rule}</div>
            <div style={{ display: "flex", gap: space[4], fontSize: font.size.xs, marginBottom: space[2] }}>
              {rule.goodHours && <div><span style={{ color: color.textLight }}>推奨: </span><span style={{ color: color.navy, fontWeight: font.weight.semibold }}>{rule.goodHours}</span></div>}
              {rule.badHours && <div><span style={{ color: color.textLight }}>非推奨: </span><span style={{ color: color.danger }}>{rule.badHours}</span></div>}
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              {DAY_NAMES.map((d, i) => (
                <span key={i} style={{
                  padding: "2px 8px", borderRadius: radius.sm, fontSize: font.size.xs - 1, fontWeight: font.weight.semibold,
                  background: rule.badDays.includes(i) ? alpha(color.danger, 0.08) : rule.goodDays.includes(i) ? alpha('#1E40AF', 0.10) : color.offWhite,
                  color: rule.badDays.includes(i) ? color.danger : rule.goodDays.includes(i) ? color.navy : color.textLight,
                  border: `1px solid ${rule.badDays.includes(i) ? alpha(color.danger, 0.18) : rule.goodDays.includes(i) ? alpha('#1E40AF', 0.25) : color.border}`,
                }}>{d}</span>
              ))}
            </div>
          </div>
        )}

        {list.notes && (
          <div style={{ padding: `${space[2.5]}px ${space[3] + 2}px`, borderRadius: radius.md, background: color.offWhite, border: `1px solid ${color.border}`, fontSize: font.size.sm, color: color.textMid, marginBottom: space[3] }}>
            <span style={{ fontWeight: font.weight.semibold, color: color.navy }}>備考: </span>{list.notes}
          </div>
        )}

        <CallHistoryPanel listSupaId={list._supaId} />

        {/* 架電開始 + CSV取込 */}
        <div style={{ display: "flex", alignItems: "center", gap: space[2], marginBottom: space[2.5], flexWrap: "wrap" }}>
          <span style={{ fontSize: font.size.xs, color: color.textMid, whiteSpace: "nowrap" }}>No.</span>
          <Input
            type="number"
            size="sm"
            value={flowStartNo}
            onChange={e => setFlowStartNo(e.target.value)}
            placeholder="開始"
            fullWidth={false}
            containerStyle={{ width: 64 }}
            style={{ fontFamily: font.family.mono, textAlign: 'center' }}
          />
          <span style={{ fontSize: font.size.xs, color: color.textMid }}>〜</span>
          <Input
            type="number"
            size="sm"
            value={flowEndNo}
            onChange={e => setFlowEndNo(e.target.value)}
            placeholder="終了"
            fullWidth={false}
            containerStyle={{ width: 64 }}
            style={{ fontFamily: font.family.mono, textAlign: 'center' }}
          />
          <Button
            size="sm"
            variant="primary"
            disabled={!flowStartNo || !flowEndNo}
            onClick={() => {
              const sf = selectedStatuses.length > 0 ? selectedStatuses : null;
              setCallFlowScreen({ list, startNo: flowStartNo ? parseInt(flowStartNo) : null, endNo: flowEndNo ? parseInt(flowEndNo) : null, statusFilter: sf, revenueMin: revenueMin || null, revenueMax: revenueMax || null, prefFilter: prefFilters.length > 0 ? prefFilters : null, callCountMin: callCountMin !== '' ? callCountMin : null, callCountMax: callCountMax !== '' ? callCountMax : null });
            }}
          >検索</Button>
          <Button
            size="sm"
            variant="outline"
            title="ナンバーを入力せず、リスト全件を一覧で開く"
            onClick={() => {
              const sf = selectedStatuses.length > 0 ? selectedStatuses : null;
              setCallFlowScreen({ list, startNo: null, endNo: null, statusFilter: sf, revenueMin: revenueMin || null, revenueMax: revenueMax || null, prefFilter: prefFilters.length > 0 ? prefFilters : null, callCountMin: callCountMin !== '' ? callCountMin : null, callCountMax: callCountMax !== '' ? callCountMax : null });
            }}
          >全件</Button>
          {itemCount !== null && (
            <span style={{ fontSize: font.size.xs - 1, color: color.textLight }}>
              リスト: {itemCount.toLocaleString()}件
            </span>
          )}
        </div>

        {/* ステータス絞り込みボタン */}
        {(() => {
          const STATUS_LABELS = ['未架電', ...callStatuses.map(r => r.label)];
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: space[2.5] }}>
              {['全ステータス', ...STATUS_LABELS].map(label => {
                const isActive = label === '全ステータス' ? isAll : selectedStatuses.includes(label);
                return (
                  <button
                    key={label}
                    onClick={() => toggleStatus(label)}
                    style={{
                      padding: '3px 9px', borderRadius: radius.md, cursor: 'pointer',
                      fontSize: font.size.xs - 1, fontWeight: font.weight.semibold, fontFamily: font.family.sans,
                      background: isActive ? color.navy : color.offWhite,
                      color: isActive ? color.white : color.textMid,
                      border: `1px solid ${isActive ? color.navy : color.border}`,
                      transition: 'all 0.12s',
                    }}
                  >{label}</button>
                );
              })}
            </div>
          );
        })()}

        {/* 売上高フィルター + 都道府県フィルター（同一行） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: font.size.xs, color: '#706E6B', marginBottom: space[2.5], flexWrap: 'wrap' }}>
          <span style={{ whiteSpace: 'nowrap' }}>売上高</span>
          {[
            { value: revenueMin, setter: setRevenueMin, isMax: false },
            { value: revenueMax, setter: setRevenueMax, isMax: true },
          ].map(({ value, setter, isMax }, idx) => (
            <React.Fragment key={idx}>
              {idx === 1 && <span>〜</span>}
              <select value={value} onChange={e => setter(e.target.value)}
                style={{ padding: '4px 6px', borderRadius: radius.md, border: `1px solid ${color.border}`, fontSize: font.size.xs, fontFamily: font.family.sans, background: value ? '#EAF4FF' : color.white, color: color.navy, cursor: 'pointer' }}>
                <option value="">指定なし</option>
                {[['1億円',100000],['2億円',200000],['3億円',300000],['4億円',400000],['5億円',500000],
                  ['6億円',600000],['7億円',700000],['8億円',800000],['9億円',900000],['10億円',1000000],
                  ['20億円',2000000],['30億円',3000000],['40億円',4000000],['50億円',5000000]].map(([label, val]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
                {isMax && <option value="999999999">50億円以上</option>}
              </select>
            </React.Fragment>
          ))}

          {/* 都道府県フィルター（売上高の右隣） */}
          {availablePrefs.length > 0 && (
            <div style={{ position: 'relative', marginLeft: space[3] }}>
              {prefDropOpen && (
                <div onClick={() => setPrefDropOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }} />
              )}
              <button onClick={() => setPrefDropOpen(v => !v)} style={{
                padding: '4px 8px', borderRadius: radius.md,
                border: `1px solid ${prefFilters.length > 0 ? color.navy : color.border}`,
                background: prefFilters.length > 0 ? '#EAF4FF' : color.white,
                fontSize: font.size.xs, fontFamily: font.family.sans, cursor: 'pointer',
                color: color.navy, whiteSpace: 'nowrap',
              }}>
                {prefFilters.length > 0 ? `都道府県(${prefFilters.length})▼` : '都道府県▼'}
              </button>
              {prefDropOpen && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 101,
                  background: color.white, border: `1px solid ${color.border}`,
                  borderRadius: radius.lg, boxShadow: shadow.md,
                  minWidth: 130, maxHeight: 220, overflowY: 'auto', padding: '4px 0',
                }}>
                  {prefFilters.length > 0 && (
                    <div onClick={() => setPrefFilters([])} style={{
                      padding: '4px 10px', fontSize: font.size.xs - 1, color: color.navy, cursor: 'pointer',
                      borderBottom: `1px solid ${color.border}`, fontWeight: font.weight.semibold,
                    }}>クリア</div>
                  )}
                  {availablePrefs.map(p => (
                    <label key={p} style={{
                      display: 'flex', alignItems: 'center', gap: space[1.5],
                      padding: '4px 10px', cursor: 'pointer', fontSize: font.size.xs,
                      fontFamily: font.family.sans, color: color.navy,
                    }}>
                      <input type="checkbox" checked={prefFilters.includes(p)}
                        onChange={() => setPrefFilters(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}
                        style={{ cursor: 'pointer' }}
                      />
                      {p}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 架電回数フィルター（都道府県の右隣） */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: space[3] }}>
            <span style={{ whiteSpace: 'nowrap' }}>架電回数</span>
            {[
              { value: callCountMin, setter: setCallCountMin },
              { value: callCountMax, setter: setCallCountMax },
            ].map(({ value, setter }, idx) => (
              <React.Fragment key={idx}>
                {idx === 1 && <span>〜</span>}
                <select value={value} onChange={e => setter(e.target.value)}
                  style={{ padding: '4px 6px', borderRadius: radius.md, border: `1px solid ${color.border}`, fontSize: font.size.xs, fontFamily: font.family.sans, background: value !== '' ? '#EAF4FF' : color.white, color: color.navy, cursor: 'pointer' }}>
                  <option value="">指定なし</option>
                  {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                    <option key={n} value={n}>{n}回</option>
                  ))}
                </select>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* CSV取込 / リスト削除（管理者のみ） */}
        <div style={{ display: "flex", alignItems: "center", gap: space[2.5], marginTop: 4, flexWrap: "wrap" }}>
          {isAdmin && (
            <label style={{
              display: "inline-block",
              padding: `${space[1.5]}px ${space[4]}px`, borderRadius: radius.lg,
              background: color.offWhite, color: color.navy, cursor: "pointer",
              fontSize: font.size.xs, fontWeight: font.weight.semibold, fontFamily: font.family.sans,
              border: `1px solid ${color.border}`,
              opacity: csvImporting ? 0.6 : 1,
              pointerEvents: csvImporting ? "none" : "auto",
            }}>
              {csvImporting ? "取込中..." : "CSV取込"}
              <input type="file" accept=".csv" onChange={handleCSVImport} style={{ display: "none" }} />
            </label>
          )}
          {isAdmin && (
            <Button
              size="sm"
              variant="danger"
              onClick={handleDeleteList}
              disabled={deleting}
              loading={deleting}
            >{deleting ? "クリア中..." : "CSVクリア"}</Button>
          )}
          {csvImported && (
            <span style={{ fontSize: font.size.xs, color: color.success, fontWeight: font.weight.semibold }}>
              {csvImported}件をSupabaseに保存しました
            </span>
          )}
          {!list._supaId && (
            <span style={{ fontSize: font.size.xs - 1, color: color.textLight }}>※ Supabase IDが未設定のためインポートできません</span>
          )}
        </div>
      </div>
    </div>
  );
}
