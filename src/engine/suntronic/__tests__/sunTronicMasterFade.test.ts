/**
 * Regression: the native SunTronic player folds the global master volume ($a71)
 * into every voice's AUDxVOL, and ramps it via the 0x92/0x93 fade engine.
 *
 * Bug (2026-07-17): opcodes 0x92 (master vol) and 0x93 (master fade speed+rate)
 * were decoded as no-ops, so $a71 was never modelled. The embedded player folds it:
 * `$15 = env*$c>>6 * $a71>>6 * $a72>>6` (@0x628). $a71/$a72 init 0x40 (identity) —
 * which is why the corpus matched with master unmodelled — but play11 sets $a71=0
 * (0x92) then fades it up on the counter+signed-add+clamp engine @0x440 (0x93):
 *   tst.b $a6e; beq; subq.b #1,$a6f; bpl; move.b $a70,$a6f;
 *   add.b $a6e,$a71; bmi(clr $a6e,$a71); cmpi.b #$41,$a71; bmi; clr $a6e; move #$40,$a71
 * so play11 v0's AUDxVOL ramps 0→1→2 ($a71 measured via A6+0xa71: 0,1,1,2,2,3,4,...;
 * $a72 stays 0x40). Native previously played v0 flat (the un-scaled envelope
 * 64,40,20,10) — a loud drone where UADE fades in from silence.
 *
 * Oracle: per-tick UADE AUD0VOL, hold-forwarded, baked by gen-master-fade-oracle.ts.
 * The witness voice has a NON-CONSTANT master ramp (this is the master-fold path,
 * not the static envelope), compared over a best-phase-aligned window (UADE's
 * 1-tick startup lag + the deferred Paula-DMA drift are the same phase axis the
 * corpus probe best-shifts). Reverting the fade to no-ops leaves master at 0x40
 * (identity) → native plays the un-faded envelope and the ramp window breaks.
 */
import { describe, it, expect } from 'vitest';
import { parseSunTronicV13Score } from '@/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../SunTronicPlayer';
import { paulaAudxVol } from '../SunTronicNativeRender';
import oracle from '../__fixtures__/suntronicMasterFadeOracle.json';

interface Witness { voice: number; shift: number; start: number; window: number }
interface FadeModule {
  name: string;
  bytesB64: string;
  ticks: number;
  perVoice: number[][]; // [voice][tick] hold-forwarded AUDxVOL, -1 before first write
  witnesses: Witness[];
}
const modules = (oracle as { modules: FadeModule[] }).modules;

describe('SunTronic master-volume fade (0x92/0x93 $a71 fold)', () => {
  it('fixture has at least one master-fade witness', () => {
    expect(modules.some((m) => m.witnesses.length > 0)).toBe(true);
  });

  for (const m of modules) {
    it(`${m.name}: master-fade AUDxVOL ramp is byte-exact vs UADE`, () => {
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
      for (const w of m.witnesses) {
        const win = nat[w.voice].slice(w.start, w.start + w.window);
        // a genuine master ramp, not a held constant (distinguishes from identity)
        expect(win.length, `${m.name} v${w.voice} window`).toBeGreaterThanOrEqual(12);
        expect(new Set(win).size, `${m.name} v${w.voice} non-constant ramp`).toBeGreaterThan(1);
        for (let i = 0; i < w.window; i++) {
          const t = w.start + i;
          expect(nat[w.voice][t], `${m.name} v${w.voice} t${t} (oracle t${t + w.shift})`).toBe(
            m.perVoice[w.voice][t + w.shift],
          );
        }
      }
    });
  }
});
