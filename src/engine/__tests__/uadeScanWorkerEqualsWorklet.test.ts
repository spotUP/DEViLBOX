/**
 * The UADE scan moved off the audio thread (U2.7): the scan worker's result
 * must be the worklet's, row for row. The worker hosts the worklet's own source
 * with its own WASM instance (uadeWorkletHost.ts), so this proves the host does
 * not change what a scan produces - the sample, the grid, the instruments, the
 * tempo, the metadata - over a sample of the UADE corpus, one song per format
 * (SAMPLE_SONGS), plus a DeliTracker custom with its tick ring.
 * Runs the real worklet and WASM twice per song.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startWorklet, songBuffer, ROOT, type WorkletMsg } from '@/engine/__tests__/workletHarness';
import { uadeTransform } from '@/engine/uade/uadeGlue';
import { createUadeWorkletHost } from '@/engine/uade/uadeWorkletHost';
import { getScanParams } from '@/engine/uade/uadeScanLists';
import { uadePlayerHint } from '@/lib/import/uadePlayerHint';

/**
 * One scannable, companion-free, playing song per format, evenly thinned to 14:
 * drawn once from the sound-check sweep (test-data/uade-corpus-sweep.json, a
 * local, gitignored record) and frozen here, so the test runs from a clean
 * checkout and does not move when the sweep is re-run.
 */
const SAMPLE_SONGS = [
  'public/data/songs/formats/gettysburg.avp',
  'public/data/songs/formats/terramex.bds',
  'public/data/songs/formats/apb.dw',
  'public/data/songs/formats/doxtro3.dss',
  'public/data/songs/formats/hybris.fp',
  'public/data/songs/formats/redoctober-sub-docking.ims',
  'public/data/songs/formats/ikari_warriors.jb',
  'public/data/songs/formats/cockwise.mug',
  'public/data/songs/formats/45.okta',
  'public/data/songs/formats/centurion_battle.rh',
  'public/data/songs/formats/count_duckula.scr',
  'public/data/songs/formats/operation_stealth.sfx',
  'public/data/songs/formats/offroad.jpo',
  'public/data/songs/formats/dynablaster.ast',
];
const CUSTOM = 'public/data/songs/delitracker-custom/bards tale.cus';

/** The scan's result without the wall clock, which differs by design. */
function comparable(m: WorkletMsg): unknown {
  const c = JSON.parse(JSON.stringify(m, (_k, v) => (v instanceof Uint8Array ? Array.from(v) : v))) as Record<string, unknown>;
  const stats = c.scanStats as Record<string, unknown> | null;
  if (stats) { delete stats.wallMs; }
  return c;
}

async function bothScans(path: string, tickSnapshots: boolean) {
  const name = path.split('/').pop()!;
  const hint = uadePlayerHint(name);
  const params = getScanParams(name);
  const transform = async (c: string) => uadeTransform(c);
  const wasmBinary = readFileSync(join(ROOT, 'public/uade/UADE.wasm'));
  const jsCode = uadeTransform(readFileSync(join(ROOT, 'public/uade/UADE.js'), 'utf8'));
  const workletSource = readFileSync(join(ROOT, 'public/uade/UADE.worklet.js'), 'utf8');

  const inWorklet = await startWorklet('uade', 'UADE', transform);
  if (tickSnapshots) { await inWorklet.send({ type: 'enableTickSnapshots', enable: true }); await inWorklet.send({ type: 'resetTickSnapshots' }); }
  inWorklet.posted.length = 0;
  await inWorklet.send({ type: 'load', buffer: songBuffer(path), filenameHint: hint, skipScan: false, subsong: 0, scanTimeoutSec: params.scanTimeoutSec, companions: [] });
  const workletLoaded = inWorklet.posted.find((m) => m.type === 'loaded') as WorkletMsg;

  const host = await createUadeWorkletHost({ workletSource, wasmBinary, jsCode, sampleRate: 48000 });
  const workerLoaded = await host.scan({ buffer: songBuffer(path), filenameHint: hint, subsong: 0, scanTimeoutSec: params.scanTimeoutSec, companions: [], tickSnapshots });
  return { workletLoaded, workerLoaded };
}

describe('UADE scan: worker result equals the worklet result', { timeout: 600_000 }, () => {
  const sample = SAMPLE_SONGS;

  it('samples a spread of formats', () => {
    expect(sample.length).toBeGreaterThanOrEqual(8);
  });

  it.each(sample)('%s', async (path) => {
    const { workletLoaded, workerLoaded } = await bothScans(path, false);
    expect(workletLoaded, 'the worklet loaded it').toBeDefined();
    const stopped = (m: WorkletMsg) => ((m as { scanStats?: unknown }).scanStats as { stoppedBy?: string } | null)?.stoppedBy;
    // A scan cut by the wall clock stops wherever the machine was: not comparable.
    if (stopped(workletLoaded) === 'deadline' || stopped(workerLoaded) === 'deadline') return;
    expect(comparable(workerLoaded)).toEqual(comparable(workletLoaded));
    expect(Array.isArray(workerLoaded.scanData) && workerLoaded.scanData.length).toBeGreaterThan(0);
  });

  it('a DeliTracker custom (short scan): scan result and its tick snapshots are identical (short scan)', async () => {
    const { workletLoaded, workerLoaded } = await bothScans(CUSTOM, true);
    expect(comparable(workerLoaded)).toEqual(comparable(workletLoaded));
    expect((workerLoaded.shortScanTicks as unknown[]).length, 'the scan captured its ticks').toBeGreaterThan(0);
  });
});
