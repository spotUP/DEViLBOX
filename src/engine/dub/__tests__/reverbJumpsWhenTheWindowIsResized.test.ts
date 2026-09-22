/**
 * "i got a lot more reverb etc all of a sudden" — reported 2026-09-22.
 *
 * The user opened dev tools mid-performance. The window crossed the 768 px
 * breakpoint at TrackerView.tsx, React swapped the desktop tree for
 * MobileTrackerView, and DubDeckStrip unmounted. The console caught the
 * consequence at that exact instant:
 *
 *   [DubBusCtrl] unwireMasterInsert
 *   [DubBusSnap] pre-unwireMasterInsert | enabled=true input=1.000 return_=0.750
 *
 * The master insert — bass shelf + mid scoop + stereo width, spliced between
 * `masterEffectsInput` and `blepInput` — came out of the signal path while the
 * bus stayed ENABLED with the wet return at 0.750. The dry mix lost its master
 * EQ, the wet path did not change, and the balance shifted towards the wet:
 * more reverb, from a window resize.
 *
 * The invariant, in the audio layer's terms: the master insert is spliced if
 * and only if the dub bus is ENABLED. Mount, unmount, remount, breakpoint,
 * route change and hot reload must not appear anywhere in that condition. It
 * was violated because the splice was created and destroyed by a `useEffect`
 * in DubDeckStrip, so its lifetime was a COMPONENT's lifetime.
 *
 * The fix moves ownership out of React: DrumPadEngine registers the endpoints
 * once at bootstrap, and DubBus re-derives the graph from its own `enabled`
 * flag. Making the effect merely resilient (keep the effect, drop the
 * teardown) would leave a React component owning an audio graph edge;
 * debouncing the teardown would only shorten the window in which a layout
 * change is audible.
 *
 * No test in this repo constructs a real DubBus (Tone's AudioContext cannot be
 * spun up in happy-dom — no AudioWorklet registry), so the decision logic is
 * exercised on a prototype-only instance with the two graph calls stubbed, and
 * the ownership half is asserted on the source, same as its siblings.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DubBus } from '../DubBus';

/** Fields and methods the sync path touches, reached without a live context. */
type BusProbe = {
  enabled: boolean;
  masterInsertPoints: { source: unknown; dest: unknown } | null;
  wireMasterInsert: (source: unknown, dest: unknown) => Promise<void>;
  unwireMasterInsert: () => void;
  registerMasterInsertPoint: (source: unknown, dest: unknown) => void;
  _syncMasterInsertToEnabled: () => void;
};

/**
 * A DubBus with no audio graph behind it. `Object.create` skips the
 * constructor, so nothing tries to build biquads or load worklets; the two
 * methods that would touch the graph are shadowed on the instance and record
 * what they were asked to do.
 */
function busProbe(enabled: boolean): { bus: BusProbe; calls: string[] } {
  const bus = Object.create(DubBus.prototype) as BusProbe;
  const calls: string[] = [];
  bus.enabled = enabled;
  bus.masterInsertPoints = null;
  bus.wireMasterInsert = async () => { calls.push('wire'); };
  bus.unwireMasterInsert = () => { calls.push('unwire'); };
  return { bus, calls };
}

const SOURCE = readFileSync(resolve(__dirname, '..', 'DubBus.ts'), 'utf8');
const STRIP = readFileSync(
  resolve(__dirname, '..', '..', '..', 'components', 'dub', 'DubDeckStrip.tsx'),
  'utf8',
);
const ENGINE = readFileSync(
  resolve(__dirname, '..', '..', 'drumpad', 'DrumPadEngine.ts'),
  'utf8',
);

describe('the mix does not suddenly get more reverb when the window is resized', () => {
  it('keeps the master EQ in the mix when the dub deck leaves the screen', () => {
    // A view switch is not an event the bus can even see any more. The only
    // thing that re-derives the graph is a sync, and a sync while the bus is
    // enabled can never remove the insert — however many times it runs.
    const { bus, calls } = busProbe(true);
    bus.registerMasterInsertPoint({ id: 'masterEffectsInput' }, { id: 'blepInput' });
    expect(calls).toEqual(['wire']);

    bus._syncMasterInsertToEnabled();
    bus._syncMasterInsertToEnabled();
    expect(calls.filter((c) => c === 'unwire')).toEqual([]);
  });

  it('takes the master EQ out only when the performer switches the bus off', () => {
    const { bus, calls } = busProbe(true);
    bus.registerMasterInsertPoint({ id: 'masterEffectsInput' }, { id: 'blepInput' });
    calls.length = 0;

    bus.enabled = false;
    bus._syncMasterInsertToEnabled();
    expect(calls).toEqual(['unwire']);

    bus.enabled = true;
    bus._syncMasterInsertToEnabled();
    expect(calls).toEqual(['unwire', 'wire']);
  });

  it('does not splice anything into a bus that is switched off', () => {
    const { bus, calls } = busProbe(false);
    bus.registerMasterInsertPoint({ id: 'masterEffectsInput' }, { id: 'blepInput' });
    expect(calls).not.toContain('wire');
  });

  it('does nothing at all until the engine says where the insert goes', () => {
    const { bus, calls } = busProbe(true);
    bus._syncMasterInsertToEnabled();
    expect(calls).toEqual([]);
  });

  it('follows the bus from the one place the enable flag is written', () => {
    // The flip inside _applySettings is the single place `enabled` changes as
    // a result of the user's switch; the sync has to hang off it, or the
    // graph and the flag drift apart again.
    const flip = SOURCE.indexOf('this.enabled = settings.enabled;');
    expect(flip, 'enabled flip not found in _applySettings').toBeGreaterThan(-1);
    const sync = SOURCE.indexOf('this._syncMasterInsertToEnabled();', flip);
    expect(sync).toBeGreaterThan(flip);
    // Right after the flip, not buried at the far end of the method.
    expect(SOURCE.slice(flip, sync)).not.toContain('\n  }\n');
  });

  it('leaves no view able to pull the master EQ out when it unmounts', () => {
    // The actual regression. A component that can call either of these owns
    // the splice, and a component's lifetime is a layout concern.
    const owners = STRIP.match(/\b(un)?wireMasterInsert\s*\(/g) ?? [];
    expect(owners, 'DubDeckStrip is wiring the master insert again').toEqual([]);
  });

  it('is reached from engine bootstrap, not from a mounted view', () => {
    expect(ENGINE).toContain('this.dubBus.registerMasterInsertPoint(');
    // The endpoints are ToneEngine's master merge point and its BLEP insert,
    // which is what makes BASS/MID/WIDTH shape the whole mix.
    expect(ENGINE).toContain('getNativeAudioNode(tone.masterEffectsInput as any)');
    expect(ENGINE).toContain('getNativeAudioNode(tone.blepInput as any)');
  });
});
