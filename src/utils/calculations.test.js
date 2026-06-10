import { describe, it, expect } from 'vitest';
import { calcRankAndRate } from './calculations';

describe('calcRankAndRate（累計売上→ランク・インセンティブ率）', () => {
  it('デフォルト閾値: 0=トレーニー22% / 200万=プレイヤー24% / 500万=スパルタン26% / 1000万=スーパースパルタン28%', () => {
    expect(calcRankAndRate(0)).toEqual({ rank: 'トレーニー', rate: 0.22 });
    expect(calcRankAndRate(1999999)).toEqual({ rank: 'トレーニー', rate: 0.22 });
    expect(calcRankAndRate(2000000)).toEqual({ rank: 'プレイヤー', rate: 0.24 });
    expect(calcRankAndRate(5000000)).toEqual({ rank: 'スパルタン', rate: 0.26 });
    expect(calcRankAndRate(10000000)).toEqual({ rank: 'スーパースパルタン', rate: 0.28 });
  });

  it('org_settings の rank_definitions（JSON）で閾値を上書きできる', () => {
    const s = { rank_definitions: JSON.stringify([
      { name: 'ゴールド', threshold: 1000000 },
      { name: 'シルバー', threshold: 0 },
    ]) };
    expect(calcRankAndRate(1500000, s).rank).toBe('ゴールド');
    expect(calcRankAndRate(500000, s).rank).toBe('シルバー');
  });

  it('reward_rate_* キーで率を上書きできる', () => {
    const s = { 'reward_rate_トレーニー': '30' }; // % 表記で保存されている
    expect(calcRankAndRate(0, s)).toEqual({ rank: 'トレーニー', rate: 0.30 });
  });

  it('壊れた rank_definitions JSON はデフォルトにフォールバック', () => {
    expect(calcRankAndRate(0, { rank_definitions: '{invalid' }).rank).toBe('トレーニー');
  });
});
