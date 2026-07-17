/**
 * Regression: the native SunTronic $0D vol-slide advances on the embedded player's
 * per-voice $32/$33 cadence, not every vblank tick.
 *
 * Bug (2026-07-17): the native player applied the $0D volume slide EVERY tick. The
 * real embedded player (kompo04.dis 0x6f4 / myplay9.dis 0x6ea, identical both
 * variants) gates it with a per-voice down-counter: `subq.b #1,$33; bpl skip;
 * move.b $32,$33; add.b $d,$c` — the slide steps only once every ($32+1) ticks.
 * Native ran ~rate× too fast, driving decays to 0 that UADE holds flat (kompo05).
 *
 * The $32 rate operand is VERSION-DEPENDENT and INDEPENDENT of arpShift, so the
 * 0x9a handler width is signature-located in the player code (SunTronicV13.ts):
 *   - 2-byte 0x9a (`11 59 00 0d 11 59`): rate read from the stream (kompo05.src).
 *   - 1-byte 0x9a (`11 59 00 0d 11 7c`): rate hardwired to 1 → step every 2 ticks
 *     (sound2.s — 12,12,13,13,14,14,...).
 *
 * Oracle: per-tick UADE AUD{n}VOL, hold-forwarded, baked by gen-slide-oracle.ts.
 * Each WITNESS voice has an ACTIVE slide and a NON-CONSTANT ramp (so this is the
 * slide path, not the static-clamp path covered by sunTronicVolClamp), and is
 * compared over a best-phase-aligned window (UADE's 1-tick startup lag + the
 * deferred Paula-DMA drift are the same phase axis the corpus probe best-shifts).
 * Reverting to the ungated every-tick slide makes the ramps too steep → the
 * byte-exact window breaks (kompo05 v1 decays 16,14,12,10 instead of holding 14).
 */
import { describe, it, expect } from 'vitest';
import { parseSunTronicV13Score } from '@/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../SunTronicPlayer';
import { paulaAudxVol } from '../SunTronicNativeRender';
import oracle from '../__fixtures__/suntronicVolSlideOracle.json';

interface Witness { voice: number; shift: number; start: number; window: number }
interface SlideModule {
  name: string;
  bytesB64: string;
  ticks: number;
  volSlideRateFromStream: boolean;
  perVoice: number[][]; // [voice][tick] hold-forwarded AUDxVOL, -1 before first write
  witnesses: Witness[];
}
const modules = (oracle as { modules: SlideModule[] }).modules;

describe('SunTronic $0D vol-slide cadence ($32/$33 gate)', () => {
  it('fixture covers both 0x9a operand widths', () => {
    const widths = new Set(modules.map((m) => m.volSlideRateFromStream));
    expect(widths.has(true)).toBe(true); // 2-byte: rate from stream (kompo05)
    expect(widths.has(false)).toBe(true); // 1-byte: rate hardwired to 1 (sound2)
  });

  it('signature detection matches each fixture module', () => {
    for (const m of modules) {
      const score = parseSunTronicV13Score(new Uint8Array(Buffer.from(m.bytesB64, 'base64')));
      expect(score.volSlideRateFromStream, m.name).toBe(m.volSlideRateFromStream);
    }
  });

  for (const m of modules) {
    it(`${m.name}: slide-voice AUDxVOL ramp is byte-exact vs UADE`, () => {
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
        // it is a genuine slide ramp, not a held constant (distinguishes from clamp)
        expect(win.length, `${m.name} v${w.voice} window`).toBeGreaterThanOrEqual(8);
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
