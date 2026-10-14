/**
 * VU-FOLLOWS-FIT-SCALE (owner 2026-10-14): fit-all-channels shrinks the pattern
 * text, but the channel VU meters kept their full size and gutter offset, so
 * they stopped lining up with the columns. The meters now take the same fitted
 * scale (ReadOnlyPatternCanvas layout / PatternEditorCanvas fitScale).
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
const widths: number[] = [];

/** Display frames, 1/60 s apart (the meters draw at up to 60 fps). */
let frameTime = 0;
function runFrames(count: number) {
  for (let k = 0; k < count; k++) {
    frameTime += 1000 / 60;
    const due = frames; frames = [];
    for (const f of due) f(frameTime);
  }
}

describe('a deck pattern view fitted to its width', () => {
  beforeEach(() => {
    // Column maths below assumes the unshrunk 170 px columns; the fit has its own test (deckPatternViewFitsEveryChannel).
    useSettingsStore.setState({ fitAllChannelsDeck: true });
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
    widths.length = 0;
    // The deck plays, so the app sounds: the signal-presence listener reports
    // it, which is what lets meters draw (hooks/useFrameGate.ts).
    _setSoundingForTest(true);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const ctx = {
      setTransform: () => {}, clearRect: () => {}, fillStyle: '',
      fillRect: (x: number, _y: number, w: number) => { fills.push(x); widths.push(w); },
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

  it('channel VU meters shrink with the fitted pattern text and stay over their columns', () => {
    render(<DeckPatternDisplay deckId="A" />);
    holder.positionSec = ONSET_SEC + 0.05;
    act(() => runFrames(3));
    expect(fills.length).toBeGreaterThan(0);
    // Four 170 px channels cannot fit 400 px at scale 1: the text is shrunk, so the meter is too.
    for (const w of widths) expect(w).toBeLessThan(28);
    // Columns share the 400 px beside the (shrunk) row-number gutter; the sounding channel 2
    // is the second quarter, and each meter lies inside it.
    const colW = (400 - Math.floor(40 * 0.5)) / 4;
    fills.forEach((x, k) => {
      expect(x).toBeGreaterThanOrEqual(colW - 2);
      expect(x + widths[k]).toBeLessThanOrEqual(2 * colW + 2);
    });
  });
});
