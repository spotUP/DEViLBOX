/**
 * Regression: SunTronic native sampled-instrument (type-B) voices.
 *
 * Gate D (plans/2026-07-16-suntronic-gateD-sampled-dma.md). Before this,
 * `SunTronicPlayer.selectInstrument` returned null for a bit6-clear (type-B)
 * select, so a sampled voice (a) had no PCM to render AND (b) `stepEffects`
 * bailed at the `!inst` guard — period/volume/vibrato never computed, the voice
 * froze at period 0 and rendered SILENT.
 *
 * The Andy Silva replayer source proves EFFECTS is SHARED: GNN8 (@0x26a16) sets
 * $14=0 (ACTIVE) and points voice+$4 at the 0x1c sampled record whose front
 * 0x00-0x11 is the same env/vib block a synth record has — so the SAME EFFECTS
 * pipeline computes period/vol for a sampled voice. This test pins that:
 * analgestic2 voice 2 selects sampled slot 0 (perc1.x) at t0 and runs EFFECTS
 * (period 302, outVolume 64) for the whole timeline.
 *
 * Fails on revert: restore `selectInstrument` to `return null` for type-B and
 * voice 2's sampleSlot goes to -1, period/outVolume to 0 — every assertion here
 * trips.
 *
 * Byte-exact match of the rendered PCM slice vs the UADE chip-RAM play buffer is
 * asserted at the buffer level by tools/suntronic-re/native-mix + the p5 oracle
 * (Phase 5); this unit test pins the player-tick contract only.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '@/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../SunTronicPlayer';
import { renderSunTronicMix } from '../SunTronicNativeRender';

const CORPUS = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');

function loadSampleData(names: string[]): (Int8Array | null)[] {
  return names.map((n) => {
    try {
      return new Int8Array(readFileSync(join(CORPUS, 'instr', n)));
    } catch {
      return null;
    }
  });
}

describe('SunTronic native sampled (type-B) voices', () => {
  it('analgestic2 voice 2 selects sampled slot 0 and runs the SHARED EFFECTS', () => {
    const buf = new Uint8Array(readFileSync(join(CORPUS, 'analgestic2.src')));
    const score = parseSunTronicV13Score(buf);
    const sampleData = loadSampleData(score.instrumentNames);
    const player = new SunTronicPlayer(score, { sampleData });

    const tl = player.renderTimeline(400);
    const v2 = tl.map((t) => t.voices[2]);

    // t0: voice 2 is a sampled voice (slot 0 = perc1.x, 2362 words = 4724 bytes).
    expect(v2[0].sampleSlot).toBe(0);
    expect(v2[0].sampleLenWords).toBe(2362);
    expect(v2[0].loopLenWords).toBe(1); // one-shot

    // EFFECTS runs for the sampled voice: non-zero period + post-envelope volume.
    // (Reverted null-instr path leaves both frozen at 0.)
    expect(v2[0].period).toBeGreaterThan(0);
    expect(v2[0].outVolume).toBeGreaterThan(0);

    // sustained across the timeline, not a single-tick fluke
    const active = v2.filter((vd) => vd.sampleSlot >= 0 && vd.period > 0 && vd.outVolume > 0);
    expect(active.length).toBeGreaterThan(300);
  });

  it('sampled voice runs EFFECTS even when the companion PCM is absent', () => {
    // The EFFECTS fix (period/vol) is independent of PCM availability — the
    // sampled descriptor still resolves from the module's own 0x1c record. Only
    // the audio RENDER goes silent without the sidecar; the tick contract holds.
    const buf = new Uint8Array(readFileSync(join(CORPUS, 'analgestic2.src')));
    const score = parseSunTronicV13Score(buf);
    const player = new SunTronicPlayer(score, { sampleData: undefined });

    const tl = player.renderTimeline(8);
    expect(tl[0].voices[2].sampleSlot).toBe(0);
    expect(tl[0].voices[2].period).toBeGreaterThan(0);
    expect(tl[0].voices[2].outVolume).toBeGreaterThan(0);
  });

  it('globe.src channel 4 (sampled voice 3) renders audible PCM — not silent', () => {
    // User-reported symptom: globe.src shows notes in channel 4 but that channel
    // played SILENT. Channel 4 (voice index 3) is a sampled (type-B) voice —
    // dominated by slot 1 (popsnare2.x). This drives the FULL render core
    // (companion resolution -> Paula DMA stream) and asserts the voice produces
    // real audio, not just a non-frozen player tick. Confirmed live in-app: with
    // channels 0-2 muted, the capture's ch0+ch3->L bus carries voice 3 (L_rms
    // ~0.024) while ch1+ch2->R is fully silent.
    //
    // Fails on revert of the Gate D sampled fix: selectInstrument -> null leaves
    // voice 3 with sampleSlot -1 / period 0, the render core skips it, ch[3] is
    // all zeros -> info.silent true and peak 0.
    const buf = new Uint8Array(readFileSync(join(CORPUS, 'globe.src')));
    const score = parseSunTronicV13Score(buf);
    const slotPcm = loadSampleData(score.instrumentNames);
    const mix = renderSunTronicMix(score, slotPcm, { seconds: 8 });

    const v3 = mix.ch[3];
    let peak = 0;
    for (let i = 0; i < v3.length; i++) { const a = Math.abs(v3[i]); if (a > peak) peak = a; }

    expect(mix.info[3].silent).toBe(false);
    expect(peak).toBeGreaterThan(0.05);
  });
});
