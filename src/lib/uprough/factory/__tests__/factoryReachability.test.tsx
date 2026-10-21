/**
 * R2f reachability: the real entry point (the factory seam the host NDJSON stream calls) drives the real panel and the
 * real tracker store. The event count is the sentinel that the new code ran.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { FactoryPanel } from '@components/uprough/FactoryPanel';
import { useFactoryStore, factoryOnEvent } from '../useFactoryStore';
import { patternFillLoaded } from '../patternFill';
import { parseNdjson, scriptedGenerateEvents, toNdjson } from '../scriptedRun';
import { useTrackerStore } from '@stores/useTrackerStore';
import { LANES } from '../../songFile';
// The fill opens its blank song through applySong: jsdom has no AudioContext and no Worker.
vi.mock('@engine/ToneEngine', () => import('@/test/mocks/silentToneEngine'));
vi.mock('@stores/useInstrumentTypeStore', () => import('@/test/mocks/inertInstrumentTypeStore'));

afterEach(cleanup);

describe('the synth factory, end to end', () => {
  it('host NDJSON events reach the panel through the factory seam and fill the real patterns', async () => {
    useFactoryStore.getState().reset();
    render(<FactoryPanel />);

    // Act 2 path: the NDJSON stream goes through the seam; the real tracker store receives the cells.
    const events = parseNdjson(toNdjson(scriptedGenerateEvents('trap', 3)));
    const decides = events.filter((e) => e.type === 'decide').length;
    // As the host streams it: the blank song lands after the start line, before the decides.
    act(() => { factoryOnEvent(events[0]!); });
    // Not inside act: the panel clock ticks every frame while the run is live, so an async act never drains.
    await patternFillLoaded();
    act(() => { for (const ev of events.slice(1)) factoryOnEvent(ev); });
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
