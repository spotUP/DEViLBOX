/**
 * Regression: SunTronic two-clock CIA vibrato model.
 *
 * The tick handler (0x2660e) fires uniformly every 1024 samples (= one golden
 * sample = one `tick()`); inside each fire an inner CIA accumulator (ciaTick ≈ 882)
 * steps the $24 vibrato phase 1-2× per fire and wraps a row every `speed` CIA ticks.
 * See SunTronicPlayer.ts header + tools/suntronic-re/probe-fire-aligned.ts.
 *
 * Two assertions:
 *  1. Oracle-exact prefix — native tick i (i=1..5) matches the committed UADE
 *     fire-aligned oracle golden[i-1] (native lags one priming fire). These five
 *     fires are byte-exact in both period and pitch acc.
 *  2. Native-output snapshot ticks 0..11 — locks the CIA-clock model's deterministic
 *     output. The old single-advance audio-clock model diverges at tick 6 (it emits
 *     252 there; the CIA model emits 254), so this snapshot FAILS on revert to that
 *     model. Ticks 6..11 include the known constant-rate residual (t6 254 vs the
 *     oracle's 252) — the documented 14/632 floor; a byte-exact model needs UADE's
 *     integer E-clock CIA period, not this swept constant.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '@/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../SunTronicPlayer';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes/gliders.src');
const GOLDEN = join(process.cwd(), 'src/engine/suntronic/__tests__/sunTronicNoteTimeline.golden.json');

interface Row { period: number; acc: number; vol: number; flags: number }
interface Golden { modules: Record<string, { tick: number; voices: Row[] }[]> }

describe('SunTronic two-clock CIA vibrato model', () => {
  it('matches the UADE fire-aligned oracle for the byte-exact prefix (gliders voice0)', () => {
    const golden: Golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
    const g = golden.modules['gliders.src'];
    const score = parseSunTronicV13Score(new Uint8Array(readFileSync(FIXTURE)));
    const player = new SunTronicPlayer(score, { subsong: 0 });

    // native tick i lags the oracle by one priming fire: native[i] == golden fire i-1.
    // ticks 1..5 are byte-exact (period + pitch acc) before the constant-rate drift.
    player.tick(); // tick 0 = priming fire (oracle fire -1)
    for (let i = 1; i <= 5; i++) {
      const t = player.tick();
      expect(t.voices[0].period).toBe(g[i - 1].voices[0].period);
      expect(t.voices[0].acc & 0xffff).toBe(g[i - 1].voices[0].acc);
    }
  });

  it('locks the CIA-clock deterministic output (fails on revert to the audio-clock model)', () => {
    const score = parseSunTronicV13Score(new Uint8Array(readFileSync(FIXTURE)));
    const player = new SunTronicPlayer(score, { subsong: 0 });
    const periods: number[] = [];
    const vibHex: string[] = [];
    for (let i = 0; i < 12; i++) {
      periods.push(player.tick().voices[0].period);
      vibHex.push((player.debugVoice(0).vibPhase & 0xffff).toString(16));
    }
    // oracle-exact fires 0..4 in ticks 1..5 (251,253,256,258,256); tick 6 = 254 is
    // the CIA model's residual (the old audio-clock model emits 252 here → revert fails).
    expect(periods).toEqual([249, 251, 253, 256, 258, 256, 254, 250, 251, 253, 255, 257]);
    // $24 advances by 0x1f40 per CIA tick — doubling at tick 6 (bb80 → fa00, two steps).
    expect(vibHex[5]).toBe('bb80');
    expect(vibHex[6]).toBe('fa00');
  });
});
