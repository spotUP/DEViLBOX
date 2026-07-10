/**
 * MaxTraxControls.tsx — Maximized instrument editor for MaxTrax (MXTX) sample patches.
 *
 * Exposes EVERY DiskSample field (from driver.i:329) and maps to PatchData fields (driver.i:87):
 *
 *   DiskSample +0  u16 Number         → patch_Number (self-identifying patch number)
 *   DiskSample +2  i16 Tune           → patch_Tune   (sample tuning, signed)
 *   DiskSample +4  u16 Volume         → patch_Volume (sample volume 0-64)
 *   DiskSample +6  u16 Octaves        (number of octave levels stored in PCM bank)
 *   DiskSample +8  u32 AttackLength   → samp_AttackSize (first-octave attack PCM bytes)
 *   DiskSample +12 u32 SustainLength  → samp_SustainSize (first-octave sustain PCM bytes)
 *   DiskSample +16 u16 AttackCount    → patch_AttackCount (number of attack envelope segments)
 *   DiskSample +18 u16 ReleaseCount   → patch_ReleaseCount (number of release envelope segments)
 *   Then: (AttackCount + ReleaseCount) × EnvelopeData { u16 Duration, u16 Volume }
 *
 * Live-audio: sample-field edits persist to store+export but cannot hot-update sustained
 * audio yet (no setSampleParam on MaxTraxEngine). canLiveEdit will be false until a
 * future WASM export adds the setter. Edits are always store-authoritative.
 *
 * configRef pattern: sampleRef mirrors the decoded sample and is read inside callbacks.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { useFormatStore } from '@/stores/useFormatStore';
import { decodeMaxTraxSamples } from '@/lib/import/formats/maxtrax/maxtraxFormat';
import { MaxTraxEngine } from '@/engine/maxtrax/MaxTraxEngine';

// ─── Waveform canvas ──────────────────────────────────────────────────────────

const WAVEFORM_HEIGHT = 72;
const WAVEFORM_COLOR = '#4fc3f7'; // decorative accent — light-blue trace like oscilloscope

const WaveformCanvas: React.FC<{ pcm: Uint8Array }> = ({ pcm }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cvs = ref.current;
    if (!cvs) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cvs.clientWidth || 208;
    const h = WAVEFORM_HEIGHT;
    cvs.width = Math.round(w * dpr);
    cvs.height = Math.round(h * dpr);
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // Zero line
    ctx.strokeStyle = 'rgba(128,128,160,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    if (pcm.length > 1) {
      ctx.strokeStyle = WAVEFORM_COLOR;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      for (let i = 0; i < Math.min(pcm.length, w * 2); i++) {
        // pcm is raw signed 8-bit stored as unsigned byte
        const sample = (pcm[i] > 127 ? pcm[i] - 256 : pcm[i]) / 128;
        const x = (i / (pcm.length - 1)) * w;
        const y = (1 - (sample + 1) / 2) * (h - 2) + 1;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, [pcm]);

  return (
    <canvas
      ref={ref}
      className="w-full"
      style={{ height: WAVEFORM_HEIGHT, display: 'block' }}
    />
  );
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface MaxTraxControlsProps {
  sampleIndex: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const MaxTraxControls: React.FC<MaxTraxControlsProps> = ({ sampleIndex }) => {
  const maxTraxData = useFormatStore(s => s.maxTraxData);
  const _maxTraxRev = useFormatStore(s => s.maxTraxRev);
  const mutateMaxTraxSample = useFormatStore(s => s.mutateMaxTraxSample);

  // Decode on every rev bump — the _maxTraxRev subscription forces this component to
  // re-render (and re-decode) whenever a sample mutation bumps the revision counter.
  void _maxTraxRev;
  const samples = maxTraxData ? decodeMaxTraxSamples(maxTraxData) : [];
  const sample = samples[sampleIndex] ?? null;

  // Live-audio capability check (honest — no faking)
  // setSampleParam does not yet exist on MaxTraxEngine; this will be false until a
  // future WASM export adds the setter. Edits are store-authoritative regardless.
  const canLiveEdit =
    MaxTraxEngine.hasInstance() &&
    typeof (MaxTraxEngine.getInstance() as unknown as Record<string, unknown>).setSampleParam === 'function';

  // ── Field mutators ──────────────────────────────────────────────────────────

  const setField = useCallback(
    (field: 'number' | 'tune' | 'volume' | 'octaves' | 'attackLen' | 'sustainLen', value: number) => {
      mutateMaxTraxSample(sampleIndex, { kind: 'field', field, value });
      if (canLiveEdit) {
        // Future: (MaxTraxEngine.getInstance() as any).setSampleParam(sampleIndex, field, value);
      }
    },
    [mutateMaxTraxSample, sampleIndex, canLiveEdit],
  );

  const setEnvField = useCallback(
    (side: 'attack' | 'release', pointIndex: number, field: 'duration' | 'volume', value: number) => {
      mutateMaxTraxSample(sampleIndex, { kind: 'envField', side, pointIndex, field, value });
    },
    [mutateMaxTraxSample, sampleIndex],
  );

  const addEnvPoint = useCallback(
    (side: 'attack' | 'release') => {
      mutateMaxTraxSample(sampleIndex, { kind: 'addEnvPoint', side, duration: 100, volume: 64 });
    },
    [mutateMaxTraxSample, sampleIndex],
  );

  const removeEnvPoint = useCallback(
    (side: 'attack' | 'release', pointIndex: number) => {
      mutateMaxTraxSample(sampleIndex, { kind: 'removeEnvPoint', side, pointIndex });
    },
    [mutateMaxTraxSample, sampleIndex],
  );

  // ── Empty state ─────────────────────────────────────────────────────────────

  if (!sample) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-[10px] font-mono px-2">
        {maxTraxData ? 'No sample at this index.' : 'No MaxTrax file loaded.'}
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-0 overflow-y-auto h-full bg-dark-bgSecondary">

      {/* Waveform (first octave PCM) */}
      <div className="px-2 pt-2 pb-1 border-b border-dark-border">
        <span className="text-[9px] font-mono text-text-muted uppercase tracking-wide">Waveform (First Octave)</span>
        <WaveformCanvas pcm={sample.pcm} />
      </div>

      {/* Header fields */}
      <div className="px-2 pt-2 pb-1 border-b border-dark-border">
        <span className="text-[9px] font-mono text-text-muted uppercase tracking-wide">Patch</span>

        <div className="flex flex-col gap-1 mt-1">

          {/* Number */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-text-secondary">Number</span>
            <input
              type="number"
              min={0}
              max={63}
              value={sample.number}
              onChange={e => setField('number', Number(e.target.value))}
              className="w-14 text-right bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs px-1 py-0.5"
            />
          </div>

          {/* Tune */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-text-secondary">Tune</span>
            <input
              type="number"
              min={-32768}
              max={32767}
              value={sample.tune}
              onChange={e => setField('tune', Number(e.target.value))}
              className="w-14 text-right bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs px-1 py-0.5"
            />
          </div>

          {/* Volume */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-text-secondary">Volume</span>
            <input
              type="number"
              min={0}
              max={64}
              value={sample.volume}
              onChange={e => setField('volume', Number(e.target.value))}
              className="w-14 text-right bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs px-1 py-0.5"
            />
          </div>

          {/* Octaves */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-text-secondary">Octaves</span>
            <input
              type="number"
              min={0}
              max={8}
              value={sample.octaves}
              onChange={e => setField('octaves', Number(e.target.value))}
              className="w-14 text-right bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs px-1 py-0.5"
            />
          </div>

        </div>
      </div>

      {/* PCM lengths */}
      <div className="px-2 pt-2 pb-1 border-b border-dark-border">
        <span className="text-[9px] font-mono text-text-muted uppercase tracking-wide">PCM Lengths (bytes)</span>

        <div className="flex flex-col gap-1 mt-1">

          {/* Attack Length */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-text-secondary">Attack Length</span>
            <input
              type="number"
              min={0}
              max={0xffffffff}
              value={sample.attackLen}
              onChange={e => setField('attackLen', Math.max(0, Number(e.target.value)))}
              className="w-16 text-right bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs px-1 py-0.5"
            />
          </div>

          {/* Sustain Length */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-text-secondary">Sustain Length</span>
            <input
              type="number"
              min={0}
              max={0xffffffff}
              value={sample.sustainLen}
              onChange={e => setField('sustainLen', Math.max(0, Number(e.target.value)))}
              className="w-16 text-right bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs px-1 py-0.5"
            />
          </div>

        </div>
      </div>

      {/* Attack envelope */}
      <div className="px-2 pt-2 pb-1 border-b border-dark-border">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] font-mono text-text-muted uppercase tracking-wide">
            Attack Envelope
          </span>
          <button
            onClick={() => addEnvPoint('attack')}
            className="text-[9px] font-mono text-accent-primary hover:text-accent-highlight px-1"
          >
            + Add
          </button>
        </div>
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[10px] font-mono text-text-secondary">Attack Count</span>
          <span className="ml-1 text-[10px] font-mono text-text-primary">{sample.attackCount}</span>
        </div>

        {sample.attack.map((pt, i) => (
          <div key={i} className="flex items-center gap-1 mt-1">
            <span className="text-[9px] font-mono text-text-muted w-4">{i + 1}</span>
            <input
              type="number"
              min={0}
              max={65535}
              value={pt.duration}
              onChange={e => setEnvField('attack', i, 'duration', Number(e.target.value))}
              className="w-12 text-right bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs px-1 py-0.5"
              title="Duration (ms)"
            />
            <input
              type="number"
              min={0}
              max={65535}
              value={pt.volume}
              onChange={e => setEnvField('attack', i, 'volume', Number(e.target.value))}
              className="w-12 text-right bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs px-1 py-0.5"
              title="Volume"
            />
            <button
              onClick={() => removeEnvPoint('attack', i)}
              className="text-[9px] font-mono text-accent-error hover:text-accent-error/80 px-1"
            >
              X
            </button>
          </div>
        ))}
        {sample.attackCount === 0 && (
          <div className="text-[9px] font-mono text-text-muted mt-1">No attack segments.</div>
        )}
      </div>

      {/* Release envelope */}
      <div className="px-2 pt-2 pb-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] font-mono text-text-muted uppercase tracking-wide">
            Release Envelope
          </span>
          <button
            onClick={() => addEnvPoint('release')}
            className="text-[9px] font-mono text-accent-primary hover:text-accent-highlight px-1"
          >
            + Add
          </button>
        </div>
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[10px] font-mono text-text-secondary">Release Count</span>
          <span className="ml-1 text-[10px] font-mono text-text-primary">{sample.releaseCount}</span>
        </div>

        {sample.release.map((pt, i) => (
          <div key={i} className="flex items-center gap-1 mt-1">
            <span className="text-[9px] font-mono text-text-muted w-4">{i + 1}</span>
            <input
              type="number"
              min={0}
              max={65535}
              value={pt.duration}
              onChange={e => setEnvField('release', i, 'duration', Number(e.target.value))}
              className="w-12 text-right bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs px-1 py-0.5"
              title="Duration (ms)"
            />
            <input
              type="number"
              min={0}
              max={65535}
              value={pt.volume}
              onChange={e => setEnvField('release', i, 'volume', Number(e.target.value))}
              className="w-12 text-right bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs px-1 py-0.5"
              title="Volume"
            />
            <button
              onClick={() => removeEnvPoint('release', i)}
              className="text-[9px] font-mono text-accent-error hover:text-accent-error/80 px-1"
            >
              X
            </button>
          </div>
        ))}
        {sample.releaseCount === 0 && (
          <div className="text-[9px] font-mono text-text-muted mt-1">No release segments.</div>
        )}
      </div>

      {/* Store-only note */}
      {!canLiveEdit && (
        <div className="px-2 py-1 text-[9px] font-mono text-text-muted border-t border-dark-border">
          Store only — live audio update requires WASM sample setter.
        </div>
      )}

    </div>
  );
};
