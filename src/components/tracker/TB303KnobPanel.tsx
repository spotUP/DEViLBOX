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

  // Handle config updates - hook must be called before any returns
  const handleConfigChange = useCallback(async (updates: Partial<TB303Config>) => {
    if (!targetInstrument) return;
    
    // Update config in store (for persistence)
    const newConfig = { ...targetInstrument.tb303, ...updates };
    updateInstrument(targetInstrument.id, {
      tb303: newConfig as any
    });
    
    // CRITICAL: Also update live synth directly for immediate response
    const ToneEngineModule = await import('@engine/ToneEngine');
    const ToneEngine = (ToneEngineModule as any).default || ToneEngineModule;
    const synth = ToneEngine.getInstrument(targetInstrument.id, targetInstrument);
    if (!synth || !('setCutoff' in synth)) return; // Not a DB303Synth
    
    // Apply each changed parameter directly to WASM (all values are 0-1)
    Object.entries(updates).forEach(([key, value]) => {
      if (!value || typeof value !== 'object') {
        // Simple values
        if (key === 'tuning') synth.setTuning(value as number);
        else if (key === 'volume') synth.setVolume(value as number);
        return;
      }
      
      const val = value as Record<string, any>;
      if (key === 'filter') {
        if ('cutoff' in val) synth.setCutoff(val.cutoff);
        if ('resonance' in val) synth.setResonance(val.resonance);
      } else if (key === 'filterEnvelope') {
        if ('envMod' in val) synth.setEnvMod(val.envMod);
        if ('decay' in val) synth.setDecay(val.decay);
      } else if (key === 'accent') {
        if ('amount' in val) synth.setAccent(val.amount);
      } else if (key === 'oscillator') {
        if ('type' in val) synth.setWaveform(val.type === 'square' ? 1.0 : 0.0);
        if ('pulseWidth' in val) synth.setPulseWidth(val.pulseWidth);
        if ('subOscGain' in val) synth.setSubOscGain(val.subOscGain);
        if ('subOscBlend' in val) synth.setSubOscBlend(val.subOscBlend);
        if ('pitchToPw' in val) synth.setPitchToPw(val.pitchToPw);
      } else if (key === 'slide') {
        if ('time' in val) synth.setSlideTime(val.time);
      } else if (key === 'devilFish') {
        if ('enabled' in val) synth.enableDevilFish(val.enabled);
        if ('normalDecay' in val) synth.setNormalDecay(val.normalDecay);
        if ('accentDecay' in val) synth.setAccentDecay(val.accentDecay);
        if ('softAttack' in val) synth.setSoftAttack(val.softAttack);
        if ('accentSoftAttack' in val) synth.setAccentSoftAttack(val.accentSoftAttack);
        if ('passbandCompensation' in val) synth.setPassbandCompensation(val.passbandCompensation);
        if ('resTracking' in val) synth.setResTracking(val.resTracking);
        if ('filterInputDrive' in val) synth.setFilterInputDrive(val.filterInputDrive);
        if ('diodeCharacter' in val) synth.setDiodeCharacter(val.diodeCharacter);
        if ('duffingAmount' in val) synth.setDuffingAmount(val.duffingAmount);
        if ('filterFmDepth' in val) synth.setFilterFmDepth(val.filterFmDepth);
        if ('lpBpMix' in val) synth.setLpBpMix(val.lpBpMix);
        if ('filterTracking' in val) synth.setFilterTracking(val.filterTracking);
        if ('filterSelect' in val) synth.setFilterSelect(val.filterSelect);
      } else if (key === 'lfo') {
        if ('waveform' in val) synth.setLfoWaveform(val.waveform);
        if ('rate' in val) synth.setLfoRate(val.rate);
        if ('contour' in val) synth.setLfoContour(val.contour);
        if ('pitchDepth' in val) synth.setLfoPitchDepth(val.pitchDepth);
        if ('pwmDepth' in val) synth.setLfoPwmDepth(val.pwmDepth);
        if ('filterDepth' in val) synth.setLfoFilterDepth(val.filterDepth);
        if ('stiffDepth' in val) synth.setLfoStiffDepth(val.stiffDepth);
      } else if (key === 'chorus') {
        if ('mode' in val) synth.setChorusMode(val.mode);
        if ('mix' in val) synth.setChorusMix(val.mix);
      } else if (key === 'phaser') {
        if ('rate' in val) synth.setPhaserRate(val.rate);
        if ('depth' in val) synth.setPhaserDepth(val.depth);
        if ('feedback' in val) synth.setPhaserFeedback(val.feedback);
        if ('mix' in val) synth.setPhaserMix(val.mix);
      } else if (key === 'delay') {
        if ('time' in val) synth.setDelayTime(val.time);
        if ('feedback' in val) synth.setDelayFeedback(val.feedback);
        if ('tone' in val) synth.setDelayTone(val.tone);
        if ('mix' in val) synth.setDelayMix(val.mix);
        if ('stereo' in val) synth.setDelaySpread(val.stereo);
      }
    });
  }, [targetInstrument, updateInstrument]);

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
        />
      </div>
    </div>
  );
});

TB303KnobPanel.displayName = 'TB303KnobPanel';

export default TB303KnobPanel;