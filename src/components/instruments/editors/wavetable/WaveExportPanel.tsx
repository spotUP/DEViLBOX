/**
 * Waveform Studio export control: the selected wave as audio, a C header, a raw chip dump,
 * or (when the host instrument can save) a Furnace instrument carrying the waves and macros.
 */
import React, { useState } from 'react';
import * as FileSaver from 'file-saver';
import { CustomSelect } from '@components/common/CustomSelect';
import { Button } from '@components/ui/Button';
import { notify } from '@stores/useNotificationStore';
import type { ChipTarget } from './chipTargets';
import { waveToCHeader, waveToRawBytes, waveToUnitSamples, waveIdentifier } from './waveExport';

type ExportFormat = 'wav' | 'h' | 'bin' | 'fui';

/** Single-cycle .wav rate: the ProTracker C-3 rate, so a loaded cycle plays near middle pitch. */
const WAV_RATE = 8363;

export interface WaveExportPanelProps {
  data: number[];
  max: number;
  target: ChipTarget;
  /** Base file name, e.g. "Lead Wave 3". */
  name: string;
  /** Saves the whole instrument as .fui; the option shows only when given. */
  onExportInstrument?: () => void;
}

export const WaveExportPanel: React.FC<WaveExportPanelProps> = ({ data, max, target, name, onExportInstrument }) => {
  const [format, setFormat] = useState<ExportFormat>('wav');
  const fileBase = waveIdentifier(name);

  const exportWave = async () => {
    try {
      if (format === 'fui') { onExportInstrument?.(); return; }
      if (format === 'h') {
        FileSaver.saveAs(new Blob([waveToCHeader(name, data, max, target)], { type: 'text/plain' }), `${fileBase}.h`);
      } else if (format === 'bin') {
        FileSaver.saveAs(new Blob([waveToRawBytes(data, max, target).slice().buffer]), `${fileBase}.${target.id}.bin`);
      } else {
        const samples = waveToUnitSamples(data, max, target);
        const buffer = new AudioBuffer({ length: samples.length, sampleRate: WAV_RATE, numberOfChannels: 1 });
        buffer.copyToChannel(samples, 0);
        const { audioBufferToWav } = await import('@lib/export/audioExport');
        FileSaver.saveAs(audioBufferToWav(buffer), `${fileBase}.wav`);
      }
    } catch (e) {
      notify.error(`Could not export ${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const options = [
    { value: 'wav', label: 'Wave Audio (.wav)' },
    { value: 'h', label: 'C Header (.h)' },
    { value: 'bin', label: `Raw ${target.name} Dump (.bin)` },
    ...(onExportInstrument ? [{ value: 'fui', label: 'Furnace Instrument (.fui)' }] : []),
  ];

  return (
    <div className="flex items-center gap-2 px-2 pb-2">
      <span className="text-[10px] font-mono text-text-muted">Export</span>
      <CustomSelect
        value={format}
        onChange={(v) => setFormat(v as ExportFormat)}
        className="bg-dark-bgTertiary border border-dark-borderLight rounded px-1 py-0.5 text-text-primary font-mono text-xs"
        options={options}
      />
      <Button variant="primary" size="sm" onClick={() => { void exportWave(); }}>
        Export
      </Button>
    </div>
  );
};
