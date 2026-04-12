/**
 * Format Store - Format-specific state & methods.
 *
 * Holds editor mode, native format data (Furnace, Hively, Klystrack, etc.),
 * metadata (SongDB, SID), and the applyEditorMode transition logic.
 *
 * Extracted from useTrackerStore to keep pattern-editing concerns separate
 * from format/import concerns.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  EditorMode,
  FurnaceNativeData,
  HivelyNativeData,
  HivelyNativeStep,
  KlysNativeData,
  FurnaceSubsongPlayback,
} from '@typedefs';
import type { TFMXNativeData } from '@/types/tfmxNative';
import type { SF2LoadPayload } from './useSF2Store';
import { useSF2Store } from './useSF2Store';
import { useCheeseCutterStore } from './useCheeseCutterStore';
import { useEditorStore } from './useEditorStore';
import { useUIStore } from './useUIStore';

/** Undo entry for a single Hively track step edit */
export interface HivelyTrackStepUndoEntry {
  trackIndex: number;
  stepIndex: number;
  before: HivelyNativeStep;
  after: HivelyNativeStep;
  description: string;
  timestamp: number;
}

interface FormatStore {
  editorMode: EditorMode;
  furnaceNative: FurnaceNativeData | null;
  hivelyNative: HivelyNativeData | null;
  hivelyFileData: ArrayBuffer | null;
  klysNative: KlysNativeData | null;
  klysFileData: ArrayBuffer | null;
  musiclineFileData: Uint8Array | null;
  c64SidFileData: Uint8Array | null;
  c64MemPatches: Array<{ addr: number; data: Uint8Array }> | null;
  goatTrackerData: Uint8Array | null;
  cheeseCutterFileData: ArrayBuffer | null;
  jamCrackerFileData: ArrayBuffer | null;
  futurePlayerFileData: ArrayBuffer | null;
  preTrackerFileData: ArrayBuffer | null;
  maFileData: ArrayBuffer | null;
  hippelFileData: ArrayBuffer | null;
  sonixFileData: ArrayBuffer | null;
  pxtoneFileData: ArrayBuffer | null;
  organyaFileData: ArrayBuffer | null;
  eupFileData: ArrayBuffer | null;
  ixsFileData: ArrayBuffer | null;
  psycleFileData: ArrayBuffer | null;
  sc68FileData: ArrayBuffer | null;
  zxtuneFileData: ArrayBuffer | null;
  pumaTrackerFileData: ArrayBuffer | null;
  steveTurnerFileData: ArrayBuffer | null;
  sidmon1WasmFileData: ArrayBuffer | null;
  fredEditorWasmFileData: ArrayBuffer | null;
  artOfNoiseFileData: ArrayBuffer | null;
  startrekkerAMFileData: ArrayBuffer | null;
  bdFileData: ArrayBuffer | null;
  sd2FileData: ArrayBuffer | null;
  symphonieFileData: ArrayBuffer | null;
  uadeEditableFileData: ArrayBuffer | null;
  uadeEditableFileName: string | null;
  adplugFileData: ArrayBuffer | null;
  adplugFileName: string | null;
  adplugTicksPerRow: number | null;
  uadeCompanionFiles: Map<string, ArrayBuffer> | null;
  uadePatternLayout: import('@/engine/uade/UADEPatternEncoder').UADEPatternLayout | null;
  tfmxFileData: ArrayBuffer | null;
  tfmxSmplData: ArrayBuffer | null;
  tfmxTimingTable: { patternIndex: number; row: number; cumulativeJiffies: number }[] | null;
  tfmxNative: TFMXNativeData | null;
  tfmxSelectedPattern: number;
  uadeEditableSubsongs: { count: number; speeds: number[] } | null;
  uadeEditableCurrentSubsong: number;
  libopenmptFileData: ArrayBuffer | null;
  hivelyMeta: { stereoMode: number; mixGain: number; speedMultiplier: number; version: number } | null;
  furnaceSubsongs: FurnaceSubsongPlayback[] | null;
  furnaceActiveSubsong: number;
  channelTrackTables: number[][] | null;
  channelSpeeds: number[] | null;
  channelGrooves: number[] | null;
  musiclineMetadata: { title: string; author: string; date: string; duration: string; infoText: string[] } | null;
  /** MusicLine keyboard input mode: 'mono' (single channel) or 'poly' (rotate across channels) */
  musiclineKeyboardMode: 'mono' | 'poly';
  originalModuleData: { base64: string; format: 'MOD' | 'XM' | 'IT' | 'S3M' | 'UNKNOWN'; sourceFile?: string } | null;
  songDBInfo: { authors: string[]; publishers: string[]; album: string; year: string; format: string; duration_ms: number } | null;
  sidMetadata: { format: string; version: number; title: string; author: string; copyright: string; chipModel: '6581' | '8580' | 'Unknown'; clockSpeed: 'PAL' | 'NTSC' | 'Unknown'; subsongs: number; defaultSubsong: number; currentSubsong: number; secondSID: boolean; thirdSID: boolean } | null;

  // Hively track step undo/redo
  hivelyUndoStack: HivelyTrackStepUndoEntry[];
  hivelyRedoStack: HivelyTrackStepUndoEntry[];

  setEditorMode: (mode: EditorMode) => void;
  setFurnaceNative: (data: FurnaceNativeData | null) => void;
  setFurnaceOrderEntry: (channel: number, position: number, patternIndex: number) => void;
  /** Insert a new order row (copy of current) after the given position */
  insertFurnaceOrderRow: (position: number) => void;
  /** Delete the order row at the given position */
  deleteFurnaceOrderRow: (position: number) => void;
  setHivelyNative: (data: HivelyNativeData | null) => void;
  /** Update a single track or transpose value in the Hively position matrix */
  setHivelyPositionCell: (pos: number, ch: number, field: 'track' | 'transpose', value: number) => void;
  /** Insert a new position (copy of current, or blank) at the given index */
  insertHivelyPosition: (pos: number) => void;
  /** Delete a position */
  deleteHivelyPosition: (pos: number) => void;
  /** Update a single step in a Hively track with undo support */
  setHivelyTrackStep: (trackIndex: number, stepIndex: number, update: Partial<HivelyNativeStep>) => void;
  /** Undo the last Hively track step edit */
  undoHivelyTrackStep: () => void;
  /** Redo the last undone Hively track step edit */
  redoHivelyTrackStep: () => void;
  /** Check if Hively undo is available */
  canUndoHively: () => boolean;
  /** Check if Hively redo is available */
  canRedoHively: () => boolean;
  /** Insert an empty row at rowIndex in a Hively track, shifting rows down. Last row is lost. */
  insertHivelyTrackRow: (trackIndex: number, rowIndex: number) => void;
  /** Delete the row at rowIndex in a Hively track, shifting rows up. An empty row is added at the bottom. */
  deleteHivelyTrackRow: (trackIndex: number, rowIndex: number) => void;
  /** Set native TFMX data */
  setTFMXNative: (data: TFMXNativeData | null) => void;
  /** Set the selected pattern index for the TFMX pattern editor pane */
  setTFMXSelectedPattern: (idx: number) => void;
  /** Update a voice assignment in the TFMX trackstep matrix */
  setTFMXTrackstepVoice: (stepIdx: number, voiceIdx: number, patNum: number, transpose: number) => void;
  /** Insert a new trackstep (copy of current) at the given index */
  insertTFMXTrackstep: (idx: number) => void;
  /** Delete the trackstep at the given index */
  deleteTFMXTrackstep: (idx: number) => void;
  /** Update a pattern command in the TFMX pattern pool */
  setTFMXPatternCommand: (patIdx: number, rowIdx: number, field: 'note' | 'macro' | 'wait' | 'detune', value: number) => void;
  /** Update a single byte (0-3) in a TFMX macro command and patch tfmxFileData */
  setTFMXMacroByte: (macroIdx: number, stepIdx: number, byteIdx: 0 | 1 | 2 | 3, value: number) => void;
  /** Replace an entire TFMX macro command (all 4 bytes) and patch tfmxFileData */
  setTFMXMacroCommand: (macroIdx: number, stepIdx: number, b0: number, b1: number, b2: number, b3: number) => void;
  /** Insert a NOP command at the given step in a TFMX macro (within capacity). Returns true on success. */
  insertTFMXMacroStep: (macroIdx: number, stepIdx: number) => boolean;
  /** Delete the command at the given step, shifting subsequent commands up. */
  deleteTFMXMacroStep: (macroIdx: number, stepIdx: number) => boolean;
  /** Duplicate the command at the given step (insert + copy). */
  duplicateTFMXMacroStep: (macroIdx: number, stepIdx: number) => boolean;
  /** Update a Klystrack sequence entry field (pattern or noteOffset) */
  setKlysSequenceEntry: (channel: number, position: number, field: 'pattern' | 'noteOffset', value: number) => void;
  /** Insert a new Klystrack sequence entry (copy of current or blank) at the given position */
  insertKlysSequenceEntry: (position: number) => void;
  /** Delete the Klystrack sequence entry at the given position across all channels */
  deleteKlysSequenceEntry: (position: number) => void;
  /** Update a single pattern index in the MusicLine per-channel track table */
  setMusicLineTrackEntry: (channel: number, position: number, patternIndex: number) => void;
  /** Clear a MusicLine track entry to empty (pattern 0, no command) */
  clearMusicLineTrackEntry: (channel: number, position: number) => void;
  /** Insert an empty entry at position for a single channel, shifting entries down. Last entry is lost. */
  insertMusicLineTrackEntry: (channel: number, position: number) => void;
  /** Remove the entry at position for a single channel, shifting entries up. An empty entry (0) is added at the bottom. */
  deleteMusicLineTrackEntry: (channel: number, position: number) => void;
  /** Insert an empty entry at position for ALL channels, shifting entries down. Last entry per channel is lost. */
  insertMusicLineTrackEntryAllChannels: (position: number) => void;
  /** Remove the entry at position for ALL channels, shifting entries up. An empty entry (0) is added at the bottom of each. */
  deleteMusicLineTrackEntryAllChannels: (position: number) => void;
  /** Remove patterns not referenced by any channel track table. Returns count of removed patterns. */
  removeUnusedMusicLineParts: () => number;
  /** Toggle MusicLine keyboard mode between mono and poly */
  toggleMusicLineKeyboardMode: () => void;
  /** Update MusicLine metadata field */
  setMusicLineMetadataField: (field: string, value: string) => void;
  setSongDBInfo: (info: FormatStore['songDBInfo']) => void;
  setSidMetadata: (info: FormatStore['sidMetadata']) => void;
  setOriginalModuleData: (data: FormatStore['originalModuleData']) => void;
  applyEditorMode: (song: { linearPeriods?: boolean; furnaceNative?: FurnaceNativeData; hivelyNative?: HivelyNativeData; hivelyFileData?: ArrayBuffer; klysNative?: KlysNativeData; klysFileData?: ArrayBuffer; musiclineFileData?: Uint8Array; c64SidFileData?: Uint8Array; jamCrackerFileData?: ArrayBuffer; futurePlayerFileData?: ArrayBuffer; preTrackerFileData?: ArrayBuffer; maFileData?: ArrayBuffer; hippelFileData?: ArrayBuffer; sonixFileData?: ArrayBuffer; pxtoneFileData?: ArrayBuffer; organyaFileData?: ArrayBuffer; eupFileData?: ArrayBuffer; ixsFileData?: ArrayBuffer; psycleFileData?: ArrayBuffer; sc68FileData?: ArrayBuffer; zxtuneFileData?: ArrayBuffer; pumaTrackerFileData?: ArrayBuffer; steveTurnerFileData?: ArrayBuffer; sidmon1WasmFileData?: ArrayBuffer; artOfNoiseFileData?: ArrayBuffer; bdFileData?: ArrayBuffer; sd2FileData?: ArrayBuffer; symphonieFileData?: ArrayBuffer; uadeEditableFileData?: ArrayBuffer; uadeEditableFileName?: string; adplugFileData?: ArrayBuffer; adplugFileName?: string; adplugTicksPerRow?: number; libopenmptFileData?: ArrayBuffer; hivelyMeta?: { stereoMode: number; mixGain: number; speedMultiplier: number; version: number }; furnaceSubsongs?: FurnaceSubsongPlayback[]; furnaceActiveSubsong?: number; channelTrackTables?: number[][]; channelSpeeds?: number[]; channelGrooves?: number[]; musiclineMetadata?: { title: string; author: string; date: string; duration: string; infoText: string[] }; goatTrackerData?: Uint8Array; tfmxNative?: TFMXNativeData; sf2StoreData?: SF2LoadPayload; cheeseCutterStoreData?: import('@/stores/useCheeseCutterStore').CheeseCutterLoadPayload }) => void;
  setFurnaceActiveSubsong: (index: number) => void;
  reset: () => void;
}

/**
 * Restructure a TFMX macro by inserting, deleting, or duplicating a 4-byte
 * command at `stepIdx`. Operates within the macro's in-file capacity:
 * the bytes between this macro's offset and the next macro's offset (or
 * end of file for the last macro). Returns false if there's no room.
 *
 * Mutates state.tfmxNative.macros[macroIdx].commands AND state.tfmxFileData
 * in place; the existing reloadModule() path will pick up the new bytes.
 */
function restructureTFMXMacro(
  state: any,
  macroIdx: number,
  stepIdx: number,
  op: 'insert' | 'delete' | 'duplicate',
): boolean {
  if (!state.tfmxNative || !state.tfmxFileData) return false;
  const macros = state.tfmxNative.macros as Array<{
    index: number; fileOffset: number; length: number;
    commands: Array<{
      step: number; raw: number; fileOffset: number;
      byte0: number; byte1: number; byte2: number; byte3: number;
      opcode: number; flags: number;
    }>;
  }>;
  const macro = macros[macroIdx];
  if (!macro) return false;
  if (stepIdx < 0 || stepIdx >= macro.commands.length) return false;

  // Compute capacity = bytes available from macro start until next macro
  // (or end of file). Use the smallest fileOffset > macro.fileOffset across
  // all macros — neighbors aren't necessarily sorted by index.
  let capacityEnd = state.tfmxFileData.byteLength;
  for (const m of macros) {
    if (m.fileOffset > macro.fileOffset && m.fileOffset < capacityEnd) {
      capacityEnd = m.fileOffset;
    }
  }
  const capacityBytes = capacityEnd - macro.fileOffset;
  const capacitySteps = Math.floor(capacityBytes / 4);

  // Build the new command byte sequence
  const oldCmds = macro.commands.map(c => [c.byte0, c.byte1, c.byte2, c.byte3]);
  let newCmds: number[][];
  if (op === 'insert') {
    if (oldCmds.length + 1 > capacitySteps) return false;
    const NOP = [0x20, 0x00, 0x00, 0x00]; // opcode 0x20 = NOP
    newCmds = [...oldCmds.slice(0, stepIdx), NOP, ...oldCmds.slice(stepIdx)];
  } else if (op === 'duplicate') {
    if (oldCmds.length + 1 > capacitySteps) return false;
    const dup = oldCmds[stepIdx].slice();
    newCmds = [...oldCmds.slice(0, stepIdx + 1), dup, ...oldCmds.slice(stepIdx + 1)];
  } else {
    // delete — keep at least one command
    if (oldCmds.length <= 1) return false;
    newCmds = [...oldCmds.slice(0, stepIdx), ...oldCmds.slice(stepIdx + 1)];
  }

  // Write new bytes into tfmxFileData starting at macro.fileOffset.
  // Pad the unused trailing capacity with zeros so old data can't sneak in.
  const view = new Uint8Array(state.tfmxFileData);
  for (let i = 0; i < newCmds.length; i++) {
    const off = macro.fileOffset + i * 4;
    view[off]     = newCmds[i][0];
    view[off + 1] = newCmds[i][1];
    view[off + 2] = newCmds[i][2];
    view[off + 3] = newCmds[i][3];
  }
  // Zero out the bytes between the new end and the original end (or capacity end)
  const newEnd = macro.fileOffset + newCmds.length * 4;
  const oldEnd = macro.fileOffset + oldCmds.length * 4;
  const wipeEnd = Math.max(oldEnd, newEnd);
  for (let off = newEnd; off < wipeEnd; off++) view[off] = 0;

  // Rebuild the in-memory commands[] array from the new bytes
  macro.commands = newCmds.map((bytes, i) => {
    const [b0, b1, b2, b3] = bytes;
    return {
      step: i,
      raw: ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0,
      fileOffset: macro.fileOffset + i * 4,
      byte0: b0, byte1: b1, byte2: b2, byte3: b3,
      opcode: b0 & 0x3F,
      flags: b0 & 0xC0,
    };
  });
  macro.length = macro.commands.length;
  return true;
}

const clearNative = (state: any) => {
  state.furnaceNative = null;
  state.hivelyNative = null;
  state.hivelyFileData = null;
  state.klysNative = null;
  state.klysFileData = null;
  state.musiclineFileData = null;
  state.hivelyMeta = null;
  state.furnaceSubsongs = null;
  state.furnaceActiveSubsong = 0;
  state.channelTrackTables = null;
  state.channelSpeeds = null;
  state.channelGrooves = null;
  state.musiclineMetadata = null;
  state.musiclineKeyboardMode = 'mono';
  state.tfmxNative = null;
  state.tfmxSelectedPattern = 0;
};

export const useFormatStore = create<FormatStore>()(
  immer((set, get) => ({
    editorMode: 'classic' as EditorMode,
    furnaceNative: null,
    hivelyNative: null,
    hivelyFileData: null,
    klysNative: null,
    klysFileData: null,
    musiclineFileData: null,
    c64SidFileData: null,
    c64MemPatches: null,
    goatTrackerData: null,
    cheeseCutterFileData: null,
    jamCrackerFileData: null,
    futurePlayerFileData: null,
    preTrackerFileData: null,
    maFileData: null,
    hippelFileData: null,
    sonixFileData: null,
    pxtoneFileData: null,
    organyaFileData: null,
    eupFileData: null,
    ixsFileData: null,
    psycleFileData: null,
    sc68FileData: null,
    zxtuneFileData: null,
    pumaTrackerFileData: null,
    steveTurnerFileData: null,
    sidmon1WasmFileData: null,
    fredEditorWasmFileData: null,
    artOfNoiseFileData: null,
    startrekkerAMFileData: null,
    bdFileData: null,
    sd2FileData: null,
    symphonieFileData: null,
    uadeEditableFileData: null,
    adplugFileData: null,
    adplugFileName: null,
    adplugTicksPerRow: null,
    uadeCompanionFiles: null,
    uadePatternLayout: null,
    tfmxFileData: null,
    tfmxSmplData: null,
    uadeEditableFileName: null,
    tfmxTimingTable: null,
    tfmxNative: null,
    tfmxSelectedPattern: 0,
    uadeEditableSubsongs: null,
    uadeEditableCurrentSubsong: 0,
    libopenmptFileData: null,
    hivelyMeta: null,
    furnaceSubsongs: null,
    furnaceActiveSubsong: 0,
    channelTrackTables: null,
    channelSpeeds: null,
    channelGrooves: null,
    musiclineMetadata: null,
    musiclineKeyboardMode: 'mono',
    originalModuleData: null,
    songDBInfo: null,
    sidMetadata: null,
    hivelyUndoStack: [],
    hivelyRedoStack: [],

    setEditorMode: (mode) => set((state) => { state.editorMode = mode; }),
    setFurnaceNative: (data) => set((state) => { state.furnaceNative = data; }),
    setFurnaceOrderEntry: (channel, position, patternIndex) => set((state) => {
      if (!state.furnaceNative) return;
      const sub = state.furnaceNative.subsongs[state.furnaceNative.activeSubsong];
      if (!sub) return;
      if (channel < 0 || channel >= sub.orders.length) return;
      if (position < 0 || position >= sub.ordersLen) return;
      sub.orders[channel][position] = patternIndex;
    }),
    insertFurnaceOrderRow: (position) => set((state) => {
      if (!state.furnaceNative) return;
      const sub = state.furnaceNative.subsongs[state.furnaceNative.activeSubsong];
      if (!sub) return;
      if (sub.ordersLen >= 256) return; // Furnace max 256 orders
      // Insert a copy of the current row after the given position
      for (let ch = 0; ch < sub.orders.length; ch++) {
        const srcVal = sub.orders[ch][position] ?? 0;
        sub.orders[ch].splice(position + 1, 0, srcVal);
      }
      sub.ordersLen++;
    }),
    deleteFurnaceOrderRow: (position) => set((state) => {
      if (!state.furnaceNative) return;
      const sub = state.furnaceNative.subsongs[state.furnaceNative.activeSubsong];
      if (!sub) return;
      if (sub.ordersLen <= 1) return; // Keep at least 1
      for (let ch = 0; ch < sub.orders.length; ch++) {
        sub.orders[ch].splice(position, 1);
      }
      sub.ordersLen--;
    }),
    setHivelyNative: (data) => set((state) => { state.hivelyNative = data; state.hivelyUndoStack = []; state.hivelyRedoStack = []; }),
    setHivelyPositionCell: (pos, ch, field, value) => set((state) => {
      if (!state.hivelyNative) return;
      const p = state.hivelyNative.positions[pos];
      if (!p) return;
      if (field === 'track') {
        p.track[ch] = Math.max(0, Math.min(value, state.hivelyNative.tracks.length - 1));
      } else {
        p.transpose[ch] = Math.max(-128, Math.min(127, value));
      }
    }),
    insertHivelyPosition: (pos) => set((state) => {
      if (!state.hivelyNative) return;
      const positions = state.hivelyNative.positions;
      const ch = state.hivelyNative.channels;
      // Clone the current position or create blank
      const src = positions[pos];
      const newPos = src
        ? { track: [...src.track], transpose: [...src.transpose] }
        : { track: Array(ch).fill(0), transpose: Array(ch).fill(0) };
      positions.splice(pos + 1, 0, newPos);
    }),
    deleteHivelyPosition: (pos) => set((state) => {
      if (!state.hivelyNative) return;
      if (state.hivelyNative.positions.length <= 1) return; // Keep at least 1
      state.hivelyNative.positions.splice(pos, 1);
    }),
    setHivelyTrackStep: (trackIndex, stepIndex, update) => set((state) => {
      if (!state.hivelyNative) return;
      const track = state.hivelyNative.tracks[trackIndex];
      if (!track) return;
      const step = track.steps[stepIndex];
      if (!step) return;
      // Capture before state (plain copy from immer draft)
      const before: HivelyNativeStep = {
        note: step.note,
        instrument: step.instrument,
        fx: step.fx,
        fxParam: step.fxParam,
        fxb: step.fxb,
        fxbParam: step.fxbParam,
      };
      // Apply update
      if (update.note !== undefined) step.note = update.note;
      if (update.instrument !== undefined) step.instrument = update.instrument;
      if (update.fx !== undefined) step.fx = update.fx;
      if (update.fxParam !== undefined) step.fxParam = update.fxParam;
      if (update.fxb !== undefined) step.fxb = update.fxb;
      if (update.fxbParam !== undefined) step.fxbParam = update.fxbParam;
      // Capture after state
      const after: HivelyNativeStep = {
        note: step.note,
        instrument: step.instrument,
        fx: step.fx,
        fxParam: step.fxParam,
        fxb: step.fxb,
        fxbParam: step.fxbParam,
      };
      // Push undo entry
      state.hivelyUndoStack.push({
        trackIndex, stepIndex, before, after,
        description: 'Edit Hively track step',
        timestamp: Date.now(),
      });
      // Cap at 100 entries
      if (state.hivelyUndoStack.length > 100) {
        state.hivelyUndoStack.shift();
      }
      // Clear redo on new edit
      state.hivelyRedoStack = [];
    }),
    undoHivelyTrackStep: () => set((state) => {
      if (!state.hivelyNative || state.hivelyUndoStack.length === 0) return;
      const entry = state.hivelyUndoStack.pop()!;
      const track = state.hivelyNative.tracks[entry.trackIndex];
      if (!track) return;
      const step = track.steps[entry.stepIndex];
      if (!step) return;
      // Restore before state
      step.note = entry.before.note;
      step.instrument = entry.before.instrument;
      step.fx = entry.before.fx;
      step.fxParam = entry.before.fxParam;
      step.fxb = entry.before.fxb;
      step.fxbParam = entry.before.fxbParam;
      // Push to redo
      state.hivelyRedoStack.push(entry);
    }),
    redoHivelyTrackStep: () => set((state) => {
      if (!state.hivelyNative || state.hivelyRedoStack.length === 0) return;
      const entry = state.hivelyRedoStack.pop()!;
      const track = state.hivelyNative.tracks[entry.trackIndex];
      if (!track) return;
      const step = track.steps[entry.stepIndex];
      if (!step) return;
      // Restore after state
      step.note = entry.after.note;
      step.instrument = entry.after.instrument;
      step.fx = entry.after.fx;
      step.fxParam = entry.after.fxParam;
      step.fxb = entry.after.fxb;
      step.fxbParam = entry.after.fxbParam;
      // Push back to undo
      state.hivelyUndoStack.push(entry);
    }),
    canUndoHively: () => get().hivelyUndoStack.length > 0,
    canRedoHively: () => get().hivelyRedoStack.length > 0,
    insertHivelyTrackRow: (trackIndex, rowIndex) => set((state) => {
      if (!state.hivelyNative) return;
      const track = state.hivelyNative.tracks[trackIndex];
      if (!track) return;
      const emptyStep: HivelyNativeStep = { note: 0, instrument: 0, fx: 0, fxParam: 0, fxb: 0, fxbParam: 0 };
      // Insert empty row at rowIndex, shift everything down, drop last row
      track.steps.splice(rowIndex, 0, emptyStep);
      track.steps.length = state.hivelyNative.trackLength;
    }),
    deleteHivelyTrackRow: (trackIndex, rowIndex) => set((state) => {
      if (!state.hivelyNative) return;
      const track = state.hivelyNative.tracks[trackIndex];
      if (!track) return;
      const emptyStep: HivelyNativeStep = { note: 0, instrument: 0, fx: 0, fxParam: 0, fxb: 0, fxbParam: 0 };
      // Remove row at rowIndex, shift everything up, add empty row at bottom
      track.steps.splice(rowIndex, 1);
      track.steps.push(emptyStep);
    }),
    setKlysSequenceEntry: (channel, position, field, value) => set((state) => {
      if (!state.klysNative) return;
      const seq = state.klysNative.sequences[channel];
      if (!seq) return;
      const entry = seq.entries.find(e => e.position === position);
      if (!entry) {
        // Create a new entry at this position if it doesn't exist
        const newEntry = { position, pattern: 0, noteOffset: 0, [field]: value };
        seq.entries.push(newEntry);
        seq.entries.sort((a, b) => a.position - b.position);
        return;
      }
      if (field === 'pattern') {
        entry.pattern = Math.max(0, Math.min(value, state.klysNative.patterns.length - 1));
      } else {
        entry.noteOffset = Math.max(-128, Math.min(127, value));
      }
    }),
    insertKlysSequenceEntry: (position) => set((state) => {
      if (!state.klysNative) return;
      // Insert a new position: shift all entries at positions > position down by 1
      for (const seq of state.klysNative.sequences) {
        for (const entry of seq.entries) {
          if (entry.position > position) entry.position++;
        }
        // Clone the entry at the current position (or create blank) at position+1
        const src = seq.entries.find(e => e.position === position);
        const newEntry = src
          ? { position: position + 1, pattern: src.pattern, noteOffset: src.noteOffset }
          : { position: position + 1, pattern: 0, noteOffset: 0 };
        seq.entries.push(newEntry);
        seq.entries.sort((a, b) => a.position - b.position);
      }
      state.klysNative.songLength++;
    }),
    deleteKlysSequenceEntry: (position) => set((state) => {
      if (!state.klysNative) return;
      if (state.klysNative.songLength <= 1) return; // Keep at least 1
      for (const seq of state.klysNative.sequences) {
        // Remove entries at this position
        const idx = seq.entries.findIndex(e => e.position === position);
        if (idx >= 0) seq.entries.splice(idx, 1);
        // Shift entries after this position up by 1
        for (const entry of seq.entries) {
          if (entry.position > position) entry.position--;
        }
      }
      state.klysNative.songLength--;
    }),
    setMusicLineTrackEntry: (channel, position, patternIndex) => set((state) => {
      if (!state.channelTrackTables) return;
      if (channel < 0 || channel >= state.channelTrackTables.length) return;
      const track = state.channelTrackTables[channel];
      if (position < 0 || position >= track.length) return;
      track[position] = patternIndex;
    }),
    clearMusicLineTrackEntry: (channel, position) => set((state) => {
      if (!state.channelTrackTables) return;
      if (channel < 0 || channel >= state.channelTrackTables.length) return;
      const track = state.channelTrackTables[channel];
      if (position < 0 || position >= track.length) return;
      track[position] = 0;
    }),
    insertMusicLineTrackEntry: (channel, position) => set((state) => {
      if (!state.channelTrackTables) return;
      if (channel < 0 || channel >= state.channelTrackTables.length) return;
      const track = state.channelTrackTables[channel];
      if (position < 0 || position >= track.length) return;
      // Insert empty entry (0) at position, shift down, drop last
      track.splice(position, 0, 0);
      track.length = track.length - 1;
    }),
    deleteMusicLineTrackEntry: (channel, position) => set((state) => {
      if (!state.channelTrackTables) return;
      if (channel < 0 || channel >= state.channelTrackTables.length) return;
      const track = state.channelTrackTables[channel];
      if (position < 0 || position >= track.length) return;
      const len = track.length;
      // Remove entry at position, shift up, add empty at bottom
      track.splice(position, 1);
      track.push(0);
      // Ensure length stays the same (immer draft safety)
      track.length = len;
    }),
    insertMusicLineTrackEntryAllChannels: (position) => set((state) => {
      if (!state.channelTrackTables) return;
      for (const track of state.channelTrackTables) {
        if (position < 0 || position >= track.length) continue;
        track.splice(position, 0, 0);
        track.length = track.length - 1;
      }
    }),
    deleteMusicLineTrackEntryAllChannels: (position) => set((state) => {
      if (!state.channelTrackTables) return;
      for (const track of state.channelTrackTables) {
        if (position < 0 || position >= track.length) continue;
        const len = track.length;
        track.splice(position, 1);
        track.push(0);
        track.length = len;
      }
    }),
    removeUnusedMusicLineParts: () => {
      const state = get();
      const tables = state.channelTrackTables;
      if (!tables || tables.length === 0) return 0;

      // Dynamically import useTrackerStore to avoid circular dependency
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { useTrackerStore } = require('./useTrackerStore') as { useTrackerStore: { getState: () => { patterns: unknown[]; deletePattern: (idx: number) => void } } };
      const trackerState = useTrackerStore.getState();
      const totalPatterns = trackerState.patterns.length;
      if (totalPatterns === 0) return 0;

      // 1. Collect all referenced pattern indices from track tables
      const referenced = new Set<number>();
      for (const track of tables) {
        for (const entry of track) {
          // Skip special commands (bit 15 set) and empty sentinels
          if (entry & 0x8000) continue;
          if (entry === 0xFFFF) continue;
          referenced.add(entry);
        }
      }

      // 2. Find unused pattern indices
      const unused: number[] = [];
      for (let i = 0; i < totalPatterns; i++) {
        if (!referenced.has(i)) unused.push(i);
      }
      if (unused.length === 0) return 0;

      // Don't remove ALL patterns — keep at least one
      if (unused.length >= totalPatterns) return 0;

      // 3. Build old->new index map (accounting for removals)
      const indexMap = new Map<number, number>();
      const unusedSet = new Set(unused);
      let newIdx = 0;
      for (let oldIdx = 0; oldIdx < totalPatterns; oldIdx++) {
        if (!unusedSet.has(oldIdx)) {
          indexMap.set(oldIdx, newIdx);
          newIdx++;
        }
      }

      // 4. Update track tables — remap pattern indices
      set((draft) => {
        if (!draft.channelTrackTables) return;
        for (const track of draft.channelTrackTables) {
          for (let i = 0; i < track.length; i++) {
            const entry = track[i];
            if (entry & 0x8000) continue; // special command
            if (entry === 0xFFFF) continue; // empty
            const mapped = indexMap.get(entry);
            if (mapped !== undefined) {
              track[i] = mapped;
            }
          }
        }
      });

      // 5. Remove unused patterns from tracker store (highest index first to avoid shifting)
      for (let i = unused.length - 1; i >= 0; i--) {
        trackerState.deletePattern(unused[i]);
      }

      return unused.length;
    },
    toggleMusicLineKeyboardMode: () => set((state) => {
      state.musiclineKeyboardMode = state.musiclineKeyboardMode === 'mono' ? 'poly' : 'mono';
    }),
    setMusicLineMetadataField: (field, value) => set((state) => {
      if (!state.musiclineMetadata) {
        state.musiclineMetadata = { title: '', author: '', date: '', duration: '', infoText: ['', '', '', '', ''] };
      }
      if (field === 'title') state.musiclineMetadata.title = value;
      else if (field === 'author') state.musiclineMetadata.author = value;
      else if (field === 'date') state.musiclineMetadata.date = value;
      else if (field === 'duration') state.musiclineMetadata.duration = value;
      else if (field.startsWith('info')) {
        const idx = parseInt(field.replace('info', ''), 10);
        if (idx >= 0 && idx < 5) state.musiclineMetadata.infoText[idx] = value;
      }
    }),
    setSongDBInfo: (info) => set((state) => { state.songDBInfo = info; }),
    setSidMetadata: (info) => set((state) => { state.sidMetadata = info; }),
    setOriginalModuleData: (data) => set((state) => { state.originalModuleData = data; }),

    applyEditorMode: (song) => {
      useEditorStore.getState().setLinearPeriods(song.linearPeriods ?? false);
      // Clear automation capture data from previous song
      import('../engine/automation/AutomationCapture').then(m => m.getAutomationCapture().clear());
      let newEditorMode: EditorMode = 'classic';
      set((state) => {
        state.c64SidFileData = song.c64SidFileData ?? null;
        state.c64MemPatches = (song as any).c64MemPatches ?? null;
        state.goatTrackerData = song.goatTrackerData ?? null;
        state.cheeseCutterFileData = (song as any).cheeseCutterFileData ?? null;
        state.jamCrackerFileData = song.jamCrackerFileData ?? null;
        state.futurePlayerFileData = song.futurePlayerFileData ?? null;
        state.preTrackerFileData = song.preTrackerFileData ?? null;
        state.maFileData = song.maFileData ?? null;
        state.hippelFileData = song.hippelFileData ?? null;
        state.sonixFileData = song.sonixFileData ?? null;
        state.pxtoneFileData = song.pxtoneFileData ?? null;
        state.organyaFileData = song.organyaFileData ?? null;
        state.eupFileData = song.eupFileData ?? null;
        state.ixsFileData = song.ixsFileData ?? null;
        state.psycleFileData = song.psycleFileData ?? null;
        state.sc68FileData = song.sc68FileData ?? null;
        state.zxtuneFileData = song.zxtuneFileData ?? null;
        state.pumaTrackerFileData = (song as any).pumaTrackerFileData ?? null;
        state.steveTurnerFileData = (song as any).steveTurnerFileData ?? null;
        state.sidmon1WasmFileData = (song as any).sidmon1WasmFileData ?? null;
        state.fredEditorWasmFileData = (song as any).fredEditorWasmFileData ?? null;
        state.artOfNoiseFileData = (song as any).artOfNoiseFileData ?? null;
        state.startrekkerAMFileData = (song as any).startrekkerAMFileData ?? null;
        state.bdFileData = (song as any).bdFileData ?? null;
        state.sd2FileData = (song as any).sd2FileData ?? null;
        state.symphonieFileData = (song as any).symphonieFileData ?? null;
        state.uadeEditableFileData = (song as any).uadeEditableFileData ?? null;
        state.uadeEditableFileName = (song as any).uadeEditableFileName ?? null;
        state.adplugFileData = (song as any).adplugFileData ?? null;
        state.adplugFileName = (song as any).adplugFileName ?? null;
        state.adplugTicksPerRow = (song as any).adplugTicksPerRow ?? null;
        state.uadeCompanionFiles = (song as any).uadeCompanionFiles ?? null;
        state.uadePatternLayout = (song as any).uadePatternLayout ?? null;
        state.tfmxFileData = (song as any).tfmxFileData ?? null;
        state.tfmxSmplData = (song as any).tfmxSmplData ?? null;
        state.tfmxTimingTable = (song as any).tfmxTimingTable ?? null;
        state.uadeEditableSubsongs = (song as any).uadeEditableSubsongs ?? null;
        state.uadeEditableCurrentSubsong = 0;
        state.libopenmptFileData = (song as any).libopenmptFileData ?? null;
        if (song.furnaceNative) {
          newEditorMode = 'furnace';
          state.editorMode = 'furnace';
          clearNative(state);
          state.furnaceNative = song.furnaceNative;
          state.furnaceSubsongs = song.furnaceSubsongs ?? null;
          state.furnaceActiveSubsong = song.furnaceActiveSubsong ?? 0;
        } else if (song.hivelyNative) {
          newEditorMode = 'hively';
          state.editorMode = 'hively';
          clearNative(state);
          state.hivelyNative = song.hivelyNative;
          state.hivelyFileData = song.hivelyFileData ?? null;
          state.hivelyMeta = song.hivelyMeta ?? null;
        } else if (song.klysNative) {
          newEditorMode = 'klystrack';
          state.editorMode = 'klystrack';
          clearNative(state);
          state.klysNative = song.klysNative;
          state.klysFileData = song.klysFileData ?? null;
        } else if (song.tfmxNative) {
          newEditorMode = 'tfmx';
          state.editorMode = 'tfmx';
          clearNative(state);
          state.tfmxNative = song.tfmxNative;
          state.tfmxSelectedPattern = 0;
        } else if (song.channelTrackTables) {
          newEditorMode = 'musicline';
          state.editorMode = 'musicline';
          clearNative(state);
          state.musiclineFileData = song.musiclineFileData ?? null;
          state.channelTrackTables = song.channelTrackTables;
          state.channelSpeeds = song.channelSpeeds ?? null;
          state.channelGrooves = song.channelGrooves ?? null;
          state.musiclineMetadata = song.musiclineMetadata ?? null;
        } else if (song.jamCrackerFileData) {
          newEditorMode = 'jamcracker';
          state.editorMode = 'jamcracker';
          clearNative(state);
        } else if (song.sf2StoreData) {
          newEditorMode = 'sidfactory2';
          state.editorMode = 'sidfactory2';
          clearNative(state);
        } else if (song.goatTrackerData) {
          newEditorMode = 'goattracker';
          state.editorMode = 'goattracker';
          clearNative(state);
        } else if (song.cheeseCutterStoreData) {
          newEditorMode = 'cheesecutter';
          state.editorMode = 'cheesecutter';
          clearNative(state);
        } else if (song.sc68FileData) {
          newEditorMode = 'sc68';
          state.editorMode = 'sc68';
          clearNative(state);
        } else {
          state.editorMode = 'classic';
        }
      });
      // Ensure the tracker window is in tracker sub-view for all custom editor
      // modes — they render inside viewMode === 'tracker'. Without this, loading
      // a GoatTracker file while on 'grid' or 'pianoroll' would leave the custom
      // editor invisible until the user manually switched views.
      if (newEditorMode !== 'classic') {
        useUIStore.getState().setTrackerViewMode('tracker');
      }
      // Populate SF2 store when SF2 format is detected
      if (song.sf2StoreData) {
        useSF2Store.getState().loadSF2Data(song.sf2StoreData);
      }
      // Populate CheeseCutter store when CheeseCutter format is detected
      if (song.cheeseCutterStoreData) {
        useCheeseCutterStore.getState().loadData(song.cheeseCutterStoreData);
      }
    },

    setFurnaceActiveSubsong: (index) => set((state) => { state.furnaceActiveSubsong = index; }),

    // TFMX mutations
    setTFMXNative: (data) => set((state) => { state.tfmxNative = data; }),
    setTFMXSelectedPattern: (idx) => set((state) => { state.tfmxSelectedPattern = idx; }),
    setTFMXTrackstepVoice: (stepIdx, voiceIdx, patNum, transpose) => set((state) => {
      if (!state.tfmxNative) return;
      const step = state.tfmxNative.tracksteps.find(s => s.stepIndex === stepIdx);
      if (!step || step.isEFFE || voiceIdx >= step.voices.length) return;
      const voice = step.voices[voiceIdx];
      voice.patternNum = patNum;
      voice.transpose = transpose;
      voice.isHold = false;
      voice.isStop = patNum < 0;
    }),
    insertTFMXTrackstep: (idx) => set((state) => {
      if (!state.tfmxNative) return;
      const steps = state.tfmxNative.tracksteps;
      if (idx < 0 || idx >= steps.length) return;
      // Clone the current step
      const src = steps[idx];
      const clone: typeof src = {
        stepIndex: src.stepIndex,
        voices: src.voices.map(v => ({ ...v })),
        isEFFE: src.isEFFE,
        effeCommand: src.effeCommand,
        effeParam: src.effeParam,
      };
      steps.splice(idx + 1, 0, clone);
      // Renumber step indices
      for (let i = 0; i < steps.length; i++) steps[i].stepIndex = state.tfmxNative.firstStep + i;
      state.tfmxNative.lastStep = state.tfmxNative.firstStep + steps.length - 1;
    }),
    deleteTFMXTrackstep: (idx) => set((state) => {
      if (!state.tfmxNative) return;
      const steps = state.tfmxNative.tracksteps;
      if (idx < 0 || idx >= steps.length || steps.length <= 1) return;
      steps.splice(idx, 1);
      for (let i = 0; i < steps.length; i++) steps[i].stepIndex = state.tfmxNative.firstStep + i;
      state.tfmxNative.lastStep = state.tfmxNative.firstStep + steps.length - 1;
    }),
    setTFMXPatternCommand: (patIdx, rowIdx, field, value) => set((state) => {
      if (!state.tfmxNative) return;
      const pat = state.tfmxNative.patterns[patIdx];
      if (!pat || rowIdx < 0 || rowIdx >= pat.length) return;
      const cmd = pat[rowIdx];
      if (field === 'note') cmd.note = value;
      else if (field === 'macro') cmd.macro = value;
      else if (field === 'wait') cmd.wait = value;
      else if (field === 'detune') cmd.detune = value;
    }),

    setTFMXMacroByte: (macroIdx, stepIdx, byteIdx, value) => set((state) => {
      if (!state.tfmxNative) return;
      const macro = state.tfmxNative.macros[macroIdx];
      if (!macro) return;
      const cmd = macro.commands[stepIdx];
      if (!cmd) return;
      const v = value & 0xFF;
      if (byteIdx === 0) cmd.byte0 = v;
      else if (byteIdx === 1) cmd.byte1 = v;
      else if (byteIdx === 2) cmd.byte2 = v;
      else cmd.byte3 = v;
      cmd.raw = ((cmd.byte0 << 24) | (cmd.byte1 << 16) | (cmd.byte2 << 8) | cmd.byte3) >>> 0;
      cmd.opcode = cmd.byte0 & 0x3F;
      cmd.flags = cmd.byte0 & 0xC0;
      // Patch tfmxFileData buffer in place
      if (state.tfmxFileData) {
        const view = new Uint8Array(state.tfmxFileData);
        const off = cmd.fileOffset + byteIdx;
        if (off >= 0 && off < view.length) view[off] = v;
      }
    }),

    setTFMXMacroCommand: (macroIdx, stepIdx, b0, b1, b2, b3) => set((state) => {
      if (!state.tfmxNative) return;
      const macro = state.tfmxNative.macros[macroIdx];
      if (!macro) return;
      const cmd = macro.commands[stepIdx];
      if (!cmd) return;
      cmd.byte0 = b0 & 0xFF;
      cmd.byte1 = b1 & 0xFF;
      cmd.byte2 = b2 & 0xFF;
      cmd.byte3 = b3 & 0xFF;
      cmd.raw = ((cmd.byte0 << 24) | (cmd.byte1 << 16) | (cmd.byte2 << 8) | cmd.byte3) >>> 0;
      cmd.opcode = cmd.byte0 & 0x3F;
      cmd.flags = cmd.byte0 & 0xC0;
      if (state.tfmxFileData) {
        const view = new Uint8Array(state.tfmxFileData);
        const off = cmd.fileOffset;
        if (off >= 0 && off + 4 <= view.length) {
          view[off] = cmd.byte0;
          view[off + 1] = cmd.byte1;
          view[off + 2] = cmd.byte2;
          view[off + 3] = cmd.byte3;
        }
      }
    }),

    // ── Macro structural mutations (insert / delete / duplicate) ─────────────
    //
    // These operate within the macro's existing in-file capacity (the bytes
    // between this macro's start and the next macro's start). For insert &
    // duplicate the macro grows by 1 command — we refuse if there's no room.
    // For delete we shrink by 1 and pad the trailing slot with a NOP/Stop.
    //
    // The bytes are written directly into tfmxFileData so the existing
    // reloadModule() path picks them up; the in-memory commands[] array is
    // rebuilt from the patched bytes to keep fileOffsets correct.
    insertTFMXMacroStep: (macroIdx, stepIdx) => {
      let ok = false;
      set((state) => {
        ok = restructureTFMXMacro(state, macroIdx, stepIdx, 'insert');
      });
      return ok;
    },
    deleteTFMXMacroStep: (macroIdx, stepIdx) => {
      let ok = false;
      set((state) => {
        ok = restructureTFMXMacro(state, macroIdx, stepIdx, 'delete');
      });
      return ok;
    },
    duplicateTFMXMacroStep: (macroIdx, stepIdx) => {
      let ok = false;
      set((state) => {
        ok = restructureTFMXMacro(state, macroIdx, stepIdx, 'duplicate');
      });
      return ok;
    },

    reset: () => set((state) => {
      state.editorMode = 'classic';
      clearNative(state);
      state.c64SidFileData = null;
      state.c64MemPatches = null;
      state.goatTrackerData = null;
      state.cheeseCutterFileData = null;
      state.jamCrackerFileData = null;
      state.futurePlayerFileData = null;
      state.preTrackerFileData = null;
      state.maFileData = null;
      state.hippelFileData = null;
      state.sonixFileData = null;
      state.pxtoneFileData = null;
      state.organyaFileData = null;
      state.eupFileData = null;
      state.ixsFileData = null;
      state.psycleFileData = null;
      state.sc68FileData = null;
      state.zxtuneFileData = null;
      state.pumaTrackerFileData = null;
      state.steveTurnerFileData = null;
      state.sidmon1WasmFileData = null;
      state.fredEditorWasmFileData = null;
      state.artOfNoiseFileData = null;
      state.startrekkerAMFileData = null;
      state.bdFileData = null;
      state.sd2FileData = null;
      state.symphonieFileData = null;
      state.uadeEditableFileData = null;
      state.uadeEditableFileName = null;
      state.adplugFileData = null;
      state.adplugFileName = null;
      state.adplugTicksPerRow = null;
      state.uadeCompanionFiles = null;
      state.uadePatternLayout = null;
      state.tfmxFileData = null;
      state.tfmxSmplData = null;
      state.tfmxTimingTable = null;
      state.tfmxNative = null;
      state.tfmxSelectedPattern = 0;
      state.uadeEditableSubsongs = null;
      state.uadeEditableCurrentSubsong = 0;
      state.libopenmptFileData = null;
      state.originalModuleData = null;
      state.songDBInfo = null;
      state.sidMetadata = null;
    }),
  }))
);
