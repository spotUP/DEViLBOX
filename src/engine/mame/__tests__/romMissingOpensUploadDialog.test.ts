/**
 * A ROM-based MAME synth that cannot find its ROM stayed silent and the user saw no prompt: TR707Synth only
 * logged a warning, nothing ever called _updateRomStatus(false), and the ROM upload dialog was opened only from
 * ToneEngine during song preload, which a keyboard-created instrument never reaches.
 *
 * A synth that finds no ROM now reports it through MAMEBaseSynth._updateRomStatus(false), which marks the
 * instrument _romsLoaded 0 and opens the upload dialog through showRomDialogForInstrument.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/utils/audio-context', () => ({
  getDevilboxAudioContext: () => ({ currentTime: 0, createGain: () => ({ connect: () => {}, gain: { value: 1 } }) }),
  timeToSeconds: (d: string | number) => (typeof d === 'number' ? d : parseFloat(d)),
  noteToMidi: () => 60,
}));

const loadTR707ROMs = vi.fn<() => Promise<Uint8Array | null>>();
vi.mock('@engine/mame/MAMEROMLoader', () => ({ loadTR707ROMs: () => loadTR707ROMs() }));

import { MAMEBaseSynth } from '@/engine/mame/MAMEBaseSynth';
import { TR707Synth } from '@/engine/tr707/TR707Synth';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { useRomDialogStore } from '@/stores/useRomDialogStore';
import type { InstrumentConfig } from '@/types/instrument/defaults';

const INSTRUMENT_ID = 7;

function seedTR707Instrument(): void {
  const inst = { id: INSTRUMENT_ID, name: 'TR-707', type: 'synth', synthType: 'MAMETR707', parameters: {} } as unknown as InstrumentConfig;
  useInstrumentStore.setState({ instruments: [inst] });
}

const romsLoaded = () =>
  (useInstrumentStore.getState().instruments.find((i) => i.id === INSTRUMENT_ID) as { parameters?: Record<string, unknown> })
    .parameters?._romsLoaded;

describe('ROM-based MAME synth without its ROM', () => {
  beforeEach(() => {
    useRomDialogStore.setState({ pendingRomRequest: null });
    seedTR707Instrument();
    // The worklet is out of scope: only the ROM branch of TR707Synth.initialize is under test.
    vi.spyOn(MAMEBaseSynth.prototype as unknown as { initialize: () => Promise<void> }, 'initialize').mockResolvedValue(undefined);
    const proto = TR707Synth.prototype as unknown as Record<string, (...args: unknown[]) => void>;
    vi.spyOn(proto, 'loadCombinedROM').mockImplementation(() => {});
    vi.spyOn(proto, 'setParameterById').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    loadTR707ROMs.mockReset();
  });

  it('a TR-707 with no ROM opens the ROM upload dialog', async () => {
    loadTR707ROMs.mockResolvedValue(null);
    const synth = new TR707Synth();
    await synth.ensureInitialized();

    await vi.waitFor(() => expect(useRomDialogStore.getState().pendingRomRequest).not.toBeNull());
    const request = useRomDialogStore.getState().pendingRomRequest!;
    expect(request.instrumentId).toBe(INSTRUMENT_ID);
    expect(request.synthType).toBe('MAMETR707');
    expect(romsLoaded()).toBe(0);
    expect(synth.romLoaded).toBe(false);
  });

  it('playing a TR-707 with no ROM opens the ROM upload dialog again after it was dismissed', async () => {
    loadTR707ROMs.mockResolvedValue(null);
    const synth = new TR707Synth();
    await synth.ensureInitialized();
    await vi.waitFor(() => expect(useRomDialogStore.getState().pendingRomRequest).not.toBeNull());

    useRomDialogStore.getState().dismissRomDialog();
    expect(useRomDialogStore.getState().pendingRomRequest).toBeNull();

    synth.triggerAttack('C-4');
    await vi.waitFor(() => expect(useRomDialogStore.getState().pendingRomRequest?.instrumentId).toBe(INSTRUMENT_ID));
  });

  it('a TR-707 with its ROM does not open the ROM upload dialog', async () => {
    loadTR707ROMs.mockResolvedValue(new Uint8Array(128 * 1024));
    const synth = new TR707Synth();
    await synth.ensureInitialized();

    await vi.waitFor(() => expect(romsLoaded()).toBe(1));
    expect(synth.romLoaded).toBe(true);
    expect(useRomDialogStore.getState().pendingRomRequest).toBeNull();
  });
});
