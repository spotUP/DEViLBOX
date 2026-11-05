/**
 * Sound Factory live instrument edits (SoundFactory2.wasm): a parameter set by the DefineInstr record's
 * file offset (the parser's soundFactoryInstrument.recordOffset) must land on that record in the copy the
 * voices play from, and the replayer's instrument list must match the parser's (one entry per record,
 * not one per GoSub visit).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseSoundFactoryWithEffects } from '../SoundFactoryParser';

const ROOT = resolve(__dirname, '../../../../..');
const file = new Uint8Array(readFileSync(resolve(ROOT, 'public/data/songs/formats/goldrunner.psf')));

async function loadModule(): Promise<any> {
  const src = readFileSync(resolve(ROOT, 'public/soundfactory/SoundFactory2.js'), 'utf8');
  // The build targets a worker (ENVIRONMENT=worker): give it the globals a worker has.
  const factory = new Function('self', `${src}\n;return createSoundFactory;`)({ location: { href: 'file:///sf/' } });
  return factory({ wasmBinary: readFileSync(resolve(ROOT, 'public/soundfactory/SoundFactory2.wasm')) });
}

function cstr(m: any, s: string): number {
  const p = m._malloc(s.length + 1);
  m.stringToUTF8?.(s, p, s.length + 1);
  if (!m.stringToUTF8) { for (let i = 0; i < s.length; i++) m.HEAPU8[p + i] = s.charCodeAt(i); m.HEAPU8[p + s.length] = 0; }
  return p;
}

describe('Sound Factory WASM live instrument edit by record offset', () => {
  it('lists one instrument per DefineInstr record and updates the playing copy by offset', async () => {
    const song = parseSoundFactoryWithEffects(file, 'goldrunner.psf')!.song;
    const offsets = song.instruments.map((i: any) => i.metadata.soundFactoryInstrument.recordOffset as number);
    const m = await loadModule();
    const data = m._malloc(file.length);
    m.HEAPU8.set(file, data);
    const h = m._sf_create(data, file.length, 44100);
    expect(h).not.toBe(0);
    m._sf_select_subsong(h, 0);

    expect(m._sf_get_instrument_count(h)).toBe(offsets.length);

    const param = cstr(m, 'vibratoAmount');
    for (const off of offsets) {
      const before = m._sf_get_playing_instrument_param_at_offset(h, off, param);
      const value = (before + 7) % 256;
      expect(m._sf_set_instrument_param_at_offset(h, off, param, value)).toBeGreaterThanOrEqual(0);
      expect(m._sf_get_playing_instrument_param_at_offset(h, off, param)).toBe(value);
    }
    // an offset that starts no record changes nothing
    expect(m._sf_set_instrument_param_at_offset(h, offsets[0] + 1, param, 9)).toBe(-1);
    m._sf_destroy(h);
  });
});
