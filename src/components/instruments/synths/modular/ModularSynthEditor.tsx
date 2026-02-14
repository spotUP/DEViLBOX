/**
 * ModularSynthEditor - Root editor component for modular synth
 *
 * Main container that combines toolbar and view (rack/canvas/matrix).
 * Replaces the placeholder ModularSynthControls component.
 */

import React, { useCallback } from 'react';
import type { InstrumentConfig } from '../../../../types/instrument';
import type { ModularPatchConfig } from '../../../../types/modular';
import { MODULAR_INIT_PATCH } from '../../../../constants/modularPresets';
import { ModularToolbar } from './ModularToolbar';
import { ModularRackView } from './views/ModularRackView';
import { ModularCanvasView } from './views/ModularCanvasView';
import { ModularMatrixView } from './views/ModularMatrixView';

interface ModularSynthEditorProps {
  config: InstrumentConfig;
  onChange: (config: InstrumentConfig) => void;
}

export const ModularSynthEditor: React.FC<ModularSynthEditorProps> = ({ config, onChange }) => {
  const patchConfig = config.modularSynth || MODULAR_INIT_PATCH;

  const handlePatchChange = useCallback(
    (newPatch: ModularPatchConfig) => {
      onChange({
        ...config,
        modularSynth: newPatch,
      });
    },
    [config, onChange]
  );

  return (
    <div className="flex flex-col h-full bg-surface-primary">
      {/* Toolbar */}
      <ModularToolbar config={patchConfig} onChange={handlePatchChange} />

      {/* View */}
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

      {/* Status bar */}
      <div className="flex items-center gap-4 px-4 py-1.5 bg-surface-secondary border-t border-border text-xs text-text-tertiary">
        <span>Modules: {patchConfig.modules.length}</span>
        <span>Connections: {patchConfig.connections.length}</span>
        <span>Polyphony: {patchConfig.polyphony}</span>
      </div>
    </div>
  );
};

// Export as ModularSynthControls for SynthRegistry compatibility
export { ModularSynthEditor as ModularSynthControls };
