/**
 * Regression: native SunTronic AUDxVOL matches the Paula 6-bit clamp (UADE oracle).
 *
 * Bug (2026-07-17): the native render used `min(64, outVolume)` for the Paula
 * voice gain (SunTronicNativeRender.ts:261). Real Paula caps AUDxVOL at 63 —
 * `int v2 = v & 64 ? 63 : v & 63;` (audio.c:808) — so a full-scale voice whose
 * $15 (env*voiceVol>>6) reaches 0x40 plays at 63, not 64. Loud voices were one
 * LSB hot vs UADE. (The disasm's speculative masterVolA/B ×3 volume stages were a
 * red herring: probe-mastervol.ts shows the corpus master words are identity and
 * mean native/UADE VOL ratio ≈1.0; the ONLY systematic delta was this 64→63.)
 *
 * Two layers, both fail on revert:
 *  1. `paulaAudxVol` reproduces the hardware rule exactly (unit table).
 *  2. Playing the fixture modules and clamping the player's $15 through
 *     `paulaAudxVol` reproduces the offline UADE AUD{n}VOL byte-exact on WITNESS
 *     voices — voices whose oracle VOL is STATIC (so the still-deferred Paula-DMA
 *     scheduler drift can't contaminate them) and hits 63 (so the clamp is
 *     exercised). Reverting to min(64,v) makes those 63 ticks read 64 → mismatch.
 * Both driver versions are represented (k2 = Version-A, darkness = Main).
 */
import { describe, it, expect } from 'vitest';
import { parseSunTronicV13Score } from '@/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../SunTronicPlayer';
import { paulaAudxVol } from '../SunTronicNativeRender';
import oracle from '../__fixtures__/suntronicVolOracle.json';

interface VolModule {
  name: string;
  bytesB64: string;
  ticks: number;
  perVoice: number[][]; // [voice][tick] hold-forwarded AUDxVOL, -1 before first write
  witnesses: number[];  // voices with static oracle VOL that hits 63
}
const modules = (oracle as { modules: VolModule[] }).modules;

describe('Paula AUDxVOL 6-bit clamp', () => {
  it('paulaAudxVol matches audio.c: v & 64 ? 63 : v & 63', () => {
    // exact hardware rule — the fails-on-revert unit boundary
    expect(paulaAudxVol(64)).toBe(63); // 0x40 full scale caps to 63, NOT 64
    expect(paulaAudxVol(63)).toBe(63);
    expect(paulaAudxVol(42)).toBe(42);
    expect(paulaAudxVol(0)).toBe(0);
    expect(paulaAudxVol(1)).toBe(1);
    expect(paulaAudxVol(65)).toBe(63); // bit 6 set → max
    expect(paulaAudxVol(66)).toBe(63);
    for (let v = 0; v <= 63; v++) expect(paulaAudxVol(v)).toBe(v); // 0..63 pass through
  });

  it('fixture covers both driver versions', () => {
    const shifts = new Set(
      modules.map((m) => parseSunTronicV13Score(new Uint8Array(Buffer.from(m.bytesB64, 'base64'))).arpShift),
    );
    expect(shifts.has(4)).toBe(true); // Main
    expect(shifts.has(3)).toBe(true); // Version-A
  });

  for (const m of modules) {
    it(`${m.name}: witness voice AUDxVOL is byte-exact vs UADE`, () => {
      const data = new Uint8Array(Buffer.from(m.bytesB64, 'base64'));
      const score = parseSunTronicV13Score(data);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const player: any = new (SunTronicPlayer as any)(score);
      const nat: number[][] = [[], [], [], []];
      for (let t = 0; t < m.ticks; t++) {
        const tick = player.stepVblankOnce();
        for (let v = 0; v < 4; v++) nat[v].push(paulaAudxVol(tick.voices[v].outVolume & 0xff));
      }

      expect(m.witnesses.length).toBeGreaterThan(0);
      for (const v of m.witnesses) {
        const oh = m.perVoice[v];
        // clamp exercised: some oracle tick is exactly 63 (min(64,v) would give 64)
        expect(oh.some((x) => x === 63), `${m.name} v${v} exercises 64→63`).toBe(true);
        for (let t = 0; t < m.ticks; t++) {
          if (oh[t] < 0) continue;
          expect(nat[v][t], `${m.name} v${v} t${t} AUDxVOL`).toBe(oh[t]);
        }
      }
    });
  }
});
