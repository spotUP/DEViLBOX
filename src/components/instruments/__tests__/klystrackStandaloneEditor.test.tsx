/**
 * A standalone klystrack instrument (created from the synth menu, or any KlysSynth entry in a song that is not a
 * klystrack song) shows "No klystrack song is loaded" and nothing editable. It is edited like a song instrument.
 *
 * Route driven: UnifiedInstrumentEditor (KlysSynth, no klystrack song loaded) -> editor mode 'klystrack' -> KlysControls
 * (standalone home: config.klystrack) -> DOMSynthPanel / EditorHeader preset select -> klysInstrumentEdit ->
 * KlysEngine.setPreviewInstrument -> the real Klystrack worklet + WASM, which keys it with no song loaded.
 * Sentinel: KlysControls rendered; the engine received setPreviewInstrument.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { startWorklet, loadSharedWorkletScripts, stereoOutputs } from '@/engine/__tests__/workletHarness';

const seen = vi.hoisted(() => ({ controlsRendered: 0, sent: [] as Array<Record<string, unknown>>, w: null as null | { send(m: object): Promise<void> }, pending: [] as Promise<void>[] }));

vi.mock('@/components/tracker/PatternEditorCanvas', () => ({ PatternEditorCanvas: () => null }));
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

import { klysTransform, packKlysInstrument } from '@/engine/klystrack/KlysEngine';
import { klysInstrumentToEngine } from '@/engine/klystrack/klysSongData';
import { flushKlysInstrumentEdits } from '@/components/klystrack/klysInstrumentEdit';
import { UnifiedInstrumentEditor } from '@/components/instruments/editors/UnifiedInstrumentEditor';
import { useFormatStore } from '@stores/useFormatStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { KLYS_PRESETS } from '@constants/klysPresets';
import { KlysSynth } from '@/engine/klystrack/KlysSynth';
import { setDevilboxAudioContext } from '@/utils/audio-context';
import type { InstrumentConfig } from '@typedefs/instrument';

const ID = 4;

describe('the standalone klystrack instrument editor', () => {
  it('renders the editor with no song, a knob and a preset change the config and the engine, and a key sounds', { timeout: 240_000 }, async () => {
    loadSharedWorkletScripts();
    const w = await startWorklet('klystrack', 'Klystrack', klysTransform);
    seen.w = w;
    useFormatStore.setState({ klysNative: null, klysInstrumentUndoStack: [], klysInstrumentRedoStack: [] });
    const instrument = { id: ID, name: 'Alone', type: 'synth', synthType: 'KlysSynth', effects: [], volume: -8, pan: 0 } as unknown as InstrumentConfig;
    useInstrumentStore.setState({ instruments: [instrument] });

    render(<UnifiedInstrumentEditor instrument={instrument} onChange={() => {}} />);
    const cutoff = await screen.findByRole('slider', { name: /^Cutoff/ }, { timeout: 30_000 });
    expect(seen.controlsRendered, 'sentinel: KlysControls ran').toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/No klystrack song/)).toBeNull();
    expect(screen.queryByRole('tab', { name: /^Program/ })).not.toBeNull();

    // A knob: the config changes, and the engine gets the whole instrument (the preview copy).
    seen.sent.length = 0;
    const N = 3;
    for (let i = 0; i < N; i++) await act(async () => { fireEvent.keyDown(cutoff, { key: 'ArrowDown' }); });
    await act(async () => { flushKlysInstrumentEdits(); await Promise.all(seen.pending); });
    expect(seen.sent.filter((m) => m.type === 'setPreviewInstrument').length).toBe(N);
    expect(seen.sent.some((m) => m.type === 'setInstrumentParam'), 'no song slot is edited').toBe(false);
    const edited = useInstrumentStore.getState().instruments[0].klystrack!;
    expect(edited.cutoff, 'the knob moved the config').not.toBe(2047);

    // A preset: the whole instrument value lands in the config and in ONE engine message.
    const trigger = screen.getAllByRole('button').find((b) => b.textContent === `Presets (${KLYS_PRESETS.length})` || b.textContent === 'Alone')!;
    await act(async () => { fireEvent.click(trigger); });
    const preset = KLYS_PRESETS.find((p) => p.name === 'Deep Kick')!;
    seen.sent.length = 0;
    await act(async () => { fireEvent.click(screen.getByText(preset.name).closest('button')!); });
    await act(async () => { flushKlysInstrumentEdits(); await Promise.all(seen.pending); });
    expect(useInstrumentStore.getState().instruments[0].klystrack).toEqual(preset.instrument);
    const msgs = seen.sent.filter((m) => m.type === 'setPreviewInstrument');
    expect(msgs.length).toBe(1);
    expect(new Uint8Array(msgs[0].data as ArrayBuffer)).toEqual(packKlysInstrument(klysInstrumentToEngine(preset.instrument)));

    // A key on the synth sounds with no song loaded (KlysSynth -> previewNoteOnData -> real worklet).
    setDevilboxAudioContext({ sampleRate: 48000, currentTime: 0, createGain: () => ({ connect() {}, disconnect() {} }) } as unknown as AudioContext);
    const synth = Object.assign(Object.create(KlysSynth.prototype) as KlysSynth, {
      instrumentId: ID, engine: (await import('@/engine/klystrack/KlysEngine')).KlysEngine.getInstance(), _disposed: false,
    } as Record<string, unknown>);
    seen.sent.length = 0;
    synth.triggerAttack(60);
    await Promise.all(seen.pending);
    expect(seen.sent.map((m) => m.type)).toEqual(['setPreviewInstrument', 'previewNoteOnData']);
    const out = stereoOutputs(1);
    let peak = 0;
    for (let b = 0; b < 100; b++) { w.proc.process([], out); for (const v of out[0][0]) peak = Math.max(peak, Math.abs(v)); }
    expect(peak, 'the preset sounds').toBeGreaterThan(0.01);
  });
});
