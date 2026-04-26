/**
 * MCP Bridge — Read Handlers
 *
 * Handles read-only queries against Zustand stores.
 * Returns plain JSON-serializable objects.
 */

import { useTrackerStore } from '../../stores/useTrackerStore';
import { getConsoleEntries } from '../consoleCapture';
import { useTransportStore } from '../../stores/useTransportStore';
import { useFormatStore } from '../../stores/useFormatStore';
import { useInstrumentStore } from '../../stores/useInstrumentStore';
import { useCursorStore } from '../../stores/useCursorStore';
import { useEditorStore } from '../../stores/useEditorStore';
import { useUIStore } from '../../stores/useUIStore';
import { useAudioStore } from '../../stores/useAudioStore';
import { useMixerStore } from '../../stores/useMixerStore';
import { useHistoryStore } from '../../stores/useHistoryStore';
import { useProjectStore } from '../../stores/useProjectStore';
import { useOscilloscopeStore } from '../../stores/useOscilloscopeStore';
import { useInstrumentTypeStore } from '../../stores/useInstrumentTypeStore';
import { useDJStore } from '../../stores/useDJStore';
import { useDrumPadStore } from '../../stores/useDrumPadStore';
import { getDJEngineIfActive } from '../../engine/dj/DJEngine';
import { getDrumPadEngine } from '../../hooks/drumpad/useMIDIPadRouting';
import { useSynthErrorStore } from '../../stores/useSynthErrorStore';
import { useMIDIStore } from '../../stores/useMIDIStore';
import { getGlobalRegistry } from '../../hooks/useGlobalKeyboardHandler';
import { getTrackerReplayer } from '../../engine/TrackerReplayer';
import { getToneEngine } from '../../engine/ToneEngine';
import * as Tone from 'tone';
import { AudioDataBus } from '../../engine/vj/AudioDataBus';

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

// ─── Oscilloscope Data ─────────────────────────────────────────────────────────

export function getOscilloscopeInfo(): Record<string, unknown> {
  const osc = useOscilloscopeStore.getState();
  return {
    isActive: osc.isActive,
    numChannels: osc.numChannels,
    channelNames: osc.channelNames,
    hasData: osc.channelData.some((d) => d !== null),
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

  return {
    initialized: audio.initialized,
    contextState: audio.contextState,
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

export function getDubBusState(): Record<string, unknown> {
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

  return {
    hasBus: !!bus,
    storeSettings,
    channelDubSends,
    registeredChannelTaps,
  };
}

// ─── Auto Dub — autonomous dub-move performer (2026-04-21) ───────────────────

export async function getAutoDubState(): Promise<Record<string, unknown>> {
  const { useDubStore } = await import('../../stores/useDubStore');
  const { isAutoDubRunning } = await import('../../engine/dub/AutoDub');
  const s = useDubStore.getState();
  return {
    enabled: s.autoDubEnabled,
    persona: s.autoDubPersona,
    intensity: s.autoDubIntensity,
    moveBlacklist: s.autoDubMoveBlacklist,
    isRunning: isAutoDubRunning(),
  };
}

/** Returns the ring buffer of move IDs chosen by the Auto Dub tick loop
 *  since the last clearAutoDubFireLog call (or since the module loaded). */
export async function getAutoDubFireLog(): Promise<Record<string, unknown>> {
  const { getAutoDubFireLog: getLog } = await import('../../engine/dub/AutoDub');
  return { moves: Array.from(getLog()) };
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
  const { classifySongRoles } = await import('../analysis/ChannelNaming');
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
  const offline = classifySongRoles(patterns, lookup);
  const runtime = getAllRuntimeChannelRoles(offline.length);
  const merged = mergeOfflineAndRuntimeRoles(offline, runtime);

  const schema = patterns[0];
  const names = schema?.channels?.map((c) => c.name ?? null) ?? [];
  return {
    patternsLoaded: true,
    channelCount: offline.length,
    roles: merged,
    offline,
    runtime: runtime.map((h) => h ? { role: h.role, confidence: h.confidence, support: h.support } : null),
    names,
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
  return {
    editorMode: format.editorMode,
    hasFurnaceNative: !!format.furnaceNative,
    hasHivelyNative: !!format.hivelyNative,
    hivelyMeta: format.hivelyMeta,
    furnaceActiveSubsong: format.furnaceActiveSubsong,
    furnaceSubsongCount: format.furnaceSubsongs?.length ?? 0,
    songDBInfo: format.songDBInfo,
    sidMetadata: format.sidMetadata,
    hasOriginalModuleData: !!format.originalModuleData,
    originalModuleFormat: format.originalModuleData?.format ?? null,
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
