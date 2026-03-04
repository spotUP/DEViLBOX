/**
 * PixiImportAudioDialog — GL-native import dialog for audio sample files.
 *
 * Supports:
 *  - Standard formats (.wav, .mp3, .flac, .ogg, .aiff, .m4a): encoded as-is,
 *    decoded by the browser/ToneJS at playback.
 *  - Amiga IFF/8SVX (.iff, .8svx): parsed natively — PCM decoded, loop points
 *    read from VHDR, re-encoded as 16-bit WAV for the sampler.
 *
 * DOM reference: src/components/dialogs/ImportAudioDialog.tsx
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  PixiModal,
  PixiModalHeader,
  PixiModalFooter,
  PixiButton,
  PixiLabel,
} from '../components';
import { PixiSelect, type SelectOption } from '../components/PixiSelect';
import { usePixiTheme } from '../theme';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import type { InstrumentConfig } from '@/types/instrument';
import type { IFF8SVXResult } from '@lib/audio/IFF8SVXParser';

// ── Constants ──────────────────────────────────────────────────────────────────

const IS_IFF = /\.(iff|8svx)$/i;
const IS_SUPPORTED = /\.(wav|mp3|ogg|flac|aiff?|m4a|iff|8svx)$/i;

const MODAL_W = 440;
const MODAL_H = 480;
const CONTENT_W = MODAL_W - 34;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ROOT_NOTE_OPTIONS: SelectOption[] = Array.from({ length: 9 }, (_, octave) =>
  NOTE_NAMES.map(n => ({ value: `${n}${octave}`, label: `${n}${octave}` }))
).flat();

const LOOP_TYPE_OPTIONS: SelectOption[] = [
  { value: 'off',      label: 'No loop' },
  { value: 'forward',  label: 'Forward loop' },
  { value: 'pingpong', label: 'Ping-pong loop' },
];

// ── Types ──────────────────────────────────────────────────────────────────────

interface AudioPreview {
  name: string;
  extension: string;
  size: string;
  iff?: {
    sampleRate: number;
    samples: number;
    compressed: boolean;
    octaves: number;
    nativeLoop: boolean;
    nativeLoopStart: number;
    nativeLoopEnd: number;
  };
}

interface PixiImportAudioDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialFile?: File | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatHz(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(2)} kHz` : `${hz} Hz`;
}

/** Pre-blend two 0xRRGGBB colours at a given alpha (for semi-transparent backgrounds). */
function blendColor(base: number, overlay: number, alpha: number): number {
  const r1 = (base >> 16) & 0xFF, g1 = (base >> 8) & 0xFF, b1 = base & 0xFF;
  const r2 = (overlay >> 16) & 0xFF, g2 = (overlay >> 8) & 0xFF, b2 = overlay & 0xFF;
  return (Math.round(r1 + (r2 - r1) * alpha) << 16) | (Math.round(g1 + (g2 - g1) * alpha) << 8) | Math.round(b1 + (b2 - b1) * alpha);
}

// ── Component ──────────────────────────────────────────────────────────────────

export const PixiImportAudioDialog: React.FC<PixiImportAudioDialogProps> = ({
  isOpen,
  onClose,
  initialFile,
}) => {
  const theme = usePixiTheme();
  const [preview, setPreview]       = useState<AudioPreview | null>(null);
  const [audioFile, setAudioFile]   = useState<File | null>(null);
  const [parsed8SVX, setParsed8SVX] = useState<IFF8SVXResult | null>(null);
  const [isLoading, setIsLoading]   = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const [rootNote, setRootNote]     = useState('C3');
  const [loopType, setLoopType]     = useState('off');
  const [loopStart, setLoopStart]   = useState(0);
  const [loopEnd, setLoopEnd]       = useState(0);

  // ── File parsing ───────────────────────────────────────────────────────────

  const handleFileSelect = useCallback(async (file: File) => {
    if (!IS_SUPPORTED.test(file.name)) {
      setError('Unsupported format. Use WAV, MP3, FLAC, OGG, AIFF, M4A, IFF, or 8SVX.');
      return;
    }

    setError(null);
    setParsed8SVX(null);
    setLoopStart(0);
    setLoopEnd(0);
    setLoopType('off');

    if (IS_IFF.test(file.name)) {
      setIsLoading(true);
      try {
        const buf = await file.arrayBuffer();
        const { parseIFF8SVX } = await import('@lib/audio/IFF8SVXParser');
        const result = parseIFF8SVX(buf);
        setParsed8SVX(result);

        if (result.hasLoop && result.loopEnd > result.loopStart) {
          setLoopType('forward');
          setLoopStart(result.loopStart);
          setLoopEnd(result.loopEnd);
        }

        const displayName = result.name || file.name.replace(/\.[^/.]+$/, '');

        setPreview({
          name: displayName,
          extension: file.name.split('.').pop()?.toUpperCase() ?? 'IFF',
          size: formatFileSize(file.size),
          iff: {
            sampleRate: result.sampleRate,
            samples: result.pcm.length,
            compressed: false,
            octaves: result.octaves,
            nativeLoop: result.hasLoop,
            nativeLoopStart: result.loopStart,
            nativeLoopEnd: result.loopEnd,
          },
        });
        setAudioFile(file);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse IFF/8SVX file');
      } finally {
        setIsLoading(false);
      }
    } else {
      setPreview({
        name: file.name.replace(/\.[^/.]+$/, ''),
        extension: file.name.split('.').pop()?.toUpperCase() ?? '',
        size: formatFileSize(file.size),
      });
      setAudioFile(file);
    }
  }, []);

  // Auto-parse initialFile
  useEffect(() => {
    if (initialFile && isOpen) {
      handleFileSelect(initialFile);
    }
  }, [initialFile, isOpen, handleFileSelect]);

  // ── Import handler ─────────────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (!audioFile || !preview) return;
    setIsLoading(true);
    setError(null);

    try {
      const { addInstrument } = useInstrumentStore.getState();
      const hasLoop = loopType !== 'off';
      const loopTypeVal = loopType as 'off' | 'forward' | 'pingpong';

      if (parsed8SVX) {
        const { pcm8ToWAV } = await import('@lib/import/formats/AmigaUtils');
        const effectiveLoopEnd = hasLoop ? loopEnd : 0;
        const wavBuf = pcm8ToWAV(
          new Uint8Array(parsed8SVX.pcm.buffer),
          parsed8SVX.sampleRate,
          hasLoop ? loopStart : 0,
          effectiveLoopEnd,
        );

        const wavBytes = new Uint8Array(wavBuf);
        let binary = '';
        const CHUNK = 8192;
        for (let i = 0; i < wavBytes.length; i += CHUNK) {
          binary += String.fromCharCode(...Array.from(wavBytes.subarray(i, Math.min(i + CHUNK, wavBytes.length))));
        }
        const dataUrl = `data:audio/wav;base64,${btoa(binary)}`;

        const volumeDB = parsed8SVX.volume > 0
          ? Math.max(-60, 20 * Math.log10(parsed8SVX.volume))
          : -60;

        const instrument: InstrumentConfig = {
          id: Date.now() % 128 || 1,
          name: preview.name,
          type: 'sample',
          synthType: 'Sampler',
          effects: [],
          volume: volumeDB,
          pan: 0,
          sample: {
            audioBuffer: wavBuf,
            url: dataUrl,
            baseNote: rootNote,
            detune: 0,
            loop: hasLoop,
            loopType: loopTypeVal,
            loopStart: hasLoop ? loopStart : 0,
            loopEnd: hasLoop ? effectiveLoopEnd : 0,
            sampleRate: parsed8SVX.sampleRate,
            reverse: false,
            playbackRate: 1.0,
          },
        } as InstrumentConfig;

        addInstrument(instrument);
      } else {
        const buf = await audioFile.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        const CHUNK = 8192;
        for (let i = 0; i < bytes.length; i += CHUNK) {
          binary += String.fromCharCode(...Array.from(bytes.subarray(i, Math.min(i + CHUNK, bytes.length))));
        }
        const mimeType = audioFile.type || 'audio/wav';
        const dataUrl = `data:${mimeType};base64,${btoa(binary)}`;

        const instrument: InstrumentConfig = {
          id: Date.now() % 128 || 1,
          name: preview.name,
          type: 'sample',
          synthType: 'Sampler',
          effects: [],
          volume: 0,
          pan: 0,
          sample: {
            audioBuffer: buf,
            url: dataUrl,
            baseNote: rootNote,
            detune: 0,
            loop: hasLoop,
            loopType: loopTypeVal,
            loopStart: 0,
            loopEnd: 0,
            sampleRate: 44100,
            reverse: false,
            playbackRate: 1.0,
          },
        } as InstrumentConfig;

        addInstrument(instrument);
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import audio file');
    } finally {
      setIsLoading(false);
    }
  }, [audioFile, preview, parsed8SVX, rootNote, loopType, loopStart, loopEnd, onClose]);

  // ── Close handler ──────────────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    setPreview(null);
    setAudioFile(null);
    setParsed8SVX(null);
    setError(null);
    setLoopType('off');
    setLoopStart(0);
    setLoopEnd(0);
    onClose();
  }, [onClose]);

  // ── Render ─────────────────────────────────────────────────────────────────

  // PixiModal handles visibility gating — don't return null here
  const accentBg = isOpen ? blendColor(theme.bg.color, theme.accent.color, 0.2) : 0;

  return (
    <PixiModal isOpen={isOpen} onClose={handleClose} width={MODAL_W} height={MODAL_H}>
      <PixiModalHeader title="Import Audio Sample" onClose={handleClose} width={MODAL_W} />

      <layoutContainer layout={{ flex: 1, padding: 16, flexDirection: 'column', gap: 16, overflow: 'hidden' }}>

        {/* Drop zone placeholder (file selection via initialFile prop) */}
        {!preview && !isLoading && !error && (
          <layoutContainer
            layout={{
              width: CONTENT_W,
              padding: 32,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 8,
              borderRadius: 8,
              borderWidth: 2,
              borderColor: theme.border.color,
            }}
          >
            <PixiLabel text="♪" size="xl" color="textMuted" />
            <PixiLabel text="Drop an audio file or use File > Import" size="md" color="text" />
            <PixiLabel text="WAV · MP3 · FLAC · OGG · AIFF · M4A · IFF · 8SVX" size="sm" color="textMuted" />
          </layoutContainer>
        )}

        {/* Loading state */}
        {isLoading && (
          <layoutContainer layout={{ alignItems: 'center', justifyContent: 'center', height: 60 }}>
            <PixiLabel text="Parsing audio…" size="md" color="textMuted" />
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

        {/* File preview card */}
        {preview && (
          <>
            <layoutContainer
              layout={{
                flexDirection: 'column',
                gap: 8,
                padding: 16,
                borderRadius: 8,
                borderWidth: 1,
                backgroundColor: theme.bg.color,
                borderColor: theme.border.color,
                width: CONTENT_W,
              }}
            >
              {/* Name + extension badge */}
              <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 32 }}>
                <PixiLabel text={preview.name} size="lg" weight="medium" color="text" />
                <layoutContainer
                  layout={{
                    paddingLeft: 8,
                    paddingRight: 8,
                    paddingTop: 2,
                    paddingBottom: 2,
                    borderRadius: 4,
                    backgroundColor: accentBg,
                  }}
                >
                  <PixiLabel text={preview.extension} size="sm" color="accent" />
                </layoutContainer>
              </layoutContainer>
              <PixiLabel text={preview.size} size="sm" color="textMuted" />

              {/* IFF-specific metadata */}
              {preview.iff && (
                <layoutContainer
                  layout={{
                    flexDirection: 'row',
                    gap: 8,
                    paddingTop: 4,
                    borderTopWidth: 1,
                    borderColor: theme.border.color,
                    width: CONTENT_W - 32,
                  }}
                >
                  <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
                    <PixiLabel text="Rate" size="sm" color="textMuted" />
                    <PixiLabel text={formatHz(preview.iff.sampleRate)} size="sm" font="mono" color="text" />
                  </layoutContainer>
                  <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
                    <PixiLabel text="Samples" size="sm" color="textMuted" />
                    <PixiLabel text={preview.iff.samples.toLocaleString()} size="sm" font="mono" color="text" />
                  </layoutContainer>
                  <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
                    <PixiLabel text="Duration" size="sm" color="textMuted" />
                    <PixiLabel text={`${(preview.iff.samples / preview.iff.sampleRate).toFixed(3)}s`} size="sm" font="mono" color="text" />
                  </layoutContainer>
                </layoutContainer>
              )}

              {preview.iff?.nativeLoop && (
                <PixiLabel
                  text={`↻ Native loop: ${preview.iff.nativeLoopStart.toLocaleString()}–${preview.iff.nativeLoopEnd.toLocaleString()}`}
                  size="sm"
                  color="accent"
                />
              )}

              {preview.iff && preview.iff.octaves > 1 && (
                <PixiLabel
                  text={`Multi-octave (${preview.iff.octaves} octaves) — importing first octave`}
                  size="sm"
                  color="textMuted"
                />
              )}
            </layoutContainer>

            {/* Sampler Settings */}
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
              <PixiLabel text="Sampler Settings" size="sm" weight="medium" color="text" />

              {/* Root note */}
              <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 32 }}>
                <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
                  <PixiLabel text="Root Note" size="md" color="text" />
                  <PixiLabel text="Note played at original pitch" size="sm" color="textMuted" />
                </layoutContainer>
                <PixiSelect
                  options={ROOT_NOTE_OPTIONS}
                  value={rootNote}
                  onChange={setRootNote}
                  width={80}
                />
              </layoutContainer>

              {/* Loop type */}
              <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 32 }}>
                <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
                  <PixiLabel text="Loop" size="md" color="text" />
                  <PixiLabel
                    text={parsed8SVX?.hasLoop ? 'Pre-filled from file' : 'Looping mode'}
                    size="sm"
                    color="textMuted"
                  />
                </layoutContainer>
                <PixiSelect
                  options={LOOP_TYPE_OPTIONS}
                  value={loopType}
                  onChange={setLoopType}
                  width={120}
                />
              </layoutContainer>

              {/* Loop point display (IFF) */}
              {parsed8SVX && loopType !== 'off' && (
                <layoutContainer layout={{ flexDirection: 'row', gap: 8 }}>
                  <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
                    <PixiLabel text="Loop Start" size="sm" color="textMuted" />
                    <PixiLabel text={loopStart.toLocaleString()} size="sm" font="mono" color="text" />
                  </layoutContainer>
                  <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
                    <PixiLabel text="Loop End" size="sm" color="textMuted" />
                    <PixiLabel text={loopEnd > 0 ? loopEnd.toLocaleString() : '(end)'} size="sm" font="mono" color="text" />
                  </layoutContainer>
                </layoutContainer>
              )}
            </layoutContainer>

            <PixiLabel
              text="Sample will be added as a new Sampler instrument."
              size="sm"
              color="textMuted"
            />
          </>
        )}
      </layoutContainer>

      <PixiModalFooter width={MODAL_W}>
        <PixiButton label="Cancel" variant="ghost" onClick={handleClose} />
        <PixiButton label="Add to Instruments" variant="primary" onClick={handleImport} disabled={!audioFile || isLoading} />
      </PixiModalFooter>
    </PixiModal>
  );
};
