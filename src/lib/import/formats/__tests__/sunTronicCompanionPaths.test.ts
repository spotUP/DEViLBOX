/**
 * Regression: SunTronic V1.3 songs loaded from the built-in/server file browser
 * had silent sampled channels ("analgestic2.src channel 4 broken; UADE plays it
 * correct"). Whole-song SunTronic playback routes to UADE, which opens the
 * module's external samples from an `instr/` subdir via dos.library. The browser
 * auto-fetch (fetchCompanionFiles) only knew prefix-based schemes (TFMX mdat.↔
 * smpl. etc.), so it supplied ZERO companions for SunTronic → the samples were
 * absent from UADE's virtual FS → the channels using them were silent.
 *
 * Fix: sunTronicCompanionPaths() parses the module for the exact sidecar paths
 * (dir prefix + basenames, e.g. instr/perc1.x) so the browser can pre-populate
 * UADE's vFS at /uade/<relpath>, matching the replayer's open.
 *
 * Fails on revert: without the resolver the sampled-instrument paths cannot be
 * derived (function absent / returns []), so the browser fetches nothing and
 * the channels stay silent.
 *
 * Fixture (real module, committed):
 *   public/data/songs/formats/SUNTronicTunes/analgestic2.src
 *     → external samples under instr/: perc1.x, perc2.x, bio
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { sunTronicCompanionPaths } from '../SunTronicV13';

const CORPUS = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');

function load(name: string): ArrayBuffer {
  const raw = new Uint8Array(readFileSync(join(CORPUS, name)));
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
}

describe('sunTronicCompanionPaths', () => {
  it('resolves analgestic2.src external samples to their instr/ subdir paths', () => {
    const paths = sunTronicCompanionPaths(load('analgestic2.src'));
    // dir prefix (`instr/`) is joined onto each basename — NOT a bare basename,
    // NOT the dir entry itself, NOT dos.library.
    expect(paths).toEqual(['instr/perc1.x', 'instr/perc2.x', 'instr/bio']);
    expect(paths).not.toContain('instr/');
    expect(paths.some((p) => p.toLowerCase().includes('dos.library'))).toBe(false);
  });

  it('each resolved path points at a real committed sidecar file', () => {
    for (const rel of sunTronicCompanionPaths(load('analgestic2.src'))) {
      expect(existsSync(join(CORPUS, rel))).toBe(true);
    }
  });

  it('returns [] for a non-SunTronic buffer', () => {
    expect(sunTronicCompanionPaths(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toEqual([]);
  });
});
