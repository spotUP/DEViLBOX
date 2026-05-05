/**
 * G15 contract: DubDeckStrip must keep the intended interaction model for
 * global and per-channel dub controls.
 *
 * We intentionally source-lock this file instead of mounting the component:
 * DubDeckStrip imports the live WebAudio/Tone stack, and the bug class we
 * care about here is UI wiring drift — e.g. a hold button becoming a click,
 * a toggle button accidentally calling holdStart, or channel/master buttons
 * diverging. This test makes those regressions fail in CI without needing
 * a browser audio graph.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(
  resolve(__dirname, '..', 'DubDeckStrip.tsx'),
  'utf8',
);

describe('DubDeckStrip — move grouping contract (G15)', () => {
  it('keeps representative globals in the intended interaction groups', () => {
    expect(SOURCE).toMatch(/moveId:\s*'springSlam'[\s\S]*group:\s*'click'/);
    expect(SOURCE).toMatch(/moveId:\s*'masterDrop'[\s\S]*group:\s*'hold'/);
    expect(SOURCE).toMatch(/moveId:\s*'ghostReverb'[\s\S]*group:\s*'toggle'/);
    expect(SOURCE).toMatch(/moveId:\s*'delayPresetQuarter'[\s\S]*group:\s*'rate'/);
  });

  it('renders CLICK globals as one-shot onClick fireTrigger buttons', () => {
    const clickBlock = SOURCE.match(/GLOBAL_MOVES\.filter\(m => m\.group === 'click'\)\.map\(\(m\) => \{[\s\S]*?\}\)\}/);
    expect(clickBlock, 'CLICK group render block not found').not.toBeNull();
    expect(clickBlock![0]).toMatch(/onClick=\{\(\) => \{/);
    expect(clickBlock![0]).toMatch(/fireTrigger\(m\.moveId\)/);
    expect(clickBlock![0]).not.toMatch(/holdStart\(m\.moveId\)/);
    expect(clickBlock![0]).not.toMatch(/handleToggle\(m\.moveId\)/);
  });

  it('renders HOLD globals with pointer-held start/release semantics', () => {
    const holdBlock = SOURCE.match(/GLOBAL_MOVES\.filter\(m => m\.group === 'hold'\)\.map\(\(m\) => \{[\s\S]*?\}\)\}/);
    expect(holdBlock, 'HOLD group render block not found').not.toBeNull();
    expect(holdBlock![0]).toMatch(/onPointerDown=\{\(e\) => \{/);
    expect(holdBlock![0]).toMatch(/setPointerCapture\(e\.pointerId\)/);
    expect(holdBlock![0]).toMatch(/holdStart\(m\.moveId\)/);
    expect(holdBlock![0]).toMatch(/onPointerUp=\{\(e\) => \{ e\.currentTarget\.releasePointerCapture\(e\.pointerId\); holdEnd\(m\.moveId\); \}\}/);
    expect(holdBlock![0]).toMatch(/onPointerCancel=\{\(e\) => \{ e\.currentTarget\.releasePointerCapture\(e\.pointerId\); holdEnd\(m\.moveId\); \}\}/);
  });

  it('renders TOGGLE globals as latch-on/latch-off handleToggle buttons', () => {
    const toggleBlock = SOURCE.match(/GLOBAL_MOVES\.filter\(m => m\.group === 'toggle'\)\.map\(\(m\) => \{[\s\S]*?\}\)\}/);
    expect(toggleBlock, 'TOGGLE group render block not found').not.toBeNull();
    expect(toggleBlock![0]).toMatch(/onClick=\{\(\) => \{/);
    expect(toggleBlock![0]).toMatch(/handleToggle\(m\.moveId\)/);
    expect(toggleBlock![0]).not.toMatch(/holdStart\(m\.moveId\)/);
  });

  it('renders RATE globals as mutually exclusive preset buttons', () => {
    const rateBlock = SOURCE.match(/GLOBAL_MOVES\.filter\(m => m\.group === 'rate'\)\.map\(\(m\) => \{[\s\S]*?\}\)\}/);
    expect(rateBlock, 'RATE group render block not found').not.toBeNull();
    expect(rateBlock![0]).toMatch(/onClick=\{\(\) => handleRatePreset\(m\.moveId\)\}/);
    expect(rateBlock![0]).not.toMatch(/fireTrigger\(m\.moveId\)/);
  });
});

describe('DubDeckStrip — channel/master button semantics contract (G15)', () => {
  it('keeps per-channel ops classified as hold vs trigger', () => {
    expect(SOURCE).toMatch(/moveId:\s*'channelMute'[\s\S]*kind:\s*'hold'/);
    expect(SOURCE).toMatch(/moveId:\s*'channelThrow'[\s\S]*kind:\s*'trigger'/);
    expect(SOURCE).toMatch(/moveId:\s*'skankEchoThrow'[\s\S]*kind:\s*'hold'/);
    expect(SOURCE).toMatch(/moveId:\s*'dubStab'[\s\S]*kind:\s*'trigger'/);
  });

  it('uses the same op.kind split for the ALL channels master column', () => {
    const masterOpsBlock = SOURCE.match(/CHANNEL_OPS\.map\(\(op\) => \{[\s\S]*?title=\{`ALL channels/m);
    expect(masterOpsBlock, 'master CHANNEL_OPS block not found').not.toBeNull();
    expect(masterOpsBlock![0]).toMatch(/const isHold = op\.kind === 'hold'/);
    expect(masterOpsBlock![0]).toMatch(/onClick=\{isHold \? undefined : \(\) => \{/);
    expect(masterOpsBlock![0]).toMatch(/fireTrigger\(op\.moveId, i\)/);
    expect(masterOpsBlock![0]).toMatch(/onPointerDown=\{isHold \? \(e\) => \{/);
    expect(masterOpsBlock![0]).toMatch(/holdStart\(op\.moveId, i\)/);
    expect(masterOpsBlock![0]).toMatch(/onPointerUp=\{isHold \? \(e\) => \{/);
    expect(masterOpsBlock![0]).toMatch(/holdEnd\(op\.moveId, i\)/);
  });

  it('uses the same op.kind split for each individual channel column', () => {
    const channelOpsBlock = SOURCE.match(/CHANNEL_OPS\.map\(\(op\) => \{[\s\S]*?title=\{`Ch \$\{i \+ 1\} · \$\{op\.title\}/m);
    expect(channelOpsBlock, 'per-channel CHANNEL_OPS block not found').not.toBeNull();
    expect(channelOpsBlock![0]).toMatch(/const isHold = op\.kind === 'hold'/);
    expect(channelOpsBlock![0]).toMatch(/onClick=\{isHold \? undefined : \(\) => fireTrigger\(op\.moveId, i\)\}/);
    expect(channelOpsBlock![0]).toMatch(/onPointerDown=\{isHold \? \(e\) => \{ e\.currentTarget\.setPointerCapture\(e\.pointerId\); holdStart\(op\.moveId, i\); \} : undefined\}/);
    expect(channelOpsBlock![0]).toMatch(/onPointerUp=\{isHold \? \(e\) => \{ e\.currentTarget\.releasePointerCapture\(e\.pointerId\); holdEnd\(op\.moveId, i\); \} : undefined\}/);
    expect(channelOpsBlock![0]).toMatch(/onPointerCancel=\{isHold \? \(e\) => \{ e\.currentTarget\.releasePointerCapture\(e\.pointerId\); holdEnd\(op\.moveId, i\); \} : undefined\}/);
  });
});
