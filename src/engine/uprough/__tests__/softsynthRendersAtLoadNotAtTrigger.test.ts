/**
 * Right Shift on a generated song: the first row flammed, kick, hat and 808 each starting later than the
 * one before (27, 31, 58 ms measured). Each trigger rendered its note synchronously (9-25 ms) on the
 * trigger path, and the next channel's trigger waited for it. The song load now renders the song's notes
 * (instrumentNoteUsage -> preloadInstruments -> warmUp), so a trigger starts a cached buffer.
 * Real ToneEngine (triggerNoteAttack, the path the replayer takes) and Web Audio on a context that renders nothing.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { Pattern } from '@/types';
import { voiceDefaults } from '../softsynthVoice';
import { getSoftsynthVoice } from '../voiceRegistry';
import { resetSoftsynthRenderCount, softsynthRenderCount } from '../UpRoughSoftsynth';
import { instrumentChannelUsage, instrumentNoteUsage } from '@/lib/song/instrumentChannelUsage';

type Engine = {
  preloadInstruments: (
    c: InstrumentConfig[],
    usage?: ReadonlyMap<number, ReadonlySet<number>>,
    notes?: ReadonlyMap<number, ReadonlySet<number>>,
  ) => Promise<void>;
  getInstrument: (id: number, c: InstrumentConfig, ch?: number) => { output: { context: Record<string, unknown> } };
  triggerNoteAttack: (id: number, note: string, time: number, vel: number, c: InstrumentConfig, period?: number, accent?: boolean, slide?: boolean, channel?: number) => void;
};
let engine: Engine;

beforeAll(async () => {
  installRealWebAudio();
  await import('@/engine/registry/sdk');
  const { getToneEngine } = await import('../../ToneEngine');
  engine = getToneEngine() as unknown as Engine;
  (engine as unknown as { isContextActuallyRunning: () => boolean }).isContextActuallyRunning = () => true;
}, 60000);

const cfg = (id: number, voice: string): InstrumentConfig => ({
  id, name: voice, type: 'synth', synthType: 'UpRoughSoftsynth', effects: [], volume: -6, pan: 0,
  upRoughSoftsynth: { voice, params: { ...voiceDefaults(getSoftsynthVoice(voice)!) }, seed: 7 },
} as unknown as InstrumentConfig);

/** One 4-row pattern: the 808 plays C-3 (XM 37) then D#3 (XM 40) on channel 0, from the channel default. */
const pattern = (instrumentId: number): Pattern => ({
  id: 'p0', name: 'p0', length: 4,
  channels: [{
    id: 'c0', name: 'c0', instrumentId, muted: false, solo: false, collapsed: false, volume: 100, pan: 0, effects: [],
    rows: [
      { note: 37, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 },
      { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 },
      { note: 40, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 },
      { note: 97, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 },
    ],
  }],
} as unknown as Pattern);

describe('a softsynth song plays its first row without rendering on the trigger path', () => {
  it('the load renders the song notes, and triggering them renders nothing', async () => {
    const config = cfg(940, 'bass808');
    const patterns = [pattern(config.id)];
    resetSoftsynthRenderCount();
    await engine.preloadInstruments([config], instrumentChannelUsage(patterns), instrumentNoteUsage(patterns));
    expect(softsynthRenderCount(), 'the load rendered both song notes').toBe(2);

    resetSoftsynthRenderCount();
    const ctx = engine.getInstrument(config.id, config, 0).output.context as unknown as { currentTime: number };
    engine.triggerNoteAttack(config.id, 'C3', ctx.currentTime + 0.01, 1, config, undefined, false, false, 0);
    engine.triggerNoteAttack(config.id, 'D#3', ctx.currentTime + 0.02, 1, config, undefined, false, false, 0);
    expect(softsynthRenderCount(), 'no render ran on the trigger path').toBe(0);
  });
});
