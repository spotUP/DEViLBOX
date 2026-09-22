import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KNOB_BANKS } from '@/midi/knobBanks';

/**
 * "very low volume now for some reason" — with no Maschine connected at all
 * (2026-09-22).
 *
 * `tools/maschine-bridge.ts` keeps knob positions in a software accumulator,
 * because MK2/MK3 knobs are RELATIVE encoders: the bridge never learns a
 * physical position. The array starts at 64, the midpoint, and the bridge
 * announced all eight of those invented values to every browser that
 * connected — so the bridge PROCESS running was enough, with no hardware in
 * the room.
 *
 * Knob 8 is CC 70 + 7 = 77. The Mixer knob bank maps CC 77 to
 * `masterFx.masterVolume`, and 64/127 of the -60..0 dB range is
 * -29.763779527559056 dB, the exact figure found on the master channel. Every
 * page load dropped the mix by 30 dB.
 *
 * (The test lives here, not beside the bridge, because the CI glob is
 * `src/**` — a test under `tools/` would never run.)
 */
const SRC = readFileSync(join(process.cwd(), 'tools/maschine-bridge.ts'), 'utf-8');

const connectHandler = (): string => {
  const start = SRC.indexOf("wss.on('connection'");
  expect(start, 'the connection handler moved').toBeGreaterThan(-1);
  return SRC.slice(start, SRC.indexOf("ws.on('message'", start));
};

describe('the Maschine bridge never announces a position it made up', () => {
  it('the arithmetic that made this hurt: knob 8 is the master volume', () => {
    // KNOB_CC_BASE in MaschineHIDBridge is 70; knob index 7 is therefore CC 77.
    const mixer = KNOB_BANKS['Mixer'];
    const knob8 = mixer.find((k) => k.cc === 77);
    expect(knob8?.param).toBe('masterFx.masterVolume');

    // parameterRouter maps 0..1 onto -60..0 dB, so the invented midpoint is:
    expect(-60 + (64 / 127) * 60).toBeCloseTo(-29.763779527559056, 12);
  });

  it('gates the connect-time snapshot on a knob having actually moved', () => {
    expect(SRC).toContain('let knobsTouched = false;');
    expect(connectHandler()).toContain('if (knobsTouched) {');
  });

  it('sets that flag only from a real device event', () => {
    const routing = SRC.slice(SRC.indexOf('function routeNIHIAEvent'));
    // Two device paths report knobs: relative (NIHIA) and absolute (HID).
    expect((routing.match(/knobsTouched = true;/g) ?? []).length).toBe(2);
    expect(connectHandler()).not.toContain('knobsTouched = true');
  });

  it('sends the snapshot to the browser that connected, not to every tab', () => {
    const handler = connectHandler();
    expect(
      handler,
      'broadcast() reaches every open tab, so one page load moved parameters ' +
        'in all the others'
    ).not.toContain('broadcast(');
    expect(handler).toContain('ws.send(msg)');
  });
});
