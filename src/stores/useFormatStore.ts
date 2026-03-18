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
  KlysNativeData,
  FurnaceSubsongPlayback,
} from '@typedefs';
import { useEditorStore } from './useEditorStore';
import { useUIStore } from './useUIStore';

interface FormatStore {
  editorMode: EditorMode;
  furnaceNative: FurnaceNativeData | null;
  hivelyNative: HivelyNativeData | null;
  hivelyFileData: ArrayBuffer | null;
  klysNative: KlysNativeData | null;
  klysFileData: ArrayBuffer | null;
  musiclineFileData: Uint8Array | null;
  c64SidFileData: Uint8Array | null;
  goatTrackerData: Uint8Array | null;
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
  artOfNoiseFileData: ArrayBuffer | null;
  startrekkerAMFileData: ArrayBuffer | null;
  bdFileData: ArrayBuffer | null;
  sd2FileData: ArrayBuffer | null;
  symphonieFileData: ArrayBuffer | null;
  uadeEditableFileData: ArrayBuffer | null;
  uadeEditableFileName: string | null;
  uadeEditableSubsongs: { count: number; speeds: number[] } | null;
  uadeEditableCurrentSubsong: number;
  libopenmptFileData: ArrayBuffer | null;
  hivelyMeta: { stereoMode: number; mixGain: number; speedMultiplier: number; version: number } | null;
  furnaceSubsongs: FurnaceSubsongPlayback[] | null;
  furnaceActiveSubsong: number;
  channelTrackTables: number[][] | null;
  channelSpeeds: number[] | null;
  channelGrooves: number[] | null;
  originalModuleData: { base64: string; format: 'MOD' | 'XM' | 'IT' | 'S3M' | 'UNKNOWN'; sourceFile?: string } | null;
  songDBInfo: { authors: string[]; publishers: string[]; album: string; year: string; format: string; duration_ms: number } | null;
  sidMetadata: { format: string; version: number; title: string; author: string; copyright: string; chipModel: '6581' | '8580' | 'Unknown'; clockSpeed: 'PAL' | 'NTSC' | 'Unknown'; subsongs: number; defaultSubsong: number; currentSubsong: number; secondSID: boolean; thirdSID: boolean } | null;

  setEditorMode: (mode: EditorMode) => void;
  setFurnaceNative: (data: FurnaceNativeData | null) => void;
  setFurnaceOrderEntry: (channel: number, position: number, patternIndex: number) => void;
  setHivelyNative: (data: HivelyNativeData | null) => void;
  setSongDBInfo: (info: FormatStore['songDBInfo']) => void;
  setSidMetadata: (info: FormatStore['sidMetadata']) => void;
  setOriginalModuleData: (data: FormatStore['originalModuleData']) => void;
  applyEditorMode: (song: { linearPeriods?: boolean; furnaceNative?: FurnaceNativeData; hivelyNative?: HivelyNativeData; hivelyFileData?: ArrayBuffer; klysNative?: KlysNativeData; klysFileData?: ArrayBuffer; musiclineFileData?: Uint8Array; c64SidFileData?: Uint8Array; jamCrackerFileData?: ArrayBuffer; futurePlayerFileData?: ArrayBuffer; preTrackerFileData?: ArrayBuffer; maFileData?: ArrayBuffer; hippelFileData?: ArrayBuffer; sonixFileData?: ArrayBuffer; pxtoneFileData?: ArrayBuffer; organyaFileData?: ArrayBuffer; eupFileData?: ArrayBuffer; ixsFileData?: ArrayBuffer; psycleFileData?: ArrayBuffer; sc68FileData?: ArrayBuffer; zxtuneFileData?: ArrayBuffer; pumaTrackerFileData?: ArrayBuffer; artOfNoiseFileData?: ArrayBuffer; bdFileData?: ArrayBuffer; sd2FileData?: ArrayBuffer; symphonieFileData?: ArrayBuffer; uadeEditableFileData?: ArrayBuffer; uadeEditableFileName?: string; libopenmptFileData?: ArrayBuffer; hivelyMeta?: { stereoMode: number; mixGain: number; speedMultiplier: number; version: number }; furnaceSubsongs?: FurnaceSubsongPlayback[]; furnaceActiveSubsong?: number; channelTrackTables?: number[][]; channelSpeeds?: number[]; channelGrooves?: number[]; goatTrackerData?: Uint8Array }) => void;
  setFurnaceActiveSubsong: (index: number) => void;
  reset: () => void;
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
};

export const useFormatStore = create<FormatStore>()(
  immer((set) => ({
    editorMode: 'classic' as EditorMode,
    furnaceNative: null,
    hivelyNative: null,
    hivelyFileData: null,
    klysNative: null,
    klysFileData: null,
    musiclineFileData: null,
    c64SidFileData: null,
    goatTrackerData: null,
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
    artOfNoiseFileData: null,
    startrekkerAMFileData: null,
    bdFileData: null,
    sd2FileData: null,
    symphonieFileData: null,
    uadeEditableFileData: null,
    uadeEditableFileName: null,
    uadeEditableSubsongs: null,
    uadeEditableCurrentSubsong: 0,
    libopenmptFileData: null,
    hivelyMeta: null,
    furnaceSubsongs: null,
    furnaceActiveSubsong: 0,
    channelTrackTables: null,
    channelSpeeds: null,
    channelGrooves: null,
    originalModuleData: null,
    songDBInfo: null,
    sidMetadata: null,

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
    setHivelyNative: (data) => set((state) => { state.hivelyNative = data; }),
    setSongDBInfo: (info) => set((state) => { state.songDBInfo = info; }),
    setSidMetadata: (info) => set((state) => { state.sidMetadata = info; }),
    setOriginalModuleData: (data) => set((state) => { state.originalModuleData = data; }),

    applyEditorMode: (song) => {
      useEditorStore.getState().setLinearPeriods(song.linearPeriods ?? false);
      let newEditorMode: EditorMode = 'classic';
      set((state) => {
        state.c64SidFileData = song.c64SidFileData ?? null;
        state.goatTrackerData = song.goatTrackerData ?? null;
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
        state.artOfNoiseFileData = (song as any).artOfNoiseFileData ?? null;
        state.startrekkerAMFileData = (song as any).startrekkerAMFileData ?? null;
        state.bdFileData = (song as any).bdFileData ?? null;
        state.sd2FileData = (song as any).sd2FileData ?? null;
        state.symphonieFileData = (song as any).symphonieFileData ?? null;
        state.uadeEditableFileData = (song as any).uadeEditableFileData ?? null;
        state.uadeEditableFileName = (song as any).uadeEditableFileName ?? null;
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
        } else if (song.channelTrackTables) {
          newEditorMode = 'musicline';
          state.editorMode = 'musicline';
          clearNative(state);
          state.musiclineFileData = song.musiclineFileData ?? null;
          state.channelTrackTables = song.channelTrackTables;
          state.channelSpeeds = song.channelSpeeds ?? null;
          state.channelGrooves = song.channelGrooves ?? null;
        } else if (song.jamCrackerFileData) {
          newEditorMode = 'jamcracker';
          state.editorMode = 'jamcracker';
          clearNative(state);
        } else if (song.goatTrackerData || song.c64SidFileData) {
          newEditorMode = 'goattracker';
          state.editorMode = 'goattracker';
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
    },

    setFurnaceActiveSubsong: (index) => set((state) => { state.furnaceActiveSubsong = index; }),

    reset: () => set((state) => {
      state.editorMode = 'classic';
      clearNative(state);
      state.c64SidFileData = null;
      state.goatTrackerData = null;
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
      state.artOfNoiseFileData = null;
      state.startrekkerAMFileData = null;
      state.bdFileData = null;
      state.sd2FileData = null;
      state.symphonieFileData = null;
      state.uadeEditableFileData = null;
      state.uadeEditableFileName = null;
      state.uadeEditableSubsongs = null;
      state.uadeEditableCurrentSubsong = 0;
      state.libopenmptFileData = null;
      state.originalModuleData = null;
      state.songDBInfo = null;
      state.sidMetadata = null;
    }),
  }))
);
