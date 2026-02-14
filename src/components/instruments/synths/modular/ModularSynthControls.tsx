/**
 * ModularSynthControls - Placeholder UI for modular synth
 *
 * TODO: Implement full rack/canvas/matrix views (Phase 4-6)
 * For now, displays a message that the full editor is coming soon.
 */

import React from 'react';

interface ModularSynthControlsProps {
  // config: InstrumentConfig;
  // onChange: (config: InstrumentConfig) => void;
}

export const ModularSynthControls: React.FC<ModularSynthControlsProps> = () => {
  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-4 text-center">
      <div className="text-4xl">🔌</div>
      <h2 className="text-xl font-semibold text-text-primary">Modular Synth Engine Active</h2>
      <p className="text-sm text-text-secondary max-w-md">
        The modular synthesis engine is running with a default patch:
        VCO → VCF → VCA → Output (with ADSR envelope).
      </p>
      <div className="mt-4 p-4 bg-surface-secondary rounded-lg border border-border">
        <p className="text-xs text-text-tertiary">
          <strong>Status:</strong> Phase 1-3 Complete
        </p>
        <p className="text-xs text-text-tertiary mt-1">
          <strong>Coming Soon:</strong> Rack View, Canvas View, Matrix View
        </p>
      </div>
      <div className="mt-4 text-xs text-text-tertiary">
        <p>Available Modules:</p>
        <div className="grid grid-cols-2 gap-2 mt-2 text-left">
          <div>• VCO (Oscillator)</div>
          <div>• VCF (Filter)</div>
          <div>• VCA (Amplifier)</div>
          <div>• ADSR (Envelope)</div>
          <div>• LFO (Modulator)</div>
          <div>• Noise (Generator)</div>
          <div>• Mixer (4-channel)</div>
          <div>• Output (Stereo)</div>
          <div>• MIDI In</div>
          <div>• Delay (Effect)</div>
          <div>• Sample & Hold</div>
        </div>
      </div>
    </div>
  );
};
