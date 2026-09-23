/**
 * "wire the transport buttons correctly to devilbox as well, they are mapped
 * to effects now" (2026-09-24), with "loop = play pattern".
 *
 * The transport row carried DJ deck actions — `play_a`, `cue_b`, `sync_a` — so
 * pressing PLAY on the desk did something to a deck instead of starting the
 * song.
 */
import { describe, it, expect } from 'vitest';
import { DJ_CONTROLLER_PRESETS } from '../djControllerPresets';

const preset = DJ_CONTROLLER_PRESETS.find((p) => p.id === 'behringer-xtouch-compact')!;

/** Notes and labels as the layout descriptor lays the transport block out. */
const TRANSPORT = [
  [49, 'transport.prevPattern', 'REW'],
  [50, 'transport.nextPattern', 'FWD'],
  [51, 'transport.playPattern', 'LOOP'],
  [52, 'transport.record', 'REC'],
  [53, 'transport.stop', 'STOP'],
  [54, 'transport.play', 'PLAY'],
] as const;

const mappingFor = (note: number) =>
  preset.noteMappings.find((m) => m.channel === 0 && m.note === note);

describe('the transport row drives the transport', () => {
  it.each(TRANSPORT)('note %i is %s (%s)', (note, param) => {
    const mapping = mappingFor(note);
    expect(mapping, `note ${note} has no mapping`).toBeDefined();
    expect('param' in mapping!, `note ${note} still carries an action`).toBe(true);
    expect((mapping as { param: string }).param).toBe(param);
  });

  it('LOOP is Play Pattern, not Play Song', () => {
    // The owner's own mapping. Play Song and Play Pattern are two different
    // transports in DEViLBOX and confusing them has cost a session before.
    expect((mappingFor(51) as { param: string }).param).toBe('transport.playPattern');
    expect((mappingFor(54) as { param: string }).param).toBe('transport.play');
  });

  it('no transport button fires a dub move', () => {
    // That is the reported fault: a transport press reaching the effects.
    for (const [note] of TRANSPORT) {
      const mapping = mappingFor(note) as { param?: string } | undefined;
      expect(mapping?.param?.startsWith('dub.'), `note ${note}`).toBeFalsy();
    }
  });

  it('gives each transport button its own job', () => {
    const params = TRANSPORT.map(([note]) => (mappingFor(note) as { param: string }).param);
    expect(new Set(params).size).toBe(TRANSPORT.length);
  });
});
