/**
 * SunVox editor Load Patch reachability: a new SunVoxSynth instrument was silent (no patch) and its editor had no way
 * to load one. Route: UnifiedInstrumentEditor -> 'sunvox-synth' branch -> SunVoxPatchLoader file input ->
 * sunvoxPatchConfigFromFile -> handleChange -> useInstrumentStore.updateInstrument -> ToneEngine.invalidateInstrument
 * (the next build runs InstrumentFactory, which calls setModule with the patch).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const seen = vi.hoisted(() => ({ invalidated: [] as number[] }));
vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({ invalidateInstrument: (id: number) => { seen.invalidated.push(id); } }),
}));

import { UnifiedInstrumentEditor } from '@/components/instruments/editors/UnifiedInstrumentEditor';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { DEFAULT_SUNVOX } from '@typedefs/instrument/defaults';
import type { InstrumentConfig } from '@typedefs/instrument';

describe('the SunVox editor Load Patch', () => {
  it('applies a chosen .sunsynth to this instrument and rebuilds its engine voice', async () => {
    const inst = { id: 7, name: 'SunVox', synthType: 'SunVoxSynth', sunvox: { ...DEFAULT_SUNVOX }, effects: [], volume: -6, pan: 0 } as unknown as InstrumentConfig;
    useInstrumentStore.setState({ instruments: [inst] });
    const Host = () => {
      const current = useInstrumentStore((s) => s.instruments.find((i) => i.id === 7)!);
      return <UnifiedInstrumentEditor instrument={current} onChange={(u) => useInstrumentStore.getState().updateInstrument(7, u)} />;
    };
    render(<Host />);
    expect(screen.getByText(/silent until a patch is loaded/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Load Patch' })).toBeTruthy();

    const bytes = new Uint8Array([9, 8, 7]);
    fireEvent.change(screen.getByTestId('sunvox-patch-input'), { target: { files: [new File([bytes], 'Lead.sunsynth')] } });

    await waitFor(() => expect(useInstrumentStore.getState().instruments[0].sunvox!.patchName).toBe('Lead'));
    const stored = useInstrumentStore.getState().instruments[0];
    expect(new Uint8Array(stored.sunvox!.patchData!)).toEqual(bytes);
    expect(stored.name).toBe('SunVox');
    expect(seen.invalidated, 'sentinel: engine voice invalidated').toContain(7);
    expect(screen.queryByText(/silent until a patch is loaded/i)).toBeNull();
  });
});
