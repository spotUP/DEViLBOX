/**
 * useSF2Store — Zustand store for SID Factory II tracker state.
 *
 * Manages the complete SF2 song state including driver info, sequences,
 * order lists, instrument data, and driver-defined tables.
 * Both DOM (SF2View) and Pixi (PixiSF2View) consume this store via
 * the shared useSF2FormatData hook.
 *
 * Unlike GT Ultra which reads data from WASM heap, SF2 data lives entirely
 * in this store (parsed from the .sf2 file at load time). Edits mutate
 * the store, then the engine rebuilds the PSID for audio.
 */

import { create } from 'zustand';
import { exportSF2File as _exportSF2File } from '@/engine/sf2/SF2Engine';

// ── Driver info parsed from header blocks ────────────────────────────────

export interface SF2Descriptor {
  driverType: number;
  driverSize: number;
  driverName: string;
  codeTop: number;
  codeSize: number;
  versionMajor: number;
  versionMinor: number;
}

export interface SF2DriverCommon {
  initAddress: number;
  stopAddress: number;
  updateAddress: number;
  sidChannelOffsetAddress: number;
  driverStateAddress: number;
  tickCounterAddress: number;
  orderListIndexAddress: number;
  sequenceIndexAddress: number;
  sequenceInUseAddress: number;
  currentSequenceAddress: number;
  currentTransposeAddress: number;
  currentSeqEventDurationAddress: number;
  nextInstrumentAddress: number;
  nextCommandAddress: number;
  nextNoteAddress: number;
  nextNoteIsTiedAddress: number;
  tempoCounterAddress: number;
  triggerSyncAddress: number;
  noteEventTriggerSyncValue: number;
}

export interface SF2TableDef {
  type: number;      // 0x00=generic, 0x80=instruments, 0x81=commands
  id: number;
  name: string;
  address: number;
  columnCount: number;
  rowCount: number;
}

export interface SF2MusicData {
  trackCount: number;
  orderListPtrsLo: number;
  orderListPtrsHi: number;
  sequenceCount: number;
  sequencePtrsLo: number;
  sequencePtrsHi: number;
  orderListSize: number;
  orderListTrack1: number;
  sequenceSize: number;
  sequence00Addr: number;
}

// ── Sequence event (expanded from packed format) ─────────────────────────

export interface SF2SeqEvent {
  note: number;      // 0=rest, 1-111=note, 0x7E=tie/hold
  instrument: number; // 0=no change, 1-31=instrument, 0x80=empty (duration row), 0x90=tie
  command: number;    // 0=no command, 1-63=command, 0x80=empty (duration row)
}

// ── Order list entry ─────────────────────────────────────────────────────

export interface SF2OrderEntry {
  transpose: number;  // raw transposition byte (0x80-0xFD)
  seqIdx: number;     // sequence index (0-127)
}

export interface SF2OrderList {
  entries: SF2OrderEntry[];
  loopIndex: number;  // index to loop back to (for 0xFF marker)
  hasLoop: boolean;   // true if 0xFF terminator, false if 0xFE
}

// ── Instrument data ──────────────────────────────────────────────────────

export interface SF2InstrumentData {
  rawBytes: Uint8Array; // raw instrument bytes from driver table
  name: string;
}

// ── Editor cursor ────────────────────────────────────────────────────────

export interface SF2EditorCursor {
  channel: number;   // 0-2 (or more for multi-SID)
  row: number;
  column: number;    // 0=note, 1=instrument, 2=command
  digit: number;     // 0 or 1 for hex editing
}

export interface SF2PlaybackPosition {
  row: number;
  songPos: number;   // order list position
}

// ── Store state ──────────────────────────────────────────────────────────

export interface SF2StoreState {
  // Loaded flag
  loaded: boolean;

  // Raw file data (for export / PSID rebuild)
  rawFileData: Uint8Array | null;
  loadAddress: number;

  // Driver info from header blocks
  descriptor: SF2Descriptor | null;
  driverCommon: SF2DriverCommon | null;
  musicData: SF2MusicData | null;
  tableDefs: SF2TableDef[];
  instrumentDescriptions: string[];

  // C64 memory image (for table/instrument data access)
  c64Memory: Uint8Array;

  // Sequences (expanded events per sequence index)
  sequences: Map<number, SF2SeqEvent[]>;

  // Order lists per track
  orderLists: SF2OrderList[];

  // Instruments (raw bytes + name)
  instruments: SF2InstrumentData[];

  // Song metadata
  songName: string;
  trackCount: number;

  // Editor state
  cursor: SF2EditorCursor;
  currentInstrument: number;
  currentOctave: number;
  editStep: number;

  // Playback
  playing: boolean;
  followPlay: boolean;
  playbackPos: SF2PlaybackPosition;

  // Order list cursor
  orderCursor: number;

  // Clipboard
  clipboard: SF2SeqEvent[] | null;

  // Undo/redo
  undoStack: SF2UndoEntry[];
  redoStack: SF2UndoEntry[];

  // Channel mute state
  channelMutes: boolean[];

  // Block selection (mark)
  markStart: number | null;  // null = no mark active
  markEnd: number | null;

  // ── Actions ────────────────────────────────────────────────────────────

  /** Load parsed SF2 data into the store */
  loadSF2Data: (data: SF2LoadPayload) => void;

  /** Clear all data */
  reset: () => void;

  // Cursor
  setCursor: (patch: Partial<SF2EditorCursor>) => void;
  setCurrentInstrument: (inst: number) => void;
  setCurrentOctave: (oct: number) => void;
  setEditStep: (step: number) => void;

  // Playback
  setPlaying: (playing: boolean) => void;
  setFollowPlay: (follow: boolean) => void;
  updatePlaybackPos: (pos: Partial<SF2PlaybackPosition>) => void;

  // Order list
  setOrderCursor: (idx: number) => void;
  setOrderEntry: (track: number, pos: number, entry: Partial<SF2OrderEntry>) => void;
  insertOrderEntry: (track: number, pos: number) => void;
  deleteOrderEntry: (track: number, pos: number) => void;

  // Sequence editing
  setSequenceCell: (seqIdx: number, row: number, field: keyof SF2SeqEvent, value: number) => void;
  insertRow: (seqIdx: number, row: number) => void;
  deleteRow: (seqIdx: number, row: number) => void;
  eraseEvent: (seqIdx: number, row: number) => void;
  eraseEventLine: (seqIdx: number, row: number) => void;

  // Block operations
  copyBlock: (seqIdx: number, fromRow: number, toRow: number) => void;
  cutBlock: (seqIdx: number, fromRow: number, toRow: number) => void;
  pasteBlock: (seqIdx: number, atRow: number) => void;
  transposeBlock: (seqIdx: number, fromRow: number, toRow: number, semitones: number) => void;

  // Mark block
  setMark: (start: number | null, end: number | null) => void;
  clearMark: () => void;

  // Sequence management
  duplicateSequence: (track: number, orderPos: number) => void;
  splitSequenceAtRow: (track: number, orderPos: number, atRow: number) => void;
  insertFirstFreeSequence: (track: number, orderPos: number) => void;
  setOrderLoopPoint: (track: number, loopIndex: number) => void;
  setAllOrderLoopPoints: (loopIndex: number) => void;

  // Instrument editing
  setInstrumentByte: (instIdx: number, byteOffset: number, value: number) => void;

  // Table editing
  setTableByte: (tableDef: SF2TableDef, row: number, col: number, value: number) => void;

  // Channel mute
  toggleChannelMute: (channel: number) => void;
  soloChannel: (channel: number) => void;
  unmuteAll: () => void;

  // Undo/redo
  undo: () => void;
  redo: () => void;

  // Export
  exportSF2File: () => Uint8Array | null;
}

export interface SF2LoadPayload {
  rawFileData: Uint8Array;
  loadAddress: number;
  descriptor: SF2Descriptor;
  driverCommon: SF2DriverCommon;
  musicData: SF2MusicData;
  tableDefs: SF2TableDef[];
  instrumentDescriptions: string[];
  c64Memory: Uint8Array;
  sequences: Map<number, SF2SeqEvent[]>;
  orderLists: SF2OrderList[];
  instruments: SF2InstrumentData[];
  songName: string;
}

// ── Undo/redo entry ──────────────────────────────────────────────────────

interface SF2UndoEntry {
  type: 'sequence' | 'orderList' | 'instrument' | 'table';
  /** Sequence index or track index */
  key: number;
  /** Snapshot of the data before the edit */
  before: SF2SeqEvent[] | SF2OrderList | Uint8Array;
}

const MAX_UNDO = 100;

const EMPTY_EVENT: SF2SeqEvent = { note: 0, instrument: 0x80, command: 0x80 };

// ── Initial state ────────────────────────────────────────────────────────

const INITIAL_CURSOR: SF2EditorCursor = { channel: 0, row: 0, column: 0, digit: 0 };

export const useSF2Store = create<SF2StoreState>((set, get) => ({
  loaded: false,
  rawFileData: null,
  loadAddress: 0,
  descriptor: null,
  driverCommon: null,
  musicData: null,
  tableDefs: [],
  instrumentDescriptions: [],
  c64Memory: new Uint8Array(0x10000),
  sequences: new Map(),
  orderLists: [],
  instruments: [],
  songName: '',
  trackCount: 3,

  cursor: { ...INITIAL_CURSOR },
  currentInstrument: 1,
  currentOctave: 4,
  editStep: 1,

  playing: false,
  followPlay: true,
  playbackPos: { row: 0, songPos: 0 },
  orderCursor: 0,
  clipboard: null,
  undoStack: [],
  redoStack: [],
  channelMutes: [],
  markStart: null,
  markEnd: null,

  // ── Load ───────────────────────────────────────────────────────────────

  loadSF2Data: (data) => set({
    loaded: true,
    rawFileData: data.rawFileData,
    loadAddress: data.loadAddress,
    descriptor: data.descriptor,
    driverCommon: data.driverCommon,
    musicData: data.musicData,
    tableDefs: data.tableDefs,
    instrumentDescriptions: data.instrumentDescriptions,
    c64Memory: data.c64Memory,
    sequences: data.sequences,
    orderLists: data.orderLists,
    instruments: data.instruments,
    songName: data.songName,
    trackCount: data.musicData.trackCount,
    cursor: { ...INITIAL_CURSOR },
    playbackPos: { row: 0, songPos: 0 },
    orderCursor: 0,
    clipboard: null,
    undoStack: [],
    redoStack: [],
    channelMutes: new Array(data.musicData.trackCount).fill(false),
    markStart: null,
    markEnd: null,
  }),

  reset: () => set({
    loaded: false,
    rawFileData: null,
    loadAddress: 0,
    descriptor: null,
    driverCommon: null,
    musicData: null,
    tableDefs: [],
    instrumentDescriptions: [],
    c64Memory: new Uint8Array(0x10000),
    sequences: new Map(),
    orderLists: [],
    instruments: [],
    songName: '',
    trackCount: 3,
    cursor: { ...INITIAL_CURSOR },
    playbackPos: { row: 0, songPos: 0 },
    orderCursor: 0,
    playing: false,
    clipboard: null,
    undoStack: [],
    redoStack: [],
    channelMutes: [],
    markStart: null,
    markEnd: null,
  }),

  // ── Cursor ─────────────────────────────────────────────────────────────

  setCursor: (patch) => set((s) => ({ cursor: { ...s.cursor, ...patch } })),
  setCurrentInstrument: (inst) => set({ currentInstrument: inst }),
  setCurrentOctave: (oct) => set({ currentOctave: Math.max(0, Math.min(7, oct)) }),
  setEditStep: (step) => set({ editStep: Math.max(0, Math.min(16, step)) }),

  // ── Playback ───────────────────────────────────────────────────────────

  setPlaying: (playing) => set({ playing }),
  setFollowPlay: (follow) => set({ followPlay: follow }),
  updatePlaybackPos: (pos) => set((s) => ({
    playbackPos: { ...s.playbackPos, ...pos },
  })),

  // ── Order list ─────────────────────────────────────────────────────────

  setOrderCursor: (idx) => set({ orderCursor: idx }),

  setOrderEntry: (track, pos, entry) => set((s) => {
    const lists = [...s.orderLists];
    if (track >= lists.length) return {};
    const ol = { ...lists[track], entries: [...lists[track].entries] };
    if (pos < ol.entries.length) {
      ol.entries[pos] = { ...ol.entries[pos], ...entry };
    }
    lists[track] = ol;
    return { orderLists: lists, redoStack: [] };
  }),

  insertOrderEntry: (track, pos) => set((s) => {
    const lists = [...s.orderLists];
    if (track >= lists.length) return {};
    const ol = { ...lists[track], entries: [...lists[track].entries] };
    const newEntry: SF2OrderEntry = { transpose: 0x80, seqIdx: 0 };
    ol.entries.splice(pos, 0, newEntry);
    lists[track] = ol;
    return { orderLists: lists, redoStack: [] };
  }),

  deleteOrderEntry: (track, pos) => set((s) => {
    const lists = [...s.orderLists];
    if (track >= lists.length) return {};
    const ol = { ...lists[track], entries: [...lists[track].entries] };
    if (pos >= ol.entries.length || ol.entries.length <= 1) return {};
    ol.entries.splice(pos, 1);
    if (ol.loopIndex >= ol.entries.length) ol.loopIndex = ol.entries.length - 1;
    lists[track] = ol;
    return { orderLists: lists, redoStack: [] };
  }),

  // ── Sequence editing ───────────────────────────────────────────────────

  setSequenceCell: (seqIdx, row, field, value) => set((s) => {
    const seqs = new Map(s.sequences);
    const seq = seqs.get(seqIdx);
    if (!seq || row >= seq.length) return {};
    // Snapshot for undo
    const undoEntry: SF2UndoEntry = { type: 'sequence', key: seqIdx, before: [...seq.map(e => ({ ...e }))] };
    const newSeq = [...seq];
    newSeq[row] = { ...newSeq[row], [field]: value };
    seqs.set(seqIdx, newSeq);
    return {
      sequences: seqs,
      undoStack: [...s.undoStack.slice(-(MAX_UNDO - 1)), undoEntry],
      redoStack: [],
    };
  }),

  insertRow: (seqIdx, row) => set((s) => {
    const seqs = new Map(s.sequences);
    const seq = seqs.get(seqIdx);
    if (!seq) return {};
    const undoEntry: SF2UndoEntry = { type: 'sequence', key: seqIdx, before: [...seq.map(e => ({ ...e }))] };
    const newSeq = [...seq];
    newSeq.splice(row, 0, { ...EMPTY_EVENT });
    seqs.set(seqIdx, newSeq);
    return {
      sequences: seqs,
      undoStack: [...s.undoStack.slice(-(MAX_UNDO - 1)), undoEntry],
      redoStack: [],
    };
  }),

  deleteRow: (seqIdx, row) => set((s) => {
    const seqs = new Map(s.sequences);
    const seq = seqs.get(seqIdx);
    if (!seq || seq.length <= 1 || row >= seq.length) return {};
    const undoEntry: SF2UndoEntry = { type: 'sequence', key: seqIdx, before: [...seq.map(e => ({ ...e }))] };
    const newSeq = [...seq];
    newSeq.splice(row, 1);
    seqs.set(seqIdx, newSeq);
    return {
      sequences: seqs,
      undoStack: [...s.undoStack.slice(-(MAX_UNDO - 1)), undoEntry],
      redoStack: [],
    };
  }),

  eraseEvent: (seqIdx, row) => set((s) => {
    const seqs = new Map(s.sequences);
    const seq = seqs.get(seqIdx);
    if (!seq || row >= seq.length) return {};
    const undoEntry: SF2UndoEntry = { type: 'sequence', key: seqIdx, before: [...seq.map(e => ({ ...e }))] };
    const newSeq = [...seq];
    newSeq[row] = { note: 0, instrument: 0x80, command: 0x80 };
    seqs.set(seqIdx, newSeq);
    return {
      sequences: seqs,
      undoStack: [...s.undoStack.slice(-(MAX_UNDO - 1)), undoEntry],
      redoStack: [],
    };
  }),

  eraseEventLine: (seqIdx, row) => set((s) => {
    const seqs = new Map(s.sequences);
    const seq = seqs.get(seqIdx);
    if (!seq || row >= seq.length) return {};
    const undoEntry: SF2UndoEntry = { type: 'sequence', key: seqIdx, before: [...seq.map(e => ({ ...e }))] };
    const newSeq = [...seq];
    // Erase all fields on this row across all columns
    newSeq[row] = { note: 0, instrument: 0x80, command: 0x80 };
    seqs.set(seqIdx, newSeq);
    return {
      sequences: seqs,
      undoStack: [...s.undoStack.slice(-(MAX_UNDO - 1)), undoEntry],
      redoStack: [],
    };
  }),

  // ── Block operations (clipboard, transpose) ────────────────────────────

  copyBlock: (seqIdx, fromRow, toRow) => set((s) => {
    const seq = s.sequences.get(seqIdx);
    if (!seq) return {};
    const from = Math.max(0, Math.min(fromRow, toRow));
    const to = Math.min(seq.length - 1, Math.max(fromRow, toRow));
    const clipboard = seq.slice(from, to + 1).map(e => ({ ...e }));
    return { clipboard };
  }),

  cutBlock: (seqIdx, fromRow, toRow) => set((s) => {
    const seqs = new Map(s.sequences);
    const seq = seqs.get(seqIdx);
    if (!seq) return {};
    const from = Math.max(0, Math.min(fromRow, toRow));
    const to = Math.min(seq.length - 1, Math.max(fromRow, toRow));
    const undoEntry: SF2UndoEntry = { type: 'sequence', key: seqIdx, before: [...seq.map(e => ({ ...e }))] };
    const clipboard = seq.slice(from, to + 1).map(e => ({ ...e }));
    const newSeq = [...seq];
    // Replace cut region with empty events (don't shrink — matches original SF2 behavior)
    for (let i = from; i <= to; i++) {
      newSeq[i] = { ...EMPTY_EVENT };
    }
    seqs.set(seqIdx, newSeq);
    return {
      clipboard,
      sequences: seqs,
      undoStack: [...s.undoStack.slice(-(MAX_UNDO - 1)), undoEntry],
      redoStack: [],
    };
  }),

  pasteBlock: (seqIdx, atRow) => set((s) => {
    if (!s.clipboard || s.clipboard.length === 0) return {};
    const seqs = new Map(s.sequences);
    const seq = seqs.get(seqIdx);
    if (!seq) return {};
    const undoEntry: SF2UndoEntry = { type: 'sequence', key: seqIdx, before: [...seq.map(e => ({ ...e }))] };
    const newSeq = [...seq];
    // Overwrite from atRow, extending if necessary
    for (let i = 0; i < s.clipboard.length; i++) {
      const targetRow = atRow + i;
      if (targetRow < newSeq.length) {
        newSeq[targetRow] = { ...s.clipboard[i] };
      } else {
        newSeq.push({ ...s.clipboard[i] });
      }
    }
    seqs.set(seqIdx, newSeq);
    return {
      sequences: seqs,
      undoStack: [...s.undoStack.slice(-(MAX_UNDO - 1)), undoEntry],
      redoStack: [],
    };
  }),

  transposeBlock: (seqIdx, fromRow, toRow, semitones) => set((s) => {
    const seqs = new Map(s.sequences);
    const seq = seqs.get(seqIdx);
    if (!seq) return {};
    const from = Math.max(0, Math.min(fromRow, toRow));
    const to = Math.min(seq.length - 1, Math.max(fromRow, toRow));
    const undoEntry: SF2UndoEntry = { type: 'sequence', key: seqIdx, before: [...seq.map(e => ({ ...e }))] };
    const newSeq = [...seq];
    for (let i = from; i <= to; i++) {
      const note = newSeq[i].note;
      // Only transpose actual notes (1-111), skip rest(0), tie(0x7E), markers
      if (note >= 1 && note <= 111) {
        newSeq[i] = { ...newSeq[i], note: Math.max(1, Math.min(111, note + semitones)) };
      }
    }
    seqs.set(seqIdx, newSeq);
    return {
      sequences: seqs,
      undoStack: [...s.undoStack.slice(-(MAX_UNDO - 1)), undoEntry],
      redoStack: [],
    };
  }),

  // ── Mark block ─────────────────────────────────────────────────────────

  setMark: (start, end) => set({ markStart: start, markEnd: end }),
  clearMark: () => set({ markStart: null, markEnd: null }),

  // ── Sequence management ────────────────────────────────────────────────

  duplicateSequence: (track, orderPos) => set((s) => {
    const ol = s.orderLists[track];
    if (!ol || orderPos >= ol.entries.length) return {};
    const srcSeqIdx = ol.entries[orderPos].seqIdx;
    const srcSeq = s.sequences.get(srcSeqIdx);
    if (!srcSeq) return {};

    // Find first unused sequence index
    const maxSeq = s.musicData?.sequenceCount ?? 128;
    let freeIdx = -1;
    for (let i = 0; i < maxSeq; i++) {
      if (!s.sequences.has(i) || (s.sequences.get(i)?.length === 0)) {
        freeIdx = i;
        break;
      }
    }
    if (freeIdx === -1) return {};

    // Clone sequence data
    const seqs = new Map(s.sequences);
    seqs.set(freeIdx, srcSeq.map(e => ({ ...e })));

    // Replace current order entry with new sequence
    const lists = [...s.orderLists];
    const olCopy = { ...lists[track], entries: [...lists[track].entries] };
    olCopy.entries[orderPos] = { ...olCopy.entries[orderPos], seqIdx: freeIdx };
    lists[track] = olCopy;

    return { sequences: seqs, orderLists: lists, redoStack: [] };
  }),

  splitSequenceAtRow: (track, orderPos, atRow) => set((s) => {
    const ol = s.orderLists[track];
    if (!ol || orderPos >= ol.entries.length) return {};
    const srcSeqIdx = ol.entries[orderPos].seqIdx;
    const srcSeq = s.sequences.get(srcSeqIdx);
    if (!srcSeq || atRow <= 0 || atRow >= srcSeq.length) return {};

    // Find first unused sequence index
    const maxSeq = s.musicData?.sequenceCount ?? 128;
    let freeIdx = -1;
    for (let i = 0; i < maxSeq; i++) {
      if (!s.sequences.has(i) || (s.sequences.get(i)?.length === 0)) {
        freeIdx = i;
        break;
      }
    }
    if (freeIdx === -1) return {};

    // Split: original keeps rows 0..atRow-1, new gets atRow..end
    const seqs = new Map(s.sequences);
    seqs.set(srcSeqIdx, srcSeq.slice(0, atRow).map(e => ({ ...e })));
    seqs.set(freeIdx, srcSeq.slice(atRow).map(e => ({ ...e })));

    // Insert new order entry after current position
    const lists = [...s.orderLists];
    const olCopy = { ...lists[track], entries: [...lists[track].entries] };
    const newEntry = { transpose: olCopy.entries[orderPos].transpose, seqIdx: freeIdx };
    olCopy.entries.splice(orderPos + 1, 0, newEntry);
    lists[track] = olCopy;

    return { sequences: seqs, orderLists: lists, redoStack: [] };
  }),

  insertFirstFreeSequence: (track, orderPos) => set((s) => {
    const ol = s.orderLists[track];
    if (!ol) return {};

    // Find first unused sequence index
    const maxSeq = s.musicData?.sequenceCount ?? 128;
    let freeIdx = -1;
    for (let i = 0; i < maxSeq; i++) {
      if (!s.sequences.has(i) || (s.sequences.get(i)?.length === 0)) {
        freeIdx = i;
        break;
      }
    }
    if (freeIdx === -1) return {};

    // Create empty sequence (default 32 rows)
    const seqs = new Map(s.sequences);
    const emptySeq: SF2SeqEvent[] = [];
    for (let r = 0; r < 32; r++) {
      emptySeq.push({ note: 0, instrument: 0x80, command: 0x80 });
    }
    seqs.set(freeIdx, emptySeq);

    // Insert order entry at current position
    const lists = [...s.orderLists];
    const olCopy = { ...lists[track], entries: [...lists[track].entries] };
    const newEntry = { transpose: 0x80, seqIdx: freeIdx };
    olCopy.entries.splice(orderPos, 0, newEntry);
    lists[track] = olCopy;

    return { sequences: seqs, orderLists: lists, redoStack: [] };
  }),

  setOrderLoopPoint: (track, loopIndex) => set((s) => {
    const lists = [...s.orderLists];
    if (track >= lists.length) return {};
    const ol = { ...lists[track] };
    ol.loopIndex = Math.max(0, Math.min(ol.entries.length - 1, loopIndex));
    ol.hasLoop = true;
    lists[track] = ol;
    return { orderLists: lists };
  }),

  setAllOrderLoopPoints: (loopIndex) => set((s) => {
    const lists = s.orderLists.map(ol => ({
      ...ol,
      loopIndex: Math.max(0, Math.min(ol.entries.length - 1, loopIndex)),
      hasLoop: true,
    }));
    return { orderLists: lists };
  }),

  // ── Instrument editing ─────────────────────────────────────────────────

  setInstrumentByte: (instIdx, byteOffset, value) => set((s) => {
    const insts = [...s.instruments];
    if (instIdx >= insts.length) return {};
    const inst = { ...insts[instIdx], rawBytes: new Uint8Array(insts[instIdx].rawBytes) };
    if (byteOffset < inst.rawBytes.length) {
      inst.rawBytes[byteOffset] = value;
    }
    insts[instIdx] = inst;
    return { instruments: insts };
  }),

  // ── Table editing ──────────────────────────────────────────────────────

  setTableByte: (tableDef, row, col, value) => set((s) => {
    const addr = tableDef.address + col * tableDef.rowCount + row;
    if (addr < 0 || addr >= s.c64Memory.length) return {};
    const newMem = new Uint8Array(s.c64Memory);
    newMem[addr] = value;
    return { c64Memory: newMem };
  }),

  // ── Channel mute ───────────────────────────────────────────────────────

  toggleChannelMute: (channel) => set((s) => {
    const mutes = [...s.channelMutes];
    if (channel >= mutes.length) return {};
    mutes[channel] = !mutes[channel];
    return { channelMutes: mutes };
  }),

  soloChannel: (channel) => set((s) => {
    const mutes = s.channelMutes.map((_, i) => i !== channel);
    return { channelMutes: mutes };
  }),

  unmuteAll: () => set((s) => ({
    channelMutes: s.channelMutes.map(() => false),
  })),

  // ── Undo/redo ──────────────────────────────────────────────────────────

  undo: () => set((s) => {
    if (s.undoStack.length === 0) return {};
    const entry = s.undoStack[s.undoStack.length - 1];
    const newUndo = s.undoStack.slice(0, -1);

    if (entry.type === 'sequence') {
      const seqs = new Map(s.sequences);
      const currentSeq = seqs.get(entry.key);
      const redoEntry: SF2UndoEntry = {
        type: 'sequence',
        key: entry.key,
        before: currentSeq ? [...currentSeq.map(e => ({ ...e }))] : [],
      };
      seqs.set(entry.key, (entry.before as SF2SeqEvent[]).map(e => ({ ...e })));
      return {
        sequences: seqs,
        undoStack: newUndo,
        redoStack: [...s.redoStack, redoEntry],
      };
    }
    return {};
  }),

  redo: () => set((s) => {
    if (s.redoStack.length === 0) return {};
    const entry = s.redoStack[s.redoStack.length - 1];
    const newRedo = s.redoStack.slice(0, -1);

    if (entry.type === 'sequence') {
      const seqs = new Map(s.sequences);
      const currentSeq = seqs.get(entry.key);
      const undoEntry: SF2UndoEntry = {
        type: 'sequence',
        key: entry.key,
        before: currentSeq ? [...currentSeq.map(e => ({ ...e }))] : [],
      };
      seqs.set(entry.key, (entry.before as SF2SeqEvent[]).map(e => ({ ...e })));
      return {
        sequences: seqs,
        undoStack: [...s.undoStack, undoEntry],
        redoStack: newRedo,
      };
    }
    return {};
  }),

  exportSF2File: () => {
    const s = get();
    if (!s.rawFileData || !s.descriptor || !s.driverCommon || !s.musicData) return null;
    return _exportSF2File({
      rawFileData: s.rawFileData,
      loadAddress: s.loadAddress,
      descriptor: s.descriptor,
      driverCommon: s.driverCommon,
      musicData: s.musicData,
      tableDefs: s.tableDefs,
      instrumentDescriptions: s.instrumentDescriptions,
      c64Memory: s.c64Memory,
      sequences: s.sequences,
      orderLists: s.orderLists,
      instruments: s.instruments,
    });
  },
}));
