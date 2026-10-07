/**
 * Reachability for U2.7: UADEEngine.load with a scan hands the scan to the scan
 * worker (sentinel: scansStarted), the AudioWorklet is sent skipScan:true with
 * the subsong the scan settled on pinned and never scans (its _lastScanStats
 * stays unset), and Cancel (cancelLoad / an AbortSignal) ends the worker scan.
 * The worker is stood in by an in-process host running the real worklet source
 * and WASM; the audio-thread worklet is the real one too.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startWorklet, songBuffer, ROOT, type WorkletMsg } from '@/engine/__tests__/workletHarness';
import type { UADEEngine, UADEMetadata } from '@/engine/uade/UADEEngine';
import { UadeScanClient, type ScanWorkerLike } from '@/engine/uade/UadeScanClient';
import { createUadeWorkletHost, type UadeWorkletHost } from '@/engine/uade/uadeWorkletHost';
import { uadeTransform } from '@/engine/uade/uadeGlue';

const SONG = 'public/data/songs/formats/45.okta';

interface FakeWorker extends ScanWorkerLike { terminated: boolean; received: unknown[] }

/** A worker whose scan runs in-process on a real host; `hang` never answers (a scan still running). */
function fakeWorkerFactory(host: UadeWorkletHost, hang = false) {
  const workers: FakeWorker[] = [];
  const factory = (): ScanWorkerLike => {
    const w: FakeWorker = {
      terminated: false, received: [], onmessage: null, onerror: null,
      terminate() { w.terminated = true; },
      postMessage(msg: unknown) {
        const m = msg as { id: number; request: Parameters<UadeWorkletHost['scan']>[0] };
        w.received.push(m);
        if (hang) return;
        void host.scan(m.request).then((result) => w.onmessage?.({ data: { type: 'scanned', id: m.id, result } } as MessageEvent));
      },
    };
    workers.push(w);
    return w;
  };
  return { factory, workers };
}

async function setup(hang = false) {
  // Imported here, not at the top: the engine's import graph is circular through useMIDIStore and needs a settled module order.
  const { uadeMetaFromLoaded, UADEEngine: Engine } = await import('@/engine/uade/UADEEngine');
  proto = Engine.prototype;
  const host = await createUadeWorkletHost({
    workletSource: readFileSync(join(ROOT, 'public/uade/UADE.worklet.js'), 'utf8'),
    wasmBinary: readFileSync(join(ROOT, 'public/uade/UADE.wasm')),
    jsCode: uadeTransform(readFileSync(join(ROOT, 'public/uade/UADE.js'), 'utf8')),
    sampleRate: 48000,
  });
  const audio = await startWorklet('uade', 'UADE', async (c) => uadeTransform(c));
  const { factory, workers } = fakeWorkerFactory(host, hang);
  UadeScanClient.workerFactory = factory;
  const sent: Array<Record<string, unknown>> = [];
  const engine = {
    _initPromise: Promise.resolve(),
    audioContext: { sampleRate: 48000 },
    scanClient: new UadeScanClient(),
    lastScanStats: undefined as unknown,
    _tickSnapshotsOn: false,
    _scanTicks: null as unknown,
    _resolveLoad: null as null | ((m: UADEMetadata) => void),
    _rejectLoad: null as null | ((e: Error) => void),
    workletNode: {
      port: {
        postMessage(msg: Record<string, unknown>) {
          sent.push(msg);
          if (msg.type !== 'load') return;
          // the audio-thread worklet handles it; its `loaded` resolves the engine's pending load
          void audio.send(msg).then(() => {
            const loaded = audio.posted.find((p: WorkletMsg) => p.type === 'loaded');
            engine._resolveLoad?.(uadeMetaFromLoaded(loaded as Record<string, unknown>));
          });
        },
      },
    },
  };
  return { engine: engine as unknown as typeof engine, sent, workers, audio };
}

let proto: UADEEngine;
describe('UADE scan runs in the scan worker, not the audio worklet', { timeout: 120_000 }, () => {
  it('load() scans in the worker and the worklet only loads for playback', async () => {
    const { engine, sent, workers, audio } = await setup();
    const meta = await proto.load.call(engine as unknown as UADEEngine, songBuffer(SONG), '45.okta', false, 0);

    expect(engine.scanClient.scansStarted, 'the worker scan ran once').toBe(1);
    expect(workers).toHaveLength(1);
    const load = sent.find((m) => m.type === 'load')!;
    expect(load.skipScan, 'the audio thread is told not to scan').toBe(true);
    expect(load.pinSubsong, 'and not to probe subsongs either').toBe(true);
    expect((audio.proc as { _lastScanStats?: unknown })._lastScanStats, 'the worklet never ran a scan').toBeUndefined();
    expect(meta.scanData!.length, 'the result is the worker scan\'s').toBeGreaterThan(100);
    expect(meta.enhancedScan?.samples).toBeDefined();
    expect(sent.find((m) => m.type === 'setLooping')?.value, 'a completed scan leaves looping off').toBe(false);
  });

  it('a format that skips its scan never reaches the worker', async () => {
    const { engine, workers } = await setup();
    await proto.load.call(engine as unknown as UADEEngine, songBuffer(SONG), 'mon.unreal flying', true, 0);
    expect(engine.scanClient.scansStarted).toBe(0);
    expect(workers).toHaveLength(0);
  });

  it('cancelLoad ends the scan in flight: the worker is terminated and the load rejects', async () => {
    const { engine, workers } = await setup(true);
    const p = proto.load.call(engine as unknown as UADEEngine, songBuffer(SONG), '45.okta', false, 0);
    await new Promise((r) => setTimeout(r, 20));
    expect(workers[0].received).toHaveLength(1);
    proto.cancelLoad.call(engine as unknown as UADEEngine);
    await expect(p).rejects.toThrow('Scan cancelled');
    expect(workers[0].terminated).toBe(true);
  });

  it('an aborted signal ends the scan in flight', async () => {
    const { engine, workers } = await setup(true);
    const ac = new AbortController();
    const p = proto.load.call(engine as unknown as UADEEngine, songBuffer(SONG), '45.okta', false, 0, undefined, undefined, false, undefined, ac.signal);
    await new Promise((r) => setTimeout(r, 20));
    ac.abort();
    await expect(p).rejects.toThrow('Scan cancelled');
    expect(workers[0].terminated).toBe(true);
  });
});
