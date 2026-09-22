import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The bus must learn its own settings without a component being on screen.
 *
 * The only thing that pushed the store's dub settings into the engine was a
 * `useEffect` in DubDeckStrip, with narrower copies in PadGrid and
 * DJSamplerPanel. That made ENGINE STATE depend on a COMPONENT'S RENDER: in a
 * layout where none of the three is mounted — the mobile tracker tree is
 * exactly that — the bus never learned `enabled`, so the master insert never
 * wired and the user's saved settings were never applied.
 *
 * Found 2026-09-22 while fixing the master-insert splice, which was the same
 * defect one layer down. The comment in useDrumPadStore claimed a
 * `usePadEngineDubBus` hook did this; that hook had not existed for some time
 * and the comment was its only remaining reference.
 *
 * Asserted against the source: constructing a DrumPadEngine needs an
 * AudioContext and an AudioWorklet registry, neither of which happy-dom has.
 * What matters is the ownership rule, and that is visible in the source.
 */

const ROOT = resolve(__dirname, '../../../..');
const ENGINE = readFileSync(resolve(ROOT, 'src/engine/drumpad/DrumPadEngine.ts'), 'utf-8');
const STRIP = readFileSync(resolve(ROOT, 'src/components/dub/DubDeckStrip.tsx'), 'utf-8');
const STORE = readFileSync(resolve(ROOT, 'src/stores/useDrumPadStore.ts'), 'utf-8');

describe('the engine owns the settings mirror', () => {
  it('starts it at bootstrap, not on a render', () => {
    expect(ENGINE).toMatch(/this\.startDubSettingsMirror\(\)/);
    expect(ENGINE).toMatch(/private startDubSettingsMirror\(\)/);
  });

  it('applies what is already in the store, without waiting for a change', () => {
    // A session that never touches a dub control must still get its settings.
    const at = ENGINE.indexOf('private startDubSettingsMirror');
    const body = ENGINE.slice(at, ENGINE.indexOf('\n  dispose()', at));
    expect(body).toMatch(/push\(\);/);
    expect(body.indexOf('push();')).toBeLessThan(body.indexOf('.subscribe('));
  });

  it('stops subscribing when the engine is disposed', () => {
    const at = ENGINE.indexOf('dispose(): void {');
    const body = ENGINE.slice(at, at + 400);
    expect(body).toMatch(/_dubMirrorOff/);
    expect(body).toMatch(/_dubMirrorTimer/);
  });

  it('asks the BUS whether a move owns the rate, rather than tracking it in a view', () => {
    expect(ENGINE).toMatch(/isRateOverridden\(\)/);
  });
});

describe('no view may own it', () => {
  it('DubDeckStrip does not push settings to the engine any more', () => {
    expect(STRIP).not.toMatch(/setDubBusSettings\s*\(/);
  });

  it('leaves a comment saying why, so it is not reintroduced', () => {
    expect(STRIP).toMatch(/startDubSettingsMirror/);
  });
});

describe('the store comment describes what actually happens', () => {
  it('no longer CLAIMS a hook that does not exist', () => {
    // `usePadEngineDubBus` was deleted long ago; the comment outlived it and
    // was the only thing still referring to it. The corrected text still names
    // it — to say it is gone — so match the claim as it was actually written
    // rather than the identifier.
    expect(STORE).not.toMatch(/patch \+ persist\. Engine listens via/);
    expect(STORE).toMatch(/no longer exists anywhere in the codebase/);
  });
});

describe('a held rate preset claims the rate', () => {
  const PRESET = readFileSync(resolve(ROOT, 'src/engine/dub/moves/delayPreset.ts'), 'utf-8');

  it('takes the ref-counted override so BPM-sync stands off', () => {
    // Without this the mirror's next BPM tick overwrote a held preset within
    // about a tenth of a second, which is why the strip had to track the
    // active preset in React state.
    expect(PRESET).toMatch(/bus\.beginRateOverride\(\)/);
  });

  it('releases it before restoring the previous rate', () => {
    const at = PRESET.indexOf('dispose: () =>');
    const body = PRESET.slice(at, at + 200);
    expect(body.indexOf('releaseRate()')).toBeLessThan(body.indexOf('setEchoRate(prev)'));
  });
});
