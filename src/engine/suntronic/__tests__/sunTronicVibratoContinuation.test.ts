/**
 * Regression: SunTronic two-clock CIA vibrato model.
 *
 * The golden samples uniformly every 1024 samples (= one golden sample = one
 * `tick()`); the player-step runs on the faster emulated PAL vblank clock
 * (ciaTick ≈ 883.73 samples), so an inner accumulator steps the $24 vibrato phase
 * 1-2× per fire and wraps a row every `speed` steps. See SunTronicPlayer.ts header
 * + tools/suntronic-re/probe-native-vs-golden.ts.
 *
 * Two assertions:
 *  1. Oracle-exact prefix — native tick i (i=1..5) matches the committed UADE
 *     fire-aligned oracle golden[i-1] (native lags one priming fire). Byte-exact in
 *     both period and pitch acc.
 *  2. Native-output snapshot ticks 0..11 — locks the two-clock model's deterministic
 *     output. The single-clock audio-clock model (one step/fire, never doubles)
 *     diverges from tick 6 on (it emits 254; the two-clock model emits the
 *     oracle-exact 252), so this snapshot FAILS on revert to that model. At the
 *     constant-rate joint optimum (883.73) ticks 1..6 are all oracle-exact; the
 *     remaining 12/632 residual (gliders 3 / ballblaser 9) lives at later
 *     double-boundaries and needs UADE's exact per-frame vblank/CIA schedule, not
 *     this swept constant.
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
    // oracle-exact fires 0..5 in ticks 1..6 (251,253,256,258,256,252); the single-clock
    // audio model emits 254 at tick 6 (one step/fire, no double) → revert fails here.
    expect(periods).toEqual([249, 251, 253, 256, 258, 256, 252, 250, 251, 253, 255, 257]);
    // $24 advances by 0x1f40 per step — doubling at tick 6 (bb80 → fa00, two steps).
    expect(vibHex[5]).toBe('bb80');
    expect(vibHex[6]).toBe('fa00');
  });
});
