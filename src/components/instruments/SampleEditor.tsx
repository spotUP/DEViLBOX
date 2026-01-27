/**
 * SampleEditor - Full-featured sample editor with waveform visualization
 * Supports Sampler, Player, and GranularSynth instruments
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  Upload, Trash2, Music, Play, Square, AlertCircle,
  ZoomIn, ZoomOut, Repeat, Sparkles, Wand2, RefreshCcw, Maximize2, FlipVertical
} from 'lucide-react';
import { useInstrumentStore, notify } from '../../stores';
import type { InstrumentConfig } from '../../types/instrument';
import { DEFAULT_GRANULAR } from '../../types/instrument';
import * as Tone from 'tone';
import { SampleEnhancerPanel } from './SampleEnhancerPanel';
import type { ProcessedResult } from '../../utils/audio/SampleProcessing';

interface SampleEditorProps {
  instrument: InstrumentConfig;
  onChange?: (updates: Partial<InstrumentConfig>) => void;
}

interface SampleInfo {
  name: string;
  duration: number;
  size: number;
  sampleRate?: number;
  channels?: number;
}

// Note options for base note selection
const NOTE_OPTIONS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OCTAVE_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

export const SampleEditor: React.FC<SampleEditorProps> = ({ instrument, onChange }) => {
  const { 
    updateInstrument: storeUpdateInstrument,
    reverseSample,
    normalizeSample,
    invertLoopSample
  } = useInstrumentStore();

  // Use onChange prop if provided (for temp instruments), otherwise use store
  const updateInstrument = useCallback((id: number, updates: Partial<InstrumentConfig>) => {
    if (onChange) {
      onChange(updates);
    } else {
      storeUpdateInstrument(id, updates);
    }
  }, [onChange, storeUpdateInstrument]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Tone.Player | null>(null);
  const animationRef = useRef<number | null>(null);

  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [showEnhancer, setShowEnhancer] = useState(false);

  // Get sample data from instrument
  const sampleUrl: string | null = instrument.parameters?.sampleUrl || instrument.granular?.sampleUrl || null;
  const sampleInfo: SampleInfo | null = instrument.parameters?.sampleInfo || null;

  // Sample parameters
  const startTime = instrument.parameters?.startTime ?? 0;
  const endTime = instrument.parameters?.endTime ?? 1;
  const loopEnabled = instrument.parameters?.loopEnabled ?? false;
  const loopStart = instrument.parameters?.loopStart ?? 0;
  const loopEnd = instrument.parameters?.loopEnd ?? 1;
  const baseNote = instrument.parameters?.baseNote ?? 'C4';
  const playbackRate = instrument.parameters?.playbackRate ?? 1;
  const reverse = instrument.parameters?.reverse ?? false;

  // Granular-specific parameters
  const granular = instrument.granular;
  const isGranular = instrument.synthType === 'GranularSynth';

  // Load audio buffer when URL changes
  useEffect(() => {
    if (!sampleUrl) {
      setAudioBuffer(null);
      return;
    }

    const loadBuffer = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(sampleUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const buffer = await audioContext.decodeAudioData(arrayBuffer);
        setAudioBuffer(buffer);

        // Update sample info if not already set
        if (!sampleInfo) {
          updateInstrument(instrument.id, {
            parameters: {
              ...instrument.parameters,
              sampleInfo: {
                name: 'Sample',
                duration: buffer.duration,
                size: arrayBuffer.byteLength,
                sampleRate: buffer.sampleRate,
                channels: buffer.numberOfChannels,
              },
            },
          });
        }

        // Create player for preview
        if (playerRef.current) {
          playerRef.current.dispose();
        }
        playerRef.current = new Tone.Player(sampleUrl).toDestination();
      } catch (err) {
        console.error('[SampleEditor] Failed to load audio:', err);
        setError('Failed to load audio file');
      } finally {
        setIsLoading(false);
      }
    };

    loadBuffer();

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [sampleUrl]);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const midY = height / 2;

    // Clear canvas with dark background
    ctx.fillStyle = '#0f0c0c';
    ctx.fillRect(0, 0, width, height);

    // Draw grid lines
    ctx.strokeStyle = '#1d1818';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (height / 4) * i);
      ctx.lineTo(width, (height / 4) * i);
      ctx.stroke();
    }

    // Center line
    ctx.strokeStyle = '#2f2525';
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    if (!audioBuffer) {
      // Draw placeholder with larger, clearer text
      ctx.fillStyle = '#888080';
      ctx.font = 'bold 24px "JetBrains Mono", "Consolas", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Drop audio file here or click to upload', width / 2, midY - 15);
      ctx.fillStyle = '#585050';
      ctx.font = '18px "JetBrains Mono", "Consolas", monospace';
      ctx.fillText('WAV, MP3, OGG, FLAC supported', width / 2, midY + 25);
      return;
    }

    // Get audio data
    const channelData = audioBuffer.getChannelData(0);
    const samples = channelData.length;
    const visibleSamples = Math.floor(samples / zoom);
    const samplesPerPixel = visibleSamples / width;

    // Draw waveform
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = 0; x < width; x++) {
      const sampleIndex = Math.floor(x * samplesPerPixel);
      const nextSampleIndex = Math.floor((x + 1) * samplesPerPixel);

      let min = 1;
      let max = -1;
      for (let i = sampleIndex; i < nextSampleIndex && i < samples; i++) {
        const val = channelData[i];
        if (val < min) min = val;
        if (val > max) max = val;
      }

      const minY = midY - min * midY * 0.85;
      const maxY = midY - max * midY * 0.85;

      if (x === 0) {
        ctx.moveTo(x, minY);
      }
      ctx.lineTo(x, minY);
      ctx.lineTo(x, maxY);
    }
    ctx.stroke();

    // Draw start/end region
    const startX = startTime * width;
    const endX = endTime * width;

    // Dimmed regions outside selection
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, startX, height);
    ctx.fillRect(endX, 0, width - endX, height);

    // Start marker (green)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, height);
    ctx.stroke();
    ctx.fillStyle = '#10b981';
    ctx.font = '10px sans-serif';
    ctx.fillText('S', startX + 3, 12);

    // End marker (orange)
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX, height);
    ctx.stroke();
    ctx.fillStyle = '#f97316';
    ctx.fillText('E', endX - 10, 12);

    // Loop region (if enabled)
    if (loopEnabled) {
      const loopStartX = loopStart * width;
      const loopEndX = loopEnd * width;

      ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
      ctx.fillRect(loopStartX, 0, loopEndX - loopStartX, height);

      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(loopStartX, 0);
      ctx.lineTo(loopStartX, height);
      ctx.moveTo(loopEndX, 0);
      ctx.lineTo(loopEndX, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Granular scan position
    if (isGranular && granular) {
      const scanX = (granular.scanPosition / 100) * width;
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(scanX, 0);
      ctx.lineTo(scanX, height);
      ctx.stroke();
      ctx.fillStyle = '#a855f7';
      ctx.font = '10px sans-serif';
      ctx.fillText('G', scanX + 3, height - 4);
    }

    // Playback position
    if (isPlaying && playbackPosition > 0) {
      const posX = playbackPosition * width;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(posX, 0);
      ctx.lineTo(posX, height);
      ctx.stroke();
    }
  }, [audioBuffer, zoom, startTime, endTime, loopEnabled, loopStart, loopEnd, isPlaying, playbackPosition, isGranular, granular]);

  // Update parameter helper
  const updateParam = useCallback((key: string, value: any) => {
    updateInstrument(instrument.id, {
      parameters: {
        ...instrument.parameters,
        [key]: value,
      },
    });
  }, [instrument.id, instrument.parameters, updateInstrument]);

  // Update granular parameter helper
  const updateGranular = useCallback((key: string, value: any) => {
    updateInstrument(instrument.id, {
      granular: {
        ...DEFAULT_GRANULAR,
        ...instrument.granular,
        [key]: value,
      },
    });
  }, [instrument.id, instrument.granular, updateInstrument]);

  // Handle file upload
  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith('audio/') && !file.name.match(/\.(wav|mp3|ogg|flac|webm)$/i)) {
      setError('Invalid file type. Please upload an audio file.');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setError('File too large. Maximum size is 15MB.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Read as data URL for storage
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Get duration
      const duration = await new Promise<number>((resolve, reject) => {
        const audio = new Audio();
        audio.onloadedmetadata = () => resolve(audio.duration);
        audio.onerror = reject;
        audio.src = dataUrl;
      });

      // Update instrument
      const updates: Partial<InstrumentConfig> = {
        parameters: {
          ...instrument.parameters,
          sampleUrl: dataUrl,
          sampleInfo: {
            name: file.name,
            duration,
            size: file.size,
          },
          startTime: 0,
          endTime: 1,
          loopStart: 0,
          loopEnd: 1,
        },
      };

      // Also update granular sampleUrl if it's a granular synth
      if (isGranular) {
        updates.granular = {
          ...DEFAULT_GRANULAR,
          ...instrument.granular,
          sampleUrl: dataUrl,
        };
      }

      updateInstrument(instrument.id, updates);
    } catch (err) {
      setError('Failed to load audio file');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [instrument, updateInstrument, isGranular]);

  // File input change handler
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  // Canvas click to set markers
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.stopPropagation(); // Prevent double file picker from parent onClick
    if (!audioBuffer) {
      fileInputRef.current?.click();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;

    if (e.shiftKey) {
      updateParam('endTime', Math.max(x, startTime + 0.01));
    } else if (e.altKey && loopEnabled) {
      if (e.ctrlKey || e.metaKey) {
        updateParam('loopEnd', Math.max(x, loopStart + 0.01));
      } else {
        updateParam('loopStart', Math.min(x, loopEnd - 0.01));
      }
    } else if (isGranular && e.ctrlKey) {
      updateGranular('scanPosition', x * 100);
    } else {
      updateParam('startTime', Math.min(x, endTime - 0.01));
    }
  };

  // Preview playback
  const handlePlay = async () => {
    if (!playerRef.current || !audioBuffer) return;

    await Tone.start();

    if (isPlaying) {
      playerRef.current.stop();
      setIsPlaying(false);
      setPlaybackPosition(0);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    playerRef.current.playbackRate = playbackRate;
    playerRef.current.reverse = reverse;

    const startOffset = startTime * audioBuffer.duration;
    const duration = (endTime - startTime) * audioBuffer.duration;

    playerRef.current.start(Tone.now(), startOffset, duration);
    setIsPlaying(true);

    const startToneTime = Tone.now();
    const animate = () => {
      const elapsed = Tone.now() - startToneTime;
      const progress = startTime + (elapsed / audioBuffer.duration) * (endTime - startTime) / playbackRate;

      if (progress >= endTime) {
        setIsPlaying(false);
        setPlaybackPosition(0);
        return;
      }

      setPlaybackPosition(progress);
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
  };

  // Clear sample
  const handleClear = () => {
    if (isPlaying) {
      playerRef.current?.stop();
      setIsPlaying(false);
    }
    setAudioBuffer(null);
    updateInstrument(instrument.id, {
      parameters: {
        ...instrument.parameters,
        sampleUrl: null,
        sampleInfo: null,
      },
      ...(isGranular ? { granular: { ...DEFAULT_GRANULAR, ...instrument.granular, sampleUrl: '' } } : {}),
    });
  };

  // Format helpers
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(2);
    return `${mins}:${secs.padStart(5, '0')}`;
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-text-primary text-sm font-bold flex items-center gap-2">
          {isGranular ? <Sparkles size={16} className="text-violet-400" /> : <Music size={16} className="text-accent-primary" />}
          {isGranular ? 'GRANULAR SAMPLE' : 'SAMPLE'}
        </h3>
        <div className="flex items-center gap-2">
          {audioBuffer && (
            <button
              onClick={() => setShowEnhancer(!showEnhancer)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors ${
                showEnhancer 
                  ? 'bg-accent-primary text-text-inverse' 
                  : 'bg-accent-primary/10 text-accent-primary border border-accent-primary/30 hover:bg-accent-primary/20'
              }`}
            >
              <Wand2 size={12} />
              {showEnhancer ? 'Hide Enhancer' : 'Enhance'}
            </button>
          )}
          {sampleInfo && (
            <span className="text-xs text-text-muted font-mono truncate max-w-[180px]">
              {sampleInfo.name}
            </span>
          )}
        </div>
      </div>

      {/* Enhancement Panel */}
      {showEnhancer && audioBuffer && (
        <SampleEnhancerPanel
          audioBuffer={audioBuffer}
          isLoading={isLoading}
          onBufferProcessed={async (result: ProcessedResult) => {
            const { buffer: newBuffer, dataUrl } = result;
            
            // Set the local buffer state immediately for visualization
            setAudioBuffer(newBuffer);

            updateInstrument(instrument.id, {
              parameters: {
                ...instrument.parameters,
                sampleUrl: dataUrl,
                sampleInfo: {
                  name: sampleInfo?.name ? (sampleInfo.name.startsWith('Enhanced_') ? sampleInfo.name : `Enhanced_${sampleInfo.name}`) : 'Enhanced Sample',
                  duration: newBuffer.duration,
                  size: Math.round((dataUrl.split(',')[1].length * 3) / 4), // Accurate base64 size
                  sampleRate: newBuffer.sampleRate,
                  channels: newBuffer.numberOfChannels,
                }
              }
            });
          }}
        />
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-accent-error/20 border border-accent-error/40 rounded text-accent-error text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Waveform Display */}
      <div
        ref={dropZoneRef}
        className={`relative rounded-lg overflow-hidden border-2 transition-colors ${
          isDragging ? 'border-accent-primary border-dashed bg-accent-primary/10' : 'border-dark-border'
        } ${!audioBuffer ? 'cursor-pointer hover:border-accent-primary/50' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !audioBuffer && fileInputRef.current?.click()}
      >
        <canvas
          ref={canvasRef}
          width={1120}
          height={300}
          className="w-full h-[150px] cursor-crosshair"
          style={{ imageRendering: 'pixelated' }}
          onClick={handleCanvasClick}
        />

        {isLoading && (
          <div className="absolute inset-0 bg-dark-bg/80 flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full" />
          </div>
        )}

        {isDragging && (
          <div className="absolute inset-0 bg-accent-primary/20 flex items-center justify-center">
            <Upload size={32} className="text-accent-primary animate-bounce" />
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.wav,.mp3,.ogg,.flac,.webm"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Sample Info & Controls */}
      {audioBuffer && sampleInfo && (
        <>
          {/* Info row */}
          <div className="flex items-center justify-between text-xs font-mono text-text-muted">
            <span>Duration: {formatDuration(sampleInfo.duration)}</span>
            <span>Size: {formatSize(sampleInfo.size)}</span>
            <span>
              {sampleInfo.sampleRate ? `${(sampleInfo.sampleRate / 1000).toFixed(1)}kHz` : ''}
              {sampleInfo.channels === 1 ? ' Mono' : sampleInfo.channels === 2 ? ' Stereo' : ''}
            </span>
          </div>

          {/* Playback controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 bg-accent-primary/20 text-accent-primary rounded hover:bg-accent-primary/30 transition-colors text-sm"
            >
              <Upload size={14} />
              Replace
            </button>

            <button
              onClick={handlePlay}
              className={`p-2 rounded transition-colors ${
                isPlaying ? 'bg-accent-error/20 text-accent-error' : 'bg-accent-success/20 text-accent-success'
              }`}
              title={isPlaying ? 'Stop' : 'Play preview'}
            >
              {isPlaying ? <Square size={16} /> : <Play size={16} />}
            </button>

            <button
              onClick={handleClear}
              className="p-2 bg-accent-error/20 text-accent-error rounded hover:bg-accent-error/30 transition-colors"
              title="Remove sample"
            >
              <Trash2 size={16} />
            </button>

            <div className="flex-1" />

            {/* Destructive Tools */}
            <div className="flex items-center gap-1 bg-dark-bgSecondary p-1 rounded-lg border border-dark-border">
              <button
                onClick={async () => {
                  setIsLoading(true);
                  try {
                    await reverseSample(instrument.id);
                    notify.success('Sample reversed destructively');
                  } catch (e) {
                    notify.error('Failed to reverse sample');
                  } finally {
                    setIsLoading(false);
                  }
                }}
                className="p-1.5 hover:bg-white/10 rounded transition-colors text-text-secondary"
                title="Reverse Buffer (Destructive)"
              >
                <RefreshCcw size={14} className="-scale-x-100" />
              </button>
              <button
                onClick={async () => {
                  setIsLoading(true);
                  try {
                    await normalizeSample(instrument.id);
                    notify.success('Sample normalized');
                  } catch (e) {
                    notify.error('Failed to normalize sample');
                  } finally {
                    setIsLoading(false);
                  }
                }}
                className="p-1.5 hover:bg-white/10 rounded transition-colors text-text-secondary"
                title="Normalize Buffer (Destructive)"
              >
                <Maximize2 size={14} />
              </button>
              <button
                onClick={async () => {
                  setIsLoading(true);
                  try {
                    await invertLoopSample(instrument.id);
                    notify.success('Loop area inverted (Funk Repeat)');
                  } catch (e) {
                    notify.error('Failed to invert loop');
                  } finally {
                    setIsLoading(false);
                  }
                }}
                disabled={!loopEnabled}
                className="p-1.5 hover:bg-white/10 rounded transition-colors text-text-secondary disabled:opacity-30"
                title="Invert Loop Phase (Destructive EFx)"
              >
                <FlipVertical size={14} />
              </button>
            </div>

            {/* Zoom */}
            <button
              onClick={() => setZoom(Math.max(1, zoom / 1.5))}
              disabled={zoom <= 1}
              className="p-2 bg-dark-bgTertiary text-text-secondary rounded hover:bg-dark-bgHover disabled:opacity-30"
              title="Zoom out"
            >
              <ZoomOut size={14} />
            </button>
            <span className="text-xs font-mono text-text-muted w-10 text-center">{zoom.toFixed(1)}x</span>
            <button
              onClick={() => setZoom(Math.min(16, zoom * 1.5))}
              disabled={zoom >= 16}
              className="p-2 bg-dark-bgTertiary text-text-secondary rounded hover:bg-dark-bgHover disabled:opacity-30"
              title="Zoom in"
            >
              <ZoomIn size={14} />
            </button>
          </div>

          {/* Parameters Panel */}
          <div className="panel p-4 rounded-lg space-y-4">
            {/* Base Note (for Sampler) */}
            {instrument.synthType === 'Sampler' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-mono text-text-muted text-xs mb-2">BASE NOTE</label>
                  <div className="flex gap-1">
                    <select
                      value={baseNote.replace(/\d/, '')}
                      onChange={(e) => {
                        const oct = baseNote.match(/\d/)?.[0] || '4';
                        updateParam('baseNote', e.target.value + oct);
                      }}
                      className="input flex-1"
                    >
                      {NOTE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <select
                      value={baseNote.match(/\d/)?.[0] || '4'}
                      onChange={(e) => {
                        const note = baseNote.replace(/\d/, '');
                        updateParam('baseNote', note + e.target.value);
                      }}
                      className="input w-14"
                    >
                      {OCTAVE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block font-mono text-text-muted text-xs mb-2">
                    PLAYBACK: <span className="text-accent-primary">{playbackRate.toFixed(2)}x</span>
                  </label>
                  <input
                    type="range" min="0.25" max="4" step="0.01"
                    value={playbackRate}
                    onChange={(e) => updateParam('playbackRate', parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            {/* Start/End */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-mono text-text-muted text-xs mb-2">
                  START: <span className="text-accent-success">{(startTime * 100).toFixed(1)}%</span>
                </label>
                <input
                  type="range" min="0" max="0.99" step="0.001"
                  value={startTime}
                  onChange={(e) => updateParam('startTime', Math.min(parseFloat(e.target.value), endTime - 0.01))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block font-mono text-text-muted text-xs mb-2">
                  END: <span className="text-accent-secondary">{(endTime * 100).toFixed(1)}%</span>
                </label>
                <input
                  type="range" min="0.01" max="1" step="0.001"
                  value={endTime}
                  onChange={(e) => updateParam('endTime', Math.max(parseFloat(e.target.value), startTime + 0.01))}
                  className="w-full"
                />
              </div>
            </div>

            {/* Reverse toggle */}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox" checked={reverse}
                  onChange={(e) => updateParam('reverse', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="font-mono text-text-secondary text-xs">REVERSE</span>
              </label>
            </div>

            {/* Loop Section */}
            <div className="border-t border-dark-border pt-4">
              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input
                  type="checkbox" checked={loopEnabled}
                  onChange={(e) => updateParam('loopEnabled', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <Repeat size={14} className="text-blue-400" />
                <span className="font-mono text-text-secondary text-xs">ENABLE LOOP</span>
              </label>

              {loopEnabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-mono text-text-muted text-xs mb-2">
                      LOOP START: <span className="text-blue-400">{(loopStart * 100).toFixed(1)}%</span>
                    </label>
                    <input
                      type="range" min="0" max="0.99" step="0.001"
                      value={loopStart}
                      onChange={(e) => updateParam('loopStart', Math.min(parseFloat(e.target.value), loopEnd - 0.01))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-text-muted text-xs mb-2">
                      LOOP END: <span className="text-blue-400">{(loopEnd * 100).toFixed(1)}%</span>
                    </label>
                    <input
                      type="range" min="0.01" max="1" step="0.001"
                      value={loopEnd}
                      onChange={(e) => updateParam('loopEnd', Math.max(parseFloat(e.target.value), loopStart + 0.01))}
                      className="w-full"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Granular-specific controls */}
            {isGranular && granular && (
              <div className="border-t border-dark-border pt-4 space-y-4">
                <h4 className="font-mono text-violet-400 text-xs font-bold flex items-center gap-2">
                  <Sparkles size={12} />
                  GRANULAR CONTROLS
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-mono text-text-muted text-xs mb-2">
                      GRAIN SIZE: <span className="text-violet-400">{granular.grainSize}ms</span>
                    </label>
                    <input
                      type="range" min="10" max="500" step="1"
                      value={granular.grainSize}
                      onChange={(e) => updateGranular('grainSize', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-text-muted text-xs mb-2">
                      OVERLAP: <span className="text-violet-400">{granular.grainOverlap}%</span>
                    </label>
                    <input
                      type="range" min="0" max="100" step="1"
                      value={granular.grainOverlap}
                      onChange={(e) => updateGranular('grainOverlap', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-mono text-text-muted text-xs mb-2">
                      SCAN POS: <span className="text-violet-400">{granular.scanPosition.toFixed(0)}%</span>
                    </label>
                    <input
                      type="range" min="0" max="100" step="0.1"
                      value={granular.scanPosition}
                      onChange={(e) => updateGranular('scanPosition', parseFloat(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-text-muted text-xs mb-2">
                      SCAN SPEED: <span className="text-violet-400">{granular.scanSpeed}%</span>
                    </label>
                    <input
                      type="range" min="-100" max="100" step="1"
                      value={granular.scanSpeed}
                      onChange={(e) => updateGranular('scanSpeed', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-mono text-text-muted text-xs mb-2">
                      DENSITY: <span className="text-violet-400">{granular.density}</span>
                    </label>
                    <input
                      type="range" min="1" max="16" step="1"
                      value={granular.density}
                      onChange={(e) => updateGranular('density', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-text-muted text-xs mb-2">
                      PITCH RAND: <span className="text-violet-400">{granular.randomPitch}%</span>
                    </label>
                    <input
                      type="range" min="0" max="100" step="1"
                      value={granular.randomPitch}
                      onChange={(e) => updateGranular('randomPitch', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox" checked={granular.reverse}
                      onChange={(e) => updateGranular('reverse', e.target.checked)}
                      className="w-4 h-4 rounded"
                    />
                    <span className="font-mono text-text-secondary text-xs">REVERSE GRAINS</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Help text */}
          <div className="text-xs text-text-muted space-y-1">
            <p><span className="text-text-secondary">Click</span> waveform = set start | <span className="text-text-secondary">Shift+Click</span> = set end</p>
            {loopEnabled && <p><span className="text-text-secondary">Alt+Click</span> = loop start | <span className="text-text-secondary">Alt+Ctrl+Click</span> = loop end</p>}
            {isGranular && <p><span className="text-text-secondary">Ctrl+Click</span> = set granular scan position</p>}
          </div>
        </>
      )}

      {/* Type-specific info */}
      {!audioBuffer && (
        <div className="text-center text-text-muted text-sm py-2">
          {instrument.synthType === 'Sampler' && 'Sampler maps the sample to C4 and pitches across the keyboard'}
          {instrument.synthType === 'Player' && 'Player plays the full sample as a one-shot or loop'}
          {instrument.synthType === 'GranularSynth' && 'Granular breaks the sample into tiny grains for texture and pads'}
        </div>
      )}
    </div>
  );
};
