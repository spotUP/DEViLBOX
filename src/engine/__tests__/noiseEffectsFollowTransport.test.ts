/**
 * The vinyl / Tumult noise layers run while a song plays.
 *
 * Owner, 2026-09-30: "the vinyl related master fx's all have way to little
 * hiss, pop, wet, the vinyl crackles etc are not audible". Their worklets
 * synthesize noise only while ToneEngine says it is playing, and only
 * ToneEngine.start()/stop() set that - the song transport never calls them.
 * Measured live: transport playing, engineIsPlaying false. ToneEngine now
 * follows the transport store from the moment it exists.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'src/engine/ToneEngine.ts'), 'utf8');

describe('noise effects follow the transport', () => {
  it('the engine subscribes to the transport when it is created', () => {
    expect(src).toMatch(/ToneEngine\.instance = new ToneEngine\(\);\n\s*ToneEngine\.instance\._followTransport\(\);/);
  });
  it('a change of isPlaying sets the flag and tells the noise effects', () => {
    const body = src.slice(src.indexOf('private _followTransport'), src.indexOf('private _notifyNoiseEffectsPlaying'));
    expect(body).toContain('useTransportStore.subscribe');
    expect(body).toContain('this._isPlaying = playing;');
    expect(body).toContain('this._notifyNoiseEffectsPlaying(playing);');
  });
});
