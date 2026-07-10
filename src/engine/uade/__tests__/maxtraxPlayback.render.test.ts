/**
 * maxtraxPlayback.render.test.ts — MaxTrax audio.device port regression (Phase 3).
 *
 * MaxTrax (.mxtx) has no other renderer: UADE IS the oracle. Playback only works
 * because uade-3.05 now carries the ported fake audio.device (audiodevice.c + the
 * custom.c DMA-completion hook + uade.c AMIGAMSG handlers) AND the score.s play loop
 * drains DMA-completion replies from $1fc every tick (two `bsr handleDMAreplymsgs`).
 *
 * Two independent failure modes this locks against:
 *   1. Port reverted / not wired  -> antmusic.mxtx is SILENT everywhere (early window 0%).
 *   2. score.s reply-drain reverted -> audio plays then DIES after ~3.5s as unconsumed
 *      DMA replies pile up at $1fc and MaxTrax stops scheduling notes (late window 0%).
 *
 * So we assert sustained non-silence in BOTH an early (0-1s) AND a late (6-10s) window.
 * A control MOD must still render non-silent — the port must not regress normal songs.
 *
 * Rendered headlessly through DEViLBOX's real UADE WASM (public/uade/UADE.{js,wasm}),
 * the same bundle the app ships, via the shared render core.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderFileToSamples, type RenderResult } from '../../../../tools/uade-audit/uadeRenderCore';

const ROOT = process.cwd();
const SAMPLE_RATE = 44100;
const RENDER_SECONDS = 12;
const NONZERO_EPS = 1e-4;

// Committed real fixtures.
const MXTX_PATH = join(ROOT, 'public/data/songs/maxtrax/antmusic.mxtx');
const MOD_PATH = join(ROOT, 'src/__tests__/fixtures/mortimer-twang-2118bytes.mod');

/** Fraction of L-channel samples in [startSec, endSec) whose abs exceeds the epsilon. */
function nonzeroFraction(r: RenderResult, startSec: number, endSec: number): number {
  const startFrame = Math.floor(startSec * r.sampleRate);
  const endFrame = Math.min(Math.floor(endSec * r.sampleRate), r.frames);
  if (endFrame <= startFrame) return 0;
  let nz = 0;
  for (let f = startFrame; f < endFrame; f++) {
    if (Math.abs(r.samples[f * 2]) > NONZERO_EPS) nz++;
  }
  return nz / (endFrame - startFrame);
}

describe('MaxTrax audio.device port — sustained playback', () => {
  it('renders antmusic.mxtx non-silent in BOTH an early and a late window', async () => {
    const data = readFileSync(MXTX_PATH);
    const r = await renderFileToSamples(new Uint8Array(data), 'antmusic.mxtx', {
      sampleRate: SAMPLE_RATE,
      seconds: RENDER_SECONDS,
    });

    // Must have produced a substantial render (not an immediate stop).
    expect(r.frames).toBeGreaterThan(SAMPLE_RATE * 10);

    const early = nonzeroFraction(r, 0, 1);
    const late = nonzeroFraction(r, 6, 10);

    // Port wired -> audio present from the start.
    expect(early).toBeGreaterThan(0.5);
    // Reply-drain present -> audio SUSTAINS past the ~3.5s stall point. This is the
    // assertion that fails if the score.s `handleDMAreplymsgs` calls are reverted.
    expect(late).toBeGreaterThan(0.5);
  }, 60_000);

  it('still renders a normal MOD non-silent (port does not regress MODs)', async () => {
    const data = readFileSync(MOD_PATH);
    const r = await renderFileToSamples(new Uint8Array(data), 'mortimer-twang-2118bytes.mod', {
      sampleRate: SAMPLE_RATE,
      seconds: RENDER_SECONDS,
    });
    expect(r.frames).toBeGreaterThan(SAMPLE_RATE * 5);
    expect(nonzeroFraction(r, 0, 4)).toBeGreaterThan(0.5);
  }, 60_000);
});
