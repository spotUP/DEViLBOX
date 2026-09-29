/**
 * Clicking an effect in the Master FX browser adds it to the chain.
 *
 * It used to add a "preview" that a second click replaced and that only an
 * "Add to Chain" button kept - the owner found the button confusing and
 * unneeded (2026-09-29): "add them directly to the chain".
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import { MasterEffectsModal } from '../MasterEffectsModal';
import { useAudioStore } from '@stores/useAudioStore';

afterEach(cleanup);
beforeEach(() => useAudioStore.getState().setMasterEffects([]));

function clickBrowserEffect(label: string): void {
  const buttons = screen.getAllByText(label).map((el) => el.closest('button')).filter(Boolean) as HTMLButtonElement[];
  fireEvent.click(buttons[buttons.length - 1]);
}

describe('Master FX browser', () => {
  it('each click adds the effect to the chain, with no confirm step', () => {
    render(<MasterEffectsModal isOpen onClose={() => {}} />);
    clickBrowserEffect('Compressor');
    clickBrowserEffect('Reverb');
    const types = useAudioStore.getState().masterEffects.map((fx) => fx.type);
    expect(types).toEqual(['Compressor', 'Reverb']);
    expect(screen.queryByText('Add to Chain')).toBeNull();
  });
});
