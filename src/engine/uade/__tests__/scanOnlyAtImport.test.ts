import { describe, it, expect, vi } from 'vitest';
import { getScanParams } from '../uadeScanLists';
import { UADEEngine } from '../UADEEngine';

/**
 * The scan is a full offline render of the whole song at emulation speed,
 * after which the worklet must reload the module because the scan consumed its
 * state. Measured at 3661 ms on `maniacs-of-noise/unreal flying.mon`, and paid
 * on the keypress: "audio is very delayed when i press play and pattern data
 * off sync", "on the amiga they play instantly" (2026-09-24).
 *
 * It belongs to the IMPORT path, which keeps the rows it produces. The play
 * paths threw the metadata away.
 */
describe('getScanParams reads a module name from either end', () => {
  it('skips the scan for a CRASH format named prefix-first', () => {
    // UADE names this module `mon.unreal flying`, not `unreal flying.mon`.
    // Splitting on "." and calling the last part the extension yields
    // "unreal flying", and ManiacsOfNoise — whose scan is documented to crash
    // the browser — was scanned anyway.
    expect(getScanParams('mon.unreal flying').skipScan).toBe(true);
  });

  it('skips the scan for the same format named extension-last', () => {
    expect(getScanParams('unreal flying.mon').skipScan).toBe(true);
  });

  it.each(['aps', 'mso', 'ml', 'sun', 'hip7'])(
    'covers %s in prefix form too',
    (token) => expect(getScanParams(`${token}.a tune`).skipScan).toBe(true),
  );

  it('gives a short scan its 30 second budget, from either end', () => {
    expect(getScanParams('mc.bombjack').scanTimeoutSec).toBe(30);
    expect(getScanParams('bombjack.mc').scanTimeoutSec).toBe(30);
  });

  it('still lets an ordinary format have its full scan at import', () => {
    const p = getScanParams('anthrox.fc');
    expect(p.skipScan).toBe(false);
    expect(p.scanTimeoutSec).toBeUndefined();
  });

  it('strips a directory before deciding', () => {
    expect(getScanParams('songs/maniacs-of-noise/mon.unreal flying').skipScan).toBe(true);
  });

  /**
   * Looping was never chosen — it fell out of whether a scan ran. Skipping a
   * scan must not silently start looping a song that used to end.
   */
  it('reports looping exactly where a scan would have left it', () => {
    expect(getScanParams('mon.unreal flying').loops, 'crash list: no scan ran').toBe(true);
    expect(getScanParams('bombjack.mc').loops, 'short scan: full reinit re-enables it').toBe(true);
    expect(getScanParams('anthrox.fc').loops, 'a completed scan leaves it off').toBe(false);
  });
});

describe('the play path never pays for a scan', () => {
  /** A stand-in engine carrying the real play-path method under test. */
  const fakeEngine = () => {
    const load = vi.fn().mockResolvedValue({});
    const engine = {
      load,
      loadForPlayback: UADEEngine.prototype.loadForPlayback,
    } as unknown as UADEEngine;
    return { engine, load };
  };

  it('loadForPlayback skips the scan for a format that is scanned at import', async () => {
    const { engine, load } = fakeEngine();

    // `anthrox.fc` is on no skip list — at import it gets a full scan.
    await engine.loadForPlayback(new ArrayBuffer(8), 'anthrox.fc');

    expect(load).toHaveBeenCalledTimes(1);
    const [, filename, skipScan, subsong, scanTimeoutSec, looping] = load.mock.calls[0];
    expect(filename).toBe('anthrox.fc');
    expect(skipScan, 'the play path discards the metadata — never scan for it').toBe(true);
    expect(subsong).toBe(0);
    expect(scanTimeoutSec).toBeUndefined();
    expect(looping, 'a format that used to end must still end').toBe(false);
  });

  it('keeps a compiled replayer looping', async () => {
    const { engine, load } = fakeEngine();
    await engine.loadForPlayback(new ArrayBuffer(8), 'mon.unreal flying');

    const [, , skipScan, , , looping] = load.mock.calls[0];
    expect(skipScan).toBe(true);
    expect(looping).toBe(true);
  });

  it('carries the subsong through', async () => {
    const { engine, load } = fakeEngine();
    await engine.loadForPlayback(new ArrayBuffer(8), 'anthrox.fc', 3);
    expect(load.mock.calls[0][3]).toBe(3);
  });

  it('loadTune goes through the same door', async () => {
    const { engine, load } = fakeEngine();
    const { useFormatStore } = await import('@/stores/useFormatStore');
    useFormatStore.setState({
      uadeEditableFileName: 'anthrox.fc',
      uadeCompanionFiles: null,
      uadeEditableCurrentSubsong: 2,
    });

    await UADEEngine.prototype.loadTune.call(engine, new ArrayBuffer(8));

    const [, filename, skipScan, subsong] = load.mock.calls[0];
    expect(filename).toBe('anthrox.fc');
    expect(skipScan).toBe(true);
    expect(subsong).toBe(2);
  });
});
