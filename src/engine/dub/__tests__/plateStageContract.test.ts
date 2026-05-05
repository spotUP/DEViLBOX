/**
 * Source-contract test for the DubBus plate-stage insert (commit
 * 7460ebb12, UI landed in 7fb13972e).
 *
 * The plate-stage is a lazily-instantiated WASM post-stage: when
 * `plateStage='off'` nothing is created (zero WASM overhead), and
 * swapping between types crossfades to the new plate before the old
 * one is retired. Violating either invariant leaks WASM instances or
 * causes an audible cut on engine switches.
 *
 * happy-dom can't load a WASM worklet to assert this at runtime, so
 * we grep the DubBus source for the key invariants. Same pattern as
 * the other contract tests in this folder (chainSwapGuard,
 * oscBassHeadroom, reverseEchoRetryGuard).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../DubBus.ts'),
  'utf8',
);

describe('DubBus plate-stage — wiring invariants', () => {
  it('lazy-instantiates: constructor only installs when plateStage !== "off"', () => {
    // A constructor that unconditionally creates the plate would
    // defeat the zero-cost-when-off guarantee. Look for the
    // settings-guarded install call in the constructor path.
    expect(SOURCE).toMatch(/if \(this\.settings\.plateStage !== 'off'\)\s*\{\s*[^}]*_installPlateStage/);
  });

  it('teardown disposes both plate + send gain', () => {
    const teardownIdx = SOURCE.indexOf('private _teardownPlateStage');
    expect(teardownIdx).toBeGreaterThan(-1);
    const teardownBody = SOURCE.slice(teardownIdx, teardownIdx + 600);
    expect(teardownBody, 'should dispose the plate node').toMatch(/this\.plateStage\.dispose\(\)/);
    expect(teardownBody, 'should disconnect the send gain').toMatch(/this\.plateSend\.disconnect\(\)/);
    expect(teardownBody, 'should null the plate ref').toMatch(/this\.plateStage = null/);
    expect(teardownBody, 'should null the send ref').toMatch(/this\.plateSend = null/);
  });

  it('setPlateStage builds the new plate before retiring the old one', () => {
    const setterIdx = SOURCE.indexOf('setPlateStage(stage:');
    expect(setterIdx).toBeGreaterThan(-1);
    const setterBody = SOURCE.slice(setterIdx, setterIdx + 2200);
    const swapBranchMatch = setterBody.match(/const nextPlateNodes = this\._createPlateStageNodes\(stage, 0\);[\s\S]*?_schedulePlateStageTeardown\(currentPlate, currentSend, fadeSec\);/);
    expect(swapBranchMatch, 'expected swap branch to create new plate and retire old one').not.toBeNull();
    const swapBranch = swapBranchMatch![0];
    const createIdx = swapBranch.indexOf('_createPlateStageNodes(stage, 0)');
    const retireIdx = swapBranch.indexOf('_schedulePlateStageTeardown(currentPlate, currentSend, fadeSec)');
    expect(createIdx, 'expected new plate creation in setPlateStage').toBeGreaterThan(-1);
    expect(retireIdx, 'expected delayed teardown in setPlateStage').toBeGreaterThan(-1);
    expect(createIdx).toBeLessThan(retireIdx);
  });

  it('switching plateStage off ramps the existing send down before teardown', () => {
    const setterIdx = SOURCE.indexOf('setPlateStage(stage:');
    expect(setterIdx).toBeGreaterThan(-1);
    const setterBody = SOURCE.slice(setterIdx, setterIdx + 2200);
    expect(setterBody).toMatch(/if \(stage === 'off'\)[\s\S]*linearRampToValueAtTime\(0, now \+ fadeSec\)/);
    expect(setterBody).toContain('_schedulePlateStageTeardown(currentPlate, currentSend, fadeSec)');
  });

  it('dispose() tears down the plate-stage alongside spring + echo', () => {
    // The engine's top-level dispose must reach _teardownPlateStage
    // so page navigation / HMR reload doesn't leak the WASM worklet.
    // Look for the dispose method and confirm _teardownPlateStage is
    // called there.
    const disposeIdx = SOURCE.lastIndexOf('this.spring.dispose()');
    expect(disposeIdx).toBeGreaterThan(-1);
    const disposeTail = SOURCE.slice(disposeIdx, disposeIdx + 400);
    expect(disposeTail, 'dispose() must tear down the plate-stage').toMatch(/_teardownPlateStage/);
  });

  it('hot-swap via setSettings gates on an actual transition', () => {
    // Without the transition gate, every setSettings call would
    // re-create the plate even when the type hadn't changed — each
    // knob twiddle would spawn + dispose a WASM worklet. Look for
    // the `_lastPlateStage` guard near the setSettings plateStage
    // handling.
    expect(SOURCE).toMatch(/settings\.plateStage !== this\._lastPlateStage/);
    expect(SOURCE).toMatch(/this\._lastPlateStage = settings\.plateStage/);
  });

  it('mix-only updates skip the teardown/rebuild path', () => {
    // Changing plateStageMix alone should just write to the send
    // gain — no WASM churn. Look for a plateSend.gain update gated
    // on settings.plateStageMix.
    expect(SOURCE).toMatch(/settings\.plateStageMix !== undefined[\s\S]{0,200}this\.plateSend\.gain/);
  });
});
