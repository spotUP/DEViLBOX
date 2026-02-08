/**
 * TB303KnobPanel - Live filter control panel for TB-303
 * Now uses the JC303 VST-style layout for authentic experience.
 */

import React, { useCallback, memo } from 'react';
import { useInstrumentStore, useUIStore, useMIDIStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { JC303StyledKnobPanel } from '@components/instruments/controls/JC303StyledKnobPanel';
import type { TB303Config } from '@typedefs/instrument';

export const TB303KnobPanel: React.FC = memo(() => {
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

  // Handle config updates from the panel
  const handleConfigChange = useCallback((updates: Partial<TB303Config>) => {
    if (!targetInstrument) return;
    
    // Tuning optimization (handled in store/engine now, but good to be explicit)
    if (updates.tuning !== undefined && Object.keys(updates).length === 1) {
      // Direct engine update for tuning if store doesn't handle it fast enough
      // But we relying on store update usually.
      // Let's just use updateInstrument, as we fixed the engine logic to handle tuning without recreation
    }

    updateInstrument(targetInstrument.id, {
      tb303: updates as any
    });
  }, [targetInstrument, updateInstrument]);

  const handleVolumeChange = useCallback((volume: number) => {
    if (!targetInstrument) return;
    updateInstrument(targetInstrument.id, { volume });
  }, [targetInstrument, updateInstrument]);

  if (!targetInstrument || !targetInstrument.tb303) {
    return null;
  }

  return (
    <div 
      className={`tb303-knob-panel transition-all duration-300 ease-in-out ${tb303Collapsed ? 'h-10 overflow-hidden' : 'h-auto'}`}
      style={{ 
        position: 'relative', 
        width: '100%', 
        background: '#1a1a1a',
        borderTop: '1px solid #333'
      }}
    >
      {/* Collapse Toggle */}
      <button
        className="absolute top-0 right-0 z-50 p-2 text-gray-400 hover:text-white bg-black/50 hover:bg-black/80 rounded-bl-lg"
        onClick={toggleTB303Collapsed}
        title={tb303Collapsed ? 'Expand synth panel' : 'Collapse synth panel'}
      >
        {tb303Collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>

      {/* Panel Content */}
      <div className={`${tb303Collapsed ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}>
        {/* We use a key to force re-render if instrument changes, ensuring fresh state */}
        <JC303StyledKnobPanel 
          key={targetInstrument.id}
          config={targetInstrument.tb303} 
          onChange={handleConfigChange}
          volume={targetInstrument.volume}
          onVolumeChange={handleVolumeChange}
        />
      </div>

      {/* Collapsed Placeholder (Optional: could show mini status) */}
      {tb303Collapsed && (
        <div className="absolute top-0 left-0 p-2 text-xs font-mono text-accent-primary flex items-center gap-2">
          <span className="font-bold">TB-303</span>
          <span className="text-gray-500">CH{String(instruments.indexOf(targetInstrument) + 1).padStart(2, '0')}</span>
          <span className="text-gray-400">{targetInstrument.name}</span>
        </div>
      )}
    </div>
  );
});

TB303KnobPanel.displayName = 'TB303KnobPanel';

export default TB303KnobPanel;