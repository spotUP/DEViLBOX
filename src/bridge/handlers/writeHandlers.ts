/**
 * MCP Bridge — Write Handlers
 *
 * Handles write operations: pattern editing, transport control, mixing, commands.
 */

import { useTrackerStore } from '../../stores/useTrackerStore';
import { useTransportStore } from '../../stores/useTransportStore';
import { useCursorStore } from '../../stores/useCursorStore';
import { useHistoryStore } from '../../stores/useHistoryStore';
import { useEditorStore } from '../../stores/useEditorStore';
import { useUIStore } from '../../stores/useUIStore';
import { useAudioStore } from '../../stores/useAudioStore';
import { useMixerStore } from '../../stores/useMixerStore';
import { useInstrumentStore } from '../../stores/useInstrumentStore';
import { useProjectStore } from '../../stores/useProjectStore';

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
  if (typeof note === 'string') return parseNoteString(note);
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
  useTransportStore.getState().setBPM(params.bpm as number);
  return { ok: true };
}

export function setSpeed(params: Record<string, unknown>): Record<string, unknown> {
  useTransportStore.getState().setSpeed(params.speed as number);
  return { ok: true };
}

export async function play(): Promise<Record<string, unknown>> {
  await useTransportStore.getState().play();
  return { ok: true };
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
  useUIStore.getState().setActiveView(params.view as 'tracker' | 'arrangement' | 'mixer');
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
  const config = params.config as Record<string, unknown> | undefined;
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
    const trackerState = useTrackerStore.getState();
    const patternIndex = trackerState.currentPatternIndex;
    trackerState.patterns[patternIndex] = restored;
    return { ok: true };
  }
  return { ok: false, error: 'Nothing to undo' };
}

export function redo(): Record<string, unknown> {
  const restored = useHistoryStore.getState().redo();
  if (restored) {
    const trackerState = useTrackerStore.getState();
    const patternIndex = trackerState.currentPatternIndex;
    trackerState.patterns[patternIndex] = restored;
    return { ok: true };
  }
  return { ok: false, error: 'Nothing to redo' };
}

// ─── Command Registry ──────────────────────────────────────────────────────────

export function executeCommand(params: Record<string, unknown>): Record<string, unknown> {
  const commandName = params.command as string;
  try {
    const { getGlobalRegistry } = require('../../hooks/useGlobalKeyboardHandler');
    const registry = getGlobalRegistry();
    if (!registry) return { error: 'Command registry not initialized' };

    const success = registry.execute(commandName, 'tracker');
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
  const { useSynthErrorStore } = require('../../stores/useSynthErrorStore');
  useSynthErrorStore.getState().dismissAll();
  return { ok: true };
}

// ─── Column Visibility ─────────────────────────────────────────────────────────

export function setColumnVisibility(params: Record<string, unknown>): Record<string, unknown> {
  const { useEditorStore } = require('../../stores/useEditorStore');
  useEditorStore.getState().setColumnVisibility(params);
  return { ok: true };
}

// ─── Bookmarks ─────────────────────────────────────────────────────────────────

export function toggleBookmark(params: Record<string, unknown>): Record<string, unknown> {
  const { useEditorStore } = require('../../stores/useEditorStore');
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
    const { ToneEngine } = require('../../engine/ToneEngine');
    const engine = ToneEngine.getInstance();
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
export function triggerNote(params: Record<string, unknown>): Record<string, unknown> {
  const id = params.id as number;
  const note = params.note as string;
  const velocity = (params.velocity as number) ?? 100;
  const duration = params.duration as number | undefined;

  try {
    const { ToneEngine } = require('../../engine/ToneEngine');
    const engine = ToneEngine.getInstance();

    if (duration) {
      engine.triggerNoteAttackRelease(id, note, duration, undefined, velocity / 127);
    } else {
      engine.triggerNoteAttack(id, note, velocity / 127);
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
    const { ToneEngine } = require('../../engine/ToneEngine');
    const engine = ToneEngine.getInstance();
    engine.triggerNoteRelease(id, note);
    return { ok: true, instrumentId: id, note };
  } catch (e) {
    return { error: `releaseNote failed: ${(e as Error).message}` };
  }
}

/** Release all active notes */
export function releaseAllNotes(): Record<string, unknown> {
  try {
    const { ToneEngine } = require('../../engine/ToneEngine');
    const engine = ToneEngine.getInstance();
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
  useAudioStore.getState().addMasterEffect(effectType as never);
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
