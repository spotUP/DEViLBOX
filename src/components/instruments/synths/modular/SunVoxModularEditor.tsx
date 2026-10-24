/**
 * SunVoxModularEditor — Top-level editor for SunVox modular synth.
 *
 * Mirrors ModularSynthEditor but uses SunVox module descriptors (sv_* prefix)
 * and hides the polyphony selector (SunVox handles polyphony via MultiSynth).
 *
 * Syncs UI changes to the live SunVoxModularSynth via updatePatch().
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { InstrumentConfig } from '@/types/instrument';
import type { ModularPatchConfig } from '@/types/modular';
import { DEFAULT_SUNVOX_SYNTH_PATCH } from '@/types/instrument/defaults';
import { registerSunVoxModules } from '@/engine/sunvox-modular/SunVoxModuleDescriptors';
import { sunvoxGraphToConfig } from '@/engine/sunvox-modular/graphToConfig';
import { useTransportStore } from '@/stores/useTransportStore';
import { getToneEngine } from '@engine/ToneEngine';
import type { SunVoxModularSynth } from '@/engine/sunvox-modular/SunVoxModularSynth';
import { PatchLoadButton } from '@components/instruments/controls/PatchLoadButton';
import { Button } from '@components/ui/Button';
import { ModularToolbar } from './ModularToolbar';
import { ModularRackView } from './views/ModularRackView';
import { ModularCanvasView } from './views/ModularCanvasView';
import { ModularMatrixView } from './views/ModularMatrixView';

// Register once at module level (idempotent)
registerSunVoxModules();

export interface SunVoxModularEditorProps {
  config: InstrumentConfig;
  /** Kept for the dispatcher contract; the graph is persisted by the engine (sunvox.patchData), not here. */
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

/** The live SunVox graph engine of this instrument (SunVoxSynth graph or SunVoxModular song module). */
async function getGraphSynth(config: InstrumentConfig): Promise<SunVoxModularSynth | null> {
  const synth = getToneEngine().getInstrument(config.id, config);
  return synth && typeof synth === 'object' && 'getModuleGraph' in synth ? (synth as SunVoxModularSynth) : null;
}

/**
 * The view of the graph is derived from the engine handle (getModuleGraph), never stored: the
 * single source of truth is the SunVox handle, saved by the engine into `config.sunvox.patchData`.
 */
export const SunVoxModularEditor: React.FC<SunVoxModularEditorProps> = ({ config }) => {
  const [patchConfig, setPatchConfig] = useState<ModularPatchConfig>(config.sunvoxModular ?? DEFAULT_SUNVOX_SYNTH_PATCH);
  const patchRef = useRef(patchConfig);
  patchRef.current = patchConfig;
  const isPlaying = useTransportStore(s => s.isPlaying);
  const configRef = useRef(config);
  configRef.current = config;

  const refreshFromEngine = useCallback(async () => {
    const synth = await getGraphSynth(configRef.current);
    if (!synth) return;
    const graph = await synth.getModuleGraph();
    if (graph.length === 0) return;
    setPatchConfig({ ...sunvoxGraphToConfig(graph), viewMode: patchRef.current.viewMode });
  }, []);

  // A preset or loaded patch rebuilds the engine with a new graph: re-read it.
  useEffect(() => {
    void refreshFromEngine().catch(() => { /* ToneEngine not ready yet */ });
  }, [config.id, config.sunvox?.patchName, refreshFromEngine]);

  const handlePatchChange = useCallback((newPatch: ModularPatchConfig) => {
    const prev = patchRef.current;
    patchRef.current = newPatch;
    setPatchConfig(newPatch);
    void (async () => {
      const synth = await getGraphSynth(configRef.current);
      if (!synth) return;
      // Controller moves go straight to the module; structure edits through updatePatch.
      for (const mod of newPatch.modules) {
        const prevMod = prev.modules.find(m => m.id === mod.id);
        if (!prevMod) continue;
        for (const [key, val] of Object.entries(mod.parameters)) {
          if (prevMod.parameters[key] !== val && key.startsWith('ctl_')) {
            synth.set(`${mod.id}.${parseInt(key.slice(4), 10)}`, val as number);
          }
        }
      }
      await synth.updatePatch(prev, newPatch);
    })().catch(err => console.error('[SunVoxModularEditor] Graph edit failed:', err));
  }, []);

  const handleLoadSunsynth = useCallback(async (buffer: ArrayBuffer) => {
    try {
      const synth = await getGraphSynth(configRef.current);
      if (!synth) return;
      if (await synth.loadSunsynthModule(buffer) >= 0) await refreshFromEngine();
    } catch (err) {
      console.error('[SunVoxModularEditor] Load .sunsynth failed:', err);
    }
  }, [refreshFromEngine]);

  const handleSave = useCallback(async () => {
    try {
      const synth = await getGraphSynth(configRef.current);
      if (!synth) return;
      const data = await synth.save();
      const url = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${configRef.current.name || 'patch'}.sunvox`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[SunVoxModularEditor] Save failed:', err);
    }
  }, []);

  return (
    <div className="flex flex-col h-full bg-dark-bg">
      <ModularToolbar config={patchConfig} onChange={handlePatchChange} shelfPrefix="sv_" />

      <div className="flex-1 overflow-hidden">
        {patchConfig.viewMode === 'rack' && (
          <ModularRackView config={patchConfig} onChange={handlePatchChange} isPlaying={isPlaying} />
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
        <PatchLoadButton synthType="SunVoxSynth" onLoad={handleLoadSunsynth} />
        <Button variant="default" onClick={() => void handleSave()}>Save .sunvox</Button>
      </div>
    </div>
  );
};
