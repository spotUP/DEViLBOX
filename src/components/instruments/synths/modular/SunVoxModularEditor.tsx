/**
 * SunVoxModularEditor — Top-level editor for SunVox modular synth.
 *
 * Mirrors ModularSynthEditor but uses SunVox module descriptors (sv_* prefix)
 * and hides the polyphony selector (SunVox handles polyphony via MultiSynth).
 *
 * Syncs UI changes to the live SunVoxModularSynth via updatePatch().
 */

import React, { useCallback, useEffect, useRef } from 'react';
import type { InstrumentConfig } from '@/types/instrument';
import type { ModularPatchConfig } from '@/types/modular';
import { DEFAULT_SUNVOX_MODULAR_PATCH } from '@/types/instrument/defaults';
import { registerSunVoxModules } from '@/engine/sunvox-modular/SunVoxModuleDescriptors';
import type { SunVoxModularSynth } from '@/engine/sunvox-modular/SunVoxModularSynth';
import { ModularToolbar } from './ModularToolbar';
import { ModularRackView } from './views/ModularRackView';
import { ModularCanvasView } from './views/ModularCanvasView';
import { ModularMatrixView } from './views/ModularMatrixView';

// Register once at module level (idempotent)
registerSunVoxModules();

interface SunVoxModularEditorProps {
  config: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

export const SunVoxModularEditor: React.FC<SunVoxModularEditorProps> = ({ config, onChange }) => {
  const patchConfig = config.sunvoxModular || DEFAULT_SUNVOX_MODULAR_PATCH;
  const prevPatchRef = useRef<ModularPatchConfig>(patchConfig);

  // Sync UI patch changes to the live SunVoxModularSynth
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    const prev = prevPatchRef.current;
    prevPatchRef.current = patchConfig;
    if (prev === patchConfig) return;

    void (async () => {
      try {
        const { getToneEngine } = await import('@/engine/ToneEngine');
        const toneEngine = getToneEngine();
        const synth = toneEngine.getInstrument(configRef.current.id, configRef.current) as SunVoxModularSynth | null;
        if (synth && typeof synth === 'object' && 'updatePatch' in synth) {
          await (synth as SunVoxModularSynth).updatePatch(prev, patchConfig);
        }
      } catch {
        // ToneEngine not ready yet
      }
    })();
  }, [patchConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePatchChange = useCallback(
    (newPatch: ModularPatchConfig) => {
      // Push parameter changes to WASM in real-time
      const prev = prevPatchRef.current;
      for (const mod of newPatch.modules) {
        const prevMod = prev.modules.find(m => m.id === mod.id);
        if (!prevMod) continue;
        for (const [key, val] of Object.entries(mod.parameters)) {
          if (prevMod.parameters[key] !== val && key.startsWith('ctl_')) {
            const ctlId = parseInt(key.slice(4), 10);
            void (async () => {
              try {
                const { getToneEngine } = await import('@/engine/ToneEngine');
                const synth = getToneEngine().getInstrument(configRef.current.id, configRef.current);
                if (synth && 'set' in synth) {
                  (synth as SunVoxModularSynth).set(`${mod.id}.${ctlId}`, val as number);
                }
              } catch { /* ToneEngine not ready */ }
            })();
          }
        }
      }
      onChange({ sunvoxModular: { ...newPatch, backend: 'sunvox' } });
    },
    [onChange]
  );

  return (
    <div className="flex flex-col h-full bg-dark-bg">
      <ModularToolbar config={patchConfig} onChange={handlePatchChange} shelfPrefix="sv_" />

      <div className="flex-1 overflow-hidden">
        {patchConfig.viewMode === 'rack' && (
          <ModularRackView config={patchConfig} onChange={handlePatchChange} />
        )}
        {patchConfig.viewMode === 'canvas' && (
          <ModularCanvasView config={patchConfig} onChange={handlePatchChange} />
        )}
        {patchConfig.viewMode === 'matrix' && (
          <ModularMatrixView config={patchConfig} onChange={handlePatchChange} />
        )}
      </div>

      <div className="flex items-center gap-4 px-4 py-1.5 bg-dark-bgSecondary border-t border-dark-border text-xs text-text-muted">
        <span className="text-accent-primary font-bold">SunVox</span>
        <span>Modules: {patchConfig.modules.length}</span>
        <span>Connections: {patchConfig.connections.length}</span>
        <div className="flex-1" />
        <button
          onClick={async () => {
            try {
              const { getToneEngine } = await import('@/engine/ToneEngine');
              const synth = getToneEngine().getInstrument(configRef.current.id, configRef.current);
              if (synth && 'save' in synth) {
                const data = await (synth as SunVoxModularSynth).save();
                const blob = new Blob([data], { type: 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${configRef.current.name || 'patch'}.sunvox`;
                a.click();
                URL.revokeObjectURL(url);
              }
            } catch (err) {
              console.error('[SunVoxModularEditor] Save failed:', err);
            }
          }}
          className="px-2 py-0.5 bg-dark-bgTertiary border border-dark-border rounded hover:bg-accent-primary/20 hover:border-accent-primary transition-colors text-text-secondary hover:text-text-primary"
        >
          Save .sunvox
        </button>
      </div>
    </div>
  );
};
