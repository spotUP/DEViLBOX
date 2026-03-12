/**
 * GTToolbar — Transport controls, song info, SID config for GoatTracker Ultra.
 * Uses FT2 theme classes for visual consistency with the rest of DEViLBOX.
 */

import React, { useCallback, useState, useEffect } from 'react';
import { useGTUltraStore, type GTSidModel } from '../../stores/useGTUltraStore';
import { getGTUltraASIDBridge } from '../../engine/gtultra/GTUltraASIDBridge';
import { getASIDDeviceManager } from '../../lib/sid/ASIDDeviceManager';

const BTN = 'px-2 py-0.5 text-[10px] font-mono border cursor-pointer transition-colors';
const BTN_DEFAULT = `${BTN} bg-ft2-header text-ft2-textDim border-ft2-border hover:bg-ft2-border hover:text-ft2-text`;
const SEL = 'bg-ft2-header text-ft2-text border border-ft2-border font-mono text-[11px] px-1 py-0';

export const GTToolbar: React.FC<{ width?: number; height?: number }> = () => {
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
  const currentOctave = useGTUltraStore((s) => s.currentOctave);
  const setCurrentOctave = useGTUltraStore((s) => s.setCurrentOctave);
  const editStep = useGTUltraStore((s) => s.editStep);
  const setEditStep = useGTUltraStore((s) => s.setEditStep);
  const recordMode = useGTUltraStore((s) => s.recordMode);
  const setRecordMode = useGTUltraStore((s) => s.setRecordMode);
  const jamMode = useGTUltraStore((s) => s.jamMode);
  const setJamMode = useGTUltraStore((s) => s.setJamMode);
  const currentSong = useGTUltraStore((s) => s.currentSong);
  const setCurrentSong = useGTUltraStore((s) => s.setCurrentSong);
  const patternLength = useGTUltraStore((s) => s.patternLength);

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

  const handleSave = useCallback(() => { engine?.saveSng(); }, [engine]);
  const handleExportPrg = useCallback(() => { engine?.exportPrg(); }, [engine]);
  const handleExportSid = useCallback(() => { engine?.exportSid(); }, [engine]);

  // Wire save/export callbacks
  useEffect(() => {
    if (!engine) return;
    const download = (data: ArrayBuffer | null, ext: string, mime: string) => {
      if (!data) return;
      const blob = new Blob([data], { type: mime });
      const name = (songName || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_') + ext;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
    };
    engine.callbacks.onSngData = (d) => download(d, '.sng', 'application/octet-stream');
    engine.callbacks.onPrgData = (d) => download(d, '.prg', 'application/octet-stream');
    engine.callbacks.onSidData = (d) => download(d, '.sid', 'audio/prs.sid');
    return () => {
      engine.callbacks.onSngData = undefined;
      engine.callbacks.onPrgData = undefined;
      engine.callbacks.onSidData = undefined;
    };
  }, [engine, songName]);

  return (
    <div className={`flex items-center gap-1.5 px-2 bg-ft2-header border-b border-ft2-border font-mono text-xs h-9 ${recordMode ? 'ring-1 ring-inset ring-red-500/60' : ''}`}>
      {/* File ops */}
      <button onClick={handleNewSong} className={BTN_DEFAULT} title="New Song">New</button>
      <button onClick={handleSave} className={BTN_DEFAULT} title="Save .sng">Save</button>
      <button onClick={handleExportPrg} className={BTN_DEFAULT} title="Export C64 .prg">PRG</button>
      <button onClick={handleExportSid} className={BTN_DEFAULT} title="Export .sid">SID</button>

      <div className="w-px h-5 bg-ft2-border mx-0.5" />

      {/* Transport */}
      <button
        onClick={togglePlay}
        className={`${BTN} border-transparent font-bold ${playing ? 'bg-red-600 text-text-primary hover:bg-red-700' : 'bg-emerald-600 text-text-primary hover:bg-emerald-700'}`}
      >
        {playing ? 'STOP' : 'PLAY'}
      </button>

      {/* Record */}
      <button
        onClick={() => setRecordMode(!recordMode)}
        className={`${BTN} border-transparent font-bold ${recordMode ? 'bg-red-500 text-text-primary' : 'bg-ft2-header text-ft2-textDim border-ft2-border'}`}
        title="Record mode (edit pattern)"
      >
        REC
      </button>

      {/* Jam */}
      <button
        onClick={() => setJamMode(!jamMode)}
        className={`${BTN} ${jamMode ? 'bg-amber-600/30 text-amber-400 border-amber-500/50' : BTN_DEFAULT}`}
        title="Jam mode"
      >
        JAM
      </button>

      <div className="w-px h-5 bg-ft2-border mx-0.5" />

      {/* Position */}
      <span className="text-ft2-textDim">
        Pos:<span className="text-ft2-text">{playbackPos.position.toString(16).toUpperCase().padStart(2, '0')}</span>
        {' '}Row:<span className="text-ft2-text">{playbackPos.row.toString(16).toUpperCase().padStart(2, '0')}</span>
      </span>

      {/* Song info */}
      <span className="text-ft2-highlight font-bold max-w-[160px] truncate" title={songName}>
        {songName || 'Untitled'}
      </span>
      {songAuthor && <span className="text-ft2-textDim">by {songAuthor}</span>}

      <div className="flex-1" />

      {/* Song selector */}
      <label className="flex items-center gap-1 text-ft2-textDim" title="Song/subtune (0-31)">
        Song:
        <select value={currentSong} onChange={(e) => setCurrentSong(Number(e.target.value))} className={SEL}>
          {Array.from({ length: 32 }, (_, i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </label>

      {/* Octave */}
      <label className="flex items-center gap-1 text-ft2-textDim" title="Octave (F9/F10)">
        Oct:
        <select value={currentOctave} onChange={(e) => setCurrentOctave(Number(e.target.value))} className={SEL} style={{ width: 36 }}>
          {Array.from({ length: 8 }, (_, i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </label>

      {/* Edit step */}
      <label className="flex items-center gap-1 text-ft2-textDim" title="Edit step (rows to advance)">
        Stp:
        <select value={editStep} onChange={(e) => setEditStep(Number(e.target.value))} className={SEL} style={{ width: 36 }}>
          {Array.from({ length: 17 }, (_, i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </label>

      {/* Pattern length */}
      <span className="text-ft2-textDim" title="Pattern length">Len:{patternLength}</span>

      <div className="w-px h-5 bg-ft2-border mx-0.5" />

      {/* Follow */}
      <label className="flex items-center gap-1 cursor-pointer text-ft2-textDim" title="Follow playback">
        <input type="checkbox" checked={followPlay} onChange={(e) => setFollowPlay(e.target.checked)} className="accent-emerald-500 w-3 h-3" />
        Follow
      </label>

      {/* Tempo */}
      <span className="text-ft2-textDim">Tempo:<span className="text-ft2-text">{tempo}</span></span>

      {/* SID config */}
      <select value={sidModel} onChange={(e) => setSidModel(Number(e.target.value) as GTSidModel)} className={SEL} title="SID chip model">
        <option value={0}>6581</option>
        <option value={1}>8580</option>
      </select>

      <button
        onClick={() => setSidCount(sidCount === 1 ? 2 : 1)}
        title={sidCount === 1 ? 'Switch to dual SID (6ch)' : 'Switch to single SID (3ch)'}
        className={`${BTN} ${sidCount === 2 ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/50 font-bold' : BTN_DEFAULT}`}
      >
        {sidCount === 2 ? '2xSID' : '1xSID'}
      </button>

      <ASIDToggle />
    </div>
  );
};

/** ASID hardware toggle */
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
      if (isReady && asidEnabled) getGTUltraASIDBridge().enable();
    });
    setConnected(dm.isDeviceReady());
    setDeviceName(dm.getSelectedDevice()?.name ?? null);
    return unsub;
  }, [asidEnabled]);

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
      bridge.disable(); engine?.enableAsid(false); setAsidEnabled(false); setWriteCount(0);
    } else {
      bridge.enable(); engine?.enableAsid(true); setAsidEnabled(true);
    }
  }, [asidEnabled, engine]);

  const label = asidEnabled && connected
    ? `${deviceName ? deviceName.slice(0, 10) : 'ASID'} ${writeCount > 0 ? `${(writeCount / 1000).toFixed(1)}k` : 'ON'}`
    : connected
      ? `${deviceName ? deviceName.slice(0, 10) : 'ASID'}`
      : 'No HW';

  return (
    <button
      onClick={toggle}
      title={connected
        ? (asidEnabled ? `ASID active: ${deviceName}` : `Click to enable: ${deviceName}`)
        : 'No ASID device — connect USB-SID-Pico or TherapSID'}
      className={`${BTN} text-[9px] min-w-[60px] ${asidEnabled && connected ? 'bg-emerald-600 text-text-primary border-emerald-500' : connected ? BTN_DEFAULT : 'opacity-40 cursor-not-allowed bg-ft2-header text-ft2-textDim border-ft2-border'}`}
      disabled={!connected}
    >
      {label}
    </button>
  );
};
