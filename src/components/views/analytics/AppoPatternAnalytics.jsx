import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { color, space, radius, font, alpha } from '../../../constants/design';
import { Card, Badge } from '../../ui';

// アポ取得パターン分類のラベル + バー色（design.js トークン使用）
const PATTERN_LABELS = {
  smooth:               'スムーズ獲得',
  negative_to_positive: 'ネガティブ→好転',
  keyman_difficulty:    'キーマン突破',
  after_concern:        '懸念解消後',
  standard:             '標準的',
  unknown:              '判定不能',
};

const PATTERN_COLORS = (c) => ({
  smooth:               c.success,
  negative_to_positive: c.navyLight,
  keyman_difficulty:    c.gold,
  after_concern:        c.warn,
  standard:             c.gray400,
  unknown:              c.gray300,
});

const PATTERN_BADGE_VARIANTS = {
  smooth:               'success',
  negative_to_positive: 'info',
  keyman_difficulty:    'warn',
  after_concern:        'warn',
  standard:             'neutral',
  unknown:              'default',
};

/**
 * Analytics 内のアポ取得パターン分析タブ
 * - パターン分布の横棒グラフ
 * - メンバー別話し方タグ
 * - パターン別成果ランキング
 * - 効いた話し方トップ10
 *
 * AI を呼ばず、保存済の appo_pattern / talk_style_tags / talk_strength を SQL 集計するだけ。
 */
export default function AppoPatternAnalytics({ from, to, memberName }) {
  const [summary, setSummary] = useState([]);
  const [topTags, setTopTags] = useState([]);
  const [memberTags, setMemberTags] = useState([]);
  const [loading, setLoading] = useState(false);

  const pFrom = from ? new Date(from + 'T00:00:00+09:00').toISOString() : null;
  const pTo   = to   ? new Date(to + 'T23:59:59.999+09:00').toISOString() : null;
  const pMember = memberName || null;

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, tagsRes, memberRes] = await Promise.all([
        supabase.rpc('appo_pattern_summary',     { p_from: pFrom, p_to: pTo, p_member: pMember }),
        supabase.rpc('appo_pattern_top_tags',    { p_from: pFrom, p_to: pTo, p_member: pMember, p_limit: 10 }),
        supabase.rpc('appo_pattern_member_tags', { p_from: pFrom, p_to: pTo }),
      ]);
      if (sumRes.error)    console.error('[AppoPattern] summary:', sumRes.error);
      if (tagsRes.error)   console.error('[AppoPattern] topTags:', tagsRes.error);
      if (memberRes.error) console.error('[AppoPattern] memberTags:', memberRes.error);
      setSummary(sumRes.data || []);
      setTopTags(tagsRes.data || []);
      setMemberTags(memberRes.data || []);
    } finally {
      setLoading(false);
    }
  }, [pFrom, pTo, pMember]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // 横棒グラフ用：パターン分布 (合計件数で正規化)
  const totalCount = useMemo(
    () => summary.reduce((s, r) => s + Number(r.cnt || 0), 0),
    [summary]
  );

  // メンバー別タグを { name → [tag, cnt][] } にgroup
  const memberTagsByName = useMemo(() => {
    const m = {};
    (memberTags || []).forEach(r => {
      if (!m[r.getter_name]) m[r.getter_name] = [];
      if (m[r.getter_name].length < 8) m[r.getter_name].push({ tag: r.tag, cnt: Number(r.cnt) });
    });
    return m;
  }, [memberTags]);

  const memberNames = useMemo(() => Object.keys(memberTagsByName).sort(), [memberTagsByName]);

  // 効いた話し方 (talk_strength) のサンプルは summary.sample_strengths に最大5個ずつ入っている
  const allStrengths = useMemo(() => {
    const list = [];
    (summary || []).forEach(r => {
      (r.sample_strengths || []).forEach(s => {
        if (s && !list.find(x => x.text === s)) {
          list.push({ text: s, pattern: r.appo_pattern });
        }
      });
    });
    return list.slice(0, 12);
  }, [summary]);

  const patternColors = PATTERN_COLORS(color);

  return (
    <Card padding="md" style={{ marginTop: space[5] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[3], flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy }}>
          アポ取得パターン分析
        </h3>
        <span style={{ fontSize: font.size.xs, color: color.textLight }}>
          録音と取得報告から AI が分類した、アポインターの "決め手" 分析
        </span>
        {memberName && (
          <span style={{ fontSize: font.size.xs, color: color.navy, fontWeight: font.weight.semibold }}>
            ／対象: {memberName}
          </span>
        )}
      </div>

      {/* セクション1: パターン分布 横棒 */}
      <section style={{ marginBottom: space[5] }}>
        <SectionHeader title="パターン分布" hint={`総アポ数 ${totalCount.toLocaleString()} 件`} />
        {loading && <LoadingLine />}
        {!loading && totalCount === 0 && <EmptyLine text="分析済データがまだありません" />}
        {!loading && totalCount > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[1.5] }}>
            {summary.map(r => {
              const cnt = Number(r.cnt || 0);
              const ratio = totalCount > 0 ? cnt / totalCount : 0;
              const label = PATTERN_LABELS[r.appo_pattern] || r.appo_pattern;
              const bg = patternColors[r.appo_pattern] || color.gray400;
              return (
                <div key={r.appo_pattern} style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
                  <div style={{ width: 130, fontSize: font.size.xs, color: color.textDark, fontWeight: font.weight.medium }}>
                    {label}
                  </div>
                  <div style={{ flex: 1, position: 'relative', height: 22, background: color.cream, borderRadius: radius.sm, overflow: 'hidden' }}>
                    <div style={{
                      position: 'absolute', top: 0, left: 0, bottom: 0,
                      width: `${Math.max(2, ratio * 100)}%`,
                      background: bg, borderRadius: radius.sm,
                      transition: 'width 0.3s',
                    }} />
                    <div style={{
                      position: 'absolute', top: 0, right: space[2], bottom: 0,
                      display: 'flex', alignItems: 'center',
                      fontSize: font.size.xs, color: color.textMid, fontFamily: font.family.mono,
                    }}>
                      {cnt.toLocaleString()} 件 / {(ratio * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* セクション2: パターン別成果ランキング */}
      <section style={{ marginBottom: space[5] }}>
        <SectionHeader title="パターン別 平均当社売上" hint="同分類で取れたアポの平均 sales_amount" />
        {loading && <LoadingLine />}
        {!loading && summary.length === 0 && <EmptyLine text="データなし" />}
        {!loading && summary.length > 0 && (
          <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.size.xs }}>
              <thead style={{ background: color.navy, color: color.white }}>
                <tr>
                  <th style={th}>パターン</th>
                  <th style={{ ...th, textAlign: 'right' }}>件数</th>
                  <th style={{ ...th, textAlign: 'right' }}>合計売上</th>
                  <th style={{ ...th, textAlign: 'right' }}>平均売上</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r, i) => {
                  const variant = PATTERN_BADGE_VARIANTS[r.appo_pattern] || 'default';
                  return (
                    <tr key={r.appo_pattern}
                      style={{ background: i % 2 === 0 ? color.white : color.cream, borderBottom: `1px solid ${color.borderLight}` }}>
                      <td style={td}>
                        <Badge variant={variant} dot>{PATTERN_LABELS[r.appo_pattern] || r.appo_pattern}</Badge>
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: font.family.mono }}>{Number(r.cnt).toLocaleString()}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: font.family.mono }}>
                        ¥{Number(r.total_sales || 0).toLocaleString()}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: font.family.mono, fontWeight: font.weight.semibold }}>
                        ¥{Math.round(Number(r.avg_sales || 0)).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* セクション3: 効いた話し方トップ10 (タグ別 件数 + 平均売上) */}
      <section style={{ marginBottom: space[5] }}>
        <SectionHeader
          title="成果につながった話し方 トップ10"
          hint="話し方タグ別の出現件数と、そのタグが付いたアポの平均売上"
        />
        {loading && <LoadingLine />}
        {!loading && topTags.length === 0 && <EmptyLine text="タグ集計データなし" />}
        {!loading && topTags.length > 0 && (
          <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.size.xs }}>
              <thead style={{ background: color.navy, color: color.white }}>
                <tr>
                  <th style={{ ...th, width: 30, textAlign: 'center' }}>#</th>
                  <th style={th}>話し方タグ</th>
                  <th style={{ ...th, textAlign: 'right' }}>件数</th>
                  <th style={{ ...th, textAlign: 'right' }}>平均売上</th>
                </tr>
              </thead>
              <tbody>
                {topTags.map((r, i) => (
                  <tr key={r.tag}
                    style={{ background: i % 2 === 0 ? color.white : color.cream, borderBottom: `1px solid ${color.borderLight}` }}>
                    <td style={{ ...td, textAlign: 'center', color: color.textMid, fontFamily: font.family.mono }}>{i + 1}</td>
                    <td style={{ ...td, fontWeight: font.weight.medium, color: color.navy }}>{r.tag}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: font.family.mono }}>{Number(r.cnt).toLocaleString()}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: font.family.mono, fontWeight: font.weight.semibold }}>
                      ¥{Math.round(Number(r.avg_sales || 0)).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* セクション4: アポインター別 話し方タグ */}
      <section style={{ marginBottom: space[5] }}>
        <SectionHeader title="メンバー別 話し方タグ" hint="各アポインターのアポ取得時に頻出するタグ (上位8個)" />
        {loading && <LoadingLine />}
        {!loading && memberNames.length === 0 && <EmptyLine text="メンバー集計データなし" />}
        {!loading && memberNames.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: space[2] }}>
            {memberNames.map(name => {
              const tags = memberTagsByName[name];
              const maxCnt = Math.max(...tags.map(t => t.cnt));
              return (
                <div key={name} style={{
                  border: `1px solid ${color.border}`, borderRadius: radius.md,
                  padding: space[2], background: color.white,
                }}>
                  <div style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[1] }}>
                    {name}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[1] }}>
                    {tags.map(t => {
                      const weight = t.cnt / Math.max(1, maxCnt);
                      return (
                        <span key={t.tag} style={{
                          fontSize: font.size.xs,
                          padding: '2px 8px',
                          borderRadius: radius.pill,
                          background: alpha(color.navyLight, 0.05 + weight * 0.20),
                          color: color.navy,
                          border: `1px solid ${alpha(color.navy, 0.15 + weight * 0.20)}`,
                          fontWeight: font.weight.medium,
                        }}>
                          {t.tag}
                          <span style={{ marginLeft: 4, color: color.textLight, fontFamily: font.family.mono }}>
                            {t.cnt}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* セクション5: 効いた話し方サンプル (talk_strength のテキスト) */}
      {allStrengths.length > 0 && (
        <section>
          <SectionHeader
            title={'AI が抽出した「決め手」の話し方サンプル'}
            hint="実際のアポから AI が見出したアポインターの工夫"
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[1.5] }}>
            {allStrengths.map((s, i) => {
              const variant = PATTERN_BADGE_VARIANTS[s.pattern] || 'default';
              return (
                <div key={i} style={{
                  display: 'flex', gap: space[2], alignItems: 'flex-start',
                  padding: space[2], background: color.cream,
                  borderLeft: `3px solid ${patternColors[s.pattern] || color.gray400}`,
                  borderRadius: radius.sm,
                }}>
                  <div style={{ flexShrink: 0 }}>
                    <Badge variant={variant} dot>{PATTERN_LABELS[s.pattern] || s.pattern}</Badge>
                  </div>
                  <div style={{ fontSize: font.size.xs, color: color.textDark, lineHeight: 1.6 }}>
                    {s.text}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </Card>
  );
}

function SectionHeader({ title, hint }) {
  return (
    <div style={{ marginBottom: space[2] }}>
      <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy }}>
        {title}
      </div>
      {hint && (
        <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 2 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function LoadingLine() {
  return <div style={{ padding: space[3], fontSize: font.size.xs, color: color.textLight }}>読み込み中…</div>;
}

function EmptyLine({ text }) {
  return <div style={{ padding: space[3], fontSize: font.size.xs, color: color.textLight }}>{text}</div>;
}

const th = { padding: '6px 10px', textAlign: 'left', fontWeight: font.weight.semibold, fontSize: font.size.xs };
const td = { padding: '6px 10px', borderBottom: `1px solid ${color.borderLight}` };
