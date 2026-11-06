// Regression: SF-UI-REACH. A Sound Factory instrument (metadata.soundFactoryInstrument, synthType Sampler) must show its
// DefineInstr effect controls in the tracker knob panel (SynthControlsRouter), and a change must reach onUpdate.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { SynthControlsRouter } from '@components/tracker/SynthControlsRouter';
import { parseSoundFactoryFile } from '@/lib/import/formats/SoundFactoryParser';
import { SF_FLAG } from '@/lib/import/formats/soundFactoryInstrumentParams';
import type { InstrumentConfig } from '@/types';

afterEach(cleanup);

describe('Sound Factory instrument controls in the tracker knob panel', () => {
  it('renders Vibrato and Portamento for a goldrunner.psf instrument and writes a change to soundFactoryInstrument', async () => {
    const bytes = new Uint8Array(readFileSync('public/data/songs/formats/goldrunner.psf'));
    const song = parseSoundFactoryFile(bytes, 'goldrunner.psf');
    expect(song).not.toBeNull();
    const instrument = (song!.instruments as InstrumentConfig[]).find((i) => i.metadata?.soundFactoryInstrument);
    expect(instrument).toBeTruthy();
    const before = instrument!.metadata!.soundFactoryInstrument!.params.effectByte ?? 0;

    const onUpdate = vi.fn();
    render(<SynthControlsRouter instrument={instrument!} onUpdate={onUpdate} />);

    const vibrato = await screen.findByRole('button', { name: 'Vibrato' });
    expect(await screen.findByRole('button', { name: 'Portamento' })).toBeTruthy();

    fireEvent.click(vibrato);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const sent = onUpdate.mock.calls[0][0].metadata.soundFactoryInstrument;
    expect(sent.params.effectByte).toBe(before ^ SF_FLAG.vibrato);
    expect(sent.recordOffset).toBe(instrument!.metadata!.soundFactoryInstrument!.recordOffset);
  });
});
