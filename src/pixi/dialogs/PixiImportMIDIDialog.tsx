/**
 * PixiImportMIDIDialog — GL-native import dialog for Standard MIDI Files (.mid/.midi).
 *
 * Parses the file locally with @tonejs/midi to extract metadata (BPM, tracks,
 * time signature) before committing to the import.  Exposes the four MIDI import
 * options: quantize grid, merge channels, velocity→volume, and pattern length.
 *
 * DOM reference: src/components/dialogs/ImportMIDIDialog.tsx
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  PixiModal,
  PixiModalHeader,
  PixiModalFooter,
  PixiButton,
  PixiLabel,
  PixiCheckbox,
} from '../components';
import { PixiSelect } from '../components/PixiSelect';
import { usePixiTheme } from '../theme';
import type { ModuleInfo } from '@/lib/import/ModuleLoader';
import type { ImportOptions } from '@/components/dialogs/ImportModuleDialog';
import type { MIDIImportOptions } from '@/lib/import/MIDIImporter';

// ── Types ──────────────────────────────────────────────────────────────────────

interface MIDIPreview {
  bpm: number;
  timeSignature: [number, number];
  tracks: number;
  totalSeconds: number;
  name: string;
}

interface PixiImportMIDIDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (info: ModuleInfo, options: ImportOptions) => void;
  initialFile?: File | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MODAL_W = 480;
const MODAL_H = 460;
const CONTENT_W = MODAL_W - 34;

const QUANTIZE_OPTIONS = [
  { value: '0', label: 'None' },
  { value: '1', label: '1 row' },
  { value: '2', label: '2 rows (½ beat)' },
  { value: '4', label: '4 rows (1 beat)' },
  { value: '8', label: '8 rows (2 beats)' },
];

const PATTERN_LENGTH_OPTIONS = [
  { value: '32', label: '32 rows' },
  { value: '64', label: '64 rows' },
  { value: '128', label: '128 rows' },
  { value: '256', label: '256 rows' },
];

/** Pre-blend two 0xRRGGBB colours at a given alpha (for semi-transparent backgrounds). */
function blendColor(base: number, overlay: number, alpha: number): number {
  const r1 = (base >> 16) & 0xFF, g1 = (base >> 8) & 0xFF, b1 = base & 0xFF;
  const r2 = (overlay >> 16) & 0xFF, g2 = (overlay >> 8) & 0xFF, b2 = overlay & 0xFF;
  return (Math.round(r1 + (r2 - r1) * alpha) << 16) | (Math.round(g1 + (g2 - g1) * alpha) << 8) | Math.round(b1 + (b2 - b1) * alpha);
}

// ── Component ──────────────────────────────────────────────────────────────────

export const PixiImportMIDIDialog: React.FC<PixiImportMIDIDialogProps> = ({
  isOpen,
  onClose,
  onImport,
  initialFile,
}) => {
  const theme = usePixiTheme();
  const [preview, setPreview] = useState<MIDIPreview | null>(null);
  const [moduleFile, setModuleFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // MIDI import options
  const [quantize, setQuantize] = useState(1);
  const [mergeChannels, setMergeChannels] = useState(false);
  const [velocityToVolume, setVelocityToVolume] = useState(true);
  const [patternLength, setPatternLength] = useState(64);

  // ── File parsing ───────────────────────────────────────────────────────────

  const handleFileSelect = useCallback(async (file: File) => {
    if (!/\.(mid|midi)$/i.test(file.name)) {
      setError('Please select a MIDI file (.mid or .midi).');
      return;
    }

    setIsLoading(true);
    setError(null);
    setPreview(null);
    setModuleFile(null);

    try {
      const buf = await file.arrayBuffer();
      const { Midi } = await import('@tonejs/midi');
      const midi = new Midi(buf);

      const bpm = midi.header.tempos.length > 0
        ? Math.round(midi.header.tempos[0].bpm)
        : 120;
      const timeSig: [number, number] = midi.header.timeSignatures.length > 0
        ? [midi.header.timeSignatures[0].timeSignature[0], midi.header.timeSignatures[0].timeSignature[1]]
        : [4, 4];

      setPreview({
        bpm,
        timeSignature: timeSig,
        tracks: midi.tracks.length,
        totalSeconds: Math.round(midi.duration),
        name: file.name.replace(/\.[^/.]+$/, ''),
      });
      setModuleFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse MIDI file');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-parse initialFile on mount / open
  useEffect(() => {
    if (initialFile && isOpen) {
      handleFileSelect(initialFile);
    }
  }, [initialFile, isOpen, handleFileSelect]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleImport = useCallback(() => {
    if (!moduleFile || !preview) return;

    const midiOptions: MIDIImportOptions = {
      quantize,
      mergeChannels,
      velocityToVolume,
      defaultPatternLength: patternLength,
    };

    const info: ModuleInfo = {
      metadata: {
        title: preview.name,
        type: 'MIDI',
        channels: preview.tracks,
        patterns: 0,
        orders: 0,
        instruments: 0,
        samples: 0,
        duration: preview.totalSeconds,
      },
      arrayBuffer: new ArrayBuffer(0),
      file: moduleFile,
    };

    onImport(info, { useLibopenmpt: false, midiOptions });
    onClose();
  }, [moduleFile, preview, quantize, mergeChannels, velocityToVolume, patternLength, onImport, onClose]);

  const handleClose = useCallback(() => {
    setPreview(null);
    setModuleFile(null);
    setError(null);
    onClose();
  }, [onClose]);

  // ── Render ─────────────────────────────────────────────────────────────────

  // PixiModal handles visibility gating — don't return null here
  const duration = isOpen && preview
    ? `${Math.floor(preview.totalSeconds / 60)}:${String(preview.totalSeconds % 60).padStart(2, '0')}`
    : '0:00';

  const accentBg = isOpen ? blendColor(theme.bg.color, theme.accent.color, 0.2) : 0;

  return (
    <PixiModal isOpen={isOpen} onClose={handleClose} width={MODAL_W} height={MODAL_H}>
      <PixiModalHeader title="Import MIDI File" onClose={handleClose} width={MODAL_W} />

      <layoutContainer layout={{ flex: 1, padding: 16, flexDirection: 'column', gap: 16, overflow: 'hidden' }}>

        {/* Loading state */}
        {isLoading && (
          <layoutContainer layout={{ alignItems: 'center', justifyContent: 'center', height: 60 }}>
            <PixiLabel text="Parsing MIDI file…" size="md" color="textMuted" />
          </layoutContainer>
        )}

        {/* Error state */}
        {error && (
          <layoutContainer
            layout={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              padding: 12,
              borderRadius: 6,
              borderWidth: 1,
              backgroundColor: 0x3B1515,
              borderColor: 0x7F2020,
              width: CONTENT_W,
            }}
          >
            <PixiLabel text="⚠" size="md" color="error" />
            <PixiLabel text={error} size="md" color="error" layout={{ maxWidth: CONTENT_W - 40 }} />
          </layoutContainer>
        )}

        {/* File preview */}
        {preview && (
          <layoutContainer
            layout={{
              flexDirection: 'column',
              gap: 12,
              padding: 16,
              borderRadius: 8,
              borderWidth: 1,
              backgroundColor: theme.bg.color,
              borderColor: theme.border.color,
              width: CONTENT_W,
            }}
          >
            <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 32 }}>
              <PixiLabel text={preview.name} size="lg" weight="medium" color="text" />
              <layoutContainer
                layout={{
                  paddingLeft: 8, paddingRight: 8, paddingTop: 2, paddingBottom: 2,
                  borderRadius: 4, backgroundColor: accentBg,
                }}
              >
                <PixiLabel text="MIDI" size="sm" color="accent" />
              </layoutContainer>
            </layoutContainer>

            {/* Metadata grid */}
            <layoutContainer layout={{ flexDirection: 'row', gap: 8, width: CONTENT_W - 32 }}>
              <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
                <PixiLabel text="BPM" size="sm" color="textMuted" />
                <PixiLabel text={String(preview.bpm)} size="sm" font="mono" color="text" />
              </layoutContainer>
              <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
                <PixiLabel text="Time sig" size="sm" color="textMuted" />
                <PixiLabel text={`${preview.timeSignature[0]}/${preview.timeSignature[1]}`} size="sm" font="mono" color="text" />
              </layoutContainer>
              <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
                <PixiLabel text="Tracks" size="sm" color="textMuted" />
                <PixiLabel text={String(preview.tracks)} size="sm" font="mono" color="text" />
              </layoutContainer>
              <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
                <PixiLabel text="Duration" size="sm" color="textMuted" />
                <PixiLabel text={duration} size="sm" font="mono" color="text" />
              </layoutContainer>
            </layoutContainer>
          </layoutContainer>
        )}

        {/* Import options */}
        <layoutContainer
          layout={{
            flexDirection: 'column',
            gap: 12,
            padding: 16,
            borderRadius: 8,
            borderWidth: 1,
            backgroundColor: theme.bg.color,
            borderColor: theme.border.color,
            width: CONTENT_W,
          }}
        >
          <PixiLabel text="Import Options" size="sm" weight="medium" color="text" />

          {/* Quantize */}
          <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 32 }}>
            <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
              <PixiLabel text="Quantize" size="md" color="text" />
              <PixiLabel text="Snap notes to grid" size="sm" color="textMuted" />
            </layoutContainer>
            <PixiSelect
              options={QUANTIZE_OPTIONS}
              value={String(quantize)}
              onChange={(v) => setQuantize(Number(v))}
              width={140}
            />
          </layoutContainer>

          {/* Pattern length */}
          <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 32 }}>
            <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
              <PixiLabel text="Pattern Length" size="md" color="text" />
              <PixiLabel text="Rows per pattern" size="sm" color="textMuted" />
            </layoutContainer>
            <PixiSelect
              options={PATTERN_LENGTH_OPTIONS}
              value={String(patternLength)}
              onChange={(v) => setPatternLength(Number(v))}
              width={140}
            />
          </layoutContainer>

          {/* Velocity to Volume */}
          <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 32 }}>
            <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
              <PixiLabel text="Velocity → Volume" size="md" color="text" />
              <PixiLabel text="Map note velocity to volume column" size="sm" color="textMuted" />
            </layoutContainer>
            <PixiCheckbox checked={velocityToVolume} onChange={setVelocityToVolume} />
          </layoutContainer>

          {/* Merge Channels */}
          <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 32 }}>
            <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
              <PixiLabel text="Merge Channels" size="md" color="text" />
              <PixiLabel text="Combine MIDI channels into fewer tracker channels" size="sm" color="textMuted" />
            </layoutContainer>
            <PixiCheckbox checked={mergeChannels} onChange={setMergeChannels} />
          </layoutContainer>
        </layoutContainer>
      </layoutContainer>

      <PixiModalFooter width={MODAL_W}>
        <PixiButton label="Cancel" variant="ghost" onClick={handleClose} />
        <PixiButton label="Import MIDI" variant="primary" onClick={handleImport} disabled={!moduleFile} />
      </PixiModalFooter>
    </PixiModal>
  );
};
