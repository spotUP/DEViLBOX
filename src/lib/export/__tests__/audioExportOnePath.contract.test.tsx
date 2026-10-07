/**
 * U3a (plan 2026-10-07-one-load-save-export-path): ONE audio export.
 *
 * The Export panel and MCP export_wav / export_stems both reach
 * audioExportService.exportAudio (the sentinel counts the calls), which runs
 * the live capture of the export tap, and the same song comes out as the same
 * bytes through both. The tap is a deterministic stand-in (a fake context fed
 * a fixed signal); everything above it is the real code: the panel component,
 * the MCP handlers, the service, the transport orchestration, the encoders.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent, screen } from '@testing-library/react';
import React from 'react';

const tap = vi.hoisted(() => ({ connects: 0, rate: 2000, seed: 0 }));

vi.mock('tone', async (importOriginal) => {
  const actual = await importOriginal<typeof import('tone')>();
  // The signal depends on how many captures already ran only through `seed`,
  // which each test pins; the two callers therefore see the same stream.
  const ctx = {
    get sampleRate() { return tap.rate; },
    destination: {},
    createGain: () => ({ gain: { value: 0 }, connect: () => {} }),
    createBuffer: (ch: number, len: number, sr: number) => {
      const data = Array.from({ length: ch }, () => new Float32Array(len));
      return { numberOfChannels: ch, length: len, sampleRate: sr, getChannelData: (c: number) => data[c] };
    },
    createScriptProcessor: () => {
      const proc: { onaudioprocess: ((e: unknown) => void) | null; connect: () => void; disconnect: () => void } = {
        onaudioprocess: null, connect: () => {}, disconnect: () => {},
      };
      return proc;
    },
  };
  return { ...actual, getContext: () => ({ rawContext: ctx }) };
});
vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => ({ exportTap: {} }) }));
vi.mock('@/utils/audio-context', () => ({
  getDevilboxAudioContext: () => ({ state: 'running', resume: async () => {} }),
  // The tap: connecting the capture processor to it plays the fixed signal into it.
  getNativeAudioNode: () => ({
    connect: (proc: { onaudioprocess: ((e: unknown) => void) | null }) => {
      tap.connects++;
      const total = 120 * tap.rate;
      for (let at = 0; at < total; at += 4096) {
        const l = new Float32Array(4096); const r = new Float32Array(4096);
        for (let i = 0; i < 4096; i++) {
          l[i] = 0.5 * Math.sin((at + i + tap.seed) * 0.05);
          r[i] = 0.25 * Math.sin((at + i + tap.seed) * 0.031);
        }
        proc.onaudioprocess?.({ inputBuffer: { numberOfChannels: 2, getChannelData: (c: number) => (c === 0 ? l : r) } });
      }
    },
    disconnect: () => {},
  }),
}));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
// Sentinel: the real service, counted.
vi.mock('../audioExportService', async (importOriginal) => {
  const real = await importOriginal<typeof import('../audioExportService')>();
  return { ...real, exportAudio: vi.fn(real.exportAudio) };
});

import { AudioExportPanel } from '../AudioExportPanel';
import { exportAudio } from '../audioExportService';
import { exportWav, exportStems } from '@/bridge/handlers/writeHandlers';
import { useTransportStore } from '@/stores/useTransportStore';
import { useTrackerStore } from '@/stores/useTrackerStore';

const played = vi.fn(async () => {});
const downloads: Blob[] = [];

function silenceTransport() {
  useTransportStore.setState({
    play: played, stop: vi.fn(), setCurrentRow: vi.fn(), setCurrentPattern: vi.fn(), setIsLooping: vi.fn(),
    isLooping: false,
  } as never);
}

async function panelWav(): Promise<Uint8Array> {
  downloads.length = 0;
  const handlerRef: React.MutableRefObject<(() => Promise<false | void>) | null> = { current: null };
  render(
    <AudioExportPanel
      handlerRef={handlerRef} selectedPatternIndex={0} setSelectedPatternIndex={() => {}}
      isRendering={false} setIsRendering={() => {}} renderProgress={0} setRenderProgress={() => {}}
    />,
  );
  await handlerRef.current!();
  cleanup();
  expect(downloads).toHaveLength(1);
  return new Uint8Array(await downloads[0].arrayBuffer());
}

async function mcpWav(): Promise<Uint8Array> {
  const started = await exportWav({});
  expect(started.status).toBe('capturing');
  let done: Record<string, unknown> = {};
  await waitFor(async () => {
    done = await exportWav({ captureId: started.captureId });
    expect(done.status).toBe('done');
  }, { timeout: 20000 });
  return Uint8Array.from(atob(done.wavBase64 as string), (c) => c.charCodeAt(0));
}

describe('one audio export (U3a)', () => {
  beforeEach(() => {
    tap.connects = 0; tap.seed = 0;
    vi.mocked(exportAudio).mockClear(); played.mockClear();
    silenceTransport();
    URL.createObjectURL = (b: Blob | MediaSource) => { downloads.push(b as Blob); return 'blob:x'; };
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = () => {};
  });
  afterEach(() => cleanup());

  it('the Export panel and MCP export_wav both run exportAudio and give the same audio for the same song', async () => {
    const fromPanel = await panelWav();
    expect(exportAudio).toHaveBeenCalledTimes(1);
    expect(vi.mocked(exportAudio).mock.calls[0][0]).toMatchObject({ scope: 'song', format: 'wav', unmuteAll: true });
    const panelConnects = tap.connects;

    const fromMcp = await mcpWav();
    expect(exportAudio).toHaveBeenCalledTimes(2);
    expect(vi.mocked(exportAudio).mock.calls[1][0]).toMatchObject({ scope: 'song', format: 'wav' });

    // The capture ran once per caller, through the transport's play, and is not empty.
    expect(panelConnects).toBe(1);
    expect(tap.connects).toBe(2);
    expect(played).toHaveBeenCalledTimes(2);
    expect(fromPanel.length).toBeGreaterThan(44 + 2000 * 4);
    expect(Array.from(fromMcp)).toEqual(Array.from(fromPanel));
  }, 60000);

  it('the stems button and MCP export_stems both run exportAudio (scope stems) and give the same stems', async () => {
    downloads.length = 0;
    // Two channels keep the per-channel passes short.
    const { patterns } = useTrackerStore.getState();
    useTrackerStore.setState({ patterns: patterns.map((p) => ({ ...p, channels: p.channels.slice(0, 2) })) });
    const handlerRef: React.MutableRefObject<(() => Promise<false | void>) | null> = { current: null };
    render(
      <AudioExportPanel
        handlerRef={handlerRef} selectedPatternIndex={0} setSelectedPatternIndex={() => {}}
        isRendering={false} setIsRendering={() => {}} renderProgress={0} setRenderProgress={() => {}}
      />,
    );
    fireEvent.click(screen.getByText(/Export Stems/));
    await waitFor(() => expect(exportAudio).toHaveBeenCalledTimes(1), { timeout: 60000 });
    await waitFor(() => expect(downloads.length).toBeGreaterThan(0), { timeout: 60000 });
    cleanup();
    expect(vi.mocked(exportAudio).mock.calls[0][0]).toMatchObject({ scope: 'stems', format: 'wav' });
    const panelStems = await Promise.all(downloads.map(async (b) => new Uint8Array(await b.arrayBuffer())));

    const res = await exportStems({});
    expect(exportAudio).toHaveBeenCalledTimes(2);
    expect(vi.mocked(exportAudio).mock.calls[1][0]).toMatchObject({ scope: 'stems', format: 'wav' });
    const stems = res.stems as Array<{ wavBase64: string }>;
    expect(stems).toHaveLength(2);
    expect(panelStems).toHaveLength(2);
    stems.forEach((s, i) => {
      expect(Array.from(Uint8Array.from(atob(s.wavBase64), (c) => c.charCodeAt(0)))).toEqual(Array.from(panelStems[i]));
    });
  }, 240000);
});
