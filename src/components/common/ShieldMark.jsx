import React from 'react';
import SpanaviLogo from './SpanaviLogo';
import './ShieldMark.css';

// 脈打ちと波紋を付けたロゴの盾（読み込み C「鼓動」）。
// 盾そのものは SpanaviLogo を使うので、線の数・位置はロゴと必ず一致する。
// calm: ログイン画面用のゆっくりした動き。
export function ShieldMark({ size = 72, calm = false, uid = 'mark' }) {
  return (
    <span
      className={`sp-shield${calm ? ' sp-shield--calm' : ''}`}
      style={{ width: size, height: Math.round(size * (60 / 52)) }}
      aria-hidden="true"
    >
      <i className="sp-shield__wave" />
      <i className="sp-shield__wave" />
      <i className="sp-shield__wave" />
      <span className="sp-shield__body">
        <SpanaviLogo size={size} hideText gap={0} uidSuffix={uid} />
      </span>
    </span>
  );
}

// 画面いっぱいの読み込み。文字は出さない。
export function ShieldLoader() {
  return (
    <div className="sp-loader" role="status" aria-label="読み込み中">
      <ShieldMark size={72} uid="loader" />
    </div>
  );
}

export default ShieldMark;
