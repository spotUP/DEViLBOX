/**
 * A synth instrument of a dedicated-engine song is not flattened to an empty
 * Sampler: with no PCM it keeps its native keyboard voice, so the keyboard
 * sounds. (Codified after Fred Editor: the import router flattened EVERY
 * instrument to 'Sampler'; those without PCM became an EmptySampler and the
 * keyboard went silent. Same fault hit SoundMon, Digital Mugician, Future
 * Player.)
 *
 * Table-driven over real corpus songs. `silent` counts the instruments that
 * stay a PCM-less Sampler because their format has NO keyboard voice and no
 * PCM for them (whole-song-only engines, or empty slots): nothing to play,
 * nothing faked. `voices` is the count that must keep a synth voice.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseModuleToSong } from '../parseModuleToSong';
import { dedicatedEngineSynthType, KEYBOARD_VOICE_SYNTHS } from '../parsers/withFallback';

const hasPcm = (i: { sample?: { audioBuffer?: ArrayBuffer; url?: string } | null }) =>
  (i.sample?.audioBuffer?.byteLength ?? 0) > 0 || !!i.sample?.url;

// file, format, instruments that keep a voice, PCM-less instruments left silent
const CORPUS: Array<[string, string, number, number]> = [
  ['bomb jack.fred', 'Fred Editor', 6, 0],
  ['fuzzball-title.fred', 'Fred Editor', 21, 3],
  ['rebels.fred', 'Fred Editor', 9, 0],
  ['antidust.bp3', 'SoundMon 3', 2, 10],
  ['flight.dmu', 'Digital Mugician', 3, 0],
  ['hybris.fp', 'Future Player', 9, 0],
  ['imploder_drums.fp', 'Future Player', 8, 0],
  ['baseheads.ma', 'Music Assembler (no voice)', 0, 5],
  ['doxtro3.dss', 'Digital Sound Studio (no voice)', 0, 13],
  ['dynablaster.ast', 'Actionamics (no voice)', 0, 4],
  ['space_sound.syn', 'Synthesis (no voice)', 0, 1],
  ['crusaders1.dm', 'Delta Music 1', 0, 13],
];

describe('dedicated-engine synth instruments keep a keyboard voice', () => {
  it.each(CORPUS)('%s (%s): %i voices, %i silent', async (name, _fmt, voices, silent) => {
    const b = readFileSync(resolve(import.meta.dirname, '../../../../public/data/songs/formats', name));
    const song = await parseModuleToSong(new File([b], name));
    const noPcm = song.instruments.filter((i) => !hasPcm(i));
    const emptySamplers = noPcm.filter((i) => i.synthType === 'Sampler');
    const kept = noPcm.filter((i) => KEYBOARD_VOICE_SYNTHS.has(i.synthType) || i.synthType === 'FredSynth');
    expect(emptySamplers.length).toBe(silent);
    expect(kept.length).toBe(voices);
  });

  it('flattening rule: PCM -> Sampler, no PCM + voice -> keeps voice, no PCM + no voice -> Sampler', () => {
    const pcm = { audioBuffer: new ArrayBuffer(8) };
    // A synth the replayer has a preview voice for keeps it even when the parser rendered PCM for it.
    expect(dedicatedEngineSynthType({ synthType: 'SoundMonSynth', sample: pcm })).toBe('SoundMonSynth');
    expect(dedicatedEngineSynthType({ synthType: 'DigMugSynth', sample: pcm })).toBe('Sampler');
    expect(dedicatedEngineSynthType({ synthType: 'SoundMonSynth' })).toBe('SoundMonSynth');
    expect(dedicatedEngineSynthType({ synthType: 'DigMugSynth', sample: { audioBuffer: new ArrayBuffer(0) } })).toBe('DigMugSynth');
    expect(dedicatedEngineSynthType({ synthType: 'DssWasmSynth' })).toBe('Sampler');
    expect(dedicatedEngineSynthType({ synthType: 'FredSynth' })).toBe('FredSynth');
  });
});
