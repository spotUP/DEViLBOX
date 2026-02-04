/**
 * ChannelOscilloscope - Hardware-styled per-channel oscilloscope visualizer
 *
 * Renders real-time waveform data from Furnace chip dispatch oscilloscope buffers.
 * Styled after the JC303 panel with dark metallic gradients and theme-aware colors.
 *
 * Layout: Grid of per-channel Canvas oscilloscope windows with channel labels.
 */

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { useThemeStore } from '@stores/useThemeStore';

/** Channel colors by type */
const CHANNEL_COLORS: Record<string, string> = {
  PU1: '#00ffcc',   // Cyan-green (pulse)
  PU2: '#00ccff',   // Cyan-blue (pulse)
  WAV: '#44ff88',   // Green (wave)
  NOI: '#ff44aa',   // Magenta (noise)
  TRI: '#88ff44',   // Lime (triangle)
  DPCM: '#ffaa44',  // Orange (sample)
  SQ1: '#00ffcc',   // Cyan-green (square)
  SQ2: '#00ccff',   // Cyan-blue (square)
  A: '#00ffcc',
  B: '#00ccff',
  C: '#44ff88',
};

const DEFAULT_COLOR = '#00d4aa';

/** Convert hex color to rgba string */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface ChannelOscilloscopeProps {
  /** Channel names (e.g., ['PU1', 'PU2', 'WAV', 'NOI']) */
  channelNames?: string[];
  /** Width of the component */
  width?: number;
  /** Height of the component */
  height?: number;
}

export function ChannelOscilloscope({
  channelNames = [],
  width,
  height = 180,
}: ChannelOscilloscopeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const animFrameRef = useRef<number>(0);
  const lastDrawTime = useRef(0);

  const { channelData: _channelData, numChannels, isActive } = useOscilloscopeStore();
  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  // Theme-dependent colors
  const bgColor = isCyanTheme ? '#030808' : '#0a0a0b';
  const gridColor = isCyanTheme ? 'rgba(0, 255, 255, 0.06)' : 'rgba(100, 100, 120, 0.1)';
  const centerLineColor = isCyanTheme ? 'rgba(0, 255, 255, 0.15)' : 'rgba(100, 100, 120, 0.2)';
  const labelColor = isCyanTheme ? '#00ffff' : '#888';
  const panelBg = isCyanTheme
    ? 'linear-gradient(180deg, #0a1515 0%, #050c0c 100%)'
    : 'linear-gradient(180deg, #252525 0%, #1a1a1a 100%)';

  const effectiveChannels = numChannels || channelNames.length || 4;
  const names = useMemo(
    () => channelNames.length > 0 ? channelNames : Array.from({ length: effectiveChannels }, (_, i) => `CH${i + 1}`),
    [channelNames, effectiveChannels]
  );

  const drawChannel = useCallback((
    canvas: HTMLCanvasElement,
    data: Int16Array | null,
    channelName: string,
  ) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    // Resize canvas for crisp display
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    }

    // Clear
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    const pad = 4;
    const graphW = w - pad * 2;
    const graphH = h - pad * 2;

    // Grid lines
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    const gridLines = 4;
    for (let i = 1; i < gridLines; i++) {
      const y = pad + (graphH / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(pad + graphW, y);
      ctx.stroke();
    }
    for (let i = 1; i < gridLines; i++) {
      const x = pad + (graphW / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(x, pad);
      ctx.lineTo(x, pad + graphH);
      ctx.stroke();
    }

    // Center line
    ctx.strokeStyle = centerLineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, pad + graphH / 2);
    ctx.lineTo(pad + graphW, pad + graphH / 2);
    ctx.stroke();

    // Draw waveform
    if (data && data.length > 0) {
      const color = CHANNEL_COLORS[channelName] || DEFAULT_COLOR;

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      ctx.beginPath();
      const samplesPerPixel = data.length / graphW;

      for (let px = 0; px < graphW; px++) {
        const sampleIndex = Math.floor(px * samplesPerPixel);
        const val = data[sampleIndex] / 32768.0; // Normalize to -1..1
        const y = pad + graphH / 2 - val * (graphH / 2) * 0.9;

        if (px === 0) {
          ctx.moveTo(pad + px, y);
        } else {
          ctx.lineTo(pad + px, y);
        }
      }
      ctx.stroke();

      // Subtle glow effect
      ctx.strokeStyle = hexToRgba(color, 0.2);
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }, [bgColor, gridColor, centerLineColor]);

  // Animation loop
  useEffect(() => {
    const draw = (timestamp: number) => {
      // 30fps throttle
      if (timestamp - lastDrawTime.current < 33) {
        animFrameRef.current = requestAnimationFrame(draw);
        return;
      }
      lastDrawTime.current = timestamp;

      const data = useOscilloscopeStore.getState().channelData;

      for (let i = 0; i < canvasRefs.current.length; i++) {
        const canvas = canvasRefs.current[i];
        if (!canvas) continue;
        const name = names[i] || `CH${i + 1}`;
        drawChannel(canvas, data[i] || null, name);
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [drawChannel, names]);

  // Calculate grid layout
  const cols = effectiveChannels <= 2 ? effectiveChannels : effectiveChannels <= 4 ? 2 : 3;
  const rows = Math.ceil(effectiveChannels / cols);
  const scopeHeight = Math.max(60, (height - 40) / rows - 20);

  return (
    <div
      ref={containerRef}
      className="rounded-md overflow-hidden border border-black/30"
      style={{
        background: panelBg,
        width: width || '100%',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{
          borderBottom: '1px solid rgba(0,0,0,0.4)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.03)',
        }}
      >
        <div className="flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M1 6 L3 6 L4 2 L5 10 L6 4 L7 8 L8 6 L11 6"
              stroke={labelColor}
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          <span
            className="text-[9px] font-bold uppercase tracking-wider"
            style={{ color: labelColor }}
          >
            Channel Oscilloscope
          </span>
        </div>
        {isActive && (
          <span
            className="text-[8px] uppercase tracking-wider opacity-50"
            style={{ color: labelColor }}
          >
            {effectiveChannels}ch
          </span>
        )}
      </div>

      {/* Oscilloscope grid */}
      <div
        className="p-2"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: '6px',
        }}
      >
        {Array.from({ length: effectiveChannels }, (_, i) => (
          <div key={i} className="flex flex-col items-center">
            <div
              className="w-full rounded-sm overflow-hidden"
              style={{
                border: `1px solid ${isCyanTheme ? 'rgba(0,255,255,0.1)' : 'rgba(255,255,255,0.06)'}`,
                boxShadow: `inset 0 0 8px rgba(0,0,0,0.5), 0 0 1px ${isCyanTheme ? 'rgba(0,255,255,0.05)' : 'rgba(255,255,255,0.02)'}`,
              }}
            >
              <canvas
                ref={(el) => { canvasRefs.current[i] = el; }}
                style={{
                  width: '100%',
                  height: scopeHeight,
                  display: 'block',
                }}
              />
            </div>
            <span
              className="text-[8px] font-bold uppercase tracking-wider mt-1"
              style={{
                color: CHANNEL_COLORS[names[i]] || DEFAULT_COLOR,
                opacity: 0.7,
              }}
            >
              {names[i]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
