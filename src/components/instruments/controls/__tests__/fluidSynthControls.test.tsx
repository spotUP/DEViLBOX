// src/components/instruments/controls/__tests__/fluidSynthControls.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { GM2_NAMES } from '@lib/import/GMSoundBank';

const fontNames = (bank: number): string[] => {
  const names = new Array<string>(128).fill('');
  if (bank === 128) { names[0] = 'Standard 1'; names[25] = '808/909'; }
  else { names[0] = 'Grand Piano'; names[4] = 'Tine Electric Piano'; }
  return names;
};

vi.mock('@/hooks/useFluidSynthPresetNames', () => ({
  useFluidSynthPresetNames: (bank: number) => fontNames(bank),
}));

const { FluidSynthControls, fluidProgramOptions } = await import('@/components/instruments/controls/FluidSynthControls');

afterEach(cleanup);

describe('FluidSynth editor', () => {
  it('lists all 128 General MIDI instruments on a melodic bank', () => {
    const options = fluidProgramOptions(0, 0, fontNames(0));
    expect(options).toHaveLength(128);
    expect(options.map((o) => o.label)).toEqual(GM2_NAMES.map((n, i) => `${i}: ${n}`));
  });

  it('lists only the drum kits the loaded SoundFonts hold on bank 128, plus the current program', () => {
    const options = fluidProgramOptions(128, 40, fontNames(128));
    expect(options.map((o) => o.label)).toEqual(['0: Standard 1', '25: 808/909', '40: Program 40']);
  });

  it('shows the resolved SoundFont preset and labels the shared sections song-wide', () => {
    render(<FluidSynthControls config={{ bank: 0, program: 4 }} onChange={() => {}} />);
    expect(screen.getByTestId('fluid-preset-name').textContent).toBe('SoundFont preset: Tine Electric Piano');
    for (const heading of ['Reverb', 'Chorus', 'Master']) {
      expect(screen.getByRole('heading', { name: `${heading} (song-wide)` })).toBeTruthy();
    }
    expect(screen.queryByText('Tuning')).toBeNull();
  });

  it('names the drum bank and reports a program the fonts lack', () => {
    render(<FluidSynthControls config={{ bank: 128, program: 40 }} onChange={() => {}} />);
    expect(screen.getByText('Drum Kit')).toBeTruthy();
    expect(screen.getByTestId('fluid-preset-name').textContent)
      .toBe('SoundFont preset: No preset at bank 128, program 40 in the loaded SoundFonts');
  });
});
