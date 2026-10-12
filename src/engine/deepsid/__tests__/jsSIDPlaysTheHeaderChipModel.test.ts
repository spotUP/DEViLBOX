/**
 * jsSID plays a tune on the chip model its header names.
 *
 * Bug: the real jsSID library reads the header model into preferred_SID_model but
 * synthesises with SID_model, which starts at 8580 and only setmodel() changes -
 * and DEViLBOX never called it, so every tune (a 6581 Hubbard included) played
 * through the 8580 filter / combined waveforms. Runs the real library file.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { JSSIDEngine } from '../engines/JSSIDEngine';
import { C64SIDEngine } from '../../C64SIDEngine';

const sidFixture = (name: string) =>
  new Uint8Array(readFileSync(join(__dirname, '../../../lib/sid/__tests__/fixtures', name)));

/** The real public/deepsid/jsSID-modified.js, evaluated as the browser script tag would. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let jsSIDModule: any;

beforeAll(() => {
  // Only what the library's constructor touches: a context that can make a script node.
  class StubAudioContext {
    sampleRate = 44100;
    state = 'running';
    createScriptProcessor() { return { connect() {}, disconnect() {}, onaudioprocess: null }; }
  }
  vi.stubGlobal('AudioContext', StubAudioContext);
  const code = readFileSync(join(__dirname, '../../../../public/deepsid/jsSID-modified.js'), 'utf8');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  jsSIDModule = { jsSID: new Function(`${code}\nreturn jsSID;`)() };
});

async function modelPlayed(file: string): Promise<number> {
  const data = sidFixture(file);
  // The model C64SIDEngine hands its backends comes from the one header parser.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chipModel = (new C64SIDEngine(data) as any).metadata.chipModel as '6581' | '8580';
  const engine = new JSSIDEngine(data, { chipModel });
  await engine.init(jsSIDModule);
  return engine.getMetadata().sidModel;
}

describe('jsSID plays the chip model the SID header names', () => {
  it('a 6581 tune (Commando) is synthesised as a 6581', async () => {
    expect(await modelPlayed('Commando.sid')).toBe(6581);
  });
  it('an 8580 tune (Venus Falling SCC Extended) is synthesised as an 8580', async () => {
    expect(await modelPlayed('Venus_Falling_SCC_Extended.sid')).toBe(8580);
  });
});
