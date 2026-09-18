/**
 * Media Session — the car reported it, so the car is what these describe.
 *
 * 2026-09-18, DEViLBOX on a Mac over Bluetooth to a car: audio was inaudible
 * unless Music.app was playing at the same time, the car kept launching Music
 * on connect, and the dashboard was blank. All three follow from the page
 * making noise without being a media session, so the head unit had nothing to
 * gate its A2DP stream on and nowhere to send its AVRCP PLAY.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  MediaSessionController,
  mediaSessionInfo,
  supportsMediaSession,
} from '../mediaSession';

describe('mediaSessionInfo — what the dashboard reads', () => {
  it('shows the tune and the author', () => {
    expect(mediaSessionInfo({ name: 'Elekfunk', author: 'Spot' }, 'MOD')).toEqual({
      title: 'Elekfunk',
      artist: 'Spot',
      album: 'MOD',
    });
  });

  it('never shows a blank line — an untitled module still gets a name', () => {
    const info = mediaSessionInfo({ name: '   ', author: '' }, null);
    expect(info.title).toBe('DEViLBOX');
    expect(info.artist).toBe('DEViLBOX');
    expect(info.album).toBe('Tracker');
  });

  it('survives having no project at all', () => {
    expect(mediaSessionInfo(null).title).toBe('DEViLBOX');
    expect(mediaSessionInfo(undefined).artist).toBe('DEViLBOX');
  });

  it('trims what the user typed rather than passing padding to the OS', () => {
    expect(mediaSessionInfo({ name: '  Dub Plate  ' }).title).toBe('Dub Plate');
  });
});

describe('MediaSessionController', () => {
  let playCalls: number;
  let pauseCalls: number;
  let handlers: Map<string, () => void>;

  beforeEach(() => {
    playCalls = 0;
    pauseCalls = 0;
    handlers = new Map();
    // happy-dom has no media element playback and no mediaSession.
    (globalThis as { MediaMetadata?: unknown }).MediaMetadata = class {
      init: unknown;
      constructor(init: unknown) { this.init = init; }
    };
    Object.defineProperty(navigator, 'mediaSession', {
      configurable: true,
      value: {
        playbackState: 'none',
        metadata: null,
        setActionHandler: (action: string, fn: () => void) => { handlers.set(action, fn); },
      },
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      playCalls++;
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => { pauseCalls++; });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as { MediaMetadata?: unknown }).MediaMetadata;
  });

  it('is available once the browser exposes mediaSession', () => {
    expect(supportsMediaSession()).toBe(true);
  });

  it('starts a media element when the transport plays — that is what opens the car stream', async () => {
    const c = new MediaSessionController();
    c.setPlaybackState('playing');
    await Promise.resolve();
    expect(playCalls).toBe(1);
    expect(navigator.mediaSession.playbackState).toBe('playing');
    c.dispose();
  });

  it('holds exactly one element across repeated plays', async () => {
    const c = new MediaSessionController();
    c.setPlaybackState('playing');
    await Promise.resolve();
    c.setPlaybackState('paused');
    c.setPlaybackState('playing');
    await Promise.resolve();
    expect(playCalls).toBe(2);
    expect(pauseCalls).toBe(1);
    c.dispose();
  });

  it('pauses without rewinding, and stopping rewinds', async () => {
    const c = new MediaSessionController();
    c.setPlaybackState('playing');
    await Promise.resolve();
    c.setPlaybackState('paused');
    expect(navigator.mediaSession.playbackState).toBe('paused');
    c.setPlaybackState('none');
    expect(navigator.mediaSession.playbackState).toBe('none');
    c.dispose();
  });

  it('routes the car\'s transport buttons to the app', () => {
    const c = new MediaSessionController();
    let played = 0, paused = 0, stopped = 0;
    c.setHandlers({
      play: () => { played++; },
      pause: () => { paused++; },
      stop: () => { stopped++; },
    });
    handlers.get('play')?.();
    handlers.get('pause')?.();
    handlers.get('stop')?.();
    expect([played, paused, stopped]).toEqual([1, 1, 1]);
    c.dispose();
  });

  it('keeps the remaining actions when the browser rejects one', () => {
    const rejected: string[] = [];
    (navigator.mediaSession as unknown as {
      setActionHandler: (a: string, f: () => void) => void;
    }).setActionHandler = (action: string, fn: () => void) => {
      if (action === 'stop') { rejected.push(action); throw new Error('unsupported'); }
      handlers.set(action, fn);
    };
    const c = new MediaSessionController();
    let played = 0;
    c.setHandlers({ play: () => { played++; }, pause: () => {}, stop: () => {} });
    expect(rejected).toEqual(['stop']);
    handlers.get('play')?.();
    expect(played).toBe(1);
    c.dispose();
  });

  it('publishes metadata the dashboard can show', () => {
    const c = new MediaSessionController();
    c.setMetadata({ title: 'Dub Plate', artist: 'Spot', album: 'MOD' });
    expect(navigator.mediaSession.metadata).toBeTruthy();
    c.dispose();
  });

  it('gives the element back on dispose, so a reload does not leave one playing', async () => {
    const c = new MediaSessionController();
    c.setPlaybackState('playing');
    await Promise.resolve();
    c.dispose();
    expect(pauseCalls).toBe(1);
  });

  it('a refused autoplay leaves the app playing as it always did', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('NotAllowedError'));
    const c = new MediaSessionController();
    expect(() => c.setPlaybackState('playing')).not.toThrow();
    await Promise.resolve();
    c.dispose();
  });
});

describe('MediaSessionController on a browser without the API', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: undefined });
    // `'mediaSession' in navigator` is still true with an undefined value, so
    // remove the property outright — this is the Firefox-on-Linux shape.
    delete (navigator as unknown as Record<string, unknown>).mediaSession;
  });

  it('reports itself unsupported rather than throwing', () => {
    expect(supportsMediaSession()).toBe(false);
  });

  it('every call is inert', () => {
    const c = new MediaSessionController();
    expect(() => {
      c.setHandlers({ play: () => {}, pause: () => {}, stop: () => {} });
      c.setMetadata({ title: 'x', artist: 'y', album: 'z' });
      c.dispose();
    }).not.toThrow();
  });
});

/**
 * Reachability: a media session nothing mounts is a media session that does
 * not exist, which is the state the car found us in.
 */
describe('wiring contract — the session is actually mounted', () => {
  const hook = readFileSync(join(__dirname, '..', '..', '..', 'hooks', 'useMediaSession.ts'), 'utf8');
  const app = readFileSync(join(__dirname, '..', '..', '..', 'App.tsx'), 'utf8');

  it('App mounts the hook', () => {
    expect(app).toContain("import { useMediaSession } from './hooks/useMediaSession'");
    expect(app).toMatch(/^\s*useMediaSession\(\);/m);
  });

  it('follows the transport rather than a timer', () => {
    expect(hook).toContain('useTransportStore(s => s.isPlaying)');
    expect(hook).toContain('useTransportStore(s => s.isPaused)');
    expect(hook).toContain('setPlaybackState(');
  });

  it('reads the transport actions at call time, not at mount', () => {
    expect(hook).toContain('useTransportStore.getState().play()');
    expect(hook).toContain('useTransportStore.getState().pause()');
    expect(hook).toContain('useTransportStore.getState().stop()');
  });

  it('names the tune from the project, not from a constant', () => {
    expect(hook).toContain('useProjectStore(s => s.metadata.name)');
    expect(hook).toContain('mediaSessionInfo({ name, author }, sourceFormat)');
  });

  it('disposes on unmount', () => {
    expect(hook).toContain('c.dispose()');
  });
});
