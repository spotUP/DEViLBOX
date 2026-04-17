/**
 * MCP Bridge — Write Handlers
 *
 * Handles write operations: pattern editing, transport control, mixing, commands.
 */

import { useTrackerStore } from '../../stores/useTrackerStore';
import { clearConsoleEntries } from '../consoleCapture';
import { useTransportStore } from '../../stores/useTransportStore';
import { useCursorStore } from '../../stores/useCursorStore';
import { useHistoryStore } from '../../stores/useHistoryStore';
import { useEditorStore } from '../../stores/useEditorStore';
import { useUIStore } from '../../stores/useUIStore';
import { useAudioStore } from '../../stores/useAudioStore';
import { useMixerStore } from '../../stores/useMixerStore';
import { useInstrumentStore } from '../../stores/useInstrumentStore';
import { useProjectStore } from '../../stores/useProjectStore';
import { useSynthErrorStore } from '../../stores/useSynthErrorStore';
import { getGlobalRegistry } from '../../hooks/useGlobalKeyboardHandler';
import { getToneEngine } from '../../engine/ToneEngine';
import { suppressFormatChecks, restoreFormatChecks } from '../../lib/formatCompatibility';
import * as Tone from 'tone';
import { AudioDataBus } from '../../engine/vj/AudioDataBus';
import { getAudioMonitor, disposeAudioMonitor } from '../monitoring/AudioMonitor';
import { testAllSynths, testToneSynths, testCustomSynths, testFurnaceSynths, testMAMESynths } from '../../utils/synthTester';

// ─── Note Parsing ──────────────────────────────────────────────────────────────

const NOTE_MAP: Record<string, number> = {
  'C-': 0, 'C#': 1, 'D-': 2, 'D#': 3, 'E-': 4, 'F-': 5,
  'F#': 6, 'G-': 7, 'G#': 8, 'A-': 9, 'A#': 10, 'B-': 11,
};

function parseNoteString(noteStr: string): number | undefined {
  const upper = noteStr.toUpperCase().trim();
  if (upper === 'OFF') return 97;
  if (upper === '---' || upper === '') return 0;
  if (upper.length >= 3) {
    const notePart = upper.substring(0, 2);
    const octave = parseInt(upper.substring(2), 10);
    const noteIndex = NOTE_MAP[notePart];
    if (noteIndex !== undefined && !isNaN(octave) && octave >= 0 && octave <= 7) {
      return noteIndex + octave * 12 + 1;
    }
  }
  return undefined;
}

function resolveNote(note: unknown): number | undefined {
  if (typeof note === 'number') return note;
  if (typeof note === 'string') {
    // Strip surrounding quotes from double-serialized JSON strings
    let s = note;
    if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
    // Try parsing as integer first (e.g. "49" → 49)
    const asNum = parseInt(s, 10);
    if (!isNaN(asNum) && String(asNum) === s) return asNum;
    return parseNoteString(s);
  }
  return undefined;
}

// ─── Pattern Editing ───────────────────────────────────────────────────────────

export function setCell(params: Record<string, unknown>): Record<string, unknown> {
  const channel = params.channel as number;
  const row = params.row as number;
  const patternIndex = params.patternIndex as number | undefined;

  if (patternIndex !== undefined) {
    useTrackerStore.getState().setCurrentPattern(patternIndex);
  }

  const cellUpdate: Record<string, unknown> = {};
  if (params.note !== undefined) {
    const noteVal = resolveNote(params.note);
    if (noteVal === undefined) return { error: `Invalid note: ${params.note}` };
    cellUpdate.note = noteVal;
  }
  if (params.instrument !== undefined) cellUpdate.instrument = params.instrument;
  if (params.volume !== undefined) cellUpdate.volume = params.volume;
  if (params.effTyp !== undefined) cellUpdate.effTyp = params.effTyp;
  if (params.eff !== undefined) cellUpdate.eff = params.eff;
  if (params.effTyp2 !== undefined) cellUpdate.effTyp2 = params.effTyp2;
  if (params.eff2 !== undefined) cellUpdate.eff2 = params.eff2;
  if (params.flag1 !== undefined) cellUpdate.flag1 = params.flag1;
  if (params.flag2 !== undefined) cellUpdate.flag2 = params.flag2;
  if (params.probability !== undefined) cellUpdate.probability = params.probability;

  useTrackerStore.getState().setCell(channel, row, cellUpdate);
  return { ok: true };
}

export function setCells(params: Record<string, unknown>): Record<string, unknown> {
  const patternIndex = params.patternIndex as number | undefined;
  const cells = params.cells as Array<Record<string, unknown>>;

  if (patternIndex !== undefined) {
    useTrackerStore.getState().setCurrentPattern(patternIndex);
  }

  let count = 0;
  for (const cell of cells) {
    const result = setCell({ ...cell, patternIndex: undefined });
    if ('error' in result) return result;
    count++;
  }

  return { ok: true, count };
}

export function clearCell(params: Record<string, unknown>): Record<string, unknown> {
  const channel = params.channel as number;
  const row = params.row as number;
  const patternIndex = params.patternIndex as number | undefined;

  if (patternIndex !== undefined) {
    useTrackerStore.getState().setCurrentPattern(patternIndex);
  }

  useTrackerStore.getState().clearCell(channel, row);
  return { ok: true };
}

export function clearPattern(params: Record<string, unknown>): Record<string, unknown> {
  const patternIndex = params.patternIndex as number | undefined;
  if (patternIndex !== undefined) {
    useTrackerStore.getState().setCurrentPattern(patternIndex);
  }
  useTrackerStore.getState().clearPattern();
  return { ok: true };
}

export function clearChannel(params: Record<string, unknown>): Record<string, unknown> {
  const channel = params.channel as number;
  useTrackerStore.getState().clearChannel(channel);
  return { ok: true };
}

// ─── Pattern Management ────────────────────────────────────────────────────────

export function addPattern(params: Record<string, unknown>): Record<string, unknown> {
  const length = params.length as number | undefined;
  useTrackerStore.getState().addPattern(length);
  const tracker = useTrackerStore.getState();
  return { ok: true, patternIndex: tracker.patterns.length - 1 };
}

export function duplicatePattern(params: Record<string, unknown>): Record<string, unknown> {
  const index = (params.patternIndex as number | undefined) ?? useTrackerStore.getState().currentPatternIndex;
  useTrackerStore.getState().duplicatePattern(index);
  const tracker = useTrackerStore.getState();
  return { ok: true, newPatternIndex: tracker.patterns.length - 1 };
}

export function resizePattern(params: Record<string, unknown>): Record<string, unknown> {
  const index = (params.patternIndex as number | undefined) ?? useTrackerStore.getState().currentPatternIndex;
  const newLength = params.length as number;
  useTrackerStore.getState().resizePattern(index, newLength);
  return { ok: true };
}

// ─── Pattern Order (Song Arrangement) ──────────────────────────────────────────

export function setPatternOrder(params: Record<string, unknown>): Record<string, unknown> {
  const order = params.order as number[];
  useTrackerStore.getState().setPatternOrder(order);
  return { ok: true };
}

export function addToOrder(params: Record<string, unknown>): Record<string, unknown> {
  const patternIndex = params.patternIndex as number;
  const position = params.position as number | undefined;
  useTrackerStore.getState().addToOrder(patternIndex, position);
  return { ok: true };
}

export function removeFromOrder(params: Record<string, unknown>): Record<string, unknown> {
  const positionIndex = params.positionIndex as number;
  useTrackerStore.getState().removeFromOrder(positionIndex);
  return { ok: true };
}

// ─── Transport ─────────────────────────────────────────────────────────────────

export function setBpm(params: Record<string, unknown>): Record<string, unknown> {
  suppressFormatChecks();
  try {
    useTransportStore.getState().setBPM(params.bpm as number);
  } finally {
    restoreFormatChecks();
  }
  return { ok: true };
}

export function setSpeed(params: Record<string, unknown>): Record<string, unknown> {
  useTransportStore.getState().setSpeed(params.speed as number);
  return { ok: true };
}

export async function play(params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const mode = (params.mode as string) || 'song';
  const store = useTransportStore.getState();

  if (mode === 'song') {
    // Song mode: disable looping so playback advances through all patterns
    store.setIsLooping(false);
  } else {
    // Pattern mode: enable looping to repeat current pattern
    store.setIsLooping(true);
  }

  await store.play();
  return { ok: true, mode };
}

export function stop(): Record<string, unknown> {
  useTransportStore.getState().stop();
  return { ok: true };
}

export function pause(): Record<string, unknown> {
  useTransportStore.getState().pause();
  return { ok: true };
}

export function setSwing(params: Record<string, unknown>): Record<string, unknown> {
  useTransportStore.getState().setSwing(params.swing as number);
  return { ok: true };
}

export function setGlobalPitch(params: Record<string, unknown>): Record<string, unknown> {
  useTransportStore.getState().setGlobalPitch(params.pitch as number);
  return { ok: true };
}

export function toggleMetronome(): Record<string, unknown> {
  useTransportStore.getState().toggleMetronome();
  const state = useTransportStore.getState();
  return { ok: true, metronomeEnabled: state.metronomeEnabled };
}

export function setLooping(params: Record<string, unknown>): Record<string, unknown> {
  const transport = useTransportStore.getState();
  if (params.loopStartRow !== undefined) {
    transport.setLoopStartRow(params.loopStartRow as number);
  }
  return { ok: true };
}

export function seekTo(params: Record<string, unknown>): Record<string, unknown> {
  if (params.position !== undefined) {
    useTrackerStore.getState().setCurrentPosition(params.position as number);
  }
  if (params.row !== undefined) {
    useTransportStore.getState().setCurrentRow(params.row as number);
  }
  return { ok: true };
}

// ─── Cursor & Selection ────────────────────────────────────────────────────────

export function moveCursor(params: Record<string, unknown>): Record<string, unknown> {
  const cursorStore = useCursorStore.getState();

  if (params.pattern !== undefined) {
    useTrackerStore.getState().setCurrentPattern(params.pattern as number);
  }
  if (params.row !== undefined) {
    cursorStore.moveCursorToRow(params.row as number);
  }
  if (params.channel !== undefined) {
    cursorStore.moveCursorToChannel(params.channel as number);
  }
  if (params.columnType !== undefined) {
    cursorStore.moveCursorToColumn(params.columnType as 'note' | 'instrument' | 'volume' | 'effTyp');
  }

  return { ok: true };
}

export function selectRange(params: Record<string, unknown>): Record<string, unknown> {
  const cursor = useCursorStore.getState();
  const startCh = params.startChannel as number;
  const startRow = params.startRow as number;
  const endCh = params.endChannel as number;
  const endRow = params.endRow as number;

  // Move cursor to start, begin selection, extend to end
  cursor.moveCursorToChannel(startCh);
  cursor.moveCursorToRow(startRow);
  cursor.startSelection();
  cursor.updateSelection(endCh, endRow);
  cursor.endSelection();

  return { ok: true };
}

export function selectAll(): Record<string, unknown> {
  useCursorStore.getState().selectPattern();
  return { ok: true };
}

export function clearSelection(): Record<string, unknown> {
  useCursorStore.getState().clearSelection();
  return { ok: true };
}

// ─── Pattern Transforms ────────────────────────────────────────────────────────

export function transposeSelection(params: Record<string, unknown>): Record<string, unknown> {
  const semitones = params.semitones as number;
  useTrackerStore.getState().transposeSelection(semitones);
  return { ok: true };
}

export function interpolateSelection(params: Record<string, unknown>): Record<string, unknown> {
  const column = (params.column as string) ?? 'volume';
  const startValue = params.startValue as number;
  const endValue = params.endValue as number;
  const curve = (params.curve as string) ?? 'linear';
  useTrackerStore.getState().interpolateSelection(
    column as 'volume' | 'cutoff' | 'resonance' | 'envMod' | 'pan' | 'effParam' | 'effParam2',
    startValue, endValue,
    curve as 'linear' | 'log' | 'exp' | 'scurve'
  );
  return { ok: true };
}

export function humanizeSelection(params: Record<string, unknown>): Record<string, unknown> {
  const variation = (params.volumeVariation as number) ?? 10;
  useTrackerStore.getState().humanizeSelection(variation);
  return { ok: true };
}

export function scaleVolume(params: Record<string, unknown>): Record<string, unknown> {
  const scope = (params.scope as string) ?? 'block';
  const factor = params.factor as number;
  useTrackerStore.getState().scaleVolume(scope as 'block' | 'track' | 'pattern', factor);
  return { ok: true };
}

export function fadeVolume(params: Record<string, unknown>): Record<string, unknown> {
  const scope = (params.scope as string) ?? 'block';
  const startVol = params.startVolume as number;
  const endVol = params.endVolume as number;
  useTrackerStore.getState().fadeVolume(scope as 'block' | 'track' | 'pattern', startVol, endVol);
  return { ok: true };
}

// ─── Mixer ─────────────────────────────────────────────────────────────────────

export function setMasterVolume(params: Record<string, unknown>): Record<string, unknown> {
  useAudioStore.getState().setMasterVolume(params.volume as number);
  return { ok: true };
}

export function setMasterMute(params: Record<string, unknown>): Record<string, unknown> {
  useAudioStore.getState().setMasterMuted(params.muted as boolean);
  return { ok: true };
}

export function setChannelVolume(params: Record<string, unknown>): Record<string, unknown> {
  useMixerStore.getState().setChannelVolume(params.channel as number, params.volume as number);
  return { ok: true };
}

export function setChannelPan(params: Record<string, unknown>): Record<string, unknown> {
  useMixerStore.getState().setChannelPan(params.channel as number, params.pan as number);
  return { ok: true };
}

export function setChannelMute(params: Record<string, unknown>): Record<string, unknown> {
  useMixerStore.getState().setChannelMute(params.channel as number, params.muted as boolean);
  return { ok: true };
}

export function setChannelSolo(params: Record<string, unknown>): Record<string, unknown> {
  useMixerStore.getState().setChannelSolo(params.channel as number, params.soloed as boolean);
  return { ok: true };
}

export function muteAllChannels(): Record<string, unknown> {
  const mixer = useMixerStore.getState();
  for (let i = 0; i < mixer.channels.length; i++) {
    mixer.setChannelMute(i, true);
  }
  return { ok: true };
}

export function unmuteAllChannels(): Record<string, unknown> {
  const mixer = useMixerStore.getState();
  for (let i = 0; i < mixer.channels.length; i++) {
    mixer.setChannelMute(i, false);
    mixer.setChannelSolo(i, false);
  }
  return { ok: true };
}

export function soloChannel(params: Record<string, unknown>): Record<string, unknown> {
  const ch = params.channel as number;
  const mixer = useMixerStore.getState();
  // Unsolo all, then solo target
  for (let i = 0; i < mixer.channels.length; i++) {
    mixer.setChannelSolo(i, i === ch);
  }
  return { ok: true };
}

// ─── Editor Settings ───────────────────────────────────────────────────────────

export function setOctave(params: Record<string, unknown>): Record<string, unknown> {
  useEditorStore.getState().setCurrentOctave(params.octave as number);
  return { ok: true };
}

export function setEditStep(params: Record<string, unknown>): Record<string, unknown> {
  useEditorStore.getState().setEditStep(params.step as number);
  return { ok: true };
}

export function toggleRecordMode(): Record<string, unknown> {
  useEditorStore.getState().toggleRecordMode();
  const state = useEditorStore.getState();
  return { ok: true, recordMode: state.recordMode };
}

export function setFollowPlayback(params: Record<string, unknown>): Record<string, unknown> {
  useEditorStore.getState().setFollowPlayback(params.follow as boolean);
  return { ok: true };
}

// ─── UI Control ────────────────────────────────────────────────────────────────

export function setActiveView(params: Record<string, unknown>): Record<string, unknown> {
  useUIStore.getState().setActiveView(params.view as 'tracker' | 'dj' | 'drumpad' | 'vj' | 'studio');
  return { ok: true };
}

export function setStatusMessage(params: Record<string, unknown>): Record<string, unknown> {
  useUIStore.getState().setStatusMessage(params.message as string);
  return { ok: true };
}

export function setTrackerZoom(params: Record<string, unknown>): Record<string, unknown> {
  useUIStore.getState().setTrackerZoom(params.zoom as number);
  return { ok: true };
}

// ─── Instruments ───────────────────────────────────────────────────────────────

export function selectInstrument(params: Record<string, unknown>): Record<string, unknown> {
  useInstrumentStore.getState().setCurrentInstrument(params.id as number);
  return { ok: true };
}

export function createInstrument(params: Record<string, unknown>): Record<string, unknown> {
  // Support both { config: { name, synthType } } and top-level { name, synthType }
  const config = (params.config as Record<string, unknown>) ?? {};
  if (params.name && !config.name) config.name = params.name;
  if (params.synthType && !config.synthType) config.synthType = params.synthType;
  const id = useInstrumentStore.getState().createInstrument(config);
  return { ok: true, instrumentId: id };
}

export function updateInstrument(params: Record<string, unknown>): Record<string, unknown> {
  const id = params.id as number;
  const updates = params.updates as Record<string, unknown>;
  useInstrumentStore.getState().updateInstrument(id, updates);
  return { ok: true };
}

export function deleteInstrument(params: Record<string, unknown>): Record<string, unknown> {
  useInstrumentStore.getState().deleteInstrument(params.id as number);
  return { ok: true };
}

export function cloneInstrument(params: Record<string, unknown>): Record<string, unknown> {
  const newId = useInstrumentStore.getState().cloneInstrument(params.id as number);
  return { ok: true, newInstrumentId: newId };
}

// ─── Project ───────────────────────────────────────────────────────────────────

export function setProjectMetadata(params: Record<string, unknown>): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  if (params.name !== undefined) updates.name = params.name;
  if (params.author !== undefined) updates.author = params.author;
  if (params.description !== undefined) updates.description = params.description;
  useProjectStore.getState().setMetadata(updates);
  return { ok: true };
}

// ─── History ───────────────────────────────────────────────────────────────────

export function undo(): Record<string, unknown> {
  const restored = useHistoryStore.getState().undo();
  if (restored) {
    const patternIndex = useTrackerStore.getState().currentPatternIndex;
    useTrackerStore.setState((state) => {
      state.patterns[patternIndex] = restored;
    });
    return { ok: true };
  }
  return { ok: false, error: 'Nothing to undo' };
}

export function redo(): Record<string, unknown> {
  const restored = useHistoryStore.getState().redo();
  if (restored) {
    const patternIndex = useTrackerStore.getState().currentPatternIndex;
    useTrackerStore.setState((state) => {
      state.patterns[patternIndex] = restored;
    });
    return { ok: true };
  }
  return { ok: false, error: 'Nothing to redo' };
}

// ─── Command Registry ──────────────────────────────────────────────────────────

export function executeCommand(params: Record<string, unknown>): Record<string, unknown> {
  const commandName = params.command as string;
  try {
    const registry = getGlobalRegistry();
    if (!registry) return { error: 'Command registry not initialized' };

    const success = registry.execute(commandName, 'global');
    return success ? { ok: true, command: commandName } : { error: `Command '${commandName}' failed or not found` };
  } catch (e) {
    return { error: `Command execution failed: ${(e as Error).message}` };
  }
}

// ─── Row Insert/Delete ─────────────────────────────────────────────────────────

export function insertRow(params: Record<string, unknown>): Record<string, unknown> {
  const channel = params.channel as number;
  const row = params.row as number;
  useTrackerStore.getState().insertRow(channel, row);
  return { ok: true };
}

export function deleteRow(params: Record<string, unknown>): Record<string, unknown> {
  const channel = params.channel as number;
  const row = params.row as number;
  useTrackerStore.getState().deleteRow(channel, row);
  return { ok: true };
}

// ─── Swap Channels ─────────────────────────────────────────────────────────────

export function swapChannels(params: Record<string, unknown>): Record<string, unknown> {
  const ch1 = params.channel1 as number;
  const ch2 = params.channel2 as number;
  useTrackerStore.getState().swapChannels(ch1, ch2);
  return { ok: true };
}

// ─── Bulk Operations ───────────────────────────────────────────────────────────

/** Fill a range with a repeating pattern of cells */
export function fillRange(params: Record<string, unknown>): Record<string, unknown> {
  const channel = params.channel as number;
  const startRow = params.startRow as number;
  const endRow = params.endRow as number;
  const step = (params.step as number) ?? 1;
  const cellData = params.cell as Record<string, unknown>;

  const patternIndex = params.patternIndex as number | undefined;
  if (patternIndex !== undefined) {
    useTrackerStore.getState().setCurrentPattern(patternIndex);
  }

  let count = 0;
  for (let r = startRow; r <= endRow; r += step) {
    const result = setCell({ ...cellData, channel, row: r });
    if ('error' in result) return result;
    count++;
  }

  return { ok: true, count };
}

/** Write a sequence of notes (e.g., arpeggio, scale) to consecutive rows */
export function writeNoteSequence(params: Record<string, unknown>): Record<string, unknown> {
  const channel = params.channel as number;
  const startRow = params.startRow as number;
  const notes = params.notes as Array<string | number>;
  const instrument = params.instrument as number | undefined;
  const step = (params.step as number) ?? 1;

  const patternIndex = params.patternIndex as number | undefined;
  if (patternIndex !== undefined) {
    useTrackerStore.getState().setCurrentPattern(patternIndex);
  }

  let row = startRow;
  for (const note of notes) {
    const cellParams: Record<string, unknown> = { channel, row, note };
    if (instrument !== undefined) cellParams.instrument = instrument;
    const result = setCell(cellParams);
    if ('error' in result) return result;
    row += step;
  }

  return { ok: true, count: notes.length };
}

// ─── Clipboard ─────────────────────────────────────────────────────────────────

export function copySelection(): Record<string, unknown> {
  useTrackerStore.getState().copySelection();
  const clipboard = useTrackerStore.getState().clipboard;
  return { ok: true, channels: clipboard?.channels ?? 0, rows: clipboard?.rows ?? 0 };
}

export function cutSelection(): Record<string, unknown> {
  useTrackerStore.getState().cutSelection();
  const clipboard = useTrackerStore.getState().clipboard;
  return { ok: true, channels: clipboard?.channels ?? 0, rows: clipboard?.rows ?? 0 };
}

export function pasteClipboard(params: Record<string, unknown>): Record<string, unknown> {
  const mode = (params.mode as string) ?? 'paste';
  const tracker = useTrackerStore.getState();
  switch (mode) {
    case 'mix': tracker.pasteMix(); break;
    case 'flood': tracker.pasteFlood(); break;
    default: tracker.paste(); break;
  }
  return { ok: true };
}

// ─── Dismiss Errors ────────────────────────────────────────────────────────────

export function dismissErrors(): Record<string, unknown> {
  useSynthErrorStore.getState().dismissAll();
  return { ok: true };
}

// ─── Column Visibility ─────────────────────────────────────────────────────────

export function setColumnVisibility(params: Record<string, unknown>): Record<string, unknown> {
  useEditorStore.getState().setColumnVisibility(params);
  return { ok: true };
}

// ─── Bookmarks ─────────────────────────────────────────────────────────────────

export function toggleBookmark(params: Record<string, unknown>): Record<string, unknown> {
  useEditorStore.getState().toggleBookmark(params.row as number);
  return { ok: true };
}

// ─── Synth Control ──────────────────────────────────────────────────────────────

/** Set a parameter on a running synth (DevilboxSynth or Tone.js) */
export function setSynthParam(params: Record<string, unknown>): Record<string, unknown> {
  const id = params.id as number;
  const param = params.param as string;
  const value = params.value as number;

  try {
    const engine = getToneEngine();
    const config = useInstrumentStore.getState().getInstrument(id);
    if (!config) return { error: `Instrument ${id} not found` };

    const synth = engine.getInstrument(id, config);
    if (!synth) return { error: `No active synth for instrument ${id}` };

    // DevilboxSynth with .set()
    if (typeof synth === 'object' && 'set' in synth && typeof (synth as { set?: unknown }).set === 'function') {
      (synth as { set: (p: string, v: number) => void }).set(param, value);
      return { ok: true, instrumentId: id, param, value };
    }

    // Tone.js synth with .set({})
    if (typeof synth === 'object' && 'set' in synth) {
      (synth as { set: (obj: Record<string, unknown>) => void }).set({ [param]: value });
      return { ok: true, instrumentId: id, param, value };
    }

    return { error: `Synth for instrument ${id} does not support parameter setting` };
  } catch (e) {
    return { error: `setSynthParam failed: ${(e as Error).message}` };
  }
}

/** Trigger a note on an instrument (for testing/preview) */
export async function triggerNote(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const id = params.id as number;
  const note = params.note as string;
  const velocity = (params.velocity as number) ?? 100;
  const duration = params.duration as number | undefined;

  try {
    const engine = getToneEngine();

    const config = useInstrumentStore.getState().instruments.find(i => i.id === id);
    if (!config) return { error: `Instrument ${id} not found` };
    await engine.ensureInstrumentReady(config);
    const now = Tone.now();
    if (duration) {
      engine.triggerNoteAttack(id, note, now, velocity / 127, config);
      engine.triggerNoteRelease(id, note, now + duration, config);
    } else {
      engine.triggerNoteAttack(id, note, now, velocity / 127, config);
    }
    return { ok: true, instrumentId: id, note, velocity };
  } catch (e) {
    return { error: `triggerNote failed: ${(e as Error).message}` };
  }
}

/** Release a note on an instrument */
export function releaseNote(params: Record<string, unknown>): Record<string, unknown> {
  const id = params.id as number;
  const note = params.note as string;

  try {
    const engine = getToneEngine();
    const config = useInstrumentStore.getState().instruments.find(i => i.id === id);
    if (!config) return { ok: true }; // instrument not found, nothing to release
    engine.triggerNoteRelease(id, note, Tone.now(), config);
    return { ok: true, instrumentId: id, note };
  } catch (e) {
    return { error: `releaseNote failed: ${(e as Error).message}` };
  }
}

/** Release all active notes */
export function releaseAllNotes(): Record<string, unknown> {
  try {
    const engine = getToneEngine();
    engine.releaseAll();
    return { ok: true };
  } catch (e) {
    return { error: `releaseAllNotes failed: ${(e as Error).message}` };
  }
}

/** Update synth-specific sub-config on an instrument (e.g., tb303, furnace, envelope) */
export function updateSynthConfig(params: Record<string, unknown>): Record<string, unknown> {
  const id = params.id as number;
  const configKey = params.configKey as string;
  const updates = params.updates as Record<string, unknown>;

  const inst = useInstrumentStore.getState().getInstrument(id);
  if (!inst) return { error: `Instrument ${id} not found` };

  // Build the update with the sub-config key
  const instrumentUpdate: Record<string, unknown> = {};
  const currentSubConfig = (inst as unknown as Record<string, unknown>)[configKey] ?? {};
  instrumentUpdate[configKey] = { ...(currentSubConfig as Record<string, unknown>), ...updates };

  useInstrumentStore.getState().updateInstrument(id, instrumentUpdate);
  return { ok: true, instrumentId: id, configKey, updatedFields: Object.keys(updates) };
}

/** Add a master audio effect */
export function addMasterEffect(params: Record<string, unknown>): Record<string, unknown> {
  const effectType = params.effectType as string;
  const force = params.force as boolean | undefined;
  if (force) {
    // Bypass format compatibility check (for testing/audit)
    useAudioStore.getState().addMasterEffectConfig({
      category: 'tonejs',
      type: effectType as never,
      enabled: true,
      wet: 50,
      parameters: {},
    });
  } else {
    useAudioStore.getState().addMasterEffect(effectType as never);
  }
  return { ok: true, effectType };
}

/** Update a master effect parameter */
export function updateMasterEffect(params: Record<string, unknown>): Record<string, unknown> {
  const effectId = params.effectId as string;
  const updates = params.updates as Record<string, unknown>;
  useAudioStore.getState().updateMasterEffect(effectId, updates as never);
  return { ok: true, effectId };
}

/** Remove a master effect */
export function removeMasterEffect(params: Record<string, unknown>): Record<string, unknown> {
  const effectId = params.effectId as string;
  useAudioStore.getState().removeMasterEffect(effectId);
  return { ok: true, effectId };
}

/** Toggle a master effect on/off */
export function toggleMasterEffect(params: Record<string, unknown>): Record<string, unknown> {
  const effectId = params.effectId as string;
  const audio = useAudioStore.getState();
  const effect = audio.masterEffects.find((fx) => fx.id === effectId);
  if (!effect) return { error: `Effect ${effectId} not found` };
  audio.updateMasterEffect(effectId, { enabled: !effect.enabled } as never);
  return { ok: true, effectId, enabled: !effect.enabled };
}

/** Set sample bus gain (dB) */
export function setSampleBusGain(params: Record<string, unknown>): Record<string, unknown> {
  useAudioStore.getState().setSampleBusGain(params.gain as number);
  return { ok: true };
}

/** Set synth bus gain (dB) */
export function setSynthBusGain(params: Record<string, unknown>): Record<string, unknown> {
  useAudioStore.getState().setSynthBusGain(params.gain as number);
  return { ok: true };
}

// ─── File Loading ──────────────────────────────────────────────────────────────

/** Load a file into the tracker from base64-encoded data */
export async function loadFile(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const filename = params.filename as string;
  const base64Data = params.data as string;

  if (!filename || !base64Data) {
    return { error: 'Missing required params: filename, data (base64)' };
  }

  try {
    // Decode base64 to ArrayBuffer
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const arrayBuffer = bytes.buffer;

    // Decode companion files (e.g. .nt for StarTrekker AM)
    const companionFilesRaw = params.companionFiles as Record<string, string> | undefined;
    const companionFiles = new Map<string, ArrayBuffer>();
    if (companionFilesRaw) {
      for (const [name, b64] of Object.entries(companionFilesRaw)) {
        const cStr = atob(b64);
        const cBytes = new Uint8Array(cStr.length);
        for (let i = 0; i < cStr.length; i++) cBytes[i] = cStr.charCodeAt(i);
        companionFiles.set(name, cBytes.buffer);
      }
    }

    // Create a File object (browser API)
    const file = new File([arrayBuffer], filename, { type: 'application/octet-stream' });

    // Use the full UnifiedFileLoader pipeline (same as drag-and-drop in the UI).
    // This correctly routes .sunvox, .fur, UADE formats, etc.
    const { loadFile: unifiedLoadFile } = await import('../../lib/file/UnifiedFileLoader');
    const { detectFormat } = await import('../../lib/import/FormatRegistry');

    const format = detectFormat(filename);
    const subsong = (params.subsong as number) ?? 0;

    let loadResult = await unifiedLoadFile(file, { subsong, companionFiles: companionFiles.size > 0 ? companionFiles : undefined });
    if (!loadResult.success) {
      throw new Error(loadResult.error || `Failed to load ${filename}`);
    }
    if (loadResult.success === 'pending-confirmation') {
      throw new Error(`${filename} requires user confirmation before loading (format dialog suppressed)`);
    }
    // For tracker modules that need the import dialog, bypass it and import directly.
    if (loadResult.success === 'pending-import') {
      suppressFormatChecks();
      try {
      // Default to libopenmpt for standard tracker formats (MOD/XM/IT/S3M etc.)
      // unless explicitly disabled. The old code required useLibopenmpt=true which
      // the MCP load_modland/load_file callers never set, causing MODs to silently
      // fall through to parseModuleToSong which could fail.
      const libopenmptExts = /\.(mod|xm|s3m|it|stm|669|far|ult|mtm|med|mmd[0-3]|okt|okta|gdm|psm|m15)$/i;
      const canUseLibopenmpt = params.useLibopenmpt !== false && libopenmptExts.test(filename);

      // Formats that loadModuleFile handles via its own native parser (useNativeParser):
      // .fur, .dmf, .xrns — plus .xm/.mod which are covered by canUseLibopenmpt above.
      // Other nativeOnly formats (Organya, PxTone, Eupmini, etc.) do NOT have parsers
      // in loadModuleFile — they are routed via AmigaFormatParsers in parseModuleToSong.
      const moduleLoaderNativeExts = /\.(fur|dmf|xrns)$/i;
      const needsModuleLoader = canUseLibopenmpt || moduleLoaderNativeExts.test(filename);
      if (needsModuleLoader) {
        // Use the standard import pipeline for libopenmpt formats AND formats
        // with native parsers in ModuleLoader (Furnace, DefleMask, XRNS).
        const { loadModuleFile } = await import('../../lib/import/ModuleLoader');
        const moduleInfo = await loadModuleFile(file);

        // DefleMask: parseFurnaceFile already produced a full TrackerSong — load it directly
        if (moduleInfo.dmfSong) {
          const { useTrackerStore: ts } = await import('../../stores/useTrackerStore');
          const { useInstrumentStore: is } = await import('../../stores/useInstrumentStore');
          const { useTransportStore: trs } = await import('../../stores/useTransportStore');
          const { useProjectStore: ps } = await import('../../stores/useProjectStore');
          const { useFormatStore: fs } = await import('../../stores/useFormatStore');
          const { getToneEngine } = await import('../../engine/ToneEngine');
          const engine = getToneEngine();
          if (trs.getState().isPlaying) trs.getState().stop();
          engine.releaseAll();
          trs.getState().reset();
          ts.getState().reset();
          is.getState().reset();
          engine.disposeAllInstruments();
          const song = moduleInfo.dmfSong;
          is.getState().loadInstruments(song.instruments);
          ts.getState().loadPatterns(song.patterns);
          ts.getState().setCurrentPattern(0);
          if (song.songPositions?.length) ts.getState().setPatternOrder(song.songPositions);
          ps.getState().setMetadata({ name: song.name || filename, author: '', description: `Imported DefleMask: ${filename}` });
          trs.getState().setBPM(song.initialBPM || 125);
          trs.getState().setSpeed(song.initialSpeed || 6);
          fs.getState().applyEditorMode(song);
        } else {
          const { importTrackerModule } = await import('../../lib/file/UnifiedFileLoader');
          await importTrackerModule(moduleInfo, {
            useLibopenmpt: canUseLibopenmpt,
            subsong,
            companionFiles: companionFiles.size > 0 ? companionFiles : undefined,
          });
        }
      } else if (format?.nativeParser?.parseFn === 'parseAdPlugFile') {
        // Direct AdPlug OPL parser path — only for formats whose registered
        // nativeParser is explicitly the AdPlug parser. Other formats with
        // nativeParsers (MOD, XM, IT, S3M, HVL, FC, JAM, etc.) fall through
        // to the parseModuleToSong pipeline which routes them correctly.
        const { parseAdPlugFile } = await import('../../lib/import/formats/AdPlugParser');
        const song = parseAdPlugFile(arrayBuffer, filename);

        const { useTrackerStore: ts } = await import('../../stores/useTrackerStore');
        const { useInstrumentStore: is } = await import('../../stores/useInstrumentStore');
        const { useTransportStore: trs } = await import('../../stores/useTransportStore');
        const { useProjectStore: ps } = await import('../../stores/useProjectStore');
        const { useFormatStore: fs } = await import('../../stores/useFormatStore');
        const { getToneEngine } = await import('../../engine/ToneEngine');
        const engine = getToneEngine();

        if (trs.getState().isPlaying) trs.getState().stop();
        engine.releaseAll();
        trs.getState().reset();
        ts.getState().reset();
        is.getState().reset();
        engine.disposeAllInstruments();

        is.getState().loadInstruments(song.instruments);
        ts.getState().loadPatterns(song.patterns);
        if (song.songPositions) ts.getState().setPatternOrder(song.songPositions);
        trs.getState().setBPM(song.initialBPM ?? 125);
        ps.getState().setMetadata({ name: song.name });
        fs.getState().applyEditorMode(song);
      } else {
        // Native parser path for Amiga/UADE formats that libopenmpt can't read
        const { parseModuleToSong } = await import('../../lib/import/parseModuleToSong');
        const song = await parseModuleToSong(file, subsong, undefined, undefined, companionFiles.size > 0 ? companionFiles : undefined);
        const { useTrackerStore: ts } = await import('../../stores/useTrackerStore');
        const { useInstrumentStore: is } = await import('../../stores/useInstrumentStore');
        const { useTransportStore: trs } = await import('../../stores/useTransportStore');
        const { useProjectStore: ps } = await import('../../stores/useProjectStore');
        const { useFormatStore: fs } = await import('../../stores/useFormatStore');
        const { getToneEngine } = await import('../../engine/ToneEngine');
        const engine = getToneEngine();

        if (trs.getState().isPlaying) trs.getState().stop();
        engine.releaseAll();
        trs.getState().reset();
        ts.getState().reset();
        is.getState().reset();
        engine.disposeAllInstruments();

        is.getState().loadInstruments(song.instruments);
        ts.getState().loadPatterns(song.patterns);
        if (song.songPositions) ts.getState().setPatternOrder(song.songPositions);
        trs.getState().setBPM(song.initialBPM ?? 125);
        ps.getState().setMetadata({ name: song.name });
        fs.getState().applyEditorMode(song);
      }
      } finally {
        restoreFormatChecks();
      }
      loadResult = { success: true, message: 'imported' };
    }

    // Wait for any deferred state updates (loadInstruments uses queueMicrotask)
    await new Promise<void>(resolve => queueMicrotask(resolve));

    // Streaming WASM players (AdPlug, V2M) bypass the tracker store entirely —
    // return metadata from the player instance, not stale tracker state.
    // But if extraction succeeded (editable mode), return tracker store data instead.
    const { isAdPlugWasmFormat } = await import('../../lib/file/UnifiedFileLoader');
    if (isAdPlugWasmFormat(filename)) {
      const instrumentState = useInstrumentStore.getState();
      const hasExtractedInstruments = instrumentState.instruments.some(i => i.synthType === 'OPL3');
      if (!hasExtractedInstruments) {
        // Streaming fallback — use player metadata
        const { getAdPlugPlayer } = await import('../../lib/import/AdPlugPlayer');
        const meta = getAdPlugPlayer().meta;
        return {
          ok: true,
          format: meta?.formatType || 'AdPlug',
          streaming: true,
          title: meta?.title || filename,
          subsongs: meta?.subsongs || 1,
          instruments: meta?.instruments?.length || 0,
          filename,
        };
      }
      // Extracted editable — fall through to tracker store response below
    }
    if (filename.endsWith('.v2m')) {
      return {
        ok: true,
        format: 'V2M',
        streaming: true,
        filename,
      };
    }

    // Read back the result from stores
    const trackerState = useTrackerStore.getState();
    const instrumentState = useInstrumentStore.getState();
    const formatState = (await import('../../stores/useFormatStore')).useFormatStore.getState();

    return {
      ok: true,
      format: format?.label || 'Unknown',
      editorMode: formatState.editorMode,
      channels: trackerState.patterns[0]?.channels?.length || 0,
      patterns: trackerState.patterns.length,
      instruments: instrumentState.instruments.length,
      filename,
    };
  } catch (e) {
    return { error: `loadFile failed: ${(e as Error).message}` };
  }
}

// ─── Test Tone ────────────────────────────────────────────────────────────────

let _testToneOsc: Tone.Oscillator | null = null;
let _testToneGain: Tone.Gain | null = null;
let _richToneNodes: Tone.ToneAudioNode[] = [];

function stopAllTestTones() {
  if (_testToneOsc) {
    _testToneOsc.stop(); _testToneOsc.dispose(); _testToneOsc = null;
  }
  if (_testToneGain) {
    _testToneGain.dispose(); _testToneGain = null;
  }
  for (const n of _richToneNodes) {
    try { n.dispose(); } catch { /* */ }
  }
  _richToneNodes = [];
}

/**
 * Start/stop a test tone routed through the master effects chain.
 * mode='sine' (default): single sine wave
 * mode='rich': full-spectrum signal — sub bass (saw 55Hz), bass (saw 110Hz),
 *   mid (square 440Hz), upper-mid (triangle 1760Hz), presence (saw 3520Hz),
 *   plus white noise for transient/air content. Exercises EQ, compressors,
 *   distortion, filters, and time-based effects properly.
 */
export function testTone(params: Record<string, unknown>): Record<string, unknown> {
  const action = (params.action as string) ?? 'start';
  const freq = (params.frequency as number) ?? 440;
  const level = (params.level as number) ?? -12; // dBFS
  const mode = (params.mode as string) ?? 'sine';

  if (action === 'stop') {
    stopAllTestTones();
    return { status: 'stopped' };
  }

  stopAllTestTones();

  const engine = getToneEngine();
  if (!engine) return { error: 'ToneEngine not initialized' };

  const masterGain = Math.pow(10, level / 20);

  if (mode === 'rich') {
    // Multi-oscillator full-spectrum signal
    const mix = new Tone.Gain(masterGain);
    mix.connect(engine.masterEffectsInput);
    _richToneNodes.push(mix);

    const layers: { type: OscillatorType; frequency: number; gain: number }[] = [
      { type: 'sawtooth',  frequency: 55,   gain: 0.25 },  // sub bass
      { type: 'sawtooth',  frequency: 110,  gain: 0.22 },  // bass
      { type: 'square',    frequency: 440,  gain: 0.18 },  // mid
      { type: 'triangle',  frequency: 1760, gain: 0.12 },  // upper mid
      { type: 'sawtooth',  frequency: 3520, gain: 0.08 },  // presence
    ];

    for (const l of layers) {
      const g = new Tone.Gain(l.gain);
      const o = new Tone.Oscillator({ frequency: l.frequency, type: l.type });
      o.connect(g);
      g.connect(mix);
      o.start();
      _richToneNodes.push(o, g);
    }

    // White noise for transients / air
    const noiseGain = new Tone.Gain(0.06);
    const noise = new Tone.Noise('white');
    noise.connect(noiseGain);
    noiseGain.connect(mix);
    noise.start();
    _richToneNodes.push(noise, noiseGain);

    return { status: 'playing', mode: 'rich', levelDb: level, layers: layers.length + 1 };
  }

  // Simple sine mode
  _testToneGain = new Tone.Gain(masterGain);
  _testToneOsc = new Tone.Oscillator({ frequency: freq, type: 'sine' });
  _testToneOsc.connect(_testToneGain);
  _testToneGain.connect(engine.masterEffectsInput);
  _testToneOsc.start();

  return { status: 'playing', mode: 'sine', frequency: freq, levelDb: level };
}

/** Replace all master effects at once (for preset auditing) */
export function setMasterEffects(params: Record<string, unknown>): Record<string, unknown> {
  const effects = params.effects as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(effects)) return { error: 'effects must be an array' };

  const configs = effects.map((fx, i) => ({
    id: `audit-fx-${Date.now()}-${i}`,
    category: (fx.category as string) ?? 'tonejs',
    type: fx.type as string,
    enabled: fx.enabled !== false,
    wet: (fx.wet as number) ?? 50,
    parameters: (fx.parameters as Record<string, unknown>) ?? {},
  }));

  useAudioStore.getState().setMasterEffects(configs as never);
  return { ok: true, count: configs.length };
}

// ─── Audio Measurement ─────────────────────────────────────────────────────────

/** Measure audio output level over a time window */
export function getAudioLevel(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const durationMs = (params.durationMs as number) ?? 2000;

  return new Promise((resolve) => {
    try {
      const bus = AudioDataBus.getShared();

      let framesAnalyzed = 0;
      let rmsSum = 0;
      let rmsMax = 0;
      let peakMax = 0;

      const startTime = performance.now();
      // Use MessageChannel for timing — setInterval gets throttled to 1/sec
      // in background tabs, making audio measurement useless. MessageChannel
      // postMessage fires on the microtask queue and isn't throttled.
      const channel = new MessageChannel();
      const tick = () => {
        const frame = bus.update();
        framesAnalyzed++;
        rmsSum += frame.rms;
        if (frame.rms > rmsMax) rmsMax = frame.rms;
        if (frame.peak > peakMax) peakMax = frame.peak;

        if (performance.now() - startTime >= durationMs) {
          channel.port1.onmessage = null;
          const rmsAvg = framesAnalyzed > 0 ? rmsSum / framesAnalyzed : 0;
          resolve({
            rmsAvg: +rmsAvg.toFixed(6),
            rmsMax: +rmsMax.toFixed(6),
            peakMax: +peakMax.toFixed(6),
            framesAnalyzed,
            durationMs: Math.round(performance.now() - startTime),
            silent: rmsMax < 0.001,
          });
          return;
        }
        // Schedule next tick via MessageChannel (not throttled in background tabs)
        channel.port2.postMessage(null);
      };
      channel.port1.onmessage = tick;
      // Kick off the first tick
      channel.port2.postMessage(null);
    } catch (e) {
      resolve({ error: `getAudioLevel failed: ${(e as Error).message}` });
    }
  });
}

/** Wait until audio is playing (non-silent) or timeout */
export function waitForAudio(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const timeoutMs = (params.timeoutMs as number) ?? 5000;
  const thresholdRms = (params.thresholdRms as number) ?? 0.001;

  return new Promise((resolve) => {
    try {
      const bus = AudioDataBus.getShared();

      const startTime = performance.now();
      const interval = setInterval(() => {
        const frame = bus.update();
        const elapsed = performance.now() - startTime;

        if (frame.rms > thresholdRms) {
          clearInterval(interval);
          resolve({
            detected: true,
            rms: +frame.rms.toFixed(6),
            peak: +frame.peak.toFixed(6),
            waitedMs: Math.round(elapsed),
          });
        } else if (elapsed >= timeoutMs) {
          clearInterval(interval);
          resolve({
            detected: false,
            rms: +frame.rms.toFixed(6),
            peak: +frame.peak.toFixed(6),
            waitedMs: Math.round(elapsed),
          });
        }
      }, 16);
    } catch (e) {
      resolve({ error: `waitForAudio failed: ${(e as Error).message}` });
    }
  });
}

// ─── Synth Programming: Spectral Analysis ────────────────────────────────────

/** Trigger a note on an instrument, capture FFT frames, compute spectral metrics */
export async function analyzeInstrumentSpectrum(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const instrumentId = (params.instrumentId as number) ?? 0;
  const note = (params.note as string) || 'C-3';
  const durationMs = (params.durationMs as number) ?? 1000;
  const captureDelayMs = (params.captureDelayMs as number) ?? 100; // wait for attack phase

  try {
    const engine = getToneEngine();
    const instrumentConfig = useInstrumentStore.getState().getInstrument(instrumentId);
    if (!instrumentConfig) return { error: `Instrument ${instrumentId} not found` };

    const bus = AudioDataBus.getShared();
    const now = Tone.now();
    const durationSec = durationMs / 1000;

    // Trigger the note
    engine.triggerNoteAttack(instrumentId, note, now, 0.8, instrumentConfig);
    engine.triggerNoteRelease(instrumentId, note, now + durationSec, instrumentConfig);

    // Wait for attack + collect FFT frames
    return new Promise((resolve) => {
      const startTime = performance.now();
      const fftFrames: Float32Array[] = [];
      const rmsValues: number[] = [];
      let collecting = false;

      function capture() {
        const elapsed = performance.now() - startTime;

        if (elapsed >= captureDelayMs) collecting = true;

        if (collecting) {
          bus.update();
          const frame = bus.getFrame();
          if (frame.fft && frame.fft.length > 0) {
            fftFrames.push(new Float32Array(frame.fft));
          }
          rmsValues.push(frame.rms ?? 0);
        }

        if (elapsed < durationMs + 50) {
          requestAnimationFrame(capture);
        } else {
          // Compute spectral metrics from collected frames
          resolve(computeSpectralMetrics(fftFrames, rmsValues, note, instrumentId));
        }
      }

      requestAnimationFrame(capture);
    });
  } catch (e) {
    return { error: `analyzeInstrumentSpectrum failed: ${(e as Error).message}` };
  }
}

function computeSpectralMetrics(
  fftFrames: Float32Array[],
  rmsValues: number[],
  note: string,
  instrumentId: number,
): Record<string, unknown> {
  if (fftFrames.length === 0) {
    return { error: 'No FFT data captured — is the instrument producing audio?', instrumentId, note };
  }

  // Average FFT across all frames
  const binCount = fftFrames[0].length;
  const avgFft = new Float32Array(binCount);
  for (const frame of fftFrames) {
    for (let i = 0; i < binCount; i++) {
      avgFft[i] += frame[i] / fftFrames.length;
    }
  }

  // Assume 44100Hz sample rate, FFT size = binCount * 2
  const sampleRate = 44100;
  const fftSize = binCount * 2;
  const binHz = sampleRate / fftSize;

  // Find fundamental (peak bin)
  let peakBin = 0;
  let peakValue = -Infinity;
  for (let i = 1; i < binCount; i++) {
    if (avgFft[i] > peakValue) {
      peakValue = avgFft[i];
      peakBin = i;
    }
  }
  const fundamentalHz = peakBin * binHz;

  // Harmonics: find peaks at 2x, 3x, 4x, 5x, 6x, 7x, 8x fundamental
  const harmonics: number[] = [];
  for (let h = 2; h <= 8; h++) {
    const targetBin = Math.round(peakBin * h);
    if (targetBin >= binCount) break;
    // Search +/- 2 bins around target
    let maxVal = -Infinity;
    for (let j = Math.max(0, targetBin - 2); j <= Math.min(binCount - 1, targetBin + 2); j++) {
      if (avgFft[j] > maxVal) maxVal = avgFft[j];
    }
    // Normalize relative to fundamental
    harmonics.push(peakValue > -100 ? +((maxVal - peakValue)).toFixed(1) : 0);
  }

  // Spectral centroid (brightness indicator)
  let weightedSum = 0;
  let totalEnergy = 0;
  for (let i = 0; i < binCount; i++) {
    const linearMag = Math.pow(10, avgFft[i] / 20);
    weightedSum += i * binHz * linearMag;
    totalEnergy += linearMag;
  }
  const spectralCentroid = totalEnergy > 0 ? weightedSum / totalEnergy : 0;

  // Brightness: ratio of energy above 2kHz vs total
  const cutoffBin = Math.floor(2000 / binHz);
  let highEnergy = 0;
  let totalE = 0;
  for (let i = 1; i < binCount; i++) {
    const lin = Math.pow(10, avgFft[i] / 20);
    totalE += lin;
    if (i >= cutoffBin) highEnergy += lin;
  }
  const brightness = totalE > 0 ? highEnergy / totalE : 0;

  // RMS stats
  const rmsAvg = rmsValues.length > 0
    ? rmsValues.reduce((s, v) => s + v, 0) / rmsValues.length
    : 0;
  const rmsMax = rmsValues.length > 0 ? Math.max(...rmsValues) : 0;

  // Envelope estimation: find attack (time to peak RMS) and decay shape
  let peakRmsIdx = 0;
  let peakRms = 0;
  for (let i = 0; i < rmsValues.length; i++) {
    if (rmsValues[i] > peakRms) { peakRms = rmsValues[i]; peakRmsIdx = i; }
  }
  const msPerFrame = rmsValues.length > 1 ? 1000 / 60 : 16.67; // ~60fps
  const attackMs = peakRmsIdx * msPerFrame;

  // Sustain level: average of last 30% of frames
  const sustainStart = Math.floor(rmsValues.length * 0.7);
  const sustainFrames = rmsValues.slice(sustainStart);
  const sustainLevel = sustainFrames.length > 0
    ? sustainFrames.reduce((s, v) => s + v, 0) / sustainFrames.length
    : 0;

  // Downsample FFT to 32 bins for response
  const fftSummary: number[] = [];
  const step = Math.max(1, Math.floor(binCount / 32));
  for (let i = 0; i < binCount; i += step) {
    let max = -Infinity;
    for (let j = i; j < Math.min(i + step, binCount); j++) {
      if (avgFft[j] > max) max = avgFft[j];
    }
    fftSummary.push(+max.toFixed(1));
  }

  return {
    instrumentId,
    note,
    framesAnalyzed: fftFrames.length,
    fundamental: +fundamentalHz.toFixed(1),
    fundamentalDb: +peakValue.toFixed(1),
    harmonicsDb: harmonics,
    spectralCentroid: +spectralCentroid.toFixed(1),
    brightness: +brightness.toFixed(3),
    rmsAvg: +rmsAvg.toFixed(4),
    rmsMax: +rmsMax.toFixed(4),
    envelope: {
      attackMs: +attackMs.toFixed(0),
      sustainLevel: +sustainLevel.toFixed(4),
    },
    fftSummary,
  };
}

/** Sweep a synth parameter across a range, measuring spectral response at each step */
export async function sweepParameter(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const instrumentId = (params.instrumentId as number) ?? 0;
  const parameter = params.parameter as string;
  const from = (params.from as number) ?? 0;
  const to = (params.to as number) ?? 1;
  const steps = (params.steps as number) ?? 10;
  const note = (params.note as string) || 'C-3';
  const noteDurationMs = (params.noteDurationMs as number) ?? 500;
  const settleMs = (params.settleMs as number) ?? 100;

  if (!parameter) return { error: 'parameter is required' };

  try {
    const engine = getToneEngine();
    const instrumentConfig = useInstrumentStore.getState().getInstrument(instrumentId);
    if (!instrumentConfig) return { error: `Instrument ${instrumentId} not found` };

    const synth = engine.getInstrument(instrumentId, instrumentConfig);
    if (!synth) return { error: `No active synth for instrument ${instrumentId}` };

    const hasSetter = typeof synth === 'object' && 'set' in synth && typeof (synth as any).set === 'function';
    if (!hasSetter) return { error: `Synth for instrument ${instrumentId} does not support parameter setting` };

    const bus = AudioDataBus.getShared();
    const sweepConfig = useInstrumentStore.getState().instruments.find(i => i.id === instrumentId);
    if (!sweepConfig) return { error: `Instrument ${instrumentId} not found` };
    const results: Array<Record<string, unknown>> = [];

    for (let i = 0; i <= steps; i++) {
      const value = from + (to - from) * (i / steps);

      // Set parameter
      (synth as any).set(parameter, value);

      // Brief settle time
      await new Promise(r => setTimeout(r, settleMs));

      // Trigger note
      const now = Tone.now();
      engine.triggerNoteAttack(instrumentId, note, now, 0.8, sweepConfig);

      // Collect FFT frames during note
      const fftFrames: Float32Array[] = [];
      const rmsValues: number[] = [];

      await new Promise<void>((resolve) => {
        const startTime = performance.now();
        function capture() {
          bus.update();
          const frame = bus.getFrame();
          if (frame.fft && frame.fft.length > 0) {
            fftFrames.push(new Float32Array(frame.fft));
          }
          rmsValues.push(frame.rms ?? 0);

          if (performance.now() - startTime < noteDurationMs) {
            requestAnimationFrame(capture);
          } else {
            resolve();
          }
        }
        // Wait 50ms for attack before capturing
        setTimeout(() => requestAnimationFrame(capture), 50);
      });

      // Release note
      engine.triggerNoteRelease(instrumentId, note, Tone.now(), sweepConfig);

      // Wait for release tail
      await new Promise(r => setTimeout(r, 100));

      // Compute metrics for this step
      if (fftFrames.length > 0) {
        const binCount = fftFrames[0].length;
        const avgFft = new Float32Array(binCount);
        for (const frame of fftFrames) {
          for (let j = 0; j < binCount; j++) avgFft[j] += frame[j] / fftFrames.length;
        }

        const sampleRate = 44100;
        const binHz = sampleRate / (binCount * 2);

        // Spectral centroid
        let weightedSum = 0;
        let totalEnergy = 0;
        for (let j = 0; j < binCount; j++) {
          const lin = Math.pow(10, avgFft[j] / 20);
          weightedSum += j * binHz * lin;
          totalEnergy += lin;
        }
        const centroid = totalEnergy > 0 ? weightedSum / totalEnergy : 0;

        // Brightness
        const cutBin = Math.floor(2000 / binHz);
        let highE = 0, totE = 0;
        for (let j = 1; j < binCount; j++) {
          const lin = Math.pow(10, avgFft[j] / 20);
          totE += lin;
          if (j >= cutBin) highE += lin;
        }

        const rmsAvg = rmsValues.reduce((s, v) => s + v, 0) / rmsValues.length;

        results.push({
          value: +value.toFixed(3),
          spectralCentroid: +centroid.toFixed(1),
          brightness: +(totE > 0 ? highE / totE : 0).toFixed(3),
          rmsAvg: +rmsAvg.toFixed(4),
          rmsMax: +Math.max(...rmsValues).toFixed(4),
          frames: fftFrames.length,
        });
      } else {
        results.push({ value: +value.toFixed(3), error: 'no FFT data', rmsAvg: 0 });
      }
    }

    return {
      ok: true,
      instrumentId,
      parameter,
      from,
      to,
      steps,
      note,
      results,
    };
  } catch (e) {
    return { error: `sweepParameter failed: ${(e as Error).message}` };
  }
}

// ─── Live Performance: Audio Monitoring ──────────────────────────────────────

/** Start the audio monitor ring buffer */
export function startMonitoring(params: Record<string, unknown>): Record<string, unknown> {
  const bufferSize = (params.bufferSize as number) ?? 120;
  const intervalMs = (params.intervalMs as number) ?? 250;

  // Dispose existing and create fresh
  disposeAudioMonitor();
  // getAudioMonitor uses default params; for custom params we'd need a factory override.
  // For now, use the defaults — the ring buffer size/interval are sensible.
  const monitor = getAudioMonitor();
  monitor.start();
  return { ok: true, bufferSize, intervalMs, status: 'started' };
}

/** Get current monitoring data */
export function getMonitoringData(): Record<string, unknown> {
  const monitor = getAudioMonitor();
  if (!monitor.isRunning()) {
    return { error: 'Monitor is not running. Call start_monitoring first.' };
  }
  return monitor.getData();
}

/** Stop the audio monitor */
export function stopMonitoring(): Record<string, unknown> {
  const monitor = getAudioMonitor();
  monitor.stop();
  return { ok: true, status: 'stopped' };
}

/** Auto-mix: Apply reactive mixing rules based on current audio analysis */
export function autoMix(params: Record<string, unknown>): Record<string, unknown> {
  try {
    const mode = (params.mode as string) || 'balance';
    const intensity = (params.intensity as number) ?? 0.5;
    const targetChannels = params.channels as number[] | undefined;

    const { patterns, currentPatternIndex } = useTrackerStore.getState();
    const pattern = patterns[currentPatternIndex];
    if (!pattern) return { error: 'No current pattern' };

    const mixer = useMixerStore.getState();
    const bus = AudioDataBus.getShared();
    bus.update();
    const frame = bus.getFrame();

    const channels = targetChannels ?? Array.from({ length: pattern.channels.length }, (_, i) => i);
    const adjustments: Array<{ channel: number; action: string; value: number }> = [];

    switch (mode) {
      case 'balance': {
        // Balance all channels to similar perceived loudness
        const mixerChannels = mixer.channels;
        const targetRms = frame.rms > 0 ? frame.rms / channels.length : 0.1;
        for (const ch of channels) {
          const currentVol = mixerChannels[ch]?.volume ?? 1;
          // Nudge toward target — scaled by intensity (volume is 0-1)
          const adjustment = (targetRms > 0.001 ? 0 : 0.05) * intensity;
          if (Math.abs(adjustment) > 0.01) {
            const newVol = Math.max(0, Math.min(1, currentVol + adjustment));
            mixer.setChannelVolume(ch, newVol);
            adjustments.push({ channel: ch, action: 'volume', value: +newVol.toFixed(3) });
          }
        }
        break;
      }

      case 'duck_bass': {
        // Duck non-bass channels when bass energy is high
        const mixerChannels2 = mixer.channels;
        const bassThreshold = 0.3 * intensity;
        if (frame.bassEnergy > bassThreshold) {
          const duckAmount = Math.min(0.3, frame.bassEnergy * 0.5 * intensity);
          for (const ch of channels.slice(1)) { // Skip first channel (assumed bass)
            const currentVol = mixerChannels2[ch]?.volume ?? 1;
            const newVol = Math.max(0, currentVol - duckAmount);
            mixer.setChannelVolume(ch, newVol);
            adjustments.push({ channel: ch, action: 'duck', value: +newVol.toFixed(3) });
          }
        }
        break;
      }

      case 'emphasize_melody': {
        // Boost channels with high mid/high energy (likely melody)
        const mixerChannels3 = mixer.channels;
        const boost = 0.1 * intensity;
        for (const ch of channels) {
          const currentVol = mixerChannels3[ch]?.volume ?? 1;
          // If overall mid energy is dominant, boost this channel slightly
          if (frame.midEnergy > frame.bassEnergy && frame.midEnergy > 0.2) {
            const newVol = Math.min(1, currentVol + boost);
            mixer.setChannelVolume(ch, newVol);
            adjustments.push({ channel: ch, action: 'boost_melody', value: +newVol.toFixed(3) });
          }
        }
        break;
      }

      case 'reset': {
        // Reset all channels to default volume (1 = unity), center pan (0), unmuted
        for (const ch of channels) {
          mixer.setChannelVolume(ch, 1);
          mixer.setChannelPan(ch, 0);
          mixer.setChannelMute(ch, false);
          adjustments.push({ channel: ch, action: 'reset', value: 1 });
        }
        break;
      }

      default:
        return { error: `Unknown auto_mix mode: ${mode}` };
    }

    return {
      ok: true,
      mode,
      intensity,
      adjustments,
      audioState: {
        rms: +frame.rms.toFixed(4),
        bass: +frame.bassEnergy.toFixed(3),
        mid: +frame.midEnergy.toFixed(3),
        high: +frame.highEnergy.toFixed(3),
      },
    };
  } catch (e) {
    return { error: `autoMix failed: ${(e as Error).message}` };
  }
}

/** Set an auto-effect that modulates based on audio reactivity */
export function setAutoEffect(params: Record<string, unknown>): Record<string, unknown> {
  try {
    const effectId = params.effectId as string;
    const parameter = params.parameter as string;
    const source = (params.source as string) || 'rms';
    const min = (params.min as number) ?? 0;
    const max = (params.max as number) ?? 100;
    const smoothing = (params.smoothing as number) ?? 0.5;

    if (!effectId) return { error: 'effectId is required' };
    if (!parameter) return { error: 'parameter is required' };

    // Validate source
    const validSources = ['rms', 'peak', 'bass', 'mid', 'high', 'sub', 'beat'];
    if (!validSources.includes(source)) {
      return { error: `Invalid source: ${source}. Valid: ${validSources.join(', ')}` };
    }

    // Set up a modulation loop using requestAnimationFrame
    const bus = AudioDataBus.getShared();
    let active = true;
    let smoothedValue = 0;
    const alpha = 1 - smoothing;

    // Store cleanup in a global map so we can cancel later
    const key = `${effectId}:${parameter}`;
    if ((globalThis as any).__autoEffects?.[key]) {
      (globalThis as any).__autoEffects[key]();
    }
    if (!(globalThis as any).__autoEffects) (globalThis as any).__autoEffects = {};

    function modulate() {
      if (!active) return;
      bus.update();
      const frame = bus.getFrame();

      let rawValue: number;
      switch (source) {
        case 'rms': rawValue = frame.rms; break;
        case 'peak': rawValue = frame.peak; break;
        case 'bass': rawValue = frame.bassEnergy; break;
        case 'mid': rawValue = frame.midEnergy; break;
        case 'high': rawValue = frame.highEnergy; break;
        case 'sub': rawValue = frame.subEnergy; break;
        case 'beat': rawValue = frame.beat ? 1 : 0; break;
        default: rawValue = 0;
      }

      smoothedValue = smoothedValue * (1 - alpha) + rawValue * alpha;
      const mapped = min + smoothedValue * (max - min);

      // Apply to master effect via the audio store
      const audioStore = useAudioStore.getState();
      const effects = audioStore.masterEffects || [];
      const effect = effects.find((e) => e.id === effectId);
      if (effect) {
        try {
          if (parameter === 'wet') {
            audioStore.updateMasterEffect(effectId, { wet: mapped });
          } else {
            audioStore.updateMasterEffect(effectId, {
              parameters: { ...effect.parameters, [parameter]: mapped },
            });
          }
        } catch { /* parameter may not exist */ }
      }

      requestAnimationFrame(modulate);
    }

    (globalThis as any).__autoEffects[key] = () => { active = false; };
    requestAnimationFrame(modulate);

    return {
      ok: true,
      effectId,
      parameter,
      source,
      range: [min, max],
      smoothing,
      status: 'active',
      cancelKey: key,
    };
  } catch (e) {
    return { error: `setAutoEffect failed: ${(e as Error).message}` };
  }
}

/** Cancel an auto-effect modulation */
export function cancelAutoEffect(params: Record<string, unknown>): Record<string, unknown> {
  const key = params.key as string;
  if (!key) return { error: 'key is required (from set_auto_effect response cancelKey)' };

  const effects = (globalThis as any).__autoEffects;
  if (effects?.[key]) {
    effects[key]();
    delete effects[key];
    return { ok: true, cancelled: key };
  }
  return { error: `No active auto-effect with key: ${key}` };
}

// ─── Modal Control ───────────────────────────────────────────────────────────

/** Dismiss any open modal */
export function dismissModal(): Record<string, unknown> {
  const modalOpen = useUIStore.getState().modalOpen;
  if (modalOpen) {
    useUIStore.getState().closeModal();
    return { ok: true, dismissed: modalOpen };
  }
  return { ok: true, dismissed: null, message: 'No modal was open' };
}

/** Get current modal state */
export function getModalState(): Record<string, unknown> {
  const { modalOpen, modalData } = useUIStore.getState();
  return { modalOpen: modalOpen ?? null, modalData: modalData ?? null };
}

// ─── Format Regression Testing ──────────────────────────────────────────────

/** Run a single format test: load file → play → measure audio → stop → return results */
export async function runFormatTest(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const filename = params.filename as string;
  const base64Data = params.data as string;
  const playDurationMs = (params.playDurationMs as number) ?? 3000;
  const measureDurationMs = (params.measureDurationMs as number) ?? 2000;
  const audioTimeoutMs = (params.audioTimeoutMs as number) ?? 5000;
  const subsong = (params.subsong as number) ?? 0;

  if (!filename || !base64Data) {
    return { error: 'Missing required params: filename, data (base64)' };
  }

  const startTime = performance.now();
  const result: Record<string, unknown> = { filename, subsong };

  try {
    // 1. Load the file
    const loadResult = await loadFile({ filename, data: base64Data, subsong });
    if (loadResult.error) {
      return { ...result, pass: false, stage: 'load', error: loadResult.error };
    }
    result.format = loadResult.format;
    result.editorMode = loadResult.editorMode;
    result.channels = loadResult.channels;
    result.patterns = loadResult.patterns;
    result.instruments = loadResult.instruments;
    result.loadTimeMs = Math.round(performance.now() - startTime);

    // 2. Start playback
    const transport = useTransportStore.getState();
    transport.play();

    // 3. Wait for audio
    const waitResult = await waitForAudio({ timeoutMs: audioTimeoutMs, thresholdRms: 0.001 });
    if (!waitResult.detected) {
      transport.stop();
      return { ...result, pass: false, stage: 'audio_wait', error: 'No audio detected within timeout', waitResult };
    }
    result.audioDetectedMs = waitResult.waitedMs;

    // 4. Let it play for the specified duration
    await new Promise(r => setTimeout(r, playDurationMs));

    // 5. Measure audio levels
    const levelResult = await getAudioLevel({ durationMs: measureDurationMs });
    result.audioLevel = levelResult;

    // 6. Stop playback
    transport.stop();

    // 7. Determine pass/fail
    const rmsAvg = (levelResult.rmsAvg as number) ?? 0;
    const silent = (levelResult.silent as boolean) ?? true;
    result.pass = !silent && rmsAvg > 0.001;
    result.totalTimeMs = Math.round(performance.now() - startTime);

    return result;
  } catch (e) {
    // Ensure playback stops on error
    try { useTransportStore.getState().stop(); } catch { /* ignore */ }
    return { ...result, pass: false, stage: 'exception', error: (e as Error).message, totalTimeMs: Math.round(performance.now() - startTime) };
  }
}

/** Run a regression suite across multiple files */
export async function runRegressionSuite(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const files = params.files as Array<{ filename: string; data: string; subsong?: number }>;
  const playDurationMs = (params.playDurationMs as number) ?? 2000;
  const measureDurationMs = (params.measureDurationMs as number) ?? 1000;

  if (!files || !Array.isArray(files) || files.length === 0) {
    return { error: 'Missing required param: files (array of {filename, data, subsong?})' };
  }

  const results: Array<Record<string, unknown>> = [];
  let passed = 0;
  let failed = 0;
  const suiteStartTime = performance.now();

  for (const file of files) {
    const testResult = await runFormatTest({
      filename: file.filename,
      data: file.data,
      subsong: file.subsong ?? 0,
      playDurationMs,
      measureDurationMs,
    });
    results.push(testResult);
    if (testResult.pass) passed++;
    else failed++;

    // Brief pause between tests to let audio settle
    await new Promise(r => setTimeout(r, 500));
  }

  return {
    total: files.length,
    passed,
    failed,
    passRate: files.length > 0 ? `${Math.round((passed / files.length) * 100)}%` : '0%',
    totalTimeMs: Math.round(performance.now() - suiteStartTime),
    results,
  };
}

// ─── Export Tools ────────────────────────────────────────────────────────────

/**
 * Async live-capture registry.
 * Captures run in the background; callers poll with the captureId.
 * Stored on `window` so Vite HMR module reloads don't lose in-flight captures.
 */
interface CaptureEntry {
  status: 'capturing' | 'done' | 'error';
  blob?: Blob;
  error?: string;
  startedAt: number;
}
const _liveCaptures: Map<string, CaptureEntry> =
  (window as any).__devilboxLiveCaptures ??
  ((window as any).__devilboxLiveCaptures = new Map<string, CaptureEntry>());

/** Export current pattern or song to WAV, returning base64-encoded WAV data */
export async function exportWav(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    // ── Phase 2 fast-path: poll an in-progress live capture ──────────────────
    // Triggered by patternIndex=-1 (works with existing MCP schema) or captureId param.
    // Captures are stored on window.__devilboxLiveCaptures (survives HMR).
    const isPoll = params.captureId || (params.patternIndex as number) === -1;
    if (isPoll) {
      const captureId = (params.captureId as string | undefined);
      // Find the entry: by id if provided, otherwise the most recent one
      let entry: CaptureEntry | undefined;
      let foundId: string | undefined;
      if (captureId) {
        entry = _liveCaptures.get(captureId);
        foundId = captureId;
      } else {
        // Pick the most recent entry
        for (const [id, e] of _liveCaptures) {
          if (!entry || e.startedAt > entry.startedAt) { entry = e; foundId = id; }
        }
      }
      if (!entry || !foundId) {
        return { error: 'No pending capture found. Start one with export_wav(scope:"song") first.' };
      }
      if (entry.status === 'capturing') {
        const elapsed = ((Date.now() - entry.startedAt) / 1000).toFixed(1);
        return { ok: true, captureId: foundId, status: 'capturing', elapsedSec: +elapsed };
      }
      if (entry.status === 'error') {
        _liveCaptures.delete(foundId);
        return { error: entry.error ?? 'Capture failed' };
      }
      // Done — encode and return
      const doneBlob = entry.blob!;
      _liveCaptures.delete(foundId);
      const doneArrBuf = await doneBlob.arrayBuffer();
      const doneBytes = new Uint8Array(doneArrBuf);
      let doneB64 = '';
      for (let i = 0; i < doneBytes.length; i += 8190) {
        doneB64 += btoa(String.fromCharCode(...doneBytes.subarray(i, i + 8190)));
      }
      return {
        ok: true,
        captureId: foundId,
        status: 'done',
        method: 'live-capture',
        scope: 'song',
        durationSec: +((doneArrBuf.byteLength - 44) / (44100 * 4)).toFixed(2),
        sizeBytes: doneArrBuf.byteLength,
        wavBase64: doneB64,
      };
    }

    const scope = (params.scope as string) || 'song';
    const patternIndex = params.patternIndex as number | undefined;

    const tracker = useTrackerStore.getState();
    const instruments = useInstrumentStore.getState().instruments;
    const transport = useTransportStore.getState();

    const {
      getUADEInstrument,
      renderUADEToWav,
      captureAudioLive,
      renderPatternToAudio,
      audioBufferToWav,
    } = await import('../../lib/export/audioExport');

    // ── Determine the active format ──────────────────────────────────────────
    // Synth types that can render offline WITHOUT pre-loading audio buffers.
    // Sampler/Player are excluded: Tone.Offline never loads their sample URLs,
    // so they produce silence. Songs using these must use live capture instead.
    const OFFLINE_SYNTH_TYPES = new Set([
      'MonoSynth', 'PolySynth', 'DuoSynth', 'FMSynth', 'ToneAM',
      'MembraneSynth', 'MetalSynth', 'NoiseSynth', 'PluckSynth',
    ]);
    // Check format store for native engines that bypass Tone.js entirely
    const { useFormatStore } = await import('../../stores/useFormatStore');
    const fmt = useFormatStore.getState();
    const hasNativeEngine = !!(
      fmt.libopenmptFileData || fmt.uadeEditableFileData ||
      fmt.hivelyFileData || fmt.klysFileData || fmt.musiclineFileData ||
      fmt.c64SidFileData || fmt.jamCrackerFileData || fmt.futurePlayerFileData ||
      fmt.preTrackerFileData || fmt.maFileData || fmt.hippelFileData ||
      fmt.sonixFileData || fmt.pxtoneFileData || fmt.organyaFileData || fmt.sawteethFileData ||
      fmt.eupFileData || fmt.ixsFileData || fmt.psycleFileData ||
      fmt.sc68FileData || fmt.zxtuneFileData || fmt.pumaTrackerFileData ||
      fmt.artOfNoiseFileData || fmt.qsfFileData || fmt.bdFileData || fmt.sd2FileData ||
      fmt.symphonieFileData || fmt.v2mFileData || fmt.goatTrackerData
    );
    const isToneOnly = !hasNativeEngine && instruments.every(
      i => !i || !i.synthType || OFFLINE_SYNTH_TYPES.has(i.synthType),
    );

    // ── Helper: blob → base64 ────────────────────────────────────────────────
    // Chunk size MUST be a multiple of 3 so btoa() never emits mid-string padding.
    // 8190 = 3 × 2730 — produces clean base64 with padding only at the very end.
    async function blobToBase64(blob: Blob): Promise<string> {
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let b64 = '';
      for (let i = 0; i < bytes.length; i += 8190) {
        b64 += btoa(String.fromCharCode(...bytes.subarray(i, i + 8190)));
      }
      return b64;
    }

    // ── Helper: estimate song duration from BPM/speed/patterns ──────────────
    async function estimateSongDuration(): Promise<number> {
      // For libopenmpt-backed files, ask the engine directly.
      if (fmt.libopenmptFileData) {
        try {
          const { LibopenmptEngine } = await import('../../engine/libopenmpt/LibopenmptEngine');
          if (LibopenmptEngine.hasInstance()) {
            const sec = LibopenmptEngine.getInstance().getDurationSeconds();
            if (sec > 0) return sec + 2; // +2 s tail
          }
        } catch { /* fall through to estimate */ }
      }
      const bpm = transport.bpm || 125;
      const speed = transport.speed || 6;
      const secPerRow = (speed * 60) / (bpm * 24);
      let totalRows = 0;
      for (const patIdx of tracker.patternOrder) {
        const pat = tracker.patterns[patIdx];
        totalRows += pat ? (pat.channels[0]?.rows?.length ?? 64) : 64;
      }
      return Math.max(5, totalRows * secPerRow + 2); // +2 s tail
    }

    // ── 1. UADE path: accurate offline render ────────────────────────────────
    const uadeInst = getUADEInstrument(instruments);
    if (uadeInst?.uade?.fileData) {
      const blob = await renderUADEToWav(
        uadeInst.uade.fileData,
        uadeInst.uade.filename ?? 'module',
      );
      const arrayBuf = await blob.arrayBuffer();
      const base64 = await blobToBase64(blob);
      return {
        ok: true,
        method: 'uade-offline',
        scope: 'song',
        sizeBytes: arrayBuf.byteLength,
        durationSec: +((arrayBuf.byteLength - 44) / (44100 * 4)).toFixed(2),
        wavBase64: base64,
      };
    }

    // ── 2. Tone.js-only path: offline render (instant, works for single pattern too) ──
    if (isToneOnly) {
      const bpm = transport.bpm || 125;
      if (scope === 'pattern') {
        const idx = patternIndex ?? tracker.currentPatternIndex;
        const pattern = tracker.patterns[idx];
        if (!pattern) return { error: `Pattern ${idx} not found` };
        const audioBuffer = await renderPatternToAudio(pattern, instruments, bpm);
        const wavBlob = audioBufferToWav(audioBuffer);
        const base64 = await blobToBase64(wavBlob);
        const arrayBuf = await wavBlob.arrayBuffer();
        return {
          ok: true,
          method: 'tone-offline',
          scope: 'pattern',
          patternIndex: idx,
          sampleRate: audioBuffer.sampleRate,
          durationSec: +(audioBuffer.length / audioBuffer.sampleRate).toFixed(2),
          sizeBytes: arrayBuf.byteLength,
          wavBase64: base64,
        };
      }
      // Song: render patterns in order
      const sequence = tracker.patternOrder;
      const buffers: AudioBuffer[] = [];
      for (const idx of sequence) {
        const pattern = tracker.patterns[idx];
        if (!pattern) continue;
        buffers.push(await renderPatternToAudio(pattern, instruments, bpm));
      }
      if (buffers.length === 0) return { error: 'No patterns in sequence to export' };
      const totalLength = buffers.reduce((s, b) => s + b.length, 0);
      const sampleRate = buffers[0].sampleRate;
      const combined = new OfflineAudioContext(2, totalLength, sampleRate)
        .createBuffer(2, totalLength, sampleRate);
      let off = 0;
      for (const buf of buffers) {
        for (let ch = 0; ch < 2; ch++) {
          combined.getChannelData(ch).set(buf.getChannelData(Math.min(ch, buf.numberOfChannels - 1)), off);
        }
        off += buf.length;
      }
      const wavBlob = audioBufferToWav(combined);
      const base64 = await blobToBase64(wavBlob);
      const arrayBuf = await wavBlob.arrayBuffer();
      return {
        ok: true,
        method: 'tone-offline',
        scope: 'song',
        patterns: sequence.length,
        sampleRate,
        durationSec: +(totalLength / sampleRate).toFixed(2),
        sizeBytes: arrayBuf.byteLength,
        wavBase64: base64,
      };
    }

    // ── 3. Universal live-capture path: works for all native WASM engines ────
    // Two-phase: first call starts the capture and returns a captureId.
    // Subsequent calls with captureId are handled by the fast-path at top of function.

    // ── Start a new capture ────────────────────────────────────────────────
    const maxDurationSec = typeof params.maxDurationSec === 'number'
      ? params.maxDurationSec
      : 60;
    const rawDurationSec = await estimateSongDuration();
    const durationSec = Math.min(rawDurationSec, maxDurationSec);

    const captureId = crypto.randomUUID();
    const entry: CaptureEntry = { status: 'capturing', startedAt: Date.now() };
    _liveCaptures.set(captureId, entry);

    // Fire-and-forget: capture runs in background
    captureAudioLive(durationSec)
      .then(blob => {
        entry.status = 'done';
        entry.blob = blob;
      })
      .catch(err => {
        entry.status = 'error';
        entry.error = (err as Error).message;
      });

    // Start playback from the beginning
    await seekTo({ position: 0 });
    await play({});

    return {
      ok: true,
      captureId,
      status: 'capturing',
      method: 'live-capture',
      scope: 'song',
      estimatedDurationSec: +durationSec.toFixed(2),
      instructions: `Poll with export_wav(captureId: "${captureId}") until status is "done"`,
    };
  } catch (e) {
    return { error: `exportWav failed: ${(e as Error).message}` };
  }
}

/** Export pattern as formatted text */
export async function exportPatternText(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const patternIndex = params.patternIndex as number | undefined;
    const format = (params.format as string) || 'tracker'; // 'tracker' or 'csv'

    const tracker = useTrackerStore.getState();
    const idx = patternIndex ?? tracker.currentPatternIndex;
    const pattern = tracker.patterns[idx];
    if (!pattern) return { error: `Pattern ${idx} not found` };

    if (format === 'csv') {
      // CSV format: row, channel, note, instrument, volume, effectType, effectValue
      const lines: string[] = ['row,channel,note,instrument,volume,effectType,effectValue'];
      for (let row = 0; row < pattern.length; row++) {
        for (let ch = 0; ch < pattern.channels.length; ch++) {
          const cell = pattern.channels[ch].rows[row];
          if (cell.note || cell.instrument !== null || cell.volume !== 0 || cell.effTyp || cell.eff) {
            lines.push(`${row},${ch},${cell.note ?? 0},${cell.instrument ?? ''},${cell.volume ?? 0},${cell.effTyp ?? ''},${cell.eff ?? 0}`);
          }
        }
      }
      return { ok: true, patternIndex: idx, format: 'csv', lineCount: lines.length, text: lines.join('\n') };
    }

    // Use the existing render_pattern_text handler for tracker format
    const { renderPatternText } = await import('./readHandlers');
    const result = renderPatternText({ patternIndex: idx });
    return { ok: true, patternIndex: idx, format: 'tracker', ...result };
  } catch (e) {
    return { error: `exportPatternText failed: ${(e as Error).message}` };
  }
}

/** Export song/pattern to MIDI, returning base64-encoded MIDI data */
export async function exportMidi(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const scope = (params.scope as string) || 'pattern';
    const patternIndex = params.patternIndex as number | undefined;

    const tracker = useTrackerStore.getState();
    const transport = useTransportStore.getState();
    const bpm = transport.bpm;
    const timeSignature: [number, number] = [4, 4];

    const { exportPatternToMIDI, exportSongToMIDI } = await import('../../lib/export/midiExport');

    if (scope === 'song') {
      const midiData = exportSongToMIDI(
        tracker.patterns,
        tracker.patternOrder.map(i => tracker.patterns[i]?.id).filter(Boolean) as string[],
        bpm,
        timeSignature,
        [], // No automation curves via MCP for now
      );
      const base64 = btoa(String.fromCharCode(...midiData));
      return { ok: true, scope: 'song', sizeBytes: midiData.byteLength, midiBase64: base64 };
    } else {
      const idx = patternIndex ?? tracker.currentPatternIndex;
      const pattern = tracker.patterns[idx];
      if (!pattern) return { error: `Pattern ${idx} not found` };

      const midiData = exportPatternToMIDI(pattern, bpm, timeSignature);
      const base64 = btoa(String.fromCharCode(...midiData));
      return { ok: true, scope: 'pattern', patternIndex: idx, sizeBytes: midiData.byteLength, midiBase64: base64 };
    }
  } catch (e) {
    return { error: `exportMidi failed: ${(e as Error).message}` };
  }
}

/** Export the loaded song to ProTracker MOD format, returning base64-encoded data */
export async function exportMod(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const format = ((params.format as string) ?? 'mod') as 'mod' | 'xm' | 'it' | 's3m';

    const trackerState = useTrackerStore.getState();
    const instrumentState = useInstrumentStore.getState();
    const transportState = (await import('../../stores/useTransportStore')).useTransportStore.getState();
    const projectState = useProjectStore.getState();

    const { exportWithOpenMPT } = await import('../../lib/export/OpenMPTExporter');
    const result = await exportWithOpenMPT(
      trackerState.patterns,
      instrumentState.instruments,
      trackerState.patternOrder,
      {
        format,
        moduleName: projectState.metadata?.name ?? 'Untitled',
        initialBPM:   transportState.bpm,
        initialSpeed: transportState.speed,
      },
    );

    const arrayBuf = await result.data.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    let binary = '';
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...Array.from(bytes.subarray(i, Math.min(i + CHUNK, bytes.length))));
    }
    const base64 = btoa(binary);

    return {
      ok: true,
      filename: result.filename,
      sizeBytes: arrayBuf.byteLength,
      warnings: result.warnings,
      modBase64: base64,
    };
  } catch (e) {
    return { error: `exportMod failed: ${(e as Error).message}` };
  }
}

/** Export the loaded song to its native format, returning base64-encoded data.
 *  Uses the same format-specific routing as the Export Dialog's "Native" tab. */
export async function exportNative(_params: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    // Try the replayer first (has song if playback has been triggered)
    const { getTrackerReplayer } = await import('../../engine/TrackerReplayer');
    let song = getTrackerReplayer().getSong();

    // If replayer has a song, use dedicated serializers (full parsed data available).
    // If not, fall through to chip RAM readback / raw file fallback (store-reconstructed
    // songs lack format-specific native data needed by dedicated serializers).
    const { useFormatStore } = await import('../../stores/useFormatStore');
    const fmt = useFormatStore.getState();
    const projectState = useProjectStore.getState();
    const trackerState = useTrackerStore.getState();

    if (!song && trackerState.patterns.length === 0) return { error: 'No song loaded' };

    const baseName = ((song?.name || projectState.metadata?.name || 'untitled')).replace(/[^a-zA-Z0-9_-]/g, '_');
    const blobType = 'application/octet-stream';
    let result: { data: Blob; filename: string; warnings: string[] } | null = null;

    // For formats with their own editorMode (hively, klystrack, jamcracker),
    // reconstruct a minimal song from stores if the replayer doesn't have one.
    // These formats store their native data in the format store.
    if (!song && (fmt.editorMode === 'hively' || fmt.editorMode === 'klystrack' || fmt.editorMode === 'jamcracker')) {
      const instrumentState = useInstrumentStore.getState();
      const transportState = (await import('../../stores/useTransportStore')).useTransportStore.getState();
      const format = (fmt.editorMode === 'hively' ? (fmt.hivelyMeta?.version === 0 ? 'AHX' : 'HVL')
        : fmt.editorMode === 'klystrack' ? 'KT'
        : 'JamCracker') as import('../../engine/TrackerReplayer').TrackerFormat;
      song = {
        name: projectState.metadata?.name ?? 'Untitled',
        format,
        patterns: trackerState.patterns,
        instruments: instrumentState.instruments,
        songPositions: trackerState.patternOrder ?? trackerState.patterns.map((_: unknown, i: number) => i),
        songLength: trackerState.patternOrder?.length ?? trackerState.patterns.length,
        restartPosition: 0,
        numChannels: trackerState.patterns[0]?.channels?.length ?? 4,
        initialSpeed: transportState.speed ?? 6,
        initialBPM: transportState.bpm ?? 125,
        hivelyNative: fmt.hivelyNative ?? undefined,
        hivelyFileData: fmt.hivelyFileData ?? undefined,
        hivelyMeta: fmt.hivelyMeta ?? undefined,
        klysNative: fmt.klysNative ?? undefined,
        klysFileData: fmt.klysFileData ?? undefined,
        jamCrackerFileData: fmt.jamCrackerFileData ?? undefined,
      } as import('../../engine/TrackerReplayer').TrackerSong;
    }

    // Only use dedicated serializers when we have a song (from replayer or reconstructed above)
    if (song) {
    const format = song.format;
    const layoutFormatId = song.uadePatternLayout?.formatId || song.uadeVariableLayout?.formatId || '';

    // ── Format-specific exporters (same routing as ExportDialog case 'native') ──
    if (format === 'JamCracker' as string) {
      const { exportAsJamCracker } = await import('../../lib/export/JamCrackerExporter');
      result = await exportAsJamCracker(song);
    } else if (format === ('SMON' as string)) {
      const { exportAsSoundMon } = await import('../../lib/export/SoundMonExporter');
      result = await exportAsSoundMon(song);
    } else if (format === 'FC' as string) {
      const { exportFC } = await import('../../lib/export/FCExporter');
      const buf = exportFC(song);
      result = { data: new Blob([buf], { type: blobType }), filename: `${baseName}.fc`, warnings: [] };
    } else if (format === 'SidMon2' as string) {
      const { exportSidMon2File } = await import('../../lib/export/SidMon2Exporter');
      const buf = await exportSidMon2File(song);
      result = { data: new Blob([buf], { type: blobType }), filename: `${baseName}.sd2`, warnings: [] };
    } else if (format === 'PumaTracker' as string) {
      const { exportPumaTrackerFile } = await import('../../lib/export/PumaTrackerExporter');
      const buf = exportPumaTrackerFile(song);
      result = { data: new Blob([buf as unknown as Uint8Array<ArrayBuffer>], { type: blobType }), filename: `${baseName}.puma`, warnings: [] };
    } else if (format === 'OctaMED' as string) {
      const { exportMED } = await import('../../lib/export/MEDExporter');
      const buf = exportMED(song);
      result = { data: new Blob([buf], { type: blobType }), filename: `${baseName}.mmd0`, warnings: [] };
    } else if (format === 'PreTracker' as string) {
      const { exportAsPreTracker } = await import('../../lib/export/PreTrackerExporter');
      result = await exportAsPreTracker(baseName);
    } else if (format === 'HVL' as string || format === 'AHX' as string || layoutFormatId === 'hivelyHVL' || layoutFormatId === 'hivelyAHX') {
      const { exportAsHively } = await import('../../lib/export/HivelyExporter');
      const hvlFmt = (format === 'AHX' || layoutFormatId === 'hivelyAHX') ? 'ahx' : 'hvl';
      result = exportAsHively(song, { format: hvlFmt, nativeOverride: fmt.hivelyNative });
    } else if (format === 'DIGI' as string || layoutFormatId === 'digiBooster') {
      const { exportDigiBooster } = await import('../../lib/export/DigiBoosterExporter');
      const buf = exportDigiBooster(song);
      result = { data: new Blob([new Uint8Array(buf)], { type: blobType }), filename: `${baseName}.dbm`, warnings: [] };
    } else if (format === 'OKT' as string || layoutFormatId === 'oktalyzer') {
      const { exportOktalyzer } = await import('../../lib/export/OktalyzerExporter');
      const buf = exportOktalyzer(song);
      result = { data: new Blob([new Uint8Array(buf)], { type: blobType }), filename: `${baseName}.okt`, warnings: [] };
    } else if (format === 'KT' as string || layoutFormatId === 'klystrack') {
      const { exportAsKlystrack } = await import('../../lib/export/KlysExporter');
      result = await exportAsKlystrack(song);
    } else if (format === 'IS10' as string || layoutFormatId === 'inStereo1') {
      const { exportInStereo1 } = await import('../../lib/export/InStereo1Exporter');
      result = await exportInStereo1(song);
    } else if (format === 'AdPlug' as string) {
      const { exportAdPlug } = await import('../../lib/export/AdPlugExporter');
      result = exportAdPlug(song, 'rad');
    } else {
      // For all other formats, try dynamic lookup by layoutFormatId
      const exporterMap: Record<string, { module: string; fn: string }> = {
        musicLine: { module: 'MusicLineExporter', fn: 'exportMusicLineFile' },
        musicAssembler: { module: 'MusicAssemblerExporter', fn: 'exportAsMusicAssembler' },
        futurePlayer: { module: 'FuturePlayerExporter', fn: 'exportAsFuturePlayer' },
        digitalSymphony: { module: 'DigitalSymphonyExporter', fn: 'exportDigitalSymphony' },
        amosMusicBank: { module: 'AMOSMusicBankExporter', fn: 'exportAMOSMusicBank' },
        hippelCoSo: { module: 'HippelCoSoExporter', fn: 'exportAsHippelCoSo' },
        symphoniePro: { module: 'SymphonieProExporter', fn: 'exportSymphonieProFile' },
        inStereo2: { module: 'InStereo2Exporter', fn: 'exportInStereo2' },
        deltaMusic1: { module: 'DeltaMusic1Exporter', fn: 'exportDeltaMusic1' },
        deltaMusic2: { module: 'DeltaMusic2Exporter', fn: 'exportDeltaMusic2' },
        digitalMugician: { module: 'DigitalMugicianExporter', fn: 'exportDigitalMugician' },
        sidmon1: { module: 'SidMon1Exporter', fn: 'exportSidMon1' },
        sonicArranger: { module: 'SonicArrangerExporter', fn: 'exportSonicArranger' },
        tfmx: { module: 'TFMXExporter', fn: 'exportTFMX' },
        fredEditor: { module: 'FredEditorExporter', fn: 'exportFredEditor' },
        soundfx: { module: 'SoundFXExporter', fn: 'exportSoundFX' },
        tcbTracker: { module: 'TCBTrackerExporter', fn: 'exportTCBTracker' },
        gameMusicCreator: { module: 'GameMusicCreatorExporter', fn: 'exportGameMusicCreator' },
        quadraComposer: { module: 'QuadraComposerExporter', fn: 'exportQuadraComposer' },
        activisionPro: { module: 'ActivisionProExporter', fn: 'exportActivisionPro' },
        digiBoosterPro: { module: 'DigiBoosterProExporter', fn: 'exportDigiBoosterPro' },
        faceTheMusic: { module: 'FaceTheMusicExporter', fn: 'exportFaceTheMusic' },
        sawteeth: { module: 'SawteethExporter', fn: 'exportSawteeth' },
        earAche: { module: 'EarAcheExporter', fn: 'exportEarAche' },
        iffSmus: { module: 'IffSmusExporter', fn: 'exportIffSmus' },
        actionamics: { module: 'ActionamicsExporter', fn: 'exportActionamics' },
        soundFactory: { module: 'SoundFactoryExporter', fn: 'exportSoundFactory' },
        synthesis: { module: 'SynthesisExporter', fn: 'exportSynthesis' },
        soundControl: { module: 'SoundControlExporter', fn: 'exportSoundControl' },
        c67: { module: 'CDFM67Exporter', fn: 'exportCDFM67' },
        zoundMonitor: { module: 'ZoundMonitorExporter', fn: 'exportZoundMonitor' },
        chuckBiscuits: { module: 'ChuckBiscuitsExporter', fn: 'exportChuckBiscuits' },
        composer667: { module: 'Composer667Exporter', fn: 'exportComposer667' },
        kris: { module: 'KRISExporter', fn: 'exportKRIS' },
        nru: { module: 'NRUExporter', fn: 'exportNRU' },
        ims: { module: 'IMSExporter', fn: 'exportIMS' },
        stp: { module: 'STPExporter', fn: 'exportSTP' },
        unic: { module: 'UNICExporter', fn: 'exportUNIC' },
        dsm_dyn: { module: 'DSMDynExporter', fn: 'exportDSMDyn' },
        scumm: { module: 'SCUMMExporter', fn: 'exportSCUMM' },
        xmf: { module: 'XMFExporter', fn: 'exportXMF' },
      };

      const entry = exporterMap[layoutFormatId];
      if (entry) {
        const mod = await import(/* @vite-ignore */ `../../lib/export/${entry.module}`);
        const exportFn = mod[entry.fn];
        const raw = await exportFn(song);
        // Normalize result: some return ArrayBuffer/Uint8Array, others return { data, filename, warnings }
        if (raw instanceof ArrayBuffer) {
          result = { data: new Blob([new Uint8Array(raw)], { type: blobType }), filename: `${baseName}.bin`, warnings: [] };
        } else if (raw instanceof Uint8Array) {
          result = { data: new Blob([new Uint8Array(raw)], { type: blobType }), filename: `${baseName}.bin`, warnings: [] };
        } else if (raw && typeof raw === 'object' && 'data' in raw) {
          result = raw as { data: Blob; filename: string; warnings: string[] };
        }
      }
    }
    } // end if (song) — dedicated serializers

    // Fallback: return original file data from the format store.
    // This is the raw binary as loaded from disk — identical to the original file.
    // For live edits, use the UI export dialog (which has access to chip RAM readback).
    if (!result) {
      const rawData = fmt.uadeEditableFileData || fmt.libopenmptFileData;
      const rawName = fmt.uadeEditableFileName || '';
      if (rawData) {
        const ext = rawName.split('.').pop() || 'bin';
        result = {
          data: new Blob([new Uint8Array(rawData)], { type: blobType }),
          filename: `${baseName}.${ext}`,
          warnings: [],
        };
      }
    }

    if (!result) {
      return { error: `No native exporter available. editorMode="${fmt.editorMode}" hasUadeFileData=${!!fmt.uadeEditableFileData} uadeFileName="${fmt.uadeEditableFileName || ''}"` };
    }

    // Convert Blob to base64
    const arrayBuf = await result.data.arrayBuffer();
    const outBytes = new Uint8Array(arrayBuf);

    let binary = '';
    const CHUNK = 8192;
    for (let i = 0; i < outBytes.length; i += CHUNK) {
      binary += String.fromCharCode(...Array.from(outBytes.subarray(i, Math.min(i + CHUNK, outBytes.length))));
    }
    const base64 = btoa(binary);

    return {
      ok: true,
      format: song?.format ?? fmt.editorMode,
      filename: result.filename,
      sizeBytes: arrayBuf.byteLength,
      warnings: result.warnings,
      nativeBase64: base64,
    };
  } catch (e) {
    return { error: `exportNative failed: ${(e as Error).message}` };
  }
}

/** Run synth tests and return results — used by the format-status test report page */
export async function runSynthTests(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const suite = (params.suite as string) ?? 'all';
  const timeout = (params.timeout as number) ?? 5000;

  try {
    let summary;
    if (suite === 'tone') {
      summary = await testToneSynths();
    } else if (suite === 'custom') {
      summary = await testCustomSynths();
    } else if (suite === 'furnace') {
      summary = await testFurnaceSynths();
    } else if (suite === 'mame') {
      const startIndex = (params.startIndex as number) ?? 0;
      const batchSize = (params.batchSize as number) ?? 0;
      summary = await testMAMESynths(startIndex, batchSize);
    } else {
      summary = await testAllSynths({ timeout, verbose: false });
    }
    return { ok: true, suite, ...summary };
  } catch (e) {
    return { error: `runSynthTests failed: ${(e as Error).message}` };
  }
}

export function clearConsoleErrors(): Record<string, unknown> {
  clearConsoleEntries();
  return { ok: true };
}

/**
 * Evaluate arbitrary JavaScript in the browser context.
 * Returns the JSON-serializable result.
 * Used for debugging — e.g., reading localStorage after a page crash.
 */
export function evaluateScript(params: Record<string, unknown>): unknown {
  const code = params.code as string;
  if (!code) return { error: 'Missing code param' };
  try {
    // eslint-disable-next-line no-eval
    const result = (0, eval)(code);
    return { result };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
