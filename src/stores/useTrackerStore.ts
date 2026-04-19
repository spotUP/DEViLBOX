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
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { useTransportStore } from './useTransportStore';
import { idGenerator } from '../utils/idGenerator';
import { DEFAULT_PATTERN_LENGTH, DEFAULT_NUM_CHANNELS, MAX_PATTERN_LENGTH, MAX_CHANNELS, MIN_CHANNELS, MIN_PATTERN_LENGTH } from '../constants/trackerConstants';
import { checkFormatViolation, getActiveFormatLimits, isViolationConfirmed } from '@/lib/formatCompatibility';
import { SYSTEM_PRESETS, DivChanType } from '../constants/systemPresets';
import { isSynthCompatibleWithChannel, getChannelBadge, getSynthBadge } from '../constants/channelTypeCompat';
import { useHistoryStore } from './useHistoryStore';
// Late-bound access to the sibling stores that used to form an import cycle
// with this file. storeAccess is a leaf — it imports nothing — so the three
// stores no longer participate in the same module-graph cycle that caused
// Rollup to emit TDZ'd bindings in the production bundle. Type-only imports
// are erased at compile time and do not create a runtime cycle.
import type { useCursorStore as _CursorStoreType } from './useCursorStore';
import type { useEditorStore as _EditorStoreType } from './useEditorStore';
import {
  getCursorStoreRef,
  getEditorStoreRef,
  registerTrackerStore,
} from './storeAccess';
const useCursorStore = {
  get getState() { return getCursorStoreRef().getState as typeof _CursorStoreType.getState; },
  get setState() { return getCursorStoreRef().setState as typeof _CursorStoreType.setState; },
};
const useEditorStore = {
  get getState() { return getEditorStoreRef().getState as typeof _EditorStoreType.getState; },
  get setState() { return getEditorStoreRef().setState as typeof _EditorStoreType.setState; },
};
import { useFormatStore } from './useFormatStore';
import { useMixerStore } from './useMixerStore';
import * as OpenMPTEditBridge from '@engine/libopenmpt/OpenMPTEditBridge';

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
  if (OpenMPTEditBridge.isActive()) {
    OpenMPTEditBridge.syncFullPattern(patternIndex, pattern.channels);
  }

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
  copySelectionHelper, cutSelectionHelper, swapSelectionHelper,
  pasteHelper, pasteMixHelper, pasteFloodHelper, pastePushForwardHelper,
  copyTrackHelper, cutTrackHelper, pasteTrackHelper,
  copyCommandsHelper, cutCommandsHelper, pasteCommandsHelper,
  killToEndHelper, killToStartHelper,
  reverseBlockHelper, doubleBlockHelper, halveBlockHelper,
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
  trackClipboard: TrackerCell[] | null;
  patternClipboard: (TrackerCell[] | null)[] | null;
  cmdsClipboard: TrackerCell[] | null; // PT: Commands-only clipboard
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
  splitPatternAtCursor: () => void;
  joinPatterns: () => void;

  // Block operations
  copySelection: () => void;
  cutSelection: () => void;
  paste: () => void;
  swapSelection: () => void;
  // Advanced paste modes (OpenMPT-style)
  pasteMix: () => void;           // Only fill empty cells
  pasteFlood: () => void;         // Paste until pattern end
  pastePushForward: () => void;   // Insert and shift down

  // FT2: Track operations (single-channel)
  copyTrack: (channelIndex: number) => void;
  cutTrack: (channelIndex: number) => void;
  pasteTrack: (channelIndex: number) => void;

  // PT: Commands-only buffer
  copyCommands: (channelIndex: number) => void;
  cutCommands: (channelIndex: number) => void;
  pasteCommands: (channelIndex: number) => void;

  // PT/IT: Block operations
  killToEnd: (channelIndex: number, fromRow: number) => void;
  killToStart: (channelIndex: number, toRow: number) => void;
  swapChannels: (ch1: number, ch2: number) => void;
  reverseBlock: (channelIndex: number, startRow: number, endRow: number) => void;
  doubleBlock: (channelIndex: number, startRow: number, endRow: number) => void;
  halveBlock: (channelIndex: number, startRow: number, endRow: number) => void;

  // FT2: Pattern operations (all channels)
  copyPattern: () => void;
  cutPattern: () => void;
  pastePattern: () => void;

  // FT2: Macro slots (quick-entry)
  writeMacroSlot: (slotIndex: number) => void;  // Store current cell
  readMacroSlot: (slotIndex: number) => void;   // Paste macro

  // Advanced editing
  applyInstrumentToSelection: (instrumentId: number) => void;
  transposeSelection: (semitones: number, currentInstrumentOnly?: boolean) => void;
  transposeTrack: (channelIndex: number, semitones: number) => void;
  transposePattern: (semitones: number) => void;
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
  /** Replace the dub lane on pattern `index`. Used by DubRecorder during live
   *  capture and by the lane editor for offline edits. Lane is optional — pass
   *  `null` or `undefined` to clear it. */
  setPatternDubLane: (index: number, lane: import('../types/dub').DubLane | null | undefined) => void;
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
  setChannelMeta: (channelIndex: number, meta: Partial<NonNullable<import('@typedefs').ChannelData['channelMeta']>>) => void;

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

// ── Channel-type validation (fires once per mismatch type) ───────────────────
const _warnedMismatches = new Set<string>();

function validateChannelInstrumentCompat(
  channelIndex: number,
  instrumentId: number,
  get: () => TrackerStore
) {
  try {
    const { useUIStore } = require('./useUIStore');
    const presetId = useUIStore.getState().activeSystemPreset;
    if (!presetId) return; // no hardware preset active

    const pattern = get().patterns[get().currentPatternIndex];
    const channel = pattern?.channels[channelIndex];
    const furnaceType = channel?.channelMeta?.furnaceType;
    if (furnaceType === undefined) return; // channel has no hardware type

    const { useInstrumentStore } = require('./useInstrumentStore');
    const instrument = useInstrumentStore.getState().instruments.find(
      (i: any) => i.id === instrumentId
    );
    if (!instrument?.synthType) return;

    if (!isSynthCompatibleWithChannel(instrument.synthType, furnaceType)) {
      const key = `${channelIndex}-${instrument.synthType}-${furnaceType}`;
      if (_warnedMismatches.has(key)) return; // already warned
      _warnedMismatches.add(key);

      const chBadge = getChannelBadge(furnaceType);
      const instBadge = getSynthBadge(instrument.synthType);
      const chName = channel.channelMeta?.hardwareName || channel.name || `CH${channelIndex + 1}`;
      const { notify } = require('@stores/useNotificationStore');
      notify.warning(
        `${instBadge.label} instrument "${instrument.name}" in ${chBadge.label} channel "${chName}" — may not play on target hardware`
      );
    }
  } catch { /* stores not available */ }
}

// Reset mismatch warnings when preset changes
export function resetChannelMismatchWarnings() {
  _warnedMismatches.clear();
}

export const useTrackerStore = create<TrackerStore>()(
  immer((set, get) => ({
    // Initial state
    patterns: [createEmptyPattern()],
    currentPatternIndex: 0,
    clipboard: null,
    trackClipboard: null, // FT2: Single-channel clipboard
    patternClipboard: null, // FT2: All-channel clipboard
    cmdsClipboard: null, // PT: Commands-only clipboard
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
      // Bridge is the primary edit path for libopenmpt formats — statically imported
      // to eliminate the async window where the store and soundlib could diverge.
      if (OpenMPTEditBridge.isActive()) {
        const fullCell = get().patterns[patternIndex]?.channels[channelIndex]?.rows[rowIndex];
        if (fullCell) {
          OpenMPTEditBridge.syncCellEdit(patternIndex, channelIndex, rowIndex, cellUpdate, fullCell);
        }
      }
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
      // Sync edit to TFMX mdat buffer (direct binary patch for WASM playback)
      try {
        const fmt = require('./useFormatStore').useFormatStore.getState();
        if (fmt.tfmxFileData && fmt.uadePatternLayout) {
          const fullCell = get().patterns[patternIndex]?.channels[channelIndex]?.rows[rowIndex];
          if (fullCell) {
            const { getCellFileOffset } = require('@engine/uade/UADEPatternEncoder');
            const offset = getCellFileOffset(fmt.uadePatternLayout, patternIndex, rowIndex, channelIndex);
            if (offset >= 0) {
              const encoded = fmt.uadePatternLayout.encodeCell(fullCell);
              const buf = new Uint8Array(fmt.tfmxFileData);
              for (let i = 0; i < encoded.length && offset + i < buf.length; i++) {
                buf[offset + i] = encoded[i];
              }
            }
          }
        }
      } catch { /* TFMX not active */ }
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
      // Sync edit to SunVox WASM sequencer if active
      try {
        const synthMod = require('../engine/sunvox-modular/SunVoxModularSynth');
        const handle = synthMod.getSharedSunVoxHandle();
        if (handle >= 0) {
          const fullCell = get().patterns[patternIndex]?.channels[channelIndex]?.rows[rowIndex];
          if (fullCell) {
            import('@engine/sunvox/SunVoxEngine').then(({ SunVoxEngine }) => {
              if (!SunVoxEngine.hasInstance()) return;
              const nn = fullCell.note ?? 0;
              const vv = fullCell.volume >= 0 ? fullCell.volume : -1;
              const mm = fullCell.instrument >= 0 ? fullCell.instrument + 1 : 0; // 0-based → 1-based
              const ccee = fullCell.effTyp > 0 ? (fullCell.effTyp | ((fullCell.eff >> 8) << 8)) : 0;
              const xxyy = fullCell.eff & 0xFFFF;
              SunVoxEngine.getInstance().setPatternEvent(handle, patternIndex, channelIndex, rowIndex, nn, vv, mm, ccee, xxyy);
            });
          }
        }
      } catch { /* SunVox not active */ }
      // Sync edit to PreTracker WASM engine (direct cell write)
      try {
        const fmt = require('./useFormatStore').useFormatStore.getState();
        if (fmt.preTrackerFileData) {
          const pattern = get().patterns[patternIndex];
          const fullCell = pattern?.channels[channelIndex]?.rows[rowIndex];
          if (fullCell && pattern) {
            import('@engine/pretracker/PreTrackerEngine').then(({ PreTrackerEngine }) => {
              if (!PreTrackerEngine.hasInstance()) return;
              // Resolve the actual track number from the position→track map
              const meta = pattern.importMetadata as Record<string, unknown> | undefined;
              const trackMap = meta?.prtTrackMap as number[] | undefined;
              const transposeMap = meta?.prtTransposeMap as number[] | undefined;
              const trackNum = trackMap?.[channelIndex] ?? (patternIndex + 1);
              if (trackNum === 0) return; // track 0 = empty/muted
              // Reverse XM note → PreTracker note (undo transpose)
              const transpose = transposeMap?.[channelIndex] ?? 0;
              let prtNote = fullCell.note > 0 ? Math.max(0, fullCell.note - 12 - transpose) : 0;
              if (prtNote < 0) prtNote = 0;
              if (prtNote > 60) prtNote = 60;
              // Encode 3-byte cell:
              // b0: bits 5-0=note, bit 6=arpeggio flag, bit 7=inst high bit
              const inst = fullCell.instrument & 0x1F; // 0-31
              const instHi = (inst & 0x10) ? 0x80 : 0;
              const hasArp = fullCell.effTyp === 0 && fullCell.eff !== 0;
              const arpFlag = hasArp ? 0x40 : 0;
              const pitchCtrl = (prtNote & 0x3F) | arpFlag | instHi;
              // b1: bits 7-4=inst low nibble, bits 3-0=effect cmd
              const instEffect = ((inst & 0x0F) << 4) | (fullCell.effTyp & 0x0F);
              const effectData = fullCell.eff & 0xFF;
              PreTrackerEngine.getInstance().setTrackCell(trackNum, rowIndex, pitchCtrl, instEffect, effectData);
            });
          }
        }
      } catch { /* PreTracker not active */ }
      // Sync edit to NostalgicPlayer WASM replayer engines (SA, SM, DM, etc.)
      // These engines have setCell() that directly modifies the internal pattern data.
      try {
        const fmt = require('./useFormatStore').useFormatStore.getState();
        const fullCell = get().patterns[patternIndex]?.channels[channelIndex]?.rows[rowIndex];
        if (fullCell) {
          const fileDataKeys: [string, string, () => Promise<{ getInstance(): { setCell: (...args: number[]) => void }, hasInstance(): boolean }>][] = [
            ['sonicArrangerFileData', 'SonicArranger', () => import('@engine/sonic-arranger/SonicArrangerEngine').then(m => m.SonicArrangerEngine as any)],
            ['soundMonFileData', 'SoundMon', () => import('@engine/soundmon/SoundMonEngine').then(m => m.SoundMonEngine as any)],
            ['digMugFileData', 'DigMug', () => import('@engine/digmug/DigMugEngine').then(m => m.DigMugEngine as any)],
            ['davidWhittakerFileData', 'DavidWhittaker', () => import('@engine/davidwhittaker/DavidWhittakerEngine').then(m => m.DavidWhittakerEngine as any)],
            ['soundControlFileData', 'SoundControl', () => import('@engine/soundcontrol/SoundControlEngine').then(m => m.SoundControlEngine as any)],
            ['deltaMusic1FileData', 'DeltaMusic1', () => import('@engine/deltamusic1/DeltaMusic1Engine').then(m => m.DeltaMusic1Engine as any)],
            ['deltaMusic2FileData', 'DeltaMusic2', () => import('@engine/deltamusic2/DeltaMusic2Engine').then(m => m.DeltaMusic2Engine as any)],
            ['gmcFileData', 'Gmc', () => import('@engine/gmc/GmcEngine').then(m => m.GmcEngine as any)],
            ['soundFxFileData', 'SoundFx', () => import('@engine/soundfx/SoundFxEngine').then(m => m.SoundFxEngine as any)],
            ['oktalyzerFileData', 'Oktalyzer', () => import('@engine/oktalyzer/OktalyzerEngine').then(m => m.OktalyzerEngine as any)],
            ['inStereo1FileData', 'InStereo1', () => import('@engine/instereo1/InStereo1Engine').then(m => m.InStereo1Engine as any)],
            ['futureComposerFileData', 'FutureComposer', () => import('@engine/futurecomposer/FutureComposerEngine').then(m => m.FutureComposerEngine as any)],
            ['inStereo2FileData', 'InStereo2', () => import('@engine/instereo2/InStereo2Engine').then(m => m.InStereo2Engine as any)],
            ['quadraComposerFileData', 'QuadraComposer', () => import('@engine/quadracomposer/QuadraComposerEngine').then(m => m.QuadraComposerEngine as any)],
            ['synthesisFileData', 'Synthesis', () => import('@engine/synthesis/SynthesisEngine').then(m => m.SynthesisEngine as any)],
            ['dssFileData', 'Dss', () => import('@engine/dss/DssEngine').then(m => m.DssEngine as any)],
            ['faceTheMusicFileData', 'FaceTheMusic', () => import('@engine/facethemusic/FaceTheMusicEngine').then(m => m.FaceTheMusicEngine as any)],
          ];
          for (const [key, , loader] of fileDataKeys) {
            if ((fmt as any)[key]) {
              loader().then(Engine => {
                if (Engine.hasInstance()) {
                  Engine.getInstance().setCell(
                    patternIndex, rowIndex, channelIndex,
                    fullCell.note ?? 0, fullCell.instrument ?? 0,
                    fullCell.effTyp ?? 0, fullCell.eff ?? 0
                  );
                }
              });
              break; // Only one NP engine active at a time
            }
          }
        }
      } catch { /* NostalgicPlayer engine not active */ }
      // Sync edit to MusicLine WASM engine (debounced re-export)
      debouncedWasmEngineReexport();

      // Channel-type validation: warn if instrument is incompatible with channel hardware type
      if (cellUpdate.instrument !== undefined && cellUpdate.instrument >= 0) {
        validateChannelInstrumentCompat(channelIndex, cellUpdate.instrument, get);
      }
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
      if (OpenMPTEditBridge.isActive()) {
        OpenMPTEditBridge.syncCellClear(patternIndex, channelIndex, rowIndex);
      }
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
      // Sync clear to SunVox WASM sequencer if active
      try {
        const synthMod = require('../engine/sunvox-modular/SunVoxModularSynth');
        const handle = synthMod.getSharedSunVoxHandle();
        if (handle >= 0) {
          import('@engine/sunvox/SunVoxEngine').then(({ SunVoxEngine }) => {
            if (!SunVoxEngine.hasInstance()) return;
            SunVoxEngine.getInstance().setPatternEvent(handle, patternIndex, channelIndex, rowIndex, 0, 0, 0, 0, 0);
          });
        }
      } catch { /* SunVox not active */ }
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

    swapSelection: () => {
      if (!get().clipboard) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        if (!state.clipboard) return;
        const pattern = state.patterns[state.currentPatternIndex];
        const { cursor, selection } = useCursorStore.getState();
        state.clipboard = swapSelectionHelper(
          pattern, selection, cursor, state.clipboard,
          useEditorStore.getState().pasteMask,
        );
      });
      useHistoryStore.getState().pushAction('SWAP_SELECTION', 'Swap selection', patternIndex, beforePattern, get().patterns[patternIndex]);
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

    // PT: Commands-only clipboard operations
    copyCommands: (channelIndex) =>
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const result = copyCommandsHelper(pattern, channelIndex);
        if (result) state.cmdsClipboard = result;
      }),
    cutCommands: (channelIndex) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const p = state.patterns[state.currentPatternIndex];
        const result = cutCommandsHelper(p, channelIndex);
        if (result) state.cmdsClipboard = result;
      });
      useHistoryStore.getState().pushAction('CUT_COMMANDS', 'Cut commands', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },
    pasteCommands: (channelIndex) => {
      if (!get().cmdsClipboard) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        if (!state.cmdsClipboard) return;
        const p = state.patterns[state.currentPatternIndex];
        pasteCommandsHelper(p, channelIndex, state.cmdsClipboard);
      });
      useHistoryStore.getState().pushAction('PASTE_COMMANDS', 'Paste commands', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },

    // PT/IT: Block operations
    killToEnd: (channelIndex, fromRow) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        killToEndHelper(state.patterns[state.currentPatternIndex], channelIndex, fromRow);
      });
      useHistoryStore.getState().pushAction('KILL_TO_END', 'Kill to end', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },
    killToStart: (channelIndex, toRow) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        killToStartHelper(state.patterns[state.currentPatternIndex], channelIndex, toRow);
      });
      useHistoryStore.getState().pushAction('KILL_TO_START', 'Kill to start', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },
    swapChannels: (ch1, ch2) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        swapChannelsHelper(state.patterns[state.currentPatternIndex], ch1, ch2);
      });
      useHistoryStore.getState().pushAction('SWAP_CHANNELS', `Swap ch ${ch1+1}↔${ch2+1}`, patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },
    reverseBlock: (channelIndex, startRow, endRow) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        reverseBlockHelper(state.patterns[state.currentPatternIndex], channelIndex, startRow, endRow);
      });
      useHistoryStore.getState().pushAction('REVERSE_BLOCK', 'Reverse block', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },
    doubleBlock: (channelIndex, startRow, endRow) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        doubleBlockHelper(state.patterns[state.currentPatternIndex], channelIndex, startRow, endRow);
      });
      useHistoryStore.getState().pushAction('DOUBLE_BLOCK', 'Double block', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },
    halveBlock: (channelIndex, startRow, endRow) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        halveBlockHelper(state.patterns[state.currentPatternIndex], channelIndex, startRow, endRow);
      });
      useHistoryStore.getState().pushAction('HALVE_BLOCK', 'Halve block', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },

    // FT2: Pattern operations (all channels — copies each track)
    copyPattern: () =>
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        // Store all tracks as an array of track clipboards
        const allTracks = pattern.channels.map((_, ch) => copyTrackHelper(pattern, ch)).filter(Boolean);
        if (allTracks.length > 0) state.patternClipboard = allTracks;
      }),

    cutPattern: () => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const p = state.patterns[state.currentPatternIndex];
        const allTracks = p.channels.map((_, ch) => cutTrackHelper(p, ch)).filter(Boolean);
        if (allTracks.length > 0) state.patternClipboard = allTracks;
      });
      useHistoryStore.getState().pushAction('CUT_PATTERN', 'Cut pattern', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },

    pastePattern: () => {
      const clipboard = get().patternClipboard;
      if (!clipboard || clipboard.length === 0) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const p = state.patterns[state.currentPatternIndex];
        const pasteMask = useEditorStore.getState().pasteMask;
        clipboard.forEach((trackData, ch) => {
          if (ch < p.channels.length && trackData) {
            pasteTrackHelper(p, ch, trackData, pasteMask);
          }
        });
      });
      useHistoryStore.getState().pushAction('PASTE_PATTERN', 'Paste pattern', patternIndex, beforePattern, get().patterns[patternIndex]);
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

    // Transpose entire track (single channel, all rows) by semitones
    transposeTrack: (channelIndex, semitones) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const fullTrackSelection = {
          startChannel: channelIndex,
          endChannel: channelIndex,
          startRow: 0,
          endRow: pattern.length - 1,
          startColumn: 'note' as const,
          endColumn: 'note' as const,
          columnTypes: ['note' as const],
        };
        const { cursor } = useCursorStore.getState();
        transposeSelectionHelper(pattern, fullTrackSelection, cursor, semitones, null);
      });
      useHistoryStore.getState().pushAction('TRANSPOSE', 'Transpose Track', patternIndex, beforePattern, get().patterns[patternIndex]);
      syncBulkEdit(patternIndex, get().patterns[patternIndex]);
    },

    // Transpose entire pattern (all channels, all rows) by semitones
    transposePattern: (semitones) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const fullPatternSelection = {
          startChannel: 0,
          endChannel: pattern.channels.length - 1,
          startRow: 0,
          endRow: pattern.length - 1,
          startColumn: 'note' as const,
          endColumn: 'note' as const,
          columnTypes: ['note' as const],
        };
        const { cursor } = useCursorStore.getState();
        transposeSelectionHelper(pattern, fullPatternSelection, cursor, semitones, null);
      });
      useHistoryStore.getState().pushAction('TRANSPOSE', 'Transpose Pattern', patternIndex, beforePattern, get().patterns[patternIndex]);
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

    addPattern: (length = DEFAULT_PATTERN_LENGTH) => {
      const patCount = get().patterns.length;
      const limits = getActiveFormatLimits();
      if (limits && patCount >= limits.maxPatterns && !isViolationConfirmed('patternCount')) {
        void checkFormatViolation('patternCount',
          `Adding pattern ${patCount + 1} exceeds ${limits.name} limit of ${limits.maxPatterns} patterns.`,
        ).then((ok) => { if (ok) get().addPattern(length); });
        return;
      }
      set((state) => {
        const numChannels = state.patterns[0]?.channels.length || DEFAULT_NUM_CHANNELS;
        state.patterns.push(createEmptyPattern(length, numChannels));
        // Add status message
        if (typeof window !== 'undefined') {
          import('@stores/useUIStore').then(({ useUIStore }) => {
            useUIStore.getState().setStatusMessage('PATTERN ADDED');
          });
        }
      });
    },

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

    resizePattern: (index, newLength) => {
      const limits = getActiveFormatLimits();
      if (limits && newLength > limits.maxPatternLength && !isViolationConfirmed('patternLength')) {
        void checkFormatViolation('patternLength',
          `Resizing to ${newLength} rows exceeds ${limits.name} limit of ${limits.maxPatternLength} rows.`,
        ).then((ok) => { if (ok) get().resizePattern(index, newLength); });
        return;
      }
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
      });
    },

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

    setPatternDubLane: (index, lane) =>
      set((state) => {
        if (index < 0 || index >= state.patterns.length) return;
        // Undefined/null = clear. Otherwise replace (Immer handles immutable update).
        if (lane == null) delete state.patterns[index].dubLane;
        else state.patterns[index].dubLane = lane;
      }),

    // Channel management
    addChannel: () => {
      // Format compat: check channel count
      const currentChannels = get().patterns[0]?.channels.length ?? 0;
      const limits = getActiveFormatLimits();
      if (limits && currentChannels >= limits.maxChannels && !isViolationConfirmed('channelCount')) {
        void checkFormatViolation('channelCount',
          `Adding channel ${currentChannels + 1} exceeds ${limits.name} limit of ${limits.maxChannels} channels.`,
        ).then((ok) => { if (ok) get().addChannel(); });
        return;
      }
      set((state) => {
        // Use the scheme-specific maxChannels, falling back to global MAX_CHANNELS
        const behaviorMax = useEditorStore.getState().activeBehavior.maxChannels;
        const maxChannels = Math.min(behaviorMax, MAX_CHANNELS);
        // Get available colors (excluding null)
        const availableColors = CHANNEL_COLORS.filter((c) => c !== null) as string[];
        // Pick a random color for the new channel
        const randomColor = availableColors[Math.floor(Math.random() * availableColors.length)];

        const firstPattern = state.patterns[0];
        if (firstPattern && firstPattern.channels.length >= maxChannels) {
          // At limit — show message but don't add
          if (typeof window !== 'undefined') {
            import('@stores/useUIStore').then(({ useUIStore }) => {
              useUIStore.getState().setStatusMessage(`MAX ${maxChannels} CHANNELS (${useEditorStore.getState().activeBehavior.name})`);
            });
          }
          return;
        }

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
      });
    },

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
      // Delegate to useMixerStore — single source of truth for mute/solo.
      // MixerStore handles: engine forwarding + syncing back to pattern channels.
      const mixerState = useMixerStore.getState();
      const currentlyMuted = mixerState.channels[channelIndex]?.muted ?? false;
      mixerState.setChannelMute(channelIndex, !currentlyMuted);

      if (typeof window !== 'undefined') {
        import('@stores/useUIStore').then(({ useUIStore }) => {
          useUIStore.getState().setStatusMessage(!currentlyMuted ? 'MUTED' : 'UNMUTED');
        });
      }
    },

    toggleChannelSolo: (channelIndex) => {
      // Delegate to useMixerStore — single source of truth for mute/solo.
      const mixerState = useMixerStore.getState();
      const currentlySoloed = mixerState.channels[channelIndex]?.soloed ?? false;
      mixerState.setChannelSolo(channelIndex, !currentlySoloed);

      if (typeof window !== 'undefined') {
        import('@stores/useUIStore').then(({ useUIStore }) => {
          useUIStore.getState().setStatusMessage(!currentlySoloed ? 'SOLO ON' : 'SOLO OFF');
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

    setChannelMeta: (channelIndex, meta) =>
      set((state) => {
        state.patterns.forEach((pattern) => {
          if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
            const ch = pattern.channels[channelIndex];
            ch.channelMeta = {
              importedFromMOD: false,
              ...ch.channelMeta,
              ...meta,
            };
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
    loadPatterns: (patterns) => {
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
            cursor: { channelIndex: 0, rowIndex: 0, noteColumnIndex: 0, columnType: 'note', digitIndex: 0 },
            selection: null,
          });
          state.clipboard = null;
        }
      });
      // Reset mixer mute/solo AFTER set() completes to avoid nested setState
      if (patterns.length > 0) {
        useMixerStore.getState().resetMuteState();
      }
    },

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
    addToOrder: (patternIndex, position) => {
      const orderLen = get().patternOrder.length;
      const limits = getActiveFormatLimits();
      if (limits && orderLen >= limits.maxPositions && !isViolationConfirmed('positionCount')) {
        void checkFormatViolation('positionCount',
          `Adding position ${orderLen + 1} exceeds ${limits.name} limit of ${limits.maxPositions} positions.`,
        ).then((ok) => { if (ok) get().addToOrder(patternIndex, position); });
        return;
      }
      set((state) => {
        if (patternIndex >= 0 && patternIndex < state.patterns.length) {
          if (position !== undefined && position >= 0 && position <= state.patternOrder.length) {
            state.patternOrder.splice(position, 0, patternIndex);
          } else {
            state.patternOrder.push(patternIndex);
          }
        }
      });
    },

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
        cursor: { channelIndex: 0, rowIndex: 0, noteColumnIndex: 0, columnType: 'note', digitIndex: 0 },
        selection: null,
      });
      useEditorStore.getState().reset();
      useFormatStore.getState().reset();
      set((state) => {
        state.patterns = [createEmptyPattern()];
        state.currentPatternIndex = 0;
        state.clipboard = null;
        state.trackClipboard = null;
        state.patternClipboard = null;
        state.macroSlots = Array.from({ length: 8 }, () => createEmptyMacroSlot());
        state.patternOrder = [0];
        state.currentPositionIndex = 0;
      });
      // Empty soundlib is created on-demand by TrackerReplayer.play()
      // when libopenmptFileData is null — not here in reset().
    },
  }))
);

// Register with the cross-store access leaf so useCursorStore (and anyone
// else caught in the old cycle) can reach this store without a static
// import cycle at module-init time.
registerTrackerStore(useTrackerStore);

// Export mask constants for use in other modules. Re-export from the leaf
// editorMasks module — NOT from useEditorStore — to avoid a circular-import
// TDZ. The store group cycle (useTrackerStore → useEditorStore → useCursorStore
// → useTrackerStore) would freeze this namespace object before useEditorStore
// had evaluated its const declarations, throwing "Cannot access before
// initialization" on the minified mask symbols at app load.
export { MASK_NOTE, MASK_INSTRUMENT, MASK_VOLUME, MASK_EFFECT, MASK_EFFECT2, MASK_ALL } from './editorMasks';
export type { MacroSlot };
