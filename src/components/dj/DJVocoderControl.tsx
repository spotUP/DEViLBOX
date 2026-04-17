/**
 * DJVocoderControl — Vocoder toggle + mute + carrier type + formant shift for DJ mode.
 *
 * Toolbar shows: mic selector, TALK button, VOCODER button.
 * All settings (Duck, Tune, Melody, FX, presets, sliders) are in a dropdown panel.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Settings } from 'lucide-react';
import { useVocoderStore, VOCODER_PRESETS, VOCODER_FX_PRESETS, type VocoderFXPreset } from '@/stores/useVocoderStore';
import { VocoderEngine, setActiveVocoderEngine } from '@/engine/vocoder/VocoderEngine';
import { VocoderAutoTune } from '@/engine/vocoder/VocoderAutoTune';
import type { AutoTuneScale } from '@/engine/effects/AutoTuneEffect';
import { getDJEngineIfActive } from '@/engine/dj/DJEngine';
import { registerPTTHandlers, unregisterPTTHandlers } from '@/hooks/useGlobalPTT';
import { CustomSelect } from '@components/common/CustomSelect';

const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALE_OPTIONS: AutoTuneScale[] = ['major', 'minor', 'chromatic', 'pentatonic', 'blues'];

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
  const globalPTT = useVocoderStore(s => s.pttActive);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [duckingEnabled, setDuckingEnabled] = useState(true);
  const [realTuneEnabled, setRealTuneEnabled] = useState(false);
  const [tuneKey, setTuneKey] = useState(0);
  const [tuneScale, setTuneScale] = useState<AutoTuneScale>('major');
  const [followMelodyEnabled, setFollowMelodyEnabled] = useState(true);
  const followMelodyRef = useRef<VocoderAutoTune | null>(null);
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const engineRef = useRef<VocoderEngine | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const gearRef = useRef<HTMLButtonElement>(null);
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });

  // Close panel on click outside (exclude the gear button itself and portaled dropdowns)
  useEffect(() => {
    if (!showPanel) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (gearRef.current?.contains(target)) return; // gear toggles via its own handler
      if (panelRef.current?.contains(target)) return; // click inside panel
      if (target?.closest?.('[data-context-menu]')) return; // CustomSelect dropdown (portaled)
      setShowPanel(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [showPanel]);

  // Preload vocoder worklet + WASM on mount
  useEffect(() => {
    VocoderEngine.preload();
    return () => unregisterPTTHandlers();
  }, []);

  // Enumerate audio input devices
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
        if (!selectedDeviceId && inputs.length > 0) {
          const real = inputs.find(d =>
            !d.label.toLowerCase().includes('blackhole') &&
            !d.label.toLowerCase().includes('virtual') &&
            !d.label.toLowerCase().includes('loopback')
          );
          setSelectedDeviceId((real || inputs[0]).deviceId);
        }
      } catch { /* Permission not yet granted */ }
    };
    enumerate();
    navigator.mediaDevices?.addEventListener('devicechange', enumerate);
    return () => { navigator.mediaDevices?.removeEventListener('devicechange', enumerate); };
  }, [selectedDeviceId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
      setActiveVocoderEngine(null);
    };
  }, []);

  // Stable refs for ensureEngine closure — avoids stale closures in PTT/toggle handlers
  const selectedDeviceRef = useRef(selectedDeviceId);
  const followMelodyEnabledRef = useRef(followMelodyEnabled);
  const realTuneEnabledRef = useRef(realTuneEnabled);
  const tuneKeyRef = useRef(tuneKey);
  const tuneScaleRef = useRef(tuneScale);
  useEffect(() => { selectedDeviceRef.current = selectedDeviceId; }, [selectedDeviceId]);
  useEffect(() => { followMelodyEnabledRef.current = followMelodyEnabled; }, [followMelodyEnabled]);
  useEffect(() => { realTuneEnabledRef.current = realTuneEnabled; }, [realTuneEnabled]);
  useEffect(() => { tuneKeyRef.current = tuneKey; }, [tuneKey]);
  useEffect(() => { tuneScaleRef.current = tuneScale; }, [tuneScale]);

  const ensureEngine = useCallback(async (): Promise<VocoderEngine | null> => {
    if (engineRef.current) return engineRef.current;
    try {
      setError(null);
      const djEngine = getDJEngineIfActive();
      const destination = djEngine?.mixer.samplerInput;
      const engine = new VocoderEngine(destination);
      await engine.start(selectedDeviceRef.current || undefined);
      engineRef.current = engine;
      setActiveVocoderEngine(engine);
      setMuted(true);
      engine.setMuted(true);
      // Leave the mic track ENABLED at engine creation. outputGain=0 already
      // silences any audible output, and rapid enable/disable cycling during
      // the first PTT press (engine.start sets enabled=true, then we set
      // false, then handlePTTDown sets true again within the same async tick)
      // can leave the macOS getUserMedia pipeline stuck producing silence
      // until a forced micPreamp reconnect (e.g. manual Vocoder toggle)
      // kicks it back to life. setMicActive(false) is still used on PTT
      // release to stop ambient bleed into FX tails.
      if (followMelodyEnabledRef.current) {
        followMelodyRef.current = new VocoderAutoTune(engine);
        followMelodyRef.current.start();
      }
      if (realTuneEnabledRef.current) {
        engine.setRealAutoTuneEnabled(true, {
          key: tuneKeyRef.current, scale: tuneScaleRef.current, strength: 1.0, speed: 0.7,
        });
      }
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
  }, []); // Stable — reads refs, not state

  const handleToggle = useCallback(async () => {
    try {
      setError(null);
      if (!isActive) {
        const engine = await ensureEngine();
        if (!engine) return;
        engine.setVocoderBypass(false);
        useVocoderStore.getState().setActive(true);
      } else {
        engineRef.current?.setVocoderBypass(true);
        useVocoderStore.getState().setActive(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes('Permission') || msg.includes('NotAllowed') ? 'Mic blocked' : 'Failed');
      console.error('[DJVocoderControl]', err);
    }
  }, [isActive, ensureEngine]);

  const handleDeviceChange = useCallback(async (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    if (!engineRef.current?.isActive) return;

    // Snapshot state from the old engine so the new one inherits it.
    // Without this, engine.start() leaves the new engine UNMUTED and with
    // the mic track ENABLED — so if the user is not holding PTT, the fresh
    // engine pipes amplified mic noise + FX tail straight to the output.
    const oldEngine = engineRef.current;
    const wasBypassed = oldEngine.isBypassed;
    const pttIsActive = useVocoderStore.getState().pttActive;

    engineRef.current = null; // Prevent stale use during switch
    setActiveVocoderEngine(null);
    oldEngine.dispose();
    try {
      const djEngine = getDJEngineIfActive();
      const destination = djEngine?.mixer.samplerInput;
      const engine = new VocoderEngine(destination);
      await engine.start(deviceId || undefined);
      engine.setVocoderBypass(wasBypassed);
      // Match PTT state. Leave the mic track enabled (from engine.start) and
      // let outputGain gate audibility — disabling + re-enabling the track
      // in the same async tick as a follow-up PTT press can leave the macOS
      // mic pipeline returning silence.
      engine.setMuted(!pttIsActive);
      engineRef.current = engine;
      setActiveVocoderEngine(engine);
    } catch (err) {
      console.error('[DJVocoderControl] Device switch failed:', err);
      setError('Switch failed');
      // Engine is gone — user must re-toggle vocoder
    }
  }, []);

  const pttInProgressRef = useRef(false);

  const handlePTTDown = useCallback(async () => {
    if (pttInProgressRef.current) return; // Already active — prevent double-fire
    pttInProgressRef.current = true;

    // Set store PTT immediately (sync) so isVocoderTalking() works for joystick routing
    useVocoderStore.getState().setPTT(true);

    let engine = engineRef.current;
    if (!engine) {
      engine = await ensureEngine();
      if (!engine) {
        pttInProgressRef.current = false;
        useVocoderStore.getState().setPTT(false);
        return;
      }
    }
    // Guard: if PTT was released during async engine init, don't unmute
    if (!useVocoderStore.getState().pttActive) {
      pttInProgressRef.current = false;
      return;
    }

    if (!isActive || engine.isBypassed) {
      engine.setVocoderBypass(false);
      useVocoderStore.getState().setActive(true);
    }
    setMuted(false);
    engine.setMicActive(true);
    engine.setMuted(false);
    if (duckingEnabled) {
      try { getDJEngineIfActive()?.mixer.duck(); } catch { /* ok */ }
    }
  }, [ensureEngine, isActive, duckingEnabled]);

  const handlePTTUp = useCallback(() => {
    pttInProgressRef.current = false;
    useVocoderStore.getState().setPTT(false);
    if (!engineRef.current) return;
    setMuted(true);
    engineRef.current.setMuted(true);
    // Cut the mic track so the worklet stops being fed by ambient noise —
    // prevents the FX chain (reverb/delay) from sustaining continuous static.
    engineRef.current.setMicActive(false);
    if (duckingEnabled) {
      try { getDJEngineIfActive()?.mixer.unduck(); } catch { /* ok */ }
    }
  }, [duckingEnabled]);

  useEffect(() => {
    registerPTTHandlers(handlePTTDown, handlePTTUp);
  }, [handlePTTDown, handlePTTUp]);

  // Safety: release PTT on window blur (alt-tab while holding)
  useEffect(() => {
    const handleBlur = () => {
      if (useVocoderStore.getState().pttActive) {
        handlePTTUp();
      }
    };
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [handlePTTUp]);

  const handleFormantShift = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const shift = parseFloat(e.target.value);
    useVocoderStore.getState().setParam('formantShift', shift);
    engineRef.current?.setFormantShift(shift);
  }, []);

  const handleWet = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const wet = parseFloat(e.target.value);
    useVocoderStore.getState().setParam('wet', wet);
    engineRef.current?.setWet(wet);
  }, []);

  const handlePresetChange = useCallback((name: string) => {
    if (engineRef.current) {
      engineRef.current.loadPreset(name);
    } else {
      useVocoderStore.getState().loadPreset(name);
    }
  }, []);

  const handleFollowMelodyToggle = useCallback(() => {
    const next = !followMelodyEnabled;
    setFollowMelodyEnabled(next);
    if (next && engineRef.current) {
      if (!followMelodyRef.current) {
        followMelodyRef.current = new VocoderAutoTune(engineRef.current);
      }
      followMelodyRef.current.start();
    } else {
      followMelodyRef.current?.stop();
    }
  }, [followMelodyEnabled]);

  const handleRealTuneToggle = useCallback(() => {
    const next = !realTuneEnabled;
    setRealTuneEnabled(next);
    engineRef.current?.setRealAutoTuneEnabled(next, {
      key: tuneKey, scale: tuneScale, strength: 1.0, speed: 0.7,
    });
  }, [realTuneEnabled, tuneKey, tuneScale]);

  const handleTuneKeyChange = useCallback((v: string) => {
    const k = parseInt(v, 10);
    setTuneKey(k);
    engineRef.current?.setAutoTuneKey(k);
  }, []);

  const handleTuneScaleChange = useCallback((v: string) => {
    const s = v as AutoTuneScale;
    setTuneScale(s);
    engineRef.current?.setAutoTuneScale(s);
  }, []);

  const handleFXToggle = useCallback(() => {
    const next = !fxEnabled;
    useVocoderStore.getState().setFXEnabled(next);
    engineRef.current?.applyFX(useVocoderStore.getState().fx);
  }, [fxEnabled]);

  const handleFXPresetChange = useCallback((v: string) => {
    const preset = v as VocoderFXPreset;
    useVocoderStore.getState().loadFXPreset(preset);
    engineRef.current?.applyFX(useVocoderStore.getState().fx);
  }, []);

  // Count active features for badge
  const activeFeatureCount = [duckingEnabled, realTuneEnabled, followMelodyEnabled, fxEnabled].filter(Boolean).length;

  return (
    <div className="relative flex items-center gap-1">
      {/* TALK button — always visible for performance */}
      <button
        onPointerDown={handlePTTDown}
        onPointerUp={handlePTTUp}
        onPointerLeave={handlePTTUp}
        onPointerCancel={handlePTTUp}
        onContextMenu={(e) => e.preventDefault()}
        className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold border transition-all select-none touch-none
          ${!muted || globalPTT
            ? 'border-green-500 bg-green-600 text-white shadow-[0_0_8px_rgba(34,197,94,0.4)]'
            : 'border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
          }`}
        title="Hold to talk (or press Space) — release to let echo ring out"
      >
        TALK
      </button>

      {/* VOCODER toggle — always visible */}
      <button
        onClick={handleToggle}
        className={`relative overflow-hidden px-3 py-1.5 rounded-md text-xs font-mono font-bold border transition-all
          ${isActive
            ? 'border-purple-500 bg-purple-600 text-white hover:bg-purple-700'
            : 'border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
          }`}
        title={isActive ? 'Switch to clean mic' : 'Enable robot voice'}
      >
        {isActive && !muted && (
          <span
            className="absolute inset-0 bg-purple-400 rounded-md pointer-events-none"
            style={{ opacity: amplitude * 0.5 }}
          />
        )}
        <span className="relative">Vocoder</span>
      </button>

      {/* Settings button — opens dropdown with all vocoder settings */}
      <button
        ref={gearRef}
        onClick={(e) => {
          e.stopPropagation();
          if (!showPanel && gearRef.current) {
            const rect = gearRef.current.getBoundingClientRect();
            setPanelPos({
              top: rect.bottom + 4,
              right: Math.max(0, window.innerWidth - rect.right),
            });
          }
          setShowPanel(v => !v);
        }}
        className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-bold border transition-all ${
          showPanel
            ? 'border-accent-primary bg-accent-primary/20 text-accent-primary'
            : 'border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
        }`}
        title="Voice settings — mic, vocoder, autotune, mic FX"
      >
        <Settings size={12} />
        <span>Voice</span>
        {activeFeatureCount > 0 && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-accent-primary text-[7px] font-bold text-dark-bg flex items-center justify-center">
            {activeFeatureCount}
          </span>
        )}
      </button>

      {error && <span className="text-[10px] text-red-400">{error}</span>}

      {/* ── Settings dropdown panel — portaled to escape overflow:hidden ── */}
      {showPanel && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: panelPos.top, right: panelPos.right }}
          className="z-[99991] w-72 bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl p-3 space-y-3 text-xs font-mono"
        >
          {/* Mic selector */}
          {devices.length > 0 && (
            <div>
              <div className="text-[9px] text-text-muted uppercase tracking-wider mb-1">Microphone</div>
              <CustomSelect
                value={selectedDeviceId}
                onChange={handleDeviceChange}
                options={devices.map(d => ({ value: d.deviceId, label: d.label }))}
                className="w-full px-2 py-1 text-xs rounded border border-dark-border bg-dark-bg text-text-primary"
                title="Select microphone input"
                zIndex={99992}
              />
            </div>
          )}

          {/* Level meter */}
          {engineRef.current && (
            <div>
              <div className="text-[9px] text-text-muted uppercase tracking-wider mb-1">Level</div>
              <div className="w-full h-2 bg-dark-bgTertiary rounded-sm overflow-hidden">
                <div
                  className={`h-full transition-[width] duration-75 ${isActive ? 'bg-purple-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(100, (muted ? 0 : amplitude) * 300)}%` }}
                />
              </div>
            </div>
          )}

          {/* Toggles row */}
          <div>
            <div className="text-[9px] text-text-muted uppercase tracking-wider mb-1.5">Features</div>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="flex items-center gap-1.5 cursor-pointer" title="Duck music volume while talking">
                <input type="checkbox" checked={duckingEnabled} onChange={() => setDuckingEnabled(!duckingEnabled)} className="w-3 h-3 accent-amber-500" />
                <span className="text-text-secondary">Duck music</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer" title="Follow melody from active deck">
                <input type="checkbox" checked={followMelodyEnabled} onChange={handleFollowMelodyToggle} className="w-3 h-3 accent-pink-500" />
                <span className="text-text-secondary">Melody</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer" title="Pitch-correction autotune">
                <input type="checkbox" checked={realTuneEnabled} onChange={handleRealTuneToggle} className="w-3 h-3 accent-pink-500" />
                <span className="text-text-secondary">Autotune</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer" title="Mic effects (echo/reverb)">
                <input type="checkbox" checked={fxEnabled} onChange={handleFXToggle} className="w-3 h-3 accent-cyan-500" />
                <span className="text-text-secondary">Mic FX</span>
              </label>
            </div>
          </div>

          {/* Autotune key/scale */}
          {realTuneEnabled && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-text-muted">Key:</span>
              <CustomSelect
                value={String(tuneKey)}
                onChange={handleTuneKeyChange}
                options={KEY_NAMES.map((name, i) => ({ value: String(i), label: name }))}
                className="px-1.5 py-0.5 text-[10px] rounded border border-dark-border bg-dark-bg text-pink-400 w-14"
                zIndex={99992}
              />
              <CustomSelect
                value={tuneScale}
                onChange={handleTuneScaleChange}
                options={SCALE_OPTIONS.map((s) => ({ value: s, label: s }))}
                className="px-1.5 py-0.5 text-[10px] rounded border border-dark-border bg-dark-bg text-pink-400 flex-1"
                zIndex={99992}
              />
            </div>
          )}

          {/* FX preset selector */}
          {fxEnabled && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-text-muted">FX:</span>
              <CustomSelect
                value={fxPreset}
                onChange={handleFXPresetChange}
                options={Object.keys(VOCODER_FX_PRESETS).map(name => ({
                  value: name,
                  label: name === 'none' ? 'Dry' : name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
                }))}
                className="flex-1 px-1.5 py-1 text-xs rounded border border-dark-border bg-dark-bg text-cyan-400"
                zIndex={99992}
              />
            </div>
          )}

          {/* Vocoder preset + sliders */}
          {isActive && (
            <div className="space-y-2 border-t border-dark-border pt-2">
              <div className="text-[9px] text-text-muted uppercase tracking-wider">Vocoder</div>
              <CustomSelect
                value={presetName || ''}
                onChange={handlePresetChange}
                options={[
                  ...(!presetName ? [{ value: '', label: 'Custom' }] : []),
                  ...VOCODER_PRESETS.map(p => ({ value: p.name, label: p.name })),
                ]}
                className="w-full px-2 py-1 text-xs rounded border border-dark-border bg-dark-bg text-text-primary"
                title="Vocoder voice preset"
                zIndex={99992}
              />
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-text-muted w-14">Formant</span>
                <input
                  type="range" min="0.25" max="4.0" step="0.05"
                  value={params.formantShift} onChange={handleFormantShift}
                  className="flex-1 h-1 accent-purple-500"
                />
                <span className="text-[9px] text-text-muted w-8 text-right">{params.formantShift.toFixed(2)}x</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-text-muted w-14">Wet</span>
                <input
                  type="range" min="0" max="1" step="0.01"
                  value={params.wet} onChange={handleWet}
                  className="flex-1 h-1 accent-purple-500"
                />
                <span className="text-[9px] text-text-muted w-8 text-right">{Math.round(params.wet * 100)}%</span>
              </div>
            </div>
          )}
        </div>
      , document.body)}
    </div>
  );
};
