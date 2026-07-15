/**
 * SunTronic V1.3 native note-timeline regression (Gate 2) — ballblaser.src.
 *
 * ballblaser exercises a code path gliders does not: a position whose voice stream ends
 * in a bare-0x00 hold group (row 15) AND mid-note PITCH-only continuation opcodes. Both
 * pin down the tick-handler's position-wrap ORDER: the eagleplayer decodes ALL rowsPerPos
 * (16) note-stream groups of a position — including the final hold — and only THEN
 * advances to the next position. An earlier native build loaded the next position on the
 * SAME tick it wrapped, so it read only 15 groups and fired the next position's note one
 * row early (t78/t79, plus the 0xda hold at row 15 was dropped) → 5 mismatches. The
 * read-first / advance-after fix in SunTronicPlayer.stepAll() takes that to 1.
 *
 * This asserts the EXACT residual set: exactly one mismatch, at t12 v0. That residual is
 * a sub-fire clock-phase artifact — the golden's k=2 "double" player-step lands at bucket
 * 12 while the double-position schedule (round(2*6.25)=13) lands at bucket 13, so v0's
 * fast vibrato is sampled one fire early for a single bucket (self-corrects at t13). It is
 * NOT reachable without breaking gliders (the true 882.759-crossing schedule regresses
 * gliders to 7/316) and is NOT a CIA-period difference (882.759 is optimal for both). The
 * assertion is a fails-on-revert guard: revert the stepAll read-order fix and t78/t79
 * reappear, breaking the exact-set match.
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

describe('SunTronic V1.3 native note timeline (ballblaser.src) vs UADE oracle', () => {
  it('decodes all 16 position-0 groups (wrap read-order) — only the t12 vib-phase cell remains', () => {
    const samples = golden.modules['ballblaser.src'];
    expect(samples.length).toBeGreaterThan(16); // guard: golden not empty/truncated

    const data = new Uint8Array(readFileSync(resolve(CORPUS, 'ballblaser.src')));
    const score = parseSunTronicV13Score(data);
    const player = new SunTronicPlayer(score, { subsong: 0 });
    const timeline = player.renderTimeline(samples.length);

    const mismatchKeys: string[] = [];
    for (let i = 1; i < samples.length; i++) {
      const g = samples[i - 1].voices;      // warmup 1 (priming load-tick folded in ctor)
      const mv = timeline[i].voices;
      for (let v = 0; v < 4; v++) {
        if (g[v].period !== mv[v].period || g[v].acc !== (mv[v].acc & 0xffff) || g[v].flags !== (mv[v].flags & 0xff)) {
          mismatchKeys.push(`t${i} v${v}`);
        }
      }
    }
    // EXACT residual set. Reverting the stepAll read-order fix reintroduces t78/t79
    // (next-position note fires one row early) → this list changes → test fails.
    expect(mismatchKeys.join(', ')).toBe('t12 v0');
  });
});
