/**
 * DJVocoderControl — Vocoder toggle + mute + carrier type + formant shift for DJ mode.
 *
 * Appears in the DJ toolbar as a performance tool.
 * When active, routes mic through the WASM vocoder and shows the Kraftwerk head.
 * Includes a mic device selector so users can pick their real hardware mic.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useVocoderStore, VOCODER_PRESETS, VOCODER_FX_PRESETS, type VocoderFXPreset } from '@/stores/useVocoderStore';
import { VocoderEngine } from '@/engine/vocoder/VocoderEngine';
import { VocoderAutoTune } from '@/engine/vocoder/VocoderAutoTune';
import { getDJEngineIfActive } from '@/engine/dj/DJEngine';

interface AudioInputDevice {
  deviceId: string;
  label: string;
}

export const DJVocoderControl: React.FC = () => {
  const isActive = useVocoderStore(s => s.isActive);
  const amplitude = useVocoderStore(s => s.amplitude);
  const params = useVocoderStore(s => s.params);
  const presetName = useVocoderStore(s => s.presetName);
  const fxEnabled = useVocoderStore(s => s.fx.enabled);
  const fxPreset = useVocoderStore(s => s.fx.preset);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [duckingEnabled, setDuckingEnabled] = useState(false);
  const [autoTuneEnabled, setAutoTuneEnabled] = useState(false);
  const autoTuneRef = useRef<VocoderAutoTune | null>(null);
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const engineRef = useRef<VocoderEngine | null>(null);

  // Preload vocoder worklet + WASM on mount so toggle doesn't cause audio glitch
  useEffect(() => {
    VocoderEngine.preload();
  }, []);

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

  // Ensure the engine is running (called on first PTT or vocoder toggle)
  const ensureEngine = useCallback(async (): Promise<VocoderEngine | null> => {
    if (engineRef.current) return engineRef.current;
    try {
      setError(null);
      const djEngine = getDJEngineIfActive();
      const destination = djEngine?.mixer.samplerInput;
      const engine = new VocoderEngine(destination);
      await engine.start(selectedDeviceId || undefined);
      engineRef.current = engine;
      // Start muted — push-to-talk mode
      setMuted(true);
      engine.setMuted(true);

      // Start autotune if it was enabled before engine was created
      if (autoTuneEnabled) {
        autoTuneRef.current = new VocoderAutoTune(engine);
        autoTuneRef.current.start();
      }

      // Re-enumerate after permission grant
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const inputs = allDevices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Mic ${d.deviceId.slice(0, 8)}` }));
      setDevices(inputs);
      return engine;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes('Permission') || msg.includes('NotAllowed') ? 'Mic blocked' : 'Failed');
      console.error('[DJVocoderControl]', err);
      return null;
    }
  }, [selectedDeviceId]);

  const handleToggle = useCallback(async () => {
    try {
      setError(null);

      if (!isActive) {
        const engine = await ensureEngine();
        if (!engine) return;
        // Enable vocoder processing (robot voice)
        engine.setVocoderBypass(false);
      } else {
        // Disable vocoder but keep engine alive for clean mic PTT
        engineRef.current?.setVocoderBypass(true);
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

  // Push-to-talk: hold to unmute mic, release to mute (delay tail rings out)
  // Starts engine on first press if not running (clean mic + FX, no vocoder)
  const handlePTTDown = useCallback(async () => {
    let engine = engineRef.current;
    if (!engine) {
      engine = await ensureEngine();
      if (!engine) return;
      if (!isActive) engine.setVocoderBypass(true);
    }
    setMuted(false);
    engine.setMuted(false);
    // Duck music while talking
    if (duckingEnabled) {
      try { getDJEngineIfActive()?.mixer.duck(); } catch { /* ok */ }
    }
  }, [ensureEngine, isActive, duckingEnabled]);

  const handlePTTUp = useCallback(() => {
    if (!engineRef.current) return;
    setMuted(true);
    engineRef.current.setMuted(true);
    // Unduck music
    if (duckingEnabled) {
      try { getDJEngineIfActive()?.mixer.unduck(); } catch { /* ok */ }
    }
  }, [duckingEnabled]);

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

  const handleAutoTuneToggle = useCallback(() => {
    const next = !autoTuneEnabled;
    setAutoTuneEnabled(next);
    if (next && engineRef.current) {
      if (!autoTuneRef.current) {
        autoTuneRef.current = new VocoderAutoTune(engineRef.current);
      }
      autoTuneRef.current.start();
    } else {
      autoTuneRef.current?.stop();
    }
  }, [autoTuneEnabled]);

  const handleFXToggle = useCallback(() => {
    const next = !fxEnabled;
    useVocoderStore.getState().setFXEnabled(next);
    engineRef.current?.applyFX(useVocoderStore.getState().fx);
  }, [fxEnabled]);

  const handleFXPresetChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const preset = e.target.value as VocoderFXPreset;
    useVocoderStore.getState().loadFXPreset(preset);
    engineRef.current?.applyFX(useVocoderStore.getState().fx);
  }, []);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
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

      {/* Push-to-talk: always available — hold to speak, release to let echo ring out */}
      <button
        onPointerDown={handlePTTDown}
        onPointerUp={handlePTTUp}
        onPointerLeave={handlePTTUp}
        className={`
          px-2 py-1 rounded text-[10px] font-bold transition-all select-none touch-none
          ${!muted
            ? 'bg-green-600 text-white shadow-[0_0_8px_rgba(34,197,94,0.4)]'
            : 'bg-dark-bgTertiary hover:bg-dark-bgHover border border-dark-border text-text-muted'
          }
        `}
        title="Hold to talk — release to let echo ring out"
      >
        {!muted ? 'LIVE' : 'TALK'}
      </button>

      {/* Vocoder toggle — switches between clean mic and robot voice */}
      <button
        onClick={handleToggle}
        className={`
          px-2 py-1 rounded text-xs font-bold transition-all relative overflow-hidden
          ${isActive
            ? 'bg-purple-600 hover:bg-purple-700 text-white'
            : 'bg-dark-bgTertiary hover:bg-dark-bgHover border border-dark-border text-text-muted'
          }
        `}
        title={isActive ? 'Switch to clean mic' : 'Enable robot voice'}
      >
        {isActive && !muted && (
          <span
            className="absolute inset-0 bg-purple-400 rounded pointer-events-none"
            style={{ opacity: amplitude * 0.5 }}
          />
        )}
        <span className="relative">VOCODER</span>
      </button>

      {/* Level meter — always visible when engine is running */}
      {engineRef.current && (
        <div
          className="w-8 h-2 bg-dark-bgTertiary rounded-sm overflow-hidden"
          title={`Level: ${Math.round(amplitude * 100)}%`}
        >
          <div
            className={`h-full transition-[width] duration-75 ${isActive ? 'bg-purple-500' : 'bg-green-500'}`}
            style={{ width: `${Math.min(100, (muted ? 0 : amplitude) * 300)}%` }}
          />
        </div>
      )}

      {/* Duck + AutoTune controls — always available */}
      <div className="flex items-center gap-2 border-l border-dark-borderLight pl-1.5 ml-0.5">
        <label className="flex items-center gap-0.5 cursor-pointer" title="Duck music volume while talking">
          <input
            type="checkbox"
            checked={duckingEnabled}
            onChange={() => setDuckingEnabled(!duckingEnabled)}
            className="w-3 h-3 accent-amber-500"
          />
          <span className="text-[9px] text-text-muted">Duck</span>
        </label>
        <label className="flex items-center gap-0.5 cursor-pointer" title="Auto-tune voice to the melody playing on the active deck">
          <input
            type="checkbox"
            checked={autoTuneEnabled}
            onChange={handleAutoTuneToggle}
            className="w-3 h-3 accent-pink-500"
          />
          <span className="text-[9px] text-text-muted">Tune</span>
        </label>
      </div>
      <div className="flex items-center gap-1 border-l border-dark-borderLight pl-1.5 ml-0.5">
        <label className="flex items-center gap-0.5 cursor-pointer" title="Enable mic effects (echo/reverb)">
          <input
            type="checkbox"
            checked={fxEnabled}
            onChange={handleFXToggle}
            className="w-3 h-3 accent-cyan-500"
          />
          <span className="text-[9px] text-text-muted">FX</span>
        </label>
        {fxEnabled && (
          <select
            value={fxPreset}
            onChange={handleFXPresetChange}
            className="px-1 py-0.5 text-[9px] rounded border border-dark-border bg-dark-bgTertiary text-cyan-400 max-w-[90px]"
            title="Effect preset"
          >
            {Object.keys(VOCODER_FX_PRESETS).map(name => (
              <option key={name} value={name}>
                {name === 'none' ? 'Dry' : name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Vocoder-specific controls — only when vocoder is active */}
      {isActive && (
        <>
          <select
            value={presetName || ''}
            onChange={handlePresetChange}
            className="px-1 py-0.5 text-[10px] rounded border border-dark-border bg-dark-bgTertiary text-dark-textSecondary"
            title="Vocoder voice preset"
          >
            {!presetName && <option value="">Custom</option>}
            {VOCODER_PRESETS.map(p => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
          <input
            type="range" min="0.25" max="4.0" step="0.05"
            value={params.formantShift} onChange={handleFormantShift}
            className="w-12 h-1 accent-purple-500"
            title={`Formant: ${params.formantShift.toFixed(2)}x`}
          />
          <input
            type="range" min="0" max="1" step="0.01"
            value={params.wet} onChange={handleWet}
            className="w-12 h-1 accent-purple-500"
            title={`Wet: ${Math.round(params.wet * 100)}%`}
          />
        </>
      )}

      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </div>
  );
};
