import { it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFormatStore } from '@/stores/useFormatStore';

// Hoist mock fns so the vi.mock factory can reference them before imports resolve.
const { mockSetEvent, mockRecook } = vi.hoisted(() => ({
  mockSetEvent: vi.fn(),
  mockRecook: vi.fn(),
}));

vi.mock('@/engine/maxtrax/MaxTraxEngine', () => ({
  MaxTraxEngine: {
    getInstance: () => ({ setEvent: mockSetEvent, recook: mockRecook }),
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

  // Engine must have received the event for live audio projection.
  expect(mockSetEvent).toHaveBeenCalled();
});
