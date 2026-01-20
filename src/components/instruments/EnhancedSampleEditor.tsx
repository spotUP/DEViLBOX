/**
 * EnhancedSampleEditor - Full-featured sample editor with waveform display
 * Features: waveform visualization, loop points, playback preview, basic editing
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import {
  FileAudio,
  Upload,
  Play,
  Square,
  Scissors,
  Volume2,
  Repeat,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import * as Tone from 'tone';

interface EnhancedSampleEditorProps {
  instrumentId: number;
}

interface SampleInfo {
  url: string;
  duration: number;
  sampleRate: number;
  channels: number;
  name: string;
}

interface LoopSettings {
  enabled: boolean;
  start: number; // 0-1 normalized
  end: number; // 0-1 normalized
  mode: 'forward' | 'pingpong' | 'reverse';
}

export const EnhancedSampleEditor: React.FC<EnhancedSampleEditorProps> = ({
  instrumentId,
}) => {
  const { instruments, updateInstrument } = useInstrumentStore();
  const instrument = instruments.find((i) => i.id === instrumentId);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<Tone.Player | null>(null);

  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [sampleInfo, setSampleInfo] = useState<SampleInfo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [scrollOffset] = useState(0);
  const [loopSettings, setLoopSettings] = useState<LoopSettings>({
    enabled: false,
    start: 0,
    end: 1,
    mode: 'forward',
  });
  const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null);

  // Load sample when URL changes
  useEffect(() => {
    const sampleUrl = instrument?.parameters?.sampleUrl;
    if (!sampleUrl) {
      requestAnimationFrame(() => {
        setAudioBuffer(null);
        setSampleInfo(null);
      });
      return;
    }

    // Decode audio
    const loadSample = async () => {
      try {
        const buffer = await Tone.getContext().decodeAudioData(
          await fetch(sampleUrl).then(r => r.arrayBuffer())
        );

        setAudioBuffer(buffer);
        setSampleInfo({
          url: sampleUrl,
          duration: buffer.duration,
          sampleRate: buffer.sampleRate,
          channels: buffer.numberOfChannels,
          name: sampleUrl.split('/').pop() || 'Sample',
        });
      } catch (error) {
        console.error('Failed to load sample:', error);
      }
    };

    loadSample();
  }, [instrument?.parameters?.sampleUrl]);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioBuffer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const data = audioBuffer.getChannelData(0);
    const samplesPerPixel = Math.floor(data.length / (width * zoom));
    const startSample = Math.floor(scrollOffset * data.length);

    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // Draw waveform
    ctx.strokeStyle = '#4f9d69';
    ctx.lineWidth = 1;
    ctx.beginPath();

    const midY = height / 2;

    for (let x = 0; x < width; x++) {
      const sampleIndex = startSample + x * samplesPerPixel;
      if (sampleIndex >= data.length) break;

      // Get min/max for this pixel
      let min = 1;
      let max = -1;
      for (let j = 0; j < samplesPerPixel && sampleIndex + j < data.length; j++) {
        const sample = data[sampleIndex + j];
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }

      const y1 = midY - max * midY * 0.9;
      const y2 = midY - min * midY * 0.9;

      ctx.moveTo(x, y1);
      ctx.lineTo(x, y2);
    }

    ctx.stroke();

    // Draw center line
    ctx.strokeStyle = '#3a3a4e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    // Draw loop markers
    if (loopSettings.enabled) {
      const startX = loopSettings.start * width;
      const endX = loopSettings.end * width;

      // Loop region
      ctx.fillStyle = 'rgba(79, 157, 105, 0.1)';
      ctx.fillRect(startX, 0, endX - startX, height);

      // Start marker
      ctx.fillStyle = '#4f9d69';
      ctx.fillRect(startX - 2, 0, 4, height);
      ctx.fillStyle = '#fff';
      ctx.font = '10px monospace';
      ctx.fillText('S', startX + 4, 12);

      // End marker
      ctx.fillStyle = '#d97706';
      ctx.fillRect(endX - 2, 0, 4, height);
      ctx.fillStyle = '#fff';
      ctx.fillText('E', endX - 14, 12);
    }

    // Draw playback position
    if (playbackPosition > 0) {
      const posX = playbackPosition * width;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(posX, 0);
      ctx.lineTo(posX, height);
      ctx.stroke();
    }
  }, [audioBuffer, zoom, scrollOffset, loopSettings, playbackPosition]);

  const sampleUrl = instrument?.parameters?.sampleUrl;
  const instrumentParams = instrument?.parameters;

  // Handle file drop/select
  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith('audio/')) {
      console.warn('Not an audio file');
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: file.type });
      const url = URL.createObjectURL(blob);

      updateInstrument(instrumentId, {
        parameters: {
          ...instrumentParams,
          sampleUrl: url,
          sampleName: file.name,
        },
      });
    } catch (error) {
      console.error('Failed to load file:', error);
    }
  }, [instrumentId, instrumentParams, updateInstrument]);

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  // Handle drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  // Playback controls
  const handlePlay = useCallback(async () => {
    if (!sampleUrl) return;

    await Tone.start();

    if (playerRef.current) {
      playerRef.current.dispose();
    }

    const duration = sampleInfo?.duration || 0;

    playerRef.current = new Tone.Player({
      url: sampleUrl,
      loop: loopSettings.enabled,
      loopStart: loopSettings.start * duration,
      loopEnd: loopSettings.end * duration,
      onload: () => {
        playerRef.current?.start();
        setIsPlaying(true);
      },
      onstop: () => {
        setIsPlaying(false);
        setPlaybackPosition(0);
      },
    }).toDestination();
  }, [sampleUrl, loopSettings, sampleInfo?.duration]);

  const handleStop = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.stop();
      setIsPlaying(false);
      setPlaybackPosition(0);
    }
  }, []);

  // Handle canvas click for loop markers
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;

    // Check if clicking near a marker
    const startX = loopSettings.start * canvas.width;
    const endX = loopSettings.end * canvas.width;

    if (Math.abs(x - startX) < 10 && loopSettings.enabled) {
      setIsDragging('start');
    } else if (Math.abs(x - endX) < 10 && loopSettings.enabled) {
      setIsDragging('end');
    }
  }, [loopSettings]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, canvas.width));
    const normalized = x / canvas.width;

    setLoopSettings((prev) => {
      if (isDragging === 'start') {
        return { ...prev, start: Math.min(normalized, prev.end - 0.01) };
      } else {
        return { ...prev, end: Math.max(normalized, prev.start + 0.01) };
      }
    });
  }, [isDragging]);

  const handleCanvasMouseUp = useCallback(() => {
    setIsDragging(null);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
      }
    };
  }, []);

  // Format time
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(2);
    return `${mins}:${secs.padStart(5, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <FileAudio size={16} className="text-accent-primary" />
          Sample Editor
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-bgTertiary border border-dark-border rounded text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <Upload size={14} />
            Load
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileInputChange}
            className="hidden"
          />
        </div>
      </div>

      {/* Waveform Display */}
      <div
        className="relative bg-dark-bgSecondary rounded-lg border border-dark-border overflow-hidden"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {audioBuffer ? (
          <canvas
            ref={canvasRef}
            width={600}
            height={120}
            className="w-full cursor-crosshair"
            onClick={handleCanvasClick}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
          />
        ) : (
          <div className="h-32 flex items-center justify-center text-text-muted">
            <div className="text-center">
              <Upload size={24} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Drop audio file here or click Load</p>
            </div>
          </div>
        )}
      </div>

      {/* Sample Info */}
      {sampleInfo && (
        <div className="flex items-center gap-4 text-xs text-text-muted bg-dark-bgSecondary rounded-lg px-3 py-2">
          <span>Duration: {formatTime(sampleInfo.duration)}</span>
          <span>Rate: {(sampleInfo.sampleRate / 1000).toFixed(1)}kHz</span>
          <span>Channels: {sampleInfo.channels === 1 ? 'Mono' : 'Stereo'}</span>
          <span className="flex-1 text-right truncate">{sampleInfo.name}</span>
        </div>
      )}

      {/* Playback Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={isPlaying ? handleStop : handlePlay}
          disabled={!audioBuffer}
          className="p-2 bg-accent-primary rounded-lg text-text-inverse hover:bg-accent-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
          title={isPlaying ? 'Stop' : 'Play'}
        >
          {isPlaying ? <Square size={16} /> : <Play size={16} />}
        </button>

        <div className="h-6 w-px bg-dark-border" />

        {/* Zoom controls */}
        <button
          onClick={() => setZoom(Math.min(8, zoom * 2))}
          className="p-2 bg-dark-bgSecondary rounded text-text-muted hover:text-text-primary"
          title="Zoom in"
        >
          <ZoomIn size={14} />
        </button>
        <button
          onClick={() => setZoom(Math.max(1, zoom / 2))}
          className="p-2 bg-dark-bgSecondary rounded text-text-muted hover:text-text-primary"
          title="Zoom out"
        >
          <ZoomOut size={14} />
        </button>
        <span className="text-xs text-text-muted">{zoom}x</span>

        <div className="h-6 w-px bg-dark-border" />

        {/* Preview at different pitches */}
        <span className="text-xs text-text-muted">Preview:</span>
        {['C3', 'C4', 'C5'].map((note) => (
          <button
            key={note}
            disabled={!audioBuffer}
            className="px-2 py-1 bg-dark-bgSecondary rounded text-xs text-text-secondary hover:text-text-primary disabled:opacity-50"
            title={`Play at ${note}`}
          >
            {note}
          </button>
        ))}
      </div>

      {/* Loop Settings */}
      <div className="bg-dark-bgSecondary rounded-lg p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-primary flex items-center gap-2">
            <Repeat size={14} />
            Loop Settings
          </span>
          <button
            onClick={() => setLoopSettings((prev) => ({ ...prev, enabled: !prev.enabled }))}
            className={`
              px-3 py-1 rounded text-xs font-medium transition-colors
              ${loopSettings.enabled
                ? 'bg-accent-primary/20 text-accent-primary'
                : 'bg-dark-bg text-text-muted'
              }
            `}
          >
            {loopSettings.enabled ? 'On' : 'Off'}
          </button>
        </div>

        {loopSettings.enabled && (
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <label className="text-text-muted block mb-1">Start</label>
              <input
                type="number"
                value={Math.round(loopSettings.start * (sampleInfo?.duration || 0) * 1000)}
                onChange={(e) =>
                  setLoopSettings((prev) => ({
                    ...prev,
                    start: Math.max(0, Number(e.target.value) / 1000 / (sampleInfo?.duration || 1)),
                  }))
                }
                className="w-full px-2 py-1 bg-dark-bg border border-dark-border rounded text-text-primary"
              />
              <span className="text-text-muted">ms</span>
            </div>
            <div>
              <label className="text-text-muted block mb-1">End</label>
              <input
                type="number"
                value={Math.round(loopSettings.end * (sampleInfo?.duration || 0) * 1000)}
                onChange={(e) =>
                  setLoopSettings((prev) => ({
                    ...prev,
                    end: Math.min(1, Number(e.target.value) / 1000 / (sampleInfo?.duration || 1)),
                  }))
                }
                className="w-full px-2 py-1 bg-dark-bg border border-dark-border rounded text-text-primary"
              />
              <span className="text-text-muted">ms</span>
            </div>
            <div>
              <label className="text-text-muted block mb-1">Mode</label>
              <select
                value={loopSettings.mode}
                onChange={(e) =>
                  setLoopSettings((prev) => ({
                    ...prev,
                    mode: e.target.value as LoopSettings['mode'],
                  }))
                }
                className="w-full px-2 py-1 bg-dark-bg border border-dark-border rounded text-text-primary"
              >
                <option value="forward">Forward</option>
                <option value="pingpong">Ping Pong</option>
                <option value="reverse">Reverse</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Edit Actions */}
      <div className="flex items-center gap-2">
        <button
          disabled={!audioBuffer}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-bgSecondary border border-dark-border rounded text-sm text-text-secondary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
          title="Normalize volume"
        >
          <Volume2 size={14} />
          Normalize
        </button>
        <button
          disabled={!audioBuffer}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-bgSecondary border border-dark-border rounded text-sm text-text-secondary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
          title="Trim silence"
        >
          <Scissors size={14} />
          Trim
        </button>
        <button
          disabled={!audioBuffer}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-bgSecondary border border-dark-border rounded text-sm text-text-secondary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
          title="Reverse sample"
        >
          <RotateCcw size={14} />
          Reverse
        </button>
      </div>
    </div>
  );
};
