import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Sparkles, Zap, Wand2, RefreshCw, Eraser, MoveHorizontal, Hammer, Volume2, Scissors, RotateCcw } from 'lucide-react';
import { 
  applySpectralExciter, 
  applyDenoise, 
  applyPseudoStereo, 
  applyTransientSharpening,
  applyNormalization,
  applyTrimSilence,
  applyReverse,
} from '../../utils/audio/SampleProcessing';
import type { ProcessedResult } from '../../utils/audio/SampleProcessing';
import { runNeuralEnhancement } from '../../utils/audio/NeuralEnhancerWorker';
import { Knob } from '../controls/Knob';
import { Button } from '../ui/Button';
import { notify } from '../../stores/useNotificationStore';

// Waveform overlay colors
const WAVE_BG = '#0f0c0c';
const WAVE_GRID = '#1d1818';
const WAVE_CENTER = '#2f2525';
const WAVE_BEFORE = '#a855f7';  // Purple (matches neural/enhancer theme)
const WAVE_AFTER = '#10b981';   // Green (enhanced result)

function drawWaveLayer(
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
    ctx.moveTo(x, cy - max * cy);
    ctx.lineTo(x, cy - min * cy);
  }
  ctx.stroke();
  ctx.restore();
}

function drawEnhancerOverlay(
  canvas: HTMLCanvasElement,
  before: AudioBuffer | null,
  after: AudioBuffer | null,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = WAVE_BG;
  ctx.fillRect(0, 0, w, h);

  // Grid
  ctx.strokeStyle = WAVE_GRID;
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const x = (w / 4) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  const cy = h / 2;
  ctx.strokeStyle = WAVE_CENTER;
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(w, cy);
  ctx.stroke();

  // Before waveform (dimmed when after exists)
  if (before && before.length > 0) {
    drawWaveLayer(ctx, before.getChannelData(0), w, h, WAVE_BEFORE, after ? 0.3 : 0.8);
  }

  // After waveform overlay
  if (after && after.length > 0) {
    drawWaveLayer(ctx, after.getChannelData(0), w, h, WAVE_AFTER, 0.9);
  }

  // Labels
  ctx.font = '10px "JetBrains Mono", monospace';

  if (before && before.length > 0) {
    ctx.fillStyle = after ? WAVE_BEFORE + '88' : WAVE_BEFORE;
    ctx.fillText('BEFORE', 6, 14);
    const durMs = ((before.length / before.sampleRate) * 1000).toFixed(0);
    ctx.fillStyle = '#504848';
    ctx.fillText(`${before.length.toLocaleString()} smp \u00b7 ${durMs}ms`, 6, h - 6);
  }

  if (after && after.length > 0) {
    const label = 'ENHANCED';
    const tm = ctx.measureText(label);
    ctx.fillStyle = WAVE_AFTER;
    ctx.fillText(label, w - tm.width - 6, 14);
    const durMs = ((after.length / after.sampleRate) * 1000).toFixed(0);
    const info = `${after.length.toLocaleString()} smp \u00b7 ${durMs}ms`;
    const tm2 = ctx.measureText(info);
    ctx.fillStyle = WAVE_AFTER + '88';
    ctx.fillText(info, w - tm2.width - 6, h - 6);
  } else if (!before) {
    ctx.fillStyle = '#686060';
    ctx.fillText('No sample loaded', w / 2 - 40, cy + 4);
  } else {
    const hint = 'Process to compare';
    const tm = ctx.measureText(hint);
    ctx.fillStyle = '#383030';
    ctx.fillText(hint, w - tm.width - 6, 14);
  }

  // Legend (bottom center, only when both exist)
  if (before && after) {
    const legendY = h - 7;
    const legendX = w / 2 - 50;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = WAVE_BEFORE;
    ctx.fillRect(legendX, legendY, 6, 6);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#686060';
    ctx.fillText('Before', legendX + 9, legendY + 6);
    ctx.fillStyle = WAVE_AFTER;
    ctx.fillRect(legendX + 55, legendY, 6, 6);
    ctx.fillStyle = '#686060';
    ctx.fillText('After', legendX + 64, legendY + 6);
  }
}

interface SampleEnhancerPanelProps {
  audioBuffer: AudioBuffer | null;
  onBufferProcessed: (result: ProcessedResult) => void;
  isLoading: boolean;
}

export const SampleEnhancerPanel: React.FC<SampleEnhancerPanelProps> = ({
  audioBuffer,
  onBufferProcessed,
  isLoading: parentLoading
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [beforeBuffer, setBeforeBuffer] = useState<AudioBuffer | null>(null);
  const [afterBuffer, setAfterBuffer] = useState<AudioBuffer | null>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Redraw helper
  const redrawOverlay = useCallback(() => {
    if (overlayRef.current) {
      drawEnhancerOverlay(overlayRef.current, beforeBuffer || audioBuffer, afterBuffer);
    }
  }, [audioBuffer, beforeBuffer, afterBuffer]);

  // Draw overlay when buffers change
  useEffect(() => {
    redrawOverlay();
  }, [redrawOverlay]);

  // Redraw on resize so the canvas doesn't look broken
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => redrawOverlay());
    ro.observe(el);
    return () => ro.disconnect();
  }, [redrawOverlay]);

  const [drive, setDrive] = useState(40);
  const [mix, setMix] = useState(30);
  const [freq, setFreq] = useState(4000);
  const [denoiseThresh, setDenoiseThresh] = useState(-60);
  const [stereoWidth, setStereoWidth] = useState(20);
  const [punchAmount, setPunchAmount] = useState(30);

  const handleProcess = useCallback(async (
    type: 'exciter' | 'denoise' | 'stereo' | 'punch' | 'neural' | 'normalize' | 'trim' | 'reverse'
  ) => {
    if (!audioBuffer) return;
    
    setIsProcessing(true);
    // Snapshot the current buffer as "before" for overlay comparison
    setBeforeBuffer(audioBuffer);
    setAfterBuffer(null);
    try {
      await new Promise(r => setTimeout(r, 50));
      let result: ProcessedResult;

      switch (type) {
        case 'exciter':
          result = await applySpectralExciter(audioBuffer, { drive, mix, frequency: freq });
          break;
        case 'denoise':
          result = await applyDenoise(audioBuffer, denoiseThresh);
          break;
        case 'stereo':
          result = await applyPseudoStereo(audioBuffer, stereoWidth);
          break;
        case 'punch':
          result = await applyTransientSharpening(audioBuffer, punchAmount);
          break;
        case 'neural':
          result = await runNeuralEnhancement(audioBuffer, { modelType: 'resurrect', strength: 1.0 });
          break;
        case 'normalize':
          result = await applyNormalization(audioBuffer);
          break;
        case 'trim':
          result = await applyTrimSilence(audioBuffer);
          break;
        case 'reverse':
          result = await applyReverse(audioBuffer);
          break;
        default:
          return;
      }
      
      // Store the result buffer for overlay display before replacing
      setAfterBuffer(result.buffer);
      onBufferProcessed(result);
      notify.success(`Sample processed: ${type.toUpperCase()}`);
    } catch (err) {
      console.error('Processing failed:', err);
      notify.error('Processing failed');
    } finally {
      setIsProcessing(false);
    }
  }, [audioBuffer, drive, mix, freq, denoiseThresh, stereoWidth, punchAmount, onBufferProcessed]);

  return (
    <div className="bg-dark-bgSecondary border border-dark-border rounded-lg overflow-hidden mb-4">
      {/* Header */}
      <div className="bg-accent-primary/10 border-b border-dark-border px-4 py-2 flex items-center justify-between">
        <h4 className="font-mono text-xs font-bold text-accent-primary flex items-center gap-2">
          <Sparkles size={12} />
          ENHANCEMENT ENGINE
        </h4>
        {isProcessing && (
          <div className="flex items-center gap-2 text-[10px] text-accent-primary animate-pulse">
            <RefreshCw size={10} className="animate-spin" />
            PROCESSING...
          </div>
        )}
      </div>

      {/* Before/After Waveform Overlay */}
      <div className="px-4 pt-3" ref={containerRef}>
        <div className="rounded-lg overflow-hidden border border-dark-border">
          <canvas
            ref={overlayRef}
            className="w-full h-[100px]"
          />
        </div>
      </div>

      {/* Tier 1: Neural Super-Res — shown first so it's always visible */}
      <div className="px-4 pt-3">
        <div className="flex items-center gap-4 p-3 bg-violet-500/5 border border-violet-500/20 rounded-lg">
          <div className="flex items-center gap-2 shrink-0">
            <Sparkles size={16} className="text-violet-400" />
            <span className="text-[10px] font-bold text-violet-300 uppercase tracking-wider">Neural 8-bit Upscaler</span>
          </div>
          <p className="text-[10px] text-text-muted leading-snug flex-1 hidden sm:block">
            Deep Learning — hallucinate missing high frequencies &amp; remove 8-bit noise.
          </p>
          <div className="shrink-0">
            <Button variant="ft2" size="sm" onClick={() => handleProcess('neural')} disabled={isProcessing || parentLoading} icon={<Sparkles size={12} />}>
              AI Resurrect
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Tier 2: Restoration Tools */}
        <div className="space-y-6">
          {/* Exciter */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-yellow-400" />
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Harmonic Exciter</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Knob label="DRIVE" value={drive} min={0} max={100} onChange={setDrive} size="sm" color="var(--color-accent)" />
              <Knob label="FREQ" value={freq} min={2000} max={10000} unit="Hz" onChange={setFreq} size="sm" color="var(--color-accent-secondary)" />
              <Knob label="MIX" value={mix} min={0} max={100} unit="%" onChange={setMix} size="sm" color="#10b981" />
            </div>
            <Button variant="primary" size="sm" fullWidth onClick={() => handleProcess('exciter')} disabled={isProcessing || parentLoading} icon={<Wand2 size={12} />}>
              Apply Exciter
            </Button>
          </div>

          {/* Denoise */}
          <div className="space-y-3 pt-4 border-t border-dark-border/50">
            <div className="flex items-center gap-2">
              <Eraser size={14} className="text-cyan-400" />
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Quantization Denoise</span>
            </div>
            <Knob label="THRESH" value={denoiseThresh} min={-100} max={-20} unit="dB" onChange={setDenoiseThresh} size="sm" color="var(--color-synth-modulation)" />
            <Button variant="default" size="sm" fullWidth onClick={() => handleProcess('denoise')} disabled={isProcessing || parentLoading} icon={<Eraser size={12} />}>
              Clean 8-bit Noise
            </Button>
          </div>
        </div>

        {/* Tier 3: Modernizer Tools */}
        <div className="space-y-6">
          {/* Transient Punch */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Hammer size={14} className="text-orange-400" />
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Transient Punch</span>
            </div>
            <Knob label="PUNCH" value={punchAmount} min={0} max={100} onChange={setPunchAmount} size="sm" color="var(--color-accent)" />
            <Button variant="default" size="sm" fullWidth onClick={() => handleProcess('punch')} disabled={isProcessing || parentLoading} icon={<Hammer size={12} />}>
              Sharpen Attacks
            </Button>
          </div>

          {/* Pseudo Stereo */}
          <div className="space-y-3 pt-4 border-t border-dark-border/50">
            <div className="flex items-center gap-2">
              <MoveHorizontal size={14} className="text-blue-400" />
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Pseudo Stereo</span>
            </div>
            <Knob label="WIDTH" value={stereoWidth} min={0} max={100} onChange={setStereoWidth} size="sm" color="var(--color-synth-pan)" />
            <Button variant="default" size="sm" fullWidth onClick={() => handleProcess('stereo')} disabled={isProcessing || parentLoading} icon={<MoveHorizontal size={12} />}>
              Make Stereo
            </Button>
          </div>
        </div>

        {/* Tier 4: Standard Edits */}
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Volume2 size={14} className="text-green-400" />
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Basic Editing</span>
            </div>
            
            <div className="grid grid-cols-1 gap-2">
              <Button variant="default" size="sm" fullWidth onClick={() => handleProcess('normalize')} disabled={isProcessing || parentLoading} icon={<Volume2 size={12} />}>
                Normalize (0dB Peak)
              </Button>
              <Button variant="default" size="sm" fullWidth onClick={() => handleProcess('trim')} disabled={isProcessing || parentLoading} icon={<Scissors size={12} />}>
                Trim Silence
              </Button>
              <Button variant="default" size="sm" fullWidth onClick={() => handleProcess('reverse')} disabled={isProcessing || parentLoading} icon={<RotateCcw size={12} />}>
                Destructive Reverse
              </Button>
            </div>
          </div>
          
          <div className="p-3 bg-dark-bg border border-dark-border rounded text-[9px] text-text-muted font-mono leading-tight">
            NOTE: These edits permanently modify the sample buffer. Use Normalize after Exciter to avoid clipping.
          </div>
        </div>

        {/* Pro tip */}
        <div className="md:col-span-3 pt-3 border-t border-dark-border">
          <div className="p-2 bg-dark-bg border border-dark-border rounded text-[9px] text-text-muted font-mono leading-tight">
            PRO TIP: Chain these tools! Denoise first, then AI Resurrect, then add Stereo Width.
          </div>
        </div>
      </div>
    </div>
  );
};
