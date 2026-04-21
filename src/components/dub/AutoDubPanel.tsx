/**
 * AutoDubPanel — header controls for autonomous dub performance.
 *
 * Renders inline in DubDeckStrip's header row: a toggle, a persona picker,
 * an "apply persona voicing" button, and an intensity slider. All
 * off-by-default.
 *
 * Persona pick changes move-bias weights + snaps intensity, but does NOT
 * clobber the bus VOICE character preset. Users who want the full persona
 * experience click the ♫ button to also load the persona's EQ/spring/echo
 * voicing. Users with hand-tuned voicing leave it alone.
 */

import React, { useCallback, useEffect } from 'react';
import { useDubStore, type AutoDubPersonaId } from '@/stores/useDubStore';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { startAutoDub, stopAutoDub, isAutoDubRunning } from '@/engine/dub/AutoDub';
import { getPersona, AUTO_DUB_PERSONAS } from '@/engine/dub/AutoDubPersonas';

interface AutoDubPanelProps {
  /** Disabled when the dub bus itself is off. */
  busEnabled: boolean;
}

export const AutoDubPanel: React.FC<AutoDubPanelProps> = ({ busEnabled }) => {
  const enabled = useDubStore(s => s.autoDubEnabled);
  const setEnabled = useDubStore(s => s.setAutoDubEnabled);
  const intensity = useDubStore(s => s.autoDubIntensity);
  const setIntensity = useDubStore(s => s.setAutoDubIntensity);
  const persona = useDubStore(s => s.autoDubPersona);
  const setPersona = useDubStore(s => s.setAutoDubPersona);
  const setDubBus = useDrumPadStore(s => s.setDubBus);

  // Keep the runtime engine in sync with the store flag. Runs on every
  // toggle change so the panic-off path (engine disposes held moves) fires
  // when the user flips Auto Dub off.
  useEffect(() => {
    if (enabled && busEnabled) {
      if (!isAutoDubRunning()) startAutoDub();
    } else {
      if (isAutoDubRunning()) stopAutoDub();
    }
  }, [enabled, busEnabled]);

  // Panic event (KILL button + MCP) also halts Auto Dub.
  useEffect(() => {
    const onPanic = () => {
      if (isAutoDubRunning()) stopAutoDub();
      setEnabled(false);
    };
    window.addEventListener('dub-panic', onPanic);
    return () => window.removeEventListener('dub-panic', onPanic);
  }, [setEnabled]);

  const handlePersonaChange = useCallback((id: AutoDubPersonaId) => {
    setPersona(id);
    const p = getPersona(id);
    // Snap intensity to persona default on first pick so a fresh "Tubby"
    // feels like Tubby's budget without the user having to find the right
    // number. Bus VOICE is NOT auto-applied — hand-tuned voicings were
    // being silently clobbered. Use the ♫ button to load the persona's
    // voicing explicitly.
    setIntensity(p.intensityDefault);
  }, [setPersona, setIntensity]);

  const applyPersonaVoice = useCallback(() => {
    const p = getPersona(persona);
    if (p.suggestedCharacterPreset) {
      setDubBus({ characterPreset: p.suggestedCharacterPreset });
    }
  }, [persona, setDubBus]);

  const disabled = !busEnabled;
  const controlsDisabled = disabled || !enabled;

  const personaOptions: Array<{ id: AutoDubPersonaId; label: string }> = (
    Object.values(AUTO_DUB_PERSONAS).map(p => ({ id: p.id, label: p.label }))
  );

  return (
    <div className="flex items-center gap-1.5 pl-2 border-l border-dark-border">
      <button
        type="button"
        className={
          'px-2 py-0.5 rounded border transition-colors text-[10px] font-mono ' +
          (enabled
            ? 'bg-accent-highlight/20 border-accent-highlight text-accent-highlight'
            : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:text-text-primary')
        }
        onClick={() => setEnabled(!enabled)}
        disabled={disabled}
        title={enabled
          ? 'Auto Dub ON — autonomous performer firing moves through the router'
          : 'Auto Dub OFF — click to enable. Strictly opt-in.'}
      >
        AUTO DUB {enabled ? 'ON' : 'OFF'}
      </button>

      <select
        className="bg-dark-bgTertiary border border-dark-border rounded px-1 py-0.5 text-text-primary text-[10px] font-mono focus:ring-1 focus:ring-accent-highlight disabled:opacity-50"
        value={persona}
        onChange={(e) => handlePersonaChange(e.target.value as AutoDubPersonaId)}
        disabled={controlsDisabled}
        title={getPersona(persona).description}
      >
        {personaOptions.map(o => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>

      {getPersona(persona).suggestedCharacterPreset && (
        <button
          type="button"
          className="px-1.5 py-0.5 rounded border bg-dark-bgTertiary border-dark-border text-text-muted hover:text-accent-highlight hover:border-accent-highlight text-[10px] font-mono transition-colors disabled:opacity-50"
          onClick={applyPersonaVoice}
          disabled={controlsDisabled}
          title={`Load ${getPersona(persona).label}'s bus voicing (EQ, spring, echo, tape saturator) — overwrites current VOICE`}
        >
          ♫
        </button>
      )}

      <div className="flex items-center gap-1">
        <span className="text-text-muted text-[10px]">INT</span>
        <input
          type="range" min={0} max={1} step={0.01}
          value={intensity}
          onChange={(e) => setIntensity(Number(e.target.value))}
          className="w-16 accent-accent-highlight disabled:opacity-50"
          disabled={controlsDisabled}
          title={`Intensity: ${(intensity * 100).toFixed(0)}% — scales roll probability, per-bar move budget, and wet params together`}
        />
        <span className="w-6 text-text-secondary text-[10px]">{(intensity * 100).toFixed(0)}</span>
      </div>
    </div>
  );
};
