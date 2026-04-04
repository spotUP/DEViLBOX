import React, { useRef, useEffect, useCallback } from 'react';
import type { DECtalkConfig } from '@engine/dectalk/DECtalkSynth';
import { DECTALK_VOICES, DECtalkSynth } from '@engine/dectalk/DECtalkSynth';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { ScrollLockContainer } from '@components/ui/ScrollLockContainer';
import { getToneEngine } from '@engine/ToneEngine';

interface DECtalkControlsProps {
  config: DECtalkConfig;
  onChange: (updates: Partial<DECtalkConfig>) => void;
  instrumentId?: number;
}

export const DECtalkControls: React.FC<DECtalkControlsProps> = ({
  config,
  onChange,
  instrumentId,
}) => {
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const { accent: accentColor, panelBg } = useInstrumentColors('#00ff88');

  // Find active DECtalk synth instance for speak button
  const synthRef = useRef<DECtalkSynth | null>(null);

  const getSynth = useCallback(async (): Promise<DECtalkSynth | null> => {
    if (!synthRef.current) {
      try {
        const { getDevilboxAudioContext } = await import('@/utils/audio-context');
        const ctx = getDevilboxAudioContext();
        synthRef.current = new DECtalkSynth(configRef.current);
        synthRef.current.output.connect(ctx.destination);
        await synthRef.current.ready();
      } catch (e) {
        console.error('[DECtalk] Failed to create synth:', e);
        return null;
      }
    }
    return synthRef.current;
  }, []);

  // Keep local speak synth in sync with ALL config changes
  useEffect(() => {
    if (synthRef.current) {
      synthRef.current.applyConfig(config);
    }
  }, [config]);

  const handleSpeak = useCallback(() => {
    if (!configRef.current.text?.trim()) return;

    getSynth().then(synth => {
      if (!synth) return;
      // Config already applied via the useEffect above
      synth.speak().catch(e => console.error('[DECtalk] Speak failed:', e));
    });
  }, [getSynth]);

  const pushConfig = useCallback((updates: Partial<DECtalkConfig>) => {
    onChange(updates);
    // Push to local speak synth
    if (synthRef.current) {
      synthRef.current.applyConfig(updates);
    }
    // Push to engine's running synth instance
    if (instrumentId) {
      try { getToneEngine().updateNativeSynthConfig(instrumentId, updates); } catch { /* engine not ready */ }
    }
  }, [onChange, instrumentId]);

  return (
    <ScrollLockContainer className="p-4 overflow-y-auto h-full">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Text input + Speak */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accentColor }}>
              DECtalk Text-to-Speech
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={config.text || ''}
              onChange={(e) => onChange({ ...configRef.current, text: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSpeak(); }}
              placeholder="Type text and press Speak..."
              className="flex-1 px-3 py-2 rounded bg-black/30 border border-white/10 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-white/30 font-mono"
            />
            <button
              onClick={handleSpeak}
              disabled={!config.text?.trim()}
              className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider transition-all text-black hover:brightness-110"
              style={{ backgroundColor: accentColor }}
            >
              Speak
            </button>
          </div>
        </div>

        {/* Voice selector */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accentColor }}>
              Voice
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DECTALK_VOICES.map((name, index) => (
              <button
                key={name}
                onClick={() => pushConfig({ ...configRef.current, voice: index })}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                  config.voice === index
                    ? 'text-black shadow-md'
                    : 'bg-dark-bg/50 text-text-secondary hover:text-text-primary hover:bg-dark-bg'
                }`}
                style={config.voice === index ? { backgroundColor: accentColor } : undefined}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Rate + Pitch */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accentColor }}>
              Parameters
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-text-muted uppercase w-12">Rate</span>
              <input
                type="range"
                min={75} max={600} step={5}
                value={config.rate ?? 200}
                onChange={(e) => pushConfig({ ...configRef.current, rate: parseInt(e.target.value) })}
                className="flex-1 h-1"
                style={{ accentColor }}
              />
              <span className="text-[10px] text-text-muted w-10 text-right font-mono">{config.rate ?? 200}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-text-muted uppercase w-12">Pitch</span>
              <input
                type="range"
                min={0} max={1} step={0.01}
                value={config.pitch ?? 0.5}
                onChange={(e) => pushConfig({ ...configRef.current, pitch: parseFloat(e.target.value) })}
                className="flex-1 h-1"
                style={{ accentColor }}
              />
              <span className="text-[10px] text-text-muted w-10 text-right font-mono">{(config.pitch ?? 0.5).toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-text-muted uppercase w-12">Volume</span>
              <input
                type="range"
                min={0} max={1} step={0.01}
                value={config.volume ?? 0.8}
                onChange={(e) => pushConfig({ ...configRef.current, volume: parseFloat(e.target.value) })}
                className="flex-1 h-1"
                style={{ accentColor }}
              />
              <span className="text-[10px] text-text-muted w-10 text-right font-mono">{(config.volume ?? 0.8).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Quick phrases */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accentColor }}>
              Quick Phrases
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              'I am DECtalk.',
              'Danger. Danger.',
              'I am sorry Dave, I am afraid I cannot do that.',
              'Resistance is futile.',
              'Exterminate. Exterminate.',
              'I will be back.',
              'Open the pod bay doors.',
              'All your base are belong to us.',
            ].map((phrase) => (
              <button
                key={phrase}
                onClick={() => {
                  onChange({ ...configRef.current, text: phrase });
                  // Slight delay to let state update
                  setTimeout(() => {
                    getSynth().then(synth => {
                      if (!synth) return;
                      synth.applyConfig({ ...configRef.current, text: phrase });
                      synth.speak();
                    });
                  }, 50);
                }}
                className="px-2 py-1 rounded text-[10px] bg-dark-bg/50 text-text-secondary hover:text-text-primary hover:bg-dark-bg transition-all"
              >
                {phrase}
              </button>
            ))}
          </div>
        </div>

      </div>
    </ScrollLockContainer>
  );
};
