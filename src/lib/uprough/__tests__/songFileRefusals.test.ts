import { describe, expect, it } from 'vitest';
import fixture from './fixtures/e6.uprough-song.json';
import { insertKey } from '@/engine/uprough/effects/insertEffects';
import { parseSongFile, songFileToSong, songToSongFile, type SongFileDoc, type UpRoughSong } from '../songFile';

const fresh = (): UpRoughSong => songFileToSong(parseSongFile(structuredClone(fixture)));
void (null as unknown as SongFileDoc);

describe('song file refusals', () => {
  it('refuses a non-softsynth instrument by name', () => {
    const s = fresh();
    s.instruments[2] = { ...s.instruments[2]!, synthType: 'Synth', upRoughSoftsynth: undefined };
    expect(() => songToSongFile(s)).toThrow(/Instrument 3 "snare_ghost" is Synth, not UpRoughSoftsynth\. Up Rough songs play only softsynth voices: replace or remove it before export\./);
  });

  it('refuses an insert effect that is on', () => {
    const s = fresh();
    const cfg = s.instruments[0]!.upRoughSoftsynth!;
    cfg.params[insertKey('tapeSaturation')] = 1;
    expect(() => songToSongFile(s)).toThrow(/Instrument 1 "kick" has its Saturation insert on\. Inserts are not part of the Up Rough mix: move it to the drums bus or switch it off\./);
  });

  it('refuses notes in a channel that is not a lane', () => {
    const s = fresh();
    const ch = s.patterns[0]!.channels[0]!;
    s.patterns[0]!.channels.push({ ...structuredClone(ch), id: 'extra', name: 'Extra' });
    expect(() => songToSongFile(s)).toThrow(/Channel 12 "Extra" has notes but is not an Up Rough lane\. Move them to a lane or clear the channel\./);
  });

  it('refuses a foreign or newer file', () => {
    expect(() => parseSongFile('{"format":"x"}')).toThrow(/Not an Up Rough song file/);
    expect(() => parseSongFile({ ...structuredClone(fixture), schema: 2 })).toThrow(/newer than this reader/);
  });
});
