import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerCaptureCanvas, getCaptureCanvas, availableCaptureSources,
} from '../DJVideoCapture';

/**
 * A capture source with no registered canvas produces nothing, silently.
 *
 * `'dj-ui'` has produced nothing since the Pixi UI was removed — `PixiApp`
 * was the only thing that ever registered it — yet it stayed in the export
 * picker and was the fallback the stream control reached for whenever the VJ
 * view was closed:
 *
 *     const source: VideoSource = getCaptureCanvas('vj') ? 'vj' : 'dj-ui';
 *
 * So going live without the VJ view open streamed a blank picture and said
 * nothing about it. Both callers now ask what is registered instead of
 * naming a source and hoping (2026-09-23, fixed 2026-09-24).
 */
describe('only a registered source can be captured', () => {
  const canvas = () => ({ width: 1280, height: 720 }) as HTMLCanvasElement;

  beforeEach(() => {
    for (const s of availableCaptureSources()) registerCaptureCanvas(s, null);
  });

  it('offers nothing when nothing has registered', () => {
    expect(availableCaptureSources()).toEqual([]);
  });

  it('never offers a source whose canvas went away', () => {
    registerCaptureCanvas('vj', canvas());
    expect(availableCaptureSources()).toEqual(['vj']);

    registerCaptureCanvas('vj', null);
    expect(availableCaptureSources()).toEqual([]);
    expect(getCaptureCanvas('vj')).toBeNull();
  });

  it('does not invent dj-ui just because the type allows it', () => {
    // The exact fallback that streamed a blank: VJ open, dj-ui named anyway.
    registerCaptureCanvas('vj', canvas());
    expect(availableCaptureSources()).not.toContain('dj-ui');
    expect(getCaptureCanvas('dj-ui')).toBeNull();
  });

  it('lists every source that really is registered', () => {
    registerCaptureCanvas('vj', canvas());
    registerCaptureCanvas('overlay', canvas());
    expect(new Set(availableCaptureSources())).toEqual(new Set(['vj', 'overlay']));
  });
});
