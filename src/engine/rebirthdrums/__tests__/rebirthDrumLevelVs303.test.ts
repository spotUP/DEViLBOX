/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 *
 * Level of the re-rebirth drums next to the re-rebirth 303 through the real factory (same instrument volume,
 * the registry's volume offset applied by InstrumentFactory): kick peaks stay within 4 dB and hat peaks within 10 dB of the 303 (hats are inherently quieter bursts;
 * before the fix the kicks sat 7 and 12 dB under and the 808 hat 18 dB under).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';
import { setDevilboxAudioContext } from '@/utils/audio-context';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { DevilboxSynth } from '@/types/synth';

const SR = 44100;
type Trig = { triggerAttack: (n: string | number, t: number, v: number) => void };

async function peakRms(synthType: string, note: string): Promise<{ peakDb: number; rmsDb: number }> {
  const ctx = new OfflineAudioContext(1, Math.floor(SR * 1.2), SR);
  setDevilboxAudioContext(ctx as unknown as AudioContext);
  await import('../../registry/builtin/rebirth303');
  await import('../../registry/builtin/rebirth808');
  await import('../../registry/builtin/rebirth909');
  const { InstrumentFactory } = await import('../../InstrumentFactory');
  const inst = InstrumentFactory.createInstrument({
    id: 1, name: 'rb', type: 'synth', synthType, volume: -6, pan: 0, effects: [],
  } as unknown as InstrumentConfig);
  (inst as unknown as DevilboxSynth).output.connect(ctx.destination);
  (inst as unknown as Trig).triggerAttack(note, 0.05, 1);
  const d = (await ctx.startRendering()).getChannelData(0);
  let pk = 0, sq = 0;
  for (const s of d) { pk = Math.max(pk, Math.abs(s)); sq += s * s; }
  return { peakDb: 20 * Math.log10(pk || 1e-9), rmsDb: 10 * Math.log10(sq / d.length || 1e-18) };
}

describe('re-rebirth drum level next to the 303', () => {
  beforeAll(() => { installRealWebAudio(); });

  it('808 / 909 kick and hat peaks sit close to the 303', async () => {
    const bass = await peakRms('ReRebirth303', 'C3');
    const rows: Record<string, number> = {};
    for (const [kit, note] of [['808', 'C2'], ['909', 'C2'], ['808', 'F#2'], ['909', 'F#2']] as const) {
      const r = await peakRms(`ReRebirth${kit}`, note);
      rows[`${kit}/${note}`] = r.peakDb;
      console.log(`LEVEL ${kit} ${note} peak ${r.peakDb.toFixed(1)} rms ${r.rmsDb.toFixed(1)}`);
    }
    console.log(`LEVEL 303 C3 peak ${bass.peakDb.toFixed(1)} rms ${bass.rmsDb.toFixed(1)}`);
    for (const [k, v] of Object.entries(rows)) expect(Math.abs(v - bass.peakDb), k).toBeLessThan(k.endsWith('C2') ? 4 : 10);
  });
});
