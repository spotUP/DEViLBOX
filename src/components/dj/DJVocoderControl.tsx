/**
 * DJVocoderControl — Vocoder toggle + mute + carrier type + formant shift for DJ mode.
 *
 * Appears in the DJ toolbar as a performance tool.
 * When active, routes mic through the WASM vocoder and shows the Kraftwerk head.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useVocoderStore, type CarrierType } from '@/stores/useVocoderStore';
import { VocoderEngine } from '@/engine/vocoder/VocoderEngine';

export const DJVocoderControl: React.FC = () => {
  const isActive = useVocoderStore(s => s.isActive);
  const amplitude = useVocoderStore(s => s.amplitude);
  const params = useVocoderStore(s => s.params);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const engineRef = useRef<VocoderEngine | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleToggle = useCallback(async () => {
    try {
      setError(null);

      if (!isActive) {
        // Route through DJ mixer so vocoder goes through limiter + master FX
        const { getDJEngineIfActive } = await import('@/engine/dj/DJEngine');
        const djEngine = getDJEngineIfActive();
        const destination = djEngine?.mixer.samplerInput;
        const engine = new VocoderEngine(destination);
        await engine.start();
        engineRef.current = engine;
        setMuted(false);
      } else {
        engineRef.current?.stop();
        engineRef.current = null;
        setMuted(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        setError('Mic blocked');
      } else {
        setError('Failed');
      }
      console.error('[DJVocoderControl]', err);
    }
  }, [isActive]);

  const handleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    engineRef.current?.setMuted(next);
  }, [muted]);

  const handleCarrierType = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const type = e.target.value as CarrierType;
    engineRef.current?.setCarrierType(type);
  }, []);

  const handleFormantShift = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const shift = parseFloat(e.target.value);
    engineRef.current?.setFormantShift(shift);
  }, []);

  const handleWet = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const wet = parseFloat(e.target.value);
    engineRef.current?.setWet(wet);
  }, []);

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={handleToggle}
        className={`
          px-2 py-1 rounded text-xs font-bold transition-all relative overflow-hidden
          ${isActive
            ? 'bg-purple-600 hover:bg-purple-700 text-white'
            : 'bg-dark-bgTertiary hover:bg-dark-bgHover border border-dark-border text-text-muted'
          }
        `}
        title={isActive ? 'Disable vocoder' : 'Enable robot voice (vocoder + mic)'}
      >
        {isActive && (
          <span
            className="absolute inset-0 bg-purple-400 rounded pointer-events-none"
            style={{ opacity: muted ? 0 : amplitude * 0.5 }}
          />
        )}
        <span className="relative">ROBOT</span>
      </button>

      {isActive && (
        <>
          {/* Mic mute button */}
          <button
            onClick={handleMute}
            className={`
              px-1.5 py-1 rounded text-[10px] font-bold transition-all
              ${muted
                ? 'bg-red-700 hover:bg-red-600 text-white'
                : 'bg-dark-bgTertiary hover:bg-dark-bgHover border border-dark-border text-text-muted'
              }
            `}
            title={muted ? 'Unmute mic' : 'Mute mic'}
          >
            {muted ? 'MUTED' : 'MIC'}
          </button>

          {/* Carrier type selector */}
          <select
            value={params.carrierType}
            onChange={handleCarrierType}
            className="px-1 py-0.5 text-[10px] rounded border border-dark-border bg-dark-bgTertiary text-dark-textSecondary"
            title="Carrier waveform"
          >
            <option value="chord">Chord</option>
            <option value="saw">Saw</option>
            <option value="square">Square</option>
            <option value="noise">Noise</option>
          </select>

          {/* Formant shift slider */}
          <input
            type="range"
            min="0.25"
            max="4.0"
            step="0.05"
            value={params.formantShift}
            onChange={handleFormantShift}
            className="w-12 h-1 accent-purple-500"
            title={`Formant: ${params.formantShift.toFixed(2)}x (${params.formantShift < 1 ? 'deeper' : params.formantShift > 1 ? 'higher' : 'normal'})`}
          />

          {/* Wet/dry slider */}
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={params.wet}
            onChange={handleWet}
            className="w-12 h-1 accent-purple-500"
            title={`Wet: ${Math.round(params.wet * 100)}%`}
          />

          {/* Small level meter */}
          <div
            className="w-8 h-2 bg-dark-bgTertiary rounded-sm overflow-hidden"
            title={`Level: ${Math.round(amplitude * 100)}%`}
          >
            <div
              className="h-full bg-purple-500 transition-[width] duration-75"
              style={{ width: `${Math.min(100, (muted ? 0 : amplitude) * 300)}%` }}
            />
          </div>
        </>
      )}

      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </div>
  );
};
