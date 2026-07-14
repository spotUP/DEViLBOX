/**
 * SunTronic V1.3 native note-timeline regression (Gate 2) — SCAFFOLD, currently skipped.
 *
 * The native `SunTronicPlayer` reimplements the eagleplayer tick handler (3-level tempo
 * counter $2c/$2d/$2e, GETNEXTNOTE row decode, EFFECTS period/vibrato/freq-slide) so a
 * SunTronic module can be played (and later edited) without UADE. This test replays a
 * committed UADE oracle (sunTronicNoteTimeline.golden.json, captured once, no wasm at
 * test time) against the native player: per tick the chip-RAM voice state
 * ($20 period / $08 pitch acc / $14 flags) must equal the native player's.
 *
 * ── WHY SKIPPED (2026-07-14d): two-clock architecture, not yet ported ───────────────
 * Measurement proved SunTronic runs TWO independent interrupt clocks (see the
 * SunTronicPlayer.ts and emit-note-timeline-golden.ts headers):
 *   • EFFECTS / vibrato / period → 50 Hz vblank (~882 samples)
 *   • Note / sequence fetch (handler 0x2660e) → module-tempo CIA (~1026 samples, 43 Hz)
 * The native `tick()` conflates both, so the vibrato phase drifts vs UADE (gliders
 * 12/316, ballblaser 18/316 samples, all at vibrato/slide extremes). The committed
 * golden is also sampled on the note clock, not the vblank clock Paula's $20 is written
 * on. Both must be fixed together before this can assert byte-exactness. Until then it
 * is `describe.skip` and NOT in the test:ci glob — a scaffold, not a passing gate.
 *
 * Alignment (once un-skipped): the emitter samples one golden row per NOTE-handler fire;
 * UADE runs one priming note tick at load that the native ctor folds in, so
 * golden[i+1] maps to native tick i (see nativecheck.ts). Switch to golden[i]==native i
 * after the emitter is moved to per-vblank sampling.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseSunTronicV13Score } from '@/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '@/engine/suntronic/SunTronicPlayer';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../../..');
const CORPUS = resolve(REPO, 'public/data/songs/formats/SUNTronicTunes');
const GOLDEN = resolve(HERE, 'sunTronicNoteTimeline.golden.json');

interface Row { period: number; acc: number; vol: number; flags: number }
interface Golden {
  modules: Record<string, { tick: number; voices: Row[] }[]>;
}

const golden: Golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));

// Skipped: blocked on the two-clock native-player port (see header). Un-skip once the
// player steps EFFECTS on the vblank grid and the emitter samples per vblank.
describe.skip('SunTronic V1.3 native note timeline vs UADE oracle', () => {
  for (const [name, samples] of Object.entries(golden.modules)) {
    it(`${name}: native player reproduces every oracle tick byte-exact`, () => {
      const data = new Uint8Array(readFileSync(resolve(CORPUS, name)));
      const score = parseSunTronicV13Score(data);
      const player = new SunTronicPlayer(score, { subsong: 0 });

      expect(samples.length).toBeGreaterThan(16); // guard against an empty/truncated golden
      const mismatches: string[] = [];
      for (let i = 0; i + 1 < samples.length; i++) {
        const voices = player.tick().voices;   // native tick i
        const g = samples[i + 1].voices;        // golden note-clock offset (see header)
        for (let v = 0; v < 4; v++) {
          const gv = g[v], mv = voices[v];
          if (gv.period !== mv.period || gv.acc !== (mv.acc & 0xffff) || gv.flags !== mv.flags) {
            mismatches.push(
              `t${i} v${v}: golden{p${gv.period} a${gv.acc.toString(16)} f${gv.flags.toString(16)}}` +
              ` native{p${mv.period} a${(mv.acc & 0xffff).toString(16)} f${mv.flags.toString(16)}}`,
            );
          }
        }
      }
      expect(mismatches, mismatches.slice(0, 8).join('\n')).toHaveLength(0);
    });
  }
});
