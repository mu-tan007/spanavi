import { useEffect, useState } from 'react';
import { telFmt } from '../../../utils/telFormat';

// 別事業所・キーマンの携帯番号（2026-10-09 むー様）
// 数字だけ入れて枠の外を押すと、市外局番どおりにハイフンを入れて保存。登録済みは最初から開いておく。それぞれ小さい発信ボタン
const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>
);

export default function AltNumbers({ itemId, sub, setSub, onSubSave, km, setKm, onKmSave, onDial }) {
  const [open, setOpen] = useState(!!(sub || km));
  const [saved, setSaved] = useState(0);
  // 会社が変わったら、その会社に番号があるかで開け閉めを決め直す
  useEffect(() => { setOpen(!!(sub || km)); setSaved(0); }, [itemId]); // eslint-disable-line react-hooks/exhaustive-deps
  const blur = async (v, set, save) => { const f = telFmt(v); if (f !== v) set(f); const ok = await save(f); if (ok) setSaved(n => n + 1); };
  const row = (v, set, save, ph, label) => (
    <div className="altr">
      <input className="input tel-in" inputMode="tel" placeholder={ph} value={v} onChange={e => set(e.target.value)} onBlur={() => blur(v, set, save)} />
      <button className="altd" title={`${label}に発信`} aria-label={`${label}に発信`} onClick={() => { const f = telFmt(v); if (f) onDial(f, label); }}><PhoneIcon /></button>
    </div>
  );
  return (
    <div>
      <button className="btn ghost sm" style={{ marginLeft: -12 }} onClick={() => setOpen(o => !o)}>{open ? '－' : '＋'} 別事業所・キーマンの携帯番号</button>
      <div className={`alt-box ${open ? 'on' : ''}`}>
        {row(sub, setSub, onSubSave, '別事業所（支店・営業所）の番号', '別事業所')}
        {row(km, setKm, onKmSave, 'キーマンの携帯番号', 'キーマンの携帯')}
        <span key={saved} className={`altsv ${saved ? 'on' : ''}`}>保存しました</span>
      </div>
    </div>
  );
}
