import { formatDateWithWeekday } from './dateUtils';

// アポ取得報告テンプレのレンダリング・解決ユーティリティ

/**
 * 千円単位の整数をカンマ区切り「754,006千円」表記に変換。
 * 旧 AppoReportModal 時代から続く運用表記「◯◯千円」に合わせる。
 * (人間可読のため億/万円表記に勝手に変えると運用とズレるので注意 — 2026-05-26 反省)
 */
export function formatJpAmountFromThousand(n) {
  if (n == null || n === '' || isNaN(Number(n))) return '';
  const num = Number(n);
  if (num === 0) return '';
  return `${num.toLocaleString()}千円`;
}

/**
 * applicable な templates を 優先順 list > client > engagement で返す。
 *
 * @param {Array} templates - 全 active テンプレ
 * @param {Object} list - { _supaId, engagement_id, client_id, ... }
 * @returns {Array} 該当テンプレの配列（先頭が最優先）
 */
export function resolveApplicableTemplates(templates, list) {
  if (!list) return [];
  const out = (templates || []).filter(t => {
    if (t.scope_level === 'list' && t.list_id === list._supaId) return true;
    if (t.scope_level === 'client' && t.client_id === list.client_id && t.engagement_id === list.engagement_id) return true;
    if (t.scope_level === 'engagement' && t.engagement_id === list.engagement_id) return true;
    return false;
  });
  const order = { list: 0, client: 1, engagement: 2 };
  return out.sort((a, b) => (order[a.scope_level] ?? 99) - (order[b.scope_level] ?? 99));
}

/**
 * body_template を 値マップで差し込み。{{key}} と {{#if key == "value"}}...{{/if}} を解釈。
 * schema を渡すと type: 'date' のフィールドは「YYYY-MM-DD（曜）」形式で自動展開する。
 *
 * @param {string} bodyTemplate
 * @param {Object} data - { key: value, ... }
 * @param {Array} [schema] - テンプレ schema（type判定に使う）
 * @returns {string} レンダリング済み本文
 */
export function renderBody(bodyTemplate, data, schema = []) {
  if (!bodyTemplate) return '';
  const dateKeys = new Set((schema || []).filter(f => f.type === 'date').map(f => f.key));
  let body = bodyTemplate;
  // {{#if key == "value"}}...{{/if}} を処理
  body = body.replace(
    /\{\{#if\s+(\w+)\s*==\s*"([^"]+)"\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_m, key, value, content) => (data?.[key] === value ? content : '')
  );
  // {{key}} 置換（日付フィールドは曜日付きに）
  body = body.replace(/\{\{(\w+)\}\}/g, (_m, key) => {
    const v = data?.[key];
    if (v == null) return '';
    if (dateKeys.has(key)) return formatDateWithWeekday(v);
    return String(v);
  });
  return body;
}

/**
 * テンプレの schema と現在の各種コンテキストから、フォーム初期値を構築する。
 *
 * @param {Object} template
 * @param {Object} ctx - { row, list, currentUser, contactsByClient, companyName }
 * @returns {Object} key→value のマップ
 */
export function buildInitialFormValues(template, ctx) {
  if (!template?.schema) return {};
  const { row = {}, list = {}, currentUser = '', contactsByClient = {} } = ctx;
  // クライアント担当者から最初の人をデフォルトに（必要に応じて変更可）
  const primaryContact = (() => {
    const list_contact_ids = list.contactIds || [];
    if (list_contact_ids.length === 0) return null;
    const clientContacts = contactsByClient[list.client_supaId] || contactsByClient[list._client_supaId] || [];
    return clientContacts.find(c => list_contact_ids.includes(c.id)) || null;
  })();

  // JST 今日 (YYYY-MM-DD)
  const todayJst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const result = {};
  for (const field of template.schema) {
    let v = '';
    if (field.auto_fill) {
      switch (field.auto_fill) {
        case 'company_name':         v = row.company || ''; break;
        case 'contact_name':         v = row.representative || ''; break;
        case 'address':              v = (row.address || '').replace(/\/\s*$/, ''); break;
        case 'phone':                v = row.phone || ''; break;
        case 'mobile_phone':         v = row.keyman_mobile || ''; break;
        case 'email':                v = primaryContact?.email || ''; break;
        case 'industry':             v = list.industry || ''; break;
        case 'current_user':         v = currentUser || ''; break;
        case 'business':             v = row.business || ''; break;
        case 'representative':       v = row.representative || ''; break;
        case 'url':                  v = row.url || ''; break;
        case 'sales_thousand':       v = formatJpAmountFromThousand(row.revenue); break;
        case 'net_income_thousand':  v = formatJpAmountFromThousand(row.net_income); break;
        case 'today':                v = todayJst; break;
        default: v = '';
      }
    }
    if (v === '' && field.default !== undefined) v = field.default;
    result[field.key] = v;
  }
  return result;
}

/**
 * AI 添削プロンプト用に、テンプレの schema を JSON Schema 風の指示に変換する。
 *
 * @param {Object} template
 * @returns {string} Claude へ渡す追加プロンプト本文
 */
export function buildAiExtractionInstruction(template) {
  if (!template?.schema) return '';
  const extractFields = template.schema.filter(f => f.ai_extract);
  if (extractFields.length === 0) return template.ai_prompt || '';

  const schemaSpec = extractFields.map(f => {
    const opts = (f.options && f.options.length > 0) ? ` (選択肢: ${f.options.join(' / ')})` : '';
    return `- "${f.key}" (${f.label}${opts})`;
  }).join('\n');

  const customPrompt = template.ai_prompt ? `\n\n${template.ai_prompt}` : '';
  return `通話録音から以下のキーで JSON 形式で抽出してください:\n${schemaSpec}${customPrompt}\n\n各値は文字列で、不明な場合は空文字を返してください。`;
}

/**
 * テンプレが対象 list/client/engagement に対して適用可能かを判定。
 */
export function isTemplateApplicable(template, list) {
  if (!template || !list) return false;
  if (template.scope_level === 'list') return template.list_id === list._supaId;
  if (template.scope_level === 'client') return template.client_id === list.client_id && template.engagement_id === list.engagement_id;
  if (template.scope_level === 'engagement') return template.engagement_id === list.engagement_id;
  return false;
}
