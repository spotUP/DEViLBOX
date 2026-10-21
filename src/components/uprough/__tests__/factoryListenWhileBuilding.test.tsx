/**
 * R2f-33d/e: the Listen while building switch in the factory panel and the "Preview before mastering" caption.
 * Real service, real player; only the render backend and the audio context are fakes.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import fixture from '@/lib/uprough/__tests__/fixtures/e6.uprough-song.json';

vi.mock('@engine/ToneEngine', () => {
  const engine: unknown = new Proxy({}, { get: (_t, k) => () => (k === 'preloadInstruments' ? Promise.resolve() : undefined) });
  return { getToneEngine: () => engine, ToneEngine: { getInstance: () => engine } };
});
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => undefined, classifyInstruments: () => undefined }) },
}));
vi.mock('@/utils/audio-context', () => ({ getDevilboxAudioContext: () => undefined }));

import { FactoryPanel, PREVIEW_CAPTION } from '../FactoryPanel';
import { openUpRoughSong } from '@/lib/uprough/openUpRoughSong';
import { renderUpRoughSong, setRenderBackendForTests, type RenderBackend } from '@/lib/uprough/upRoughSongService';
import { setPlayerAudioForTests, stopUpRoughSong, upRoughPreviewState, type PlayerAudio } from '@/lib/uprough/upRoughSongPlayer';
import { useUpRoughRenderStore } from '@stores/useUpRoughRenderStore';
import type { PartialMix } from '@/lib/uprough/songRenderJob';

let starts = 0;
const fakeAudio: PlayerAudio = {
  context: {
    currentTime: 0,
    createBuffer: (_c: number, length: number, sampleRate: number) => ({ length, sampleRate, getChannelData: () => new Float32Array(length) }) as unknown as AudioBuffer,
    createBufferSource: () => ({
      buffer: null, loop: false, connect: () => undefined, disconnect: () => undefined, stop: () => undefined,
      start: () => { starts++; },
    }) as unknown as AudioBufferSourceNode,
  },
  destination: {} as AudioNode,
};

function manualBackend(): { backend: RenderBackend; partial: (p: PartialMix) => void; finish: (mix: Float64Array) => void } {
  let onPartial: ((p: PartialMix) => void) | undefined;
  let resolve: ((m: Float64Array) => void) | undefined;
  return {
    backend: { render(_e, _o, _s, _r, p) { onPartial = p; return new Promise<Float64Array>((r) => { resolve = r; }); } },
    partial: (p) => onPartial!(p),
    finish: (mix) => resolve!(mix),
  };
}

beforeAll(async () => {
  setPlayerAudioForTests(fakeAudio);
  setRenderBackendForTests(manualBackend().backend, 5);
  await openUpRoughSong(JSON.stringify(fixture));
}, 60000);
afterEach(() => { cleanup(); stopUpRoughSong(); useUpRoughRenderStore.getState().set({ listenWhileBuilding: false }); });
afterAll(() => { setRenderBackendForTests(null); setPlayerAudioForTests(null); });

describe('Listen while building (R2f-33d/e)', () => {
  it('is off and disabled until a render is in flight; on, it plays the sections and the caption goes away at the swap', async () => {
    const m = manualBackend();
    setRenderBackendForTests(m.backend, 5);
    starts = 0;
    render(<FactoryPanel />);
    const toggle = screen.getByRole('button', { name: 'Listen while building' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect((toggle as HTMLButtonElement).disabled).toBe(true);

    let run!: Promise<unknown>;
    act(() => { run = renderUpRoughSong(); });
    expect((toggle as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText(PREVIEW_CAPTION)).toBeNull(); // nothing has landed yet

    act(() => { m.partial({ section: 0, start: 0, mix: new Float64Array(22050).fill(0.1) }); });
    expect(starts).toBe(1);
    expect(screen.getByText(PREVIEW_CAPTION)).toBeTruthy();

    await act(async () => { m.finish(new Float64Array(44100).fill(0.9)); await run; });
    expect(upRoughPreviewState()).toBe('mastered');
    expect(starts).toBe(2); // exactly one swap
    expect(screen.queryByText(PREVIEW_CAPTION)).toBeNull();
  });

  it('left on, the next render (an edit re-render) starts the preview by itself', async () => {
    const first = manualBackend();
    setRenderBackendForTests(first.backend, 5);
    render(<FactoryPanel />);
    let run!: Promise<unknown>;
    act(() => { run = renderUpRoughSong(); });
    fireEvent.click(screen.getByRole('button', { name: 'Listen while building' }));
    await act(async () => { first.finish(new Float64Array(100)); await run; });

    const second = manualBackend();
    setRenderBackendForTests(second.backend, 5);
    starts = 0;
    act(() => { run = renderUpRoughSong(); });
    act(() => { second.partial({ section: 0, start: 0, mix: new Float64Array(100).fill(0.1) }); });
    expect(starts).toBe(1);
    expect(screen.getByText(PREVIEW_CAPTION)).toBeTruthy();
    await act(async () => { second.finish(new Float64Array(100)); await run; });
  });

  it('off, a render plays nothing and shows no caption', async () => {
    const m = manualBackend();
    setRenderBackendForTests(m.backend, 5);
    starts = 0;
    render(<FactoryPanel />);
    let run!: Promise<unknown>;
    act(() => { run = renderUpRoughSong(); });
    act(() => { m.partial({ section: 0, start: 0, mix: new Float64Array(100).fill(0.1) }); });
    expect(starts).toBe(0);
    expect(screen.queryByText(PREVIEW_CAPTION)).toBeNull();
    await act(async () => { m.finish(new Float64Array(100)); await run; });
  });
});
