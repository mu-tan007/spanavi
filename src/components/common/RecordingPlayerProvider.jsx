import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';

// 画面下部固定の録音プレイヤー
//   一覧テーブル等から useRecordingPlayer().play(url, title, subtitle) で起動
//   既に再生中の録音があれば、新規再生で自動切替（自動的に止まる）

const RecordingPlayerContext = createContext(null);

export function useRecordingPlayer() {
  const ctx = useContext(RecordingPlayerContext);
  if (!ctx) {
    // Provider 配下で使われていない場合は no-op を返す
    return {
      current: null,
      play: () => {},
      close: () => {},
      isCurrent: () => false,
    };
  }
  return ctx;
}

export function RecordingPlayerProvider({ children }) {
  const audioRef = useRef(null);
  const [current, setCurrent] = useState(null); // { url, title, subtitle }
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [speed, setSpeed] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [muted, setMuted] = useState(false);
  const [seeking, setSeeking] = useState(false);

  const play = useCallback((url, title, subtitle) => {
    if (!url) return;
    setCurrent({ url, title: title || '', subtitle: subtitle || '' });
  }, []);

  const close = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
    setCurrent(null);
    setPlaying(false);
    setDuration(0);
    setPosition(0);
  }, []);

  const isCurrent = useCallback((url) => current?.url === url, [current]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play().catch(() => {});
  };

  const skip = (delta) => {
    if (!audioRef.current) return;
    const newPos = Math.max(0, Math.min(duration, audioRef.current.currentTime + delta));
    audioRef.current.currentTime = newPos;
    setPosition(newPos);
  };

  const seek = (pos) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = pos;
    setPosition(pos);
  };

  const changeSpeed = (s) => {
    setSpeed(s);
    if (audioRef.current) audioRef.current.playbackRate = s;
  };

  const changeVolume = (v) => {
    setVolume(v);
    if (audioRef.current) {
      audioRef.current.volume = v;
      if (v > 0) {
        audioRef.current.muted = false;
        setMuted(false);
      }
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const next = !muted;
    audioRef.current.muted = next;
    setMuted(next);
  };

  // current が変わったら audio src を切り替え
  useEffect(() => {
    if (!audioRef.current) return;
    if (current?.url) {
      audioRef.current.src = current.url;
      audioRef.current.playbackRate = speed;
      audioRef.current.volume = volume;
      audioRef.current.play().catch(err => {
        console.warn('[RecordingPlayer] auto-play failed:', err);
      });
    }
  }, [current?.url]);

  return (
    <RecordingPlayerContext.Provider value={{ current, play, close, isCurrent }}>
      {children}
      {/* 隠し audio */}
      <audio
        ref={audioRef}
        preload="none"
        onTimeUpdate={() => { if (!seeking) setPosition(audioRef.current?.currentTime || 0); }}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => { setPlaying(false); }}
        style={{ display: 'none' }}
      />
      {/* 画面下部固定UI */}
      {current && (
        <PlayerBar
          title={current.title}
          subtitle={current.subtitle}
          playing={playing}
          duration={duration}
          position={position}
          speed={speed}
          volume={volume}
          muted={muted}
          onTogglePlay={togglePlay}
          onSkip={skip}
          onSeekStart={() => setSeeking(true)}
          onSeekEnd={() => setSeeking(false)}
          onSeek={seek}
          onChangeSpeed={changeSpeed}
          onChangeVolume={changeVolume}
          onToggleMute={toggleMute}
          onClose={close}
        />
      )}
    </RecordingPlayerContext.Provider>
  );
}

const NAVY = color.navy;

function fmtTime(sec) {
  if (!sec || !isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5, 2.0];

function PlayerBar({
  title, subtitle,
  playing, duration, position,
  speed, volume, muted,
  onTogglePlay, onSkip, onSeek, onSeekStart, onSeekEnd,
  onChangeSpeed, onChangeVolume, onToggleMute, onClose,
}) {
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      zIndex: 9000,
      background: color.white,
      borderTop: `1px solid ${color.gray200}`,
      boxShadow: '0 -4px 16px rgba(0,0,0,0.08)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {/* 進捗バー（画面幅いっぱい） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2.5], padding: '0 16px', paddingTop: 6 }}>
        <span style={{
          fontSize: font.size.xs, fontFamily: font.family.mono,
          fontVariantNumeric: 'tabular-nums', color: color.textMid, minWidth: 40, textAlign: 'right',
        }}>{fmtTime(position)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(duration, 0.001)}
          step={0.1}
          value={Math.min(position, duration || 0)}
          onMouseDown={onSeekStart}
          onTouchStart={onSeekStart}
          onMouseUp={(e) => { onSeek(parseFloat(e.target.value)); onSeekEnd(); }}
          onTouchEnd={(e) => { onSeek(parseFloat(e.target.value)); onSeekEnd(); }}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          disabled={!duration}
          style={{
            flex: 1, height: 6, accentColor: NAVY, cursor: duration ? 'pointer' : 'default',
          }}
        />
        <span style={{
          fontSize: font.size.xs, fontFamily: font.family.mono,
          fontVariantNumeric: 'tabular-nums', color: color.textMid, minWidth: 40,
        }}>{fmtTime(duration)}</span>
      </div>

      {/* 操作行 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: space[3],
        padding: '6px 16px 10px',
        flexWrap: 'wrap',
      }}>
        {/* 左: タイトル */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: font.size.sm, fontWeight: font.weight.bold, color: NAVY,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{title || '録音再生中'}</div>
          {subtitle && (
            <div style={{
              fontSize: 10, color: color.textLight,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{subtitle}</div>
          )}
        </div>

        {/* 中央: 再生コントロール */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => onSkip(-15)}
            title="15秒戻る"
            style={ctrlBtn}
          >‹‹15</button>
          <button
            onClick={onTogglePlay}
            title={playing ? '一時停止' : '再生'}
            style={{
              ...ctrlBtn,
              width: 38, height: 38,
              background: NAVY, color: color.white,
              fontSize: font.size.md, fontWeight: font.weight.bold,
            }}
          >{playing ? '❚❚' : '▶'}</button>
          <button
            onClick={() => onSkip(15)}
            title="15秒進む"
            style={ctrlBtn}
          >15››</button>
        </div>

        {/* 右: 速度・音量・閉じる */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setSpeedMenuOpen(o => !o)}
              title="再生速度"
              style={{ ...ctrlBtn, minWidth: 48, fontSize: font.size.xs }}
            >{speed.toFixed(2).replace(/\.?0+$/, '')}x</button>
            {speedMenuOpen && (
              <>
                <div
                  onClick={() => setSpeedMenuOpen(false)}
                  style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9001,
                  }}
                />
                <div style={{
                  position: 'absolute', bottom: '100%', right: 0, marginBottom: 4,
                  background: color.white, border: `1px solid ${color.gray200}`,
                  borderRadius: radius.md, boxShadow: shadow.md,
                  zIndex: 9002, minWidth: 80,
                }}>
                  {SPEED_OPTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => { onChangeSpeed(s); setSpeedMenuOpen(false); }}
                      style={{
                        display: 'block', width: '100%',
                        padding: '6px 12px', border: 'none',
                        background: s === speed ? alpha(NAVY, 0.082) : 'transparent',
                        color: s === speed ? NAVY : color.textDark,
                        fontWeight: s === speed ? font.weight.bold : font.weight.medium,
                        textAlign: 'left', cursor: 'pointer', fontSize: font.size.xs,
                        fontFamily: font.family.sans,
                      }}
                    >{s}x</button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={onToggleMute}
            title={muted ? 'ミュート解除' : 'ミュート'}
            style={{
              ...ctrlBtn,
              fontSize: 10,
              color: muted || volume === 0 ? color.danger : NAVY,
              borderColor: muted || volume === 0 ? color.danger : color.gray200,
            }}
          >{muted || volume === 0 ? '消' : '音'}</button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={e => onChangeVolume(parseFloat(e.target.value))}
            style={{ width: 80, accentColor: NAVY, cursor: 'pointer' }}
          />
          <button
            onClick={onClose}
            title="閉じる"
            style={{ ...ctrlBtn, color: color.danger, borderColor: color.danger }}
          >×</button>
        </div>
      </div>
    </div>
  );
}

const ctrlBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 36, height: 30,
  border: `1px solid ${color.gray200}`, background: color.white,
  color: color.navy, borderRadius: radius.md, cursor: 'pointer',
  fontFamily: font.family.sans, fontWeight: font.weight.semibold, fontSize: font.size.xs,
  padding: 0,
};

// 各画面で使う「▶ 再生」ボタン
export function PlayRecordingButton({ url, title, subtitle, label = '▶ 録音再生', size = 'sm' }) {
  const { play, isCurrent } = useRecordingPlayer();
  if (!url) return null;
  const isPlaying = isCurrent(url);
  const btnStyle = size === 'sm' ? {
    padding: '4px 10px', fontSize: font.size.xs, height: 26,
  } : {
    padding: '6px 14px', fontSize: font.size.sm, height: 32,
  };
  return (
    <button
      onClick={(e) => { e.stopPropagation(); play(url, title, subtitle); }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        border: '1px solid ' + (isPlaying ? NAVY : '#9CA3AF'),
        background: isPlaying ? NAVY : color.white,
        color: isPlaying ? color.white : NAVY,
        borderRadius: radius.sm, cursor: 'pointer',
        fontFamily: font.family.sans, fontWeight: font.weight.semibold,
        whiteSpace: 'nowrap',
        ...btnStyle,
      }}
    >{isPlaying ? '■ 再生中' : label}</button>
  );
}
