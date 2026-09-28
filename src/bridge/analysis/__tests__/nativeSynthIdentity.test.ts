/**
 * DEViLBOX's own synths say what they are, and the channel profile listens.
 *
 * Channel Intelligence plan, sections 6 and 13: "the synth already knows what
 * it is" and "native synth metadata should beat CED". A TB-303 carried no
 * sample, no timbre parameters the classifier read, and usually a greeting
 * for a name, so its channel's family came from note statistics or nothing.
 */
import { describe, it, expect } from 'vitest';
import { classifyInstrument } from '../ChannelNaming';
import { getChannelProfiles } from '@/engine/dub/channelProfiles';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { Pattern } from '@typedefs/tracker';

const inst = (synthType: string, extra: Partial<InstrumentConfig> = {}) =>
  ({ id: 1, name: 'greetings to all', type: 'synth', synthType, ...extra }) as unknown as InstrumentConfig;

describe('a native synth\'s identity', () => {
  it('makes a 303 and its clones a bass', () => {
    for (const t of ['TB303', 'Buzz3o3', 'Buzz3o3DF']) expect(classifyInstrument(inst(t)).role, t).toBe('bass');
  });

  it('reads the chip channel: noise is a drum, triangle a bass, a pulse says nothing', () => {
    expect(classifyInstrument(inst('ChipSynth', { chipSynth: { channel: 'noise' } } as never)).role).toBe('percussion');
    expect(classifyInstrument(inst('ChipSynth', { chipSynth: { channel: 'triangle' } } as never)).role).toBe('bass');
    expect(classifyInstrument(inst('ChipSynth', { chipSynth: { channel: 'pulse1' } } as never)).role).not.toBe('percussion');
  });

  it('makes a noise-only SID voice a drum, and a noise-plus-pulse voice nothing yet', () => {
    const sid = (w: Record<string, boolean>) => inst('FurnaceC64', { furnace: { chipType: 3, c64: { triOn: false, sawOn: false, pulseOn: false, noiseOn: false, ...w } } } as never);
    expect(classifyInstrument(sid({ noiseOn: true })).role).toBe('percussion');
    expect(classifyInstrument(sid({ noiseOn: true, pulseOn: true })).role).not.toBe('percussion');
  });

  it('reads a Hippel CoSo frequency sequence as the semitones it adds to every note', async () => {
    const { cosoSequenceTranspose, soundingNotes } = await import('../synthEvidence');
    // E5 set-sample takes 9 bytes; then transposes; E0 loops. Median 12.
    expect(cosoSequenceTranspose([-27, 0, 0, 0, 0, 0, 0, 0, 0, 12, 12, 24, -32, 0])).toBe(12);
    // A byte from 0x80 up (not a command) locks a pitch: no offset.
    expect(cosoSequenceTranspose([-116, -32, 0])).toBeNull();
    // E8 sustain ends nothing; the walk stops at E1.
    expect(cosoSequenceTranspose([21, 22, 23, 24, 25, 26, -24, 5, -31])).toBe(24);
    const hc = (fseq: number[]) => ({ id: 1, synthType: 'HippelCoSoSynth', hippelCoso: { fseq } }) as unknown as InstrumentConfig;
    // A cell without an instrument keeps the last one's offset.
    const rows = [{ note: 30, instrument: 1 }, { note: 32, instrument: 0 }, { note: 0, instrument: 0 }];
    expect(soundingNotes(rows, new Map([[1, hc([24, -32, 0])]]))).toEqual([54, 56]);
  });

  it('leaves a synth that states nothing to the other evidence', () => {
    expect(classifyInstrument(inst('PolySynth')).role).toBe('empty');
  });

  it('reaches the channel profile the dub performer targets with', () => {
    // High, leaping notes: the note statistics alone would not call this a
    // bass, so only the synth's own identity can.
    const melody = [61, 73, 66, 78, 63, 75, 68, 80];
    const rows = Array.from({ length: 16 }, (_, r) => ({ note: r % 2 === 0 ? melody[r / 2] : 0, instrument: r % 2 === 0 ? 1 : 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }));
    const pattern = { id: 'p-native', name: '', length: 16, channels: [{ id: 'c0', name: '', rows }] } as unknown as Pattern;
    const profiles = getChannelProfiles(pattern, ['greetings to all'], 4, 16, new Map([[1, inst('TB303')]]));
    expect(profiles.get(0)?.instrumentFamily.value).toBe('bass');
  });
});
