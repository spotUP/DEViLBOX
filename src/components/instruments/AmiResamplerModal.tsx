/**
 * AmiResamplerModal.tsx — Amiga-style sample resampler
 *
 * Offline processing via AmiSampler WASM module:
 *   - Nearest-neighbor resampling (Amiga-style)
 *   - 8-bit Paula quantization
 *   - Sample & Hold decimation
 *   - A500/A1200 RC filter emulation + LED filter
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';
import { X, Play, Square, Zap } from 'lucide-react';
import { amiResample, DEFAULT_AMI_OPTIONS } from '../../engine/ami-sampler/AmiSamplerDSP';
import type { AmiResampleOptions } from '../../engine/ami-sampler/AmiSamplerDSP';
import type { ProcessedResult } from '../../utils/audio/SampleProcessing';
import { notify } from '../../stores/useNotificationStore';
import { Button } from '../ui/Button';
import { Toggle } from '../controls/Toggle';

// ============================================================================
// Types
// ============================================================================

interface AmiResamplerModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioBuffer: AudioBuffer | null;
  onBufferProcessed: (result: ProcessedResult) => void;
}

// Amiga-style rate presets
const RATE_PRESETS = [
  { label: 'C-1 PAL', value: 4181 },
  { label: 'C-2 PAL', value: 8363 },
  { label: 'C-3 PAL', value: 16726 },
  { label: 'MAX DMA', value: 28867 },
  { label: '11025', value: 11025 },
  { label: '22050', value: 22050 },
] as const;

// Waveform colors (matching SampleEditor style)
const WAVE_BG = '#0f0c0c';
const WAVE_GRID = '#1d1818';
const WAVE_CENTER = '#2f2525';
const WAVE_ORIGINAL = '#ef4444'; // Red accent
const WAVE_PREVIEW = '#f97316';  // Orange accent

// ============================================================================
// Waveform Drawing
// ============================================================================

/**
 * Draw a single waveform layer (used by drawOverlayWaveform).
 * Does NOT clear or draw background — caller handles that.
 */
function drawWaveformLayer(
  ctx: CanvasRenderingContext2D,
  data: Float32Array,
  w: number,
  h: number,
  color: string,
  alpha: number,
): void {
  const cy = h / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();

  const step = Math.max(1, Math.floor(data.length / w));
  for (let x = 0; x < w; x++) {
    const idx = Math.floor((x / w) * data.length);
    let min = 1.0;
    let max = -1.0;
    for (let j = 0; j < step && idx + j < data.length; j++) {
      const v = data[idx + j];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const y1 = cy - max * cy;
    const y2 = cy - min * cy;
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw overlaid before/after waveforms on a single canvas.
 * Original is drawn at reduced opacity, resampled is drawn on top
 * as a brighter "ghost" overlay so differences are visible.
 */
function drawOverlayWaveform(
  canvas: HTMLCanvasElement,
  original: AudioBuffer | null,
  resampled: AudioBuffer | null,
  targetRate: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = WAVE_BG;
  ctx.fillRect(0, 0, w, h);

  // Grid lines (quarter divisions)
  ctx.strokeStyle = WAVE_GRID;
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const x = (w / 4) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // Center line
  const cy = h / 2;
  ctx.strokeStyle = WAVE_CENTER;
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(w, cy);
  ctx.stroke();

  // Draw original waveform (dimmed when resampled exists)
  if (original && original.length > 0) {
    const origAlpha = resampled ? 0.3 : 0.8;
    drawWaveformLayer(ctx, original.getChannelData(0), w, h, WAVE_ORIGINAL, origAlpha);
  }

  // Draw resampled waveform on top as ghost overlay
  if (resampled && resampled.length > 0) {
    drawWaveformLayer(ctx, resampled.getChannelData(0), w, h, WAVE_PREVIEW, 0.9);
  }

  // Labels
  ctx.font = '10px "JetBrains Mono", monospace';

  if (original && original.length > 0) {
    // Original label + info (left side)
    ctx.fillStyle = resampled ? WAVE_ORIGINAL + '88' : WAVE_ORIGINAL;
    ctx.fillText('ORIGINAL', 6, 14);

    const durMs = ((original.length / original.sampleRate) * 1000).toFixed(0);
    const info = `${original.length.toLocaleString()} smp \u00b7 ${durMs}ms \u00b7 ${original.sampleRate} Hz`;
    ctx.fillStyle = '#504848';
    ctx.fillText(info, 6, h - 6);
  } else {
    ctx.fillStyle = '#686060';
    ctx.fillText('No sample loaded', w / 2 - 40, cy + 4);
  }

  if (resampled && resampled.length > 0) {
    // Resampled label (right side, top)
    const resLabel = `RESAMPLED \u00b7 ${targetRate} Hz`;
    const tm = ctx.measureText(resLabel);
    ctx.fillStyle = WAVE_PREVIEW;
    ctx.fillText(resLabel, w - tm.width - 6, 14);

    // Resampled info (right side, bottom)
    const durMs = ((resampled.length / resampled.sampleRate) * 1000).toFixed(0);
    const resInfo = `${resampled.length.toLocaleString()} smp \u00b7 ${durMs}ms`;
    const tm2 = ctx.measureText(resInfo);
    ctx.fillStyle = WAVE_PREVIEW + '88';
    ctx.fillText(resInfo, w - tm2.width - 6, h - 6);
  } else {
    // Hint text
    const hint = 'Hit Preview to compare';
    const tm = ctx.measureText(hint);
    ctx.fillStyle = '#383030';
    ctx.fillText(hint, w - tm.width - 6, 14);
  }

  // Legend dots (bottom center, only when both exist)
  if (original && resampled) {
    const legendY = h - 7;
    const legendX = w / 2 - 50;
    // Original dot
    ctx.fillStyle = WAVE_ORIGINAL;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(legendX, legendY, 6, 6);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#686060';
    ctx.fillText('Before', legendX + 9, legendY + 6);
    // Resampled dot
    ctx.fillStyle = WAVE_PREVIEW;
    ctx.fillRect(legendX + 55, legendY, 6, 6);
    ctx.fillStyle = '#686060';
    ctx.fillText('After', legendX + 64, legendY + 6);
  }
}

// ============================================================================
// Component
// ============================================================================

export const AmiResamplerModal: React.FC<AmiResamplerModalProps> = ({
  isOpen,
  onClose,
  audioBuffer,
  onBufferProcessed,
}) => {
  const [options, setOptions] = useState<AmiResampleOptions>({ ...DEFAULT_AMI_OPTIONS });
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewBuffer, setPreviewBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<Tone.Player | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setOptions({ ...DEFAULT_AMI_OPTIONS });
      setPreviewBuffer(null);
      setIsPlaying(false);
    }
    return () => {
      stopPlayback();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Render overlay canvas when data changes
  useEffect(() => {
    if (!isOpen) return;
    if (overlayCanvasRef.current) {
      drawOverlayWaveform(
        overlayCanvasRef.current,
        audioBuffer,
        previewBuffer,
        options.targetRate,
      );
    }
  }, [isOpen, audioBuffer, previewBuffer, options.targetRate]);

  // ============================================================================
  // Audio Playback
  // ============================================================================

  const stopPlayback = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.stop();
      playerRef.current.dispose();
      playerRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const playBuffer = useCallback(async (buf: AudioBuffer) => {
    stopPlayback();
    try {
      await Tone.start();
      const toneBuffer = new Tone.ToneAudioBuffer(buf);
      const player = new Tone.Player(toneBuffer).toDestination();
      player.onstop = () => {
        setIsPlaying(false);
      };
      playerRef.current = player;
      player.start();
      setIsPlaying(true);
    } catch (err) {
      console.error('Preview playback error:', err);
      notify.error('Playback failed');
    }
  }, [stopPlayback]);

  const handlePlayToggle = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
      return;
    }
    const buf = previewBuffer || audioBuffer;
    if (buf) playBuffer(buf);
  }, [isPlaying, previewBuffer, audioBuffer, stopPlayback, playBuffer]);

  // ============================================================================
  // Processing
  // ============================================================================

  const handlePreview = useCallback(async () => {
    if (!audioBuffer || isProcessing) return;
    setIsProcessing(true);
    try {
      const result = await amiResample(audioBuffer, options);
      setPreviewBuffer(result.buffer);
      notify.success(`Resampled to ${result.outputRate} Hz`);
      // Auto-play the preview result
      await playBuffer(result.buffer);
    } catch (err) {
      console.error('Ami resample preview failed:', err);
      notify.error('Resampling failed');
    } finally {
      setIsProcessing(false);
    }
  }, [audioBuffer, isProcessing, options, playBuffer]);

  const handleApply = useCallback(async () => {
    if (!audioBuffer || isProcessing) return;
    setIsProcessing(true);
    stopPlayback();
    try {
      const result = await amiResample(audioBuffer, options);
      onBufferProcessed({ buffer: result.buffer, dataUrl: result.dataUrl });
      notify.success(`Applied Amiga resample @ ${result.outputRate} Hz`);
      onClose();
    } catch (err) {
      console.error('Ami resample apply failed:', err);
      notify.error('Resampling failed');
    } finally {
      setIsProcessing(false);
    }
  }, [audioBuffer, isProcessing, options, onBufferProcessed, onClose, stopPlayback]);

  // Options update helper
  const updateOption = useCallback(<K extends keyof AmiResampleOptions>(
    key: K,
    value: AmiResampleOptions[K],
  ) => {
    setOptions(prev => ({ ...prev, [key]: value }));
    setPreviewBuffer(null);
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-dark-bgSecondary border border-dark-border rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-dark-bgTertiary px-5 py-3 flex items-center justify-between border-b border-dark-border">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-accent-secondary" />
            <h2 className="text-sm font-bold text-text-primary tracking-wide font-mono">
              AMI-SAMPLER RESAMPLER
            </h2>
          </div>
          <Button variant="icon" size="icon" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>

        {/* Waveform Display — overlaid before/after */}
        <div className="p-3">
          <div className="rounded-lg overflow-hidden border border-dark-border">
            <canvas
              ref={overlayCanvasRef}
              className="w-full h-[140px]"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-2 gap-4 px-5 pb-4">
          {/* Left: Rate + S&H */}
          <div className="space-y-3">
            <div>
              <label className="block font-mono text-text-muted text-[10px] font-bold uppercase tracking-wide mb-1.5">
                Resample Rate
              </label>
              <div className="flex gap-1 flex-wrap">
                {RATE_PRESETS.map(preset => (
                  <button
                    key={preset.value}
                    onClick={() => updateOption('targetRate', preset.value)}
                    className={`px-2 py-1 text-[10px] font-mono font-bold rounded transition-colors cursor-pointer
                      ${options.targetRate === preset.value
                        ? 'bg-accent-secondary text-text-inverse'
                        : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary border border-dark-border'
                      }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] font-mono text-text-muted">Custom:</span>
                <input
                  type="number"
                  value={options.targetRate}
                  onChange={e => updateOption('targetRate', Math.max(1000, Math.min(48000, parseInt(e.target.value) || 8363)))}
                  className="input w-20 text-right font-mono text-xs px-2 py-1"
                  min={1000}
                  max={48000}
                />
                <span className="text-[10px] font-mono text-text-muted">Hz</span>
              </div>
            </div>

            <div>
              <label className="block font-mono text-text-muted text-[10px] font-bold uppercase tracking-wide mb-1.5">
                Sample &amp; Hold
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={16}
                  value={options.snh}
                  onChange={e => updateOption('snh', parseInt(e.target.value))}
                  className="flex-1 accent-accent-secondary"
                />
                <span className="font-mono text-xs text-accent-secondary font-bold w-6 text-right">
                  {options.snh}
                </span>
              </div>
              <span className="text-[9px] font-mono text-text-muted">
                1 = off, higher = crunchier decimation
              </span>
            </div>
          </div>

          {/* Right: Model + Toggles */}
          <div className="space-y-3">
            <div>
              <label className="block font-mono text-text-muted text-[10px] font-bold uppercase tracking-wide mb-1.5">
                Amiga Model
              </label>
              <div className="flex gap-1">
                <button
                  onClick={() => updateOption('model', 'A500')}
                  className={`flex-1 px-3 py-1.5 text-[10px] font-mono font-bold rounded transition-colors cursor-pointer
                    ${options.model === 'A500'
                      ? 'bg-accent-secondary text-text-inverse'
                      : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover border border-dark-border'
                    }`}
                >
                  A500 (LP+HP)
                </button>
                <button
                  onClick={() => updateOption('model', 'A1200')}
                  className={`flex-1 px-3 py-1.5 text-[10px] font-mono font-bold rounded transition-colors cursor-pointer
                    ${options.model === 'A1200'
                      ? 'bg-accent-secondary text-text-inverse'
                      : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover border border-dark-border'
                    }`}
                >
                  A1200 (HP)
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Toggle
                label="LED FILTER"
                value={options.ledFilter}
                onChange={v => updateOption('ledFilter', v)}
                color="#ef4444"
                size="sm"
              />
              {/* LED indicator */}
              <div
                className="w-6 h-1.5 rounded-full mt-3"
                style={{
                  background: options.ledFilter ? '#ef4444' : '#330000',
                  boxShadow: options.ledFilter ? '0 0 8px #ef4444' : 'none',
                  transition: 'all 0.2s',
                }}
              />
            </div>

            <Toggle
              label="8-BIT PAULA"
              value={options.quantize8bit}
              onChange={v => updateOption('quantize8bit', v)}
              color="#f97316"
              size="sm"
            />

            <div className="text-[9px] font-mono text-text-muted leading-relaxed p-2 bg-dark-bg rounded border border-dark-border">
              A500: R360 C0.1uF LP + R1390 C22uF HP<br />
              A1200: R1360 C22uF HP only<br />
              LED: 2-pole ~3091 Hz Butterworth LP
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between px-5 py-3 bg-dark-bgTertiary border-t border-dark-border">
          <div className="flex gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={handlePlayToggle}
              disabled={!audioBuffer && !previewBuffer}
              icon={isPlaying ? <Square size={14} /> : <Play size={14} />}
            >
              {isPlaying ? 'Stop' : 'Play'}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handlePreview}
              disabled={!audioBuffer || isProcessing}
              loading={isProcessing}
            >
              Preview
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleApply}
              disabled={!audioBuffer || isProcessing}
              loading={isProcessing}
              icon={<Zap size={14} />}
            >
              Resample
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
