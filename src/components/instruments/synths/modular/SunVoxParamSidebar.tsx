/**
 * SunVoxParamSidebar — Auto-generated parameter panel for a SunVox module.
 *
 * Fetches controls from WASM at runtime via engine.getControls(handle, svModuleId)
 * and renders a knob grid with labels.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { SunVoxControl } from '@/engine/sunvox/SunVoxEngine';
import type { SunVoxModularSynth } from '@/engine/sunvox-modular/SunVoxModularSynth';

interface SunVoxParamSidebarProps {
  synth: SunVoxModularSynth;
  /** UI module ID (the string ID from ModularModuleInstance) */
  selectedModuleId: string | null;
}

export const SunVoxParamSidebar: React.FC<SunVoxParamSidebarProps> = ({ synth, selectedModuleId }) => {
  const [controls, setControls] = useState<SunVoxControl[]>([]);
  const [values, setValues] = useState<number[]>([]);
  const valuesRef = useRef<number[]>([]);

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  // Fetch controls when selected module changes
  useEffect(() => {
    if (!selectedModuleId) {
      setControls([]);
      setValues([]);
      return;
    }

    const svModId = synth.getSvModuleId(selectedModuleId);
    if (svModId === undefined) return;

    synth.getModuleGraph().then(graph => {
      const mod = graph.find(m => m.id === svModId);
      if (mod) {
        setControls(mod.controls);
        setValues(mod.controls.map(c => c.value));
      }
    }).catch(() => {});
  }, [synth, selectedModuleId]);

  const handleChange = useCallback((ctlId: number, value: number) => {
    if (!selectedModuleId) return;

    // Update local state immediately
    const newValues = [...valuesRef.current];
    newValues[ctlId] = value;
    setValues(newValues);

    // Send to WASM
    synth.set(`${selectedModuleId}.${ctlId}`, value);
  }, [synth, selectedModuleId]);

  if (!selectedModuleId || controls.length === 0) {
    return (
      <div className="p-4 text-xs text-text-muted">
        {selectedModuleId ? 'No parameters' : 'Select a module to edit parameters'}
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2 overflow-y-auto max-h-96">
      <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">
        Parameters
      </div>
      {controls.map((ctl, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <label className="text-xs text-text-secondary w-24 truncate" title={ctl.name}>
            {ctl.name}
          </label>
          <input
            type="range"
            min={ctl.min}
            max={ctl.max}
            value={values[idx] ?? ctl.value}
            onChange={(e) => handleChange(idx, parseInt(e.target.value, 10))}
            className="flex-1 h-1 accent-accent-primary"
          />
          <span className="text-xs text-text-muted w-12 text-right">
            {values[idx] ?? ctl.value}
          </span>
        </div>
      ))}
    </div>
  );
};
