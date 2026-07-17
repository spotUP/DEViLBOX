/**
 * Regression: SunTronic native arp reproduces the UADE oracle pitch sequence.
 *
 * Bug (2026-07-17, songs "ready" et al.): the drin note-transpose (arp) table was
 * ZERO-FILLED in the native player (SunTronicPlayer.ts:249, "arp rows unported").
 * drin row 0 is all zeros (no-arp identity), so non-arp voices were byte-exact —
 * but every arp voice collapsed to a monotone. UADE arps voice 1 of "ready"
 * 212→179→143 (root/+3/+7); native held 212. Audible as "one instrument sounds
 * flat and plays the same notes". The old voiceFidelity xcorr metric re-aligns
 * each window so it was BLIND to pitch — which is why the stub shipped.
 *
 * The fix signature-locates drin as plain hunk#1 module data (it is NOT runtime
 * BSS-generated, contrary to an earlier comment) and threads the driver-version
 * arp index shift: Main = ×16 / 256-byte / phase&0x0f, Version-A = ×8 / 128-byte /
 * phase&0x07 (two distinct drivers in the corpus; the player previously hardcoded
 * ×16/&0x0f, wrong for the 60 Version-A modules).
 *
 * This test replays each fixture module's native voice period and compares it to
 * the offline UADE AUD{voice}PER oracle for the WITNESS voices — voices the ported
 * drin materially fixes (baked at fixture-gen time: native localRecall with drin
 * ported ≥0.9 while zeroing drin collapses it ≤0.7). Voices whose motion is pure
 * note-sequence/vibrato (arpSel 0, drin row 0 = zeros) are not witnesses; they
 * would pass trivially and prove nothing.
 *
 * The metric is local-window recall (does each oracle pitch appear within ±4 ticks
 * of native, within 2 period units of vibrato wobble). Local windows tolerate the
 * still-deferred sub-tick Paula-DMA scheduler phase drift while staying strict on
 * arp PITCH. (A fast monotonically-sweeping arp — multi-arp-long v1 — plus one
 * unported deep-arp/note-advance path are separate open residuals, tracked in the
 * NOT-FINISHED stub list, and deliberately not asserted here.)
 *
 * Fails on revert: zero-fill drin (or drop the version-aware shift) and every
 * witness voice goes monotone → distinct-period guard trips AND local recall
 * collapses below threshold (the baked zeroedRecall column is exactly that value).
 */
import { describe, it, expect } from 'vitest';
import { parseSunTronicV13Score } from '@/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../SunTronicPlayer';
import oracle from '../__fixtures__/suntronicArpOracle.json';

interface OracleModule {
  name: string;
  bytesB64: string;
  ticks: number;
  perVoice: number[][]; // [voice][tick] AUD PER, -1 = no write this tick
  witnesses: { v: number; portedRecall: number; zeroedRecall: number }[];
}

const MATCH_THRESHOLD = 0.85; // local-window recall floor (ported values are 1.0)
const WINDOW = 4;             // ± ticks — tolerates sub-tick scheduler phase drift
const TOL = 2;                // ± vibrato wobble in period units

/** forward-fill -1 (no write) with the last real value the Paula channel held */
function holdForward(seq: number[]): number[] {
  const out: number[] = []; let held = -1;
  for (const x of seq) { if (x >= 0) held = x; out.push(held); }
  return out;
}

/** fraction of oracle ticks whose pitch appears within ±WINDOW native ticks (±TOL) */
function localRecall(native: number[], oracleHeld: number[]): number {
  let hit = 0, n = 0;
  for (let c = 0; c < oracleHeld.length; c++) {
    if (oracleHeld[c] < 0) continue; n++;
    let ok = false;
    for (let j = Math.max(0, c - WINDOW); j <= Math.min(native.length - 1, c + WINDOW); j++) {
      if (Math.abs(native[j] - oracleHeld[c]) <= TOL) { ok = true; break; }
    }
    if (ok) hit++;
  }
  return n ? hit / n : 1;
}

const modules = (oracle as { modules: OracleModule[] }).modules;

describe('SunTronic native arp vs UADE oracle (drin port)', () => {
  it('fixture covers both driver versions', () => {
    const shifts = new Set(
      modules.map((m) => parseSunTronicV13Score(new Uint8Array(Buffer.from(m.bytesB64, 'base64'))).arpShift),
    );
    expect(shifts.has(4)).toBe(true); // Main (×16 drin, phase&0x0f)
    expect(shifts.has(3)).toBe(true); // Version-A (×8 drin, phase&0x07)
  });

  for (const m of modules) {
    it(`${m.name}: witness arp voices track the oracle pitch sequence`, () => {
      const data = new Uint8Array(Buffer.from(m.bytesB64, 'base64'));
      const score = parseSunTronicV13Score(data);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const player: any = new (SunTronicPlayer as any)(score);
      const native: number[][] = [[], [], [], []];
      for (let t = 0; t < m.ticks; t++) {
        const tick = player.stepVblankOnce();
        for (let v = 0; v < 4; v++) native[v].push(tick.voices[v].period);
      }

      expect(m.witnesses.length).toBeGreaterThan(0);
      for (const w of m.witnesses) {
        // fixture integrity: a witness must genuinely discriminate — zeroing drin
        // drops its recall below threshold (this is the fails-on-revert boundary).
        expect(w.zeroedRecall, `${m.name} v${w.v} baked zeroedRecall`).toBeLessThan(MATCH_THRESHOLD);
        // ported arp pitches must match the oracle; reverting drin to zero drops
        // this same recall to w.zeroedRecall → the test fails.
        const recall = localRecall(native[w.v], holdForward(m.perVoice[w.v]));
        expect(recall, `${m.name} v${w.v} oracle pitch recall`).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
      }
    });
  }
});
