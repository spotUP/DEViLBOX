/**
 * GTToolbar — Transport controls, song info, SID config for GoatTracker Ultra.
 */

import React, { useCallback } from 'react';
import { useGTUltraStore } from '../../stores/useGTUltraStore';

export const GTToolbar: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const playing = useGTUltraStore((s) => s.playing);
  const songName = useGTUltraStore((s) => s.songName);
  const songAuthor = useGTUltraStore((s) => s.songAuthor);
  const sidCount = useGTUltraStore((s) => s.sidCount);
  const sidModel = useGTUltraStore((s) => s.sidModel);
  const tempo = useGTUltraStore((s) => s.tempo);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);
  const followPlay = useGTUltraStore((s) => s.followPlay);
  const engine = useGTUltraStore((s) => s.engine);
  const setSidCount = useGTUltraStore((s) => s.setSidCount);
  const setSidModel = useGTUltraStore((s) => s.setSidModel);
  const setFollowPlay = useGTUltraStore((s) => s.setFollowPlay);

  const togglePlay = useCallback(() => {
    if (!engine) return;
    if (playing) {
      engine.stop();
      useGTUltraStore.getState().setPlaying(false);
    } else {
      engine.play();
      useGTUltraStore.getState().setPlaying(true);
    }
  }, [engine, playing]);

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 8px',
        background: '#0f3460',
        borderBottom: '1px solid #333',
        fontSize: 12,
        fontFamily: '"JetBrains Mono", monospace',
      }}
    >
      {/* Transport */}
      <button
        onClick={togglePlay}
        style={{
          background: playing ? '#e94560' : '#2a9d8f',
          color: '#fff',
          border: 'none',
          padding: '2px 10px',
          cursor: 'pointer',
          fontWeight: 'bold',
        }}
      >
        {playing ? '■ STOP' : '▶ PLAY'}
      </button>

      {/* Position */}
      <span style={{ color: '#888' }}>
        Pos:{playbackPos.position.toString(16).toUpperCase().padStart(2, '0')}
        /Row:{playbackPos.row.toString(16).toUpperCase().padStart(2, '0')}
      </span>

      {/* Song info */}
      <span style={{ color: '#e94560', fontWeight: 'bold', maxWidth: 200, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        {songName || 'Untitled'}
      </span>
      <span style={{ color: '#666' }}>{songAuthor ? `by ${songAuthor}` : ''}</span>

      <div style={{ flex: 1 }} />

      {/* Follow playback */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={followPlay}
          onChange={(e) => setFollowPlay(e.target.checked)}
          style={{ accentColor: '#2a9d8f' }}
        />
        Follow
      </label>

      {/* Tempo */}
      <span style={{ color: '#aaa' }}>Tempo:{tempo}</span>

      {/* SID config */}
      <select
        value={sidModel}
        onChange={(e) => setSidModel(Number(e.target.value))}
        style={{ background: '#16213e', color: '#e0e0ff', border: '1px solid #333', padding: '1px 4px', fontSize: 11 }}
      >
        <option value={0}>6581</option>
        <option value={1}>8580</option>
      </select>

      <select
        value={sidCount}
        onChange={(e) => setSidCount(Number(e.target.value) as 1 | 2)}
        style={{ background: '#16213e', color: '#e0e0ff', border: '1px solid #333', padding: '1px 4px', fontSize: 11 }}
      >
        <option value={1}>1xSID (3ch)</option>
        <option value={2}>2xSID (6ch)</option>
      </select>
    </div>
  );
};
