/**
 * useCheeseCutterStore — Zustand store for CheeseCutter tracker state.
 *
 * Manages the complete CheeseCutter song state including metadata, sequences,
 * track lists, instrument data, and editor state.
 * Both DOM (CheeseCutterView) and Pixi consume this store via
 * the shared useCheeseCutterFormatData hook.
 *
 * CheeseCutter is a C64 SID tracker (3 channels, single SID chip).
 * Data lives entirely in this store (parsed from the .ct file at load time).
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// ── Sequence row ────────────────────────────────────────────────────────

export interface CCSequenceRow {
  instrument: number;
  tied: boolean;
  note: number;
  command: number;
}

// ── Track list entry ────────────────────────────────────────────────────

export interface CCTrackListEntry {
  transpose: number;
  sequence: number;
  isEnd: boolean;
}

// ── Instrument data ─────────────────────────────────────────────────────

export interface CCInstrument {
  name: string;
  ad: number;
  sr: number;
  wavePtr: number;
  pulsePtr: number;
  filterPtr: number;
  bytes: number[];
}

// ── Table data ──────────────────────────────────────────────────────────

export interface CCWaveTable {
  wave1: Uint8Array;
  wave2: Uint8Array;
}

// ── Editor cursor ───────────────────────────────────────────────────────

export interface CCEditorCursor {
  channel: number;   // 0-2
  row: number;
  column: number;    // 0=note, 1=instrument, 2=command
  digit: number;     // 0 or 1 for hex editing
}

// ── Playback position ───────────────────────────────────────────────────

export interface CCPlaybackPosition {
  row: number;
  songPos: number;
}

// ── Store state ─────────────────────────────────────────────────────────

interface CheeseCutterState {
  loaded: boolean;
  version: number;
  clock: number;           // 0=PAL, 1=NTSC
  speedMultiplier: number;
  sidModel: number;        // 0=6581, 1=8580
  title: string;
  author: string;
  release: string;
  subtuneCount: number;
  currentSubtune: number;
  subtuneSpeeds: number[];
  highlight: number;
  highlightOffset: number;

  // Pattern data
  sequences: Array<{ rows: CCSequenceRow[] }>;
  trackLists: Array<CCTrackListEntry[]>; // [voice][entry]

  // Instruments
  instruments: CCInstrument[];

  // Tables
  waveTable: CCWaveTable | null;
  pulseTable: Uint8Array | null;
  filterTable: Uint8Array | null;
  commandTable: Uint8Array | null;

  // Editor state
  cursor: CCEditorCursor;
  orderCursor: number;
  playing: boolean;
  playbackPos: CCPlaybackPosition;
  editStep: number;
  currentOctave: number;
  currentInstrument: number;

  // Actions
  loadData: (data: CheeseCutterLoadPayload) => void;
  setCursor: (partial: Partial<CCEditorCursor>) => void;
  setOrderCursor: (pos: number) => void;
  setPlaying: (playing: boolean) => void;
  updatePlaybackPos: (pos: CCPlaybackPosition) => void;
  setCurrentSubtune: (idx: number) => void;
  setEditStep: (step: number) => void;
  setCurrentOctave: (octave: number) => void;
  setCurrentInstrument: (inst: number) => void;
  setSequenceCell: (seqIdx: number, row: number, field: keyof CCSequenceRow, value: number | boolean) => void;
  eraseEvent: (seqIdx: number, row: number) => void;
  deleteRow: (seqIdx: number, row: number) => void;
  insertRow: (seqIdx: number, row: number) => void;
  reset: () => void;
}

// ── Load payload ────────────────────────────────────────────────────────

export interface CheeseCutterLoadPayload {
  version: number;
  clock: number;
  speedMultiplier: number;
  sidModel: number;
  title: string;
  author: string;
  release: string;
  subtuneCount: number;
  currentSubtune: number;
  subtuneSpeeds: number[];
  highlight: number;
  highlightOffset: number;
  sequences: Array<{ rows: CCSequenceRow[] }>;
  trackLists: Array<CCTrackListEntry[]>;
  instruments: CCInstrument[];
  waveTable: CCWaveTable | null;
  pulseTable: Uint8Array | null;
  filterTable: Uint8Array | null;
  commandTable: Uint8Array | null;
}

// ── Initial state ───────────────────────────────────────────────────────

const INITIAL_CURSOR: CCEditorCursor = { channel: 0, row: 0, column: 0, digit: 0 };
const INITIAL_PLAYBACK: CCPlaybackPosition = { row: 0, songPos: 0 };

const EMPTY_ROW: CCSequenceRow = { instrument: 0, tied: false, note: 0, command: 0 };

// ── Store ───────────────────────────────────────────────────────────────

export const useCheeseCutterStore = create<CheeseCutterState>()(
  immer((set) => ({
    loaded: false,
    version: 0,
    clock: 0,
    speedMultiplier: 1,
    sidModel: 0,
    title: '',
    author: '',
    release: '',
    subtuneCount: 1,
    currentSubtune: 0,
    subtuneSpeeds: [6],
    highlight: 4,
    highlightOffset: 0,

    sequences: [],
    trackLists: [[], [], []],

    instruments: [],

    waveTable: null,
    pulseTable: null,
    filterTable: null,
    commandTable: null,

    cursor: { ...INITIAL_CURSOR },
    orderCursor: 0,
    playing: false,
    playbackPos: { ...INITIAL_PLAYBACK },
    editStep: 1,
    currentOctave: 3,
    currentInstrument: 1,

    loadData: (data: CheeseCutterLoadPayload) =>
      set((state) => {
        state.loaded = true;
        state.version = data.version;
        state.clock = data.clock;
        state.speedMultiplier = data.speedMultiplier;
        state.sidModel = data.sidModel;
        state.title = data.title;
        state.author = data.author;
        state.release = data.release;
        state.subtuneCount = data.subtuneCount;
        state.currentSubtune = data.currentSubtune;
        state.subtuneSpeeds = data.subtuneSpeeds;
        state.highlight = data.highlight;
        state.highlightOffset = data.highlightOffset;
        state.sequences = data.sequences;
        state.trackLists = data.trackLists;
        state.instruments = data.instruments;
        state.waveTable = data.waveTable;
        state.pulseTable = data.pulseTable;
        state.filterTable = data.filterTable;
        state.commandTable = data.commandTable;
        state.cursor = { ...INITIAL_CURSOR };
        state.orderCursor = 0;
        state.playing = false;
        state.playbackPos = { ...INITIAL_PLAYBACK };
      }),

    setCursor: (partial: Partial<CCEditorCursor>) =>
      set((state) => {
        if (partial.channel !== undefined) state.cursor.channel = partial.channel;
        if (partial.row !== undefined) state.cursor.row = partial.row;
        if (partial.column !== undefined) state.cursor.column = partial.column;
        if (partial.digit !== undefined) state.cursor.digit = partial.digit;
      }),

    setOrderCursor: (pos: number) =>
      set((state) => {
        state.orderCursor = pos;
      }),

    setPlaying: (playing: boolean) =>
      set((state) => {
        state.playing = playing;
      }),

    updatePlaybackPos: (pos: CCPlaybackPosition) =>
      set((state) => {
        state.playbackPos.row = pos.row;
        state.playbackPos.songPos = pos.songPos;
      }),

    setCurrentSubtune: (idx: number) =>
      set((state) => {
        if (idx >= 0 && idx < state.subtuneCount) {
          state.currentSubtune = idx;
        }
      }),

    setEditStep: (step: number) =>
      set((state) => {
        state.editStep = Math.max(0, Math.min(16, step));
      }),

    setCurrentOctave: (octave: number) =>
      set((state) => {
        state.currentOctave = Math.max(0, Math.min(7, octave));
      }),

    setCurrentInstrument: (inst: number) =>
      set((state) => {
        state.currentInstrument = Math.max(0, Math.min(0x3F, inst));
      }),

    setSequenceCell: (seqIdx: number, row: number, field: keyof CCSequenceRow, value: number | boolean) =>
      set((state) => {
        const seq = state.sequences[seqIdx];
        if (!seq || row < 0 || row >= seq.rows.length) return;
        (seq.rows[row] as Record<string, number | boolean>)[field] = value;
      }),

    eraseEvent: (seqIdx: number, row: number) =>
      set((state) => {
        const seq = state.sequences[seqIdx];
        if (!seq || row < 0 || row >= seq.rows.length) return;
        seq.rows[row] = { ...EMPTY_ROW };
      }),

    deleteRow: (seqIdx: number, row: number) =>
      set((state) => {
        const seq = state.sequences[seqIdx];
        if (!seq || row < 0 || row >= seq.rows.length || seq.rows.length <= 1) return;
        seq.rows.splice(row, 1);
      }),

    insertRow: (seqIdx: number, row: number) =>
      set((state) => {
        const seq = state.sequences[seqIdx];
        if (!seq || row < 0) return;
        seq.rows.splice(row, 0, { ...EMPTY_ROW });
      }),

    reset: () =>
      set((state) => {
        state.loaded = false;
        state.version = 0;
        state.clock = 0;
        state.speedMultiplier = 1;
        state.sidModel = 0;
        state.title = '';
        state.author = '';
        state.release = '';
        state.subtuneCount = 1;
        state.currentSubtune = 0;
        state.subtuneSpeeds = [6];
        state.highlight = 4;
        state.highlightOffset = 0;
        state.sequences = [];
        state.trackLists = [[], [], []];
        state.instruments = [];
        state.waveTable = null;
        state.pulseTable = null;
        state.filterTable = null;
        state.commandTable = null;
        state.cursor = { ...INITIAL_CURSOR };
        state.orderCursor = 0;
        state.playing = false;
        state.playbackPos = { ...INITIAL_PLAYBACK };
        state.editStep = 1;
        state.currentOctave = 3;
        state.currentInstrument = 1;
      }),
  })),
);
