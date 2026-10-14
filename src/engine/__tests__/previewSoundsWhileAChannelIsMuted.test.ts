/**
 * RH-PREVIEW-MUTED (2026-10-14): keyboard audition of a Rob Hubbard instrument was silent while any channel was muted.
 *
 * The mixer's channel mute mask reaches every engine with setMuteMask. The per-player worklets tested the mask against the
 * player HANDLE (1 << handle), but a handle is an allocation slot, not a song channel. Muting channel N silenced whichever
 * player happened to hold handle N - the audition voice included. Invariant: auditioning an instrument sounds regardless of
 * the song's channel mutes (channel mutes for synth-played channels are applied by ToneEngine's channel gain).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startWorklet } from './workletHarness';
import { renderTicks, chainedHeapTransform } from './keyboardPreviewHarness';
import { serializeRobHubbardConfig } from '../robhubbard/RobHubbardSynth';

const ROOT = resolve(__dirname, '../../..');

async function auditionPeak(mask: number | null): Promise<number> {
  const w = await startWorklet('robhubbard', 'RobHubbard', chainedHeapTransform);
  // Take handles 0..2 so the audition voice is handle 2 (its channel-mask bit is channel 2).
  let handle = -1;
  for (let i = 0; i < 3; i++) {
    w.posted.length = 0;
    await w.send({ type: 'createPlayer' });
    handle = (w.posted.find((m) => m.type === 'playerCreated') as unknown as { handle: number }).handle;
  }
  const blob = serializeRobHubbardConfig({
    sampleLen: 64, loopOffset: 0, sampleVolume: 64, relative: 1, divider: 0, vibratoIdx: 0, hiPos: 0, loPos: 0,
    vibTable: [], sampleData: Array.from({ length: 64 }, (_, i) => (i < 32 ? 100 : -100)),
  });
  await w.send({ type: 'loadInstrument', handle, buffer: blob });
  if (mask !== null) await w.send({ type: 'setMuteMask', mask });
  await w.send({ type: 'noteOn', handle, note: 48, velocity: 100 });
  return Math.max(...Array.from(renderTicks(w.proc, 20, 0), Math.abs));
}

describe('Rob Hubbard keyboard audition', () => {
  it('sounds with no channel muted', async () => {
    expect(await auditionPeak(null)).toBeGreaterThan(0.01);
  });
  it('sounds while the channel numbered like its player slot is muted', async () => {
    expect(await auditionPeak(0xFFFFFFFF & ~(1 << 2))).toBeGreaterThan(0.01);
  });
  it('sounds while every channel is muted', async () => {
    expect(await auditionPeak(0)).toBeGreaterThan(0.01);
  });
  it.each(['robhubbard/RobHubbard', 'hippel-coso/HippelCoSo', 'fc/FC', 'fred/Fred', 'octamed/OctaMED', 'sidmon1/SidMon1'])(
    'the %s worklet does not gate player handles by the channel mute mask', (f) => {
      const src = readFileSync(resolve(ROOT, `public/${f}.worklet.js`), 'utf8');
      expect(src).not.toMatch(/muteMask\s*&\s*\(1\s*<<\s*(hi|handle)\)/);
    });
});
