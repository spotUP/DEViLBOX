/**
 * The per-channel native synth set (one WASM instance per tracker channel, so
 * the channel strip reaches it) must be disjoint from the pooled Amiga
 * per-note types and the whole-song players, every member must be a synth the
 * registry can build, and a song load must create exactly the instances the
 * song uses: TB303 on channels 3 and 5 gets two, FCSynth stays shared, a
 * live-voice channel never gets a preloaded instance.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SynthRegistry } from '@/engine/registry/SynthRegistry';
import '@/engine/registry/builtin';
import '@/engine/registry/sdk';
import { PER_CHANNEL_NATIVE_SYNTH_TYPES, POOLED_NATIVE_SYNTH_TYPES, perChannelInstanceChannels } from '../perChannelNativeSynths';
import { WHOLE_SONG_SYNTH_TYPES } from '../wholeSongSynths';

describe('per-channel native synth types', () => {
  it('are disjoint from the pooled per-note types and the whole-song players', () => {
    const overlap = [...PER_CHANNEL_NATIVE_SYNTH_TYPES].filter((t) => POOLED_NATIVE_SYNTH_TYPES.has(t) || WHOLE_SONG_SYNTH_TYPES.has(t));
    expect(overlap).toEqual([]);
    expect([...POOLED_NATIVE_SYNTH_TYPES].filter((t) => WHOLE_SONG_SYNTH_TYPES.has(t))).toEqual([]);
  });
  it('every member is a synth type the engine can build: a getInstrument switch case or a registry entry', () => {
    // The native synths outside the SDK registry are built by the big
    // `switch (synthType)` in ToneEngine.getInstrument; a member neither
    // branch builds would silently get the Tone.js fallback.
    const engineSource = readFileSync(join(__dirname, '..', 'ToneEngine.ts'), 'utf8');
    const unknown = [...PER_CHANNEL_NATIVE_SYNTH_TYPES, ...POOLED_NATIVE_SYNTH_TYPES]
      .filter((t) => !SynthRegistry.knows(t) && !engineSource.includes(`case '${t}':`));
    expect(unknown).toEqual([]);
  });
  it('never contains a MAME chip: those are shared by the MAME branch of getInstrument', () => {
    expect([...PER_CHANNEL_NATIVE_SYNTH_TYPES].filter((t) => t.startsWith('MAME') || ['CZ101', 'CEM3394', 'SCSP'].includes(t))).toEqual([]);
  });
});

describe('perChannelInstanceChannels', () => {
  it('a per-channel type gets one instance per used tracker channel', () => {
    expect(perChannelInstanceChannels('TB303', new Set([5, 3]))).toEqual([3, 5]);
  });
  it('a pooled or whole-song type keeps the single shared instance whatever the usage', () => {
    expect(perChannelInstanceChannels('FCSynth', new Set([3]))).toEqual([undefined]);
    expect(perChannelInstanceChannels('HivelySynth', new Set([0, 1]))).toEqual([undefined]);
  });
  it('no usage, an empty set, or only live-voice channels fall back to the shared instance', () => {
    expect(perChannelInstanceChannels('TB303', undefined)).toEqual([undefined]);
    expect(perChannelInstanceChannels('TB303', new Set())).toEqual([undefined]);
    expect(perChannelInstanceChannels('TB303', new Set([100, 101]))).toEqual([undefined]);
  });
});
