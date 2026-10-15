import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CZ101PatchBrowser } from '../CZ101PatchBrowser';
import { CZ101_PRESET_BANK } from '@engine/cz101/cz101Presets';
import { CZ101_TONE_PARAM, encodeCzSysex } from '@engine/cz101/cz101Sysex';
import { useCz101UserPatchStore } from '@stores/useCz101UserPatchStore';

describe('CZ-101 patch browser (the Simple UI)', () => {
  it('offers the SysEx load button, and a loaded .syx becomes a User patch that is selected', async () => {
    useCz101UserPatchStore.setState({ patches: [] });
    const changes: Array<[string, number]> = [];
    const texts: Array<[string, string]> = [];
    const { container } = render(<CZ101PatchBrowser parameters={{}} onParamChange={(k, v) => changes.push([k, v])} onTextParamChange={(k, v) => texts.push([k, v])} />);
    expect(screen.getByRole('button', { name: /Load SysEx File/i })).toBeTruthy();
    const bytes = encodeCzSysex(CZ101_PRESET_BANK[0].patch);
    const file = new File([bytes.slice().buffer], 'My Patch.syx');
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(useCz101UserPatchStore.getState().patches.length).toBe(1));
    expect(texts.some(([k, v]) => k === CZ101_TONE_PARAM && v.length > 0), 'the imported patch becomes the instrument\'s own sound').toBe(true);
    expect(changes.some(([k]) => k === 'waveform1'), 'and moves the knobs it implies').toBe(true);
    expect(await screen.findByRole('button', { name: /My Patch/i })).toBeTruthy();
  });
});
