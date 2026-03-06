/**
 * JamCrackerControls.tsx — JamCracker Pro instrument editor
 *
 * Displays instrument info and AM synthesis parameters:
 * - Instrument name, flags (loop, AM synth)
 * - AM waveform visualization (64-byte waveform display)
 * - Phase delta control (modulation speed)
 * - Volume control
 *
 * PCM instruments show sample info. AM instruments show the waveform editor.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import type { JamCrackerConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';

interface JamCrackerControlsProps {
  config: JamCrackerConfig;
  onChange: (updates: Partial<JamCrackerConfig>) => void;
}

/** Draw the AM waveform into a canvas (DPR-aware) */
function drawWaveform(
  canvas: HTMLCanvasElement,
  waveformData: Uint8Array | undefined,
  phaseDelta: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 320;
  const cssH = canvas.clientHeight || 120;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.scale(dpr, dpr);

  const w = cssW;
  const h = cssH;
  const mid = h / 2;

  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = '#0a0e14';
  ctx.fillRect(0, 0, w, h);

  // Center line
  ctx.strokeStyle = '#1a2a3a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(w, mid);
  ctx.stroke();

  if (!waveformData || waveformData.length < 64) {
    // No waveform — draw "No Data" text
    ctx.fillStyle = '#4a5a6a';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No AM waveform data', w / 2, mid);
    return;
  }

  const WAVE_SIZE = 64;

  // Draw the blended waveform (two phase-offset copies averaged)
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 2;
  ctx.beginPath();

  let phase = 0;
  for (let x = 0; x < w; x++) {
    const idx = Math.floor((x / w) * WAVE_SIZE) % WAVE_SIZE;
    const phaseIdx = (idx + Math.floor(phase / 4)) % WAVE_SIZE;

    const s1 = waveformData[idx] > 127 ? waveformData[idx] - 256 : waveformData[idx];
    const s2 = waveformData[phaseIdx] > 127 ? waveformData[phaseIdx] - 256 : waveformData[phaseIdx];
    const blended = (s1 + s2) / 2;
    const y = mid - (blended / 128) * (mid - 4);

    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);

    phase = (phase + Math.floor(phaseDelta * WAVE_SIZE / w)) & 0xFF;
  }
  ctx.stroke();

  // Draw the raw waveform (dimmer, for reference)
  ctx.strokeStyle = '#00ff8840';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < w; x++) {
    const idx = Math.floor((x / w) * WAVE_SIZE) % WAVE_SIZE;
    const s = waveformData[idx] > 127 ? waveformData[idx] - 256 : waveformData[idx];
    const y = mid - (s / 128) * (mid - 4);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

export const JamCrackerControls: React.FC<JamCrackerControlsProps> = ({
  config,
  onChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const configRef = useRef(config);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Redraw waveform when config changes or canvas resizes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Defer initial draw to after layout so clientWidth > 0
    const raf = requestAnimationFrame(() => {
      drawWaveform(canvas, configRef.current.waveformData, configRef.current.phaseDelta);
    });

    const obs = new ResizeObserver(() => {
      drawWaveform(canvas, configRef.current.waveformData, configRef.current.phaseDelta);
    });
    obs.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, [config.waveformData, config.phaseDelta]);

  const updateParam = useCallback((key: keyof JamCrackerConfig, value: number) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 text-sm">
        <span className="text-cyan-400 font-mono font-bold">JamCracker Pro</span>
        <span className="text-gray-500">|</span>
        <span className="text-gray-300">{config.name}</span>
        <div className="flex gap-2 ml-auto">
          {config.isAM && (
            <span className="px-2 py-0.5 bg-purple-900/50 text-purple-300 rounded text-xs font-mono">
              AM SYNTH
            </span>
          )}
          {config.hasLoop && (
            <span className="px-2 py-0.5 bg-green-900/50 text-green-300 rounded text-xs font-mono">
              LOOP
            </span>
          )}
          {!config.isAM && (
            <span className="px-2 py-0.5 bg-blue-900/50 text-blue-300 rounded text-xs font-mono">
              PCM ({config.sampleSize} bytes)
            </span>
          )}
        </div>
      </div>

      {/* AM Waveform Display */}
      {config.isAM && (
        <div className="space-y-2">
          <div className="text-xs text-gray-500 font-mono uppercase tracking-wider">
            AM Waveform (64-byte phase modulation)
          </div>
          <canvas
            ref={canvasRef}
            className="w-full rounded border border-gray-800 bg-[#0a0e14]"
            style={{ height: 120 }}
          />
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-6 items-start">
        <div className="flex flex-col items-center gap-1">
          <Knob
            value={config.volume / 64}
            onChange={(v) => updateParam('volume', Math.round(v * 64))}
            size="md"
            label="Volume"
            min={0}
            max={1}
            bipolar={false}
          />
          <span className="text-[10px] text-gray-500 font-mono">{config.volume}</span>
        </div>

        {config.isAM && (
          <div className="flex flex-col items-center gap-1">
            <Knob
              value={config.phaseDelta / 255}
              onChange={(v) => updateParam('phaseDelta', Math.round(v * 255))}
              size="md"
              label="Phase Δ"
              min={0}
              max={1}
              bipolar={false}
            />
            <span className="text-[10px] text-gray-500 font-mono">{config.phaseDelta}</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="text-[10px] text-gray-600 font-mono">
        Flags: 0x{config.flags.toString(16).padStart(2, '0')}
        {config.isAM ? ' (AM synthesis — 64-byte waveform loop with phase modulation)' : ' (PCM sample)'}
      </div>
    </div>
  );
};
