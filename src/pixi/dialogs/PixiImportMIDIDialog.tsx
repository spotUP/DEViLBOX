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
const CONTENT_W = MODAL_W - 26;

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

  if (!isOpen) return null;

  const duration = preview
    ? `${Math.floor(preview.totalSeconds / 60)}:${String(preview.totalSeconds % 60).padStart(2, '0')}`
    : '0:00';

  return (
    <PixiModal isOpen={isOpen} onClose={handleClose} width={MODAL_W} height={MODAL_H}>
      <PixiModalHeader title="Import MIDI File" onClose={handleClose} width={MODAL_W} />

      <layoutContainer layout={{ flex: 1, padding: 12, flexDirection: 'column', gap: 10, overflow: 'hidden' }}>

        {/* Loading state */}
        {isLoading && (
          <layoutContainer layout={{ alignItems: 'center', justifyContent: 'center', height: 60 }}>
            <PixiLabel text="Parsing MIDI file…" size="sm" color="textMuted" />
          </layoutContainer>
        )}

        {/* Error state */}
        {error && (
          <layoutContainer
            layout={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              padding: 10,
              borderRadius: 6,
              borderWidth: 1,
              backgroundColor: 0x3B1515,
              borderColor: 0x7F2020,
              width: CONTENT_W,
            }}
          >
            <PixiLabel text="⚠" size="sm" color="error" />
            <PixiLabel text={error} size="xs" color="error" layout={{ maxWidth: CONTENT_W - 40 }} />
          </layoutContainer>
        )}

        {/* File preview */}
        {preview && (
          <layoutContainer
            layout={{
              flexDirection: 'column',
              gap: 4,
              padding: 12,
              borderRadius: 8,
              borderWidth: 1,
              backgroundColor: theme.bg.color,
              borderColor: theme.border.color,
              width: CONTENT_W,
            }}
          >
            <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
              <PixiLabel text={preview.name} size="sm" weight="semibold" color="text" />
              <layoutContainer
                layout={{
                  paddingLeft: 6, paddingRight: 6, paddingTop: 2, paddingBottom: 2,
                  borderRadius: 4, backgroundColor: theme.accent.color,
                }}
              >
                <PixiLabel text="MIDI" size="xs" weight="semibold" color="text" />
              </layoutContainer>
            </layoutContainer>

            {/* Metadata grid */}
            <layoutContainer layout={{ flexDirection: 'row', gap: 16, marginTop: 6, width: CONTENT_W - 24 }}>
              <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
                <PixiLabel text="BPM" size="xs" color="textMuted" />
                <PixiLabel text={String(preview.bpm)} size="xs" font="mono" color="text" />
              </layoutContainer>
              <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
                <PixiLabel text="Time sig" size="xs" color="textMuted" />
                <PixiLabel text={`${preview.timeSignature[0]}/${preview.timeSignature[1]}`} size="xs" font="mono" color="text" />
              </layoutContainer>
              <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
                <PixiLabel text="Tracks" size="xs" color="textMuted" />
                <PixiLabel text={String(preview.tracks)} size="xs" font="mono" color="text" />
              </layoutContainer>
              <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
                <PixiLabel text="Duration" size="xs" color="textMuted" />
                <PixiLabel text={duration} size="xs" font="mono" color="text" />
              </layoutContainer>
            </layoutContainer>
          </layoutContainer>
        )}

        {/* Import options */}
        <layoutContainer
          layout={{
            flexDirection: 'column',
            gap: 10,
            padding: 12,
            borderRadius: 8,
            borderWidth: 1,
            backgroundColor: theme.bg.color,
            borderColor: theme.border.color,
            width: CONTENT_W,
          }}
        >
          <PixiLabel text="Import Options" size="xs" weight="semibold" color="text" />

          {/* Quantize */}
          <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
            <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
              <PixiLabel text="Quantize" size="sm" color="text" />
              <PixiLabel text="Snap notes to grid" size="xs" color="textMuted" />
            </layoutContainer>
            <PixiSelect
              options={QUANTIZE_OPTIONS}
              value={String(quantize)}
              onChange={(v) => setQuantize(Number(v))}
              width={140}
            />
          </layoutContainer>

          {/* Pattern length */}
          <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
            <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
              <PixiLabel text="Pattern Length" size="sm" color="text" />
              <PixiLabel text="Rows per pattern" size="xs" color="textMuted" />
            </layoutContainer>
            <PixiSelect
              options={PATTERN_LENGTH_OPTIONS}
              value={String(patternLength)}
              onChange={(v) => setPatternLength(Number(v))}
              width={140}
            />
          </layoutContainer>

          {/* Velocity to Volume */}
          <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
            <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
              <PixiLabel text="Velocity → Volume" size="sm" color="text" />
              <PixiLabel text="Map note velocity to volume column" size="xs" color="textMuted" />
            </layoutContainer>
            <PixiCheckbox checked={velocityToVolume} onChange={setVelocityToVolume} />
          </layoutContainer>

          {/* Merge Channels */}
          <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
            <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
              <PixiLabel text="Merge Channels" size="sm" color="text" />
              <PixiLabel text="Combine MIDI channels into fewer tracker channels" size="xs" color="textMuted" />
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
