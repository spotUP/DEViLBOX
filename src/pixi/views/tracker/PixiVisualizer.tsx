/**
 * PixiVisualizer — Multi-mode GPU visualizer for WebGL mode.
 * GPU modes rendered via PixiGraphics; DOM modes (canvas-based + AudioMotion)
 * rendered via PixiDOMOverlay positioned over the visualizer bounds.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme, type PixiTheme } from '../../theme';
import { useTransportStore } from '@stores';
import { useUIStore } from '@stores/useUIStore';
import { getToneEngine } from '@engine/ToneEngine';
import { getJingleEngine } from '@engine/jingle/JingleEngine';
import { PixiDOMOverlay } from '../../components/PixiDOMOverlay';
import { CircularVU } from '@components/visualization/CircularVU';
import { ChannelWaveforms } from '@components/visualization/ChannelWaveforms';
import { ChannelActivityGrid } from '@components/visualization/ChannelActivityGrid';
import { ChannelSpectrums } from '@components/visualization/ChannelSpectrums';
import { ChannelCircularVU } from '@components/visualization/ChannelCircularVU';
import { ChannelParticles } from '@components/visualization/ChannelParticles';
import { ChannelRings } from '@components/visualization/ChannelRings';
import { ChannelTunnel } from '@components/visualization/ChannelTunnel';
import { ChannelRadar } from '@components/visualization/ChannelRadar';
import { NibblesGame } from '@components/visualization/NibblesGame';
import { SineScroller } from '@components/visualization/SineScroller';
import { AudioMotionVisualizer } from '@components/visualization/AudioMotionVisualizer';

type VizMode =
  // GPU-native modes
  'jingle' | 'waveform' | 'spectrum' | 'vectorscope' | 'channels' | 'stereo' | 'freqbars' | 'levels' | 'mirror' | 'radial' | 'energy' | 'logo' | 'banner' |
  // DOM-canvas modes (rendered via PixiDOMOverlay)
  'circular' | 'chanWaves' | 'chanActivity' | 'chanSpectrum' | 'chanCircular' | 'chanParticles' | 'chanRings' | 'chanTunnel' | 'chanRadar' | 'chanNibbles' | 'sineScroll' |
  // AudioMotion modes (rendered via PixiDOMOverlay + AudioMotionVisualizer)
  'amLED' | 'amBars' | 'amMirror' | 'amRadial' | 'amGraph' | 'amRadialGraph' | 'amDualStereo' | 'amLumi' | 'amAlpha' | 'amOutline' | 'amDualV' | 'amDualOverlay' | 'amBark' | 'amMel' | 'amNotes' | 'amMirrorReflex' | 'amRadialInvert' | 'amRadialLED' | 'amLinear' | 'amAWeight' | 'amLumiMirror';

const VIZ_MODES: VizMode[] = [
  'waveform', 'spectrum', 'vectorscope', 'channels', 'stereo', 'freqbars', 'levels',
  // Note: 'jingle' is not in the cycle — it is set programmatically when jingle plays
  'mirror', 'energy', 'logo', 'banner',
  'circular', 'sineScroll', 'chanWaves', 'chanActivity', 'chanSpectrum', 'chanCircular',
  'chanParticles', 'chanRings', 'chanTunnel', 'chanRadar',
  'amLED', 'amBars', 'amMirror', 'amRadial', 'amGraph', 'amRadialGraph', 'amDualStereo',
  'amLumi', 'amAlpha', 'amOutline', 'amDualV', 'amDualOverlay', 'amBark', 'amMel',
  'amNotes', 'amMirrorReflex', 'amRadialInvert', 'amRadialLED',
  'amLinear', 'amAWeight', 'amLumiMirror',
  'chanNibbles', // last slot — easter egg
];

const VIZ_MODE_LABELS: Record<VizMode, string> = {
  jingle: 'JINGLE',
  waveform: 'WAVE',      spectrum: 'SPECTRUM',  vectorscope: 'SCOPE',
  channels: 'CH-OSC',   stereo: 'STEREO',      freqbars: 'BARS',
  levels: 'LEVELS',     mirror: 'MIRROR',
  radial: 'RADIAL',     energy: 'ENERGY',       logo: 'LOGO',
  banner: 'BANNER',     circular: 'CIRCULAR',   sineScroll: 'SINE',
  chanWaves: 'CH-WAVE', chanActivity: 'CH-ACT', chanSpectrum: 'CH-SPEC',
  chanCircular: 'CH-CIR', chanParticles: 'CH-PRT', chanRings: 'CH-RING',
  chanTunnel: 'CH-TUN', chanRadar: 'CH-RADAR',  chanNibbles: 'NIBBLES',
  amLED: 'AM-LED',      amBars: 'AM-BARS',      amMirror: 'AM-MIRROR',
  amRadial: 'AM-RADIAL', amGraph: 'AM-GRAPH',   amRadialGraph: 'AM-RGRAPH',
  amDualStereo: 'AM-DUAL', amLumi: 'AM-LUMI',   amAlpha: 'AM-ALPHA',
  amOutline: 'AM-OUT',  amDualV: 'AM-DUALV',    amDualOverlay: 'AM-OVL',
  amBark: 'AM-BARK',    amMel: 'AM-MEL',
  amNotes: 'AM-NOTES',  amMirrorReflex: 'AM-MRF', amRadialInvert: 'AM-RINV',
  amRadialLED: 'AM-RLED', amLinear: 'AM-LIN',   amAWeight: 'AM-AWT',
  amLumiMirror: 'AM-LMR',
};

/** Modes that use DOM canvas components rendered via PixiDOMOverlay */
const DOM_MODES = new Set<VizMode>([
  'circular', 'chanWaves', 'chanActivity', 'chanSpectrum', 'chanCircular',
  'chanParticles', 'chanRings', 'chanTunnel', 'chanRadar', 'chanNibbles', 'sineScroll',
  'amLED', 'amBars', 'amMirror', 'amRadial', 'amGraph', 'amRadialGraph', 'amDualStereo',
  'amLumi', 'amAlpha', 'amOutline', 'amDualV', 'amDualOverlay', 'amBark', 'amMel',
  'amNotes', 'amMirrorReflex', 'amRadialInvert', 'amRadialLED',
  'amLinear', 'amAWeight', 'amLumiMirror',
]);

/** Map VizMode → AudioMotion preset name */
const AUDIOMOTION_PRESET_MAP: Partial<Record<VizMode, string>> = {
  amLED: 'ledBars',        amBars: 'smoothBars',     amMirror: 'mirrorBars',
  amRadial: 'radialSpectrum', amGraph: 'graphLine',  amRadialGraph: 'radialGraph',
  amDualStereo: 'dualStereo', amLumi: 'lumiBars',    amAlpha: 'alphaBars',
  amOutline: 'outlineBars', amDualV: 'dualVertical', amDualOverlay: 'dualOverlay',
  amBark: 'barkSpectrum',  amMel: 'melGraph',
  amNotes: 'noteLabels',   amMirrorReflex: 'mirrorReflex', amRadialInvert: 'radialInvert',
  amRadialLED: 'radialLED', amLinear: 'linearBars',  amAWeight: 'aWeighted',
  amLumiMirror: 'lumiMirror',
};

// ─── DOM Visualizer Content (rendered in PixiDOMOverlay's secondary React root) ─

interface DOMVizContentProps { mode: VizMode; height: number; onExit: () => void; }

const DOMVizContent: React.FC<DOMVizContentProps> = ({ mode, height, onExit }) => {
  const amPreset = AUDIOMOTION_PRESET_MAP[mode];
  if (amPreset) return <AudioMotionVisualizer preset={amPreset} audioSource="master" height={height} />;
  switch (mode) {
    case 'circular':     return <CircularVU height={height} />;
    case 'chanWaves':    return <ChannelWaveforms height={height} />;
    case 'chanActivity': return <ChannelActivityGrid height={height} />;
    case 'chanSpectrum': return <ChannelSpectrums height={height} />;
    case 'chanCircular': return <ChannelCircularVU height={height} />;
    case 'chanParticles':return <ChannelParticles height={height} />;
    case 'chanRings':    return <ChannelRings height={height} />;
    case 'chanTunnel':   return <ChannelTunnel height={height} />;
    case 'chanRadar':    return <ChannelRadar height={height} />;
    case 'chanNibbles':  return <NibblesGame height={height} onExit={onExit} />;
    case 'sineScroll':   return <SineScroller height={height} />;
    default:             return null;
  }
};

interface PixiVisualizerProps {
  width?: number;
  height?: number;
}

const PEAK_DECAY = 0.02;

// Stable module-level layout objects — inline literals create new references every render,
// which causes Yoga WASM "Expected null or instance of Node" BindingErrors.
const LAYOUT_MODE_LABEL_COLLAPSED: Record<string, unknown> = { width: 0, height: 0 };
const LAYOUT_MODE_INDICATOR: Record<string, unknown> = { position: 'absolute', right: 4, bottom: 2 };
const LAYOUT_MODE_INDICATOR_COLLAPSED: Record<string, unknown> = { position: 'absolute', width: 0, height: 0 };
// Logo/banner overlay text — visible only in logo/banner modes
const LAYOUT_OVERLAY_LABEL: Record<string, unknown> = { position: 'absolute' };
const LAYOUT_OVERLAY_COLLAPSED: Record<string, unknown> = { position: 'absolute', width: 0, height: 0 };

/** Jingle animation state (mutable, not React state — drives rAF loop directly) */
interface JingleAnimState {
  startTime: number;
  lastBeatTime: number;
  beatFlash: number; // 0-1, decays each frame
  beatCount: number; // total beats detected
  typedChars: number; // chars typed so far across "DEVILBOX" + "READY"
  glitchFrames: number; // #3 — frames remaining for glitch effect
}

export const PixiVisualizer: React.FC<PixiVisualizerProps> = ({
  width = 160,
  height = 64,
}) => {
  const theme = usePixiTheme();
  const [mode, setMode] = useState<VizMode>('waveform');
  const graphicsRef = useRef<GraphicsType | null>(null);
  const peakHoldsRef = useRef(new Float32Array(64));
  const jingleAnimRef = useRef<JingleAnimState>({ startTime: 0, lastBeatTime: 0, beatFlash: 0, beatCount: 0, typedChars: 0, glitchFrames: 0 });
  const isPlaying = useTransportStore(s => s.isPlaying);
  const jingleActive = useUIStore(s => s.jingleActive);
  const postJingleActive = useUIStore(s => s.postJingleActive);

  // Reset jingle animation state when jingle starts
  useEffect(() => {
    if (jingleActive) {
      jingleAnimRef.current = { startTime: performance.now(), lastBeatTime: 0, beatFlash: 0, beatCount: 0, typedChars: 0, glitchFrames: 0 };
    }
  }, [jingleActive]);

  // Switch to logo mode when jingle ends, then clear the flag
  useEffect(() => {
    if (postJingleActive) {
      setMode('logo');
      useUIStore.getState().setPostJingleActive(false);
    }
  }, [postJingleActive]);

  const handleClick = useCallback(() => {
    setMode(prev => {
      const idx = VIZ_MODES.indexOf(prev);
      return VIZ_MODES[(idx + 1) % VIZ_MODES.length];
    });
  }, []);

  // Animation loop
  useEffect(() => {
    const shouldAnimate = isPlaying || jingleActive;
    if (!shouldAnimate || !graphicsRef.current) return;

    // Connect analyser nodes so getWaveform()/getFFT() return real data
    if (isPlaying) {
      try {
        getToneEngine().enableAnalysers();
      } catch {
        // Engine not ready yet — will try again on next effect
      }
    }

    let rafId: number;
    const peaks = peakHoldsRef.current;
    const draw = () => {
      const g = graphicsRef.current;
      if (!g) return;

      g.clear();
      drawBackground(g, width, height, theme);

      // Jingle active — draw jingle animation regardless of current viz mode
      if (jingleActive) {
        drawJingleMode(g, getJingleEngine().getAnalyser(), width, height, theme, jingleAnimRef.current);
        rafId = requestAnimationFrame(draw);
        return;
      }

      // DOM modes have no GPU drawing — PixiDOMOverlay handles them
      if (DOM_MODES.has(mode)) return;

      try {
        const engine = getToneEngine();
        switch (mode) {
          case 'waveform':
            drawWaveform(g, engine.getWaveform(), width, height, theme);
            break;
          case 'spectrum':
            drawSpectrum(g, engine.getFFT(), width, height, theme, peaks);
            break;
          case 'vectorscope':
            drawVectorscope(g, engine.getWaveform(), width, height, theme);
            break;
          case 'channels':
            drawChannelOscilloscopes(g, engine.getWaveform(), width, height, theme);
            break;
          case 'stereo':
            drawStereoField(g, engine.getWaveform(), width, height, theme);
            break;
          case 'freqbars':
            drawFrequencyBars(g, engine.getFFT(), width, height, theme, peaks);
            break;
          case 'levels':
            drawChannelLevels(g, engine.getWaveform(), width, height, theme);
            break;
          case 'mirror':
            drawMirrorWave(g, engine.getWaveform(), width, height, theme);
            break;
          case 'radial':
            drawRadialSpectrum(g, engine.getFFT(), width, height, theme);
            break;
          case 'energy':
            drawEnergyBurst(g, engine.getWaveform(), engine.getFFT(), width, height, theme);
            break;
          case 'logo':
            drawLogoBackground(g, engine.getWaveform(), width, height, theme);
            break;
          case 'banner':
            drawBannerBackground(g, engine.getWaveform(), width, height, theme);
            break;
        }
      } catch (e) {
        // Engine not ready — only log unexpected errors
        if (e instanceof Error && !e.message.includes('not ready') && !e.message.includes('disposed')) {
          console.warn('[Visualizer]', e.message);
        }
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, jingleActive, mode, width, height, theme]);

  const isDOMMode = DOM_MODES.has(mode);

  // Memoized layout objects for prop-dependent values (width/height change infrequently)
  const layoutContainer = useMemo(
    () => ({ width, height, justifyContent: 'center' as const, alignItems: 'center' as const }),
    [width, height]
  );
  const layoutFill = useMemo(
    () => ({ position: 'absolute' as const, width, height }),
    [width, height]
  );

  // Static display when not playing
  const drawStatic = useCallback((g: GraphicsType) => {
    g.clear();
    drawBackground(g, width, height, theme);
  }, [width, height, theme]);

  // Keep the Pixi/Yoga tree structure STABLE across isPlaying changes.
  // Conditional rendering (ternary / &&) swaps entire subtrees, which creates
  // fresh Yoga nodes that mismatch existing ones → BindingError.
  // Instead: always render all elements, toggle via `visible` + collapsed layout.
  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerUp={handleClick}
      layout={layoutContainer}
    >
      {/* Single graphics element — drawStatic when paused, animation loop drives it when playing */}
      <pixiGraphics
        ref={graphicsRef}
        draw={isPlaying || jingleActive ? () => {} : drawStatic}
        layout={layoutFill}
      />

      {/* Centered mode label — hidden to match DOM visualizer (no mode label when stopped) */}
      <pixiBitmapText
        text={VIZ_MODE_LABELS[mode] ?? ''}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={LAYOUT_MODE_LABEL_COLLAPSED}
        alpha={0}
      />

      {/* Bottom-right mode indicator — visible when playing, hidden during jingle */}
      <pixiBitmapText
        text={VIZ_MODE_LABELS[mode] ?? ''}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={isPlaying && !jingleActive ? LAYOUT_MODE_INDICATOR : LAYOUT_MODE_INDICATOR_COLLAPSED}
        alpha={isPlaying && !jingleActive ? 0.5 : 0}
      />

      {/* Logo mode overlay — large DEViLBOX text, energy-reactive alpha */}
      <pixiBitmapText
        text="DEViLBOX"
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 20, fill: 0xffffff }}
        tint={theme.accent.color}
        layout={mode === 'logo' ? LAYOUT_OVERLAY_LABEL : LAYOUT_OVERLAY_COLLAPSED}
        alpha={mode === 'logo' ? 1 : 0}
      />

      {/* Banner mode overlay — mode label as large banner text */}
      <pixiBitmapText
        text="★ DEViLBOX ★"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
        tint={theme.accentSecondary.color}
        layout={mode === 'banner' ? LAYOUT_OVERLAY_LABEL : LAYOUT_OVERLAY_COLLAPSED}
        alpha={mode === 'banner' ? 0.9 : 0}
      />

      {/* DOM canvas overlay — always mounted, shown only for DOM_MODES.
          PixiDOMOverlay positions a fixed div exactly over this container. */}
      <PixiDOMOverlay layout={layoutFill} visible={isDOMMode} style={{ overflow: 'hidden' }}>
        <DOMVizContent mode={mode} height={height} onExit={handleClick} />
      </PixiDOMOverlay>
    </pixiContainer>
  );
};

// ─── Drawing helpers ─────────────────────────────────────────────────────────

function drawBackground(g: GraphicsType, w: number, h: number, theme: PixiTheme) {
  // Pure black background so the visualizer stands out from the toolbar rows
  g.roundRect(0, 0, w, h, 4);
  g.fill({ color: theme.bg.color });
  g.roundRect(0, 0, w, h, 4);
  g.stroke({ color: theme.border.color, alpha: 0.6, width: 1 });
}

function drawWaveform(g: GraphicsType, data: Float32Array, w: number, h: number, theme: PixiTheme) {
  if (!data || data.length === 0) return;

  const midY = h / 2;
  const padX = 4;
  const drawW = w - padX * 2;
  const step = data.length / drawW;

  // Draw center line
  g.moveTo(padX, midY);
  g.lineTo(w - padX, midY);
  g.stroke({ color: theme.border.color, alpha: 0.2, width: 1 });

  // Draw waveform
  g.moveTo(padX, midY + data[0] * (h / 2 - 4));
  for (let i = 1; i < drawW; i++) {
    const sampleIdx = Math.floor(i * step);
    const val = data[sampleIdx] ?? 0;
    const y = midY + val * (h / 2 - 4);
    g.lineTo(padX + i, y);
  }
  g.stroke({ color: theme.accent.color, alpha: 0.9, width: 1.5 });

  // Glow effect — draw again slightly wider and more transparent
  g.moveTo(padX, midY + data[0] * (h / 2 - 4));
  for (let i = 1; i < drawW; i++) {
    const sampleIdx = Math.floor(i * step);
    const val = data[sampleIdx] ?? 0;
    const y = midY + val * (h / 2 - 4);
    g.lineTo(padX + i, y);
  }
  g.stroke({ color: theme.accent.color, alpha: 0.2, width: 4 });
}

function drawSpectrum(g: GraphicsType, data: Float32Array, w: number, h: number, theme: PixiTheme, peakHolds: Float32Array) {
  if (!data || data.length === 0) return;

  const barCount = 48;
  const padX = 4;
  const padY = 4;
  const drawW = w - padX * 2;
  const drawH = h - padY * 2;
  const barWidth = drawW / barCount;
  const step = Math.floor(data.length / barCount);

  for (let i = 0; i < barCount; i++) {
    // Average FFT bins for this bar
    let sum = 0;
    for (let j = 0; j < step; j++) {
      sum += data[i * step + j] ?? -100;
    }
    const db = sum / step;
    const normalized = Math.max(0, Math.min(1, (db + 100) / 100));
    const barH = normalized * drawH;

    // Update peak hold
    if (normalized > peakHolds[i]) {
      peakHolds[i] = normalized;
    } else {
      peakHolds[i] = Math.max(0, peakHolds[i] - PEAK_DECAY);
    }

    if (barH > 0.5) {
      const x = padX + i * barWidth;
      const y = h - padY - barH;

      // Gradient effect: hue shifts from accent to warning at high levels
      const alpha = 0.4 + normalized * 0.6;
      const color = normalized > 0.8 ? theme.warning.color : theme.accent.color;

      g.rect(x, y, barWidth - 1, barH);
      g.fill({ color, alpha });
    }

    // Peak hold line
    const peakY = h - padY - peakHolds[i] * drawH;
    if (peakHolds[i] > 0.02) {
      g.rect(padX + i * barWidth, peakY, barWidth - 1, 1);
      g.fill({ color: theme.accentSecondary.color, alpha: 0.8 });
    }
  }
}

function drawVectorscope(g: GraphicsType, data: Float32Array, w: number, h: number, theme: PixiTheme) {
  if (!data || data.length < 2) return;

  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) / 2 - 6;

  // Draw crosshairs
  g.moveTo(cx, cy - radius);
  g.lineTo(cx, cy + radius);
  g.stroke({ color: theme.border.color, alpha: 0.15, width: 1 });
  g.moveTo(cx - radius, cy);
  g.lineTo(cx + radius, cy);
  g.stroke({ color: theme.border.color, alpha: 0.15, width: 1 });

  // Draw circle guide
  g.circle(cx, cy, radius);
  g.stroke({ color: theme.border.color, alpha: 0.1, width: 1 });

  // Time-delay Lissajous — use sample[i] vs sample[i+offset] to create
  // proper circular/spiral patterns even with mono analyser data.
  // Offset ~1/4 buffer creates ~90° phase shift → circular figures.
  const offset = Math.floor(data.length / 4);
  const sampleCount = Math.min(512, data.length - offset);
  const step = Math.max(1, Math.floor((data.length - offset) / sampleCount));

  // Draw as connected line for smoother appearance
  let started = false;
  for (let i = 0; i < sampleCount; i++) {
    const idx = i * step;
    const a = data[idx] ?? 0;
    const b = data[idx + offset] ?? 0;
    const x = cx + a * radius * 0.8;
    const y = cy - b * radius * 0.8;
    if (!started) { g.moveTo(x, y); started = true; } else { g.lineTo(x, y); }
  }
  g.stroke({ color: theme.accent.color, alpha: 0.7, width: 1.5 });

  // Glow pass
  started = false;
  for (let i = 0; i < sampleCount; i++) {
    const idx = i * step;
    const a = data[idx] ?? 0;
    const b = data[idx + offset] ?? 0;
    const x = cx + a * radius * 0.8;
    const y = cy - b * radius * 0.8;
    if (!started) { g.moveTo(x, y); started = true; } else { g.lineTo(x, y); }
  }
  g.stroke({ color: theme.accent.color, alpha: 0.15, width: 4 });
}

// ─── Extended visualizer modes ──────────────────────────────────────────────

function drawChannelOscilloscopes(g: GraphicsType, data: Float32Array, w: number, h: number, theme: PixiTheme) {
  if (!data || data.length === 0) return;
  const channelCount = 4;
  const cols = 2;
  const rows = 2;
  const cellW = (w - 6) / cols;
  const cellH = (h - 6) / rows;
  // Show 4 overlapping time windows with different offsets for visual variety
  const windowSize = Math.floor(data.length / 2);
  const chColors = [theme.accent.color, 0xa855f7, theme.success.color, theme.warning.color];

  for (let ch = 0; ch < channelCount; ch++) {
    const col = ch % cols;
    const row = Math.floor(ch / cols);
    const ox = 3 + col * cellW;
    const oy = 3 + row * cellH;
    const midY = oy + cellH / 2;

    // Cell border
    g.rect(ox, oy, cellW - 1, cellH - 1);
    g.stroke({ color: theme.border.color, alpha: 0.15, width: 0.5 });

    // Waveform with staggered offset for each "channel"
    const offset = Math.floor(ch * data.length / (channelCount + 1));
    const samples = Math.min(windowSize, data.length - offset);
    const step = samples / (cellW - 4);
    g.moveTo(ox + 2, midY + (data[offset] ?? 0) * (cellH / 2 - 2));
    for (let i = 1; i < cellW - 4; i++) {
      const val = data[offset + Math.floor(i * step)] ?? 0;
      g.lineTo(ox + 2 + i, midY + val * (cellH / 2 - 2));
    }
    g.stroke({ color: chColors[ch], alpha: 0.8, width: 1 });
  }
}

function drawStereoField(g: GraphicsType, data: Float32Array, w: number, h: number, theme: PixiTheme) {
  if (!data || data.length < 2) return;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) / 2 - 4;

  g.circle(cx, cy, radius);
  g.stroke({ color: theme.border.color, alpha: 0.15, width: 0.5 });

  // Crosshairs
  g.moveTo(cx, cy - radius); g.lineTo(cx, cy + radius);
  g.stroke({ color: theme.border.color, alpha: 0.1, width: 0.5 });
  g.moveTo(cx - radius, cy); g.lineTo(cx + radius, cy);
  g.stroke({ color: theme.border.color, alpha: 0.1, width: 0.5 });

  // Time-delay phase plot — similar to vectorscope but with shorter delay
  // for a tighter, more "metered" look
  const offset = Math.floor(data.length / 6);
  const sampleCount = Math.min(256, data.length - offset);
  const step = Math.max(1, Math.floor((data.length - offset) / sampleCount));

  // Draw as connected line
  let started = false;
  for (let i = 0; i < sampleCount; i++) {
    const idx = i * step;
    const a = data[idx] ?? 0;
    const b = data[idx + offset] ?? 0;
    const m = (a + b) * 0.5;
    const s = (a - b) * 0.5;
    const x = cx + s * radius * 1.4;
    const y = cy - m * radius * 0.7;
    if (!started) { g.moveTo(x, y); started = true; } else { g.lineTo(x, y); }
  }
  g.stroke({ color: theme.accentSecondary.color, alpha: 0.6, width: 1.5 });
}

function drawFrequencyBars(g: GraphicsType, data: Float32Array, w: number, h: number, theme: PixiTheme, peaks: Float32Array) {
  if (!data || data.length === 0) return;
  const barCount = Math.min(64, Math.floor((w - 8) / 2));
  const padX = 4;
  const padY = 4;
  const drawW = w - padX * 2;
  const drawH = h - padY * 2;
  const barWidth = drawW / barCount;
  const step = Math.floor(data.length / barCount);

  for (let i = 0; i < barCount; i++) {
    let sum = 0;
    for (let j = 0; j < step; j++) sum += data[i * step + j] ?? -100;
    const db = sum / step;
    const norm = Math.max(0, Math.min(1, (db + 100) / 100));
    const barH = norm * drawH;

    if (i < peaks.length) {
      if (norm > peaks[i]) peaks[i] = norm;
      else peaks[i] = Math.max(0, peaks[i] - PEAK_DECAY);
    }

    if (barH > 0.5) {
      const x = padX + i * barWidth;
      const color = norm > 0.8 ? theme.warning.color : theme.accent.color;
      g.rect(x, h - padY - barH, barWidth - 1, barH);
      g.fill({ color, alpha: 0.5 + norm * 0.5 });
    }
    if (i < peaks.length && peaks[i] > 0.02) {
      g.rect(padX + i * barWidth, h - padY - peaks[i] * drawH, barWidth - 1, 1);
      g.fill({ color: theme.accentSecondary.color, alpha: 0.7 });
    }
  }
}

function drawChannelLevels(g: GraphicsType, data: Float32Array, w: number, h: number, theme: PixiTheme) {
  if (!data || data.length === 0) return;
  // Show 4 bars representing different energy bands of the waveform
  // (since we only have mono, split into frequency-ish bands via simple windowing)
  const bandCount = 4;
  const padX = 4;
  const padY = 3;
  const drawW = w - padX * 2;
  const barH = Math.max(4, (h - padY * 2) / bandCount - 2);
  const bandColors = [theme.success.color, theme.accent.color, theme.warning.color, theme.error.color];

  for (let band = 0; band < bandCount; band++) {
    const y = padY + band * (barH + 2);

    // Each band looks at a different "derivative" order for variety:
    // band 0: RMS of raw signal (low freq energy)
    // band 1: RMS of differences (mid freq energy)
    // band 2: RMS of 2nd differences (high freq energy)
    // band 3: peak amplitude
    let sum = 0;
    const count = data.length;
    if (band === 0) {
      for (let i = 0; i < count; i++) sum += (data[i] ?? 0) ** 2;
      sum = Math.sqrt(sum / count);
    } else if (band === 1) {
      for (let i = 1; i < count; i++) { const d = (data[i] ?? 0) - (data[i-1] ?? 0); sum += d * d; }
      sum = Math.sqrt(sum / count) * 4;
    } else if (band === 2) {
      for (let i = 2; i < count; i++) { const d = (data[i] ?? 0) - 2*(data[i-1] ?? 0) + (data[i-2] ?? 0); sum += d * d; }
      sum = Math.sqrt(sum / count) * 12;
    } else {
      for (let i = 0; i < count; i++) sum = Math.max(sum, Math.abs(data[i] ?? 0));
    }
    const level = Math.min(1, sum * 3);

    // Background track
    g.rect(padX, y, drawW, barH);
    g.fill({ color: theme.bgSecondary.color });

    // Level bar
    const barW = level * drawW;
    g.rect(padX, y, barW, barH);
    g.fill({ color: bandColors[band], alpha: 0.7 });
  }
}

// ─── AudioMotion-style extra modes ──────────────────────────────────────────

/** Mirror: symmetric waveform reflected across horizontal center */
function drawMirrorWave(g: GraphicsType, data: Float32Array, w: number, h: number, theme: PixiTheme) {
  if (!data || data.length === 0) return;
  const midY = h / 2;
  const padX = 4;
  const drawW = w - padX * 2;
  const step = data.length / drawW;

  // Upper half (normal)
  g.moveTo(padX, midY - Math.abs(data[0] ?? 0) * (midY - 4));
  for (let i = 1; i < drawW; i++) {
    const val = Math.abs(data[Math.floor(i * step)] ?? 0);
    g.lineTo(padX + i, midY - val * (midY - 4));
  }
  g.stroke({ color: theme.accent.color, alpha: 0.9, width: 1.5 });

  // Lower half (mirrored)
  g.moveTo(padX, midY + Math.abs(data[0] ?? 0) * (midY - 4));
  for (let i = 1; i < drawW; i++) {
    const val = Math.abs(data[Math.floor(i * step)] ?? 0);
    g.lineTo(padX + i, midY + val * (midY - 4));
  }
  g.stroke({ color: theme.accent.color, alpha: 0.6, width: 1 });

  // Center divider
  g.moveTo(padX, midY); g.lineTo(w - padX, midY);
  g.stroke({ color: theme.border.color, alpha: 0.2, width: 1 });

  // Glow fill between the two halves (horizontal band)
  g.moveTo(padX, midY - Math.abs(data[0] ?? 0) * (midY - 4));
  for (let i = 1; i < drawW; i++) {
    const val = Math.abs(data[Math.floor(i * step)] ?? 0);
    g.lineTo(padX + i, midY - val * (midY - 4));
  }
  for (let i = drawW - 1; i >= 0; i--) {
    const val = Math.abs(data[Math.floor(i * step)] ?? 0);
    g.lineTo(padX + i, midY + val * (midY - 4));
  }
  g.closePath();
  g.fill({ color: theme.accent.color, alpha: 0.06 });
}

/** Radial: polar spectrum — FFT bars radiating from center */
function drawRadialSpectrum(g: GraphicsType, data: Float32Array, w: number, h: number, theme: PixiTheme) {
  if (!data || data.length === 0) return;
  const cx = w / 2;
  const cy = h / 2;
  const innerR = Math.min(w, h) * 0.15;
  const outerMax = Math.min(w, h) * 0.46;
  const barCount = 48;
  const step = Math.floor(data.length / barCount);
  const angleStep = (Math.PI * 2) / barCount;

  // Inner circle
  g.circle(cx, cy, innerR);
  g.stroke({ color: theme.border.color, alpha: 0.15, width: 1 });

  for (let i = 0; i < barCount; i++) {
    let sum = 0;
    for (let j = 0; j < step; j++) sum += data[i * step + j] ?? -100;
    const db = sum / step;
    const norm = Math.max(0, Math.min(1, (db + 100) / 100));
    const barLen = norm * (outerMax - innerR);

    const angle = i * angleStep - Math.PI / 2;
    const x1 = cx + Math.cos(angle) * innerR;
    const y1 = cy + Math.sin(angle) * innerR;
    const x2 = cx + Math.cos(angle) * (innerR + barLen);
    const y2 = cy + Math.sin(angle) * (innerR + barLen);

    const color = norm > 0.8 ? theme.warning.color : theme.accent.color;
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke({ color, alpha: 0.5 + norm * 0.5, width: 2 });
  }
}

/** Energy: concentric pulsing rings driven by low-frequency energy */
function drawEnergyBurst(g: GraphicsType, wave: Float32Array, fft: Float32Array, w: number, h: number, theme: PixiTheme) {
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(w, h) * 0.45;

  // Compute bass energy (low FFT bins) and overall RMS
  let bassEnergy = 0;
  const bassCount = Math.min(8, fft?.length ?? 0);
  for (let i = 0; i < bassCount; i++) bassEnergy += Math.max(0, ((fft?.[i] ?? -100) + 100) / 100);
  bassEnergy = bassCount > 0 ? bassEnergy / bassCount : 0;

  let rms = 0;
  const waveLen = wave?.length ?? 0;
  for (let i = 0; i < waveLen; i++) rms += (wave?.[i] ?? 0) ** 2;
  rms = waveLen > 0 ? Math.sqrt(rms / waveLen) : 0;

  // Three rings at different radii
  const rings = [
    { r: maxR * (0.3 + bassEnergy * 0.5), color: theme.accent.color, alpha: 0.9, w: 2 },
    { r: maxR * (0.5 + rms * 0.4), color: theme.accentSecondary.color, alpha: 0.5, w: 1.5 },
    { r: maxR * (0.7 + rms * 0.25), color: theme.border.color, alpha: 0.3, w: 1 },
  ];

  for (const ring of rings) {
    if (ring.r > 2) {
      g.circle(cx, cy, ring.r);
      g.stroke({ color: ring.color, alpha: ring.alpha, width: ring.w });
      // Glow
      g.circle(cx, cy, ring.r);
      g.stroke({ color: ring.color, alpha: ring.alpha * 0.15, width: ring.w * 4 });
    }
  }

  // Center dot pulsing with energy
  const dotR = 2 + bassEnergy * 6 + rms * 4;
  g.circle(cx, cy, dotR);
  g.fill({ color: theme.accent.color, alpha: 0.9 });
  g.circle(cx, cy, dotR * 2);
  g.fill({ color: theme.accent.color, alpha: 0.1 });
}

/** Logo background: subtle waveform + accent decorations behind DEViLBOX text overlay */
function drawLogoBackground(g: GraphicsType, data: Float32Array, w: number, h: number, theme: PixiTheme) {
  // Faint waveform ribbon
  if (data && data.length > 0) {
    const midY = h / 2;
    const step = data.length / w;
    g.moveTo(0, midY + (data[0] ?? 0) * (h / 3));
    for (let i = 1; i < w; i++) {
      g.lineTo(i, midY + (data[Math.floor(i * step)] ?? 0) * (h / 3));
    }
    g.stroke({ color: theme.accent.color, alpha: 0.15, width: 2 });
  }
  // Corner accent lines
  g.moveTo(0, 0); g.lineTo(16, 0);
  g.moveTo(0, 0); g.lineTo(0, 8);
  g.stroke({ color: theme.accent.color, alpha: 0.6, width: 1.5 });
  g.moveTo(w, h); g.lineTo(w - 16, h);
  g.moveTo(w, h); g.lineTo(w, h - 8);
  g.stroke({ color: theme.accent.color, alpha: 0.6, width: 1.5 });
}

// ── Jingle pixel font (3×5 bitmap, bit 2=left col, bit 0=right col) ──────────
const JINGLE_PIXEL_CHARS: Record<string, number[]> = {
  ' ': [0b000, 0b000, 0b000, 0b000, 0b000],
  'D': [0b110, 0b101, 0b101, 0b101, 0b110],
  'E': [0b111, 0b100, 0b110, 0b100, 0b111],
  'V': [0b101, 0b101, 0b101, 0b010, 0b010],
  'I': [0b111, 0b010, 0b010, 0b010, 0b111],
  'L': [0b100, 0b100, 0b100, 0b100, 0b111],
  'B': [0b110, 0b101, 0b110, 0b101, 0b110],
  'O': [0b010, 0b101, 0b101, 0b101, 0b010],
  'X': [0b101, 0b101, 0b010, 0b101, 0b101],
  'R': [0b110, 0b101, 0b110, 0b101, 0b101],
  'A': [0b010, 0b101, 0b111, 0b101, 0b101],
  'Y': [0b101, 0b101, 0b010, 0b010, 0b010],
  'U': [0b101, 0b101, 0b101, 0b101, 0b010],
  'W': [0b101, 0b101, 0b111, 0b111, 0b101],
  'S': [0b011, 0b100, 0b010, 0b001, 0b110],
  'M': [0b101, 0b111, 0b111, 0b101, 0b101],
  'K': [0b101, 0b110, 0b100, 0b110, 0b101],
  'T': [0b111, 0b010, 0b010, 0b010, 0b010],
  'C': [0b011, 0b100, 0b100, 0b100, 0b011],
  'G': [0b011, 0b100, 0b110, 0b101, 0b011],
  'H': [0b101, 0b101, 0b111, 0b101, 0b101],
  'N': [0b101, 0b111, 0b111, 0b101, 0b101],
  'F': [0b111, 0b100, 0b110, 0b100, 0b100],
  'P': [0b110, 0b101, 0b110, 0b100, 0b100],
};

function drawPixelChar(
  g: GraphicsType, ch: string, x: number, y: number,
  px: number, color: number, alpha: number,
): void {
  const pattern = JINGLE_PIXEL_CHARS[ch];
  if (!pattern) return;
  for (let row = 0; row < 5; row++) {
    const bits = pattern[row] ?? 0;
    for (let col = 0; col < 3; col++) {
      if (bits & (1 << (2 - col))) {
        g.rect(x + col * px, y + row * px, px, px);
        g.fill({ color, alpha });
      }
    }
  }
}

function drawPixelText(
  g: GraphicsType, text: string, x: number, y: number,
  px: number, color: number, alpha: number,
  perLetterColor?: number[],
): void {
  let cx = x;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const c = perLetterColor?.[i] ?? color;
    drawPixelChar(g, ch, cx, y, px, c, alpha);
    cx += 3 * px + px; // char width + 1px gap
  }
}

/** Jingle mode: split layout — spectrum bars left, typed text right */
function drawJingleMode(
  g: GraphicsType,
  analyser: AnalyserNode | null,
  w: number,
  h: number,
  theme: PixiTheme,
  animState: JingleAnimState,
) {
  if (!analyser) return;

  const freqData = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(freqData);
  const waveData = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(waveData);

  // RMS for beat detection
  let rms = 0;
  for (let i = 0; i < waveData.length; i++) {
    const s = ((waveData[i] ?? 128) - 128) / 128;
    rms += s * s;
  }
  rms = Math.sqrt(rms / waveData.length);

  const now = performance.now();
  if (rms > 0.25 && now - animState.lastBeatTime > 180) {
    animState.lastBeatTime = now;
    animState.beatFlash = 1.0;
    animState.beatCount++;
    animState.glitchFrames = 4; // #3 — trigger glitch on beat
  }
  animState.beatFlash = Math.max(0, animState.beatFlash - 0.05);
  if (animState.glitchFrames > 0) animState.glitchFrames--;

  // Advance typed text ("DEVILBOX" then "READY" after a pause)
  const elapsed = now - animState.startTime;
  const typingStart = 400;
  const charMs = 80;
  const line2Gap = 300;
  const totalLine1 = 8; // "DEVILBOX"
  const totalLine2 = 5; // "READY"
  if (elapsed > typingStart) {
    const rawChars = Math.floor((elapsed - typingStart) / charMs);
    if (rawChars <= totalLine1) {
      animState.typedChars = rawChars;
    } else {
      const l2 = Math.floor((elapsed - typingStart - totalLine1 * charMs - line2Gap) / charMs);
      animState.typedChars = totalLine1 + Math.max(0, Math.min(totalLine2, l2));
    }
  }

  // Beat flash overlay
  if (animState.beatFlash > 0) {
    g.rect(0, 0, w, h);
    g.fill({ color: theme.accent.color, alpha: animState.beatFlash * 0.1 });
  }

  // ── Left panel: spectrum bars ─────────────────────────────────────────────
  const barPanelW = Math.floor(w * 0.57);
  const barCount = 24;
  const padX = 3;
  const padY = 3;
  const barAreaH = h - padY - 8; // leave 8px for waveform at bottom
  const barW = (barPanelW - padX * 2) / barCount;
  const step = Math.floor(freqData.length / barCount);

  const glitching = animState.glitchFrames > 0;
  const glitchShift = glitching ? (Math.random() - 0.5) * 8 : 0;

  // #3 — ghost pass: tinted shifted bars drawn first for RGB-split feel
  if (glitching) {
    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) sum += freqData[i * step + j] ?? 0;
      const norm = (sum / step) / 255;
      const barH = norm * barAreaH;
      if (barH > 0.5) {
        g.rect(padX + i * barW - glitchShift * 1.5, padY + barAreaH - barH, Math.max(1, barW - 1), barH);
        g.fill({ color: 0xff2040, alpha: 0.25 });
        g.rect(padX + i * barW + glitchShift * 1.5, padY + barAreaH - barH, Math.max(1, barW - 1), barH);
        g.fill({ color: 0x2040ff, alpha: 0.25 });
      }
    }
  }

  for (let i = 0; i < barCount; i++) {
    let sum = 0;
    for (let j = 0; j < step; j++) sum += freqData[i * step + j] ?? 0;
    const norm = (sum / step) / 255;
    const barH = norm * barAreaH;
    if (barH > 0.5) {
      // #3 — every 5th bar group gets a small random horizontal offset when glitching
      const groupShift = glitching && (i % 5 === 0) ? glitchShift : 0;
      const x = padX + i * barW + groupShift;
      const y = padY + barAreaH - barH;
      let color: number;
      if (i < 3)       color = 0xff3333;           // sub-bass: red
      else if (i < 8)  color = 0xff8833;           // bass: orange
      else if (i < 16) color = theme.accent.color; // mid
      else             color = 0xffffff;           // high: white
      g.rect(x, y, Math.max(1, barW - 1), barH);
      g.fill({ color, alpha: 0.6 + norm * 0.4 });
    }
  }

  // #3 — bright scan-line slices on glitch frames
  if (glitching) {
    for (let s = 0; s < 2; s++) {
      const sliceY = padY + Math.random() * barAreaH;
      g.rect(0, sliceY, barPanelW, 1 + Math.random() * 2);
      g.fill({ color: theme.accent.color, alpha: 0.55 });
    }
  }

  // Waveform strip along the bottom of the bar panel
  const waveY = h - 6;
  const wSamples = barPanelW - padX * 2;
  const wStep = waveData.length / wSamples;
  g.moveTo(padX, waveY + (((waveData[0] ?? 128) - 128) / 128) * 3);
  for (let i = 1; i < wSamples; i++) {
    const val = (((waveData[Math.floor(i * wStep)] ?? 128) - 128) / 128) * 3;
    g.lineTo(padX + i, waveY + val);
  }
  g.stroke({ color: theme.accent.color, alpha: 0.7, width: 1 });

  // ── Right panel: typed text ───────────────────────────────────────────────
  const textX = barPanelW + 3;
  const px = 2; // pixel size (2×2 per dot)
  const charW = 3 * px + px; // = 8px per char

  // Per-letter brightness for "DEVILBOX" based on frequency band energy
  // Letters map to frequency bands: D=sub, E-V=bass, I-L=mid, B-O-X=high
  const bandEnergy = (lo: number, hi: number): number => {
    let s = 0;
    for (let i = lo; i <= hi; i++) s += freqData[i] ?? 0;
    return (s / (hi - lo + 1)) / 255;
  };
  const bandMap = [
    bandEnergy(0, 2),   // D: sub-bass
    bandEnergy(3, 5),   // E: bass
    bandEnergy(6, 8),   // V: lower-mid
    bandEnergy(9, 11),  // I: mid
    bandEnergy(12, 14), // L: mid
    bandEnergy(15, 17), // B: upper-mid
    bandEnergy(18, 20), // O: high
    bandEnergy(21, 23), // X: high
  ];
  const LINE1 = 'DEVILBOX';
  const LINE2 = 'READY';
  const line1Typed = Math.min(animState.typedChars, totalLine1);
  const line2Typed = Math.max(0, animState.typedChars - totalLine1);

  // Line 1: DEVILBOX — each typed letter lit by its band energy
  for (let i = 0; i < line1Typed; i++) {
    const energy = bandMap[i] ?? 0;
    const lit = energy > 0.3;
    const col = lit ? (theme.cellNote?.color ?? theme.accent.color) : theme.textMuted.color;
    const alpha = lit ? 0.9 + energy * 0.1 : 0.4;
    drawPixelChar(g, LINE1[i]!, textX + i * charW, 4, px, col, alpha);
  }
  // Cursor blink after last typed char on line 1 (while line 1 is still typing)
  if (line1Typed < totalLine1 && line1Typed > 0 && Math.floor(elapsed / 400) % 2 === 0) {
    g.rect(textX + line1Typed * charW, 4, 1, 5 * px);
    g.fill({ color: theme.accent.color, alpha: 0.8 });
  }

  // Line 2: READY
  const line2Y = 4 + 5 * px + 3; // below line 1 with gap
  for (let i = 0; i < line2Typed; i++) {
    drawPixelChar(g, LINE2[i]!, textX + i * charW, line2Y, px, theme.accent.color, 0.85);
  }
  if (line2Typed > 0 && line2Typed < totalLine2 && Math.floor(elapsed / 400) % 2 === 0) {
    g.rect(textX + line2Typed * charW, line2Y, 1, 5 * px);
    g.fill({ color: theme.accent.color, alpha: 0.8 });
  }

  // ── Boot messages (appear after beat thresholds) ──────────────────────────
  const bootMsgs = ['AUDIO OK', 'WASM OK', 'TRACK RDY'];
  const bootBeats = [2, 5, 9];
  const msgY0 = line2Y + 5 * px + 4;
  for (let m = 0; m < bootMsgs.length; m++) {
    if (animState.beatCount >= (bootBeats[m] ?? 99)) {
      const msg = bootMsgs[m]!;
      drawPixelText(g, msg, textX, msgY0 + m * 9, 1, theme.textMuted.color, 0.55);
    }
  }
}

/** Banner background: horizontal scan-line animation + waveform */
function drawBannerBackground(g: GraphicsType, data: Float32Array, w: number, h: number, theme: PixiTheme) {
  // Subtle horizontal scan lines
  for (let y = 2; y < h; y += 4) {
    g.moveTo(0, y); g.lineTo(w, y);
    g.stroke({ color: theme.border.color, alpha: 0.06, width: 1 });
  }
  // Thin bottom waveform
  if (data && data.length > 0) {
    const baseY = h - 6;
    const step = data.length / w;
    g.moveTo(0, baseY + (data[0] ?? 0) * 4);
    for (let i = 1; i < w; i++) {
      g.lineTo(i, baseY + (data[Math.floor(i * step)] ?? 0) * 4);
    }
    g.stroke({ color: theme.accentSecondary.color, alpha: 0.5, width: 1 });
  }
}
