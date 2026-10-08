/**
 * The real import path for formats the UADE scan builds (or completes) in node: UADEParser.parseUADEFile
 * drives the real UADE worklet and WASM through a UADEEngine stand-in that forwards load / readMemory to it.
 * This is the blocker the keyboard tests had ("import needs AudioContext in node"): UADEEngine.getInstance()
 * builds an AudioContext and fetches UADE.wasm over http; the stand-in does neither.
 *
 * Use with `vi.mock('@/utils/audio-context', ...)` (a gain stub) for imports that also touch synth classes.
 */
import { vi } from 'vitest';
import { startWorklet, songBuffer, type WorkletProc, type WorkletMsg } from './workletHarness';

const transform = async (c: string) => (await import('@/engine/uade/UADEEngine')).uadeTransform(c);

export interface UadeImport {
  /** The song parseModuleToSong built (UADE scan grid, native grid, instruments). */
  song: Awaited<ReturnType<typeof import('@/lib/import/parseModuleToSong').parseModuleToSong>>;
  proc: WorkletProc;
  send: (m: unknown) => Promise<void>;
  posted: WorkletMsg[];
  /** The spy on UADEEngine.getInstance (calls after the import = something asked for the engine). */
  getInstanceSpy: { mock: { calls: unknown[] } };
  /** What the import's Paula scan returned (the samples its instruments were built from); empty when the format did not scan. */
  paulaSamples: unknown[];
}

/**
 * Open `relPath` (under public/data/songs) through parseModuleToSong with `UADEEngine.getInstance` replaced by
 * a forwarder to a fresh UADE worklet. `companions` are companion files by file name (smp.*, .ins, ...).
 */
export async function importThroughUade(relPath: string, companions?: Record<string, string>): Promise<UadeImport> {
  const { proc, send, posted } = await startWorklet('uade', 'UADE', transform);
  let pendingRead = 0;
  let lastPaulaSamples: unknown[] = [];
  const engine = {
    ready: async () => {}, enableTickSnapshots: () => {}, resetTickSnapshots: () => {},
    getTickSnapshots: async () => [], addCompanionFile: async () => {},
    load: async (buffer: ArrayBuffer, filenameHint: string, skipScan: boolean, subsong: number, scanTimeoutSec?: number, _looping?: boolean, pinSubsong?: boolean, withCompanions?: Map<string, ArrayBuffer>) => {
      const list = [...(withCompanions ?? [])].map(([filename, b]) => ({ filename, buffer: b.slice(0) }));
      await send({ type: 'load', buffer, filenameHint, skipScan, subsong, scanTimeoutSec, pinSubsong, companions: list });
      const d = posted.filter((m) => m.type === 'loaded').pop() as Record<string, unknown>;
      return { ...d, startSubsong: d.startSubsong ?? 0 };
    },
    scanPaulaSamples: async (durationMs: number) => {
      const requestId = ++pendingRead;
      const before = posted.length;
      await send({ type: 'scanPaulaSamples', requestId, durationMs });
      const r = posted.slice(before).find((m) => (m as { requestId?: number }).requestId === requestId) as unknown as { samples?: Array<Record<string, unknown> & { pcm: ArrayBuffer }>; message?: string } | undefined;
      if (!r?.samples) throw new Error(r?.message ?? 'scanPaulaSamples: no reply');
      const samples = r.samples.map((x) => ({ ...x, pcm: new Uint8Array(x.pcm) }));
      lastPaulaSamples = samples;
      return samples;
    },
    readMemory: async (addr: number, length: number): Promise<Uint8Array> => {
      const id = ++pendingRead;
      const before = posted.length;
      await send({ type: 'readMemory', addr, length, requestId: id });
      const r = posted.slice(before).find((m) => (m as { requestId?: number }).requestId === id) as unknown as { data?: ArrayBuffer; error?: string } | undefined;
      if (!r?.data) throw new Error(r?.error ?? 'readMemory: no reply');
      return new Uint8Array(r.data);
    },
  };
  const { UADEEngine } = await import('@/engine/uade/UADEEngine');
  const getInstanceSpy = vi.spyOn(UADEEngine, 'getInstance').mockReturnValue(engine as unknown as ReturnType<typeof UADEEngine.getInstance>);
  const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
  const name = relPath.split('/').pop()!;
  const comp = companions ? new Map(Object.entries(companions).map(([n, p]) => [n, songBuffer('public/data/songs/' + p)])) : undefined;
  const file = new File([songBuffer('public/data/songs/' + relPath)], name);
  const song = await parseModuleToSong(file, 0, undefined, undefined, comp, engine as never);
  return { song, proc, send, posted, getInstanceSpy, paulaSamples: lastPaulaSamples };
}
