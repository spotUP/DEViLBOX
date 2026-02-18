/**
 * MpcResamplerModal.tsx — MPC/SP-1200 style sample resampler
 *
 * Offline processing via pure TypeScript DSP:
 *   - Zero-order hold resampling (MPC-style)
 *   - 12-bit quantization (hardware-accurate bit truncation)
 *   - Anti-aliasing filters (RC circuits ~7.5-15 kHz)
 *   - ADC/DAC warmth and saturation
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';
import { X, Play, Square, Zap } from 'lucide-react';
import { mpcResample, DEFAULT_MPC_OPTIONS, MODEL_CONFIGS } from '../../engine/mpc-resampler/MpcResamplerDSP';
import type { MpcResampleOptions, ProcessedResult } from '../../engine/mpc-resampler/MpcResamplerDSP';
import { notify } from '../../stores/useNotificationStore';
import { Button } from '../ui/Button';
import { Toggle } from '../controls/Toggle';

// ============================================================================
// Types
// ============================================================================

interface MpcResamplerModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioBuffer: AudioBuffer | null;
  onBufferProcessed: (result: ProcessedResult) => void;
}

interface StoredPreset {
  name: string;
  targetRate: number;
  bitDepth: number;
  antiAlias: boolean;
  warmth: number;
  dither: boolean;
  autoGain?: boolean;      // Optional for backwards compatibility
  exactRates?: boolean;     // Optional for backwards compatibility
  model: string;
  timestamp: number;
}

// Type guard to validate stored preset structure
function isValidStoredPreset(obj: unknown): obj is StoredPreset {
  if (typeof obj !== 'object' || obj === null) return false;
  const p = obj as Record<string, unknown>;

  return (
    typeof p.name === 'string' &&
    typeof p.targetRate === 'number' &&
    typeof p.bitDepth === 'number' &&
    typeof p.antiAlias === 'boolean' &&
    typeof p.warmth === 'number' &&
    typeof p.dither === 'boolean' &&
    typeof p.model === 'string' &&
    typeof p.timestamp === 'number' &&
    // Optional fields (for backwards compatibility)
    (p.autoGain === undefined || typeof p.autoGain === 'boolean') &&
    (p.exactRates === undefined || typeof p.exactRates === 'boolean')
  );
}

// Load presets from localStorage with validation
function loadPresetsFromStorage(): Array<{ name: string; options: MpcResampleOptions }> {
  try {
    const saved = localStorage.getItem('devilbox-mpc-presets');
    if (!saved) return [];

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) {
      console.warn('Invalid preset data: not an array');
      return [];
    }

    // Filter and validate presets
    const validPresets = parsed.filter((p): p is StoredPreset => {
      if (!isValidStoredPreset(p)) {
        console.warn('Skipping invalid preset:', p);
        return false;
      }
      return true;
    });

    // Convert to component format
    return validPresets.map(p => ({
      name: p.name,
      options: {
        targetRate: p.targetRate,
        bitDepth: p.bitDepth,
        quantize12bit: p.bitDepth === 12,
        antiAlias: p.antiAlias,
        warmth: p.warmth,
        useDither: p.dither,
        autoGain: p.autoGain ?? true,        // Use saved value or default to true
        exactRates: p.exactRates ?? false,   // Use saved value or default to false
        model: (p.model === 'MPC60' || p.model === 'MPC3000' ||
                p.model === 'SP1200' || p.model === 'MPC2000XL')
          ? p.model
          : 'MPC60', // Fallback to MPC60 if invalid
      } as MpcResampleOptions
    }));
  } catch (err) {
    console.error('Failed to load MPC presets:', err);
    return [];
  }
}

// MPC-style rate presets
const RATE_PRESETS = [
  { label: 'MPC60', value: 40000, model: 'MPC60' as const },
  { label: 'MPC3000', value: 44100, model: 'MPC3000' as const },
  { label: 'SP-1200', value: 26040, model: 'SP1200' as const },
  { label: '22050', value: 22050, model: undefined },
  { label: '11025', value: 11025, model: undefined },
  { label: 'LOFI', value: 8000, model: undefined },
] as const;

// Waveform colors (MPC gold theme)
const WAVE_BG = '#0f0c0c';
const WAVE_GRID = '#1d1818';
const WAVE_CENTER = '#2f2525';
const WAVE_ORIGINAL = '#ef4444'; // Red accent (original)
const WAVE_PREVIEW = '#fbbf24';  // Gold/amber accent (MPC processed)

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
  if (!ctx) {
    console.warn('Failed to get 2D context for MPC waveform canvas');
    return;
  }

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

  // Draw resampled waveform on top as ghost overlay (gold)
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
    const info = `${original.length.toLocaleString()} smp · ${durMs}ms · ${original.sampleRate} Hz`;
    ctx.fillStyle = '#504848';
    ctx.fillText(info, 6, h - 6);
  } else {
    ctx.fillStyle = '#686060';
    ctx.fillText('No sample loaded', w / 2 - 40, cy + 4);
  }

  if (resampled && resampled.length > 0) {
    // Resampled label (right side, top) - gold color
    const resLabel = `MPC RESAMPLED · ${targetRate} Hz`;
    const tm = ctx.measureText(resLabel);
    ctx.fillStyle = WAVE_PREVIEW;
    ctx.fillText(resLabel, w - tm.width - 6, 14);

    // Resampled info (right side, bottom)
    const durMs = ((resampled.length / resampled.sampleRate) * 1000).toFixed(0);
    const resInfo = `${resampled.length.toLocaleString()} smp · ${durMs}ms`;
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
    // Resampled dot (gold)
    ctx.fillStyle = WAVE_PREVIEW;
    ctx.fillRect(legendX + 55, legendY, 6, 6);
    ctx.fillStyle = '#686060';
    ctx.fillText('After', legendX + 64, legendY + 6);
  }
}

// ============================================================================
// Component
// ============================================================================

export const MpcResamplerModal: React.FC<MpcResamplerModalProps> = ({
  isOpen,
  onClose,
  audioBuffer,
  onBufferProcessed,
}) => {
  const [options, setOptions] = useState<MpcResampleOptions>({ ...DEFAULT_MPC_OPTIONS });
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewBuffer, setPreviewBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewMode, setPreviewMode] = useState<'original' | 'processed'>('processed');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [savedPresets, setSavedPresets] = useState<Array<{ name: string; options: MpcResampleOptions }>>([]);

  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<Tone.Player | null>(null);

  // Load saved presets when modal opens
  useEffect(() => {
    if (isOpen) {
      setOptions({ ...DEFAULT_MPC_OPTIONS });
      setPreviewBuffer(null);
      setIsPlaying(false);
      setPreviewMode('processed');

      // Load saved presets from localStorage with validation
      const presets = loadPresetsFromStorage();
      setSavedPresets(presets);
    }
    return () => {
      stopPlayback();
    };
  // stopPlayback is declared below but React guarantees it's available when cleanup runs
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
    // A/B mode: play original or processed based on previewMode
    const buf = previewMode === 'original' ? audioBuffer : (previewBuffer || audioBuffer);
    if (buf) playBuffer(buf);
  }, [isPlaying, previewMode, previewBuffer, audioBuffer, stopPlayback, playBuffer]);

  // A/B toggle handler
  const handleABToggle = useCallback(() => {
    const newMode = previewMode === 'original' ? 'processed' : 'original';
    setPreviewMode(newMode);

    // If playing, switch to the new buffer
    if (isPlaying) {
      stopPlayback();
      const buf = newMode === 'original' ? audioBuffer : (previewBuffer || audioBuffer);
      if (buf) playBuffer(buf);
    }
  }, [previewMode, isPlaying, audioBuffer, previewBuffer, stopPlayback, playBuffer]);

  // Keyboard shortcut for A/B (Space bar)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input field
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' ||
                      target.tagName === 'TEXTAREA' ||
                      target.isContentEditable;

      if (e.code === 'Space' && !e.repeat && !isInput && previewBuffer) {
        e.preventDefault();
        handleABToggle();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isOpen, previewBuffer, handleABToggle]);

  // ============================================================================
  // Processing
  // ============================================================================

  const handlePreview = useCallback(async () => {
    if (!audioBuffer || isProcessing) return;
    setIsProcessing(true);
    try {
      const result = await mpcResample(audioBuffer, options);
      setPreviewBuffer(result.buffer);
      notify.success(`MPC resampled to ${result.buffer.sampleRate} Hz`);
      // Auto-play the preview result
      await playBuffer(result.buffer);
    } catch (err) {
      console.error('MPC resample preview failed:', err);
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
      const result = await mpcResample(audioBuffer, options);
      onBufferProcessed({ buffer: result.buffer, dataUrl: result.dataUrl });
      notify.success(`Applied MPC resample @ ${result.buffer.sampleRate} Hz`);
      onClose();
    } catch (err) {
      console.error('MPC resample apply failed:', err);
      notify.error('Resampling failed');
    } finally {
      setIsProcessing(false);
    }
  }, [audioBuffer, isProcessing, options, onBufferProcessed, onClose, stopPlayback]);

  // Options update helper
  const updateOption = useCallback(<K extends keyof MpcResampleOptions>(
    key: K,
    value: MpcResampleOptions[K],
  ) => {
    setOptions(prev => ({ ...prev, [key]: value }));
    setPreviewBuffer(null);
  }, []);

  // Model preset handler (auto-configures all parameters)
  const applyModelPreset = useCallback((model: 'MPC60' | 'MPC3000' | 'SP1200' | 'MPC2000XL') => {
    const config = MODEL_CONFIGS[model];
    if (config) {
      setOptions(prev => ({ ...prev, ...config }));
      setPreviewBuffer(null);
    }
  }, []);

  // Save preset handler
  const handleSavePreset = useCallback(() => {
    if (!presetName.trim()) {
      notify.error('Please enter a preset name');
      return;
    }

    const preset: StoredPreset = {
      name: presetName.trim(),
      targetRate: options.targetRate,
      bitDepth: options.bitDepth,
      antiAlias: options.antiAlias,
      warmth: options.warmth,
      dither: options.useDither,
      autoGain: options.autoGain,
      exactRates: options.exactRates,
      model: options.model,
      timestamp: Date.now(),
    };

    try {
      const saved = localStorage.getItem('devilbox-mpc-presets');
      const existing: unknown = saved ? JSON.parse(saved) : [];
      const existingArray = Array.isArray(existing) ? existing : [];

      // Remove existing preset with same name, then add new one
      const filtered = existingArray.filter((p: unknown) =>
        isValidStoredPreset(p) && p.name !== presetName.trim()
      );
      filtered.push(preset);

      localStorage.setItem('devilbox-mpc-presets', JSON.stringify(filtered));

      // Reload presets from storage with validation
      setSavedPresets(loadPresetsFromStorage());

      notify.success(`Preset "${presetName.trim()}" saved`);
      setPresetName('');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        notify.error('Storage quota exceeded - delete some presets');
      } else {
        notify.error('Failed to save preset');
      }
      console.error('Save preset error:', err);
    }
  }, [presetName, options]);

  // Load preset handler
  const handleLoadPreset = useCallback((preset: { name: string; options: MpcResampleOptions }) => {
    setOptions(preset.options);
    setPreviewBuffer(null);
    notify.success(`Loaded preset "${preset.name}"`);
  }, []);

  // Delete preset handler
  const handleDeletePreset = useCallback((name: string) => {
    try {
      const saved = localStorage.getItem('devilbox-mpc-presets');
      const existing: unknown = saved ? JSON.parse(saved) : [];
      const existingArray = Array.isArray(existing) ? existing : [];

      // Filter out the preset to delete
      const filtered = existingArray.filter((p: unknown) =>
        isValidStoredPreset(p) && p.name !== name
      );

      localStorage.setItem('devilbox-mpc-presets', JSON.stringify(filtered));

      // Reload presets from storage with validation
      setSavedPresets(loadPresetsFromStorage());

      notify.success(`Deleted preset "${name}"`);
    } catch (err) {
      notify.error('Failed to delete preset');
      console.error('Delete preset error:', err);
    }
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
            <Zap size={16} className="text-amber-400" />
            <h2 className="text-sm font-bold text-text-primary tracking-wide font-mono">
              MPC RESAMPLER
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
            />
          </div>
        </div>

        {/* Preset & A/B Controls */}
        <div className="px-5 pb-3 space-y-2">
          {/* Preset Selector */}
          {savedPresets.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-text-muted font-bold uppercase">Presets:</span>
              <div className="flex gap-1 flex-wrap flex-1">
                {savedPresets.map(preset => (
                  <div key={preset.name} className="flex items-center gap-0.5">
                    <button
                      onClick={() => handleLoadPreset(preset)}
                      className="px-2 py-0.5 text-[9px] font-mono rounded-l transition-colors bg-dark-bgTertiary text-text-secondary hover:bg-amber-500/20 hover:text-amber-400 border border-dark-border border-r-0"
                    >
                      {preset.name}
                    </button>
                    <button
                      onClick={() => handleDeletePreset(preset.name)}
                      className="px-1.5 py-0.5 text-[9px] font-mono rounded-r transition-colors bg-dark-bgTertiary text-text-muted hover:bg-red-500/20 hover:text-red-400 border border-dark-border"
                      title="Delete preset"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Save Preset */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-text-muted font-bold uppercase">Save:</span>
            <input
              type="text"
              value={presetName}
              onChange={e => setPresetName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSavePreset()}
              placeholder="Preset name..."
              className="input flex-1 text-xs px-2 py-1 font-mono"
            />
            <Button variant="default" size="sm" onClick={handleSavePreset} disabled={!presetName.trim()}>
              Save
            </Button>

            {/* A/B Compare Button */}
            {previewBuffer && (
              <>
                <Button
                  variant={previewMode === 'original' ? 'primary' : 'default'}
                  size="sm"
                  onClick={handleABToggle}
                  className="ml-2"
                  title="Toggle between original and processed (Space bar)"
                >
                  A/B: {previewMode === 'original' ? 'ORIGINAL' : 'PROCESSED'}
                </Button>
                <span className="text-[8px] font-mono text-text-muted">
                  (Space)
                </span>
              </>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-2 gap-4 px-5 pb-4">
          {/* Left: Rate + Warmth */}
          <div className="space-y-3">
            <div>
              <label className="block font-mono text-text-muted text-[10px] font-bold uppercase tracking-wide mb-1.5">
                Resample Rate
              </label>
              <div className="flex gap-1 flex-wrap">
                {RATE_PRESETS.map(preset => (
                  <button
                    key={preset.value}
                    onClick={() => {
                      updateOption('targetRate', preset.value);
                      if (preset.model) {
                        applyModelPreset(preset.model);
                      }
                    }}
                    className={`px-2 py-1 text-[10px] font-mono font-bold rounded transition-colors cursor-pointer
                      ${options.targetRate === preset.value
                        ? 'bg-amber-500 text-text-inverse'
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
                  onChange={e => {
                    const parsed = parseInt(e.target.value, 10);
                    // Only update if valid number, otherwise keep current value
                    if (!isNaN(parsed)) {
                      const clamped = Math.max(1000, Math.min(48000, parsed));
                      updateOption('targetRate', clamped);
                    }
                  }}
                  onBlur={e => {
                    // On blur, ensure we have a valid value (fallback to 40000 if invalid)
                    const parsed = parseInt(e.target.value, 10);
                    if (isNaN(parsed)) {
                      updateOption('targetRate', 40000);
                    }
                  }}
                  className="input w-20 text-right font-mono text-xs px-2 py-1"
                  min={1000}
                  max={48000}
                />
                <span className="text-[10px] font-mono text-text-muted">Hz</span>
              </div>
            </div>

            <div>
              <label className="block font-mono text-text-muted text-[10px] font-bold uppercase tracking-wide mb-1.5">
                Warmth
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={options.warmth * 100}
                  onChange={e => updateOption('warmth', parseInt(e.target.value) / 100)}
                  className="flex-1 accent-amber-500"
                />
                <span className="font-mono text-xs text-amber-400 font-bold w-8 text-right">
                  {Math.round(options.warmth * 100)}%
                </span>
              </div>
              <span className="text-[9px] font-mono text-text-muted">
                ADC/DAC saturation and warmth
              </span>
            </div>

            <div>
              <label className="block font-mono text-text-muted text-[10px] font-bold uppercase tracking-wide mb-1.5">
                Bit Depth
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={8}
                  max={16}
                  step={2}
                  value={options.bitDepth}
                  onChange={e => updateOption('bitDepth', parseInt(e.target.value))}
                  className="flex-1 accent-amber-500"
                />
                <span className="font-mono text-xs text-amber-400 font-bold w-10 text-right">
                  {options.bitDepth}-bit
                </span>
              </div>
              <span className="text-[9px] font-mono text-text-muted">
                8-bit = extreme lofi, 12-bit = classic MPC
              </span>
            </div>
          </div>

          {/* Right: Model + Toggles */}
          <div className="space-y-3">
            <div>
              <label className="block font-mono text-text-muted text-[10px] font-bold uppercase tracking-wide mb-1.5">
                MPC Model
              </label>
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => applyModelPreset('MPC60')}
                  className={`px-2 py-1.5 text-[10px] font-mono font-bold rounded transition-colors cursor-pointer
                    ${options.model === 'MPC60'
                      ? 'bg-amber-500 text-text-inverse'
                      : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover border border-dark-border'
                    }`}
                >
                  MPC60
                </button>
                <button
                  onClick={() => applyModelPreset('MPC3000')}
                  className={`px-2 py-1.5 text-[10px] font-mono font-bold rounded transition-colors cursor-pointer
                    ${options.model === 'MPC3000'
                      ? 'bg-amber-500 text-text-inverse'
                      : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover border border-dark-border'
                    }`}
                >
                  MPC3000
                </button>
                <button
                  onClick={() => applyModelPreset('SP1200')}
                  className={`px-2 py-1.5 text-[10px] font-mono font-bold rounded transition-colors cursor-pointer
                    ${options.model === 'SP1200'
                      ? 'bg-amber-500 text-text-inverse'
                      : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover border border-dark-border'
                    }`}
                >
                  SP-1200
                </button>
                <button
                  onClick={() => applyModelPreset('MPC2000XL')}
                  className={`px-2 py-1.5 text-[10px] font-mono font-bold rounded transition-colors cursor-pointer
                    ${options.model === 'MPC2000XL'
                      ? 'bg-amber-500 text-text-inverse'
                      : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover border border-dark-border'
                    }`}
                >
                  MPC2000XL
                </button>
              </div>
            </div>

            <Toggle
              label="ANTI-ALIAS"
              value={options.antiAlias}
              onChange={v => updateOption('antiAlias', v)}
              color="#fbbf24"
              size="sm"
            />

            <Toggle
              label="DITHER"
              value={options.useDither}
              onChange={v => updateOption('useDither', v)}
              color="#fbbf24"
              size="sm"
            />

            <Toggle
              label="AUTO GAIN"
              value={options.autoGain}
              onChange={v => updateOption('autoGain', v)}
              color="#fbbf24"
              size="sm"
            />

            {/* Advanced Section */}
            <div className="space-y-2">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full text-left text-[9px] font-mono font-bold uppercase text-text-muted hover:text-text-secondary transition-colors flex items-center gap-1"
              >
                <span className="transform transition-transform" style={{ transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                Advanced
              </button>

              {showAdvanced && (
                <div className="space-y-2 pl-3">
                  <Toggle
                    label="EXACT RATES"
                    value={options.exactRates}
                    onChange={v => updateOption('exactRates', v)}
                    color="#fbbf24"
                    size="sm"
                  />
                  <div className="text-[8px] font-mono text-text-muted leading-relaxed">
                    {options.exactRates ? (
                      <>
                        {options.model === 'MPC60' && 'Using 39,062.5 Hz (40MHz ÷ 1024)'}
                        {options.model === 'SP1200' && 'Using 26,042 Hz'}
                        {(options.model === 'MPC3000' || options.model === 'MPC2000XL') && 'Using 44,100 Hz (exact)'}
                      </>
                    ) : (
                      'Using rounded rates (40kHz, 26kHz, etc.)'
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="text-[9px] font-mono text-text-muted leading-relaxed p-2 bg-dark-bg rounded border border-dark-border">
              MPC60: 40kHz, 12-bit, gritty<br />
              MPC3000: 44.1kHz, 16-bit, warm<br />
              SP-1200: 26kHz, 12-bit, extreme lofi
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
