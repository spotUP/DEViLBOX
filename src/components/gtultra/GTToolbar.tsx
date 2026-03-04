/**
 * GTToolbar — Transport controls, song info, SID config for GoatTracker Ultra.
 */

import React, { useCallback, useState, useEffect } from 'react';
import { useGTUltraStore, type GTSidModel } from '../../stores/useGTUltraStore';
import { getGTUltraASIDBridge } from '../../engine/gtultra/GTUltraASIDBridge';
import { getASIDDeviceManager } from '../../lib/sid/ASIDDeviceManager';

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

  const handleNewSong = useCallback(() => {
    if (!engine) return;
    engine.newSong();
    useGTUltraStore.getState().setPlaying(false);
    useGTUltraStore.getState().setSongName('Untitled');
    useGTUltraStore.getState().setSongAuthor('');
  }, [engine]);

  const handleSave = useCallback(() => {
    if (!engine) return;
    engine.saveSng();
  }, [engine]);

  const handleExportPrg = useCallback(() => {
    if (!engine) return;
    engine.exportPrg();
  }, [engine]);

  const handleExportSid = useCallback(() => {
    if (!engine) return;
    engine.exportSid();
  }, [engine]);

  // Wire the save callback
  useEffect(() => {
    if (!engine) return;
    engine.callbacks.onSngData = (data: ArrayBuffer | null) => {
      if (!data) return;
      const blob = new Blob([data], { type: 'application/octet-stream' });
      const name = (songName || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_') + '.sng';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    };
    return () => { engine.callbacks.onSngData = undefined; };
  }, [engine, songName]);

  // Wire PRG export callback
  useEffect(() => {
    if (!engine) return;
    engine.callbacks.onPrgData = (data: ArrayBuffer | null) => {
      if (!data) return;
      const blob = new Blob([data], { type: 'application/octet-stream' });
      const name = (songName || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_') + '.prg';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    };
    return () => { engine.callbacks.onPrgData = undefined; };
  }, [engine, songName]);

  // Wire SID export callback
  useEffect(() => {
    if (!engine) return;
    engine.callbacks.onSidData = (data: ArrayBuffer | null) => {
      if (!data) return;
      const blob = new Blob([data], { type: 'audio/prs.sid' });
      const name = (songName || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_') + '.sid';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    };
    return () => { engine.callbacks.onSidData = undefined; };
  }, [engine, songName]);

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
        onClick={handleNewSong}
        style={{
          background: '#16213e',
          color: '#aaa',
          border: '1px solid #333',
          padding: '2px 8px',
          cursor: 'pointer',
          fontSize: 10,
        }}
        title="New Song"
      >
        📄 New
      </button>
      <button
        onClick={handleSave}
        style={{
          background: '#16213e',
          color: '#aaa',
          border: '1px solid #333',
          padding: '2px 8px',
          cursor: 'pointer',
          fontSize: 10,
        }}
        title="Save .sng file"
      >
        💾 Save
      </button>
      <button
        onClick={handleExportPrg}
        style={{
          background: '#16213e',
          color: '#aaa',
          border: '1px solid #333',
          padding: '2px 8px',
          cursor: 'pointer',
          fontSize: 10,
        }}
        title="Export as C64 .prg"
      >
        📦 PRG
      </button>
      <button
        onClick={handleExportSid}
        style={{
          background: '#16213e',
          color: '#aaa',
          border: '1px solid #333',
          padding: '2px 8px',
          cursor: 'pointer',
          fontSize: 10,
        }}
        title="Export as .sid (SIDPlay format)"
      >
        🎵 SID
      </button>
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
        onChange={(e) => setSidModel(Number(e.target.value) as GTSidModel)}
        style={{ background: '#16213e', color: '#e0e0ff', border: '1px solid #333', padding: '1px 4px', fontSize: 11 }}
        title="SID chip model"
      >
        <option value={0}>6581</option>
        <option value={1}>8580</option>
      </select>

      <button
        onClick={() => setSidCount(sidCount === 1 ? 2 : 1)}
        title={sidCount === 1 ? 'Switch to dual SID (6 channels)' : 'Switch to single SID (3 channels)'}
        style={{
          background: sidCount === 2 ? '#1a3a2a' : '#16213e',
          color: sidCount === 2 ? '#00ff88' : '#e0e0ff',
          border: `1px solid ${sidCount === 2 ? '#00ff88' : '#333'}`,
          padding: '1px 6px',
          fontSize: 11,
          cursor: 'pointer',
          fontWeight: sidCount === 2 ? 'bold' : 'normal',
        }}
      >
        {sidCount === 2 ? '🎛️ 2×SID 6ch' : '🎛️ 1×SID 3ch'}
      </button>

      <ASIDToggle />
    </div>
  );
};

/** ASID hardware toggle — shows connection status, device name, and enables/disables hardware output */
const ASIDToggle: React.FC = () => {
  const [asidEnabled, setAsidEnabled] = useState(false);
  const [connected, setConnected] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [writeCount, setWriteCount] = useState(0);
  const engine = useGTUltraStore((s) => s.engine);

  useEffect(() => {
    const dm = getASIDDeviceManager();
    dm.init();
    const unsub = dm.onStateChange((state) => {
      const isReady = state.selectedDevice?.state === 'connected';
      setConnected(isReady);
      setDeviceName(state.selectedDevice?.name ?? null);
      // Auto-reconnect: if device reconnects while ASID was enabled, re-enable bridge
      if (isReady && asidEnabled) {
        getGTUltraASIDBridge().enable();
      }
    });
    setConnected(dm.isDeviceReady());
    setDeviceName(dm.getSelectedDevice()?.name ?? null);
    return unsub;
  }, [asidEnabled]);

  // Track ASID write count for activity indicator
  useEffect(() => {
    if (!asidEnabled) return;
    const interval = setInterval(() => {
      setWriteCount(getGTUltraASIDBridge().getWriteCount?.() ?? 0);
    }, 500);
    return () => clearInterval(interval);
  }, [asidEnabled]);

  const toggle = useCallback(() => {
    const bridge = getGTUltraASIDBridge();
    if (asidEnabled) {
      bridge.disable();
      engine?.enableAsid(false);
      setAsidEnabled(false);
      setWriteCount(0);
    } else {
      bridge.enable();
      engine?.enableAsid(true);
      setAsidEnabled(true);
    }
  }, [asidEnabled, engine]);

  const label = asidEnabled && connected
    ? `🔌 ${deviceName ? deviceName.slice(0, 12) : 'ASID'} ● ${writeCount > 0 ? `${(writeCount / 1000).toFixed(1)}k` : 'ON'}`
    : connected
      ? `🔌 ${deviceName ? deviceName.slice(0, 12) : 'ASID'} OFF`
      : '🔌 No Device';

  return (
    <button
      onClick={toggle}
      title={connected
        ? (asidEnabled ? `ASID active: ${deviceName} (${writeCount} writes)` : `Click to enable: ${deviceName}`)
        : 'No ASID device detected — connect USB-SID-Pico or TherapSID'}
      style={{
        background: asidEnabled && connected ? '#2a9d8f' : '#333',
        color: connected ? '#fff' : '#666',
        border: `1px solid ${connected ? '#2a9d8f' : '#555'}`,
        padding: '2px 8px',
        cursor: connected ? 'pointer' : 'not-allowed',
        fontSize: 10,
        fontWeight: 'bold',
        opacity: connected ? 1 : 0.5,
        minWidth: 80,
      }}
      disabled={!connected}
    >
      {label}
    </button>
  );
};
