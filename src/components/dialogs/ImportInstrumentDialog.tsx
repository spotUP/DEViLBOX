/**
 * ImportInstrumentDialog — Preview dialog for .dbi (DEViLBOX instrument) files.
 *
 * Parses the JSON locally to show the instrument name and type before
 * adding it to the current project.
 */

import React, { useState, useEffect } from 'react';
import { Cpu } from 'lucide-react';
import { Button } from '@components/ui/Button';

interface InstrumentPreview {
  name: string;
  synthType: string;
}

interface ImportInstrumentDialogProps {
  isOpen: boolean;
  file: File | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const SYNTH_LABELS: Record<string, string> = {
  Synth:          'Subtractive Synth',
  MonoSynth:      'Mono Synth',
  DuoSynth:       'Duo Synth',
  FMSynth:        'FM Synth',
  AMSynth:        'AM Synth',
  PluckSynth:     'Pluck Synth',
  MetalSynth:     'Metal Synth',
  MembraneSynth:  'Membrane Synth',
  NoiseSynth:     'Noise Synth',
  TB303:          'TB-303 Bass Synth',
  Sampler:        'Sampler',
  Player:         'Audio Player',
  Wavetable:      'Wavetable Synth',
  GranularSynth:  'Granular Synth',
  SuperSaw:       'Super Saw',
  PolySynth:      'Poly Synth',
  Organ:          'Organ',
  DrumMachine:    'Drum Machine',
  ChipSynth:      'Chip Synth',
  PWMSynth:       'PWM Synth',
  StringMachine:  'String Machine',
  FormantSynth:   'Formant Synth',
  Furnace:        'Furnace Chip',
};

export const ImportInstrumentDialog: React.FC<ImportInstrumentDialogProps> = ({
  isOpen,
  file,
  onConfirm,
  onCancel,
}) => {
  const [preview, setPreview] = useState<InstrumentPreview | null>(null);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setPreview(null); setError(null); return; }

    setPreview(null);
    setError(null);

    file.text().then(text => {
      try {
        const data = JSON.parse(text);
        if (data.format !== 'devilbox-instrument') {
          setError('Not a valid DEViLBOX instrument file.');
          return;
        }
        const inst = data.instrument ?? {};
        setPreview({
          name:      inst.name      || 'Unnamed Instrument',
          synthType: inst.synthType || 'Unknown',
        });
      } catch {
        setError('Could not parse instrument file.');
      }
    }).catch(() => setError('Could not read file.'));
  }, [file]);

  if (!isOpen || !file) return null;

  const typeLabel = preview ? (SYNTH_LABELS[preview.synthType] ?? preview.synthType) : '';

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-dark-bgPrimary border-2 border-accent-primary rounded-xl p-6 max-w-sm w-full mx-4 animate-slide-in-up shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <Cpu className="w-5 h-5 text-accent-primary flex-shrink-0" />
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-white leading-tight">Add Instrument?</h2>
            <p className="text-text-muted text-xs font-mono truncate">{file.name}</p>
          </div>
        </div>

        {error ? (
          <p className="text-red-400 text-sm mb-5">{error}</p>
        ) : preview ? (
          <div className="bg-dark-bgSecondary rounded-lg p-4 mb-5">
            <p className="text-white font-bold text-base truncate">{preview.name}</p>
            <p className="text-text-muted text-sm mt-0.5">{typeLabel}</p>
          </div>
        ) : (
          <div className="text-text-muted text-sm mb-5 flex items-center gap-2">
            <Cpu className="w-4 h-4 animate-pulse" />
            Reading instrument…
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={onConfirm} disabled={!preview && !error}>
            Add to Project
          </Button>
        </div>
      </div>
    </div>
  );
};
