/**
 * DJVocoderControl — Vocoder toggle + mute + carrier type + formant shift for DJ mode.
 *
 * Appears in the DJ toolbar as a performance tool.
 * When active, routes mic through the WASM vocoder and shows the Kraftwerk head.
 * Includes a mic device selector so users can pick their real hardware mic.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useVocoderStore, VOCODER_PRESETS } from '@/stores/useVocoderStore';
import { VocoderEngine } from '@/engine/vocoder/VocoderEngine';

interface AudioInputDevice {
  deviceId: string;
  label: string;
}

export const DJVocoderControl: React.FC = () => {
  const isActive = useVocoderStore(s => s.isActive);
  const amplitude = useVocoderStore(s => s.amplitude);
  const params = useVocoderStore(s => s.params);
  const presetName = useVocoderStore(s => s.presetName);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const engineRef = useRef<VocoderEngine | null>(null);

  // Enumerate audio input devices on mount and when devices change
  useEffect(() => {
    const enumerate = async () => {
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const inputs = allDevices
          .filter(d => d.kind === 'audioinput')
          .map(d => ({
            deviceId: d.deviceId,
            label: d.label || `Mic ${d.deviceId.slice(0, 8)}`,
          }));
        setDevices(inputs);
        // Auto-select first real mic (skip virtual devices like BlackHole)
        if (!selectedDeviceId && inputs.length > 0) {
          const real = inputs.find(d =>
            !d.label.toLowerCase().includes('blackhole') &&
            !d.label.toLowerCase().includes('virtual') &&
            !d.label.toLowerCase().includes('loopback')
          );
          setSelectedDeviceId((real || inputs[0]).deviceId);
        }
      } catch {
        // Permission not yet granted — labels will be empty
      }
    };
    enumerate();
    navigator.mediaDevices?.addEventListener('devicechange', enumerate);
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', enumerate);
    };
  }, [selectedDeviceId]);

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
        await engine.start(selectedDeviceId || undefined);
        engineRef.current = engine;
        setMuted(false);

        // Re-enumerate after permission grant (labels become available)
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const inputs = allDevices
          .filter(d => d.kind === 'audioinput')
          .map(d => ({
            deviceId: d.deviceId,
            label: d.label || `Mic ${d.deviceId.slice(0, 8)}`,
          }));
        setDevices(inputs);
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
  }, [isActive, selectedDeviceId]);

  const handleDeviceChange = useCallback(async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const deviceId = e.target.value;
    setSelectedDeviceId(deviceId);
    // If already active, restart with new device
    if (engineRef.current?.isActive) {
      engineRef.current.stop();
      try {
        const { getDJEngineIfActive } = await import('@/engine/dj/DJEngine');
        const djEngine = getDJEngineIfActive();
        const destination = djEngine?.mixer.samplerInput;
        const engine = new VocoderEngine(destination);
        await engine.start(deviceId || undefined);
        engineRef.current = engine;
      } catch (err) {
        console.error('[DJVocoderControl] Device switch failed:', err);
        setError('Switch failed');
      }
    }
  }, []);

  const handleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    engineRef.current?.setMuted(next);
  }, [muted]);

  const handleFormantShift = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const shift = parseFloat(e.target.value);
    engineRef.current?.setFormantShift(shift);
  }, []);

  const handleWet = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const wet = parseFloat(e.target.value);
    engineRef.current?.setWet(wet);
  }, []);

  const handlePresetChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    engineRef.current?.loadPreset(name);
  }, []);

  return (
    <div className="flex items-center gap-1.5">
      {/* Mic device selector (always visible so user can pick before activating) */}
      {devices.length > 1 && (
        <select
          value={selectedDeviceId}
          onChange={handleDeviceChange}
          className="px-1 py-0.5 text-[10px] rounded border border-dark-border bg-dark-bgTertiary text-dark-textSecondary max-w-[120px] truncate"
          title="Select microphone input"
        >
          {devices.map(d => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      )}

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

          {/* Preset selector */}
          <select
            value={presetName || ''}
            onChange={handlePresetChange}
            className="px-1 py-0.5 text-[10px] rounded border border-dark-border bg-dark-bgTertiary text-dark-textSecondary"
            title="Vocoder preset"
          >
            {!presetName && <option value="">Custom</option>}
            {VOCODER_PRESETS.map(p => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
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
