/**
 * The sample editor on an ADPCM voice's `userSample`. Edits flow back as a new userSample (data and
 * rate), which FurnaceEditor pushes through the same live update as a WAV load: the running chip gets
 * the new PCM and the .fur export writes it as the module's SMP2.
 */
import React, { useCallback, useMemo } from 'react';
import { SampleEditor } from '../SampleEditor';
import { userSampleFromWavDataUrl, userSampleToWavDataUrl } from '@engine/furnace-dispatch/userSampleWav';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { FurnaceUserSample } from '@/types/instrument/furnace';

export interface FurnaceUserSampleEditorProps {
  instrumentId: number;
  sample: FurnaceUserSample;
  onChange: (sample: FurnaceUserSample) => void;
}

export const FurnaceUserSampleEditor: React.FC<FurnaceUserSampleEditorProps> = ({ instrumentId, sample, onChange }) => {
  const view = useMemo(() => ({
    id: instrumentId,
    name: sample.name,
    synthType: 'Sampler',
    parameters: { sampleUrl: userSampleToWavDataUrl(sample) },
  }) as unknown as InstrumentConfig, [instrumentId, sample]);

  const onViewChange = useCallback((updates: Partial<InstrumentConfig>) => {
    const url = (updates.parameters as Record<string, unknown> | undefined)?.sampleUrl;
    if (typeof url === 'string') onChange(userSampleFromWavDataUrl(url, sample.name));
  }, [onChange, sample.name]);

  return <SampleEditor instrument={view} onChange={onViewChange} />;
};
