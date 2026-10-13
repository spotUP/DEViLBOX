/**
 * DJ-IDLE-CPU (owner 2026-10-12, "pretty catastrophic for an app doing
 * nothing"): with nothing playing the page drew ~120 frames a second -
 * meters, scopes and FPS counters redrawing the same silent picture, and the
 * DJ view's loops running on while another view was on screen.
 *
 * One gate (hooks/useFrameGate.ts) decides for every picture loop: a signal
 * picture runs while the app sounds and its view is on screen; a 'time'
 * picture only needs its view on screen. Asleep, it draws one frame of the
 * current state and nothing after.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useVisualizationAnimation } from '../useVisualizationAnimation';
import { ViewActiveContext } from '../useFrameGate';
import { _setSoundingForTest } from '@engine/audio/signalPresence';

let frames: FrameRequestCallback[] = [];
let now = 0;
/** Run one display frame: every callback requested before it. */
function frame(): void {
  now += 1000 / 60;
  const due = frames;
  frames = [];
  for (const cb of due) cb(now);
}

beforeEach(() => {
  frames = [];
  now = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', () => { frames = []; });
  _setSoundingForTest(false);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); _setSoundingForTest(false); });

function Meter({ onFrame, follows }: { onFrame: () => boolean; follows?: 'signal' | 'time' }) {
  useVisualizationAnimation({ onFrame, fps: 60, follows });
  return null;
}

describe('picture loops in a silent app', () => {
  it('a meter draws once and then requests no frame while the app is silent', () => {
    const onFrame = vi.fn(() => true);
    render(<Meter onFrame={onFrame} />);
    for (let i = 0; i < 120; i++) frame();
    expect(onFrame).toHaveBeenCalledTimes(1);   // the picture as it stands
    expect(frames).toHaveLength(0);             // and no frame requested after it
  });

  it('the first sound starts it, and silence stops it again', () => {
    const onFrame = vi.fn(() => true);
    render(<Meter onFrame={onFrame} />);
    frame();
    act(() => _setSoundingForTest(true));
    for (let i = 0; i < 60; i++) frame();
    expect(onFrame.mock.calls.length).toBeGreaterThanOrEqual(50);
    act(() => _setSoundingForTest(false));
    const at = onFrame.mock.calls.length;
    for (let i = 0; i < 120; i++) frame();
    expect(onFrame.mock.calls.length).toBeLessThanOrEqual(at + 1);
    expect(frames).toHaveLength(0);
  });

  it('a loop in a view that is mounted but off screen stops, sound or not', () => {
    const onFrame = vi.fn(() => true);
    act(() => _setSoundingForTest(true));
    render(
      <ViewActiveContext.Provider value={false}>
        <Meter onFrame={onFrame} />
        <Meter onFrame={onFrame} follows="time" />
      </ViewActiveContext.Provider>,
    );
    for (let i = 0; i < 120; i++) frame();
    expect(onFrame.mock.calls.length).toBeLessThanOrEqual(2);
    expect(frames).toHaveLength(0);
  });

  it("a 'time' picture (a playhead, an LFO) keeps moving without sound while on screen", () => {
    const onFrame = vi.fn(() => true);
    render(<Meter onFrame={onFrame} follows="time" />);
    for (let i = 0; i < 60; i++) frame();
    expect(onFrame.mock.calls.length).toBeGreaterThanOrEqual(50);
  });
});

describe('the gate is wired', () => {
  const src = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

  it('the engine listens to everything that reaches the destination', () => {
    expect(src('src/engine/ToneEngine.ts')).toMatch(/watchSignal\(this\._nativeContext, destinationOut\)/);
  });

  it('the DJ view kept mounted behind another view is marked off screen', () => {
    expect(src('src/App.tsx')).toContain("<ViewActiveContext.Provider value={activeView === 'dj'}>");
  });

  it.each([
    'src/components/tracker/TrackScopesStrip.tsx',
    'src/components/tracker/ChannelVUMeters.tsx',
    'src/components/dj/MixerMaster.tsx',
  ])('%s draws through the gated loop, with no raw frame loop of its own', (rel) => {
    const s = src(rel);
    expect(s).not.toMatch(/requestAnimationFrame/);
    expect(s).toMatch(/useVisualizationAnimation/);
  });

  it.each([
    ['src/hooks/dj/useDeckVisualizationData.ts', /subscribeSounding\(wake\)/],
    ['src/hooks/dj/useDeckStateSync.ts', /deckBusy\(deckId\)/],
    ['src/hooks/useFPSMonitor.ts', /subscribeSounding\(runWhileSounding\)/],
    ['src/debug/soakActions.ts', /subscribeSounding\(recordWhileSounding\)/],
    ['src/engine/dub/moveAudibilityLog.ts', /subscribeSounding\(runTimer\)/],
    ['src/components/dj/DeckTurntable.tsx', /positionAnchor\.rate !== 0/],
    ['src/components/dj/DeckBeatPhase.tsx', /positionAnchor\.rate !== 0/],
    ['src/components/tracker/PianoRollView.tsx', /if \(isPlaying\) animFrameRef\.current = requestAnimationFrame\(frame\)/],
    ['src/components/tracker/PatternEditorCanvas.tsx', /asleep = true;/],
  ])('%s sleeps when its picture cannot change', (rel, pattern) => {
    expect(src(rel)).toMatch(pattern);
  });
});
