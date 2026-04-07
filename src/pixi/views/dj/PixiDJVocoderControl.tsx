/**
 * PixiDJVocoderControl — GL-native vocoder toggle + controls for DJ top bar.
 *
 * Mirrors DJVocoderControl.tsx: ROBOT toggle, MIC mute, carrier type,
 * formant shift, wet/dry, amplitude level meter, plus the recent
 * additions:
 *
 *   - Tune (real autotune)   : real pitch-correction with key + scale
 *   - Melody (carrier follower): legacy "follow active deck melody"
 *
 * Both can be enabled simultaneously.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useVocoderStore, type CarrierType } from '@/stores/useVocoderStore';
import { VocoderEngine } from '@/engine/vocoder/VocoderEngine';
import { VocoderAutoTune } from '@/engine/vocoder/VocoderAutoTune';
import type { AutoTuneScale } from '@/engine/effects/AutoTuneEffect';
import { PixiButton, PixiKnob, PixiLabel } from '../../components';

const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALE_OPTIONS: AutoTuneScale[] = ['major', 'minor', 'chromatic', 'pentatonic', 'blues'];
const SCALE_LABELS: Record<AutoTuneScale, string> = {
  major: 'MAJ', minor: 'MIN', chromatic: 'CHR', pentatonic: 'PNT', blues: 'BLU',
};

export const PixiDJVocoderControl: React.FC = () => {
  const isActive = useVocoderStore(s => s.isActive);
  const amplitude = useVocoderStore(s => s.amplitude);
  const params = useVocoderStore(s => s.params);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  /** Real pitch-correction autotune (YIN + scale snap) on the vocoder output. */
  const [realTuneEnabled, setRealTuneEnabled] = useState(false);
  const [tuneKey, setTuneKey] = useState(0);
  const [tuneScale, setTuneScale] = useState<AutoTuneScale>('major');
  /** Legacy "follow melody" — drives the vocoder carrier from the active deck's pattern data. */
  const [followMelodyEnabled, setFollowMelodyEnabled] = useState(true);
  const followMelodyRef = useRef<VocoderAutoTune | null>(null);
  const engineRef = useRef<VocoderEngine | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      followMelodyRef.current?.stop();
      followMelodyRef.current = null;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleToggle = useCallback(async () => {
    try {
      setError(null);
      if (!isActive) {
        const { getDJEngineIfActive } = await import('@/engine/dj/DJEngine');
        const djEngine = getDJEngineIfActive();
        const destination = djEngine?.mixer.samplerInput;
        const engine = new VocoderEngine(destination);
        await engine.start();
        engineRef.current = engine;
        setMuted(false);
        // Apply persisted toggles
        if (followMelodyEnabled) {
          followMelodyRef.current = new VocoderAutoTune(engine);
          followMelodyRef.current.start();
        }
        if (realTuneEnabled) {
          engine.setRealAutoTuneEnabled(true, {
            key: tuneKey, scale: tuneScale, strength: 1.0, speed: 0.7,
          });
        }
      } else {
        followMelodyRef.current?.stop();
        followMelodyRef.current = null;
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
    }
  }, [isActive, followMelodyEnabled, realTuneEnabled, tuneKey, tuneScale]);

  const handleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    engineRef.current?.setMuted(next);
  }, [muted]);

  const handleCarrier = useCallback((type: CarrierType) => {
    engineRef.current?.setCarrierType(type);
  }, []);

  const handleFormant = useCallback((v: number) => {
    engineRef.current?.setFormantShift(v);
  }, []);

  const handleWet = useCallback((v: number) => {
    engineRef.current?.setWet(v);
  }, []);

  const handleRealTuneToggle = useCallback(() => {
    const next = !realTuneEnabled;
    setRealTuneEnabled(next);
    engineRef.current?.setRealAutoTuneEnabled(next, {
      key: tuneKey, scale: tuneScale, strength: 1.0, speed: 0.7,
    });
  }, [realTuneEnabled, tuneKey, tuneScale]);

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

  /** Cycle to next key on click. */
  const handleKeyCycle = useCallback(() => {
    const next = (tuneKey + 1) % 12;
    setTuneKey(next);
    engineRef.current?.setAutoTuneKey(next);
  }, [tuneKey]);

  /** Cycle to next scale on click. */
  const handleScaleCycle = useCallback(() => {
    const i = SCALE_OPTIONS.indexOf(tuneScale);
    const next = SCALE_OPTIONS[(i + 1) % SCALE_OPTIONS.length];
    setTuneScale(next);
    engineRef.current?.setAutoTuneScale(next);
  }, [tuneScale]);

  return (
    <pixiContainer layout={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
      {/* ROBOT toggle */}
      <PixiButton
        label={error ?? 'ROBOT'}
        variant={isActive ? 'ft2' : 'ghost'}
        color={isActive ? 'purple' : undefined}
        size="sm"
        active={isActive}
        onClick={handleToggle}
      />

      {isActive && (
        <>
          {/* Mic mute */}
          <PixiButton
            label={muted ? 'MUTED' : 'MIC'}
            variant={muted ? 'ft2' : 'ghost'}
            color={muted ? 'red' : undefined}
            size="sm"
            active={muted}
            onClick={handleMute}
          />

          {/* Carrier type buttons */}
          {(['chord', 'saw', 'square', 'noise'] as CarrierType[]).map((type) => (
            <PixiButton
              key={type}
              label={type === 'chord' ? 'Chd' : type === 'square' ? 'Sqr' : type === 'noise' ? 'Nse' : 'Saw'}
              variant={params.carrierType === type ? 'ft2' : 'ghost'}
              color={params.carrierType === type ? 'purple' : undefined}
              size="sm"
              active={params.carrierType === type}
              onClick={() => handleCarrier(type)}
            />
          ))}

          {/* Formant shift knob */}
          <PixiKnob
            value={params.formantShift}
            min={0.25}
            max={4.0}
            defaultValue={1.0}
            size="sm"
            label="FRMT"
            color={0xcc88ff}
            onChange={handleFormant}
          />

          {/* Wet/dry knob */}
          <PixiKnob
            value={params.wet}
            min={0}
            max={1}
            defaultValue={1}
            size="sm"
            label="WET"
            color={0xcc88ff}
            onChange={handleWet}
          />

          {/* Amplitude level indicator (purple bar) */}
          <pixiContainer layout={{ flexDirection: 'column', gap: 1, alignItems: 'center' }}>
            <PixiLabel text="LVL" size="xs" color="textMuted" />
            <pixiGraphics
              draw={(g) => {
                g.clear();
                g.rect(0, 0, 24, 6);
                g.fill({ color: 0x1a1a2e, alpha: 0.8 });
                const w = Math.min(24, (muted ? 0 : amplitude) * 72);
                if (w > 0) {
                  g.rect(0, 0, w, 6);
                  g.fill({ color: 0xaa44ff, alpha: 0.9 });
                }
              }}
              layout={{ width: 24, height: 6 }}
            />
          </pixiContainer>
        </>
      )}

      {/* Tune (real autotune) + key/scale cycle buttons — always available */}
      <PixiButton
        label="TUNE"
        variant={realTuneEnabled ? 'ft2' : 'ghost'}
        color={realTuneEnabled ? 'purple' : undefined}
        size="sm"
        active={realTuneEnabled}
        onClick={handleRealTuneToggle}
      />
      {realTuneEnabled && (
        <>
          <PixiButton
            label={KEY_NAMES[tuneKey]}
            variant="ghost"
            size="sm"
            onClick={handleKeyCycle}
          />
          <PixiButton
            label={SCALE_LABELS[tuneScale]}
            variant="ghost"
            size="sm"
            onClick={handleScaleCycle}
          />
        </>
      )}

      {/* Melody (legacy carrier follower) */}
      <PixiButton
        label="MEL"
        variant={followMelodyEnabled ? 'ft2' : 'ghost'}
        color={followMelodyEnabled ? 'purple' : undefined}
        size="sm"
        active={followMelodyEnabled}
        onClick={handleFollowMelodyToggle}
      />
    </pixiContainer>
  );
};
