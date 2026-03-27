import React, { useState, useEffect } from "react";
import { C } from '../../constants/colors';
import { useIsMobile } from '../../hooks/useIsMobile';
import { CALL_RESULTS } from '../../constants/callResults';
import { getIndustryCategory } from '../../utils/industry';
import { deleteCallRecordsByListId, deleteCallListItemsByListId, updateCallListCount, fetchCallListItems, insertCallListItems } from '../../lib/supabaseWrite';
import { Badge } from '../common/Badge';
import { ScorePill } from '../common/ScorePill';

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

const PREFS = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
const extractPref = (address) => PREFS.find(p => address?.startsWith(p)) || '';

export default function DetailModal({ list, onClose, industryRules, now, callListData, setCallListData, setCallFlowScreen, isAdmin, onDelete }) {
  const isMobile = useIsMobile();
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
      background: "rgba(10,25,41,0.6)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 200, animation: "fadeIn 0.2s ease",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', border: "1px solid #E5E7EB",
        borderRadius: isMobile ? 0 : 4, width: isMobile ? '100vw' : "90%", maxWidth: isMobile ? 'none' : 820, height: isMobile ? '100vh' : undefined, maxHeight: isMobile ? '100vh' : "85vh",
        overflowY: "auto", padding: isMobile ? 16 : 28,
        boxShadow: "0 20px 60px rgba(10,25,41,0.25)",
      }}>

        {/* ── タイトル行 ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0D2247', marginBottom: 6, fontFamily: "'Noto Serif JP', serif" }}>{list.company}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Badge color={'#0D2247'} glow>{list.type}</Badge>
              <Badge color={list.status === "架電可能" ? '#1E40AF' : C.red} glow>{list.status}</Badge>
              <Badge color={'#1E40AF'} glow>{list.industry}</Badge>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 4, background: '#F8F9FA', border: "1px solid #E5E7EB", color: '#6B7280', cursor: "pointer", fontSize: 16, flexShrink: 0 }}>✕</button>
        </div>

        {/* (a) おすすめ度合い・総合スコア */}
        {isOutsideHours ? (
          <div style={{ padding: "12px 16px", borderRadius: 4, background: '#F8F9FA', border: "1px solid #E5E7EB", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: C.textMid, fontWeight: 600 }}>この時間帯は架電時間外です</span>
            <span style={{ fontSize: 10, color: C.textLight }}>（7:00〜20:00が架電推奨時間帯）</span>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1.2, padding: "14px 18px", borderRadius: 4, background: '#F8F9FA', border: "1px solid #E5E7EB" }}>
              <div style={{ fontSize: 10, color: C.textLight, marginBottom: 6, fontWeight: 600 }}>総合スコア</div>
              <ScorePill score={list.recommendation.score} label={list.recommendation.label} color={list.recommendation.color} />
            </div>
            <div style={{ flex: 1, padding: "14px 18px", borderRadius: 4, background: '#F8F9FA', border: "1px solid #E5E7EB" }}>
              <div style={{ fontSize: 10, color: C.textLight, marginBottom: 6, fontWeight: 600 }}>時間帯スコア（30%）</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono'", color: '#0D2247' }}>{list.recommendation.timeScore}</span>
                <span style={{ fontSize: 11, color: C.textLight }}>{list.recommendation.timeLabel}</span>
              </div>
            </div>
            <div style={{ flex: 1, padding: "14px 18px", borderRadius: 4, background: '#F8F9FA', border: "1px solid #E5E7EB" }}>
              <div style={{ fontSize: 10, color: C.textLight, marginBottom: 6, fontWeight: 600 }}>架電頻度スコア（70%）</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono'", color: '#0D2247' }}>{list.recommendation.recencyScore}</span>
                <span style={{ fontSize: 11, color: C.textLight }}>{list.recommendation.recencyLabel || "未架電"}</span>
              </div>
            </div>
            <div style={{ flex: 0.7, padding: "14px 18px", borderRadius: 4, background: '#F8F9FA', border: "1px solid #E5E7EB" }}>
              <div style={{ fontSize: 10, color: C.textLight, marginBottom: 6, fontWeight: 600 }}>リスト企業数</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono'", color: '#0D2247' }}>{list.count.toLocaleString()}</div>
            </div>
          </div>
        )}

        {/* (b) クライアント情報 | 注意事項 — 横並び */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, padding: "12px 16px", borderRadius: 4, background: '#F8F9FA', border: "1px solid #E5E7EB" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0D2247', marginBottom: 10 }}>クライアント情報</div>
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
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #E5E7EB" }}>
                <div style={{ fontSize: 10, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>企業概要</div>
                <div style={{ fontSize: 11, color: C.textMid, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{list.companyInfo}</div>
              </div>
            )}
          </div>
          <div style={{ flex: 1, padding: "12px 16px", borderRadius: 4, background: '#F8F9FA', border: "1px solid #E5E7EB" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0D2247', marginBottom: 8 }}>注意事項</div>
            {list.cautions
              ? <div style={{ fontSize: 11, color: C.textDark, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{list.cautions}</div>
              : <div style={{ fontSize: 11, color: C.textLight }}>注意事項はありません</div>
            }
          </div>
        </div>

        {/* (c) 業界架電ルール */}
        {rule && (
          <div style={{ padding: "12px 16px", borderRadius: 4, background: '#F8F9FA', border: "1px solid #E5E7EB", marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#0D2247', marginBottom: 6 }}>{cat}の架電ルール</div>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: C.textDark }}>{rule.rule}</div>
            <div style={{ display: "flex", gap: 16, fontSize: 11, marginBottom: 8 }}>
              {rule.goodHours && <div><span style={{ color: C.textLight }}>推奨: </span><span style={{ color: '#0D2247', fontWeight: 600 }}>{rule.goodHours}</span></div>}
              {rule.badHours && <div><span style={{ color: C.textLight }}>非推奨: </span><span style={{ color: C.red }}>{rule.badHours}</span></div>}
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              {DAY_NAMES.map((d, i) => (
                <span key={i} style={{
                  padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: 600,
                  background: rule.badDays.includes(i) ? C.red + "15" : rule.goodDays.includes(i) ? '#1E40AF1a' : '#F8F9FA',
                  color: rule.badDays.includes(i) ? C.red : rule.goodDays.includes(i) ? '#0D2247' : C.textLight,
                  border: "1px solid " + (rule.badDays.includes(i) ? C.red + "30" : rule.goodDays.includes(i) ? '#1E40AF40' : C.border),
                }}>{d}</span>
              ))}
            </div>
          </div>
        )}

        {list.notes && (
          <div style={{ padding: "10px 14px", borderRadius: 4, background: '#F8F9FA', border: "1px solid #E5E7EB", fontSize: 12, color: C.textMid, marginBottom: 12 }}>
            <span style={{ fontWeight: 600, color: '#0D2247' }}>備考: </span>{list.notes}
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
            disabled={!flowStartNo || !flowEndNo}
            onClick={() => {
              const sf = selectedStatuses.length > 0 ? selectedStatuses : null;
              setCallFlowScreen({ list, startNo: flowStartNo ? parseInt(flowStartNo) : null, endNo: flowEndNo ? parseInt(flowEndNo) : null, statusFilter: sf, revenueMin: revenueMin || null, revenueMax: revenueMax || null, prefFilter: prefFilters.length > 0 ? prefFilters : null });
            }}
            style={{
              padding: "6px 20px", borderRadius: 6,
              background: flowStartNo && flowEndNo ? '#0D2247' : C.border,
              color: C.white, cursor: flowStartNo && flowEndNo ? "pointer" : "not-allowed",
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
                      background: isActive ? '#0D2247' : '#F8F9FA',
                      color: isActive ? '#fff' : C.textMid,
                      border: '1px solid ' + (isActive ? '#0D2247' : C.border),
                      transition: 'all 0.12s',
                    }}
                  >{label}</button>
                );
              })}
            </div>
          );
        })()}

        {/* 売上高フィルター + 都道府県フィルター（同一行） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#706E6B', marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ whiteSpace: 'nowrap' }}>売上高</span>
          {[
            { value: revenueMin, setter: setRevenueMin, isMax: false },
            { value: revenueMax, setter: setRevenueMax, isMax: true },
          ].map(({ value, setter, isMax }, idx) => (
            <React.Fragment key={idx}>
              {idx === 1 && <span>〜</span>}
              <select value={value} onChange={e => setter(e.target.value)}
                style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid ' + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", background: value ? '#EAF4FF' : '#fff', color: '#0D2247', cursor: 'pointer' }}>
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
            <div style={{ position: 'relative', marginLeft: 12 }}>
              {prefDropOpen && (
                <div onClick={() => setPrefDropOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }} />
              )}
              <button onClick={() => setPrefDropOpen(v => !v)} style={{
                padding: '4px 8px', borderRadius: 4,
                border: '1px solid ' + (prefFilters.length > 0 ? '#0D2247' : C.border),
                background: prefFilters.length > 0 ? '#EAF4FF' : '#fff',
                fontSize: 11, fontFamily: "'Noto Sans JP'", cursor: 'pointer',
                color: '#0D2247', whiteSpace: 'nowrap',
              }}>
                {prefFilters.length > 0 ? `都道府県(${prefFilters.length})▼` : '都道府県▼'}
              </button>
              {prefDropOpen && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 101,
                  background: C.white, border: '1px solid ' + C.border,
                  borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                  minWidth: 130, maxHeight: 220, overflowY: 'auto', padding: '4px 0',
                }}>
                  {prefFilters.length > 0 && (
                    <div onClick={() => setPrefFilters([])} style={{
                      padding: '4px 10px', fontSize: 10, color: '#0D2247', cursor: 'pointer',
                      borderBottom: '1px solid #E5E7EB', fontWeight: 600,
                    }}>クリア</div>
                  )}
                  {availablePrefs.map(p => (
                    <label key={p} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px', cursor: 'pointer', fontSize: 11,
                      fontFamily: "'Noto Sans JP'", color: '#0D2247',
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
        </div>

        {/* CSV取込 / リスト削除（管理者のみ） */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
          {isAdmin && (
            <label style={{
              display: "inline-block",
              padding: "6px 16px", borderRadius: 6,
              background: '#F8F9FA', color: '#0D2247', cursor: "pointer",
              fontSize: 11, fontWeight: 600, fontFamily: "'Noto Sans JP'",
              border: "1px solid " + C.border,
              opacity: csvImporting ? 0.6 : 1,
              pointerEvents: csvImporting ? "none" : "auto",
            }}>
              {csvImporting ? "取込中..." : "CSV取込"}
              <input type="file" accept=".csv" onChange={handleCSVImport} style={{ display: "none" }} />
            </label>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={handleDeleteList}
              disabled={deleting}
              style={{
                padding: "6px 16px", borderRadius: 6, border: "none",
                background: deleting ? "#ccc" : "#e53835",
                color: "#fff", cursor: deleting ? "default" : "pointer",
                fontSize: 11, fontWeight: 600, fontFamily: "'Noto Sans JP'",
                opacity: deleting ? 0.6 : 1,
              }}
            >{deleting ? "クリア中..." : "CSVクリア"}</button>
          )}
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
