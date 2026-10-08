/**
 * Jochen Hippel Atari ST songs play on the native player (K9, owner decision A, 2026-10-08).
 *
 * ONE wiring test, through the product's entry points: the real import (parseModuleToSong) ->
 * the engine registry picks HippelSt -> the real HippelStEngine class (its worklet node replaced by
 * the headless harness) loads the playback image -> the real worklet plays it. Sentinels prove the
 * new code ran (the player's tick counter in the worklet, a position message, a key reaching the
 * keyboard player); the numbers asserted are the spec's: the audio the worklet makes is the audio of
 * the decoder core for the same subsong, the position the worklet reports is the decoder's, and a
 * key sounds. Each behaviour has its own test where it lives (hippelStNativeMatchesPlayer: the
 * registers against the original player; hippelStKeysMatchSongVoice: the keys).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startWorklet, ROOT } from './workletHarness';
import { renderTicks, chainedHeapTransform, FPT } from './keyboardPreviewHarness';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { playingDescriptor, liveEditRoute } from '@/engine/replayer/liveCellEdits';
import { loadHippelStNode } from '@/engine/hippelst/hippelStNodeCore';

vi.mock('@/utils/audio-context', async (orig) => {
  const actual = await orig<typeof import('@/utils/audio-context')>();
  const gain = () => ({ gain: { value: 1 }, connect() {}, disconnect() {} });
  return { ...actual, getDevilboxAudioContext: () => ({ createGain: gain, sampleRate: 48000 }) };
});

interface Posted { type?: string; step?: number; row?: number; ticks?: number }

describe('Hippel ST on the native player: import to sound', () => {
  it('crown england.hst: the registry starts HippelSt, the worklet plays the decoder, reports its position, and a key sounds', { timeout: 240000 }, async () => {
    const f = readFileSync(resolve(ROOT, 'public/data/songs/hippel-st/crown england.hst'));
    const song = await parseModuleToSong(new File([f], 'crown england.hst'));
    expect(song.hippelStFileData, 'the import carries the playback image').toBeInstanceOf(ArrayBuffer);
    expect(playingDescriptor(song)?.key).toBe('HippelSt');
    expect(liveEditRoute(song).route).toBe('hippelst-module');
    expect(song.instruments.length).toBeGreaterThan(3);
    expect(song.instruments.every((i) => i.synthType === 'HippelStSynth')).toBe(true);

    // The real engine class over the headless worklet.
    const w = await startWorklet('hippelst', 'HippelST', chainedHeapTransform);
    const heard: Posted[] = [];
    const flush = (engine: { workletNode: { port: { onmessage: ((e: { data: unknown }) => void) | null } } }) => {
      for (const m of w.posted.splice(0)) { heard.push(m as Posted); engine.workletNode.port.onmessage?.({ data: m }); }
    };
    const { HippelStEngine } = await import('@/engine/hippelst/HippelStEngine');
    const engine = Object.create(HippelStEngine.prototype) as unknown as import('@/engine/hippelst/HippelStEngine').HippelStEngine & Record<string, unknown>;
    const mock = { port: { postMessage: (m: unknown) => { if ((m as { type: string }).type !== 'init') void w.send(m).then(() => flush(engine as never)); }, onmessage: null as ((e: { data: unknown }) => void) | null }, connect() {} };
    (globalThis as Record<string, unknown>).AudioWorkletNode = function () { return mock; };
    Object.assign(engine, { audioContext: { sampleRate: 48000 }, output: { connect() {}, disconnect() {} }, _initPromise: Promise.resolve(), _positionCallbacks: new Set(), _loadResolvers: [], _keyResolvers: [], _keyImage: null });
    (engine as unknown as { createNode(): void }).createNode();
    const positions: Array<{ step: number; row: number }> = [];
    engine.onPositionUpdate((p) => positions.push(p));

    await engine.loadTune(song.hippelStFileData!, 0);
    expect(heard.filter((m) => m.type === 'error'), 'the worklet loaded the tune').toEqual([]);
    engine.play();
    const out = renderTicks(w.proc, 300, 0);
    flush(engine as never);

    // The sentinel: the player ran (the worklet's own tick counter), and what it made is the decoder's.
    const proc = w.proc as unknown as { song: { mod: { _hst_ticks(): number; _hst_pos_step(): number; _hst_pos_row(): number } } };
    const ticks = proc.song.mod._hst_ticks();
    expect(ticks, 'the player ran').toBeGreaterThanOrEqual(300);
    const native = await loadHippelStNode(new Uint8Array(song.hippelStFileData!));
    const want = native.render(0, 300 * FPT, 48000);
    let diff = 0;
    for (let i = 0; i < want.length; i++) diff = Math.max(diff, Math.abs(want[i] - out[i]));
    expect(diff, 'the worklet makes the decoder core audio, sample for sample').toBeLessThan(1e-6);
    let peak = 0;
    for (const v of out) peak = Math.max(peak, Math.abs(v));
    expect(peak, 'it is music').toBeGreaterThan(0.02);

    // Position: the worklet's report is the decoder's playhead for the ticks it had run.
    expect(positions.length, 'position messages reached the engine').toBeGreaterThan(3);
    const at = native.positionAfter(0, ticks);
    expect({ step: proc.song.mod._hst_pos_step(), row: proc.song.mod._hst_pos_row() }).toEqual(at);
    const last = positions[positions.length - 1];
    expect(last.step).toBeGreaterThanOrEqual(0);
    expect(song.songPositions).toContain(last.step);

    // A key on instrument 3 sounds, through the real synth class and the keyboard player.
    const { useFormatStore } = await import('@/stores/useFormatStore');
    useFormatStore.setState({ hippelStFileData: song.hippelStFileData! });
    vi.spyOn(HippelStEngine, 'getInstance').mockReturnValue(engine);
    const { HippelStSynth } = await import('@/engine/hippelst/HippelStSynth');
    const synth = new HippelStSynth();
    synth.setInstrumentIndex(3);
    await synth.setInstrument();
    const keyed: Float32Array[] = [];
    engine.stop();
    await new Promise((r) => setTimeout(r, 20));
    synth.triggerAttack('C-3', 0, 1);
    await new Promise((r) => setTimeout(r, 60));
    keyed.push(renderTicks(w.proc, 40, 0));
    synth.triggerRelease();
    let keyPeak = 0;
    for (const v of keyed[0]) keyPeak = Math.max(keyPeak, Math.abs(v));
    expect(keyPeak, 'a key on instrument 3 sounds').toBeGreaterThan(0.01);
    const keyPosted = (w.proc as unknown as { key: unknown }).key;
    expect(keyPosted, 'the keyboard player exists').toBeTruthy();
  });
});
