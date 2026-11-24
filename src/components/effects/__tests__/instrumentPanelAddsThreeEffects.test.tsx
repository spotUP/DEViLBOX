/**
 * The instrument editor's effect chain takes more than one effect.
 *
 * Owner 2026-11-24: "i can only add one effect". EditInstrumentModal renders
 * InstrumentEffectsPanel with hideHeader, which hid the header Add button; the
 * only other add path was the empty-chain button, gone after the first effect.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import { InstrumentEffectsPanel } from '../InstrumentEffectsPanel';
import { InstrumentEffectsModal } from '../InstrumentEffectsModal';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import type { InstrumentConfig } from '@typedefs/instrument';

afterEach(cleanup);
beforeEach(() => {
  useInstrumentStore.setState({ instruments: [{ id: 1, name: 'Test', effects: [] } as unknown as InstrumentConfig], currentInstrumentId: 1 });
});

function Harness() {
  const effects = useInstrumentStore((s) => s.instruments.find((i) => i.id === 1)?.effects ?? []);
  return <InstrumentEffectsPanel instrumentId={1} instrumentName="Test" effects={effects} hideHeader />;
}

function addThroughPicker(label: string): void {
  fireEvent.click(screen.getByText(/Add Effect/));
  const buttons = screen.getAllByText(label).map((el) => el.closest('button')).filter(Boolean) as HTMLButtonElement[];
  fireEvent.click(buttons[buttons.length - 1]);
}

describe('Instrument FX panel (hideHeader, as in the instrument editor)', () => {
  it('adding 3 effects through the picker leaves 3 in the chain', () => {
    render(<Harness />);
    addThroughPicker('Compressor');
    addThroughPicker('Reverb');
    addThroughPicker('Compressor');
    const types = useInstrumentStore.getState().instruments[0].effects.map((fx) => fx.type);
    expect(types).toEqual(['Compressor', 'Reverb', 'Compressor']);
  });
});

describe('Instrument FX modal (the Master Effects editor pointed at the instrument)', () => {
  it('adding 3 effects through its browser leaves 3 in the instrument chain, with no channel scope', () => {
    render(<InstrumentEffectsModal isOpen onClose={() => {}} />);
    for (const label of ['Compressor', 'Reverb', 'Compressor']) {
      const buttons = screen.getAllByText(label).map((el) => el.closest('button')).filter(Boolean) as HTMLButtonElement[];
      fireEvent.click(buttons[buttons.length - 1]);
    }
    const types = useInstrumentStore.getState().instruments[0].effects.map((fx) => fx.type);
    expect(types).toEqual(['Compressor', 'Reverb', 'Compressor']);
    expect(screen.getByText('Effect Chain')).toBeTruthy();
    expect(screen.queryByText('Apply to')).toBeNull();
  });
});
