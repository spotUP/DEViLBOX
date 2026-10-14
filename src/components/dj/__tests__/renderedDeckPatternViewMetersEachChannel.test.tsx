/**
 * DECK-VU-RENDERED (owner LOCAL 2026-10-12): a rendered module deck's pattern
 * view scrolled but showed no per-channel VU meters. The deck pattern view
 * (DeckPatternDisplay -> ReadOnlyPatternCanvas) never had meters, in either
 * playback mode; only the tracker's pattern editor did. The view now mounts
 * the tracker's ChannelVUMeters, fed by the deck's channel scopes at the
 * heard position (DeckEngine.getChannelWaveforms: the render's scope track,
 * channelScopeTrack.ts) - the same signal the deck scopes draw.
 *
 * Real DeckPatternDisplay, ReadOnlyPatternCanvas and ChannelVUMeters; the
 * deck's waveforms come from a real ChannelScopeTrack through
 * channelScopeWindow. Fake engine, a recording 2D context, manual frames.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({ song: null as unknown, track: null as unknown, positionSec: 0, waveformCalls: 0 }));

vi.mock('@/engine/dj/DJEngine', async () => {
  const { channelScopeWindow } = await import('@/engine/dj/channelScopeTrack');
  return {
    getDJEngine: () => ({
      getDeck: () => ({
        replayer: { getSong: () => holder.song },
        getChannelWaveforms: (n: number) => {
          holder.waveformCalls++;
          return channelScopeWindow(holder.track as Parameters<typeof channelScopeWindow>[0], holder.positionSec, n);
        },
      }),
    }),
  };
});
vi.mock('@/workers/readonly-pattern.worker.ts?worker', () => ({ default: class { onmessage = null; postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} } }));
vi.mock('@/components/visualization/DJOscilloscope', () => ({ DJOscilloscope: () => null }));

import { render, cleanup, act } from '@testing-library/react';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { DeckPatternDisplay } from '../DeckPatternDisplay';
import { useDJStore } from '@/stores/useDJStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { ChannelScopeTrackBuilder } from '@/engine/dj/channelScopeTrack';
import { _setSoundingForTest } from '@/engine/audio/signalPresence';

const RATE = 44100;
const ONSET_SEC = 1;

/** Four channels; only channel 2 (index 1) sounds, from ONSET_SEC on. */
function scopeTrack() {
  const b = new ChannelScopeTrackBuilder(4, RATE);
  const n = RATE * 2;
  b.push(n, (ch, i) => (ch === 1 && i >= ONSET_SEC * RATE ? 0.8 * Math.sin(i / 10) : 0));
  return b.finish();
}

let frames: FrameRequestCallback[] = [];
const fills: number[] = [];

/** Display frames, 1/60 s apart (the meters draw at up to 60 fps). */
let frameTime = 0;
function runFrames(count: number) {
  for (let k = 0; k < count; k++) {
    frameTime += 1000 / 60;
    const due = frames; frames = [];
    for (const f of due) f(frameTime);
  }
}

describe('a rendered module deck\'s pattern view meters each channel', () => {
  beforeEach(() => {
    // Column maths below assumes the unshrunk 170 px columns; the fit has its own test (deckPatternViewFitsEveryChannel).
    useSettingsStore.setState({ fitAllChannelsDeck: false });
    holder.song = {
      songPositions: [0], numChannels: 4,
      // Channel 2's note: a deck shows the pattern view only for a song with notes (70a57efa2).
      patterns: [{ id: 'p0', length: 64, channels: Array.from({ length: 4 }, (_, c) => ({
        id: `c${c}`, rows: c === 1 ? [{ note: 49, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }] : [],
      })) }],
    } as unknown as TrackerSong;
    holder.track = scopeTrack();
    holder.positionSec = 0.5;
    holder.waveformCalls = 0;
    frames = [];
    frameTime = 0;
    fills.length = 0;
    // The deck plays, so the app sounds: the signal-presence listener reports
    // it, which is what lets meters draw (hooks/useFrameGate.ts).
    _setSoundingForTest(true);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const ctx = {
      setTransform: () => {}, clearRect: () => {}, fillStyle: '',
      fillRect: (x: number) => { fills.push(x); },
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
    useDJStore.getState().setDeckState('A', {
      fileName: 'modland:x/suggestive vibes.mod', playbackMode: 'audio', isPlaying: true, totalPositions: 1, songPos: 0, pattPos: 0,
    });
  });
  afterEach(() => {
    cleanup();
    _setSoundingForTest(false);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    useDJStore.getState().setDeckState('A', { isPlaying: false, fileName: null });
  });

  it('a note on channel 2 lights channel 2\'s meter, from the deck\'s channel scope at the heard time, and no other', () => {
    render(<DeckPatternDisplay deckId="A" />);
    // Before the onset every channel is silent: nothing drawn.
    act(() => runFrames(3));
    expect(holder.waveformCalls).toBeGreaterThan(0);
    expect(fills).toEqual([]);

    // The listener reaches the note.
    holder.positionSec = ONSET_SEC + 0.05;
    act(() => runFrames(2));
    expect(fills.length).toBeGreaterThan(0);
    // ReadOnlyPatternCanvas columns at its default 400 px: 170 px each, meters drawn
    // relative to the first column. Channel 2 is x 170..340; every segment lies there.
    for (const x of fills) {
      expect(x).toBeGreaterThanOrEqual(170);
      expect(x).toBeLessThan(340);
    }

    // A stopped deck shows no meters.
    fills.length = 0;
    act(() => { useDJStore.getState().setDeckState('A', { isPlaying: false }); });
    act(() => runFrames(2));
    expect(fills).toEqual([]);
  });
});
