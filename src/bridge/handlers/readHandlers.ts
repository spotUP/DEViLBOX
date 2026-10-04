/**
 * MCP Bridge — Read Handlers
 *
 * Handles read-only queries against Zustand stores.
 * Returns plain JSON-serializable objects.
 */

import { useTrackerStore } from '../../stores/useTrackerStore';
import { getConsoleEntries } from '../consoleCapture';
import { useTransportStore } from '../../stores/useTransportStore';
import { useWasmPositionStore } from '../../stores/useWasmPositionStore';
import { channelAudioContiguity } from '../analysis/ChannelAudioTap';
import { useFormatStore } from '../../stores/useFormatStore';
import { useInstrumentStore } from '../../stores/useInstrumentStore';
import { useCursorStore } from '../../stores/useCursorStore';
import { useEditorStore } from '../../stores/useEditorStore';
import { useUIStore } from '../../stores/useUIStore';
import { useAudioStore } from '../../stores/useAudioStore';
import { useMixerStore } from '../../stores/useMixerStore';
import { useHistoryStore } from '../../stores/useHistoryStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useProjectStore } from '../../stores/useProjectStore';
import { useOscilloscopeStore } from '../../stores/useOscilloscopeStore';
import { useInstrumentTypeStore } from '../../stores/useInstrumentTypeStore';
import { useDJStore } from '../../stores/useDJStore';
import { useDrumPadStore } from '../../stores/useDrumPadStore';
import { useDubStore } from '../../stores/useDubStore';
import { getDJEngineIfActive } from '../../engine/dj/DJEngine';
import { getDrumPadEngine } from '../../hooks/drumpad/useMIDIPadRouting';
import { useSynthErrorStore } from '../../stores/useSynthErrorStore';
import { useMIDIStore } from '../../stores/useMIDIStore';
import { getGlobalRegistry } from '../../hooks/useGlobalKeyboardHandler';
import { getTrackerReplayer } from '../../engine/TrackerReplayer';
import { playingEngineFor } from '../../engine/replayer/NativeEngineRouting';
import { getToneEngine } from '../../engine/ToneEngine';
import * as Tone from 'tone';
import { AudioDataBus } from '../../engine/vj/AudioDataBus';
import {
  judgePlaybackSilence,
  describeSilenceVerdict,
  SilenceClock,
  SILENCE_GRACE_SEC,
} from '../../lib/audio/playbackSilenceWatchdog';

// ─── Note Helpers ──────────────────────────────────────────────────────────────

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

export function noteToString(note: number): string {
  if (note === 0) return '---';
  if (note === 97) return 'OFF';
  const noteIndex = (note - 1) % 12;
  const octave = Math.floor((note - 1) / 12);
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

function formatHex(val: number, digits = 2): string {
  return val.toString(16).toUpperCase().padStart(digits, '0');
}

const DSP_EFFECT_CHARS = ['D', 'E', 'C', 'L', 'X'];

function effectToString(effTyp: number, eff: number): string {
  if (effTyp === 0 && eff === 0) return '...';
  // Symphonie DSP effects: effTyp 0x50-0x54 → type letter + value
  if (effTyp >= 0x50 && effTyp <= 0x54) {
    return `${DSP_EFFECT_CHARS[effTyp - 0x50] ?? 'D'}${formatHex(eff)}`;
  }
  return `${formatHex(effTyp, 1)}${formatHex(eff)}`;
}

function formatCell(cell: { note: number; instrument: number; volume: number; effTyp: number; eff: number; effTyp2?: number; eff2?: number }) {
  return {
    note: cell.note,
    noteStr: noteToString(cell.note),
    instrument: cell.instrument,
    volume: cell.volume,
    effTyp: cell.effTyp,
    eff: cell.eff,
    effStr: effectToString(cell.effTyp, cell.eff),
    effTyp2: cell.effTyp2 ?? 0,
    eff2: cell.eff2 ?? 0,
  };
}

// ─── Song & Project ────────────────────────────────────────────────────────────

export function getSongInfo(): Record<string, unknown> {
  const tracker = useTrackerStore.getState();
  const transport = useTransportStore.getState();
  const format = useFormatStore.getState();
  const project = useProjectStore.getState();
  const pattern = tracker.patterns[tracker.currentPatternIndex];

  return {
    projectName: project.metadata.name,
    author: project.metadata.author,
    isDirty: project.isDirty,
    bpm: transport.bpm,
    speed: transport.speed,
    numPatterns: tracker.patterns.length,
    numChannels: pattern?.channels?.length ?? 0,
    patternLength: pattern?.length ?? 64,
    currentPattern: tracker.currentPatternIndex,
    currentPosition: tracker.currentPositionIndex,
    patternOrder: tracker.patternOrder,
    editorMode: format.editorMode,
    isPlaying: transport.isPlaying,
    isPaused: transport.isPaused,
    isLooping: transport.isLooping,
    globalPitch: transport.globalPitch,
    swing: transport.swing,
    metronomeEnabled: transport.metronomeEnabled,
  };
}

export function getProjectMetadata(): Record<string, unknown> {
  const project = useProjectStore.getState();
  return { ...project.metadata, isDirty: project.isDirty };
}

// ─── Pattern Data ──────────────────────────────────────────────────────────────

export function getPattern(params: Record<string, unknown>): Record<string, unknown> {
  const tracker = useTrackerStore.getState();
  const patternIndex = (params.patternIndex as number | undefined) ?? tracker.currentPatternIndex;
  const pattern = tracker.patterns[patternIndex];
  if (!pattern) return { error: `Pattern ${patternIndex} not found` };

  const startRow = (params.startRow as number | undefined) ?? 0;
  const endRow = (params.endRow as number | undefined) ?? (pattern.length - 1);
  const channelFilter = params.channels as number[] | undefined;
  const compact = params.compact as boolean | undefined;

  const rows: Record<string, unknown>[] = [];
  for (let r = startRow; r <= endRow && r < pattern.length; r++) {
    if (compact) {
      // Compact: only include rows with non-empty cells
      let hasContent = false;
      for (let c = 0; c < pattern.channels.length; c++) {
        if (channelFilter && !channelFilter.includes(c)) continue;
        const cell = pattern.channels[c]?.rows[r];
        if (cell && (cell.note || cell.instrument || cell.volume || cell.effTyp || cell.effTyp2)) {
          hasContent = true;
          break;
        }
      }
      if (!hasContent) continue;
    }

    const rowCells: Record<string, unknown>[] = [];
    for (let c = 0; c < pattern.channels.length; c++) {
      if (channelFilter && !channelFilter.includes(c)) continue;
      const cell = pattern.channels[c]?.rows[r];
      if (cell) {
        rowCells.push({ channel: c, ...formatCell(cell) });
      }
    }
    rows.push({ row: r, cells: rowCells });
  }

  return {
    patternIndex,
    name: pattern.name ?? `Pattern ${patternIndex}`,
    length: pattern.length,
    numChannels: pattern.channels.length,
    rows,
  };
}

export function getPatternList(): Record<string, unknown>[] {
  const tracker = useTrackerStore.getState();
  return tracker.patterns.map((p, i) => ({
    index: i,
    name: p.name ?? `Pattern ${i}`,
    length: p.length,
    numChannels: p.channels.length,
  }));
}

export function getPatternOrder(): Record<string, unknown> {
  const tracker = useTrackerStore.getState();
  return {
    order: tracker.patternOrder,
    currentPosition: tracker.currentPositionIndex,
    length: tracker.patternOrder.length,
  };
}

export function getCell(params: Record<string, unknown>): Record<string, unknown> {
  const tracker = useTrackerStore.getState();
  const channel = params.channel as number;
  const row = params.row as number;
  const patternIndex = (params.patternIndex as number | undefined) ?? tracker.currentPatternIndex;
  const pattern = tracker.patterns[patternIndex];
  if (!pattern) return { error: `Pattern ${patternIndex} not found` };

  const cell = pattern.channels[channel]?.rows[row];
  if (!cell) return { error: `Cell at ch${channel} row${row} not found` };

  return {
    channel,
    row,
    patternIndex,
    ...formatCell(cell),
    flag1: cell.flag1,
    flag2: cell.flag2,
    probability: cell.probability,
    period: cell.period,
  };
}

/** Get a column of data from a single channel across all rows */
export function getChannelColumn(params: Record<string, unknown>): Record<string, unknown> {
  const tracker = useTrackerStore.getState();
  const channel = params.channel as number;
  const patternIndex = (params.patternIndex as number | undefined) ?? tracker.currentPatternIndex;
  const column = (params.column as string) ?? 'note';
  const pattern = tracker.patterns[patternIndex];
  if (!pattern) return { error: `Pattern ${patternIndex} not found` };
  if (!pattern.channels[channel]) return { error: `Channel ${channel} not found` };

  const values: unknown[] = [];
  for (let r = 0; r < pattern.length; r++) {
    const cell = pattern.channels[channel].rows[r];
    if (!cell) { values.push(null); continue; }
    switch (column) {
      case 'note': values.push({ note: cell.note, noteStr: noteToString(cell.note) }); break;
      case 'instrument': values.push(cell.instrument); break;
      case 'volume': values.push(cell.volume); break;
      case 'effect': values.push(cell.effTyp ? `${formatHex(cell.effTyp, 1)}${formatHex(cell.eff)}` : null); break;
      default: values.push((cell as unknown as Record<string, unknown>)[column] ?? null);
    }
  }

  return { channel, patternIndex, column, length: pattern.length, values };
}

// ─── Instruments ───────────────────────────────────────────────────────────────

export function getInstrumentsList(): Record<string, unknown>[] {
  const instruments = useInstrumentStore.getState().instruments;
  const cedResults = useInstrumentTypeStore.getState().results;
  if (instruments.length > 0) {
    return instruments.map((inst) => {
      const ced = cedResults.get(inst.id);
      return {
        id: inst.id,
        name: inst.name,
        type: inst.type,
        synthType: inst.synthType,
        ...(ced ? { cedType: ced.instrumentType, cedConfidence: ced.confidence } : {}),
      };
    });
  }
  // Fallback: check TrackerReplayer song for imported module instruments
  try {
    // getTrackerReplayer imported at top level
    const replayer = getTrackerReplayer();
    const song = replayer?.getSong();
    if (song?.instruments?.length) {
      return song.instruments.map((inst: { id: number; name: string; type?: string; synthType?: string }) => ({
        id: inst.id,
        name: inst.name,
        type: inst.type ?? 'sample',
        synthType: inst.synthType ?? 'TrackerSample',
      }));
    }
  } catch { /* replayer not available */ }
  return [];
}

export function getInstrument(params: Record<string, unknown>): Record<string, unknown> {
  const id = params.id as number;
  const inst = useInstrumentStore.getState().getInstrument(id);
  if (!inst) return { error: `Instrument ${id} not found` };

  return JSON.parse(JSON.stringify(inst, (_key, value) => {
    if (value instanceof ArrayBuffer || value instanceof Uint8Array) return undefined;
    return value;
  }));
}

export function getCurrentInstrument(): Record<string, unknown> {
  const store = useInstrumentStore.getState();
  if (!store.currentInstrumentId) return { error: 'No instrument selected' };
  const inst = store.getInstrument(store.currentInstrumentId);
  if (!inst) return { error: `Instrument ${store.currentInstrumentId} not found` };
  return JSON.parse(JSON.stringify(inst, (_key, value) => {
    if (value instanceof ArrayBuffer || value instanceof Uint8Array) return undefined;
    return value;
  }));
}

// ─── Transport & Playback ──────────────────────────────────────────────────────

export function getPlaybackState(): Record<string, unknown> {
  const transport = useTransportStore.getState();
  return {
    isPlaying: transport.isPlaying,
    isPaused: transport.isPaused,
    isLooping: transport.isLooping,
    currentRow: transport.currentRow,
    currentPattern: transport.currentPatternIndex,
    currentGlobalRow: transport.currentGlobalRow,
    bpm: transport.bpm,
    speed: transport.speed,
    swing: transport.swing,
    jitter: transport.jitter,
    globalPitch: transport.globalPitch,
    metronomeEnabled: transport.metronomeEnabled,
    metronomeVolume: transport.metronomeVolume,
    countInEnabled: transport.countInEnabled,
    smoothScrolling: transport.smoothScrolling,
    grooveTemplateId: transport.grooveTemplateId,
    grooveSteps: transport.grooveSteps,
    loopStartRow: transport.loopStartRow,
    // Where a native engine says it is — what the pattern editor follows for
    // songs a WASM replayer plays by itself (Hippel, TFMX, JamCracker, ...).
    // `active` false: no engine is reporting, and the transport rows apply.
    enginePosition: (() => {
      const w = useWasmPositionStore.getState();
      return { active: w.active, row: w.row, songPos: w.songPos };
    })(),
  };
}

// ─── Cursor & Selection ────────────────────────────────────────────────────────

export function getCursor(): Record<string, unknown> {
  const cursor = useCursorStore.getState().cursor;
  return {
    row: cursor.rowIndex,
    channel: cursor.channelIndex,
    columnType: cursor.columnType,
    digitIndex: cursor.digitIndex,
  };
}

export function getSelection(): Record<string, unknown> {
  const sel = useCursorStore.getState().selection;
  if (!sel) return { hasSelection: false };
  return {
    hasSelection: true,
    startChannel: sel.startChannel,
    endChannel: sel.endChannel,
    startRow: sel.startRow,
    endRow: sel.endRow,
    startColumn: sel.startColumn,
    endColumn: sel.endColumn,
  };
}

// ─── Editor State ──────────────────────────────────────────────────────────────

export function getEditorState(): Record<string, unknown> {
  const editor = useEditorStore.getState();
  return {
    currentOctave: editor.currentOctave,
    recordMode: editor.recordMode,
    editStep: editor.editStep,
    insertMode: editor.insertMode,
    wrapMode: editor.wrapMode,
    followPlayback: editor.followPlayback,
    linearPeriods: editor.linearPeriods,
    multiChannelRecord: editor.multiChannelRecord,
    recordQuantize: editor.recordQuantize,
    autoRecord: editor.autoRecord,
    bookmarks: editor.bookmarks,
  };
}

// ─── Mixer ─────────────────────────────────────────────────────────────────────

export function getMixerState(): Record<string, unknown> {
  const mixer = useMixerStore.getState();
  const audio = useAudioStore.getState();
  return {
    masterVolume: audio.masterVolume,
    masterMuted: audio.masterMuted,
    sampleBusGain: audio.sampleBusGain,
    synthBusGain: audio.synthBusGain,
    autoGain: audio.autoGain,
    channels: mixer.channels.map((ch, i) => ({
      index: i,
      name: ch.name,
      volume: ch.volume,
      pan: ch.pan,
      muted: ch.muted,
      soloed: ch.soloed,
      effects: ch.effects,
      /** Send into the dub bus, 0-1. */
      dubSend: ch.dubSend,
    })),
  };
}

export function getChannelState(params: Record<string, unknown>): Record<string, unknown> {
  const ch = params.channel as number;
  const mixer = useMixerStore.getState();
  const channel = mixer.channels[ch];
  if (!channel) return { error: `Channel ${ch} not found` };
  return {
    index: ch,
    name: channel.name,
    volume: channel.volume,
    pan: channel.pan,
    muted: channel.muted,
    soloed: channel.soloed,
    effects: channel.effects,
  };
}

// ─── UI State ──────────────────────────────────────────────────────────────────

export function getUIState(): Record<string, unknown> {
  const ui = useUIStore.getState();
  return {
    activeView: ui.activeView,
    trackerViewMode: ui.trackerViewMode,
    trackerZoom: ui.trackerZoom,
    useHexNumbers: ui.useHexNumbers,
    oscilloscopeVisible: ui.oscilloscopeVisible,
    showPatterns: ui.showPatterns,
    showInstrumentPanel: ui.showInstrumentPanel,
    showFileBrowser: ui.showFileBrowser,
    sidebarCollapsed: ui.sidebarCollapsed,
    showAutomationLanes: ui.showAutomationLanes,
    showBeatLabels: ui.showBeatLabels,
    blankEmptyCells: ui.blankEmptyCells,
    rowHighlightInterval: ui.rowHighlightInterval,
    chordEntryMode: ui.chordEntryMode,
    statusMessage: ui.statusMessage,
    performanceQuality: ui.performanceQuality,
    modalOpen: ui.modalOpen,
    dialogOpen: ui.dialogOpen,
  };
}

// ─── History ───────────────────────────────────────────────────────────────────

export function getHistoryState(): Record<string, unknown> {
  const history = useHistoryStore.getState();
  return {
    undoCount: history.undoStack.length,
    redoCount: history.redoStack.length,
    canUndo: history.undoStack.length > 0,
    canRedo: history.redoStack.length > 0,
  };
}

// ─── Main thread profile ───────────────────────────────────────────────────────

interface ProfilerTrace {
  resources: string[];
  frames: Array<{ name?: string; resourceId?: number; line?: number; column?: number }>;
  stacks: Array<{ frameId: number; parentId?: number }>;
  samples: Array<{ timestamp: number; stackId?: number }>;
}

/**
 * Sample the main thread (JS Self-Profiling API, dev server sends
 * Document-Policy: js-profiling) and rank functions by self and total time.
 * Long-animation-frame attribution lists only scripts over 5 ms, so a flood
 * of small tasks - message handlers, timers - is invisible to it; sampling is
 * not.
 */
export async function profileMainThread(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const P = (globalThis as unknown as { Profiler?: new (o: { sampleInterval: number; maxBufferSize: number }) => { stop(): Promise<ProfilerTrace> } }).Profiler;
  if (!P) return { available: false, note: 'JS Self-Profiling API unavailable (needs Chrome and the Document-Policy: js-profiling header; reload after the dev server restarts)' };
  const ms = typeof params.ms === 'number' ? Math.min(20000, Math.max(500, params.ms)) : 3000;
  let profiler;
  try { profiler = new P({ sampleInterval: 10, maxBufferSize: 100000 }); } catch (e) { return { available: false, note: String(e) }; }
  await new Promise((r) => setTimeout(r, ms));
  const trace = await profiler.stop();
  const label = (fid: number): string => {
    const f = trace.frames[fid];
    const res = f.resourceId !== undefined ? trace.resources[f.resourceId] : '';
    const file = String(res).replace(location.origin, '').replace(/\?.*$/, '').replace('/src/', '').replace(/^\/node_modules\/\.vite\/deps\//, 'deps/');
    return `${f.name || '(anonymous)'} ${file}${f.line ? ':' + f.line : ''}`;
  };
  const self = new Map<string, number>();
  const total = new Map<string, number>();
  let idle = 0;
  for (const s of trace.samples) {
    if (s.stackId === undefined) { idle++; continue; }
    const seen = new Set<string>();
    let sid: number | undefined = s.stackId;
    let first = true;
    while (sid !== undefined) {
      const st: ProfilerTrace["stacks"][number] = trace.stacks[sid];
      const name = label(st.frameId);
      if (first) { self.set(name, (self.get(name) ?? 0) + 1); first = false; }
      if (!seen.has(name)) { total.set(name, (total.get(name) ?? 0) + 1); seen.add(name); }
      sid = st.parentId;
    }
  }
  const n = trace.samples.length || 1;
  const rank = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
    .map(([k, v]) => `${(100 * v / n).toFixed(1)}% ${k}`);
  return { available: true, ms, samples: trace.samples.length, idlePct: +(100 * idle / n).toFixed(1), self: rank(self), total: rank(total) };
}

// ─── Audio thread profile ──────────────────────────────────────────────────────

/** Audio-thread time per worklet processor over a window (dev builds). */
export async function getAudioWorkletProfile(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { readWorkletProfile, readNodeCensus } = await import('../../engine/audio/workletProfiler');
  const windowMs = typeof params.windowMs === 'number' ? Math.min(10000, Math.max(250, params.windowMs)) : 2000;
  const entries = await readWorkletProfile(windowMs);
  if (!entries) return { installed: false, note: 'profiler not installed (dev build and cross-origin isolation needed; reload after first install)' };
  const total = entries.reduce((s, e) => s + e.msPerSecond, 0);
  return { installed: true, windowMs, totalMsPerSecond: +total.toFixed(1), processors: entries, nodes: readNodeCensus() };
}

// ─── Oscilloscope Data ─────────────────────────────────────────────────────────

export function getOscilloscopeInfo(): Record<string, unknown> {
  const osc = useOscilloscopeStore.getState();
  return {
    isActive: osc.isActive,
    numChannels: osc.numChannels,
    channelNames: osc.channelNames,
    hasData: osc.channelData.some((d) => d !== null),
    // Per channel: how many unbroken samples the analysis tap holds (32768 =
    // a full CED window; the spectral classifier needs 2048). null: this
    // engine sends display snapshots only.
    analysisAudio: channelAudioContiguity(Math.max(osc.numChannels, osc.channelData.length)),
  };
}

/** Search for patterns of notes across all channels */
export function searchPattern(params: Record<string, unknown>): Record<string, unknown> {
  const tracker = useTrackerStore.getState();
  const patternIndex = (params.patternIndex as number | undefined) ?? tracker.currentPatternIndex;
  const pattern = tracker.patterns[patternIndex];
  if (!pattern) return { error: `Pattern ${patternIndex} not found` };

  const noteFilter = params.note as number | undefined;
  const instrumentFilter = params.instrument as number | undefined;
  const effectFilter = params.effTyp as number | undefined;
  const channelFilter = params.channel as number | undefined;

  const results: Record<string, unknown>[] = [];
  for (let c = 0; c < pattern.channels.length; c++) {
    if (channelFilter !== undefined && c !== channelFilter) continue;
    for (let r = 0; r < pattern.length; r++) {
      const cell = pattern.channels[c]?.rows[r];
      if (!cell) continue;
      let match = false;
      if (noteFilter !== undefined && cell.note === noteFilter) match = true;
      if (instrumentFilter !== undefined && cell.instrument === instrumentFilter) match = true;
      if (effectFilter !== undefined && cell.effTyp === effectFilter) match = true;
      if (match) {
        results.push({ channel: c, row: r, ...formatCell(cell) });
      }
    }
  }

  return { patternIndex, matchCount: results.length, results };
}

/** Get pattern statistics — note density, instrument usage, effect usage */
export function getPatternStats(params: Record<string, unknown>): Record<string, unknown> {
  const tracker = useTrackerStore.getState();
  const patternIndex = (params.patternIndex as number | undefined) ?? tracker.currentPatternIndex;
  const pattern = tracker.patterns[patternIndex];
  if (!pattern) return { error: `Pattern ${patternIndex} not found` };

  let totalCells = 0;
  let noteCells = 0;
  let effectCells = 0;
  const noteCount: Record<string, number> = {};
  const instrumentUsage: Record<number, number> = {};
  const effectUsage: Record<string, number> = {};

  for (let c = 0; c < pattern.channels.length; c++) {
    for (let r = 0; r < pattern.length; r++) {
      totalCells++;
      const cell = pattern.channels[c]?.rows[r];
      if (!cell) continue;
      if (cell.note > 0 && cell.note < 97) {
        noteCells++;
        const noteStr = noteToString(cell.note);
        noteCount[noteStr] = (noteCount[noteStr] || 0) + 1;
      }
      if (cell.instrument > 0) {
        instrumentUsage[cell.instrument] = (instrumentUsage[cell.instrument] || 0) + 1;
      }
      if (cell.effTyp > 0) {
        effectCells++;
        const key = `${formatHex(cell.effTyp, 1)}xx`;
        effectUsage[key] = (effectUsage[key] || 0) + 1;
      }
    }
  }

  return {
    patternIndex,
    totalCells,
    noteCells,
    effectCells,
    noteDensity: totalCells > 0 ? +(noteCells / totalCells * 100).toFixed(1) : 0,
    uniqueNotes: Object.keys(noteCount).length,
    noteDistribution: noteCount,
    instrumentUsage,
    effectUsage,
  };
}

/** Diff two patterns — shows what's different */
export function diffPatterns(params: Record<string, unknown>): Record<string, unknown> {
  const tracker = useTrackerStore.getState();
  const a = params.patternA as number;
  const b = params.patternB as number;
  const patA = tracker.patterns[a];
  const patB = tracker.patterns[b];
  if (!patA) return { error: `Pattern ${a} not found` };
  if (!patB) return { error: `Pattern ${b} not found` };

  const diffs: Record<string, unknown>[] = [];
  const maxRows = Math.max(patA.length, patB.length);
  const maxChs = Math.max(patA.channels.length, patB.channels.length);

  for (let c = 0; c < maxChs; c++) {
    for (let r = 0; r < maxRows; r++) {
      const cellA = patA.channels[c]?.rows[r];
      const cellB = patB.channels[c]?.rows[r];
      const aNote = cellA?.note ?? 0;
      const bNote = cellB?.note ?? 0;
      const aInst = cellA?.instrument ?? 0;
      const bInst = cellB?.instrument ?? 0;
      const aVol = cellA?.volume ?? 0;
      const bVol = cellB?.volume ?? 0;
      const aEff = cellA?.effTyp ?? 0;
      const bEff = cellB?.effTyp ?? 0;
      const aEffP = cellA?.eff ?? 0;
      const bEffP = cellB?.eff ?? 0;

      if (aNote !== bNote || aInst !== bInst || aVol !== bVol || aEff !== bEff || aEffP !== bEffP) {
        diffs.push({
          channel: c,
          row: r,
          a: { note: aNote, noteStr: noteToString(aNote), instrument: aInst, volume: aVol, effTyp: aEff, eff: aEffP },
          b: { note: bNote, noteStr: noteToString(bNote), instrument: bInst, volume: bVol, effTyp: bEff, eff: bEffP },
        });
      }
    }
  }

  return { patternA: a, patternB: b, diffCount: diffs.length, diffs };
}

// ─── Audio Diagnostics ─────────────────────────────────────────────────────────

export function getAudioState(): Record<string, unknown> {
  const audio = useAudioStore.getState();
  const dj = useDJStore.getState();

  // DJ mixer diagnostics (when DJ mode is active)
  let djDiag: Record<string, unknown> | undefined;
  if (dj.djModeActive) {
    try {
      const engine = getDJEngineIfActive();
      if (engine) {
        const mixer = engine.mixer;
        djDiag = {
          mixerMasterGain: mixer.getMasterVolume(),
          mixerMasterLevel: mixer.getMasterLevel(),
          crossfader: mixer.getCrossfader(),
          deckA: {
            isPlaying: dj.decks.A.isPlaying,
            isLoaded: dj.decks.A.fileName !== null,
            volume: dj.decks.A.volume,
            meterLevel: engine.deckA.meter.getValue(),
          },
          deckB: {
            isPlaying: dj.decks.B.isPlaying,
            isLoaded: dj.decks.B.fileName !== null,
            volume: dj.decks.B.volume,
            meterLevel: engine.deckB.meter.getValue(),
          },
        };
      }
    } catch { /* DJ engine not available */ }
  }

  let engineIsPlaying: boolean | undefined;
  try { engineIsPlaying = (getToneEngine() as unknown as { _isPlaying?: boolean })._isPlaying; } catch { /* not ready */ }
  return {
    initialized: audio.initialized,
    contextState: audio.contextState,
    /** ToneEngine's own playing flag - it gates the vinyl / Tumult noise layers. */
    engineIsPlaying,
    masterVolume: audio.masterVolume,
    masterMuted: audio.masterMuted,
    sampleBusGain: audio.sampleBusGain,
    synthBusGain: audio.synthBusGain,
    autoGain: audio.autoGain,
    masterEffects: audio.masterEffects.map((fx) => ({
      id: fx.id,
      type: fx.type,
      category: fx.category,
      enabled: fx.enabled,
      wet: fx.wet,
      parameters: fx.parameters,
    })),
    ...(djDiag ? { dj: djDiag } : {}),
  };
}

// ─── Dub Bus ───────────────────────────────────────────────────────────────────
// Diagnostic for the shared DubBus — bus enabled state, settings, which tracker
// channels have registered taps (i.e. have received audio from the multi-output
// worklet). Returns null fields when the bus hasn't been created yet.

export async function getDubBusState(): Promise<Record<string, unknown>> {
  // DrumPadEngine owns the DubBus; it may not exist yet if the user never
  // mounted tracker/drumpad/DJ view.
  const dpEngine = getDrumPadEngine();
  const bus = dpEngine?.getDubBus() ?? null;
  const storeSettings = useDrumPadStore.getState().dubBus;

  // Dub-send values from the mixer store (what the user has dialed).
  const mixer = useMixerStore.getState();
  const channelDubSends = mixer.channels.map((c, i) => ({ index: i, dubSend: c.dubSend }));

  // Private field access via cast — MCP diagnostic only. Production code
  // never reads these directly; they're here so the gig-sim can confirm the
  // bus actually received the tap registrations from ChannelRoutedEffects.
  let registeredChannelTaps: number[] = [];
  if (bus) {
    const busAny = bus as unknown as { channelTaps: Map<number, GainNode> };
    registeredChannelTaps = Array.from(busAny.channelTaps.keys()).sort((a, b) => a - b);
  }

  // Dry-path probe — every gain the master signal passes through when the
  // bus's master insert is spliced in (masterEffectsInput → insert → blepInput).
  // A hard-zero master with the transport ticking means one of these is 0 or
  // the splice is broken; this is how that gets located without a debugger.
  // Bracket access on purpose: reads the LIVE instance, survives HMR of this
  // file, and never becomes a production dependency on DubBus internals.
  const g = (node: unknown): number | null => {
    const p = (node as { gain?: { value?: number } } | null | undefined)?.gain;
    return typeof p?.value === 'number' ? Number(p.value.toFixed(4)) : null;
  };
  let insertProbe: Record<string, unknown> | null = null;
  if (bus) {
    const b = bus as unknown as Record<string, unknown>;
    const ta = b.toneArmEffect as { wet?: number; wetGain?: unknown; dryGain?: unknown } | null;
    const vn = b.vinylEffect as { wet?: number; wetGain?: unknown; dryGain?: unknown } | null;
    let toneMaster: Record<string, unknown> = {};
    try {
      const te = getToneEngine() as unknown as Record<string, unknown>;
      const mc = te.masterChannel as { volume?: { value?: number }; mute?: boolean } | undefined;
      toneMaster = {
        masterChannelVolumeDb: mc?.volume?.value ?? null,
        masterChannelMute: mc?.mute ?? null,
        masterVolumeDbTarget: te._masterVolumeDb ?? null,
        masterEffectsInputGain: g(te.masterEffectsInput),
        blepInputGain: g(te.blepInput),
      };
    } catch { /* engine not ready */ }
    insertProbe = {
      masterInsertActive: b.masterInsertActive ?? null,
      masterInsertPending: b.masterInsertPending != null,
      hasSource: !!b.masterInsertSource,
      hasDest: !!b.masterInsertDest,
      envelope: g(b.masterInsertEnvelope),
      masterMid: g(b.masterMid),
      masterSide: g(b.masterSide),
      masterInvertR: g(b.masterInvertR),
      // The BASS control as it is actually applied: small-signal lift of the
      // low band in dB, and the ceiling its peaks are bound to.
      masterBassDb: (() => {
        const d = g(b.lowDrive);
        const c = g(b.lowOut);
        return d != null && c != null && d * c > 0 ? 20 * Math.log10(d * c) : null;
      })(),
      masterLowCeiling: g(b.lowOut),
      returnBypassesLowEnd: (b as { returnBypassesLowEnd?: boolean }).returnBypassesLowEnd ?? null,
      trimRideDb: (b as { trimRideDb?: number }).trimRideDb ?? null,
      returnGovernorDb: (b as { returnGovernorDb?: number }).returnGovernorDb ?? null,
      returnTrim: g(b.returnTrim),
      masterToneTrim: g(b.masterToneTrim),
      masterLowMidDipDb: (b.masterLowMidDip as { gain?: { value?: number } } | undefined)?.gain?.value ?? null,
      masterHpfHz: (b.masterHpf as { frequency?: { value?: number } } | undefined)?.frequency?.value ?? null,
      // What each colour stage is contributing right now — 0 means the stage
      // is not in circuit, whatever its settings say.
      colourStageGains: (b as { colourStageGains?: Record<string, number | null> }).colourStageGains ?? null,
      convolverDry: g(b.masterConvolverDry),
      convolverWet: g(b.masterConvolverWet),
      chorusWet: g(b.masterChorusWet),
      vinylDirect: g(b.vinylDirect),
      vinylOutput: g(b.vinylOutputNode),
      toneArmWet: ta?.wet ?? null,
      toneArmWetGain: g(ta?.wetGain),
      toneArmDryGain: g(ta?.dryGain),
      vinylWet: vn?.wet ?? null,
      vinylWetGain: g(vn?.wetGain),
      vinylDryGain: g(vn?.dryGain),
      busInput: g(b.input),
      busReturn: g(b.return_),
      ...toneMaster,
    };
    // Engine-side main-mix masks: an isolation slot removes its channels from
    // the main module (worklet recomputeMainMask_), so a stale slot mutes them
    // at the source — nothing downstream can bring that back.
    try {
      const { LibopenmptEngine } = await import('../../engine/libopenmpt/LibopenmptEngine');
      if (LibopenmptEngine.hasInstance()) {
        const eng = LibopenmptEngine.getInstance() as unknown as Record<string, unknown>;
        insertProbe.libopenmptIsolationSlotMasks = eng._isolationSlotMasks ?? null;
        // The engine's own output gain: stop() writes 0, resume() writes 1.
        insertProbe.libopenmptOutputGain = g(eng.gainNode);
        insertProbe.libopenmptHasWorklet = !!eng.workletNode;
        // The decisive one: what the worklet itself is doing. `silentReason`
        // and `lastRenderRms` separate "the module rendered silence" from
        // "audio was produced and swallowed later".
        //
        // NOTE on the mask, because it reads backwards: in `userMuteMask` a SET
        // bit means the channel is AUDIBLE (`applyChannelIsolation_`:
        // `active = mask & (1<<ch)`, then `mute(ch, active ? 0 : 1)`). So
        // `65535` is everything PLAYING, not everything muted. Misreading that
        // on 2026-09-19 produced a confident diagnosis of a mute leak that did
        // not exist; the module was rendering silence with every channel
        // audible.
        // null means the worklet did not answer within the timeout.
        insertProbe.workletDiag = await LibopenmptEngine.getInstance().getWorkletDiag();
      }
    } catch { /* engine module not loaded */ }
  }

  return {
    hasBus: !!bus,
    // BLEED ("Ghost Bus"): closed channels feed the bus at the floor
    // (effectiveDubSend). Lives in useDubStore, not the bus settings.
    bleed: useDubStore.getState().ghostBus,
    // The bus's own state (drain flags, live gains) and what the echo engine
    // is actually running with - a knob that moves the store but not the
    // engine is only visible here.
    diagnostic: bus?.getDiagnosticSnapshot?.() ?? null,
    // Desired-vs-actual per parameter. `diagnostic` is a flat bag that mixes
    // the two without saying which is which (its `echoRateMs` is the setting,
    // not the running delay time); this pairs them so a knob that fails to
    // reach the graph shows a non-zero delta instead of reading as "nothing
    // happened".
    liveState: bus?.getLiveState?.() ?? null,
    echoEngineState: bus?.describeEcho?.() ?? null,
    storeSettings,
    // The bus's OWN settings, beside the store's. Moves write the bus directly
    // — ringMod, voltageStarve and eqSweep all call `setSettings` / `setReturnEQ`
    // on the instance — and the store never learns. Reading only the store,
    // `ringModEnabled` stayed false with Ring held and `returnEqEnabled` stayed
    // false through a whole EQ sweep (2026-09-23), and each time the absence
    // was read as the move not engaging. Where these two disagree, the bus is
    // what is playing.
    liveSettings: bus?.getSettings?.() ?? null,
    channelDubSends,
    registeredChannelTaps,
    insertProbe,
    // What the settings path costs, and how fast writes arrive. Drag a BUS
    // slider, then read this: a high peakPerSecond with a maxMs in the
    // milliseconds is main-thread contention, which is a crackle no amount of
    // parameter ramping can fix.
    settingsMeter: bus?.getSettingsMeter?.() ?? null,
    // RMS along the master insert. The first stage whose level collapses is
    // where the mix is being lost — the reading that settings values cannot give.
    masterInsertLevels: bus?.getMasterInsertLevels?.() ?? null,
    // And the stages BEFORE the bus, so "the insert receives nothing" can be
    // told from "the engine produces nothing". null means the tap was created
    // on this call and has not seen audio yet — read it again.
    upstreamLevels: await getUpstreamLevels(),
    // The Hively worklet's own count of what each render path produced. Only
    // present when that engine is the one playing.
    hivelyRenderStats: await (async () => {
      try {
        const g = globalThis as {
          __devilboxActiveHivelyEngine?: { getDubDiag?: () => Promise<unknown> } | null;
        };
        return (await g.__devilboxActiveHivelyEngine?.getDubDiag?.()) ?? null;
      } catch { return null; }
    })(),
  };
}


/**
 * Passive level taps on the nodes UPSTREAM of the dub bus.
 *
 * `masterInsertLevels` showed the master insert receiving nothing while the
 * transport advanced and the insert reported itself wired. That leaves one
 * question: is the engine producing audio into a node nobody is listening to,
 * or has it stopped producing at all? These answer it — engine output, the
 * synth bus it should feed, and the master effects input the insert is spliced
 * onto. The first one that is silent is where the chain is broken.
 *
 * Created on first read and kept, because an analyser must already be attached
 * when the audio passes; attaching one after the fact measures nothing. Passive:
 * a tap never alters what it measures.
 */
const _upstreamTaps = new Map<string, { node: AudioNode; analyser: AnalyserNode }>();

function _tapRms(name: string, node: AudioNode | null | undefined): number | null {
  if (!node) return null;
  let entry = _upstreamTaps.get(name);
  if (!entry || entry.node !== node) {
    // A node swap (engine rebuilt, bus recreated) invalidates the old tap.
    try {
      const analyser = node.context.createAnalyser();
      analyser.fftSize = 2048;
      node.connect(analyser);
      entry = { node, analyser };
      _upstreamTaps.set(name, entry);
      // Nothing has passed this tap yet; say so rather than report a false zero.
      return null;
    } catch {
      return -1;
    }
  }
  try {
    const buf = new Float32Array(entry.analyser.fftSize);
    entry.analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.round(Math.sqrt(sum / buf.length) * 1e6) / 1e6;
  } catch {
    return -1;
  }
}

/** RMS at the engine output, the synth bus and the master effects input. */
async function getUpstreamLevels(): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  try {
    const g = globalThis as {
      __devilboxActiveHivelyEngine?: { output?: AudioNode } | null;
      __devilboxActiveKlysEngine?: { output?: AudioNode } | null;
      __devilboxActiveCinter4Engine?: { output?: AudioNode } | null;
    };
    const engine = g.__devilboxActiveHivelyEngine
      ?? g.__devilboxActiveKlysEngine
      ?? g.__devilboxActiveCinter4Engine
      ?? null;
    out.engineOut = _tapRms('engineOut', engine?.output ?? null);
  } catch { out.engineOut = -1; }
  try {
    const { getToneEngine } = await import('@engine/ToneEngine');
    const { getNativeAudioNode } = await import('@/utils/audio-context');
    const te = getToneEngine() as unknown as { synthBus?: unknown; masterEffectsInput?: unknown };
    out.synthBus = _tapRms('synthBus', getNativeAudioNode(te.synthBus as never));
    out.masterEffectsInput = _tapRms('masterEffectsInput', getNativeAudioNode(te.masterEffectsInput as never));
    out.masterInput = _tapRms('masterInput', getNativeAudioNode((te as { masterInput?: unknown }).masterInput as never));
    out.blepInput = _tapRms('blepInput', getNativeAudioNode((te as { blepInput?: unknown }).blepInput as never));

    // The two nodes between the engine and the master: the synth instance's
    // own output, and the instrument effect chain it feeds. The break is one
    // of the connections between these, and neither is reachable from a
    // global — they live in the engine's instrument maps.
    const engineAny = te as unknown as {
      instruments?: Map<number, unknown>;
      getInstrumentChainOutput?: (id: number, ch?: number) => unknown;
    };
    const entries = Array.from(engineAny.instruments?.entries() ?? []);
    // EVERY instance, not the first one found. The map is keyed by a composite
    // (instrumentId << 16 | channelIndex) and a stale instance can sit beside
    // the live one — reading only the first would report "the synth output is
    // silent" when the truth is "there are two and I measured the dead one".
    const hivelys = entries.filter(([, inst]) =>
      (inst as { constructor?: { name?: string } })?.constructor?.name === 'HivelySynth');
    out.hivelyInstanceCount = hivelys.length;
    const perInstance: Record<string, number | null> = {};
    for (const [key, inst] of hivelys) {
      perInstance[`inst${key}`] =
        _tapRms(`synthOutput:${key}`, (inst as { output?: AudioNode }).output ?? null);
      perInstance[`inst${key}.chain`] = _tapRms(
        `chainOutput:${key}`,
        getNativeAudioNode(engineAny.getInstrumentChainOutput?.(key >> 16, key & 0xffff) as never),
      );
      // An RMS of 0 has two causes and they need different fixes: the gain was
      // written to 0, or the engine is no longer connected to this output at
      // all. Report the gain so the two can be told apart.
      const outNode = (inst as { output?: GainNode }).output;
      perInstance[`inst${key}.gain`] =
        typeof outNode?.gain?.value === 'number' ? outNode.gain.value : null;
      // And whether this instance still believes it owns the engine hookup.
      perInstance[`inst${key}.ownsEngineConnection`] =
        ((inst as { _ownsEngineConnection?: boolean })._ownsEngineConnection ? 1 : 0);
      perInstance[`inst${key}.disposed`] =
        ((inst as { _disposed?: boolean })._disposed ? 1 : 0);
    }
    out.hivelyInstances = perInstance as unknown as number | null;
    // Is the synth holding the engine that is actually PLAYING?
    //
    // This codebase already works around Vite module duplication elsewhere
    // ("the cached class differs from the one playing"), and
    // `__devilboxActiveHivelyEngine` exists for exactly that reason. If the
    // synth's engine is a different copy, it wired its output to a silent
    // engine and no amount of connection-lifecycle work would fix it.
    try {
      const live = (globalThis as { __devilboxActiveHivelyEngine?: { output?: AudioNode } })
        .__devilboxActiveHivelyEngine?.output;
      const held = (hivelys[0]?.[1] as { engine?: { output?: AudioNode } })?.engine?.output;
      out.synthHoldsLiveEngine = (live && held ? (live === held ? 1 : 0) : null) as number | null;
    } catch { out.synthHoldsLiveEngine = -1; }
    const hively = hivelys[0];
    if (hively) {
      const [id, inst] = hively;
      out.synthOutput = _tapRms('synthOutput', (inst as { output?: AudioNode }).output ?? null);
      const chain = engineAny.getInstrumentChainOutput?.(id);
      out.chainOutput = _tapRms('chainOutput', getNativeAudioNode(chain as never));
      out.hivelyInstrumentId = id;
    } else {
      out.synthOutput = null;
      out.chainOutput = null;
    }
  } catch {
    out.synthBus = -1;
    out.masterEffectsInput = -1;
  }
  return out;
}

// ─── Playback silence watchdog ───────────────────────────────────────────────

/**
 * "It says it is playing, and there is no sound."
 *
 * The worklet has computed `silentReason` for a long time and nothing read it
 * during playback, so the failure was invisible until a person noticed the room
 * had gone quiet. This is the read that makes it observable.
 *
 * The clock lives at module scope so duration survives between polls; the
 * judgement itself is pure and tested in `playbackSilenceWatchdog`.
 */
const _silenceClock = new SilenceClock();

export async function getPlaybackSilence(): Promise<Record<string, unknown>> {
  // Self-arming: the fault this watches for appears minutes after anyone asks
  // about it, and looking at the UI repairs it. Sampling has to be running
  // before the question is asked, so the first read starts it.
  const { armSilenceSnapshot, getSilenceSnapshot, getSilenceHistory, watchGainParam, getGainWrites } =
    await import('../diagnostics/silenceSnapshot');
  armSilenceSnapshot();
  // Instrument every live native-synth output gain, so a write that no call
  // site admits to still names its caller.
  try {
    const te = (await import('@engine/ToneEngine')).getToneEngine() as unknown as {
      instruments?: Map<number, { output?: GainNode }>;
    };
    for (const [key, inst] of te.instruments?.entries() ?? []) {
      const g = inst?.output?.gain;
      if (g) watchGainParam(g, `inst${key}`);
    }
  } catch { /* engine not up yet */ }

  const transport = useTransportStore.getState();
  const { useAudioStore } = await import('../../stores/useAudioStore');
  const masterMuted = useAudioStore.getState().masterMuted;

  let lastRenderRms = 0;
  let silentReason: string | null = null;
  let diagAvailable = false;
  let source = 'none';
  try {
    const { LibopenmptEngine } = await import('../../engine/libopenmpt/LibopenmptEngine');
    if (LibopenmptEngine.hasInstance()) {
      const diag = await LibopenmptEngine.getInstance().getWorkletDiag();
      if (diag) {
        diagAvailable = true;
        source = 'libopenmpt-worklet';
        lastRenderRms = typeof diag.lastRenderRms === 'number' ? diag.lastRenderRms : 0;
        silentReason = typeof diag.silentReason === 'string' ? diag.silentReason : null;
      }
    }
  } catch { /* engine module not loaded */ }

  // Fall back to the master meter for every engine that is NOT libopenmpt.
  //
  // The worklet diag only exists for libopenmpt, so this read answered
  // `diagAvailable: false` and judged nothing for Hively/AHX, UADE, Furnace and
  // the rest — which is precisely the class of song reported as going silent
  // (`jennipha.ahx`, 2026-09-21). A watchdog blind to the engine in question is
  // no watchdog.
  //
  // The master meter is a weaker signal: it measures what reached the output,
  // so it cannot say WHERE the audio was lost the way `silentReason` can. It is
  // enough to answer the question actually being asked — is there sound.
  if (!diagAvailable) {
    try {
      const { AudioDataBus } = await import('../../engine/vj/AudioDataBus');
      const bus = AudioDataBus.getShared();
      bus.update();
      const frame = bus.getFrame();
      if (typeof frame.rms === 'number') {
        diagAvailable = true;
        source = 'master-meter';
        lastRenderRms = frame.rms;
        silentReason = null;
      }
    } catch { /* no audio graph yet */ }
  }

  // Without a worklet answer there is nothing to judge: treat it as audible
  // rather than invent a fault out of a missing measurement.
  const silentNow = diagAvailable && transport.isPlaying && lastRenderRms <= 0;
  const silentForSec = _silenceClock.observe(Date.now(), silentNow);

  // The row counter is the only evidence here that the transport is live; a
  // frozen one is a different fault and the judge says so rather than claiming
  // this one.
  const rowsAdvancing = _rowsAdvancing(transport.currentGlobalRow, transport.currentRow);

  const verdict = judgePlaybackSilence({
    isPlaying: transport.isPlaying,
    rowsAdvancing,
    lastRenderRms,
    silentReason,
    silentForSec,
    masterMuted,
  });

  return {
    verdict: verdict.kind,
    message: describeSilenceVerdict(verdict),
    silentForSec: Math.round(silentForSec * 10) / 10,
    graceSec: SILENCE_GRACE_SEC,
    diagAvailable,
    /** Where lastRenderRms came from — the worklet knows more than the meter. */
    source,
    lastRenderRms,
    silentReason,
    isPlaying: transport.isPlaying,
    masterMuted,
    rowsAdvancing,
    currentRow: transport.currentRow,
    currentGlobalRow: transport.currentGlobalRow,
    /**
     * The graph as it was at the FIRST silence since arming, not as it is now.
     * Null until playback actually goes quiet. Clear it with
     * `clear_silence_snapshot` to catch the next one.
     */
    firstSilenceSnapshot: getSilenceSnapshot(),
    /** The last 15 master-meter samples, oldest first. */
    meterHistory: getSilenceHistory().slice(-15),
    /**
     * The handful of numbers that actually locate a break, read live.
     *
     * The full `get_dub_bus_state` payload answers this too, but it is
     * thousands of lines of settings for six readings, and chasing a fault
     * needs those six often.
     */
    /** Every write to a native synth output gain since arming, newest last. */
    gainWrites: getGainWrites(),
    live: await (async () => {
      try {
        const levels = await getUpstreamLevels();
        const te = (await import('@engine/ToneEngine')).getToneEngine() as unknown as {
          nativeEngineRouting?: Map<string, { destinations?: Set<unknown> }>;
        };
        const routing: Record<string, number> = {};
        for (const [k, v] of te.nativeEngineRouting?.entries() ?? []) {
          routing[k] = v.destinations?.size ?? -1;
        }
        // The bus's own input and return, so a sweep of an echo parameter can
        // be measured without pulling the whole `get_dub_bus_state` payload
        // for every step.
        const { getActiveDubBus } = await import('../../engine/dub/DubBus');
        const bus = getActiveDubBus();
        const insert = bus?.getMasterInsertLevels?.() as
          { busInput?: number; busReturn?: number } | null | undefined;
        // The master-insert chain, stage by stage, plus the EQ values the bus
        // actually holds. Auditing a BUS-tab slider means asking three
        // separate questions — did the store change, did the BUS receive it,
        // and did the audio change — and this answers the last two without
        // the full `get_dub_bus_state` payload per step.
        const g = (n: unknown): number | null => {
          const v = (n as { gain?: { value?: number } } | null | undefined)?.gain?.value;
          return typeof v === 'number' ? Math.round(v * 1000) / 1000 : null;
        };
        const b = bus as unknown as Record<string, unknown> | null;
        return {
          ...levels,
          nativeRouting: routing,
          busInput: insert?.busInput ?? null,
          busReturn: insert?.busReturn ?? null,
          insertChain: insert,
          eqOnBus: b ? {
            bassShelfDb: (b.masterBassShelf as { gain?: { value?: number } } | undefined)?.gain?.value ?? null,
            midScoopDb: (b.masterMidScoop as { gain?: { value?: number } } | undefined)?.gain?.value ?? null,
            hpfHz: (b.masterHpf as { frequency?: { value?: number } } | undefined)?.frequency?.value ?? null,
            midGain: g(b.masterMid),
            sideGain: g(b.masterSide),
          } : null,
        };
      } catch { return null; }
    })(),
  };
}

/** Throw away a captured silence snapshot so the next fault can be caught. */
export async function clearSilenceSnapshot(): Promise<Record<string, unknown>> {
  const mod = await import('../diagnostics/silenceSnapshot');
  mod.clearSilenceSnapshot();
  mod.armSilenceSnapshot();
  return { ok: true };
}

/** Did the transport row move since the previous poll? */
let _lastSeenRow: { global: number; row: number } | null = null;
function _rowsAdvancing(globalRow: number, row: number): boolean {
  const prev = _lastSeenRow;
  _lastSeenRow = { global: globalRow, row };
  // First poll has nothing to compare against; do not call a stall on it.
  if (!prev) return true;
  return prev.global !== globalRow || prev.row !== row;
}

// ─── Auto Dub — autonomous dub-move performer (2026-04-21) ───────────────────

export async function getAutoDubState(): Promise<Record<string, unknown>> {
  const { useDubStore } = await import('../../stores/useDubStore');
  const { isAutoDubRunning, getAutoDubFireLogEntries } = await import('../../engine/dub/AutoDub');
  const { getAutoEqDiag } = await import('../../engine/dub/AutoEQDriver');
  const s = useDubStore.getState();
  return {
    enabled: s.autoDubEnabled,
    persona: s.autoDubPersona,
    intensity: s.autoDubIntensity,
    moveBlacklist: s.autoDubMoveBlacklist,
    isRunning: isAutoDubRunning(),
    recentEventCount: getAutoDubFireLogEntries().length,
    // Why the EQ is or is not moving — every gate in the improv driver is an
    // early return, so without this the panel looks the same whether the
    // driver is inert or holding still.
    autoEq: getAutoEqDiag(),
  };
}

/** Returns the ring buffer of move IDs chosen by the Auto Dub tick loop
 *  since the last clearAutoDubFireLog call (or since the module loaded). */
export async function getAutoDubFireLog(): Promise<Record<string, unknown>> {
  const {
    getAutoDubFireLog: getLog,
    getAutoDubFireLogEntries: getEntries,
  } = await import('../../engine/dub/AutoDub');
  return {
    moves: Array.from(getLog()),
    entries: Array.from(getEntries()),
  };
}

/**
 * The performance journal (Gate M1): what was played, by whom, and why.
 *
 * Distinct from the fire log, which is a ring buffer of move ids for CI
 * assertions. This is the readable record — the AI's moves carry the intention
 * and the reason behind them, the user's carry no invented ones, and both are
 * in one document in the order they happened.
 */
export async function getPerformanceJournal(
  params: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const { getPerformanceJournal: read } = await import('../../engine/dub/performanceJournalBridge');
  const { formatJournal } = await import('../../lib/dub/performanceJournal');
  const journal = read();
  const limit = typeof params.limit === 'number' ? Math.max(1, Math.min(500, params.limit)) : 60;
  const entries = journal.entries.slice(-limit);
  return {
    version: journal.version,
    total: journal.entries.length,
    entries,
    text: formatJournal({ ...journal, entries }, limit),
  };
}

/**
 * Gate M1's last question: does what is saved play back as the journal says?
 *
 * The lanes are what plays; the journal only explains them. That separation
 * keeps a stale journal from corrupting a replay, and it is also how the two
 * drift apart unnoticed — edit a lane, delete an event, and the commentary
 * describes a performance nobody will hear. This names the difference.
 *
 * Reads the lane rather than firing it: a diagnostic that made a noise every
 * time you asked would be useless during a take.
 */
export async function verifyPerformanceJournal(
  params: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const { getPerformanceJournal: read } = await import('../../engine/dub/performanceJournalBridge');
  const { compareJournalToReplay, formatReplayReport, firesForPattern } =
    await import('../../lib/dub/journalReplay');
  const { useTrackerStore } = await import('../../stores/useTrackerStore');
  const { useAutomationStore } = await import('../../stores/useAutomationStore');

  const state = useTrackerStore.getState();
  const patternIndex = typeof params.patternIndex === 'number'
    ? params.patternIndex
    : state.currentPatternIndex;
  const pattern = state.patterns[patternIndex];
  if (!pattern) {
    return { error: `No pattern at index ${patternIndex}` };
  }

  const journal = read();
  // Curves are where a recording actually lives; the lane is legacy storage
  // that load-migration clears. Read both, or a modern take looks like it
  // never happened.
  const curves = useAutomationStore.getState().getCurves()
    .filter(c => c.patternId === pattern.id);
  const fires = firesForPattern(curves, pattern.dubLane);
  const report = compareJournalToReplay(journal, fires);
  return {
    patternIndex,
    journalEntries: journal.entries.length,
    dubCurves: curves.filter(c => c.parameter.startsWith('dub.')).length,
    firesExpected: fires.length,
    reproduces: report.reproduces,
    matched: report.matched,
    missing: report.missing,
    misplaced: report.misplaced,
    unexplained: report.unexplained,
    text: formatReplayReport(report),
  };
}

/** Start a clean take — the journal only, leaving lanes and cells alone. */
export async function clearPerformanceJournal(): Promise<Record<string, unknown>> {
  const { clearPerformanceJournal: clear } = await import('../../engine/dub/performanceJournalBridge');
  clear();
  return { ok: true };
}

/** Clears the Auto Dub fire log ring buffer. */
export async function clearAutoDubFireLog(): Promise<Record<string, unknown>> {
  const { clearAutoDubFireLog: clear } = await import('../../engine/dub/AutoDub');
  clear();
  return { ok: true };
}

/**
 * Report the currently-resolved channel role table + channel names that
 * Auto-Dub's rule engine targets. Merges the three-stage pipeline that
 * lives behind AutoDub:
 *   1. classifySongRoles (offline, richest pattern per channel)
 *   2. getAllRuntimeChannelRoles (runtime, live-tap FFT votes)
 *   3. mergeOfflineAndRuntimeRoles (promotion policy)
 *
 * Used by ui-smoke to assert role-targeted moves can land on a real
 * loaded song — the on-disk Mortimer Twang fixture has almost no bass,
 * so a Modland-loaded dub track is what actually exercises the full
 * pipeline end-to-end.
 */
export async function getChannelRoles(): Promise<Record<string, unknown>> {
  const { useTrackerStore } = await import('../../stores/useTrackerStore');
  const { useInstrumentStore } = await import('../../stores/useInstrumentStore');
  const { classifySongRoles, ownerLabelsFor } = await import('../analysis/ChannelNaming');
  const { getAllRuntimeChannelRoles, mergeOfflineAndRuntimeRoles } = await import('../analysis/ChannelAudioClassifier');
  const tracker = useTrackerStore.getState();
  const patterns = tracker.patterns;
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return { patternsLoaded: false, roles: [], names: [], offline: [], runtime: [] };
  }
  const insts = useInstrumentStore.getState().instruments;
  const lookup = new Map();
  for (const inst of insts) {
    if (inst && typeof inst.id === 'number') lookup.set(inst.id, inst);
  }
  const offline = classifySongRoles(patterns, lookup, tracker.patternOrder);
  const runtime = getAllRuntimeChannelRoles(offline.length);
  const merged = mergeOfflineAndRuntimeRoles(offline, runtime);

  // The instrument-first analysis the roles come from: what each instrument
  // is (with its evidence) and what each channel plays in each section.
  const { analyzeSong } = await import('../analysis/songAnalyzer');
  const analysis = analyzeSong(patterns, tracker.patternOrder, lookup, ownerLabelsFor(lookup));
  const instruments = [...analysis.instruments.values()].map((v) => ({
    id: v.id, name: v.name, role: v.role, confidence: Math.round(v.confidence * 100) / 100,
    ...(v.drumPart ? { drumPart: v.drumPart } : {}), ...(v.harmonyKind ? { harmonyKind: v.harmonyKind } : {}),
    onsets: v.usage.onsets, pitches: v.usage.pitches, channels: v.usage.channels,
    evidence: v.evidence.map((e) => `${e.source}${e.note ? ': ' + e.note : ''}`),
  }));
  const sections = analysis.timeline.map((secs) => secs.map((x) => ({
    from: x.fromOrder, to: x.toOrder, role: x.role, ...(x.also ? { also: x.also } : {}), instruments: x.instruments,
  })));

  const schema = patterns[0];
  const names = schema?.channels?.map((c) => c.name ?? null) ?? [];
  return {
    patternsLoaded: true,
    channelCount: offline.length,
    roles: merged,
    offline,
    runtime: runtime.map((h) => h ? { role: h.role, confidence: h.confidence, support: h.support } : null),
    names,
    channelRoles: analysis.channelRoles,
    sections,
    instruments,
    namesInformative: analysis.namesInformative,
  };
}

/**
 * Per-pattern channel evidence — Phase 1 of the Channel Intelligence plan.
 *
 * `get_channel_roles` answers "what is this channel", once, for the whole song.
 * This answers "what is measurably happening in this channel during this
 * pattern", which is the unit the plan's segment timeline is built from, and
 * the unit a validation corpus can be scored against.
 *
 * Walks the ORDER, so a pattern played twice appears twice: whether the two
 * instances carry the same musical identity is a later decision, and collapsing
 * them here would take it away.
 */
export async function getChannelEvidence(
  params: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const { useTrackerStore } = await import('../../stores/useTrackerStore');
  const { fingerprintSong } = await import('../analysis/channelEvidence');
  const tracker = useTrackerStore.getState();
  const patterns = tracker.patterns;
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return { patternsLoaded: false, entries: [] };
  }
  const order = Array.isArray(tracker.patternOrder) && tracker.patternOrder.length > 0
    ? tracker.patternOrder
    : patterns.map((_, i) => i);

  const channelFilter = typeof params.channel === 'number' ? params.channel : null;
  const song = fingerprintSong(patterns, order);
  const entries = song.map((e) => ({
    orderIndex: e.orderIndex,
    patternIndex: e.patternIndex,
    channels: channelFilter === null
      ? e.channels
      : e.channels.filter((c) => c.channelIndex === channelFilter),
  }));

  return {
    patternsLoaded: true,
    orderLength: order.length,
    channelCount: patterns[0]?.channels?.length ?? 0,
    names: patterns[0]?.channels?.map((c) => c.name ?? null) ?? [],
    entries,
  };
}

/**
 * Per-channel behaviour segments — Phase 4 of the Channel Intelligence plan.
 *
 * `get_channel_roles` gives one role per channel for the whole song.
 * `get_channel_evidence` gives measurements per channel per pattern. This sits
 * between them: runs of order positions where a channel is doing the same
 * thing, with the reason each run began.
 */
export async function getChannelSegments(
  params: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const { useTrackerStore } = await import('../../stores/useTrackerStore');
  const { buildChannelSegments } = await import('../analysis/channelSegments');
  const tracker = useTrackerStore.getState();
  const patterns = tracker.patterns;
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return { patternsLoaded: false, channels: [] };
  }
  const order = Array.isArray(tracker.patternOrder) && tracker.patternOrder.length > 0
    ? tracker.patternOrder
    : patterns.map((_, i) => i);

  const all = buildChannelSegments(patterns, order);
  const channelFilter = typeof params.channel === 'number' ? params.channel : null;
  return {
    patternsLoaded: true,
    orderLength: order.length,
    channelCount: all.length,
    names: patterns[0]?.channels?.map((c) => c.name ?? null) ?? [],
    channels: all
      .map((segments, channelIndex) => ({ channelIndex, segments }))
      .filter((c) => channelFilter === null || c.channelIndex === channelFilter),
  };
}

// ─── Synth Errors ──────────────────────────────────────────────────────────────

export function getSynthErrors(): Record<string, unknown> {
  const store = useSynthErrorStore.getState();
  return {
    count: store.errors.length,
    activeError: store.activeError ? {
      id: store.activeError.id,
      synthType: store.activeError.synthType,
      synthName: store.activeError.synthName,
      errorType: store.activeError.errorType,
      message: store.activeError.message,
      debugData: store.activeError.debugData,
    } : null,
    errors: store.errors.map((e) => ({
      id: e.id,
      synthType: e.synthType,
      synthName: e.synthName,
      errorType: e.errorType,
      message: e.message,
      dismissed: e.dismissed,
      timestamp: e.debugData.timestamp,
    })),
  };
}

// ─── Format-Specific State ─────────────────────────────────────────────────────

export function getFormatState(): Record<string, unknown> {
  const format = useFormatStore.getState();
  const loadedSong = getTrackerReplayer()?.getSong();
  return {
    editorMode: format.editorMode,
    // What plays the loaded song, by the router's rule (see playingEngineFor).
    playingEngine: loadedSong ? playingEngineFor(loadedSong) : null,
    hasFurnaceNative: !!format.furnaceNative,
    hasHivelyNative: !!format.hivelyNative,
    hivelyMeta: format.hivelyMeta,
    furnaceActiveSubsong: format.furnaceActiveSubsong,
    furnaceSubsongCount: format.furnaceSubsongs?.length ?? 0,
    songDBInfo: format.songDBInfo,
    sidMetadata: format.sidMetadata,
    hasOriginalModuleData: !!format.originalModuleData,
    originalModuleFormat: format.originalModuleData?.format ?? null,
    sunTronicEnginePref: useSettingsStore.getState().formatEngine.suntronic,
    // The companion files registered for UADE, by the name the player opens.
    // What the resolver found is otherwise invisible from outside; a two-file
    // format that fails needs this to say whether the samples arrived.
    uadeCompanionNames: format.uadeCompanionFiles ? Array.from(format.uadeCompanionFiles.keys()) : [],
    // Which WASM engine file data is loaded
    loadedWasmEngines: [
      format.hivelyFileData && 'hively',
      format.klysFileData && 'klystrack',
      format.c64SidFileData && 'c64sid',
      format.jamCrackerFileData && 'jamcracker',
      format.preTrackerFileData && 'pretracker',
      format.maFileData && 'music-assembler',
      format.hippelFileData && 'hippel',
      format.sonixFileData && 'sonix',
      format.pxtoneFileData && 'pxtone',
      format.organyaFileData && 'organya',
      format.sawteethFileData && 'sawteeth',
      format.eupFileData && 'eupmini',
      format.ixsFileData && 'ixalance',
      format.psycleFileData && 'psycle',
      format.sc68FileData && 'sc68',
      format.zxtuneFileData && 'zxtune',
      format.pumaTrackerFileData && 'pumatracker',
      format.artOfNoiseFileData && 'artofnoise',
      format.qsfFileData && 'qsf',
      format.bdFileData && 'bendaglish',
      format.sd2FileData && 'sidmon2',
      format.v2mFileData && 'v2m',
      format.uadeEditableFileData && 'uade-editable',
      format.libopenmptFileData && 'libopenmpt',
      format.musiclineFileData && 'musicline',
      format.futurePlayerFileData && 'futureplayer',
    ].filter(Boolean),
  };
}

// ─── MIDI State ────────────────────────────────────────────────────────────────

export function getMIDIState(): Record<string, unknown> {
  const midi = useMIDIStore.getState();
  return {
    isSupported: midi.isSupported,
    isInitialized: midi.isInitialized,
    lastError: midi.lastError,
    inputDevices: midi.inputDevices,
    outputDevices: midi.outputDevices,
    selectedInputId: midi.selectedInputId,
    selectedOutputId: midi.selectedOutputId,
    midiOutputEnabled: midi.midiOutputEnabled,
    midiOctaveOffset: midi.midiOctaveOffset,
    knobBank: midi.knobBank,
    padBank: midi.padBank,
    isLearning: midi.isLearning,
    ccMappings: midi.ccMappings,
  };
}

// ─── Clipboard State ───────────────────────────────────────────────────────────

export function getClipboardState(): Record<string, unknown> {
  const tracker = useTrackerStore.getState();
  const clipboard = tracker.clipboard;
  if (!clipboard) return { hasClipboard: false };
  return {
    hasClipboard: true,
    channels: clipboard.channels,
    rows: clipboard.rows,
  };
}

// ─── Command List ──────────────────────────────────────────────────────────────

export function getCommandList(): Record<string, unknown> {
  try {
    // getGlobalRegistry imported at top level
    const registry = getGlobalRegistry();
    if (!registry) return { error: 'Command registry not initialized' };

    const commands = registry.getAllCommands();
    return {
      count: commands.length,
      commands: commands.map((cmd) => ({
        name: cmd.name,
        description: cmd.description,
        contexts: cmd.contexts,
      })),
    };
  } catch (e) {
    return { error: `Command registry not available: ${(e as Error).message}` };
  }
}

// ─── Pattern as Text (tracker-style rendering) ─────────────────────────────────

export function renderPatternText(params: Record<string, unknown>): Record<string, unknown> {
  const tracker = useTrackerStore.getState();
  const patternIndex = (params.patternIndex as number | undefined) ?? tracker.currentPatternIndex;
  const pattern = tracker.patterns[patternIndex];
  if (!pattern) return { error: `Pattern ${patternIndex} not found` };

  const startRow = (params.startRow as number | undefined) ?? 0;
  const endRow = (params.endRow as number | undefined) ?? (pattern.length - 1);
  const channelFilter = params.channels as number[] | undefined;
  const channelIndices = channelFilter ?? Array.from({ length: pattern.channels.length }, (_, i) => i);

  // Build header
  const header = 'Row | ' + channelIndices.map((c) => `Ch${String(c).padStart(2, '0')}             `).join('| ');
  const sep = '-'.repeat(header.length);

  const lines: string[] = [header, sep];
  for (let r = startRow; r <= endRow && r < pattern.length; r++) {
    const rowStr = String(r).padStart(3, '0');
    const cellStrs: string[] = [];
    for (const c of channelIndices) {
      const cell = pattern.channels[c]?.rows[r];
      if (!cell || (!cell.note && !cell.instrument && !cell.volume && !cell.effTyp && !cell.effTyp2)) {
        cellStrs.push('--- .. .. ... ...');
      } else {
        const n = noteToString(cell.note);
        const i = cell.instrument ? formatHex(cell.instrument) : '..';
        const v = cell.volume ? formatHex(cell.volume) : '..';
        const e1 = effectToString(cell.effTyp, cell.eff);
        const e2 = (cell.effTyp2 || cell.eff2) ? effectToString(cell.effTyp2 ?? 0, cell.eff2 ?? 0) : '...';
        cellStrs.push(`${n} ${i} ${v} ${e1} ${e2}`);
      }
    }
    lines.push(`${rowStr} | ${cellStrs.join('| ')}`);
  }

  return {
    patternIndex,
    text: lines.join('\n'),
  };
}

// ─── Validate Pattern ──────────────────────────────────────────────────────────

export function validatePattern(params: Record<string, unknown>): Record<string, unknown> {
  const tracker = useTrackerStore.getState();
  const instruments = useInstrumentStore.getState().instruments;
  const patternIndex = (params.patternIndex as number | undefined) ?? tracker.currentPatternIndex;
  const pattern = tracker.patterns[patternIndex];
  if (!pattern) return { error: `Pattern ${patternIndex} not found` };

  const instrumentIds = new Set(instruments.map((i) => i.id));
  const issues: Record<string, unknown>[] = [];

  for (let c = 0; c < pattern.channels.length; c++) {
    let noteOn = false;
    for (let r = 0; r < pattern.length; r++) {
      const cell = pattern.channels[c]?.rows[r];
      if (!cell) continue;

      // Note without instrument
      if (cell.note > 0 && cell.note < 97 && cell.instrument === 0) {
        issues.push({ type: 'note_no_instrument', channel: c, row: r, note: noteToString(cell.note) });
      }

      // Instrument not found
      if (cell.instrument > 0 && !instrumentIds.has(cell.instrument)) {
        issues.push({ type: 'missing_instrument', channel: c, row: r, instrument: cell.instrument });
      }

      // Note off without prior note on
      if (cell.note === 97 && !noteOn) {
        issues.push({ type: 'orphan_noteoff', channel: c, row: r });
      }

      // Track note state
      if (cell.note > 0 && cell.note < 97) noteOn = true;
      if (cell.note === 97) noteOn = false;

      // Volume out of typical range
      if (cell.volume > 64 && cell.volume < 0x10) {
        issues.push({ type: 'unusual_volume', channel: c, row: r, volume: cell.volume });
      }
    }
  }

  return {
    patternIndex,
    valid: issues.length === 0,
    issueCount: issues.length,
    issues,
  };
}

// ─── Sample Info ────────────────────────────────────────────────────────────────

export function getSampleInfo(params: Record<string, unknown>): Record<string, unknown> {
  const id = params.id as number;
  const inst = useInstrumentStore.getState().getInstrument(id);
  if (!inst) return { error: `Instrument ${id} not found` };
  if (!inst.sample) return { error: `Instrument ${id} has no sample config` };

  const s = inst.sample;
  const result: Record<string, unknown> = {
    instrumentId: id,
    instrumentName: inst.name,
    url: s.url,
    baseNote: s.baseNote,
    detune: s.detune,
    loop: s.loop,
    loopType: s.loopType ?? 'off',
    loopStart: s.loopStart,
    loopEnd: s.loopEnd,
    sustainLoop: s.sustainLoop ?? false,
    sustainLoopType: s.sustainLoopType ?? 'off',
    sustainLoopStart: s.sustainLoopStart ?? 0,
    sustainLoopEnd: s.sustainLoopEnd ?? 0,
    sampleRate: s.sampleRate ?? 44100,
    reverse: s.reverse,
    playbackRate: s.playbackRate,
    hasAudioBuffer: !!s.audioBuffer,
    audioBufferByteLength: s.audioBuffer?.byteLength ?? 0,
    hasMultiMap: !!s.multiMap,
    multiMapNotes: s.multiMap ? Object.keys(s.multiMap) : [],
    sliceCount: s.slices?.length ?? 0,
    slices: s.slices?.map((sl, i) => ({ index: i, ...sl })) ?? [],
    sourceInstrumentId: s.sourceInstrumentId,
    sliceStart: s.sliceStart,
    sliceEnd: s.sliceEnd,
  };

  // Add decoded buffer info from ToneEngine
  try {
    const engine = getToneEngine();
    const decoded = engine.getDecodedBuffer(id);
    if (decoded) {
      result.decodedBuffer = {
        duration: decoded.duration,
        length: decoded.length,
        numberOfChannels: decoded.numberOfChannels,
        sampleRate: decoded.sampleRate,
      };
    }
  } catch { /* engine not ready */ }

  return result;
}

/** Get waveform overview of a decoded sample (downsampled for display) */
export function getSampleWaveform(params: Record<string, unknown>): Record<string, unknown> {
  const id = params.id as number;
  const resolution = (params.resolution as number) ?? 256; // number of points

  try {
    const engine = getToneEngine();
    const decoded = engine.getDecodedBuffer(id);
    if (!decoded) return { error: `No decoded buffer for instrument ${id}` };

    const channel0 = decoded.getChannelData(0);
    const step = Math.max(1, Math.floor(channel0.length / resolution));
    const mins: number[] = [];
    const maxs: number[] = [];

    for (let i = 0; i < channel0.length; i += step) {
      let min = Infinity, max = -Infinity;
      const end = Math.min(i + step, channel0.length);
      for (let j = i; j < end; j++) {
        if (channel0[j] < min) min = channel0[j];
        if (channel0[j] > max) max = channel0[j];
      }
      mins.push(+min.toFixed(4));
      maxs.push(+max.toFixed(4));
    }

    return {
      instrumentId: id,
      duration: decoded.duration,
      sampleRate: decoded.sampleRate,
      length: decoded.length,
      channels: decoded.numberOfChannels,
      resolution: mins.length,
      waveformMin: mins,
      waveformMax: maxs,
    };
  } catch {
    return { error: `Cannot read waveform for instrument ${id}` };
  }
}

// ─── Synth Config ───────────────────────────────────────────────────────────────

/** Get synth-specific config for an instrument (TB303, Furnace, wavetable, etc.) */
export function getSynthConfig(params: Record<string, unknown>): Record<string, unknown> {
  const id = params.id as number;
  const inst = useInstrumentStore.getState().getInstrument(id);
  if (!inst) return { error: `Instrument ${id} not found` };

  const result: Record<string, unknown> = {
    instrumentId: id,
    name: inst.name,
    type: inst.type,
    synthType: inst.synthType,
    volume: inst.volume,
    pan: inst.pan,
    monophonic: inst.monophonic ?? false,
    isLive: inst.isLive ?? false,
  };

  // Extract synth-specific sub-configs
  const configKeys = [
    'oscillator', 'envelope', 'filter', 'filterEnvelope', 'pitchEnvelope',
    'tb303', 'wavetable', 'harmonicSynth', 'granular', 'superSaw', 'polySynth',
    'organ', 'drumMachine', 'chipSynth', 'pwmSynth', 'stringMachine', 'formantSynth',
    'wobbleBass', 'dubSiren', 'spaceLaser', 'synare', 'v2', 'v2Speech', 'sam',
    'furnace', 'dexed', 'obxd', 'rdpiano', 'mame', 'buzzmachine',
    'chiptuneModule', 'hively', 'jamCracker', 'uade', 'soundMon', 'sidMon',
    'digMug', 'fc', 'deltaMusic1', 'deltaMusic2', 'sonicArranger', 'fred',
    'tfmx', 'hippelCoso', 'robHubbard', 'sidmon1', 'octamed', 'davidWhittaker',
    'sunvox', 'superCollider', 'wam', 'drumKit',
  ] as const;

  for (const key of configKeys) {
    const val = (inst as unknown as Record<string, unknown>)[key];
    if (val !== undefined && val !== null) {
      try {
        result[key] = JSON.parse(JSON.stringify(val, (_k, v) => {
          if (v instanceof ArrayBuffer || v instanceof Uint8Array) return '[binary]';
          return v;
        }));
      } catch {
        result[key] = '[serialization error]';
      }
    }
  }

  // LFO config
  if (inst.lfo) result.lfo = inst.lfo;

  // Effects chain
  result.effects = inst.effects?.map((fx) => ({
    id: fx.id,
    type: fx.type,
    category: fx.category,
    enabled: fx.enabled,
    wet: fx.wet,
    parameters: fx.parameters,
  })) ?? [];

  // Parameters (generic synth params)
  if (inst.parameters) result.parameters = inst.parameters;

  return result;
}

// ─── Audio Analysis ─────────────────────────────────────────────────────────────

/** Get real-time audio analysis: FFT, RMS, peak, band energy, beat detection */
export function getAudioAnalysis(): Record<string, unknown> {
  try {
    const bus = AudioDataBus.getShared();

    // Force an update to get fresh data
    bus.update();
    const frame = bus.getFrame();

    const result: Record<string, unknown> = {
      rms: +(frame.rms ?? 0).toFixed(4),
      peak: +(frame.peak ?? 0).toFixed(4),
      beat: !!frame.beat,
      time: +(frame.time ?? 0).toFixed(3),
    };

    // Band energy
    if (frame.subEnergy !== undefined) {
      result.bandEnergy = {
        sub: +(frame.subEnergy).toFixed(4),
        bass: +(frame.bassEnergy).toFixed(4),
        mid: +(frame.midEnergy).toFixed(4),
        high: +(frame.highEnergy).toFixed(4),
      };
    }

    // FFT spectrum (downsample to 64 bins for readability)
    if (frame.fft && frame.fft.length > 0) {
      const fftBins = 64;
      const fftData: number[] = [];
      const step = Math.max(1, Math.floor(frame.fft.length / fftBins));
      for (let i = 0; i < frame.fft.length; i += step) {
        let max = -Infinity;
        for (let j = i; j < Math.min(i + step, frame.fft.length); j++) {
          if (frame.fft[j] > max) max = frame.fft[j];
        }
        fftData.push(+max.toFixed(1));
      }
      result.fftSpectrum = fftData;
      result.fftBinCount = frame.fft.length;
    }

    // Waveform snapshot (downsample to 128 points)
    if (frame.waveform && frame.waveform.length > 0) {
      const wfPoints = 128;
      const wfData: number[] = [];
      const step = Math.max(1, Math.floor(frame.waveform.length / wfPoints));
      for (let i = 0; i < frame.waveform.length; i += step) {
        wfData.push(+(frame.waveform[i]).toFixed(4));
      }
      result.waveformSnapshot = wfData;
    }

    return result;
  } catch (e) {
    return { error: `Audio analysis not available: ${(e as Error).message}` };
  }
}

/** Get AudioContext properties: sampleRate, latency, state */
interface AudioPlaybackStats {
  underrunDuration: number;
  underrunEvents: number;
  totalDuration: number;
  averageLatency: number;
  maximumLatency: number;
}

function readPlaybackStats(ctx: AudioContext): Record<string, number> | null {
  const stats = (ctx as unknown as { playbackStats?: AudioPlaybackStats }).playbackStats;
  if (!stats) return null;
  return {
    underrunEvents: stats.underrunEvents,
    underrunSeconds: +stats.underrunDuration.toFixed(4),
    totalSeconds: +stats.totalDuration.toFixed(1),
    averageLatencyMs: +(stats.averageLatency * 1000).toFixed(2),
    maximumLatencyMs: +(stats.maximumLatency * 1000).toFixed(2),
  };
}

export function getAudioContextInfo(): Record<string, unknown> {
  try {
    // Try Tone.js context (available after user gesture)
    const toneCtx = Tone.getContext();
    const ctx = ((toneCtx as unknown as { rawContext?: AudioContext }).rawContext
      ?? (toneCtx as unknown as { _context?: AudioContext })._context
      ?? (toneCtx as unknown as AudioContext)) as AudioContext;
    if (!ctx?.sampleRate) return { error: 'AudioContext not initialized' };

    return {
      sampleRate: ctx.sampleRate,
      state: ctx.state,
      currentTime: +ctx.currentTime.toFixed(3),
      baseLatency: ctx.baseLatency ?? null,
      outputLatency: (ctx as { outputLatency?: number }).outputLatency ?? null,
      // Output underruns since the context started — the audible dropouts.
      // Chrome's AudioContext.playbackStats; null where unsupported.
      playback: readPlaybackStats(ctx),
    };
  } catch (e) {
    return { error: `AudioContext not available: ${(e as Error).message}` };
  }
}

/** Get voice allocation state: active voices, utilization, details */
export function getVoiceState(): Record<string, unknown> {
  try {
    const engine = getToneEngine();

    if ((engine as any).voiceAllocator) {
      const stats = (engine as any).voiceAllocator.getStats();
      const voices = (engine as any).voiceAllocator.getAllActiveVoices();
      return {
        ...stats,
        voices: voices.map((v: { channelIndex: number; note: string; instrumentId: number; velocity: number; isReleasing: boolean; startTime: number }) => ({
          channel: v.channelIndex,
          note: v.note,
          instrumentId: v.instrumentId,
          velocity: v.velocity,
          isReleasing: v.isReleasing,
          age: +((performance.now() - v.startTime) / 1000).toFixed(2),
        })),
      };
    }

    return { activeVoices: 0, freeVoices: 0, maxVoices: 0, utilizationPercent: 0, voices: [] };
  } catch (e) {
    return { error: `Voice allocator not available: ${(e as Error).message}` };
  }
}

/** Get per-instrument audio level (RMS/peak) from InstrumentAnalyser */
export function getInstrumentLevel(params: Record<string, unknown>): Record<string, unknown> {
  const id = params.id as number;
  try {
    const engine = getToneEngine();
    const analyser = engine.getInstrumentAnalyser(id);
    if (!analyser) return { instrumentId: id, level: 0, peak: 0, active: false };

    return {
      instrumentId: id,
      level: +analyser.getLevel().toFixed(4),
      peak: +analyser.getPeak().toFixed(4),
      active: analyser.hasActivity(),
    };
  } catch {
    return { instrumentId: id, error: 'Analyser not available' };
  }
}

/** List all loaded synth instances in the engine */
export function getLoadedSynths(): Record<string, unknown> {
  try {
    const engine = getToneEngine();
    if (!engine) return { count: 0, synths: [] };

    const instruments = engine.instruments as Map<number, unknown>;
    const list: Record<string, unknown>[] = [];

    instruments.forEach((synth: unknown, id: number) => {
      const inst = useInstrumentStore.getState().getInstrument(id);
      const entry: Record<string, unknown> = {
        id,
        name: inst?.name ?? `Instrument ${id}`,
        synthType: inst?.synthType ?? 'unknown',
      };

      if (synth && typeof synth === 'object' && 'name' in synth) {
        entry.engineName = (synth as { name: string }).name;
      }

      list.push(entry);
    });

    return { count: list.length, synths: list };
  } catch (e) {
    return { error: `Engine not available: ${(e as Error).message}` };
  }
}

// ─── Enhanced Full State ───────────────────────────────────────────────────────

export function getFullState(): Record<string, unknown> {
  return {
    song: getSongInfo(),
    playback: getPlaybackState(),
    cursor: getCursor(),
    selection: getSelection(),
    editor: getEditorState(),
    mixer: getMixerState(),
    audio: getAudioState(),
    ui: getUIState(),
    history: getHistoryState(),
    oscilloscope: getOscilloscopeInfo(),
    instruments: getInstrumentsList(),
    patternList: getPatternList(),
    patternOrder: getPatternOrder(),
    format: getFormatState(),
    clipboard: getClipboardState(),
    errors: getSynthErrors(),
  };
}

export function getConsoleErrors(): Record<string, unknown> {
  return { entries: getConsoleEntries() };
}

/**
 * The owner's instrument labels for the loaded song, next to the analyzer's
 * verdict for every instrument - the corpus answer key is pulled from here.
 */
export async function getInstrumentLabels(): Promise<Record<string, unknown>> {
  const { useTrackerStore } = await import('../../stores/useTrackerStore');
  const { useInstrumentStore } = await import('../../stores/useInstrumentStore');
  const { useProjectStore } = await import('../../stores/useProjectStore');
  const { useInstrumentLabelStore, songLabelKey } = await import('../../stores/useInstrumentLabelStore');
  const { analyzeSong } = await import('../analysis/songAnalyzer');
  const tracker = useTrackerStore.getState();
  const insts = useInstrumentStore.getState().instruments;
  const lookup = new Map(insts.map((i) => [i.id, i]));
  const songKey = songLabelKey(useProjectStore.getState().metadata?.name, lookup.size);
  const labels = useInstrumentLabelStore.getState().labelsFor(songKey);
  const analysis = tracker.patterns.length ? analyzeSong(tracker.patterns, tracker.patternOrder, lookup) : null;
  return {
    songKey,
    song: useProjectStore.getState().metadata?.name ?? '',
    labels,
    instruments: insts.map((i) => {
      const v = analysis?.instruments.get(i.id);
      return {
        id: i.id, name: i.name, used: !!v,
        analyzer: v ? { role: v.role, confidence: Math.round(v.confidence * 100) / 100, drumPart: v.drumPart, harmonyKind: v.harmonyKind, onsets: v.usage.onsets, pitches: v.usage.pitches, channels: v.usage.channels } : null,
        label: labels[i.id] ?? null,
      };
    }),
  };
}
