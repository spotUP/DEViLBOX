/**
 * GTToolbar — Transport controls, song info, SID config for GoatTracker Ultra.
 * Uses FT2 theme classes for visual consistency with the rest of DEViLBOX.
 */

import React, { useCallback, useState, useEffect, useRef } from 'react';
import { AnchoredPopover } from '../ui/AnchoredPopover';
import { CustomSelect } from '@components/common/CustomSelect';
import { useGTUltraStore, type GTSidModel, type GTViewMode } from '../../stores/useGTUltraStore';
import { getGTUltraASIDBridge } from '../../engine/gtultra/GTUltraASIDBridge';
import { SIDHardwareToggle } from '../common/SIDHardwareToggle';
import { withKey } from './gtKeyTable';
import { AUTO_ADVANCE_LABEL } from './GTKeyboardHandler';
import { notify } from '@stores/useNotificationStore';
import { validateGtExportOptions, GT_DEFAULT_LOAD_ADDRESS, GT_DEFAULT_ZERO_PAGE } from '../../lib/export/c64/gtExportOptions';

const BTN = 'px-2 py-0.5 text-[10px] font-mono border cursor-pointer transition-colors';
const BTN_DEFAULT = `${BTN} bg-ft2-header text-ft2-textDim border-ft2-border hover:bg-ft2-border hover:text-ft2-text`;
const SEL = 'bg-ft2-header text-ft2-text border border-ft2-border font-mono text-[11px] px-1 py-0';

/** View mode toggle (Pro / DAW) — DAW mode auto-switches to WebGL rendering */
const ViewModeSwitch: React.FC = () => {
  const viewMode = useGTUltraStore((s) => s.viewMode);
  const setViewMode = useGTUltraStore((s) => s.setViewMode);

  const handleSwitch = useCallback((mode: GTViewMode) => {
    setViewMode(mode);
  }, [setViewMode]);

  const modes: { id: GTViewMode; label: string }[] = [
    { id: 'pro', label: 'PRO' },
    { id: 'daw', label: 'DAW' },
  ];

  return (
    <div className="flex gap-0.5">
      {modes.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => handleSwitch(id)}
          className={`${BTN} ${viewMode === id
            ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50 font-bold'
            : BTN_DEFAULT
          }`}
          title={id === 'daw' ? 'Switch to DAW mode (visual editor)' : 'Switch to Pro mode (hex tracker)'}
        >
          {label}
        </button>
      ))}
    </div>
  );
};

export const GTToolbar: React.FC<{ width?: number; height?: number }> = () => {
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

  const handleSave = useCallback(() => { engine?.saveSng(); }, [engine]);
  const [loadAddressText, setLoadAddressText] = useState(GT_DEFAULT_LOAD_ADDRESS.toString(16).toUpperCase());
  const [zeroPageText, setZeroPageText] = useState(GT_DEFAULT_ZERO_PAGE.toString(16).toUpperCase());
  const exportWith = useCallback((run: (o: { loadAddress: number; zeroPage: number }) => void) => {
    const o = { loadAddress: parseInt(loadAddressText, 16), zeroPage: parseInt(zeroPageText, 16) };
    const err = validateGtExportOptions(o);
    if (err) notify.error(err); else run(o);
  }, [loadAddressText, zeroPageText]);
  const handleExportPrg = useCallback(() => exportWith((o) => engine?.exportPrg(o)), [engine, exportWith]);
  const handleExportSid = useCallback(() => exportWith((o) => engine?.exportSid(o)), [engine, exportWith]);
  const handleExportBin = useCallback(() => exportWith((o) => engine?.exportBin(o)), [engine, exportWith]);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLButtonElement>(null);
  const autoAdvanceMode = useGTUltraStore((s) => s.autoAdvanceMode);
  const cycleAutoAdvanceMode = useGTUltraStore((s) => s.cycleAutoAdvanceMode);
  const exportItems = [
    { label: 'C64 Program (.prg)', hint: 'Runs on a C64: load address header, player and song', run: handleExportPrg },
    { label: 'SID Music File (.sid)', hint: 'For SID players and emulators', run: handleExportSid },
    { label: 'Raw Binary (.bin)', hint: 'Same data as the program, without the load address header', run: handleExportBin },
  ];

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
    engine.callbacks.onBinData = (d) => download(d, '.bin', 'application/octet-stream');
    return () => {
      engine.callbacks.onSngData = undefined;
      engine.callbacks.onPrgData = undefined;
      engine.callbacks.onSidData = undefined;
      engine.callbacks.onBinData = undefined;
    };
  }, [engine, songName]);

  return (
    <div className={`flex items-center gap-1.5 px-2 bg-ft2-header border-b border-ft2-border font-mono text-xs h-9 ${recordMode ? 'ring-1 ring-inset ring-red-500/60' : ''}`}>
      {/* GT-specific file ops */}
      <button onClick={handleSave} className={BTN_DEFAULT} title="Save .sng">Save</button>
      <button ref={exportRef} onClick={() => setExportOpen((o) => !o)} className={BTN_DEFAULT} title="Export the song for a C64, a SID player or as raw data">Export</button>
      <AnchoredPopover open={exportOpen} onClose={() => setExportOpen(false)} anchorRef={exportRef} className="w-72 bg-dark-bgSecondary border border-dark-border p-1 font-mono text-[10px]">
        {exportItems.map((it) => (
          <button key={it.label} onClick={() => { setExportOpen(false); it.run(); }} className="block w-full text-left px-2 py-1 hover:bg-dark-bgHover">
            <span className="text-text-primary">{it.label}</span>
            <span className="block text-text-muted">{it.hint}</span>
          </button>
        ))}
      </AnchoredPopover>
      <label className="text-ft2-textDim" title="Player load address in hex, page aligned, at least 0400, not overlapping D000-DFFF">
        Load Address $
        <input value={loadAddressText} onChange={(e) => setLoadAddressText(e.target.value)} maxLength={4} className={`${SEL} w-12 ml-0.5`} />
      </label>
      <label className="text-ft2-textDim" title="Zero page address in hex, 02 to FE">
        Zero Page $
        <input value={zeroPageText} onChange={(e) => setZeroPageText(e.target.value)} maxLength={2} className={`${SEL} w-8 ml-0.5`} />
      </label>

      <div className="w-px h-5 bg-ft2-border mx-0.5" />

      {/* Record */}
      <button
        onClick={() => setRecordMode(!recordMode)}
        className={`${BTN} border-transparent font-bold ${recordMode ? 'bg-red-500 text-text-primary' : 'bg-ft2-header text-ft2-textDim border-ft2-border'}`}
        title={withKey('Record mode: typed notes and digits edit the pattern', 'Escape')}
      >
        Record
      </button>

      {/* Jam */}
      <button
        onClick={() => setJamMode(!jamMode)}
        className={`${BTN} ${jamMode ? 'bg-amber-600/30 text-amber-400 border-amber-500/50' : BTN_DEFAULT}`}
        title="Jam mode: play notes on the keyboard without editing the pattern"
      >
        Jam
      </button>

      <button
        onClick={() => useGTUltraStore.getState().setKeyHelpOpen(true)}
        className={BTN_DEFAULT}
        title={withKey('Show all keyboard shortcuts', '?')}
      >
        Keys
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
        Subtune:
        <CustomSelect value={String(currentSong)} onChange={(v) => setCurrentSong(Number(v))} className={SEL}
          options={Array.from({ length: 32 }, (_, i) => ({ value: String(i), label: String(i) }))}
        />
      </label>

      {/* Octave */}
      <label className="flex items-center gap-1 text-ft2-textDim" title="Octave (F9 lower, F10 higher)">
        Octave:
        <CustomSelect value={String(currentOctave)} onChange={(v) => setCurrentOctave(Number(v))} className={SEL}
          options={Array.from({ length: 8 }, (_, i) => ({ value: String(i), label: String(i) }))}
        />
      </label>

      {/* Edit step */}
      <label className="flex items-center gap-1 text-ft2-textDim" title="Edit step: rows the cursor advances after entering a note (F5-F8 set 0, 1, 2, 4)">
        Edit Step:
        <CustomSelect value={String(editStep)} onChange={(v) => setEditStep(Number(v))} className={SEL}
          options={Array.from({ length: 17 }, (_, i) => ({ value: String(i), label: String(i) }))}
        />
      </label>

      {/* After entry */}
      <label className="flex items-center gap-1 text-ft2-textDim" title={withKey(`After entry: ${AUTO_ADVANCE_LABEL[autoAdvanceMode]}`, 'Shift+Z')}>
        After Entry:
        <button onClick={cycleAutoAdvanceMode} className={BTN_DEFAULT}>{autoAdvanceMode === 'note' ? 'Note' : autoAdvanceMode === 'all' ? 'All' : 'Off'}</button>
      </label>

      {/* Pattern length */}
      <span className="text-ft2-textDim" title="Pattern length in rows (Shift+O shrinks, Shift+P expands)">Length:{patternLength}</span>

      <div className="w-px h-5 bg-ft2-border mx-0.5" />

      {/* Follow */}
      <label className="flex items-center gap-1 cursor-pointer text-ft2-textDim" title="Follow playback">
        <input type="checkbox" checked={followPlay} onChange={(e) => setFollowPlay(e.target.checked)} className="accent-emerald-500 w-3 h-3" />
        Follow
      </label>

      {/* Tempo */}
      <span className="text-ft2-textDim">Tempo:<span className="text-ft2-text">{tempo}</span></span>

      {/* SID config */}
      <CustomSelect value={String(sidModel)} onChange={(v) => setSidModel(Number(v) as GTSidModel)} className={SEL} title="SID chip model"
        options={[
          { value: '0', label: '6581' },
          { value: '1', label: '8580' },
        ]}
      />

      <button
        onClick={() => setSidCount(sidCount === 1 ? 2 : 1)}
        title={sidCount === 1 ? 'Switch to dual SID (6ch)' : 'Switch to single SID (3ch)'}
        className={`${BTN} ${sidCount === 2 ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/50 font-bold' : BTN_DEFAULT}`}
      >
        {sidCount === 2 ? '2xSID' : '1xSID'}
      </button>

      <ASIDToggle />

      <div className="w-px h-5 bg-ft2-border mx-0.5" />

      {/* View mode switcher */}
      <ViewModeSwitch />
    </div>
  );
};

/** SID hardware output toggle — uses shared SIDHardwareToggle with GT ASID bridge */
const ASIDToggle: React.FC = () => {
  const [bridgeEnabled, setBridgeEnabled] = useState(() => getGTUltraASIDBridge().isEnabled);
  const [writeCount, setWriteCount] = useState(0);
  const engine = useGTUltraStore((s) => s.engine);

  useEffect(() => {
    const unsub = getGTUltraASIDBridge().onChange(setBridgeEnabled);
    setBridgeEnabled(getGTUltraASIDBridge().isEnabled);
    return unsub;
  }, []);

  useEffect(() => {
    if (!bridgeEnabled) { setWriteCount(0); return; }
    const interval = setInterval(() => {
      setWriteCount(getGTUltraASIDBridge().getWriteCount?.() ?? 0);
    }, 500);
    return () => clearInterval(interval);
  }, [bridgeEnabled]);

  const handleEnable = useCallback(() => {
    getGTUltraASIDBridge().enable();
    engine?.enableAsid(true);
  }, [engine]);

  const handleDisable = useCallback(() => {
    getGTUltraASIDBridge().disable();
    engine?.enableAsid(false);
  }, [engine]);

  return (
    <SIDHardwareToggle
      bridgeEnabled={bridgeEnabled}
      onEnable={handleEnable}
      onDisable={handleDisable}
      writeCount={writeCount}
    />
  );
};
