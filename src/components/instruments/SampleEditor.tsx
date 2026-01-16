/**
 * SampleEditor - Upload and manage audio samples for Sampler/Player instruments
 */

import React, { useRef, useState, useCallback } from 'react';
import { Upload, Trash2, Music, Play, Square, AlertCircle, ArrowRight, ArrowLeft, Repeat } from 'lucide-react';
import { useInstrumentStore } from '../../stores';
import type { InstrumentConfig } from '../../types/instrument';

interface SampleEditorProps {
  instrument: InstrumentConfig;
}

interface SampleInfo {
  name: string;
  duration: number;
  size: number;
  url: string;
}

export const SampleEditor: React.FC<SampleEditorProps> = ({ instrument }) => {
  const { updateInstrument } = useInstrumentStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get sample info from instrument parameters
  const sampleInfo: SampleInfo | null = instrument.parameters?.sampleInfo || null;
  const sampleUrl: string | null = instrument.parameters?.sampleUrl || null;
  const reverseMode: 'forward' | 'reverse' | 'pingpong' = instrument.parameters?.reverseMode || 'forward';

  // Handle reverse mode change
  const handleReverseModeChange = useCallback((mode: 'forward' | 'reverse' | 'pingpong') => {
    updateInstrument(instrument.id, {
      parameters: {
        ...instrument.parameters,
        reverseMode: mode,
      },
    });
  }, [instrument.id, instrument.parameters, updateInstrument]);

  // Handle file selection
  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/flac'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(wav|mp3|ogg|webm|flac)$/i)) {
      setError('Invalid file type. Please upload WAV, MP3, OGG, WebM, or FLAC.');
      return;
    }

    // Check file size (limit to 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('File too large. Maximum size is 10MB.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Read file as base64 data URL
      const dataUrl = await readFileAsDataURL(file);

      // Get audio duration
      const duration = await getAudioDuration(dataUrl);

      // Update instrument with sample data
      updateInstrument(instrument.id, {
        parameters: {
          ...instrument.parameters,
          sampleUrl: dataUrl,
          sampleInfo: {
            name: file.name,
            duration,
            size: file.size,
            url: dataUrl,
          },
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audio file');
    } finally {
      setIsLoading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [instrument.id, instrument.parameters, updateInstrument]);

  // Read file as data URL
  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  // Get audio duration from data URL
  const getAudioDuration = (url: string): Promise<number> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.onloadedmetadata = () => resolve(audio.duration);
      audio.onerror = () => reject(new Error('Failed to load audio metadata'));
      audio.src = url;
    });
  };

  // Handle clear sample
  const handleClearSample = useCallback(() => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    updateInstrument(instrument.id, {
      parameters: {
        ...instrument.parameters,
        sampleUrl: null,
        sampleInfo: null,
      },
    });
  }, [instrument.id, instrument.parameters, updateInstrument, isPlaying]);

  // Handle preview playback
  const handlePreview = useCallback(() => {
    if (!sampleUrl) return;

    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    } else {
      if (!audioRef.current) {
        audioRef.current = new Audio(sampleUrl);
        audioRef.current.onended = () => setIsPlaying(false);
      } else {
        audioRef.current.src = sampleUrl;
      }
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [sampleUrl, isPlaying]);

  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Format duration
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-accent-error/20 border border-accent-error/40 rounded-md text-accent-error">
          <AlertCircle size={16} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* No sample loaded */}
      {!sampleInfo && (
        <div className="border-2 border-dashed border-dark-border rounded-lg p-8 text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.wav,.mp3,.ogg,.webm,.flac"
            onChange={handleFileSelect}
            className="hidden"
            disabled={isLoading}
          />
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 rounded-full bg-dark-bgTertiary text-text-secondary">
              <Upload size={32} />
            </div>
            <div>
              <p className="text-text-primary font-medium mb-1">
                {instrument.synthType === 'Sampler' ? 'Upload a Sample' : 'Upload Audio File'}
              </p>
              <p className="text-text-muted text-sm">
                WAV, MP3, OGG, WebM, or FLAC (max 10MB)
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="btn-primary flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Upload size={16} />
                  Choose File
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Sample loaded */}
      {sampleInfo && (
        <div className="bg-dark-bgTertiary border border-dark-border rounded-lg overflow-hidden">
          {/* Sample info header */}
          <div className="p-4 flex items-start gap-4">
            <div className="p-3 rounded-lg bg-accent-primary/20 text-accent-primary flex-shrink-0">
              <Music size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-text-primary truncate" title={sampleInfo.name}>
                {sampleInfo.name}
              </h4>
              <div className="flex gap-4 text-sm text-text-muted mt-1">
                <span>{formatDuration(sampleInfo.duration)}</span>
                <span>{formatSize(sampleInfo.size)}</span>
              </div>
            </div>
          </div>

          {/* Waveform placeholder (could be implemented with canvas) */}
          <div className="h-16 mx-4 mb-4 bg-dark-bg rounded flex items-center justify-center">
            <div className="flex items-center gap-1">
              {Array.from({ length: 40 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-accent-primary/60 rounded-full"
                  style={{
                    height: `${Math.random() * 32 + 8}px`,
                    opacity: 0.4 + Math.random() * 0.6,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Playback Mode */}
          <div className="px-4 pb-3">
            <div className="text-xs text-text-muted mb-2">Playback Mode</div>
            <div className="flex gap-2">
              <button
                onClick={() => handleReverseModeChange('forward')}
                className={`flex-1 px-3 py-2 text-xs rounded border flex items-center justify-center gap-1.5 transition-all ${
                  reverseMode === 'forward'
                    ? 'bg-accent-primary text-text-inverse border-accent-primary'
                    : 'bg-dark-bg text-text-muted border-dark-border hover:border-dark-borderLight'
                }`}
                title="Play sample forward"
              >
                <ArrowRight size={14} />
                Forward
              </button>
              <button
                onClick={() => handleReverseModeChange('reverse')}
                className={`flex-1 px-3 py-2 text-xs rounded border flex items-center justify-center gap-1.5 transition-all ${
                  reverseMode === 'reverse'
                    ? 'bg-accent-primary text-text-inverse border-accent-primary'
                    : 'bg-dark-bg text-text-muted border-dark-border hover:border-dark-borderLight'
                }`}
                title="Play sample in reverse"
              >
                <ArrowLeft size={14} />
                Reverse
              </button>
              <button
                onClick={() => handleReverseModeChange('pingpong')}
                className={`flex-1 px-3 py-2 text-xs rounded border flex items-center justify-center gap-1.5 transition-all ${
                  reverseMode === 'pingpong'
                    ? 'bg-accent-primary text-text-inverse border-accent-primary'
                    : 'bg-dark-bg text-text-muted border-dark-border hover:border-dark-borderLight'
                }`}
                title="Play forward then reverse"
              >
                <Repeat size={14} />
                Ping-Pong
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="px-4 pb-4 flex gap-2">
            <button
              onClick={handlePreview}
              className="btn-ghost flex items-center gap-2"
              title={isPlaying ? 'Stop' : 'Preview'}
            >
              {isPlaying ? <Square size={16} /> : <Play size={16} />}
              {isPlaying ? 'Stop' : 'Preview'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.wav,.mp3,.ogg,.webm,.flac"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isLoading}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="btn-ghost flex items-center gap-2"
            >
              <Upload size={16} />
              Replace
            </button>
            <button
              onClick={handleClearSample}
              className="btn-ghost text-accent-error flex items-center gap-2"
            >
              <Trash2 size={16} />
              Remove
            </button>
          </div>
        </div>
      )}

      {/* Info text for Sampler type */}
      {instrument.synthType === 'Sampler' && (
        <p className="text-sm text-text-muted">
          The uploaded sample will be mapped to C4 and pitched across the keyboard.
          For multi-sample instruments, export your project and manually edit the sample mappings.
        </p>
      )}

      {/* Info text for Player type */}
      {instrument.synthType === 'Player' && (
        <p className="text-sm text-text-muted">
          Audio player mode plays the full sample when triggered.
          Use this for loops, one-shots, or longer audio files.
        </p>
      )}
    </div>
  );
};
