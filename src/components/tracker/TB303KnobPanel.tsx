/**
 * TB303KnobPanel - Live filter control panel for TB-303
 * Now uses the JC303 VST-style layout for authentic experience.
 */

import React, { useCallback, memo } from 'react';
import { useInstrumentStore, useUIStore, useMIDIStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { JC303StyledKnobPanel } from '@components/instruments/controls/JC303StyledKnobPanel';
import type { TB303Config } from '@typedefs/instrument';

export const TB303KnobPanel: React.FC = memo(() => {
  // ALL HOOKS MUST BE AT THE TOP
  const { instruments, updateInstrument } = useInstrumentStore(
    useShallow((state) => ({ 
      instruments: state.instruments, 
      updateInstrument: state.updateInstrument 
    }))
  );
  
  const { tb303Collapsed, toggleTB303Collapsed } = useUIStore(
    useShallow((state) => ({ 
      tb303Collapsed: state.tb303Collapsed, 
      toggleTB303Collapsed: state.toggleTB303Collapsed 
    }))
  );

  const { controlledInstrumentId } = useMIDIStore();

  // Find target instrument (either selected via MIDI control or first TB303)
  const targetInstrument = controlledInstrumentId
    ? instruments.find(i => i.id === controlledInstrumentId && i.synthType === 'TB303')
    : instruments.find(i => i.synthType === 'TB303');

  // Handle config updates — store update triggers engine.updateTB303Parameters() → synth.applyConfig()
  // IMPORTANT: Read latest tb303 from store at call time (not from closure) to avoid
  // stale data when React batches renders — otherwise rapid knob changes clobber each other.
  const handleConfigChange = useCallback((updates: Partial<TB303Config>) => {
    if (!targetInstrument) return;
    const latest = useInstrumentStore.getState().instruments.find(i => i.id === targetInstrument.id);
    if (!latest?.tb303) return;
    updateInstrument(targetInstrument.id, {
      tb303: { ...latest.tb303, ...updates } as any
    });
  }, [targetInstrument, updateInstrument]);

  // Handle full preset load (synth config + effects chain)
  const handlePresetLoad = useCallback(async (preset: any) => {
    if (!targetInstrument) return;

    // Apply TB-303 synth config
    if (preset.tb303) {
      handleConfigChange(preset.tb303);
    }

    // Apply effects chain (or clear if preset has none)
    if (preset.effects !== undefined) {
      const effects = preset.effects.map((fx: any, i: number) => ({
        ...fx,
        id: fx.id || `tb303-fx-${Date.now()}-${i}`,
      }));
      updateInstrument(targetInstrument.id, { effects });

      // Rebuild audio chain immediately
      const { getToneEngine } = await import('@engine/ToneEngine');
      const engine = getToneEngine();
      await engine.rebuildInstrumentEffects(targetInstrument.id, effects);
    }
  }, [targetInstrument, handleConfigChange, updateInstrument]);

  // NOW conditional returns are safe
  if (!targetInstrument || !targetInstrument.tb303) {
    return null;
  }

  // Collapsed view
  if (tb303Collapsed) {
    return (
      <div 
        className="tb303-knob-panel"
        style={{ 
          position: 'relative', 
          width: '100%', 
          height: '40px',
          background: '#1a1a1a',
          borderTop: '1px solid #333'
        }}
      >
        <div className="absolute top-0 right-0 z-50">
          <button
            className="p-2 text-gray-400 hover:text-white bg-black/50 hover:bg-black/80 rounded-bl-lg"
            onClick={toggleTB303Collapsed}
            title="Expand synth panel"
          >
            <ChevronDown size={16} />
          </button>
        </div>
        <div className="absolute top-0 left-0 p-2 text-xs font-mono text-accent-primary flex items-center gap-2">
          <span className="font-bold">TB-303</span>
          <span className="text-gray-500">CH{String(instruments.indexOf(targetInstrument) + 1).padStart(2, '0')}</span>
          <span className="text-gray-400">{targetInstrument.name}</span>
        </div>
      </div>
    );
  }

  // Main expanded panel
  return (
    <div 
      className="tb303-knob-panel"
      style={{ 
        position: 'relative', 
        width: '100%', 
        maxHeight: '400px', // Hard limit to prevent blocking
        background: '#1a1a1a',
        borderTop: '1px solid #333',
        overflow: 'auto'
      }}
    >
      {/* Control Buttons */}
      <div className="sticky top-0 right-0 z-50 flex justify-end gap-1 bg-black/80 p-1">
        <button
          className="p-2 text-gray-400 hover:text-white bg-black/50 hover:bg-black/80"
          onClick={toggleTB303Collapsed}
          title="Collapse synth panel"
        >
          <ChevronUp size={16} />
        </button>
        <button
          className="p-2 text-gray-400 hover:text-red-400 bg-black/50 hover:bg-black/80 rounded-bl-lg"
          onClick={() => useUIStore.getState().setTB303Collapsed(true)}
          title="Close synth panel"
        >
          <X size={16} />
        </button>
      </div>

      {/* Panel Content */}
      <div>
        <JC303StyledKnobPanel
          key={targetInstrument.id}
          config={targetInstrument.tb303}
          onChange={handleConfigChange}
          onPresetLoad={handlePresetLoad}
          instrumentId={targetInstrument.id}
        />
      </div>
    </div>
  );
});

TB303KnobPanel.displayName = 'TB303KnobPanel';

export default TB303KnobPanel;