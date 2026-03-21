/**
 * Tracker Store - Pattern Data & Editor State
 *
 * Cursor and selection state live in useCursorStore (extracted for performance).
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  Pattern,
  TrackerCell,
  ClipboardData,
} from '@typedefs';
import { EMPTY_CELL, CHANNEL_COLORS } from '@typedefs';
import { getToneEngine } from '@engine/ToneEngine';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { useTransportStore } from './useTransportStore';
import { idGenerator } from '../utils/idGenerator';
import { DEFAULT_PATTERN_LENGTH, DEFAULT_NUM_CHANNELS, MAX_PATTERN_LENGTH, MAX_CHANNELS, MIN_CHANNELS, MIN_PATTERN_LENGTH } from '../constants/trackerConstants';
import { SYSTEM_PRESETS, DivChanType } from '../constants/systemPresets';
import { useHistoryStore } from './useHistoryStore';
import { useCursorStore } from './useCursorStore';
import { useEditorStore } from './useEditorStore';
import { useFormatStore } from './useFormatStore';

// ── WASM mute forwarding ─────────────────────────────────────────────────────
// Forward mute/solo states to WASM engines.
// ToneEngine path only handles DOM synths — WASM engines need direct mute/gain.
let _furnaceDispatchEngine: { getInstance(): { mute(ch: number, m: boolean): void } } | null = null;

// Lazy import of getActiveGainEngine from useMixerStore (avoid circular at module level)
let _getActiveGainEngine: (() => { setChannelGain(ch: number, gain: number): void } | null) | null = null;
function getGainEngine(): { setChannelGain(ch: number, gain: number): void } | null {
  if (!_getActiveGainEngine) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./useMixerStore');
    _getActiveGainEngine = mod.getActiveGainEngine;
  }
  return _getActiveGainEngine!();
}

/**
 * Apply mute/solo to SunVox modules by setting their Volume controller to min/restore.
 * Returns true if SunVox was active and handled (caller should skip other engines).
 */
// Cached lazy imports for SunVox mute (avoid require() which doesn't work in Vite ESM)
let _svMuteEngine: any = null;
let _svMuteGetHandle: any = null;
let _svMuteInstrStore: any = null;
let _svMuteImportDone = false;

async function _ensureSunVoxMuteImports(): Promise<boolean> {
  if (_svMuteImportDone) return true;
  try {
    const [svMod, synthMod, instrMod] = await Promise.all([
      import('../engine/sunvox/SunVoxEngine'),
      import('../engine/sunvox-modular/SunVoxModularSynth'),
      import('./useInstrumentStore'),
    ]);
    _svMuteEngine = svMod.SunVoxEngine;
    _svMuteGetHandle = synthMod.getSharedSunVoxHandle;
    _svMuteInstrStore = instrMod.useInstrumentStore;
    _svMuteImportDone = true;
    return true;
  } catch {
    return false;
  }
}

// Fire-and-forget: apply mute to SunVox modules
function _applySunVoxMutes(channels: { muted: boolean; solo: boolean }[], anySolo: boolean): boolean {
  if (!_svMuteImportDone) {
    // Trigger lazy import for next time, skip this call
    void _ensureSunVoxMuteImports();
    return false;
  }

  if (!_svMuteEngine.hasInstance()) return false;
  const handle = _svMuteGetHandle();
  if (handle < 0) return false;

  const instruments = _svMuteInstrStore.getState().instruments;
  const state = useTrackerStore.getState();
  const pattern = state.patterns[state.currentPatternIndex];
  if (!pattern) return false;

  const hasSunVox = instruments.some(
    (i: { synthType?: string; sunvox?: { isSong?: boolean } }) =>
      i.synthType === 'SunVoxModular' && i.sunvox?.isSong === true
  );
  if (!hasSunVox) return false;

  const moduleUnmuted = new Map<number, boolean>();
  for (let i = 0; i < pattern.channels.length; i++) {
    const ch = channels[i];
    if (!ch) continue;
    const instrId = (pattern.channels[i] as { instrumentId?: number })?.instrumentId;
    if (!instrId) continue;
    const inst = instruments.find((ins: { id: number }) => ins.id === instrId);
    if (!inst?.sunvox?.noteTargetModuleId) continue;
    const modId = inst.sunvox.noteTargetModuleId as number;
    const effectiveMute = anySolo ? !ch.solo : ch.muted;
    if (!effectiveMute) moduleUnmuted.set(modId, true);
    else if (!moduleUnmuted.has(modId)) moduleUnmuted.set(modId, false);
  }

  const engine = _svMuteEngine.getInstance();
  for (const [modId, unmuted] of moduleUnmuted) {
    if (unmuted) engine.unmuteModule(handle, modId);
    else engine.muteModule(handle, modId);
  }
  return true;
}

function forwardWasmMuteStates(channels: { muted: boolean; solo: boolean }[]): void {
  const editorMode = useFormatStore.getState().editorMode;
  const anySolo = channels.some(ch => ch.solo);

  // UADE: uses bitmask API — bit N=1 means Paula channel N is active (playing)
  // Check for live UADE instance before other engines since UADE classic mode
  // is 'classic' editorMode and wouldn't otherwise be caught below.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { UADEEngine } = require('../engine/uade/UADEEngine');
    if (UADEEngine.hasInstance()) {
      const engine = UADEEngine.getInstance();
      let mask = 0;
      channels.slice(0, 4).forEach((ch: { muted: boolean; solo: boolean }, i: number) => {
        const effectiveMute = anySolo ? !ch.solo : ch.muted;
        if (!effectiveMute) mask |= (1 << i);
      });
      engine.setMuteMask(mask);
    }
  } catch {
    // UADE not loaded
  }

  // Furnace uses binary mute API
  if (editorMode === 'furnace') {
    try {
      if (!_furnaceDispatchEngine) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        _furnaceDispatchEngine = require('../engine/furnace-dispatch/FurnaceDispatchEngine').FurnaceDispatchEngine;
      }
      const engine = _furnaceDispatchEngine!.getInstance();
      channels.forEach((ch, i) => {
        const effectiveMute = anySolo ? !ch.solo : ch.muted;
        engine.mute(i, effectiveMute);
      });
    } catch {
      // Engine not ready
    }
    return;
  }

  // SunVox songs: mute/unmute at the module level inside WASM
  if (_applySunVoxMutes(channels, anySolo)) return;

  // Other WASM engines use gain API (0 = muted, 1 = unmuted)
  try {
    const gainEngine = getGainEngine();
    if (gainEngine) {
      channels.forEach((ch, i) => {
        const effectiveMute = anySolo ? !ch.solo : ch.muted;
        gainEngine.setChannelGain(i, effectiveMute ? 0 : 1);
      });
    }
  } catch {
    // Engine not ready
  }
}

// ── Debounced WASM engine re-export on cell edit ────────────────────────────
// For non-UADE WASM engines (MusicLine, PumaTracker), edits require
// re-exporting the TrackerSong to native format and reloading the engine.
let _wasmReexportTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedWasmEngineReexport(): void {
  if (_wasmReexportTimer) clearTimeout(_wasmReexportTimer);
  _wasmReexportTimer = setTimeout(() => {
    _wasmReexportTimer = null;
    try {
      const replayer = getTrackerReplayer();
      const song = replayer.getSong();
      if (!song) return;
      const sourceFormat = song.patterns[0]?.importMetadata?.sourceFormat;

      if (sourceFormat === 'MusicLine') {
        void (async () => {
          try {
            const { exportMusicLineFile } = await import('@/lib/export/MusicLineExporter');
            const { MusicLineEngine } = await import('@/engine/musicline/MusicLineEngine');
            if (!MusicLineEngine.hasInstance()) return;
            const data = exportMusicLineFile(song);
            const engine = MusicLineEngine.getInstance();
            await engine.loadSong(data);
          } catch (err) {
            console.warn('[TrackerStore] MusicLine re-export failed:', err);
          }
        })();
      } else if (sourceFormat === 'PumaTracker' && song.pumaTrackerFileData) {
        void (async () => {
          try {
            const { exportPumaTrackerFile } = await import('@/lib/export/PumaTrackerExporter');
            const { PumaTrackerEngine } = await import('@/engine/pumatracker/PumaTrackerEngine');
            if (!PumaTrackerEngine.hasInstance()) return;
            const data = exportPumaTrackerFile(song);
            const engine = PumaTrackerEngine.getInstance();
            await engine.loadTune(data.buffer as ArrayBuffer);
          } catch (err) {
            console.warn('[TrackerStore] PumaTracker re-export failed:', err);
          }
        })();
      } else if (sourceFormat === 'Symphonie' && song.symphonieFileData) {
        void (async () => {
          try {
            const { exportSymphonieProFile } = await import('@/lib/export/SymphonieProExporter');
            const { SymphonieEngine } = await import('@/engine/symphonie/SymphonieEngine');
            if (!SymphonieEngine.hasInstance()) return;
            const data = exportSymphonieProFile(song);
            // Update the stored file data so subsequent edits build on this export
            song.symphonieFileData = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
            // Re-parse and reload into the engine
            const { parseSymphonieForPlayback } = await import('@/lib/import/formats/SymphonieProParser');
            const playbackData = await parseSymphonieForPlayback(song.symphonieFileData, song.name || 'module');
            const engine = SymphonieEngine.getInstance();
            const { getDevilboxAudioContext } = await import('@/utils/audio-context');
            await engine.loadSong(getDevilboxAudioContext(), playbackData);
          } catch (err) {
            console.warn('[TrackerStore] Symphonie re-export failed:', err);
          }
        })();
      }
    } catch { /* replayer not initialized */ }
  }, 300); // 300ms debounce
}

// ── Bulk edit sync ───────────────────────────────────────────────────────────
// After bulk operations that modify many cells at once, sync the full pattern
// across all active playback engines (OpenMPT, Furnace, UADE, MusicLine etc.)
function syncBulkEdit(patternIndex: number, pattern: import('@typedefs').Pattern): void {
  // OpenMPT soundlib sync
  try {
    import('@engine/libopenmpt/OpenMPTEditBridge').then(bridge => {
      if (bridge.isActive()) {
        bridge.syncFullPattern(patternIndex, pattern.channels);
      }
    });
  } catch { /* bridge not available */ }

  // Furnace WASM sequencer sync — iterate all cells
  try {
    const replayer = getTrackerReplayer();
    if (replayer.isWasmSequencerActive) {
      for (let ch = 0; ch < pattern.channels.length; ch++) {
        const rows = pattern.channels[ch].rows;
        for (let row = 0; row < rows.length; row++) {
          const cell = rows[row];
          replayer.syncCellToWasmSequencer(ch, patternIndex, row, cell);
        }
      }
    }
  } catch { /* replayer not initialized */ }

  // UADE chip RAM sync — iterate all cells
  try {
    const replayer = getTrackerReplayer();
    const song = replayer.getSong();
    if (song?.uadePatternLayout) {
      import('@engine/uade/UADEChipEditor').then(({ UADEChipEditor }) => {
        import('@engine/uade/UADEEngine').then(({ UADEEngine }) => {
          if (UADEEngine.hasInstance()) {
            const editor = new UADEChipEditor(UADEEngine.getInstance());
            for (let ch = 0; ch < pattern.channels.length; ch++) {
              const rows = pattern.channels[ch].rows;
              for (let row = 0; row < rows.length; row++) {
                editor.patchPatternCell(song.uadePatternLayout!, patternIndex, row, ch, rows[row]);
              }
            }
          }
        });
      });
    }
  } catch { /* UADE not active */ }

  // MusicLine / PumaTracker / Symphonie (debounced re-export)
  debouncedWasmEngineReexport();
}

// Extracted helper modules
import {
  setCellInPattern, clearCellInPattern, clearChannelInPattern, clearPatternCells,
  insertRowInChannel, deleteRowInChannel,
  applyInstrumentToSelectionHelper, transposeSelectionHelper, remapInstrumentHelper,
  interpolateSelectionHelper, humanizeSelectionHelper, strumSelectionHelper, legatoSelectionHelper,
  scaleVolumeHelper, fadeVolumeHelper, amplifySelectionHelper, swapChannelsHelper,
} from './tracker/patternEditActions';
import {
  copySelectionHelper, cutSelectionHelper,
  pasteHelper, pasteMixHelper, pasteFloodHelper, pastePushForwardHelper,
  copyTrackHelper, cutTrackHelper, pasteTrackHelper,
} from './tracker/clipboardActions';
import {
  type MacroSlot, createEmptyMacroSlot,
  writeMacroSlotHelper, readMacroSlotHelper, findBestChannelHelper,
} from './tracker/multiRecordActions';

interface TrackerStore {
  // State
  patterns: Pattern[];
  currentPatternIndex: number;
  clipboard: ClipboardData | null;
  trackClipboard: TrackerCell[] | null; // FT2: Single-channel clipboard
  macroSlots: MacroSlot[]; // FT2: 8 quick-entry slots
  // FT2: Pattern Order List (Song Position List)
  patternOrder: number[]; // Array of pattern indices for song arrangement
  currentPositionIndex: number; // Current position in pattern order (for editing)

  // Actions
  setCurrentPattern: (index: number, fromReplayer?: boolean) => void;
  setCell: (channelIndex: number, rowIndex: number, cell: Partial<TrackerCell>) => void;
  clearCell: (channelIndex: number, rowIndex: number) => void;
  clearChannel: (channelIndex: number) => void;
  clearPattern: () => void;
  insertRow: (channelIndex: number, rowIndex: number) => void;
  deleteRow: (channelIndex: number, rowIndex: number) => void;
  // Multi-channel recording (cross-store: reads from useEditorStore)
  findBestChannel: () => number;

  // Advanced editing
  amplifySelection: (factor: number) => void;
  growSelection: () => void;
  shrinkSelection: () => void;
  swapChannels: (aIdx: number, bIdx: number) => void;
  splitPatternAtCursor: () => void;
  joinPatterns: () => void;

  // Block operations
  copySelection: () => void;
  cutSelection: () => void;
  paste: () => void;
  // Advanced paste modes (OpenMPT-style)
  pasteMix: () => void;           // Only fill empty cells
  pasteFlood: () => void;         // Paste until pattern end
  pastePushForward: () => void;   // Insert and shift down

  // FT2: Track operations (single-channel)
  copyTrack: (channelIndex: number) => void;
  cutTrack: (channelIndex: number) => void;
  pasteTrack: (channelIndex: number) => void;

  // FT2: Macro slots (quick-entry)
  writeMacroSlot: (slotIndex: number) => void;  // Store current cell
  readMacroSlot: (slotIndex: number) => void;   // Paste macro

  // Advanced editing
  applyInstrumentToSelection: (instrumentId: number) => void;
  transposeSelection: (semitones: number, currentInstrumentOnly?: boolean) => void;
  remapInstrument: (oldId: number, newId: number, scope: 'block' | 'track' | 'pattern' | 'song') => void;
  interpolateSelection: (column: 'volume' | 'cutoff' | 'resonance' | 'envMod' | 'pan' | 'effParam' | 'effParam2', startValue: number, endValue: number, curve?: 'linear' | 'log' | 'exp' | 'scurve') => void;
  humanizeSelection: (volumeVariation: number) => void;
  strumSelection: (tickDelay: number, direction: 'up' | 'down') => void;
  legatoSelection: () => void;
  // FT2: Volume operations
  scaleVolume: (scope: 'block' | 'track' | 'pattern', factor: number) => void;
  fadeVolume: (scope: 'block' | 'track' | 'pattern', startVol: number, endVol: number) => void;

  // Pattern management
  addPattern: (length?: number) => void;
  deletePattern: (index: number) => void;
  clonePattern: (index: number) => void;
  duplicatePattern: (index: number) => void;
  resizePattern: (index: number, newLength: number) => void;
  resizeAllPatterns: (newLength: number) => void;
  expandPattern: (index: number) => void;
  shrinkPattern: (index: number) => void;
  reorderPatterns: (oldIndex: number, newIndex: number) => void;
  updatePatternName: (index: number, name: string) => void;
  // updateTimeSignature: (index: number, signature: Partial<TimeSignature>) => void;
  // updateAllTimeSignatures: (signature: Partial<TimeSignature>) => void;

  // FT2: Pattern Order List management
  addToOrder: (patternIndex: number, position?: number) => void;
  removeFromOrder: (positionIndex: number) => void;
  insertInOrder: (patternIndex: number, positionIndex: number) => void;
  duplicatePosition: (positionIndex: number) => void;
  clearOrder: () => void;
  reorderPositions: (oldIndex: number, newIndex: number) => void;
  setCurrentPosition: (positionIndex: number, fromReplayer?: boolean) => void;

  // Channel management
  addChannel: () => void;
  removeChannel: (channelIndex: number) => void;
  toggleChannelMute: (channelIndex: number) => void;
  toggleChannelSolo: (channelIndex: number) => void;
  toggleChannelCollapse: (channelIndex: number) => void;
  setChannelVolume: (channelIndex: number, volume: number) => void;
  setChannelPan: (channelIndex: number, pan: number) => void;
  setChannelColor: (channelIndex: number, color: string | null) => void;
  setChannelRows: (channelIndex: number, rows: TrackerCell[]) => void;
  reorderChannel: (fromIndex: number, toIndex: number) => void;
  updateChannelName: (channelIndex: number, name: string) => void;
  applySystemPreset: (presetId: string) => void;
  applyAmigaSongSettings: (presetId: string) => void;
  setChannelRecordGroup: (channelIndex: number, group: 0 | 1 | 2) => void;
  getChannelsInRecordGroup: (group: 1 | 2) => number[];

  // Clipboard
  setClipboard: (data: ClipboardData) => void;

  // Import/Export
  loadPatterns: (patterns: Pattern[]) => void;
  importPattern: (pattern: Pattern) => number;
  setPatternOrder: (order: number[]) => void;

  // Undo/Redo support
  replacePattern: (index: number, pattern: Pattern) => void;

  // UADE live pattern display — updates cells in-place without undo history
  setLiveChannelData: (row: number, channelData: Array<{ note: number; instrument: number; volume: number }>) => void;

  // Reset to initial state
  reset: () => void;
}

const createEmptyPattern = (length: number = DEFAULT_PATTERN_LENGTH, numChannels: number = DEFAULT_NUM_CHANNELS): Pattern => ({
  id: idGenerator.generate('pattern'),
  name: 'Untitled Pattern',
  length,
  channels: Array.from({ length: numChannels }, (_, i) => ({
    id: `channel-${i}`,
    name: `Channel ${i + 1}`,
    rows: Array.from({ length }, () => ({ ...EMPTY_CELL })),
    muted: false,
    solo: false,
    collapsed: false,
    volume: 80,
    pan: 0,
    instrumentId: null,
    color: null,
  })),
});

export const useTrackerStore = create<TrackerStore>()(
  immer((set, get) => ({
    // Initial state
    patterns: [createEmptyPattern()],
    currentPatternIndex: 0,
    clipboard: null,
    trackClipboard: null, // FT2: Single-channel clipboard
    macroSlots: Array.from({ length: 8 }, () => createEmptyMacroSlot()), // FT2: 8 macro slots
    // FT2: Pattern Order List (Song Position List)
    patternOrder: [0], // Start with first pattern in order
    currentPositionIndex: 0, // Start at position 0


    // Actions
    setCurrentPattern: (index, fromReplayer) =>
      set((state) => {
        if (index >= 0 && index < state.patterns.length) {
          if (state.currentPatternIndex === index) return;
          state.currentPatternIndex = index;
          // If this came from the replayer's natural advancement, don't jump —
          // the replayer already knows where it is. jumpToPattern calls seekTo
          // which resets the scheduler timeline, causing ~100ms drift per pattern.
          if (fromReplayer) return;
          // If playing, tell the replayer to jump to this pattern
          const replayer = getTrackerReplayer();
          if (replayer.isPlaying()) {
            replayer.jumpToPattern(index);
          }
        }
      }),

    setCell: (channelIndex, rowIndex, cellUpdate) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        setCellInPattern(state.patterns[state.currentPatternIndex], channelIndex, rowIndex, cellUpdate);
      });
      useHistoryStore.getState().pushAction('EDIT_CELL', 'Edit cell', patternIndex, beforePattern, get().patterns[patternIndex]);
      // Sync edit to WASM sequencer if active (Furnace formats)
      try {
        const replayer = getTrackerReplayer();
        if (replayer.isWasmSequencerActive) {
          replayer.syncCellToWasmSequencer(channelIndex, patternIndex, rowIndex, cellUpdate);
        }
      } catch { /* replayer not initialized yet */ }
      // Sync edit to OpenMPT soundlib if loaded (MOD/XM/IT/S3M)
      try {
        const fullCell = get().patterns[patternIndex]?.channels[channelIndex]?.rows[rowIndex];
        if (fullCell) {
          import('@engine/libopenmpt/OpenMPTEditBridge').then(bridge => {
            if (bridge.isActive()) {
              bridge.syncCellEdit(patternIndex, channelIndex, rowIndex, cellUpdate, fullCell);
            }
          });
        }
      } catch { /* bridge not available */ }
      // Sync edit to UADE chip RAM if format has a pattern layout
      try {
        const replayer = getTrackerReplayer();
        const song = replayer.getSong();
        if (song?.uadePatternLayout) {
          const fullCell = get().patterns[patternIndex]?.channels[channelIndex]?.rows[rowIndex];
          if (fullCell) {
            import('@engine/uade/UADEChipEditor').then(({ UADEChipEditor }) => {
              import('@engine/uade/UADEEngine').then(({ UADEEngine }) => {
                if (UADEEngine.hasInstance()) {
                  const editor = new UADEChipEditor(UADEEngine.getInstance());
                  editor.patchPatternCell(song.uadePatternLayout!, patternIndex, rowIndex, channelIndex, fullCell);
                }
              });
            });
          }
        }
      } catch { /* UADE not active */ }
      // Sync edit to StarTrekker AM WASM engine (direct MOD pattern cell write)
      try {
        const fmt = require('./useFormatStore').useFormatStore.getState();
        if (fmt.startrekkerAMFileData) {
          const fullCell = get().patterns[patternIndex]?.channels[channelIndex]?.rows[rowIndex];
          if (fullCell) {
            import('@engine/startrekker-am/StartrekkerAMEngine').then(({ StartrekkerAMEngine }) => {
              if (!StartrekkerAMEngine.hasInstance()) return;
              // Encode TrackerCell → ProTracker 4-byte format
              const note = fullCell.note;
              const instr = fullCell.instrument;
              // Reverse the period lookup from the parser
              const PERIOD_TABLE = [
                856,808,762,720,678,640,604,570,538,508,480,453,
                428,404,381,360,339,320,302,285,269,254,240,226,
                214,202,190,180,170,160,151,143,135,127,120,113,
              ];
              const period = (note >= 1 && note <= 36) ? PERIOD_TABLE[note - 1] : 0;
              const b0 = ((instr & 0xF0) | ((period >> 8) & 0x0F));
              const b1 = (period & 0xFF);
              const b2 = (((instr & 0x0F) << 4) | (fullCell.effTyp & 0x0F));
              const b3 = (fullCell.eff & 0xFF);
              StartrekkerAMEngine.getInstance().setPatternCell(patternIndex, rowIndex, channelIndex, b0, b1, b2, b3);
            });
          }
        }
      } catch { /* StarTrekker AM not active */ }
      // Sync edit to MusicLine WASM engine (debounced re-export)
      debouncedWasmEngineReexport();
    },

    clearCell: (channelIndex, rowIndex) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        clearCellInPattern(state.patterns[state.currentPatternIndex], channelIndex, rowIndex);
      });
      useHistoryStore.getState().pushAction('CLEAR_CELL', 'Clear cell', patternIndex, beforePattern, get().patterns[patternIndex]);
      // Sync cleared cell to WASM sequencer if active (Furnace formats)
      // Send -1 for all fields to mark them as empty in the sequencer
      try {
        const replayer = getTrackerReplayer();
        if (replayer.isWasmSequencerActive) {
          replayer.syncCellToWasmSequencer(channelIndex, patternIndex, rowIndex, {
            note: -1, instrument: -1, volume: -1, effTyp: -1, eff: -1, effTyp2: -1, eff2: -1,
          });
        }
      } catch { /* replayer not initialized yet */ }
      // Sync clear to OpenMPT soundlib if loaded (MOD/XM/IT/S3M)
      try {
        import('@engine/libopenmpt/OpenMPTEditBridge').then(bridge => {
          if (bridge.isActive()) {
            bridge.syncCellClear(patternIndex, channelIndex, rowIndex);
          }
        });
      } catch { /* bridge not available */ }
      // Sync clear to UADE chip RAM if format has a pattern layout
      try {
        const replayer = getTrackerReplayer();
        const song = replayer.getSong();
        if (song?.uadePatternLayout) {
          const clearedCell = get().patterns[patternIndex]?.channels[channelIndex]?.rows[rowIndex];
          if (clearedCell) {
            import('@engine/uade/UADEChipEditor').then(({ UADEChipEditor }) => {
              import('@engine/uade/UADEEngine').then(({ UADEEngine }) => {
                if (UADEEngine.hasInstance()) {
                  const editor = new UADEChipEditor(UADEEngine.getInstance());
                  editor.patchPatternCell(song.uadePatternLayout!, patternIndex, rowIndex, channelIndex, clearedCell);
                }
              });
            });
          }
        }
      } catch { /* UADE not active */ }
      // Sync clear to MusicLine WASM engine (debounced re-export)
      debouncedWasmEngineReexport();
    },

    clearChannel: (channelIndex) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        clearChannelInPattern(state.patterns[state.currentPatternIndex], channelIndex);
      });
      useHistoryStore.getState().pushAction('CLEAR_CHANNEL', 'Clear channel', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },

    clearPattern: () => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        clearPatternCells(state.patterns[state.currentPatternIndex]);
      });
      useHistoryStore.getState().pushAction('CLEAR_PATTERN', 'Clear pattern', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },

    insertRow: (channelIndex, rowIndex) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        insertRowInChannel(state.patterns[state.currentPatternIndex], channelIndex, rowIndex);
      });
      useHistoryStore.getState().pushAction('INSERT_ROW', 'Insert row', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },

    deleteRow: (channelIndex, rowIndex) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        deleteRowInChannel(state.patterns[state.currentPatternIndex], channelIndex, rowIndex);
      });
      useHistoryStore.getState().pushAction('DELETE_ROW', 'Delete row', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },

    findBestChannel: () => {
      const state = get();
      const editorState = useEditorStore.getState();
      const pattern = state.patterns[state.currentPatternIndex];
      const numChannels = pattern?.channels.length || 1;
      const cursorChannel = useCursorStore.getState().cursor.channelIndex;
      return findBestChannelHelper(editorState, numChannels, cursorChannel);
    },

    copySelection: () =>
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const { cursor, selection } = useCursorStore.getState();
        state.clipboard = copySelectionHelper(pattern, selection, cursor);
      }),

    cutSelection: () => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const { cursor, selection } = useCursorStore.getState();
        state.clipboard = cutSelectionHelper(pattern, selection, cursor);
      });
      useCursorStore.getState().clearSelection();
      useHistoryStore.getState().pushAction('CUT_SELECTION', 'Cut', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },

    setClipboard: (data) =>
      set((state) => {
        state.clipboard = data;
      }),

    paste: () => {
      if (!get().clipboard) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        if (!state.clipboard) return;
        const pattern = state.patterns[state.currentPatternIndex];
        const cursor = useCursorStore.getState().cursor;
        pasteHelper(pattern, cursor, state.clipboard, useEditorStore.getState().pasteMask);
      });
      useHistoryStore.getState().pushAction('PASTE', 'Paste', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },

    // OpenMPT-style Mix Paste: Only fill empty cells
    pasteMix: () => {
      if (!get().clipboard) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        if (!state.clipboard) return;
        const pattern = state.patterns[state.currentPatternIndex];
        const cursor = useCursorStore.getState().cursor;
        pasteMixHelper(pattern, cursor, state.clipboard, useEditorStore.getState().pasteMask);
      });
      useHistoryStore.getState().pushAction('PASTE_MIX', 'Mix paste', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },

    // OpenMPT-style Flood Paste: Paste repeatedly until pattern end
    pasteFlood: () => {
      if (!get().clipboard) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        if (!state.clipboard) return;
        const pattern = state.patterns[state.currentPatternIndex];
        const cursor = useCursorStore.getState().cursor;
        pasteFloodHelper(pattern, cursor, state.clipboard, useEditorStore.getState().pasteMask);
      });
      useHistoryStore.getState().pushAction('PASTE_FLOOD', 'Flood paste', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },

    // OpenMPT-style Push-Forward Paste: Insert clipboard data and shift existing content down
    pastePushForward: () => {
      if (!get().clipboard) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        if (!state.clipboard) return;
        const pattern = state.patterns[state.currentPatternIndex];
        const cursor = useCursorStore.getState().cursor;
        pastePushForwardHelper(pattern, cursor, state.clipboard, useEditorStore.getState().pasteMask);
      });
      useHistoryStore.getState().pushAction('PASTE_PUSH_FORWARD', 'Push-forward paste', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },

    // FT2: Track operations (single-channel copy/paste)
    copyTrack: (channelIndex) =>
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const result = copyTrackHelper(pattern, channelIndex);
        if (result) state.trackClipboard = result;
      }),

    cutTrack: (channelIndex) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const p = state.patterns[state.currentPatternIndex];
        const result = cutTrackHelper(p, channelIndex);
        if (result) state.trackClipboard = result;
      });
      useHistoryStore.getState().pushAction('CUT_TRACK', 'Cut track', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },

    pasteTrack: (channelIndex) => {
      if (!get().trackClipboard) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        if (!state.trackClipboard) return;
        const p = state.patterns[state.currentPatternIndex];
        pasteTrackHelper(p, channelIndex, state.trackClipboard, useEditorStore.getState().pasteMask);
      });
      useHistoryStore.getState().pushAction('PASTE_TRACK', 'Paste track', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },

    // FT2: Macro slots (quick-entry)
    writeMacroSlot: (slotIndex) =>
      set((state) => {
        if (slotIndex < 0 || slotIndex >= 8) return;
        const pattern = state.patterns[state.currentPatternIndex];
        const cursor = useCursorStore.getState().cursor;
        state.macroSlots[slotIndex] = writeMacroSlotHelper(pattern, cursor);
      }),

    readMacroSlot: (slotIndex) => {
      if (slotIndex < 0 || slotIndex >= 8) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        if (slotIndex < 0 || slotIndex >= 8) return;
        const macro = state.macroSlots[slotIndex];
        const pattern = state.patterns[state.currentPatternIndex];
        const cursor = useCursorStore.getState().cursor;
        readMacroSlotHelper(pattern, cursor, macro, useEditorStore.getState().pasteMask, useEditorStore.getState().insertMode);
      });
      useHistoryStore.getState().pushAction('READ_MACRO', 'Apply macro', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // Advanced editing - Apply instrument number to all notes in selection
    applyInstrumentToSelection: (instrumentId) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const { cursor, selection } = useCursorStore.getState();
        applyInstrumentToSelectionHelper(pattern, selection, cursor, instrumentId);
      });
      useHistoryStore.getState().pushAction('EDIT_CELL', 'Apply instrument to selection', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },

    // Advanced editing - Transpose selection by semitones
    transposeSelection: (semitones, currentInstrumentOnly = false) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const { cursor, selection } = useCursorStore.getState();
        const targetInstrumentId = currentInstrumentOnly
          ? pattern.channels[cursor.channelIndex].rows[cursor.rowIndex].instrument
          : null;
        transposeSelectionHelper(pattern, selection, cursor, semitones, targetInstrumentId);
      });
      useHistoryStore.getState().pushAction('TRANSPOSE', 'Transpose', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },

    // Swap all occurrences of Instrument A with Instrument B
    remapInstrument: (oldId, newId, scope) => {
      const patternIndex = get().currentPatternIndex;
      set((state) => {
        const { cursor, selection } = useCursorStore.getState();
        remapInstrumentHelper(state.patterns, state.currentPatternIndex, selection, cursor, oldId, newId, scope);
      });
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },

    // Advanced editing - Interpolate values in selection
    interpolateSelection: (column, startValue, endValue, curve = 'linear') => {
      const sel = useCursorStore.getState().selection;
      if (!sel) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const currentSel = useCursorStore.getState().selection;
        if (!currentSel) return;
        interpolateSelectionHelper(state.patterns[state.currentPatternIndex], currentSel, column, startValue, endValue, curve);
      });
      useHistoryStore.getState().pushAction('INTERPOLATE', 'Interpolate', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },

    // Advanced editing - Humanize selection (add random variation to volume)
    humanizeSelection: (volumeVariation) => {
      const sel = useCursorStore.getState().selection;
      if (!sel) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const currentSel = useCursorStore.getState().selection;
        if (!currentSel) return;
        humanizeSelectionHelper(state.patterns[state.currentPatternIndex], currentSel, volumeVariation);
      });
      useHistoryStore.getState().pushAction('HUMANIZE', 'Humanize', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },

    // Strum: add incremental note delays across channels (EDx effect)
    strumSelection: (tickDelay, direction) => {
      const sel = useCursorStore.getState().selection;
      if (!sel) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const currentSel = useCursorStore.getState().selection;
        if (!currentSel) return;
        strumSelectionHelper(state.patterns[state.currentPatternIndex], currentSel, tickDelay, direction);
      });
      useHistoryStore.getState().pushAction('STRUM', 'Strum', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },

    // Legato: for each channel in selection, extend each note's duration
    legatoSelection: () => {
      const sel = useCursorStore.getState().selection;
      if (!sel) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const currentSel = useCursorStore.getState().selection;
        if (!currentSel) return;
        legatoSelectionHelper(state.patterns[state.currentPatternIndex], currentSel);
      });
      useHistoryStore.getState().pushAction('LEGATO', 'Legato', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },

    // FT2: Scale volume (multiply by factor)
    scaleVolume: (scope, factor) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const { cursor, selection } = useCursorStore.getState();
        scaleVolumeHelper(pattern, scope, factor, selection, cursor);
      });
      useHistoryStore.getState().pushAction('SCALE_VOLUME', 'Scale volume', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },

    // FT2: Fade volume (linear interpolation)
    fadeVolume: (scope, startVol, endVol) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const { cursor, selection } = useCursorStore.getState();
        fadeVolumeHelper(pattern, scope, startVol, endVol, selection, cursor);
      });
      useHistoryStore.getState().pushAction('FADE_VOLUME', 'Fade volume', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },

    // Advanced editing methods
    amplifySelection: (factor) => {
      const selection = useCursorStore.getState().selection;
      const { currentPatternIndex } = get();
      if (!selection) return;
      const beforePattern = get().patterns[currentPatternIndex];
      set((state) => {
        amplifySelectionHelper(state.patterns[state.currentPatternIndex], selection, factor);
      });
      useHistoryStore.getState().pushAction('AMPLIFY', 'Amplify selection', currentPatternIndex, beforePattern, get().patterns[currentPatternIndex]);
      syncBulkEdit(currentPatternIndex, get().patterns[currentPatternIndex]);
    },

    growSelection: () => {
      const { patterns, currentPatternIndex } = get();
      const pattern = patterns[currentPatternIndex];
      const sel = useCursorStore.getState().selection;
      if (!sel) return;
      useCursorStore.setState({
        selection: {
          ...sel,
          startRow: Math.max(0, sel.startRow - 1),
          endRow: Math.min(pattern.length - 1, sel.endRow + 1),
          startChannel: Math.max(0, sel.startChannel - 1),
          endChannel: Math.min(pattern.channels.length - 1, sel.endChannel + 1),
        },
      });
    },

    shrinkSelection: () => {
      const sel = useCursorStore.getState().selection;
      if (!sel) return;
      const midRow = Math.floor((sel.startRow + sel.endRow) / 2);
      const midCh = Math.floor((sel.startChannel + sel.endChannel) / 2);
      useCursorStore.setState({
        selection: {
          ...sel,
          startRow: Math.min(sel.startRow + 1, midRow),
          endRow: Math.max(sel.endRow - 1, midRow),
          startChannel: Math.min(sel.startChannel + 1, midCh),
          endChannel: Math.max(sel.endChannel - 1, midCh),
        },
      });
    },

    swapChannels: (aIdx, bIdx) => {
      const { patterns, currentPatternIndex } = get();
      const pattern = patterns[currentPatternIndex];
      if (aIdx < 0 || bIdx < 0 || aIdx >= pattern.channels.length || bIdx >= pattern.channels.length) return;
      const beforePattern = pattern;
      set((state) => {
        swapChannelsHelper(state.patterns[state.currentPatternIndex], aIdx, bIdx);
      });
      useHistoryStore.getState().pushAction('SWAP_CHANNELS', 'Swap channels', currentPatternIndex, beforePattern, get().patterns[currentPatternIndex]);
      syncBulkEdit(currentPatternIndex, get().patterns[currentPatternIndex]);
    },

    splitPatternAtCursor: () => {
      const { patterns, currentPatternIndex } = get();
      const pattern = patterns[currentPatternIndex];
      const splitRow = useCursorStore.getState().cursor.rowIndex;
      if (splitRow <= 0 || splitRow >= pattern.length) return;
      const newPatternRows = pattern.length - splitRow;
      set((state) => {
        const pat = state.patterns[state.currentPatternIndex];
        const newChannels = pat.channels.map(ch => ({
          ...ch,
          id: `${ch.id}-split`,
          rows: ch.rows.slice(splitRow),
        }));
        pat.channels.forEach(ch => { ch.rows = ch.rows.slice(0, splitRow); });
        pat.length = splitRow;
        const newPattern: Pattern = {
          id: idGenerator.generate('pattern'),
          name: `${pat.name} (split)`,
          length: newPatternRows,
          channels: newChannels,
        };
        state.patterns.splice(state.currentPatternIndex + 1, 0, newPattern);
      });
    },

    joinPatterns: () => {
      const { patterns, currentPatternIndex } = get();
      if (currentPatternIndex >= patterns.length - 1) return;
      const beforeCurrent = patterns[currentPatternIndex];
      set((state) => {
        const cur = state.patterns[state.currentPatternIndex];
        const next = state.patterns[state.currentPatternIndex + 1];
        const minChannels = Math.min(cur.channels.length, next.channels.length);
        for (let ch = 0; ch < minChannels; ch++) {
          cur.channels[ch].rows = [...cur.channels[ch].rows, ...next.channels[ch].rows];
        }
        cur.length = cur.channels[0].rows.length;
        state.patterns.splice(state.currentPatternIndex + 1, 1);
      });
      useHistoryStore.getState().pushAction('JOIN_PATTERNS', 'Join patterns', currentPatternIndex, beforeCurrent, get().patterns[currentPatternIndex]);
    },

    addPattern: (length = DEFAULT_PATTERN_LENGTH) =>
      set((state) => {
        const numChannels = state.patterns[0]?.channels.length || DEFAULT_NUM_CHANNELS;
        state.patterns.push(createEmptyPattern(length, numChannels));
        // Add status message
        if (typeof window !== 'undefined') {
          import('@stores/useUIStore').then(({ useUIStore }) => {
            useUIStore.getState().setStatusMessage('PATTERN ADDED');
          });
        }
      }),

    deletePattern: (index) =>
      set((state) => {
        if (state.patterns.length > 1 && index >= 0 && index < state.patterns.length) {
          state.patterns.splice(index, 1);
          if (state.currentPatternIndex >= state.patterns.length) {
            state.currentPatternIndex = state.patterns.length - 1;
          }
          // Update patternOrder: remove references to deleted index, decrement higher indices
          state.patternOrder = state.patternOrder
            .filter((p) => p !== index)
            .map((p) => (p > index ? p - 1 : p));
          if (state.patternOrder.length === 0) state.patternOrder = [0];
          if (state.currentPositionIndex >= state.patternOrder.length) {
            state.currentPositionIndex = state.patternOrder.length - 1;
          }
          // Add status message
          if (typeof window !== 'undefined') {
            import('@stores/useUIStore').then(({ useUIStore }) => {
              useUIStore.getState().setStatusMessage('PATTERN DELETED');
            });
          }
        }
      }),

    clonePattern: (index) =>
      set((state) => {
        if (index >= 0 && index < state.patterns.length) {
          const original = state.patterns[index];
          const cloned: Pattern = structuredClone(original);
          cloned.id = idGenerator.generate('pattern');
          cloned.name = `${original.name} (Copy)`;
          state.patterns.splice(index + 1, 0, cloned);
          // Shift patternOrder indices that are > index to account for the splice
          state.patternOrder = state.patternOrder.map((p) => (p > index ? p + 1 : p));
          // Add status message
          if (typeof window !== 'undefined') {
            import('@stores/useUIStore').then(({ useUIStore }) => {
              useUIStore.getState().setStatusMessage('PATTERN CLONED');
            });
          }
        }
      }),

    resizePattern: (index, newLength) =>
      set((state) => {
        if (index >= 0 && index < state.patterns.length && newLength > 0) {
          const pattern = state.patterns[index];
          const oldLength = pattern.length;
          pattern.length = newLength;

          pattern.channels.forEach((channel) => {
            if (newLength > oldLength) {
              // Add empty rows
              for (let i = oldLength; i < newLength; i++) {
                channel.rows.push({ ...EMPTY_CELL });
              }
            } else {
              // Trim rows
              channel.rows.splice(newLength);
            }
          });
        }
      }),

    resizeAllPatterns: (newLength) =>
      set((state) => {
        if (newLength > 0) {
          state.patterns.forEach((pattern) => {
            const oldLength = pattern.length;
            pattern.length = newLength;

            pattern.channels.forEach((channel) => {
              if (newLength > oldLength) {
                // Add empty rows
                for (let i = oldLength; i < newLength; i++) {
                  channel.rows.push({ ...EMPTY_CELL });
                }
              } else {
                // Trim rows
                channel.rows.splice(newLength);
              }
            });
          });
        }
      }),

    duplicatePattern: (index) =>
      set((state) => {
        if (index >= 0 && index < state.patterns.length) {
          const original = state.patterns[index];
          const cloned: Pattern = structuredClone(original);
          cloned.id = idGenerator.generate('pattern');
          cloned.name = `${original.name} (Copy)`;
          state.patterns.splice(index + 1, 0, cloned);
          // Shift patternOrder indices that are > index to account for the splice
          state.patternOrder = state.patternOrder.map((p) => (p > index ? p + 1 : p));
          state.currentPatternIndex = index + 1;
        }
      }),

    expandPattern: (index) =>
      set((state) => {
        if (index >= 0 && index < state.patterns.length) {
          const pattern = state.patterns[index];
          const oldLength = pattern.length;
          const newLength = Math.min(oldLength * 2, MAX_PATTERN_LENGTH); // Max 256 rows

          if (newLength === oldLength) return;

          pattern.length = newLength;
          pattern.channels.forEach((channel) => {
            const newRows: typeof channel.rows = [];
            // Double each row
            for (let i = 0; i < oldLength; i++) {
              newRows.push(channel.rows[i]);
              newRows.push({ ...EMPTY_CELL });
            }
            channel.rows = newRows;
          });
        }
      }),

    shrinkPattern: (index) =>
      set((state) => {
        if (index >= 0 && index < state.patterns.length) {
          const pattern = state.patterns[index];
          const oldLength = pattern.length;
          const newLength = Math.max(Math.floor(oldLength / 2), MIN_PATTERN_LENGTH); // Min 1 row

          if (newLength === oldLength) return;

          pattern.length = newLength;
          pattern.channels.forEach((channel) => {
            const newRows: typeof channel.rows = [];
            // Take every other row
            for (let i = 0; i < newLength; i++) {
              newRows.push(channel.rows[i * 2]);
            }
            channel.rows = newRows;
          });
        }
      }),

    reorderPatterns: (oldIndex, newIndex) =>
      set((state) => {
        if (
          oldIndex >= 0 &&
          oldIndex < state.patterns.length &&
          newIndex >= 0 &&
          newIndex < state.patterns.length &&
          oldIndex !== newIndex
        ) {
          // Remove pattern from old position
          const [pattern] = state.patterns.splice(oldIndex, 1);
          // Insert at new position
          state.patterns.splice(newIndex, 0, pattern);

          // Update current pattern index to follow the moved pattern if needed
          if (state.currentPatternIndex === oldIndex) {
            state.currentPatternIndex = newIndex;
          } else if (
            oldIndex < state.currentPatternIndex &&
            newIndex >= state.currentPatternIndex
          ) {
            state.currentPatternIndex--;
          } else if (
            oldIndex > state.currentPatternIndex &&
            newIndex <= state.currentPatternIndex
          ) {
            state.currentPatternIndex++;
          }
        }
      }),

    updatePatternName: (index, name) =>
      set((state) => {
        if (index >= 0 && index < state.patterns.length && name.trim()) {
          state.patterns[index].name = name.trim();
        }
      }),

    // updateTimeSignature: (index, signature) =>
    //   set((state) => {
    //     if (index >= 0 && index < state.patterns.length) {
    //       const pattern = state.patterns[index];
    //       if (!pattern.timeSignature) pattern.timeSignature = { beatsPerMeasure: 4, stepsPerBeat: 4 };
    //       Object.assign(pattern.timeSignature, signature);
    //     }
    //   }),

    // updateAllTimeSignatures: (signature) =>
    //   set((state) => {
    //     state.patterns.forEach(pattern => {
    //       if (!pattern.timeSignature) pattern.timeSignature = { beatsPerMeasure: 4, stepsPerBeat: 4 };
    //       Object.assign(pattern.timeSignature, signature);
    //     });
    //   }),

    // Channel management
    addChannel: () =>
      set((state) => {
        const maxChannels = MAX_CHANNELS;
        // Get available colors (excluding null)
        const availableColors = CHANNEL_COLORS.filter((c) => c !== null) as string[];
        // Pick a random color for the new channel
        const randomColor = availableColors[Math.floor(Math.random() * availableColors.length)];

        state.patterns.forEach((pattern) => {
          if (pattern.channels.length < maxChannels) {
            const newChannelIndex = pattern.channels.length;
            pattern.channels.push({
              id: idGenerator.generate('channel'),
              name: `Channel ${newChannelIndex + 1}`,
              rows: Array.from({ length: pattern.length }, () => ({ ...EMPTY_CELL })),
              muted: false,
              solo: false,
              collapsed: false,
              volume: 80,
              pan: 0,
              instrumentId: null,
              color: randomColor,
            });
          }
        });
        // Add status message
        if (typeof window !== 'undefined') {
          import('@stores/useUIStore').then(({ useUIStore }) => {
            useUIStore.getState().setStatusMessage('CHANNEL ADDED');
          });
        }
      }),

    removeChannel: (channelIndex) =>
      set((state) => {
        const minChannels = MIN_CHANNELS;
        state.patterns.forEach((pattern) => {
          if (
            pattern.channels.length > minChannels &&
            channelIndex >= 0 &&
            channelIndex < pattern.channels.length
          ) {
            pattern.channels.splice(channelIndex, 1);
          }
        });
        // Adjust cursor if needed (cursor lives in useCursorStore)
        const curCh = useCursorStore.getState().cursor.channelIndex;
        if (curCh >= state.patterns[0]?.channels.length) {
          useCursorStore.getState().moveCursorToChannel(Math.max(0, state.patterns[0].channels.length - 1));
        }
        // Add status message
        if (typeof window !== 'undefined') {
          import('@stores/useUIStore').then(({ useUIStore }) => {
            useUIStore.getState().setStatusMessage('CHANNEL REMOVED');
          });
        }
      }),

    toggleChannelMute: (channelIndex) => {
      let isMuted = false;
      set((state) => {
        state.patterns.forEach((pattern) => {
          if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
            pattern.channels[channelIndex].muted = !pattern.channels[channelIndex].muted;
            isMuted = pattern.channels[channelIndex].muted;
          }
        });
      });
      // Update audio engine with new mute states
      const state = get();
      const pattern = state.patterns[state.currentPatternIndex];
      if (pattern) {
        const engine = getToneEngine();
        engine.updateMuteStates(pattern.channels.map(ch => ({ muted: ch.muted, solo: ch.solo })));
        forwardWasmMuteStates(pattern.channels);
      }
      // Add status message
      if (typeof window !== 'undefined') {
        import('@stores/useUIStore').then(({ useUIStore }) => {
          useUIStore.getState().setStatusMessage(isMuted ? 'MUTED' : 'UNMUTED');
        });
      }
    },

    toggleChannelSolo: (channelIndex) => {
      let isSolo = false;
      set((state) => {
        state.patterns.forEach((pattern) => {
          if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
            const wasAlreadySolo = pattern.channels[channelIndex].solo;
            // Clear all solos first (exclusive solo behavior)
            pattern.channels.forEach((ch) => {
              ch.solo = false;
            });
            // Toggle the clicked channel (if it was solo, it's now off; if it wasn't, it's now on)
            if (!wasAlreadySolo) {
              pattern.channels[channelIndex].solo = true;
              isSolo = true;
            }
          }
        });
      });
      // Update audio engine with new mute/solo states
      const state = get();
      const pattern = state.patterns[state.currentPatternIndex];
      if (pattern) {
        const engine = getToneEngine();
        engine.updateMuteStates(pattern.channels.map(ch => ({ muted: ch.muted, solo: ch.solo })));
        // Forward to Furnace WASM dispatch if in Furnace mode
        forwardWasmMuteStates(pattern.channels);
      }
      // Add status message
      if (typeof window !== 'undefined') {
        import('@stores/useUIStore').then(({ useUIStore }) => {
          useUIStore.getState().setStatusMessage(isSolo ? 'SOLO ON' : 'SOLO OFF');
        });
      }
    },

    toggleChannelCollapse: (channelIndex) =>
      set((state) => {
        state.patterns.forEach((pattern) => {
          if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
            pattern.channels[channelIndex].collapsed = !pattern.channels[channelIndex].collapsed;
          }
        });
      }),

    setChannelVolume: (channelIndex, volume) =>
      set((state) => {
        state.patterns.forEach((pattern) => {
          if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
            pattern.channels[channelIndex].volume = Math.max(0, Math.min(100, volume));
          }
        });
      }),

    setChannelPan: (channelIndex, pan) =>
      set((state) => {
        state.patterns.forEach((pattern) => {
          if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
            pattern.channels[channelIndex].pan = Math.max(-100, Math.min(100, pan));
          }
        });
      }),

    setChannelColor: (channelIndex, color) =>
      set((state) => {
        state.patterns.forEach((pattern) => {
          if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
            pattern.channels[channelIndex].color = color;
          }
        });
      }),

    setChannelRows: (channelIndex, rows) =>
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
          // Ensure rows array matches pattern length
          const paddedRows = [...rows];
          while (paddedRows.length < pattern.length) {
            paddedRows.push({ ...EMPTY_CELL });
          }
          pattern.channels[channelIndex].rows = paddedRows.slice(0, pattern.length);
        }
      }),

    reorderChannel: (fromIndex, toIndex) =>
      set((state) => {
        state.patterns.forEach((pattern) => {
          if (
            fromIndex >= 0 &&
            fromIndex < pattern.channels.length &&
            toIndex >= 0 &&
            toIndex < pattern.channels.length &&
            fromIndex !== toIndex
          ) {
            // Remove channel from original position
            const [channel] = pattern.channels.splice(fromIndex, 1);
            // Insert at new position
            pattern.channels.splice(toIndex, 0, channel);
          }
        });
        // Adjust cursor if it was on the moved channel (cursor lives in useCursorStore)
        const curCh = useCursorStore.getState().cursor.channelIndex;
        if (curCh === fromIndex) {
          useCursorStore.getState().moveCursorToChannel(toIndex);
        } else if (fromIndex < curCh && toIndex >= curCh) {
          useCursorStore.getState().moveCursorToChannel(curCh - 1);
        } else if (fromIndex > curCh && toIndex <= curCh) {
          useCursorStore.getState().moveCursorToChannel(curCh + 1);
        }
      }),

    updateChannelName: (channelIndex, name) =>
      set((state) => {
        state.patterns.forEach((pattern) => {
          if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
            pattern.channels[channelIndex].name = name;
          }
        });
      }),

    applySystemPreset: (presetId) =>
      set((state) => {
        const preset = SYSTEM_PRESETS.find((p) => p.id === presetId);
        if (!preset) {
          console.warn(`[useTrackerStore] Preset not found: ${presetId}`);
          return;
        }

        // Map DivChanType to CHANNEL_COLORS indices
        // null, Red, Orange, Yellow, Green, Teal, Cyan, Blue, Purple, Pink, Gray
        const getColorForType = (type: DivChanType): string | null => {
          switch (type) {
            case DivChanType.FM: return CHANNEL_COLORS[7]; // Blue
            case DivChanType.PULSE: return CHANNEL_COLORS[1]; // Red
            case DivChanType.WAVE: return CHANNEL_COLORS[3]; // Yellow
            case DivChanType.NOISE: return CHANNEL_COLORS[10]; // Gray
            case DivChanType.PCM: return CHANNEL_COLORS[4]; // Green
            case DivChanType.OP: return CHANNEL_COLORS[6]; // Cyan
            default: return null;
          }
        };

        state.patterns.forEach((pattern) => {
          if (preset.id === 'none') {
            // Reset to generic names
            pattern.channels.forEach((ch, i) => {
              ch.name = `Channel ${i + 1}`;
              ch.shortName = `${i + 1}`;
              ch.color = null;
              if (ch.channelMeta) {
                delete ch.channelMeta.furnaceType;
                delete ch.channelMeta.hardwareName;
              }
            });
            return;
          }

          if (preset.channelDefs.length > 0) {
            preset.channelDefs.forEach((chDef, idx) => {
              const chColor = getColorForType(chDef.type);
              if (idx < pattern.channels.length) {
                // Update existing channel
                pattern.channels[idx].name = chDef.name;
                pattern.channels[idx].shortName = chDef.shortName;
                pattern.channels[idx].color = chColor;
                
                // Technical metadata for 1:1 compatibility
                pattern.channels[idx].channelMeta = {
                  ...pattern.channels[idx].channelMeta,
                  importedFromMOD: pattern.channels[idx].channelMeta?.importedFromMOD ?? false,
                  channelType: chDef.type === DivChanType.PCM ? 'sample' : 'synth',
                  furnaceType: chDef.type,
                  hardwareName: chDef.name,
                  shortName: chDef.shortName,
                  systemId: preset.fileID
                };
              } else if (pattern.channels.length < MAX_CHANNELS) {
                // Add missing hardware channels
                const length = pattern.length;
                pattern.channels.push({
                  id: idGenerator.generate('channel'),
                  name: chDef.name,
                  shortName: chDef.shortName,
                  rows: Array.from({ length }, () => ({ ...EMPTY_CELL })),
                  muted: false,
                  solo: false,
                  collapsed: false,
                  volume: 80,
                  pan: 0,
                  instrumentId: null,
                  color: chColor,
                  channelMeta: {
                    importedFromMOD: false,
                    channelType: chDef.type === DivChanType.PCM ? 'sample' : 'synth',
                    furnaceType: chDef.type,
                    hardwareName: chDef.name,
                    shortName: chDef.shortName,
                    systemId: preset.fileID
                  }
                });
              }
            });

            // If pattern has more channels than preset, REMOVE them to match hardware constraints
            if (pattern.channels.length > preset.channelDefs.length) {
              pattern.channels.splice(preset.channelDefs.length);
            }
          }
        });

        // Add status message
        if (typeof window !== 'undefined') {
          import('@stores/useUIStore').then(({ useUIStore }) => {
            useUIStore.getState().setStatusMessage(`SYSTEM: ${preset.name.toUpperCase()}`);
          });
        }
      }),

    applyAmigaSongSettings: (presetId) => {
      const preset = SYSTEM_PRESETS.find((p) => p.id === presetId);
      if (!preset?.amigaFormat) return;

      // Paula hard-pan: ch0=Left, ch1=Right, ch2=Right, ch3=Left (repeating for >4ch)
      const paulaPan = [-100, 100, 100, -100];
      set((state) => {
        state.patterns.forEach((pattern) => {
          pattern.channels.forEach((ch, i) => {
            ch.pan = paulaPan[i % 4] ?? 0;
          });
        });
      });

      // Apply BPM via transport store (dynamic import to avoid circular deps)
      const bpm = preset.defaultBpm ?? 125;
      import('@stores/useTransportStore').then(({ useTransportStore }) => {
        useTransportStore.getState().setBPM(bpm);
      });
    },

    setChannelRecordGroup: (channelIndex, group) =>
      set((state) => {
        state.patterns.forEach((pattern) => {
          if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
            pattern.channels[channelIndex].recordGroup = group;
          }
        });
      }),

    getChannelsInRecordGroup: (group) => {
      const state = get();
      const pattern = state.patterns[state.currentPatternIndex];
      if (!pattern) return [];
      return pattern.channels
        .map((ch, i) => (ch.recordGroup === group ? i : -1))
        .filter((i) => i >= 0);
    },

    // Import/Export
    loadPatterns: (patterns) =>
      set((state) => {
        if (patterns.length > 0) {
          // Debug logging for pattern loading
          console.log('[TrackerStore] loadPatterns called with', patterns.length, 'patterns');
          let totalNotes = 0;
          patterns.forEach((p, pIdx) => {
            p.channels.forEach((c) => {
              c.rows.forEach((r) => {
                if (r.note > 0) totalNotes++;
              });
            });
            if (pIdx < 3) {
              console.log(`[TrackerStore] Pattern ${pIdx}: ${p.channels.length} channels, ${p.channels[0]?.rows?.length || 0} rows`);
            }
          });
          console.log('[TrackerStore] Total notes in loaded patterns:', totalNotes);
          
          // Ensure all channels have required properties (color) and length is valid
          const normalizedPatterns = patterns.map((pattern) => ({
            ...pattern,
            length: Math.max(1, pattern.length),
            channels: pattern.channels.map((channel) => ({
              ...channel,
              color: channel.color ?? null,
            })),
          }));
          state.patterns = normalizedPatterns;
          state.currentPatternIndex = 0;
          useCursorStore.setState({
            cursor: { channelIndex: 0, rowIndex: 0, columnType: 'note', digitIndex: 0 },
            selection: null,
          });
          state.clipboard = null;
        }
      }),

    setPatternOrder: (order) =>
      set((state) => {
        console.warn('[TrackerStore] setPatternOrder called, length:', order.length);
        if (order.length > 0) {
          state.patternOrder = order;
          state.currentPositionIndex = 0;
        }
      }),

    importPattern: (pattern) => {
      const newIndex = get().patterns.length;
      set((state) => {
        // Normalize the pattern to ensure all channels have required properties
        const normalizedPattern = {
          ...pattern,
          length: Math.max(1, pattern.length),
          channels: pattern.channels.map((channel) => ({
            ...channel,
            color: channel.color ?? null,
          })),
        };
        state.patterns.push(normalizedPattern);
      });
      return newIndex;
    },

    // Undo/Redo support
    replacePattern: (index, pattern) =>
      set((state) => {
        if (index >= 0 && index < state.patterns.length) {
          // Deep clone the pattern to avoid reference issues
          state.patterns[index] = structuredClone(pattern);
        }
      }),

    // FT2: Pattern Order List management
    addToOrder: (patternIndex, position) =>
      set((state) => {
        if (patternIndex >= 0 && patternIndex < state.patterns.length) {
          if (position !== undefined && position >= 0 && position <= state.patternOrder.length) {
            state.patternOrder.splice(position, 0, patternIndex);
          } else {
            state.patternOrder.push(patternIndex);
          }
        }
      }),

    removeFromOrder: (positionIndex) =>
      set((state) => {
        if (positionIndex >= 0 && positionIndex < state.patternOrder.length) {
          // Don't allow removing the last position
          if (state.patternOrder.length > 1) {
            state.patternOrder.splice(positionIndex, 1);
            // Adjust current position if needed
            if (state.currentPositionIndex >= state.patternOrder.length) {
              state.currentPositionIndex = state.patternOrder.length - 1;
            }
          }
        }
      }),

    insertInOrder: (patternIndex, positionIndex) =>
      set((state) => {
        if (patternIndex >= 0 && patternIndex < state.patterns.length) {
          if (positionIndex >= 0 && positionIndex <= state.patternOrder.length) {
            state.patternOrder.splice(positionIndex, 0, patternIndex);
          }
        }
      }),

    duplicatePosition: (positionIndex) =>
      set((state) => {
        if (positionIndex >= 0 && positionIndex < state.patternOrder.length) {
          const patternIndex = state.patternOrder[positionIndex];
          state.patternOrder.splice(positionIndex + 1, 0, patternIndex);
        }
      }),

    clearOrder: () =>
      set((state) => {
        state.patternOrder = [0]; // Reset to just first pattern
        state.currentPositionIndex = 0;
      }),

    reorderPositions: (oldIndex, newIndex) =>
      set((state) => {
        if (
          oldIndex >= 0 &&
          oldIndex < state.patternOrder.length &&
          newIndex >= 0 &&
          newIndex < state.patternOrder.length
        ) {
          const [movedPattern] = state.patternOrder.splice(oldIndex, 1);
          state.patternOrder.splice(newIndex, 0, movedPattern);

          // Update current position if it was affected
          if (state.currentPositionIndex === oldIndex) {
            state.currentPositionIndex = newIndex;
          } else if (oldIndex < state.currentPositionIndex && newIndex >= state.currentPositionIndex) {
            state.currentPositionIndex--;
          } else if (oldIndex > state.currentPositionIndex && newIndex <= state.currentPositionIndex) {
            state.currentPositionIndex++;
          }
        }
      }),

    setCurrentPosition: (positionIndex, fromReplayer) =>
      set((state) => {
        if (positionIndex >= 0 && positionIndex < state.patternOrder.length) {
          if (state.currentPositionIndex === positionIndex) return;
          state.currentPositionIndex = positionIndex;
          // Also update current pattern to match this position
          const nextPatternIndex = state.patternOrder[positionIndex];
          state.currentPatternIndex = nextPatternIndex;

          // If this update came from the replayer's natural playback advancement,
          // do NOT call seekTo — the replayer already knows where it is.
          // Only seek for user-initiated position changes (clicking pattern order, etc.)
          // This prevents ~100ms cumulative drift per pattern caused by the seekTo
          // resetting the scheduler timeline while the replayer's 100ms lookahead
          // has already scheduled ahead.
          if (fromReplayer) return;

          // If playing, tell the replayer to seek to this position
          const replayer = getTrackerReplayer();
          if (replayer.isPlaying()) {
            // ONLY seek if the replayer isn't already at this position.
            if (replayer.getCurrentPosition() !== positionIndex) {
              // Maintain current row when jumping positions manually
              const currentRow = useTransportStore.getState().currentRow;
              replayer.seekTo(positionIndex, currentRow);
            }
          }
        }
      }),

    // UADE live pattern display — uses immer draft for safe mutation, no undo
    setLiveChannelData: (row, channelData) =>
      set((state) => {
        const patIdx = state.patternOrder[state.currentPositionIndex] ?? state.currentPatternIndex;
        const pattern = state.patterns[patIdx];
        if (!pattern) return;

        for (let ch = 0; ch < Math.min(channelData.length, pattern.channels.length); ch++) {
          const cell = pattern.channels[ch]?.rows[row];
          if (!cell) continue;
          const d = channelData[ch];
          if (d.note > 0) {
            cell.note = d.note;
            cell.instrument = d.instrument;
            cell.volume = d.volume;
          }
        }
      }),

    // Reset to initial state (for new project/tab)
    reset: () => {
      useCursorStore.setState({
        cursor: { channelIndex: 0, rowIndex: 0, columnType: 'note', digitIndex: 0 },
        selection: null,
      });
      useEditorStore.getState().reset();
      useFormatStore.getState().reset();
      set((state) => {
        state.patterns = [createEmptyPattern()];
        state.currentPatternIndex = 0;
        state.clipboard = null;
        state.trackClipboard = null;
        state.macroSlots = Array.from({ length: 8 }, () => createEmptyMacroSlot());
        state.patternOrder = [0];
        state.currentPositionIndex = 0;
      });
    },
  }))
);

// Export mask constants for use in other modules (re-export from useEditorStore for backward compat)
export { MASK_NOTE, MASK_INSTRUMENT, MASK_VOLUME, MASK_EFFECT, MASK_EFFECT2, MASK_ALL } from './useEditorStore';
export type { MacroSlot };
