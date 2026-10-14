/**
 * Owner 2026-10-14: "i can not step a channel and preview the notes with enter", then "there are no vu's when stepping
 * with enter". Through the real window key handler (useTrackerInput) with the ProTracker scheme, Enter on a stopped
 * song is step play: it sounds the row under the cursor, flashes the VU meter of each channel it sounds (the others
 * stay at zero, a muted channel stays silent and dark, as in playback) and moves the cursor by the edit step.
 * Before, Enter only moved the cursor; playRow passed "F-3"-style names and the channel index as the start time; and
 * the meter drawer zeroed every meter on each frame the transport was stopped.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const engine = vi.hoisted(() => ({
  ensureInstrumentReady: vi.fn(async () => {}),
  triggerNoteAttack: vi.fn(),
  triggerNoteRelease: vi.fn(),
  triggerChannelMeter: vi.fn(),
  isChannelMuted: vi.fn((_ch: number) => false),
}));
vi.mock('@/engine/ToneEngine', () => {
  const proxy = new Proxy(engine, { get: (t, k) => (k in t ? t[k as keyof typeof t] : () => Promise.resolve()) });
  return { getToneEngine: () => proxy };
});
vi.mock('@/engine/TrackerReplayer', () => {
  const replayer = new Proxy({}, { get: (_t, k) => (k === 'isPlaying' ? () => false : () => undefined) });
  return { getTrackerReplayer: () => replayer, peekTrackerReplayer: () => null };
});

import { useTrackerInput } from '@/hooks/tracker/useTrackerInput';
import { useTrackerStore, useCursorStore, useInstrumentStore, useTransportStore } from '@stores';
import { useEditorStore } from '@stores/useEditorStore';
import { useFormatStore } from '@stores/useFormatStore';
import { getBehaviorForScheme } from '@engine/keyboard/EditorBehavior';
import { meterKilledByStop } from '@/components/tracker/waveformVuLevel';
import type { InstrumentConfig } from '@/types/instrument';

const press = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function setup() {
  useFormatStore.setState({ editorMode: 'classic' });
  useTransportStore.setState({ isPlaying: false });
  useEditorStore.setState({ recordMode: false, editStep: 2, activeBehavior: getBehaviorForScheme('protracker') });
  useInstrumentStore.setState({ instruments: [{ id: 1, name: 'lead', type: 'sample', synthType: 'Sampler' } as InstrumentConfig] });
  const t = useTrackerStore.getState();
  useTrackerStore.setState({ currentPatternIndex: 0 });
  const channels = t.patterns[0]!.channels.length;
  for (let ch = 0; ch < channels; ch++) t.setCell(ch, 0, { note: 0, instrument: 0 });
  t.setCell(0, 0, { note: 42, instrument: 1 }); // F-3
  t.setCell(2, 0, { note: 49, instrument: 1 }); // C-4
  useCursorStore.getState().moveCursorToRow(0);
  useCursorStore.getState().moveCursorToChannel(0);
  return renderHook(() => useTrackerInput());
}

describe('row preview moves the meter of the channel it sounds, others stay at zero', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    engine.isChannelMuted.mockImplementation(() => false);
  });

  it('Enter sounds the row, flashes the meters of channels 0 and 2 only, and steps by the edit step', async () => {
    const { unmount } = setup();
    press('Enter');
    await flush();
    expect(engine.triggerNoteAttack.mock.calls.map((c) => c[1]).sort()).toEqual(['C4', 'F3']);
    expect(engine.triggerChannelMeter.mock.calls.map((c) => c[0]).sort()).toEqual([0, 2]);
    expect(useCursorStore.getState().cursor.rowIndex).toBe(2);
    unmount();
  });

  it('a muted channel stays silent and its meter dark', async () => {
    engine.isChannelMuted.mockImplementation((ch: number) => ch === 2);
    const { unmount } = setup();
    press('Enter');
    await flush();
    expect(engine.triggerNoteAttack.mock.calls.map((c) => c[1])).toEqual(['F3']);
    expect(engine.triggerChannelMeter.mock.calls.map((c) => c[0])).toEqual([0]);
    unmount();
  });

  it('the meter drawer drops meters on the frame playback stops, not on every stopped frame', () => {
    expect(meterKilledByStop(false, true)).toBe(true);
    expect(meterKilledByStop(false, false)).toBe(false);
    expect(meterKilledByStop(true, true)).toBe(false);
  });
});
