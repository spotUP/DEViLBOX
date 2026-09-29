/**
 * Master FX preset picker auditioning (owner ask 2026-09-29): "make the list
 * remember and go to my current fx when I open it ... I am also pondering if
 * it shouldn't close when I select an fx so I can browse and test smoothly,
 * clicking outside it could close it". Covers MasterEffectsModal; the Panel
 * shares the same MasterPresetMenu + fingerprint-matching wiring.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import { MasterEffectsModal } from '../MasterEffectsModal';
import { useAudioStore } from '@stores/useAudioStore';
import { MASTER_FX_PRESETS } from '@constants/fxPresets';

afterEach(cleanup);
beforeEach(() => useAudioStore.getState().setMasterEffects([]));

function openPresetMenu(): void {
  const buttons = screen.getAllByText(/^Presets:/).map((el) => el.closest('button')).filter(Boolean) as HTMLButtonElement[];
  fireEvent.click(buttons[buttons.length - 1]);
}

function clickRow(label: string): void {
  const els = screen.getAllByText(label);
  fireEvent.click(els[els.length - 1]);
}

describe('Master FX preset picker auditioning', () => {
  it('loading a factory preset replaces the chain and keeps the menu open', () => {
    render(<MasterEffectsModal isOpen onClose={() => {}} />);
    openPresetMenu();

    const preset = MASTER_FX_PRESETS[0];
    clickRow(preset.name);

    expect(useAudioStore.getState().masterEffects.map((fx) => fx.type)).toEqual(preset.effects.map((fx) => fx.type));
    // Still open: the search box is still in the document.
    expect(screen.queryByPlaceholderText('Search presets or effects...')).not.toBeNull();
  });

  it('"No FX" clears the chain and the button reflects it', () => {
    render(<MasterEffectsModal isOpen onClose={() => {}} />);
    openPresetMenu();
    clickRow(MASTER_FX_PRESETS[0].name);

    clickRow('No FX');

    expect(useAudioStore.getState().masterEffects).toEqual([]);
    expect(screen.queryByText('Presets: No FX')).not.toBeNull();
    // Still open after clearing too.
    expect(screen.queryByPlaceholderText('Search presets or effects...')).not.toBeNull();
  });

  it('closes on a pointerdown outside the menu and its toggle button', () => {
    render(<MasterEffectsModal isOpen onClose={() => {}} />);
    openPresetMenu();
    expect(screen.queryByPlaceholderText('Search presets or effects...')).not.toBeNull();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByPlaceholderText('Search presets or effects...')).toBeNull();
  });
});
