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

  // Sequence editing
  setSequenceCell: (seqIdx: number, row: number, field: keyof SF2SeqEvent, value: number) => void;

  // Instrument editing
  setInstrumentByte: (instIdx: number, byteOffset: number, value: number) => void;

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
    return { orderLists: lists };
  }),

  // ── Sequence editing ───────────────────────────────────────────────────

  setSequenceCell: (seqIdx, row, field, value) => set((s) => {
    const seqs = new Map(s.sequences);
    const seq = seqs.get(seqIdx);
    if (!seq || row >= seq.length) return {};
    const newSeq = [...seq];
    newSeq[row] = { ...newSeq[row], [field]: value };
    seqs.set(seqIdx, newSeq);
    return { sequences: seqs };
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
