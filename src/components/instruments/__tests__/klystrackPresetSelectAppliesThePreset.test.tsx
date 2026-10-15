/**
 * KLYS-PRESETS reachability: the klystrack instrument editor's preset select was EMPTY (no KlysSynth presets).
 *
 * Route driven: UnifiedInstrumentEditor (KlysSynth instrument id 2) -> editor mode 'klystrack' -> EditorHeader ->
 * PresetDropdown (FACTORY_PRESETS filtered by synthType) -> a click on a preset -> the dispatcher's klystrack header
 * handler -> applyKlysPreset -> klysInstrumentEdit queue (store + undo) and KlysEngine.setInstrumentData -> the real
 * Klystrack worklet + WASM -> serializeSong -> a fresh worklet, which must hold the preset.
 *
 * Sentinel: the preset list is generated from KLYS_PRESETS and the dropdown shows one entry per preset.
 * Only the pattern canvas (WebGL) is replaced.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { startWorklet, songBuffer, loadSharedWorkletScripts } from '@/engine/__tests__/workletHarness';
import type { OnCellChange } from '@/components/shared/format-editor-types';

const seen = vi.hoisted(() => ({ cellChange: null as null | OnCellChange, controlsRendered: 0, sent: [] as Array<Record<string, unknown>>, w: null as null | { send(m: object): Promise<void> }, pending: [] as Promise<void>[] }));

vi.mock('@/components/tracker/PatternEditorCanvas', () => ({
  PatternEditorCanvas: (p: { onFormatCellChange?: OnCellChange }) => { seen.cellChange = p.onFormatCellChange ?? null; return null; },
}));
vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => ({}) }));
vi.mock('@/engine/klystrack/KlysEngine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/engine/klystrack/KlysEngine')>();
  const engine = Object.create(actual.KlysEngine.prototype) as Record<string, unknown>;
  engine.sendMessage = (msg: Record<string, unknown>) => { seen.sent.push(msg); seen.pending.push(seen.w!.send(msg)); };
  engine.subscribeProgramStatus = () => () => {};
  engine.subscribeVoiceStatus = () => () => {};
  const K = actual.KlysEngine as unknown as { getInstance: () => unknown; hasInstance: () => boolean };
  K.getInstance = () => engine;
  K.hasInstance = () => true;
  return actual;
});
vi.mock('@/components/instruments/controls/KlysControls', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/instruments/controls/KlysControls')>();
  const R = await import('react');
  return { ...actual, KlysControls: (p: { instrument: Parameters<typeof actual.KlysControls>[0]['instrument'] }) => { seen.controlsRendered++; return R.createElement(actual.KlysControls, p); } };
});

import { klysTransform, packKlysInstrument, type KlysSongData } from '@/engine/klystrack/KlysEngine';
import { applyKlysSongData, klysInstrumentToEngine } from '@/engine/klystrack/klysSongData';
import { flushKlysInstrumentEdits, undoKlysInstrumentEdit } from '@/components/klystrack/klysInstrumentEdit';
import { parseKlystrack } from '@/lib/import/formats/KlysParser';
import { UnifiedInstrumentEditor } from '@/components/instruments/editors/UnifiedInstrumentEditor';
import { useFormatStore } from '@stores/useFormatStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { KLYS_PRESETS } from '@constants/klysPresets';

const SONG = 'public/data/songs/klystrack/Ocean Loader III.kt';
interface Msg { type?: string; data?: ArrayBuffer }

describe('the klystrack preset select', () => {
  it('lists the bank, and choosing a preset writes the whole instrument to the store, the engine and the saved file', { timeout: 240_000 }, async () => {
    loadSharedWorkletScripts();
    const w = await startWorklet('klystrack', 'Klystrack', klysTransform);
    seen.w = w;
    await w.send({ type: 'loadSong', buffer: songBuffer(SONG) });
    const songData = (w.posted as unknown as Msg[]).find((m) => m.type === 'songData') as unknown as KlysSongData;

    const song = parseKlystrack(songBuffer(SONG));
    useFormatStore.setState({ klysNative: song.klysNative!, klysInstrumentUndoStack: [], klysInstrumentRedoStack: [] });
    applyKlysSongData(songData);
    useInstrumentStore.setState({ instruments: song.instruments });
    const instrument = song.instruments.find((i) => i.id === 2)!;
    const original = structuredClone(useFormatStore.getState().klysNative!.instruments[1]);
    seen.sent.length = 0;

    render(<UnifiedInstrumentEditor instrument={instrument} onChange={() => {}} />);
    await screen.findByRole('slider', { name: /^Cutoff/ }, { timeout: 30_000 });
    expect(seen.controlsRendered, 'sentinel: KlysControls ran').toBeGreaterThanOrEqual(1);

    // The select: one entry per preset of the bank.
    const trigger = screen.getAllByRole('button').find((b) => b.textContent === `Presets (${KLYS_PRESETS.length})` || b.textContent === instrument.name)!;
    expect(trigger, 'the preset select is on the editor header').toBeDefined();
    await act(async () => { fireEvent.click(trigger); });
    expect(screen.getAllByText(`Presets (${KLYS_PRESETS.length})`, { exact: false }).length, 'the opened list is headed with the bank size').toBeGreaterThanOrEqual(2);

    const preset = KLYS_PRESETS.find((p) => p.name === 'Deep Kick')!;
    await act(async () => { fireEvent.click(screen.getByText(preset.name).closest('button')!); });
    await act(async () => { flushKlysInstrumentEdits(); await Promise.all(seen.pending); });

    // Store: the whole instrument is the preset's.
    const applied = useFormatStore.getState().klysNative!.instruments[1];
    expect(applied).toEqual(preset.instrument);
    expect(applied.name).toBe('Deep Kick');
    expect(useInstrumentStore.getState().instruments.find((i) => i.id === 2)!.name).toBe('Deep Kick');
    // Engine: ONE setInstrumentData for slot 1, carrying exactly the preset.
    const data = seen.sent.filter((m) => m.type === 'setInstrumentData' && m.idx === 1);
    expect(data.length).toBe(1);
    expect(new Uint8Array(data[0].data as ArrayBuffer)).toEqual(packKlysInstrument(klysInstrumentToEngine(preset.instrument)));

    // Saved file: a fresh engine loading the saved song holds the preset.
    (w.posted as unknown[]).splice(0);
    await w.send({ type: 'serializeSong' });
    const saved = (w.posted as unknown as Msg[]).find((m) => m.type === 'serializeSongResult')!.data!;
    const w2 = await startWorklet('klystrack', 'Klystrack', klysTransform);
    await w2.send({ type: 'loadSong', buffer: saved });
    const reloaded = ((w2.posted as unknown as Msg[]).find((m) => m.type === 'songData') as unknown as KlysSongData).instruments[1]!;
    expect(reloaded).toEqual(klysInstrumentToEngine(preset.instrument));

    // Undo: one step puts the original sound back in the store and the engine.
    seen.sent.length = 0;
    await act(async () => { undoKlysInstrumentEdit(); await Promise.all(seen.pending); });
    expect(useFormatStore.getState().klysNative!.instruments[1]).toEqual(original);
    expect(seen.sent.some((m) => m.type === 'setInstrumentParam' && m.idx === 1)).toBe(true);
  });
});
