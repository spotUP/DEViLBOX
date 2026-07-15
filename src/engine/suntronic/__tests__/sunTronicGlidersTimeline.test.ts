/**
 * SunTronic V1.3 native note-timeline regression (Gate 2) — gliders.src, byte-exact.
 *
 * The native `SunTronicPlayer` reimplements the eagleplayer tick handler (tempo counters
 * $2c/$2d/$2e, GETNEXTNOTE row decode, EFFECTS period/vibrato/freq-slide) so a SunTronic
 * module can be played and edited WITHOUT UADE. This asserts the shipped player is
 * byte-exact against a committed UADE oracle (sunTronicNoteTimeline.golden.json, captured
 * once, NO wasm at test time): every render bucket's chip-RAM voice state ($20 period /
 * $08 pitch acc / $14 flags) must equal the native player's.
 *
 * ── Clock model (fails-on-revert guard) ────────────────────────────────────────────
 * The player fires on the emulated PAL vblank (882.759 samples = 1024*25/29); the golden
 * latches once per 1024-sample bucket. The beat of the two clocks (di = 6.25) puts an
 * EXTRA player-step at bucket round(k*6.25) = 6,13,19,25,… (SunTronicPlayer.tick(),
 * double-position schedule). Revert to a plain floor/round accumulator and the first
 * double misplaces by one bucket → gliders regresses to ≥3 mismatches and this fails.
 *
 * Alignment: the ctor folds UADE's one priming load-tick, so native render bucket i
 * (renderTimeline()[i]) maps to golden[i-1] (warmup 1). The full two-song golden test
 * (sunTronicNoteTimeline.golden.test.ts) stays describe.skip until ballblaser's 5
 * note-CHANGE residuals (t12/t78/t79, a separate GNN/tempo-opcode gap) also reach 0.
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
interface Golden { modules: Record<string, { tick: number; voices: Row[] }[]> }
const golden: Golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));

describe('SunTronic V1.3 native note timeline (gliders.src) vs UADE oracle', () => {
  it('reproduces every oracle render bucket byte-exact', () => {
    const samples = golden.modules['gliders.src'];
    expect(samples.length).toBeGreaterThan(16); // guard: golden not empty/truncated

    const data = new Uint8Array(readFileSync(resolve(CORPUS, 'gliders.src')));
    const score = parseSunTronicV13Score(data);
    const player = new SunTronicPlayer(score, { subsong: 0 });
    const timeline = player.renderTimeline(samples.length);

    const mismatches: string[] = [];
    for (let i = 1; i < samples.length; i++) {
      const g = samples[i - 1].voices;      // warmup 1 (priming load-tick folded in ctor)
      const mv = timeline[i].voices;
      for (let v = 0; v < 4; v++) {
        if (g[v].period !== mv[v].period || g[v].acc !== (mv[v].acc & 0xffff) || g[v].flags !== (mv[v].flags & 0xff)) {
          mismatches.push(
            `t${i} v${v}: golden{p${g[v].period} a${g[v].acc.toString(16)} f${g[v].flags.toString(16)}}` +
            ` native{p${mv[v].period} a${(mv[v].acc & 0xffff).toString(16)} f${(mv[v].flags & 0xff).toString(16)}}`,
          );
        }
      }
    }
    expect(mismatches, mismatches.slice(0, 8).join('\n')).toHaveLength(0);
  });
});
