/**
 * PixiDJVocoderControl — GL-native vocoder toggle + controls for DJ top bar.
 *
 * Mirrors DJVocoderControl.tsx exactly: ROBOT toggle, MIC mute, carrier type,
 * formant shift, wet/dry, and amplitude level meter.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useVocoderStore, type CarrierType } from '@/stores/useVocoderStore';
import { VocoderEngine } from '@/engine/vocoder/VocoderEngine';
import { PixiButton, PixiKnob, PixiLabel } from '../../components';

export const PixiDJVocoderControl: React.FC = () => {
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
    }
  }, [isActive]);

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
                // Background
                g.rect(0, 0, 24, 6);
                g.fill({ color: 0x1a1a2e, alpha: 0.8 });
                // Level bar
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
    </pixiContainer>
  );
};
