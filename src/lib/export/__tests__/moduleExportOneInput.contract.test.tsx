/**
 * U3b (plan 2026-10-07-one-load-save-export-path): module and MIDI export read
 * ONE input, the live song.
 *
 * Through the real top-level entries - the Module export panel, the MIDI
 * panel, the OctaMED "Export .mod" button, MCP export_mod / export_midi - a
 * song with a cell edited since it was loaded (never played) exports WITH the
 * edit, and the entries that share a writer give the same bytes. The sentinel
 * counts the calls into moduleExportService. OctaMED used to build its song by
 * hand from four stores, and the MIDI panel exported every pattern in storage
 * order with automation where MCP exported the order list without.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })) }));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));
// The OpenMPT WASM loads through a script tag (not in node): its writer is
// replaced by one that serialises exactly what it is given, so the test sees
// the INPUT each entry hands it (patterns, instruments, order, tempo, name).
vi.mock('../OpenMPTExporter', () => ({
  exportWithOpenMPT: vi.fn(async (patterns: unknown[], instruments: unknown[], order: number[], options: Record<string, unknown>) => ({
    data: new Blob([JSON.stringify({
      cell: (patterns as Array<{ channels: Array<{ rows: unknown[] }> }>)[0].channels[0].rows[63],
      patterns: patterns.length, instruments: instruments.length, order, options,
    })]),
    filename: 'x.mod', warnings: [],
  })),
}));
// Sentinel: the real service, counted.
vi.mock('../moduleExportService', async (importOriginal) => {
  const real = await importOriginal<typeof import('../moduleExportService')>();
  return {
    ...real,
    exportModuleFile: vi.fn(real.exportModuleFile),
    exportBakedMod: vi.fn(real.exportBakedMod),
    exportMidiFile: vi.fn(real.exportMidiFile),
  };
});

import { ModuleExportPanel } from '../ModuleExportPanel';
import { MidiExportPanel } from '../MidiExportPanel';
import { OctaMEDControls } from '@/components/instruments/controls/OctaMEDControls';
import { exportModuleFile, exportBakedMod, exportMidiFile } from '../moduleExportService';
import { exportMod, exportMidi } from '@/bridge/handlers/writeHandlers';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const downloads: Blob[] = [];
const bytes = async (b: Blob) => Array.from(new Uint8Array(await b.arrayBuffer()));
const fromB64 = (s: string) => Array.from(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
// What the stub writer was given: the song data, not the panel's own options (name, channel limit).
const songInput = (b: number[]) => {
  const { cell, patterns, instruments, order } = JSON.parse(String.fromCharCode(...b));
  return { cell, patterns, instruments, order };
};

async function loadMicro15() {
  const { importTrackerModule } = await import('@/lib/file/UnifiedFileLoader');
  const b = readFileSync(resolve(ROOT, 'src/__tests__/fixtures/micro15-goto80.mod'));
  const file = new File([b], 'micro15.mod');
  await importTrackerModule({
    metadata: { title: 'micro15', type: 'MOD', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
    arrayBuffer: await file.arrayBuffer(), file,
  } as never, { useLibopenmpt: true } as never);
}

async function editWithoutPlaying() {
  const { useTrackerStore } = await import('@/stores/useTrackerStore');
  useTrackerStore.getState().setCurrentPattern(0);
  useTrackerStore.getState().setCell(0, 63, { note: 37, instrument: 1 });
}

async function moduleFromPanel(): Promise<number[]> {
  downloads.length = 0;
  const handlerRef: React.MutableRefObject<(() => Promise<false | void>) | null> = { current: null };
  render(<ModuleExportPanel handlerRef={handlerRef} exportMode="mod" onClose={() => {}} />);
  await handlerRef.current!();
  cleanup();
  expect(downloads).toHaveLength(1);
  return bytes(downloads[0]);
}

async function bakedModFromOctaMED(): Promise<number[]> {
  downloads.length = 0;
  render(<OctaMEDControls config={{} as never} onChange={() => {}} />);
  fireEvent.click(screen.getByText('Export .mod'));
  await waitFor(() => expect(downloads).toHaveLength(1), { timeout: 20000 });
  cleanup();
  return bytes(downloads[0]);
}

async function midiFromPanel(): Promise<number[]> {
  downloads.length = 0;
  const handlerRef: React.MutableRefObject<(() => Promise<false | void>) | null> = { current: null };
  render(<MidiExportPanel handlerRef={handlerRef} selectedPatternIndex={0} setSelectedPatternIndex={() => {}} />);
  fireEvent.click(screen.getByText(/Full Song/));
  await handlerRef.current!();
  cleanup();
  expect(downloads).toHaveLength(1);
  return bytes(downloads[0]);
}

describe('one input for module and MIDI export (U3b)', () => {
  afterEach(() => cleanup());

  it('an edit made since the load, never played, is in every export, and entries sharing a writer agree', async () => {
    URL.createObjectURL = (b: Blob | MediaSource) => { downloads.push(b as Blob); return 'blob:x'; };
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = () => {};
    await loadMicro15();

    const before = {
      openmpt: await moduleFromPanel(),
      baked: await bakedModFromOctaMED(),
      midi: await midiFromPanel(),
    };
    await editWithoutPlaying();
    vi.mocked(exportModuleFile).mockClear(); vi.mocked(exportBakedMod).mockClear(); vi.mocked(exportMidiFile).mockClear();

    // OpenMPT writer: the panel and MCP export_mod.
    const panelMod = await moduleFromPanel();
    const mcpMod = await exportMod({ format: 'mod' });
    expect(exportModuleFile).toHaveBeenCalledTimes(2);
    expect(songInput(panelMod)).not.toEqual(songInput(before.openmpt));
    expect(songInput(panelMod).cell).toMatchObject({ note: 37, instrument: 1 });
    expect(songInput(fromB64(mcpMod.modBase64 as string))).toEqual(songInput(panelMod));

    // The OctaMED button: the baked MOD writer, same live song.
    const baked = await bakedModFromOctaMED();
    expect(exportBakedMod).toHaveBeenCalledTimes(1);
    expect(baked).not.toEqual(before.baked);

    // MIDI: the panel (full song) and MCP export_midi (song) give the same file, with the edit.
    const panelMidi = await midiFromPanel();
    const mcpMidi = await exportMidi({ scope: 'song' });
    expect(exportMidiFile).toHaveBeenCalledTimes(2);
    expect(panelMidi).not.toEqual(before.midi);
    expect(fromB64(mcpMidi.midiBase64 as string)).toEqual(panelMidi);
  }, 120000);
});
