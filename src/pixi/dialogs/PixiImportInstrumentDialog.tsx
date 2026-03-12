/**
 * PixiImportInstrumentDialog — GL-native instrument preview dialog for .dbi files.
 * Pixel-perfect match to DOM: src/components/dialogs/ImportInstrumentDialog.tsx
 *
 * DOM structure:
 *   backdrop bg-black/80 → PixiModal overlayAlpha=0.8
 *   container bg-dark-bgPrimary border-2 border-accent-primary rounded-xl p-6
 *     → width=384 (max-w-sm), borderRadius=12, borderWidth=2
 *   header: icon + title + filename → flexRow gap 12, mb-5
 *   preview box: bg-dark-bgSecondary rounded-lg p-4 mb-5
 *   actions: flex gap-3 justify-end → PixiModalFooter
 */

import React, { useState, useEffect } from 'react';
import { PixiModal, PixiModalFooter, PixiButton, PixiLabel, PixiIcon } from '../components';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';

interface InstrumentPreview {
  name: string;
  synthType: string;
}

interface PixiImportInstrumentDialogProps {
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

const MODAL_W = 384;
const MODAL_H = 300;

export const PixiImportInstrumentDialog: React.FC<PixiImportInstrumentDialogProps> = ({
  isOpen,
  file,
  onConfirm,
  onCancel,
}) => {
  const theme = usePixiTheme();
  const [preview, setPreview] = useState<InstrumentPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    <PixiModal
      isOpen={isOpen}
      onClose={onCancel}
      width={MODAL_W}
      height={MODAL_H}
      overlayAlpha={0.8}
      borderWidth={2}
      borderRadius={12}
      borderColor={theme.accent.color}
    >
      {/* Content — p-6 = padding 24 */}
      <layoutContainer layout={{ flex: 1, flexDirection: 'column', padding: 24 }}>

        {/* Header row — icon + title + filename, mb-5 = marginBottom 20 */}
        <layoutContainer layout={{ flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 20 }}>
          <PixiIcon name="preset-a" size={20} color={theme.accent.color} layout={{}} />
          <layoutContainer layout={{ flexDirection: 'column', flex: 1, gap: 2 }}>
            <pixiBitmapText
              text="Add Instrument?"
              style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 20, fill: 0xffffff }}
              tint={theme.text.color}
              layout={{}}
            />
            <pixiBitmapText
              text={file.name}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 14, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
            />
          </layoutContainer>
        </layoutContainer>

        {error ? (
          <PixiLabel text={error} size="sm" color="error" layout={{ marginBottom: 20 }} />
        ) : preview ? (
          /* Preview box — bg-dark-bgSecondary rounded-lg p-4 mb-5 */
          <layoutContainer
            layout={{
              padding: 16,
              borderRadius: 8,
              backgroundColor: theme.bgSecondary.color,
              flexDirection: 'column',
              gap: 2,
              marginBottom: 20,
            }}
          >
            <pixiBitmapText
              text={preview.name}
              style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 18, fill: 0xffffff }}
              tint={theme.text.color}
              layout={{}}
            />
            <PixiLabel text={typeLabel} size="sm" color="textMuted" />
          </layoutContainer>
        ) : (
          /* Loading */
          <layoutContainer layout={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 20 }}>
            <PixiIcon name="preset-a" size={14} color={theme.textMuted.color} layout={{}} />
            <PixiLabel text="Reading instrument…" size="sm" color="textMuted" />
          </layoutContainer>
        )}
      </layoutContainer>

      <PixiModalFooter>
        <PixiButton label="Cancel" variant="ghost" onClick={onCancel} />
        <PixiButton label="Add to Project" variant="primary" onClick={onConfirm} disabled={!preview && !error} />
      </PixiModalFooter>
    </PixiModal>
  );
};
