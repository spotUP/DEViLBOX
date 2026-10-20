/**
 * R2f reachability: the real entry points (the R2 event store the song service writes, and the factory seam the host
 * stream calls) drive the real panel and the real tracker store. The event count is the sentinel that the new code ran.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { FactoryPanel } from '@components/uprough/FactoryPanel';
import { useFactoryStore, factoryOnEvent } from '../useFactoryStore';
import { attachR2Bridge } from '../r2Bridge';
import { parseNdjson, scriptedGenerateEvents, toNdjson } from '../scriptedRun';
import { useUpRoughR2Store } from '@stores/useUpRoughR2Store';
import { useTrackerStore } from '@stores/useTrackerStore';
import { createEmitter } from '@/engine/uprough/r2Events';
import { buildBank } from '@/engine/uprough/songRender';
import { LANES } from '../../songFile';

afterEach(cleanup);

describe('the synth factory, end to end', () => {
  it('TS render events reach the panel through the R2 store; host decide events fill the real patterns', () => {
    useFactoryStore.getState().reset();
    const detach = attachR2Bridge();
    render(<FactoryPanel />);

    // Acts 1 and 3 path: the song service appends to the R2 store; the bridge feeds the factory.
    act(() => {
      useUpRoughR2Store.getState().begin();
      const em = createEmitter(useUpRoughR2Store.getState().append)!;
      em.emit({ type: 'start', mode: 'render', rate: 22050, style: 'trap', seed: 3, sections: [] });
      buildBank(em, 'trap', 22050, 3);
    });
    const afterBank = useFactoryStore.getState().state;
    expect(afterBank.eventCount).toBe(useUpRoughR2Store.getState().events.length);
    expect(afterBank.voiceOrder.length).toBeGreaterThan(5);
    expect(afterBank.slots.find((s) => s.id === 'snare')!.attachments).toHaveLength(2);
    detach();

    // Act 2 path: the NDJSON stream goes through the seam; the real tracker store receives the cells.
    const events = parseNdjson(toNdjson(scriptedGenerateEvents('trap', 3)));
    const decides = events.filter((e) => e.type === 'decide').length;
    act(() => { for (const ev of events) factoryOnEvent(ev); });
    const state = useFactoryStore.getState().state;
    expect(state.eventCount).toBe(events.length);
    expect(state.done).toBe(true);
    expect(state.cellsWritten).toBeGreaterThan(decides);

    const patterns = useTrackerStore.getState().patterns;
    expect(patterns).toHaveLength(3);
    const verse = patterns[1]!;
    expect(verse.length).toBe(64);
    const kick = verse.channels[LANES.indexOf('kick')]!.rows;
    expect(kick[0]!.volume).toBe(0x10 + 64);
    expect(kick[16 + 10]!.note).toBeGreaterThan(0);
    const bass = verse.channels[LANES.indexOf('bass')]!.rows;
    expect(bass[8]!.note).toBeGreaterThan(0);

    expect(screen.getByTestId('factory-status').textContent).toBe('Song generated');
    expect(screen.getByTestId('factory-slot-kick')).toBeTruthy();
    expect(screen.getByTestId('factory-section-1').textContent).toContain('4 of 4 bars decided');
  });
});
