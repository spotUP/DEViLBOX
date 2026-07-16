/**
 * Regression: SunTronic native render core — streaming == whole-song.
 *
 * Gate B.2 (plans/2026-07-16-suntronic-gateB2-native-song-playback.md) drives
 * browser playback by calling `SunTronicNativeRenderer.renderInto` in SHORT
 * chunks (the worklet pump with lookahead) instead of one whole-song pass. That
 * only produces correct audio if a chunk boundary NEVER perturbs the 1024-sample
 * player-tick bucket clock or the 882.759-sample vblank regen grid — both are
 * driven off the renderer's absolute `pos`, not the chunk length.
 *
 * This pins that invariant: rendering analgestic2 in a ragged sequence of chunk
 * sizes (1, 883, 1023, 1025, 2048, 7, ... — deliberately crossing bucket AND
 * vblank boundaries mid-chunk) produces byte-identical stereo to the single
 * whole-song `renderSunTronicMix`. It also confirms Gate D still holds through
 * the core (voice 2 = sampled slot 0, not silent).
 *
 * Fails on revert: reintroduce any chunk-length dependence in the bucket/vblank
 * clock (e.g. resetting nextVblank per call, or ticking per chunk instead of per
 * 1024 absolute samples) and the chunked stereo diverges from whole-song.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '@/lib/import/formats/SunTronicV13';
import {
  renderSunTronicMix,
  SunTronicNativeRenderer,
  NATIVE_SAMPLE_RATE,
  paulaVoiceSample,
} from '../SunTronicNativeRender';

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

describe('SunTronic native render core', () => {
  const buf = new Uint8Array(readFileSync(join(CORPUS, 'analgestic2.src')));
  const score = parseSunTronicV13Score(buf);
  const slotPcm = loadSampleData(score.instrumentNames);
  const seconds = 4;
  const total = Math.floor(seconds * NATIVE_SAMPLE_RATE);

  it('streams byte-identical to the whole-song render across ragged chunks', () => {
    const whole = renderSunTronicMix(score, slotPcm, { seconds });

    const streamL = new Float32Array(total);
    const streamR = new Float32Array(total);
    const renderer = new SunTronicNativeRenderer(score, slotPcm);
    // Ragged sizes that straddle the 1024 bucket AND 882.759 vblank grids.
    const sizes = [1, 883, 1023, 1025, 2048, 7, 512, 4096, 100];
    let off = 0;
    let k = 0;
    while (off < total) {
      const n = Math.min(sizes[k % sizes.length], total - off);
      const l = new Float32Array(n);
      const r = new Float32Array(n);
      renderer.renderInto(l, r);
      streamL.set(l, off);
      streamR.set(r, off);
      off += n;
      k++;
    }

    expect(off).toBe(total);
    // Byte-identical — no tolerance. Any drift = broken chunk invariant.
    for (let i = 0; i < total; i++) {
      if (streamL[i] !== whole.left[i] || streamR[i] !== whole.right[i]) {
        throw new Error(
          `chunked != whole at sample ${i}: L ${streamL[i]} vs ${whole.left[i]}, ` +
          `R ${streamR[i]} vs ${whole.right[i]}`,
        );
      }
    }
  });

  it('renders the sampled voice (Gate D) through the core — voice 2 not silent', () => {
    const whole = renderSunTronicMix(score, slotPcm, { seconds });
    // voice 2 = sampled slot 0 (perc1.x); dominant key -2-slot = -2.
    expect(whole.info[2].dominantOff).toBe(-2);
    expect(whole.info[2].silent).toBe(false);
    let peak = 0;
    for (const s of whole.ch[2]) if (Math.abs(s) > peak) peak = Math.abs(s);
    expect(peak).toBeGreaterThan(0);
  });

  // Regression: native voice scaling must match Paula/UADE exactly. UADE's
  // audio.c does `output = current_sample * vol` (s8 * 0..64) then reads it as
  // `output / 32768`, so a single channel maxes at 128*64/32768 = 0.25. The old
  // native path normalized with `(byte/128)*(vol/64)` = byte*vol/8192 — a 4x
  // over-gain that railed every voice to ~1.0 and clipped the mix. These pin the
  // correct 1/32768 scale; both fail on revert to the /8192 form.
  it('scales a voice sample exactly like Paula/UADE (full scale = 0.25, not 1.0)', () => {
    // Full-volume peak sample: 127 * 64 / 32768 = 0.248; NOT (127/128)*(64/64)=0.99.
    expect(paulaVoiceSample(127, 64)).toBeCloseTo(127 * 64 / 32768, 6);
    expect(paulaVoiceSample(127, 64)).toBeLessThan(0.25);
    expect(paulaVoiceSample(-128, 64)).toBeCloseTo(-0.25, 6);
    // Half volume halves the sample; silence is silent.
    expect(paulaVoiceSample(127, 32)).toBeCloseTo(paulaVoiceSample(127, 64) / 2, 6);
    expect(paulaVoiceSample(127, 0)).toBe(0);
  });

  it('never rails a per-voice buffer past the Paula ±0.25 ceiling (ballblaser)', () => {
    const bbuf = new Uint8Array(readFileSync(join(CORPUS, 'ballblaser.src')));
    const bscore = parseSunTronicV13Score(bbuf);
    const bslot = loadSampleData(bscore.instrumentNames);
    const mix = renderSunTronicMix(bscore, bslot, { seconds: 8 });
    for (let v = 0; v < 4; v++) {
      let peak = 0;
      for (const s of mix.ch[v]) if (Math.abs(s) > peak) peak = Math.abs(s);
      // Paula single-channel ceiling is 0.25; allow a hair for rounding. The old
      // 4x-hot code peaked at ~0.99 here, so this fails on revert.
      expect(peak, `voice ${v} peak ${peak} exceeds Paula ceiling`).toBeLessThanOrEqual(0.2551);
    }
  });

  // Regression: a sampled voice whose loop descriptor [loopStart, loopStart+
  // loopLen) runs PAST the DMA'd sample bytes produced a NaN sample — the loop
  // wrap did `phase = loopStart + ((phase - loopStart) % loopLen)` with loopLen
  // (3882) > byteLen (3780), landing idx exactly at pcm.length so `pcm[idx]` was
  // `undefined` and `undefined / 128 === NaN`. In the browser that one NaN is
  // written to the resampler worklet's ring buffer and never clears, so the song
  // goes SILENT-forever on a later loop ("silent on the second loop"). zoids.src
  // hits it at t≈15.9 s. The fix clamps the effective loop to the available bytes.
  it('never emits a non-finite sample when a sampled loop overruns the PCM (zoids)', () => {
    const zbuf = new Uint8Array(readFileSync(join(CORPUS, 'zoids.src')));
    const zscore = parseSunTronicV13Score(zbuf);
    const zslot = loadSampleData(zscore.instrumentNames);
    // Render past the known NaN point (15.9 s) in ragged worklet-style chunks so
    // the loop-wrap branch is exercised exactly as the pump drives it.
    const zseconds = 18;
    const ztotal = Math.floor(zseconds * NATIVE_SAMPLE_RATE);
    const renderer = new SunTronicNativeRenderer(zscore, zslot);
    const sizes = [2048, 883, 1025, 7, 4096];
    let off = 0;
    let k = 0;
    while (off < ztotal) {
      const n = Math.min(sizes[k % sizes.length], ztotal - off);
      const l = new Float32Array(n);
      const r = new Float32Array(n);
      renderer.renderInto(l, r);
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(l[i]) || !Number.isFinite(r[i])) {
          throw new Error(
            `non-finite output at sample ${off + i} (t=${((off + i) / NATIVE_SAMPLE_RATE).toFixed(3)}s): ` +
            `L=${l[i]} R=${r[i]} — sampled loop overran the PCM and poisoned the ring`,
          );
        }
      }
      off += n;
      k++;
    }
    expect(off).toBe(ztotal);
  });

  // Regression: per-voice mixer gain (mute/solo/volume). The native engine has no
  // per-voice audio nodes — the whole song is one pre-mixed stereo buffer — so
  // mute/solo/VU is only possible if the render core itself scales each Paula
  // voice from the mixer state (setVoiceGain, forwarded from useMixerStore's
  // _gainEngineCache like Cinter4). Two invariants pinned here, both fail on
  // revert of the vUserGain path in renderInto:
  //   (1) muting a voice (gain 0) zeroes that voice's scope tap AND drops its
  //       energy from the correct stereo side (0,3 -> L; 1,2 -> R).
  //   (2) default gain (1) leaves the mix BYTE-IDENTICAL to the oracle
  //       renderSunTronicMix — the offline golden path must not move.
  function renderWithGains(gains: [number, number, number, number]) {
    const renderer = new SunTronicNativeRenderer(score, slotPcm);
    for (let v = 0; v < 4; v++) renderer.setVoiceGain(v, gains[v]);
    const ch = [0, 1, 2, 3].map(() => new Float32Array(total)) as
      [Float32Array, Float32Array, Float32Array, Float32Array];
    const left = new Float32Array(total);
    const right = new Float32Array(total);
    renderer.renderInto(left, right, { ch });
    return { ch, left, right };
  }
  const energy = (b: Float32Array) => { let e = 0; for (const s of b) e += s * s; return e; };

  it('default per-voice gain (1) is byte-identical to the oracle whole-song render', () => {
    const whole = renderSunTronicMix(score, slotPcm, { seconds });
    const g1 = renderWithGains([1, 1, 1, 1]);
    for (let i = 0; i < total; i++) {
      if (g1.left[i] !== whole.left[i] || g1.right[i] !== whole.right[i]) {
        throw new Error(`unity-gain diverged from oracle at ${i}`);
      }
    }
  });

  it('muting a voice zeroes its scope tap and drops its energy from the correct stereo side', () => {
    const base = renderWithGains([1, 1, 1, 1]);
    // Pick an active voice on each stereo side: 0,3 -> L; 1,2 -> R.
    const active = [0, 1, 2, 3].filter((v) => energy(base.ch[v]) > 0);
    expect(active.length, 'need >=1 active voice to test muting').toBeGreaterThan(0);
    for (const v of active) {
      const gains: [number, number, number, number] = [1, 1, 1, 1];
      gains[v] = 0;
      const muted = renderWithGains(gains);
      // Muted voice's scope tap is fully silent.
      expect(energy(muted.ch[v]), `voice ${v} scope not silenced`).toBe(0);
      // Its energy left the correct side; the opposite side is untouched.
      const onLeft = v === 0 || v === 3;
      const mixSide = onLeft ? energy(muted.left) : energy(muted.right);
      const baseSide = onLeft ? energy(base.left) : energy(base.right);
      const otherMix = onLeft ? energy(muted.right) : energy(muted.left);
      const otherBase = onLeft ? energy(base.right) : energy(base.left);
      expect(mixSide, `voice ${v} energy did not drop from its side`).toBeLessThan(baseSide);
      expect(otherMix, `voice ${v} mute leaked to the other side`).toBeCloseTo(otherBase, 6);
    }
  });
});
