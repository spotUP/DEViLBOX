/**
 * "if auto dub is turned on in the dj view turn on the dub bus" and the same
 * in the tracker view (owner 2026-10-08): the DJ view had an Auto Dub switch
 * and no bus switch, so Auto Dub could be on with nothing to play into.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { useDubStore } from '@/stores/useDubStore';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { setAutoDubPower, setDubBusPower } from '../dubPower';

beforeEach(() => {
  useDubStore.getState().setAutoDubEnabled(false);
  useDrumPadStore.getState().setDubBus({ enabled: false });
});

describe('Auto Dub and the Dub Bus switch together', () => {
  it('switching Auto Dub on switches the bus on', () => {
    setAutoDubPower(true);
    expect(useDubStore.getState().autoDubEnabled).toBe(true);
    expect(useDrumPadStore.getState().dubBus.enabled).toBe(true);
  });

  it('keeps the chosen character preset when it switches the bus on', () => {
    const before = useDrumPadStore.getState().dubBus.characterPreset;
    setAutoDubPower(true);
    expect(useDrumPadStore.getState().dubBus.characterPreset).toBe(before);
  });

  it('switching the bus off stops Auto Dub; switching Auto Dub off leaves the bus on', () => {
    setAutoDubPower(true);
    setAutoDubPower(false);
    expect(useDrumPadStore.getState().dubBus.enabled).toBe(true);
    setAutoDubPower(true);
    setDubBusPower(false);
    expect(useDubStore.getState().autoDubEnabled).toBe(false);
  });

  it('is the rule behind the DJ view panel, the tracker Dub Deck and the MCP', () => {
    const read = (p: string) => readFileSync(resolve(__dirname, '../../..', p), 'utf8');
    expect(read('components/dub/AutoDubPanel.tsx')).toMatch(/onChange=\{setAutoDubPower\}/);
    const strip = read('components/dub/DubDeckStrip.tsx');
    expect(strip).toMatch(/setAutoDubPower\(!autoDubEnabled\)/);
    expect(strip).toMatch(/setDubBusPower\(!busEnabled\)/);
    expect(read('bridge/handlers/writeHandlers.ts')).toMatch(/setAutoDubPower\(params\.enabled\)/);
  });
});
