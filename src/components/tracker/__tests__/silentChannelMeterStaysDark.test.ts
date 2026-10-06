import { describe, it, expect } from 'vitest';
import { waveformVuLevel } from '../waveformVuLevel';

// libopenmpt's oscilloscope capture of a silent channel carries the bleed of
// the neighbouring channel (peak ~0.09 of full scale on the Chuck Biscuits
// jukebox file chiptracker.cba, channels 3 and 4, measured in node).
const bleed = Int16Array.from({ length: 128 }, (_, i) => Math.round(Math.sin(i / 3) * 0.09 * 32768));

describe('silent channel meter stays dark', () => {
  it('shows nothing for a channel whose engine level is zero, whatever its waveform bleed', () => {
    expect(waveformVuLevel(0, bleed)).toBe(0);
  });

  it('follows the engine level when the engine reports one', () => {
    expect(waveformVuLevel(0.4, bleed)).toBe(0.4);
  });

  it('still meters an engine with no levels of its own from the waveform peak', () => {
    const peak = waveformVuLevel(null, bleed);
    expect(peak).toBeGreaterThan(0.08);
    expect(peak).toBeLessThan(0.1);
  });

  it('is dark with no waveform and no engine level', () => {
    expect(waveformVuLevel(null, null)).toBe(0);
    expect(waveformVuLevel(null, new Int16Array(0))).toBe(0);
  });
});
