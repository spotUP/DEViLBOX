/**
 * ImportAudioDialog — Import audio sample files as Sampler instruments.
 *
 * Supports:
 *  - Standard formats (.wav, .mp3, .flac, .ogg, .aiff, .m4a): encoded as-is,
 *    decoded by the browser/ToneJS at playback.
 *  - Amiga IFF/8SVX (.iff, .8svx): parsed natively — PCM decoded, loop points
 *    read from VHDR, re-encoded as 16-bit WAV for the sampler.
 *
 * Lets the user set root note and loop type before adding the sample as a new
 * Sampler instrument in the instrument store.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Volume2, FileAudio, AlertCircle, ChevronDown } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import type { InstrumentConfig } from '@/types/instrument';
import type { IFF8SVXResult } from '@lib/audio/IFF8SVXParser';

const IS_IFF = /\.(iff|8svx)$/i;
const IS_SUPPORTED = /\.(wav|mp3|ogg|flac|aiff?|m4a|iff|8svx)$/i;

interface AudioPreview {
  name: string;
  extension: string;
  size: string;
  /** IFF/8SVX-specific metadata (null for standard audio) */
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

interface ImportAudioDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialFile?: File | null;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ROOT_NOTE_OPTIONS = Array.from({ length: 9 }, (_, octave) =>
  NOTE_NAMES.map(n => `${n}${octave}`)
).flat();

const LOOP_TYPE_OPTIONS: { value: 'off' | 'forward' | 'pingpong'; label: string }[] = [
  { value: 'off',      label: 'No loop' },
  { value: 'forward',  label: 'Forward loop' },
  { value: 'pingpong', label: 'Ping-pong loop' },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatHz(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(2)} kHz` : `${hz} Hz`;
}

// ── Component ──────────────────────────────────────────────────────────────

export const ImportAudioDialog: React.FC<ImportAudioDialogProps> = ({
  isOpen,
  onClose,
  initialFile,
}) => {
  const [preview, setPreview]         = useState<AudioPreview | null>(null);
  const [audioFile, setAudioFile]     = useState<File | null>(null);
  const [parsed8SVX, setParsed8SVX]   = useState<IFF8SVXResult | null>(null);
  const [isLoading, setIsLoading]     = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const [rootNote, setRootNote]       = useState('C3');
  const [loopType, setLoopType]       = useState<'off' | 'forward' | 'pingpong'>('off');
  const [loopStart, setLoopStart]     = useState(0);
  const [loopEnd, setLoopEnd]         = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!IS_SUPPORTED.test(file.name)) {
      setError('Please select a supported audio file (.wav, .mp3, .flac, .ogg, .aiff, .m4a, .iff, .8svx).');
      return;
    }

    setError(null);
    setParsed8SVX(null);
    setLoopStart(0);
    setLoopEnd(0);
    setLoopType('off');

    if (IS_IFF.test(file.name)) {
      // IFF/8SVX: parse locally to extract metadata and PCM
      setIsLoading(true);
      try {
        const buf = await file.arrayBuffer();
        const { parseIFF8SVX } = await import('@lib/audio/IFF8SVXParser');
        const result = parseIFF8SVX(buf);
        setParsed8SVX(result);

        // Pre-fill loop from VHDR
        if (result.hasLoop && result.loopEnd > result.loopStart) {
          setLoopType('forward');
          setLoopStart(result.loopStart);
          setLoopEnd(result.loopEnd);
        }

        // Use native sample name if present
        const displayName = result.name || file.name.replace(/\.[^/.]+$/, '');

        setPreview({
          name: displayName,
          extension: file.name.split('.').pop()?.toUpperCase() ?? 'IFF',
          size: formatFileSize(file.size),
          iff: {
            sampleRate: result.sampleRate,
            samples: result.pcm.length,
            compressed: false, // we always decode
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
      // Standard audio: just record the file, no pre-parse needed
      setPreview({
        name: file.name.replace(/\.[^/.]+$/, ''),
        extension: file.name.split('.').pop()?.toUpperCase() ?? '',
        size: formatFileSize(file.size),
      });
      setAudioFile(file);
    }
  }, []);

  useEffect(() => {
    if (initialFile && isOpen) {
      handleFileSelect(initialFile);
    }
  }, [initialFile, isOpen, handleFileSelect]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleImport = useCallback(async () => {
    if (!audioFile || !preview) return;
    setIsLoading(true);
    setError(null);

    try {
      const { addInstrument } = useInstrumentStore.getState();
      const hasLoop = loopType !== 'off';

      if (parsed8SVX) {
        // ── IFF/8SVX path: PCM is already decoded, encode to WAV ──────────
        const { pcm8ToWAV } = await import('@lib/import/formats/AmigaUtils');
        const effectiveLoopEnd = hasLoop ? loopEnd : 0;
        const wavBuf = pcm8ToWAV(
          new Uint8Array(parsed8SVX.pcm.buffer),
          parsed8SVX.sampleRate,
          hasLoop ? loopStart : 0,
          effectiveLoopEnd,
        );

        // Build persistent data URL (WAV survives save/reload)
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
            loopType: loopType,
            loopStart: hasLoop ? loopStart : 0,
            loopEnd: hasLoop ? effectiveLoopEnd : 0,
            sampleRate: parsed8SVX.sampleRate,
            reverse: false,
            playbackRate: 1.0,
          },
        } as InstrumentConfig;

        addInstrument(instrument);

      } else {
        // ── Standard audio path: encode raw file bytes as data URL ─────────
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
            loopType: loopType,
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl w-[440px] max-h-[85vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Volume2 size={18} className="text-accent-primary" />
            <h2 className="text-sm font-semibold text-text-primary">Import Audio Sample</h2>
          </div>
          <Button variant="icon" size="icon" onClick={handleClose} aria-label="Close dialog">
            <X size={16} />
          </Button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
              ${isLoading
                ? 'border-accent-primary/50 bg-accent-primary/5'
                : 'border-dark-border hover:border-accent-primary/50 hover:bg-dark-bgHover'}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".wav,.mp3,.ogg,.flac,.aif,.aiff,.m4a,.iff,.8svx"
              onChange={handleInputChange}
              className="hidden"
            />
            {isLoading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-text-muted">Parsing audio…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <FileAudio size={32} className="text-text-muted" />
                <p className="text-sm text-text-primary">Drop an audio file here or click to browse</p>
                <p className="text-xs text-text-muted">WAV · MP3 · FLAC · OGG · AIFF · M4A · IFF · 8SVX</p>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-accent-error/10 border border-accent-error/30 rounded text-sm text-accent-error">
              <AlertCircle size={16} className="flex-shrink-0" />
              {error}
            </div>
          )}

          {/* File preview */}
          {preview && (
            <div className="bg-dark-bg rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-text-primary truncate">{preview.name}</p>
                <span className="text-xs px-2 py-0.5 bg-accent-primary/20 text-accent-primary rounded flex-shrink-0">
                  {preview.extension}
                </span>
              </div>
              <p className="text-xs text-text-muted">{preview.size}</p>

              {/* IFF-specific metadata */}
              {preview.iff && (
                <div className="grid grid-cols-3 gap-2 pt-1 text-xs border-t border-dark-border/50">
                  <div className="flex flex-col">
                    <span className="text-text-muted">Rate</span>
                    <span className="text-text-primary font-mono">{formatHz(preview.iff.sampleRate)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-text-muted">Samples</span>
                    <span className="text-text-primary font-mono">{preview.iff.samples.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-text-muted">Duration</span>
                    <span className="text-text-primary font-mono">
                      {(preview.iff.samples / preview.iff.sampleRate).toFixed(3)}s
                    </span>
                  </div>
                  {preview.iff.nativeLoop && (
                    <div className="col-span-3 flex items-center gap-1 text-accent-primary">
                      <span className="text-xs">↻ Native loop: {preview.iff.nativeLoopStart.toLocaleString()}–{preview.iff.nativeLoopEnd.toLocaleString()}</span>
                    </div>
                  )}
                  {preview.iff.octaves > 1 && (
                    <div className="col-span-3 text-text-muted text-xs">
                      Multi-octave ({preview.iff.octaves} octaves) — importing first octave
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Import options */}
          <div className="bg-dark-bg rounded-lg p-4 space-y-3">
            <p className="text-xs font-medium text-text-primary">Sampler Settings</p>

            {/* Root note */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-text-primary">Root Note</p>
                <p className="text-xs text-text-muted">Note played at original pitch</p>
              </div>
              <div className="relative">
                <select
                  value={rootNote}
                  onChange={(e) => setRootNote(e.target.value)}
                  className="text-sm bg-dark-bgSecondary border border-dark-border rounded px-3 py-1.5 pr-7 text-text-primary appearance-none cursor-pointer"
                >
                  {ROOT_NOTE_OPTIONS.map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>
            </div>

            {/* Loop type */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-text-primary">Loop</p>
                <p className="text-xs text-text-muted">
                  {parsed8SVX?.hasLoop ? 'Loop points pre-filled from file' : 'Looping mode'}
                </p>
              </div>
              <div className="relative">
                <select
                  value={loopType}
                  onChange={(e) => setLoopType(e.target.value as 'off' | 'forward' | 'pingpong')}
                  className="text-sm bg-dark-bgSecondary border border-dark-border rounded px-3 py-1.5 pr-7 text-text-primary appearance-none cursor-pointer"
                >
                  {LOOP_TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>
            </div>

            {/* IFF loop point display (read-only — editable in sample editor after import) */}
            {parsed8SVX && loopType !== 'off' && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex flex-col">
                  <span className="text-text-muted">Loop Start</span>
                  <span className="text-text-primary font-mono">{loopStart.toLocaleString()}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-text-muted">Loop End</span>
                  <span className="text-text-primary font-mono">{loopEnd > 0 ? loopEnd.toLocaleString() : '(end)'}</span>
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-text-muted">
            The sample will be added as a new Sampler instrument. Use the instrument editor to adjust loop points, volume envelope, and other parameters after import.
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-dark-border flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleImport} disabled={!audioFile || isLoading}>
            Add to Instruments
          </Button>
        </div>
      </div>
    </div>
  );
};
