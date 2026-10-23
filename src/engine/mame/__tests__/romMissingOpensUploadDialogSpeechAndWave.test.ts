/**
 * ES5503, TMS5220 and VLM5030 treated their ROM as optional: with none they stayed degraded or silent and never
 * asked. They now report a missing ROM through MAMEBaseSynth._updateRomStatus(false), which opens the same ROM
 * upload dialog as TR-707, and an uploaded ROM cached by cacheUploadedRom is picked up on the next load with no
 * dialog.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/utils/audio-context', () => ({
  getDevilboxAudioContext: () => ({ currentTime: 0, createGain: () => ({ connect: () => {}, gain: { value: 1 } }) }),
  timeToSeconds: (d: string | number) => (typeof d === 'number' ? d : parseFloat(d)),
  noteToMidi: () => 60,
}));

import { MAMEBaseSynth } from '@/engine/mame/MAMEBaseSynth';
import { ES5503Synth } from '@/engine/es5503/ES5503Synth';
import { TMS5220Synth } from '@/engine/tms5220/TMS5220Synth';
import { VLM5030Synth } from '@/engine/vlm5030/VLM5030Synth';
import { cacheUploadedRom, ES5503_ROM_CONFIG, TMS5220_ROM_CONFIG, VLM5030_ROM_CONFIG } from '@engine/mame/MAMEROMLoader';
import { deleteROM } from '@engine/mame/MAMEROMStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { useRomDialogStore } from '@/stores/useRomDialogStore';
import type { InstrumentConfig } from '@/types/instrument/defaults';

const INSTRUMENT_ID = 9;

interface Case {
  synthType: string;
  make: () => MAMEBaseSynth;
  config: { chipName: string };
  rom: Uint8Array;
}

/** Valid-looking images: 8 KiB for VLM5030, 32 KiB (two VSM chips) for TMS5220, any bytes for the ES5503 wavetable. */
const CASES: Case[] = [
  { synthType: 'MAMEES5503', make: () => new ES5503Synth(), config: ES5503_ROM_CONFIG, rom: new Uint8Array(8192).fill(0x80) },
  { synthType: 'MAMETMS5220', make: () => new TMS5220Synth(), config: TMS5220_ROM_CONFIG, rom: new Uint8Array(32768) },
  { synthType: 'MAMEVLM5030', make: () => new VLM5030Synth(), config: VLM5030_ROM_CONFIG, rom: new Uint8Array(8192).fill(1) },
];

function seed(synthType: string): void {
  const inst = { id: INSTRUMENT_ID, name: 'x', type: 'synth', synthType, parameters: {} } as unknown as InstrumentConfig;
  useInstrumentStore.setState({ instruments: [inst] });
}

function stubSpaFallbackFetch(): void {
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } })));
}

describe.each(CASES)('$synthType ROM is required', ({ synthType, make, config, rom }) => {
  beforeEach(async () => {
    await deleteROM(config.chipName);
    stubSpaFallbackFetch();
    useRomDialogStore.setState({ pendingRomRequest: null });
    seed(synthType);
    // The worklet is out of scope: only the ROM branch of initialize is under test.
    vi.spyOn(MAMEBaseSynth.prototype as unknown as { initialize: () => Promise<void> }, 'initialize').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('with no ROM anywhere it opens the ROM upload dialog', async () => {
    const synth = make();
    await synth.ensureInitialized();
    await vi.waitFor(() => expect(useRomDialogStore.getState().pendingRomRequest).not.toBeNull());
    const request = useRomDialogStore.getState().pendingRomRequest!;
    expect(request.instrumentId).toBe(INSTRUMENT_ID);
    expect(request.synthType).toBe(synthType);
    expect(synth.romLoaded).toBe(false);
  });

  it('with an uploaded ROM cached it loads on the next session without a dialog', async () => {
    expect(await cacheUploadedRom(synthType, 'rom.bin', rom.buffer.slice(0) as ArrayBuffer)).toBe(true);
    const synth = make();
    await synth.ensureInitialized();
    await vi.waitFor(() => expect(synth.romLoaded).toBe(true));
    expect(useRomDialogStore.getState().pendingRomRequest).toBeNull();
  });
});
