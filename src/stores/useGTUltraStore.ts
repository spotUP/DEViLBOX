/**
 * GTUltra Store — Zustand store for GoatTracker Ultra tracker state.
 *
 * Manages cursor position, editor state, and provides accessors that
 * read pattern/instrument/table data directly from WASM heap memory
 * (zero-copy via HEAPU8 views when running in main thread for reads).
 *
 * The WASM engine runs in an AudioWorklet, so all mutations go through
 * postMessage. This store tracks the UI-side state and receives position
 * updates from the worklet.
 */

import { create } from 'zustand';
import type { GTUltraEngine } from '../engine/gtultra/GTUltraEngine';

// --- GoatTracker data structures ---

export interface GTPatternCell {
  note: number;       // 0=empty, 1-95=note, 0xFE=keyoff, 0xFF=keyon
  instrument: number; // 0=no change, 1-63=instrument
  command: number;    // 0-255 command byte
  data: number;       // 0-255 command parameter
}

export interface GTInstrument {
  ad: number;         // Attack/Decay (ADSR high byte)
  sr: number;         // Sustain/Release (ADSR low byte)
  vibdelay: number;
  gatetimer: number;
  firstwave: number;
  name: string;
  tablePointers: number[]; // [wave, pulse, filter, speed]
}

export interface GTEditorCursor {
  channel: number;    // 0-5
  row: number;        // 0-127
  column: number;     // 0=note, 1=instrument, 2=command, 3=data
  digit: number;      // 0 or 1 (for hex editing)
}

export interface GTSelection {
  active: boolean;
  startChannel: number;
  startRow: number;
  endChannel: number;
  endRow: number;
}

export interface GTPlaybackPosition {
  row: number;
  position: number;  // alias for songPos (order list position)
  songPos: number;
}

export interface GTInstrumentView {
  ad: number;
  sr: number;
  vibdelay: number;
  gatetimer: number;
  firstwave: number;
  name: string;
  wavePtr: number;
  pulsePtr: number;
  filterPtr: number;
  speedPtr: number;
}

export interface GTTableData {
  left: Uint8Array;   // 255 entries
  right: Uint8Array;  // 255 entries
}

export type GTEditMode = 'pattern' | 'instrument' | 'table' | 'order' | 'songname';
export type GTSidModel = 0 | 1; // 0=6581, 1=8580
export type GTViewMode = 'pro' | 'studio'; // Pro = hex editor, Studio = visual

export interface GTUltraState {
  // Engine reference
  engine: GTUltraEngine | null;
  /** Song data queued before engine was ready — consumed on init */
  pendingSongData: Uint8Array | null;

  // Editor mode
  editMode: GTEditMode;
  viewMode: GTViewMode;
  activeTable: number; // 0=wave, 1=pulse, 2=filter, 3=speed

  // Cursor
  cursor: GTEditorCursor;
  selection: GTSelection;

  // Song info
  songName: string;
  songAuthor: string;
  tempo: number;

  // Song state
  currentSong: number;    // 0-31 (multi-song)
  currentPattern: number; // per-channel patterns are in orderlist
  patternLength: number;  // rows per pattern (default 0x3F = 63)
  currentInstrument: number; // 1-63
  currentOctave: number;  // 0-7

  // Playback
  playing: boolean;
  followPlay: boolean;
  playbackPos: GTPlaybackPosition;

  // SID configuration
  sidModel: GTSidModel;
  sidCount: 1 | 2;

  // Edit settings
  editStep: number;    // rows to advance after note entry
  recordMode: boolean;
  jamMode: boolean;

  // Instrument data (read from WASM or default)
  instrumentData: GTInstrumentView[];

  // Order data per channel (array of arrays)
  orderData: Uint8Array[];

  // Table data (wave/pulse/filter/speed)
  tableData: Record<string, GTTableData>;

  // Pattern data cache (pattern# → {length, data})
  patternData: Map<number, { length: number; data: Uint8Array }>;

  // SID register snapshots (per SID chip)
  sidRegisters: Uint8Array[];

  // Order list cursor
  orderCursor: number;
  // Table cursor
  tableCursor: number;

  // Actions
  setEngine: (engine: GTUltraEngine | null) => void;
  setPendingSongData: (data: Uint8Array | null) => void;
  setEditMode: (mode: GTEditMode) => void;
  setViewMode: (mode: GTViewMode) => void;
  setActiveTable: (table: number) => void;
  setCursor: (patch: Partial<GTEditorCursor>) => void;
  moveCursor: (dir: 'up' | 'down' | 'left' | 'right') => void;
  setSelection: (sel: Partial<GTSelection>) => void;
  clearSelection: () => void;
  setCurrentInstrument: (num: number) => void;
  setCurrentOctave: (oct: number) => void;
  setEditStep: (step: number) => void;
  setPatternLength: (len: number) => void;
  setSidModel: (model: GTSidModel) => void;
  setSidCount: (count: 1 | 2) => void;
  setPlaying: (playing: boolean) => void;
  setFollowPlay: (follow: boolean) => void;
  updatePlaybackPos: (pos: Partial<GTPlaybackPosition>) => void;
  setRecordMode: (record: boolean) => void;
  setJamMode: (jam: boolean) => void;
  setCurrentSong: (song: number) => void;
  setOrderCursor: (idx: number) => void;
  setTableCursor: (idx: number) => void;
  setSongName: (name: string) => void;
  setSongAuthor: (author: string) => void;
  setTempo: (tempo: number) => void;

  // Data update actions (from WASM)
  updatePatternData: (pattern: number, length: number, data: Uint8Array) => void;
  updateOrderData: (channel: number, data: Uint8Array) => void;
  updateInstrumentData: (instrument: number, data: Uint8Array) => void;
  updateTableData: (tableType: number, left: Uint8Array, right: Uint8Array) => void;
  updateSidRegisters: (sidIdx: number, data: Uint8Array) => void;

  // Request data refresh from WASM engine
  refreshPatternData: (pattern: number) => void;
  refreshAllOrders: () => void;
  refreshAllInstruments: () => void;
  refreshAllTables: () => void;
  refreshSidRegisters: () => void;
  refreshSongInfo: () => void;
}

// Column navigation order within a channel
const COLUMNS_PER_CHANNEL = 4; // note, instrument, command, data
const MAX_PATTERN_ROWS = 128;

// Default instrument data
const defaultInstruments: GTInstrumentView[] = Array.from({ length: 64 }, (_, i) => ({
  ad: 0x00, sr: 0x00, vibdelay: 0, gatetimer: 0, firstwave: 0,
  name: i === 0 ? '' : `Instr ${i}`,
  wavePtr: 0, pulsePtr: 0, filterPtr: 0, speedPtr: 0,
}));

// Default empty table
const emptyTable = (): GTTableData => ({
  left: new Uint8Array(255),
  right: new Uint8Array(255),
});

export const useGTUltraStore = create<GTUltraState>()((set, get) => ({
  // Engine
  engine: null,
  pendingSongData: null,

  // Editor mode
  editMode: 'pattern',
  viewMode: 'pro',
  activeTable: 0,

  // Cursor
  cursor: { channel: 0, row: 0, column: 0, digit: 0 },
  selection: { active: false, startChannel: 0, startRow: 0, endChannel: 0, endRow: 0 },

  // Song info
  songName: '',
  songAuthor: '',
  tempo: 6,

  // Song state
  currentSong: 0,
  currentPattern: 0,
  patternLength: 0x3F,
  currentInstrument: 1,
  currentOctave: 3,

  // Playback
  playing: false,
  followPlay: true,
  playbackPos: { row: 0, position: 0, songPos: 0 },

  // SID config
  sidModel: 0,
  sidCount: 1,

  // Edit settings
  editStep: 1,
  recordMode: false,
  jamMode: false,

  // Data
  instrumentData: defaultInstruments,
  orderData: Array.from({ length: 6 }, () => {
    const d = new Uint8Array(256);
    d[0] = 0x00; d[1] = 0xFF; // pattern 00, then end
    return d;
  }),
  tableData: {
    wave: emptyTable(),
    pulse: emptyTable(),
    filter: emptyTable(),
    speed: emptyTable(),
  },
  patternData: new Map(),
  sidRegisters: [new Uint8Array(25), new Uint8Array(25)],
  orderCursor: 0,
  tableCursor: 0,

  // --- Actions ---

  setEngine: (engine) => set({ engine }),
  setPendingSongData: (data) => set({ pendingSongData: data }),
  setEditMode: (editMode) => set({ editMode }),
  setViewMode: (viewMode) => set({ viewMode }),
  setActiveTable: (activeTable) => set({ activeTable }),

  setCursor: (patch) => set((s) => ({
    cursor: { ...s.cursor, ...patch }
  })),

  moveCursor: (dir) => set((s) => {
    const { cursor, patternLength, sidCount } = s;
    const maxCh = sidCount * 3;
    const c = { ...cursor };

    switch (dir) {
      case 'up':
        c.row = c.row > 0 ? c.row - 1 : patternLength;
        break;
      case 'down':
        c.row = c.row < patternLength ? c.row + 1 : 0;
        break;
      case 'left':
        if (c.digit > 0) {
          c.digit--;
        } else if (c.column > 0) {
          c.column--;
          c.digit = c.column === 0 ? 0 : 1; // note has 0 digits, others have 2 hex digits
        } else if (c.channel > 0) {
          c.channel--;
          c.column = COLUMNS_PER_CHANNEL - 1;
          c.digit = 1;
        }
        break;
      case 'right': {
        const maxDigit = c.column === 0 ? 0 : 1;
        if (c.digit < maxDigit) {
          c.digit++;
        } else if (c.column < COLUMNS_PER_CHANNEL - 1) {
          c.column++;
          c.digit = 0;
        } else if (c.channel < maxCh - 1) {
          c.channel++;
          c.column = 0;
          c.digit = 0;
        }
        break;
      }
    }

    return { cursor: c };
  }),

  setSelection: (sel) => set((s) => ({
    selection: { ...s.selection, ...sel }
  })),

  clearSelection: () => set({
    selection: { active: false, startChannel: 0, startRow: 0, endChannel: 0, endRow: 0 }
  }),

  setCurrentInstrument: (currentInstrument) => set({ currentInstrument: Math.max(1, Math.min(63, currentInstrument)) }),
  setCurrentOctave: (currentOctave) => set({ currentOctave: Math.max(0, Math.min(7, currentOctave)) }),
  setEditStep: (editStep) => set({ editStep: Math.max(0, Math.min(16, editStep)) }),
  setPatternLength: (patternLength) => set({ patternLength: Math.max(1, Math.min(MAX_PATTERN_ROWS - 1, patternLength)) }),

  setSidModel: (sidModel) => {
    const { engine } = get();
    engine?.setSidModel(sidModel);
    set({ sidModel });
  },

  setSidCount: (sidCount) => {
    const { engine } = get();
    engine?.setSidCount(sidCount);
    set({ sidCount });
  },

  setPlaying: (playing) => set({ playing }),
  setFollowPlay: (followPlay) => set({ followPlay }),
  updatePlaybackPos: (pos) => set((s) => ({
    playbackPos: {
      ...s.playbackPos,
      ...pos,
      // Keep position and songPos in sync
      position: pos.position ?? pos.songPos ?? s.playbackPos.position,
      songPos: pos.songPos ?? pos.position ?? s.playbackPos.songPos,
    },
  })),
  setRecordMode: (recordMode) => set({ recordMode }),
  setJamMode: (jamMode) => set({ jamMode }),
  setCurrentSong: (currentSong) => set({ currentSong: Math.max(0, Math.min(31, currentSong)) }),
  setOrderCursor: (orderCursor) => set({ orderCursor }),
  setTableCursor: (tableCursor) => set({ tableCursor }),
  setSongName: (songName) => set({ songName }),
  setSongAuthor: (songAuthor) => set({ songAuthor }),
  setTempo: (tempo) => set({ tempo }),

  // --- Data update actions (from WASM) ---

  updatePatternData: (pattern, length, data) => set((s) => {
    const next = new Map(s.patternData);
    next.set(pattern, { length, data });
    return { patternData: next };
  }),

  updateOrderData: (channel, data) => set((s) => {
    const next = [...s.orderData];
    next[channel] = data;
    return { orderData: next };
  }),

  updateInstrumentData: (instrument, rawData) => set((s) => {
    const next = [...s.instrumentData];
    // Parse raw bytes: ad(1), sr(1), vibdelay(1), gatetimer(1), firstwave(1), name(16), wave(1), pulse(1), filter(1), speed(1)
    const ad = rawData[0];
    const sr = rawData[1];
    const vibdelay = rawData[2];
    const gatetimer = rawData[3];
    const firstwave = rawData[4];
    let name = '';
    for (let i = 5; i < 21; i++) {
      if (rawData[i] === 0) break;
      name += String.fromCharCode(rawData[i]);
    }
    const wavePtr = rawData[21];
    const pulsePtr = rawData[22];
    const filterPtr = rawData[23];
    const speedPtr = rawData[24];
    next[instrument] = { ad, sr, vibdelay, gatetimer, firstwave, name, wavePtr, pulsePtr, filterPtr, speedPtr };
    return { instrumentData: next };
  }),

  updateTableData: (tableType, left, right) => set((s) => {
    const TABLE_NAMES = ['wave', 'pulse', 'filter', 'speed'];
    const key = TABLE_NAMES[tableType] || 'wave';
    return {
      tableData: {
        ...s.tableData,
        [key]: { left, right },
      },
    };
  }),

  updateSidRegisters: (sidIdx, data) => set((s) => {
    const next = [...s.sidRegisters];
    next[sidIdx] = data;
    return { sidRegisters: next };
  }),

  // --- Request data refresh from WASM engine ---

  refreshPatternData: (pattern) => {
    get().engine?.requestPatternData(pattern);
  },

  refreshAllOrders: () => {
    const engine = get().engine;
    if (!engine) return;
    const maxCh = get().sidCount * 3;
    for (let ch = 0; ch < maxCh; ch++) {
      engine.requestOrderData(ch);
    }
  },

  refreshAllInstruments: () => {
    const engine = get().engine;
    if (!engine) return;
    for (let i = 0; i < 64; i++) {
      engine.requestInstrumentData(i);
    }
  },

  refreshAllTables: () => {
    const engine = get().engine;
    if (!engine) return;
    for (let t = 0; t < 4; t++) {
      engine.requestTableData(t);
    }
  },

  refreshSidRegisters: () => {
    const engine = get().engine;
    if (!engine) return;
    engine.requestSidRegisters(0);
    if (get().sidCount === 2) engine.requestSidRegisters(1);
  },

  refreshSongInfo: () => {
    get().engine?.requestSongInfo();
  },
}));
