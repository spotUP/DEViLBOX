/**
 * R1 (klystrack instrument editor reachability, KIE-4.5): the editor for a klystrack instrument was the notice-only
 * 'wasm-info' mode, so no control could reach the engine or the saved .kt.
 *
 * Route driven: UnifiedInstrumentEditor (KlysSynth instrument id 2) -> editor mode 'klystrack' -> KlysControls ->
 * shared DOMSynthPanel (generated layout) and InstrumentTableEditor -> klysLayoutAdapter / klysProgramAdapter ->
 * klysInstrumentEdit -> KlysEngine messages -> the real Klystrack worklet + WASM -> serializeSong -> a fresh worklet.
 *
 * Sentinel: KlysControls rendered. Only the pattern canvas (WebGL) is replaced; it hands back the program grid's
 * cell-change callback, which is what a typed hex digit calls.
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

import { klysTransform, type KlysSongData } from '@/engine/klystrack/KlysEngine';
import { KLYS_PARAM_IDS } from '@/engine/klystrack/klysInstrumentFields';
import { applyKlysSongData } from '@/engine/klystrack/klysSongData';
import { flushKlysInstrumentEdits } from '@/components/klystrack/klysInstrumentEdit';
import { parseKlystrack } from '@/lib/import/formats/KlysParser';
import { UnifiedInstrumentEditor } from '@/components/instruments/editors/UnifiedInstrumentEditor';
import { useFormatStore } from '@stores/useFormatStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';

const SONG = 'public/data/songs/klystrack/Ocean Loader III.kt';
interface Msg { type?: string; data?: ArrayBuffer }

describe('the klystrack instrument editor', () => {
  it('a knob, a switch and a program step typed in the editor reach the engine and the saved file', { timeout: 240_000 }, async () => {
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
    expect(instrument.synthType).toBe('KlysSynth');
    const original = structuredClone(useFormatStore.getState().klysNative!.instruments[1]);
    seen.sent.length = 0;

    render(<UnifiedInstrumentEditor instrument={instrument} onChange={() => {}} />);
    const cutoff = await screen.findByRole('slider', { name: /^Cutoff/ }, { timeout: 30_000 });
    expect(seen.controlsRendered, 'sentinel: KlysControls ran').toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('tab', { name: /^Program/ }), 'the program lives on its own tab').not.toBeNull();

    // A knob: ArrowUp on the Cutoff slider.
    const N = 3;
    for (let i = 0; i < N; i++) await act(async () => { fireEvent.keyDown(cutoff, { key: 'ArrowUp' }); });
    expect(seen.sent.filter((m) => m.type === 'setInstrumentParam' && m.idx === 1 && m.paramId === KLYS_PARAM_IDS.cutoff).length).toBe(N);

    // A switch: the filter enable bit.
    // (DOMSynthPanel draws a toggle as an ON/OFF button under its label; the section header carries the same word.)
    const filterSwitch = screen.getAllByText('Filter').map((e) => e.parentElement?.querySelector('button')).find((b) => b)!;
    expect(filterSwitch.textContent).toBe('OFF');
    await act(async () => { fireEvent.click(filterSwitch); });
    expect(filterSwitch.textContent).toBe('ON');

    // A program step typed in the grid, on the Program tab.
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: /^Program/ })); });
    expect(seen.cellChange, 'program grid mounted').not.toBeNull();
    await act(async () => { seen.cellChange!(0, 3, 'cmd', 0x0c40); });
    await act(async () => { flushKlysInstrumentEdits(); await Promise.all(seen.pending); });

    const edited = useFormatStore.getState().klysNative!.instruments[1];
    expect(edited.cutoff).toBeGreaterThan(original.cutoff);
    expect(edited.cydflags).not.toBe(original.cydflags);
    expect(edited.program[3] & 0x7fff).toBe(0x0c40);

    // Save and reload: the file holds the edits.
    (w.posted as unknown[]).splice(0);
    await w.send({ type: 'serializeSong' });
    const saved = (w.posted as unknown as Msg[]).find((m) => m.type === 'serializeSongResult')!.data!;
    const w2 = await startWorklet('klystrack', 'Klystrack', klysTransform);
    await w2.send({ type: 'loadSong', buffer: saved });
    const reloaded = ((w2.posted as unknown as Msg[]).find((m) => m.type === 'songData') as unknown as KlysSongData).instruments[1]!;
    expect(reloaded.cutoff).toBe(edited.cutoff);
    expect(reloaded.cydflags).toBe(edited.cydflags);
    expect(reloaded.program[3] & 0x7fff).toBe(0x0c40);
  });
});
