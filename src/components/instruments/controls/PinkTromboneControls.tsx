import React, { useRef, useEffect, useCallback } from 'react';
import type { PinkTromboneConfig } from '@engine/pinktrombone/PinkTromboneSynth';
import { PINK_TROMBONE_PRESETS } from '@engine/pinktrombone/PinkTromboneSynth';
import { PinkTromboneSynth } from '@engine/pinktrombone/PinkTromboneSynth';
import { Knob } from '@components/controls/Knob';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { ScrollLockContainer } from '@components/ui/ScrollLockContainer';

interface PinkTromboneControlsProps {
  config: PinkTromboneConfig;
  onChange: (updates: Partial<PinkTromboneConfig>) => void;
}

export const PinkTromboneControls: React.FC<PinkTromboneControlsProps> = ({
  config,
  onChange,
}) => {
  // Use ref to prevent stale closures — CRITICAL for knob handling
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const { accent: accentColor, knob: knobColor, panelBg, panelStyle } = useInstrumentColors('#ff6699');

  /** Push config updates to both the store AND the live synth */
  const pushConfig = useCallback((updates: Partial<PinkTromboneConfig>) => {
    onChange(updates);
    // Also push to running synth for immediate audible feedback
    const synth = PinkTromboneSynth.getActiveInstance();
    if (synth) synth.applyConfig(updates);
  }, [onChange]);

  const updateParam = useCallback((key: keyof PinkTromboneConfig, value: number) => {
    pushConfig({ ...configRef.current, [key]: value });
  }, [pushConfig]);

  const handlePresetChange = useCallback((presetName: string) => {
    const preset = PINK_TROMBONE_PRESETS[presetName];
    if (preset) {
      pushConfig({ ...configRef.current, ...preset, preset: presetName });
    }
  }, [pushConfig]);


  // Lazily create a synth instance for TTS if the engine hasn't made one yet
  const synthRef = useRef<PinkTromboneSynth | null>(null);

  const getSynth = useCallback(async (): Promise<PinkTromboneSynth> => {
    // Prefer the engine's instance if available
    const active = PinkTromboneSynth.getActiveInstance();
    if (active) return active;

    // Create our own on demand
    if (!synthRef.current) {
      synthRef.current = new PinkTromboneSynth(configRef.current);
      const ctx = synthRef.current.output.context as AudioContext;
      synthRef.current.output.connect(ctx.destination);
      await synthRef.current.ready();
    }
    return synthRef.current;
  }, []);

  const handleSpeak = useCallback(() => {
    const text = configRef.current.text;
    if (!text?.trim()) return;

    getSynth().then(synth => {
      synth.applyConfig(configRef.current);
      synth.speak(text).catch(e => console.error('[PinkTrombone] Speech failed:', e));
    });
  }, [getSynth]);

  const presetNames = Object.keys(PINK_TROMBONE_PRESETS);

  return (
    <ScrollLockContainer className="p-4 overflow-y-auto h-full">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Text-to-Speech input */}
        <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accentColor }}>
              Text to Speech
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={config.text || ''}
              onChange={(e) => onChange({ ...configRef.current, text: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSpeak(); }}
              placeholder="Type text and press Speak..."
              className="flex-1 px-3 py-2 rounded bg-black/30 border border-white/10 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-white/30"
            />
            <button
              onClick={handleSpeak}
              disabled={!config.text?.trim()}
              className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider transition-all ${
                'text-black hover:brightness-110'
              }`}
              style={{ backgroundColor: accentColor }}
            >
              Speak
            </button>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-[10px] text-text-muted uppercase w-8">Speed</span>
            <input
              type="range"
              min={0} max={1} step={0.01}
              value={config.speed ?? 0.5}
              onChange={(e) => pushConfig({ ...configRef.current, speed: parseFloat(e.target.value) })}
              className="flex-1 h-1 accent-pink-500"
            />
          </div>
          <div className="mt-1 flex items-center gap-3">
            <span className="text-[10px] text-text-muted uppercase w-8">Pitch</span>
            <input
              type="range"
              min={0} max={1} step={0.01}
              value={config.speechPitch ?? 0.3}
              onChange={(e) => pushConfig({ ...configRef.current, speechPitch: parseFloat(e.target.value) })}
              className="flex-1 h-1 accent-pink-500"
            />
          </div>
        </div>

        {/* Preset selector */}
        <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accentColor }}>
              Vowel Preset
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {presetNames.map((name) => (
              <button
                key={name}
                onClick={() => handlePresetChange(name)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                  config.preset === name
                    ? 'text-black shadow-md'
                    : 'bg-dark-bg/50 text-text-secondary hover:text-text-primary hover:bg-dark-bg'
                }`}
                style={config.preset === name ? { backgroundColor: accentColor } : undefined}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Glottis controls */}
        <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accentColor }}>
              Glottis (Voice Source)
            </span>
          </div>
          <div className="flex gap-3 justify-center">
            <Knob
              paramKey="pinktrombone.tenseness"
              value={config.tenseness}
              min={0} max={1} step={0.01}
              onChange={(v) => updateParam('tenseness', v)}
              label="Tenseness"
              size="md"
              color={knobColor}
            />
            <Knob
              paramKey="pinktrombone.vibratoAmount"
              value={config.vibratoAmount}
              min={0} max={1} step={0.01}
              onChange={(v) => updateParam('vibratoAmount', v)}
              label="Vibrato"
              size="md"
              color={knobColor}
            />
          </div>
        </div>

        {/* Tongue controls */}
        <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accentColor }}>
              Tongue Shape
            </span>
          </div>
          <div className="flex gap-3 justify-center">
            <Knob
              value={config.tongueIndex}
              min={0} max={1} step={0.01}
              onChange={(v) => updateParam('tongueIndex', v)}
              label="Position"
              size="md"
              color={knobColor}
            />
            <Knob
              value={config.tongueDiameter}
              min={0} max={1} step={0.01}
              onChange={(v) => updateParam('tongueDiameter', v)}
              label="Height"
              size="md"
              color={knobColor}
            />
          </div>
        </div>

        {/* Lip & Nasal controls */}
        <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accentColor }}>
              Lip & Nasal
            </span>
          </div>
          <div className="flex gap-3 justify-center">
            <Knob
              value={config.lipDiameter}
              min={0} max={1} step={0.01}
              onChange={(v) => updateParam('lipDiameter', v)}
              label="Lip Shape"
              size="md"
              color={knobColor}
            />
            <Knob
              value={config.velum}
              min={0} max={1} step={0.01}
              onChange={(v) => updateParam('velum', v)}
              label="Nasal"
              size="md"
              color={knobColor}
            />
          </div>
        </div>

        {/* Constriction controls */}
        <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accentColor }}>
              Constriction
            </span>
          </div>
          <div className="flex gap-3 justify-center">
            <Knob
              value={config.constrictionIndex}
              min={0} max={1} step={0.01}
              onChange={(v) => updateParam('constrictionIndex', v)}
              label="Position"
              size="md"
              color={knobColor}
            />
            <Knob
              value={config.constrictionDiameter}
              min={0} max={1} step={0.01}
              onChange={(v) => updateParam('constrictionDiameter', v)}
              label="Size"
              size="md"
              color={knobColor}
            />
          </div>
        </div>

      </div>
    </ScrollLockContainer>
  );
};
