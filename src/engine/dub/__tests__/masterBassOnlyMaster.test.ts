/**
 * The Master BASS fader adds or removes bass on the whole mix - nothing else.
 *
 * Owner, 2026-09-30: "the bass shelf knob makes a huge difference on reverb
 * etc, correct? should it not just add or remove bass?" The deck's Master
 * BASS fader wrote `bassShelfGainDb`, which is ALSO the shelf in front of the
 * echo and spring; measured live, the echo return moved ~6 dB (0.100 ->
 * 0.201 rms) over -6..+6 dB. The fader now writes `masterBassDb`, which only
 * the master insert's low end reads; `bassShelfGainDb` is the echo input's.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_DUB_BUS } from '@/types/dub';
import { DUB_BUS_PARAMS } from '@/midi/performance/parameterRouter';

const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8');

describe('Master BASS', () => {
  it('is its own setting, neutral by default', () => {
    expect(DEFAULT_DUB_BUS.masterBassDb).toBe(0);
    expect(DUB_BUS_PARAMS['dub.masterBassDb']).toMatchObject({ field: 'masterBassDb', min: -12, max: 12 });
  });
  it('the deck fader writes it, not the echo shelf', () => {
    const strip = src('components/dub/DubDeckStrip.tsx');
    expect(strip).toContain('onChange={(v) => setDubBus({ masterBassDb:');
    expect(strip).not.toContain('setDubBus({ bassShelfGainDb:');
  });
  it('the master low end reads masterBassDb; the echo input shelf reads bassShelfGainDb', () => {
    const bus = src('engine/dub/DubBus.ts');
    // Both master-insert derivations (tone + trim) take the master control ...
    expect(bus.match(/Math\.min\(12, m\.masterBassDb \?\? 0\)/g)?.length).toBe(2);
    expect(bus).not.toMatch(/Math\.min\(12, m\.bassShelfGainDb\)\);\n[^\n]*_resolveMasterLowEnd/);
    // ... and the wet bus shelf still takes its own.
    expect(bus).toContain('rampBiquadParam(this.bassShelf.gain, safeBassGain, now);');
    expect(bus).toContain('const safeBassGain = Math.max(-12, Math.min(12, merged.bassShelfGainDb));');
  });
});
