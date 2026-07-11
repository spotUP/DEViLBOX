import { it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFormatStore } from '@/stores/useFormatStore';

// Hoist mock fns so the vi.mock factory can reference them before imports resolve.
const { mockProjectEventToWorklet, mockRecook } = vi.hoisted(() => ({
  mockProjectEventToWorklet: vi.fn(),
  mockRecook: vi.fn(),
}));

vi.mock('@/engine/maxtrax/MaxTraxEngine', () => ({
  MaxTraxEngine: {
    getInstance: () => ({ projectEventToWorklet: mockProjectEventToWorklet, recook: mockRecook }),
  },
}));

import { useMaxTraxGrid } from '@/hooks/useMaxTraxGrid';

beforeEach(() => {
  vi.clearAllMocks();
  useFormatStore.getState().setMaxTraxData(null);
});

it('derives a grid and pushes duration edits to store + engine', () => {
  useFormatStore.getState().setMaxTraxData({
    tempo: 0,
    flags: 0,
    headerRaw: new Uint8Array(),
    scores: [{ events: [{ command: 0x3c, data: 0x11, startTime: 0, stopTime: 10 }] }],
    tailRaw: new Uint8Array(),
  });

  const { result } = renderHook(() => useMaxTraxGrid(0, 24));

  // One note event produces a noteOn + noteOff cell.
  expect(result.current.grid!.noteCells.length).toBe(2);

  act(() => result.current.edit.setNoteDuration(0, 200));

  // Store must reflect the new duration (single source of truth).
  expect(useFormatStore.getState().maxTraxData!.scores[0].events[0].stopTime).toBe(200);

  // Worklet must have received the event for live audio projection.
  expect(mockProjectEventToWorklet).toHaveBeenCalled();
});

it('setNoteOffset retimes the event to rowBase + newOffset via moveNote path', () => {
  // ticksPerRow = 24. Place note A at absolute tick 25 (row=1, offset=1) and
  // a following END event so moveNote has a next-event delta to adjust.
  useFormatStore.getState().setMaxTraxData({
    tempo: 0,
    flags: 0,
    headerRaw: new Uint8Array(),
    scores: [
      {
        events: [
          // note at startTime=25 (abs=25 → row=1, offset=1 within TPR=24)
          { command: 0x3c, data: 0x40, startTime: 25, stopTime: 10 },
          // END event after, startTime delta=10 → abs=35
          { command: 0xff, data: 0x00, startTime: 10, stopTime: 0 },
        ],
      },
    ],
    tailRaw: new Uint8Array(),
  });

  const { result } = renderHook(() => useMaxTraxGrid(0, 24));

  // Sanity: note is at offset 1 (abs 25 % 24 = 1).
  const gridBefore = result.current.grid!;
  const noteOnBefore = gridBefore.noteCells.find(c => c.kind === 'noteOn')!;
  expect(noteOnBefore.offset).toBe(1);

  // Set offset to 5 → expect abs tick = rowBase(24) + 5 = 29.
  act(() => result.current.edit.setNoteOffset(0, 5));

  const events = useFormatStore.getState().maxTraxData!.scores[0].events;
  // Absolute tick of event 0 = events[0].startTime (prev=0, so abs=startTime).
  expect(events[0].startTime).toBe(29); // rowBase(24) + newOffset(5)

  // The grid must reflect the new offset.
  const gridAfter = result.current.grid!;
  const noteOnAfter = gridAfter.noteCells.find(c => c.kind === 'noteOn')!;
  expect(noteOnAfter.offset).toBe(5);

  // Engine must have been told about the change.
  expect(mockProjectEventToWorklet).toHaveBeenCalled();
});

it('moveNote dispatches projectEventToWorklet for BOTH changed indices (no extra store writes)', () => {
  // Two note events: note A at tick 0 (dur=10), note B at tick 20 (dur=5).
  useFormatStore.getState().setMaxTraxData({
    tempo: 0,
    flags: 0,
    headerRaw: new Uint8Array(),
    scores: [
      {
        events: [
          { command: 0x3c, data: 0x40, startTime: 0, stopTime: 10 },
          { command: 0x3c, data: 0x50, startTime: 20, stopTime: 25 },
        ],
      },
    ],
    tailRaw: new Uint8Array(),
  });

  const { result } = renderHook(() => useMaxTraxGrid(0, 24));

  const revBefore = useFormatStore.getState().maxTraxRev;

  // Move note 0 to tick 40.
  act(() => result.current.edit.moveNote(0, 40));

  // projectEventToWorklet must be called for each changed index (moveNote shifts
  // both the moved note AND the next delta — 2 calls total).
  expect(mockProjectEventToWorklet).toHaveBeenCalledTimes(2);
  expect(mockProjectEventToWorklet).toHaveBeenCalledWith(0, 0, expect.objectContaining({ startTime: 40 }));
  expect(mockProjectEventToWorklet).toHaveBeenCalledWith(0, 1, expect.anything());

  // Store is written exactly once — rev bumps by exactly 1.
  expect(useFormatStore.getState().maxTraxRev).toBe(revBefore + 1);

  // Moved note has the new startTime in the store.
  expect(useFormatStore.getState().maxTraxData!.scores[0].events[0].startTime).toBe(40);
});
