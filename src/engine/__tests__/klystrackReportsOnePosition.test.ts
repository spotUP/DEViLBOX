/**
 * KLYS-CONFORM (owner 2026-10-15): "position and pattern are not reported" while Ocean Loader III.kt played.
 *
 * NativeEngineRouting subscribed KlysEngine twice: once in a Klystrack block reading its own field names
 * (patternPosition / songPosition), and once in the generic onPositionUpdate block every engine gets, reading the
 * house shape (row / songPos). Both reported every engine message to the position store; the generic one ran last
 * and wrote row = undefined, songPos untouched, so the store the pattern editor and toolbar read held no row and a
 * song position of 0 (measured live through get_playback_state: enginePosition {active: true, songPos: 0}, no row).
 *
 * Drives the real KlysEngine message handler through a real startNativeEngines; only the worklet node and the audio
 * graph are stood in.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const gain = { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} };
const context = {
  sampleRate: 48000, state: 'running', currentTime: 0, destination: {},
  createAnalyser: () => ({ fftSize: 2048, context: { state: 'running' }, getFloatTimeDomainData(b: Float32Array) { b.fill(0); }, connect() {}, disconnect() {} }),
  createGain: () => ({ connect() {}, disconnect() {}, gain }),
};

class FakeWorkletNode {
  port = { postMessage() {}, onmessage: null as null | ((e: { data: unknown }) => void) };
  connect() {}
  disconnect() {}
}

const holder = vi.hoisted(() => ({ engine: null as unknown }));

vi.mock('@/engine/klystrack/KlysEngine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/engine/klystrack/KlysEngine')>();
  const K = actual.KlysEngine as unknown as { getInstance: () => unknown; hasInstance: () => boolean };
  K.getInstance = () => holder.engine;
  K.hasInstance = () => true;
  return actual;
});
vi.mock('../dub/DubBus', () => ({ getActiveDubBus: () => ({ registerWholeMixTap() {}, unregisterWholeMixTap() {}, setEngineIsolation() {} }) }));
vi.mock('../ToneEngine', () => ({
  getToneEngine: () => ({ getInstrument() {}, connectMeters() {}, stopNativeEngine() {}, getNativeEngineOutput: () => null }),
}));
vi.mock('../replayer/editedModuleForPlay', () => ({ editedModuleForPlay: async () => null }));

const song = {
  name: 'Ocean Loader III', format: 'KT', patterns: [], instruments: [], songPositions: [0], songLength: 1,
  restartPosition: 0, numChannels: 4, initialSpeed: 5, initialBPM: 138, linearPeriods: false,
  klysFileData: new Uint8Array([1, 2, 3, 4]).buffer,
} as unknown as TrackerSong;

describe('klystrack position reporting', () => {
  beforeAll(async () => {
    (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode = FakeWorkletNode;
    const { KlysEngine } = await import('@/engine/klystrack/KlysEngine');
    const { PositionCallbacks } = await import('@/engine/wasm/PositionCallbacks');
    const engine = Object.create(KlysEngine.prototype) as Record<string, unknown>;
    Object.assign(engine, {
      audioContext: context, output: { context, gain, connect() {}, disconnect() {} },
      _positions: new PositionCallbacks(), _positionCallbacks: new Set(), _songEndCallbacks: new Set(), _songDataCallbacks: new Set(),
      ready: async () => {}, loadSong: async () => ({}), play() {}, stop() {}, pause() {}, setLooping() {},
    });
    (engine as unknown as { createNode(): void }).createNode();
    holder.engine = engine;
    await import('../replayer/NativeEngineRouting');
  }, 240_000);

  it('a position the worklet reports reaches the position store as that row and song row', { timeout: 240_000 }, async () => {
    const routing = await import('../replayer/NativeEngineRouting');
    const { useWasmPositionStore } = await import('@stores/useWasmPositionStore');
    routing.clearRunningEngineKeys();
    useWasmPositionStore.getState().clear();
    await routing.startNativeEngines(song, {} as never, false, false, new Set());

    const node = (holder.engine as { workletNode: FakeWorkletNode }).workletNode;
    node.port.onmessage!({ data: { type: 'position', songPosition: 150, patternPosition: 22, speed: 5 } });
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    const pos = useWasmPositionStore.getState();
    expect({ active: pos.active, row: pos.row, songPos: pos.songPos }).toEqual({ active: true, row: 22, songPos: 150 });
    expect(routing.engineSubscriptionCount(), 'one position subscription on the engine').toBe(1);
    routing.stopNativeEngines(song, new Set(), null);
  });
});
