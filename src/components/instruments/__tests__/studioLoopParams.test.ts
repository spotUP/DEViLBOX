import { describe, it, expect } from 'vitest';
import { STUDIO_LOOP_PARAMS } from '../editors/wavetable/waveformOps';
import { readFileSync } from 'node:fs';

describe('Waveform Studio samples are looped', () => {
  it('loops the whole buffer forward', () => {
    expect(STUDIO_LOOP_PARAMS).toEqual({ loopStart: 0, loopEnd: 1, loopEnabled: true, loopType: 'forward' });
  });
  it('SampleEditor writes the loop params when the studio commits', () => {
    const src = readFileSync('src/components/instruments/SampleEditor.tsx', 'utf8');
    expect(src).toContain("handleBufferProcessed({ buffer: buf, dataUrl }, label, STUDIO_LOOP_PARAMS)");
  });
});
