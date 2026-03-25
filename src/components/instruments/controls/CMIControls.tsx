/**
 * CMIControls — DOM/React renderer for the Fairlight CMI panel.
 *
 * ALL logic lives in useCMIPanel (shared hook). This file is ONLY rendering.
 * The Pixi version (PixiCMIKnobPanel.tsx) uses the same hook — zero duplication.
 */

import React, { useCallback, useRef, useEffect } from 'react';
import { Knob } from '@components/controls/Knob';
import { ScrollLockContainer } from '@components/ui/ScrollLockContainer';
import type { SynthType } from '@typedefs/instrument';
import {
  useCMIPanel,
  CMI_TAB_DEFS,
  NUM_HARMONICS, WAVE_SAMPLES, WAVE_NAMES,
  cutoffToHz, filterResponseDb, formatCutoffHz,
  fmtInt, fmtWave, fmtCutoff, fmtTrack,
} from '@engine/cmi/useCMIPanel';

// ── Colors ───────────────────────────────────────────────────────────────────

const CMI_GREEN = '#22c55e';
const CMI_GREEN_DIM = '#166534';
const CMI_GREEN_BRIGHT = '#4ade80';
const CMI_GREEN_FAINT = '#0d3320';
const CMI_GREEN_GLOW = 'rgba(34, 197, 94, 0.15)';

// ── Props ────────────────────────────────────────────────────────────────────

interface CMIControlsProps {
  synthType: SynthType;
  parameters: Record<string, number | string>;
  instrumentId: number;
  onParamChange: (key: string, value: number) => void;
  onTextChange?: (key: string, value: string) => void;
  onLoadPreset?: (program: number) => void;
}

// ── Canvas: Harmonic Bars ────────────────────────────────────────────────────

const HarmonicBarsCanvas: React.FC<{
  harmonics: number[];
  width: number;
  height: number;
  onStartDrag: (nx: number, ny: number) => void;
  onDrag: (nx: number, ny: number) => void;
  onEndDrag: () => void;
  dragActive: React.MutableRefObject<boolean>;
}> = ({ harmonics, width, height, onStartDrag, onDrag, onEndDrag, dragActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = CMI_GREEN_FAINT;
    ctx.lineWidth = 0.5;
    for (let y = 0; y <= 4; y++) {
      ctx.beginPath();
      ctx.moveTo(0, (y / 4) * height);
      ctx.lineTo(width, (y / 4) * height);
      ctx.stroke();
    }

    // Bars
    const barW = width / NUM_HARMONICS;
    for (let i = 0; i < NUM_HARMONICS; i++) {
      const amp = Math.max(0, Math.min(1, harmonics[i] || 0));
      if (amp > 0.001) {
        const h = amp * height;
        ctx.fillStyle = CMI_GREEN;
        ctx.fillRect(i * barW + 1, height - h, barW - 2, h);
        // Bright top
        ctx.fillStyle = CMI_GREEN_BRIGHT;
        ctx.fillRect(i * barW + 1, height - h, barW - 2, 2);
      }
    }

    // Border
    ctx.strokeStyle = CMI_GREEN_DIM;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);
  }, [harmonics, width, height]);

  const getRelativeCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { nx: (e.clientX - rect.left) / width, ny: (e.clientY - rect.top) / height };
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ cursor: 'crosshair', borderRadius: 4, width, height }}
      onMouseDown={(e) => { const c = getRelativeCoords(e); onStartDrag(c.nx, c.ny); }}
      onMouseMove={(e) => { if (dragActive.current) { const c = getRelativeCoords(e); onDrag(c.nx, c.ny); } }}
      onMouseUp={onEndDrag}
      onMouseLeave={onEndDrag}
    />
  );
};

// ── Canvas: Waveform Display ─────────────────────────────────────────────────

const WaveformCanvas: React.FC<{
  waveform: Float32Array;
  width: number;
  height: number;
}> = ({ waveform, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // Center line + grid
    const mid = height / 2;
    ctx.strokeStyle = CMI_GREEN_FAINT;
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(width, mid); ctx.stroke();
    for (let q = 1; q < 4; q++) {
      ctx.beginPath(); ctx.moveTo((q / 4) * width, 0); ctx.lineTo((q / 4) * width, height); ctx.stroke();
    }

    // Waveform
    if (waveform.length > 0) {
      const amp = mid - 6;
      ctx.strokeStyle = CMI_GREEN;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, mid - waveform[0] * amp);
      for (let i = 1; i < waveform.length; i++) {
        ctx.lineTo((i / (waveform.length - 1)) * width, mid - waveform[i] * amp);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = CMI_GREEN_DIM;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);
  }, [waveform, width, height]);

  return <canvas ref={canvasRef} width={width} height={height} style={{ width, height, borderRadius: 4 }} />;
};

// ── Canvas: Filter Response ──────────────────────────────────────────────────

const FilterCanvas: React.FC<{
  cutoff: number;
  width: number;
  height: number;
}> = ({ cutoff, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    const fc = cutoffToHz(cutoff);
    const logMin = Math.log10(20), logMax = Math.log10(20000);
    const dbRange = 60;

    // Grid
    ctx.strokeStyle = CMI_GREEN_FAINT;
    ctx.lineWidth = 0.5;
    for (const f of [100, 1000, 10000]) {
      const x = ((Math.log10(f) - logMin) / (logMax - logMin)) * width;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (const db of [-6, -12, -24, -48]) {
      const y = (-db / dbRange) * height;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    // Curve
    ctx.strokeStyle = CMI_GREEN;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let px = 0; px < width; px++) {
      const f = Math.pow(10, logMin + (px / width) * (logMax - logMin));
      const y = Math.min(height, (-filterResponseDb(f, fc) / dbRange) * height);
      if (px === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
    }
    ctx.stroke();

    // Cutoff marker
    const cx = ((Math.log10(Math.max(20, fc)) - logMin) / (logMax - logMin)) * width;
    ctx.strokeStyle = CMI_GREEN_BRIGHT;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, height); ctx.stroke();

    ctx.strokeStyle = CMI_GREEN_DIM;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);
  }, [cutoff, width, height]);

  return <canvas ref={canvasRef} width={width} height={height} style={{ width, height, borderRadius: 4 }} />;
};

// ── Canvas: Envelope ─────────────────────────────────────────────────────────

const EnvelopeCanvas: React.FC<{
  curve: { x: number; y: number }[];
  width: number;
  height: number;
}> = ({ curve, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = CMI_GREEN_FAINT;
    ctx.lineWidth = 0.5;
    for (let q = 1; q <= 4; q++) {
      const y = height - (q / 4) * height;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    // Curve
    if (curve.length > 0) {
      ctx.strokeStyle = CMI_GREEN;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(curve[0].x * width, height - curve[0].y * height);
      for (let i = 1; i < curve.length; i++) {
        ctx.lineTo(curve[i].x * width, height - curve[i].y * height);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = CMI_GREEN_DIM;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);
  }, [curve, width, height]);

  return <canvas ref={canvasRef} width={width} height={height} style={{ width, height, borderRadius: 4 }} />;
};

// ── Main Component ───────────────────────────────────────────────────────────

export const CMIControls: React.FC<CMIControlsProps> = ({
  parameters,
  instrumentId,
  onParamChange,
}) => {
  const cmi = useCMIPanel({
    externalParams: parameters,
    externalOnChange: onParamChange,
    instrumentId,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) cmi.loadSampleFromFile(file);
  }, [cmi]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) cmi.loadSampleFromFile(file);
    e.target.value = ''; // reset for re-select
  }, [cmi]);

  const VIS_W = 420;
  const BAR_H = 140;
  const WAVE_PREVIEW_H = 60;

  return (
    <ScrollLockContainer>
      <div
        className="flex flex-col gap-2 p-3 rounded-lg select-none"
        style={{
          backgroundColor: '#111111',
          border: `1px solid ${CMI_GREEN_DIM}`,
          boxShadow: `inset 0 0 30px rgba(0,0,0,0.5), 0 0 8px ${CMI_GREEN_GLOW}`,
          minHeight: 200,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-widest" style={{ color: CMI_GREEN }}>
              FAIRLIGHT CMI IIx
            </span>
            <span className="text-[9px] font-mono" style={{ color: CMI_GREEN_DIM }}>
              16-Voice Sampling Synthesizer
            </span>
          </div>
          {/* Voice status LEDs */}
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 16 }, (_, i) => {
              const active = cmi.voiceStatus[i * 4] === 1;
              const env = cmi.voiceStatus[i * 4 + 2];
              const releasing = cmi.voiceStatus[i * 4 + 3] === 1;
              const brightness = active ? Math.max(0.3, env / 255) : 0;
              return (
                <div
                  key={i}
                  title={active ? `V${i + 1}: note ${cmi.voiceStatus[i * 4 + 1]} env ${env}${releasing ? ' (rel)' : ''}` : `V${i + 1}: off`}
                  style={{
                    width: 6, height: 6, borderRadius: '50%',
                    backgroundColor: active
                      ? (releasing ? `rgba(34, 197, 94, ${brightness * 0.6})` : `rgba(34, 197, 94, ${brightness})`)
                      : '#1a1a1a',
                    border: `1px solid ${active ? CMI_GREEN_DIM : '#222'}`,
                    boxShadow: active ? `0 0 ${Math.round(brightness * 4)}px ${CMI_GREEN}` : 'none',
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Tab bar + Preset selector */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex gap-1.5 flex-1">
            {CMI_TAB_DEFS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => cmi.setActiveTab(tab.id)}
                className="px-3 py-1 text-xs font-mono transition-all rounded-sm"
                style={{
                  color: cmi.activeTab === tab.id ? '#000' : CMI_GREEN,
                  backgroundColor: cmi.activeTab === tab.id ? CMI_GREEN : 'transparent',
                  border: `1px solid ${cmi.activeTab === tab.id ? CMI_GREEN : CMI_GREEN_DIM}`,
                }}
              >
                <span className="opacity-60 mr-1">{tab.pageNum}</span>
                {tab.label}
              </button>
            ))}
          </div>
          <select
            onChange={(e) => cmi.loadPreset(parseInt(e.target.value))}
            defaultValue=""
            className="text-[10px] font-mono px-2 py-1 rounded-sm"
            style={{
              backgroundColor: '#0a0a0a',
              color: CMI_GREEN,
              border: `1px solid ${CMI_GREEN_DIM}`,
              outline: 'none',
            }}
          >
            <option value="" disabled>PRESET</option>
            {cmi.presets.map((p, i) => (
              <option key={i} value={i}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* ════════════ Page 7: HARMONIC ════════════ */}
        {cmi.activeTab === 'harmonic' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <Knob value={cmi.volume} min={0} max={255} onChange={(v) => cmi.handleParamChange('volume', v)} label="Volume" size="sm" color={CMI_GREEN} formatValue={fmtInt} />
              <Knob value={cmi.waveSelect} min={0} max={7} onChange={(v) => cmi.handleParamChange('wave_select', v)} label="Wave" size="sm" color={CMI_GREEN} formatValue={fmtWave} />
            </div>
            <div className="flex gap-3">
              <div className="flex flex-col gap-1">
                <HarmonicBarsCanvas
                  harmonics={cmi.harmonics}
                  width={VIS_W}
                  height={BAR_H}
                  onStartDrag={cmi.startHarmonicDrag}
                  onDrag={cmi.updateHarmonicAt}
                  onEndDrag={cmi.endHarmonicDrag}
                  dragActive={cmi.harmonicDragActive}
                />
                <WaveformCanvas waveform={cmi.customWaveform} width={VIS_W} height={WAVE_PREVIEW_H} />
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={cmi.syncHarmonicsToEngine}
                    className="px-3 py-1 text-[10px] font-mono font-bold rounded-sm transition-all"
                    style={{ color: '#000', backgroundColor: CMI_GREEN, border: `1px solid ${CMI_GREEN}` }}
                  >
                    APPLY TO ENGINE
                  </button>
                  <span className="text-[9px] font-mono" style={{ color: CMI_GREEN_DIM }}>
                    {cmi.sampleLoaded ? `Loaded: ${cmi.sampleName}` : 'Draw harmonics then click Apply'}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1 pt-1">
                <div className="text-[9px] font-mono font-bold mb-1" style={{ color: CMI_GREEN_DIM }}>PRESETS</div>
                {WAVE_NAMES.map((name, i) => (
                  <button
                    key={i}
                    onClick={() => cmi.selectWavePreset(i)}
                    className="px-2 py-0.5 text-[10px] font-mono rounded-sm text-left transition-all"
                    style={{
                      color: cmi.waveBank === i ? '#000' : CMI_GREEN,
                      backgroundColor: cmi.waveBank === i ? CMI_GREEN : 'transparent',
                      border: `1px solid ${cmi.waveBank === i ? CMI_GREEN : CMI_GREEN_DIM}`,
                    }}
                  >
                    {name.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ════════════ Page 5: WAVE ════════════ */}
        {cmi.activeTab === 'wave' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <Knob value={cmi.waveSelect} min={0} max={7} onChange={(v) => cmi.handleParamChange('wave_select', v)} label="Wave" size="sm" color={CMI_GREEN} formatValue={fmtWave} />
              <Knob value={cmi.volume} min={0} max={255} onChange={(v) => cmi.handleParamChange('volume', v)} label="Volume" size="sm" color={CMI_GREEN} formatValue={fmtInt} />
            </div>
            {/* Waveform display */}
            <div className="flex flex-col gap-1">
              <div
                className="relative cursor-pointer rounded"
                style={{ border: `1px dashed ${CMI_GREEN_DIM}`, width: VIS_W, height: 80 }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                {cmi.sampleLoaded && cmi.sampleWaveform ? (
                  <WaveformCanvas waveform={cmi.sampleWaveform} width={VIS_W} height={80} />
                ) : (
                  <WaveformCanvas waveform={cmi.builtinWaveform} width={VIS_W} height={80} />
                )}
                {!cmi.sampleLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-[10px] font-mono opacity-50" style={{ color: CMI_GREEN }}>
                      DROP WAV/AIFF or CLICK TO BROWSE FILES
                    </span>
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept=".wav,.aiff,.aif,.mp3,.ogg,.flac" className="hidden" onChange={handleFileSelect} />
              <div className="flex items-center gap-2">
                <div className="text-xs font-mono font-bold" style={{ color: CMI_GREEN }}>
                  {cmi.sampleLoaded ? cmi.sampleName : `BANK ${cmi.waveBank}: ${WAVE_NAMES[cmi.waveBank] ?? '?'}`}
                </div>
                <div className="text-[9px] font-mono" style={{ color: CMI_GREEN_DIM }}>
                  {WAVE_SAMPLES} samples | 8-bit PCM | 16KB/voice
                </div>
              </div>
            </div>
            {/* Library browser */}
            {cmi.libraryCategories.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="text-[9px] font-mono font-bold" style={{ color: CMI_GREEN_DIM }}>
                  FAIRLIGHT SAMPLE LIBRARY ({cmi.libraryCategories.length} categories)
                </div>
                <div className="flex gap-2" style={{ maxWidth: VIS_W }}>
                  {/* Category selector */}
                  <select
                    value={cmi.libraryCategoryIndex}
                    onChange={(e) => { cmi.setLibraryCategoryIndex(Number(e.target.value)); }}
                    className="text-[10px] font-mono px-2 py-1 rounded-sm"
                    style={{
                      color: CMI_GREEN, backgroundColor: '#0a0a0a',
                      border: `1px solid ${CMI_GREEN_DIM}`, width: 140,
                      outline: 'none',
                    }}
                  >
                    {cmi.libraryCategories.map((cat, i) => (
                      <option key={cat} value={i}>
                        {cat.toUpperCase()} ({cmi.librarySamples.length === 0 && i === cmi.libraryCategoryIndex ? '...' : i === cmi.libraryCategoryIndex ? cmi.librarySamples.length : ''})
                      </option>
                    ))}
                  </select>
                  {/* Sample selector */}
                  <select
                    value={cmi.librarySampleIndex}
                    onChange={(e) => cmi.loadLibrarySample(Number(e.target.value))}
                    className="text-[10px] font-mono px-2 py-1 rounded-sm flex-1"
                    style={{
                      color: CMI_GREEN, backgroundColor: '#0a0a0a',
                      border: `1px solid ${CMI_GREEN_DIM}`,
                      outline: 'none',
                    }}
                  >
                    <option value={-1}>— SELECT SAMPLE —</option>
                    {cmi.librarySamples.map((s, i) => (
                      <option key={s.file} value={i}>{s.name}</option>
                    ))}
                  </select>
                  {/* Prev/Next buttons */}
                  <button onClick={cmi.prevLibrarySample} className="px-2 py-1 text-[10px] font-mono rounded-sm"
                    style={{ color: CMI_GREEN, border: `1px solid ${CMI_GREEN_DIM}`, background: 'transparent' }}>
                    PREV
                  </button>
                  <button onClick={cmi.nextLibrarySample} className="px-2 py-1 text-[10px] font-mono rounded-sm"
                    style={{ color: CMI_GREEN, border: `1px solid ${CMI_GREEN_DIM}`, background: 'transparent' }}>
                    NEXT
                  </button>
                </div>
                {cmi.libraryLoading && (
                  <div className="text-[9px] font-mono" style={{ color: CMI_GREEN_BRIGHT }}>Loading...</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ════════════ Page 6: CONTROL ════════════ */}
        {cmi.activeTab === 'control' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <Knob value={cmi.volume} min={0} max={255} onChange={(v) => cmi.handleParamChange('volume', v)} label="Volume" size="sm" color={CMI_GREEN} formatValue={fmtInt} />
              <Knob value={cmi.waveSelect} min={0} max={7} onChange={(v) => cmi.handleParamChange('wave_select', v)} label="Wave" size="sm" color={CMI_GREEN} formatValue={fmtWave} />
              <Knob value={cmi.cutoff} min={0} max={255} onChange={(v) => cmi.handleParamChange('filter_cutoff', v)} label="Cutoff" size="sm" color={CMI_GREEN} formatValue={fmtCutoff} />
              <Knob value={cmi.filterTrack} min={0} max={255} onChange={(v) => cmi.handleParamChange('filter_track', v)} label="Key Track" size="sm" color={CMI_GREEN} formatValue={fmtTrack} />
              <Knob value={cmi.attackTime} min={0} max={255} onChange={(v) => cmi.handleParamChange('attack_time', v)} label="Attack" size="sm" color={CMI_GREEN} formatValue={fmtInt} />
              <Knob value={cmi.releaseTime} min={0} max={255} onChange={(v) => cmi.handleParamChange('release_time', v)} label="Release" size="sm" color={CMI_GREEN} formatValue={fmtInt} />
              <Knob value={cmi.envRate} min={0} max={255} onChange={(v) => cmi.handleParamChange('envelope_rate', v)} label="Env Rate" size="sm" color={CMI_GREEN} formatValue={fmtInt} />
            </div>
            <div className="flex gap-3">
              <div className="flex flex-col gap-0.5">
                <div className="text-[9px] font-mono font-bold" style={{ color: CMI_GREEN_DIM }}>ENVELOPE</div>
                <EnvelopeCanvas curve={cmi.envelopeCurve} width={Math.floor(VIS_W / 2)} height={120} />
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="text-[9px] font-mono font-bold" style={{ color: CMI_GREEN_DIM }}>FILTER RESPONSE</div>
                <FilterCanvas cutoff={cmi.cutoff} width={Math.floor(VIS_W / 2)} height={120} />
              </div>
            </div>
          </div>
        )}

        {/* ════════════ Page F: FILTER ════════════ */}
        {cmi.activeTab === 'filter' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <Knob value={cmi.cutoff} min={0} max={255} onChange={(v) => cmi.handleParamChange('filter_cutoff', v)} label="Cutoff" size="sm" color={CMI_GREEN} formatValue={fmtCutoff} />
              <Knob value={cmi.filterTrack} min={0} max={255} onChange={(v) => cmi.handleParamChange('filter_track', v)} label="Key Track" size="sm" color={CMI_GREEN} formatValue={fmtTrack} />
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-[10px] font-mono font-bold" style={{ color: CMI_GREEN }}>
                SSM2045 x2 CASCADED LOWPASS (-24dB/oct)
              </div>
              <FilterCanvas cutoff={cmi.cutoff} width={VIS_W} height={120} />
              <div className="text-[9px] font-mono" style={{ color: CMI_GREEN_DIM }}>
                Cutoff: {formatCutoffHz(cmi.cutoff)}Hz | Max: 14kHz
              </div>
            </div>
          </div>
        )}

        {/* ════════════ Page E: ENVELOPE ════════════ */}
        {cmi.activeTab === 'envelope' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <Knob value={cmi.attackTime} min={0} max={255} onChange={(v) => cmi.handleParamChange('attack_time', v)} label="Attack" size="sm" color={CMI_GREEN} formatValue={fmtInt} />
              <Knob value={cmi.releaseTime} min={0} max={255} onChange={(v) => cmi.handleParamChange('release_time', v)} label="Release" size="sm" color={CMI_GREEN} formatValue={fmtInt} />
              <Knob value={cmi.envRate} min={0} max={255} onChange={(v) => cmi.handleParamChange('envelope_rate', v)} label="Rate" size="sm" color={CMI_GREEN} formatValue={fmtInt} />
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-[10px] font-mono font-bold" style={{ color: CMI_GREEN }}>
                HARDWARE ENVELOPE GENERATOR
              </div>
              <EnvelopeCanvas curve={cmi.envelopeCurve} width={VIS_W} height={120} />
              <div className="text-[9px] font-mono" style={{ color: CMI_GREEN_DIM }}>
                8-bit up/down counter | 6-bit divider chain | PTM6840 timer-driven
              </div>
            </div>
          </div>
        )}
      </div>
    </ScrollLockContainer>
  );
};

export default CMIControls;
