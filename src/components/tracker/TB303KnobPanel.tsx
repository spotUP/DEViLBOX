/**
 * TB303KnobPanel - Live filter control panel for TB-303
 * Now uses the JC303 VST-style layout for authentic experience.
 */

import React, { useCallback, useRef, memo } from 'react';
import { useInstrumentStore, useUIStore, useMIDIStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown, ChevronUp, X, ExternalLink, Undo2 } from 'lucide-react';
import { JC303StyledKnobPanel } from '@components/instruments/controls/JC303StyledKnobPanel';
import { PopOutWindow, focusPopout } from '@components/ui/PopOutWindow';
import { ScrollLockContainer } from '@components/ui/ScrollLockContainer';
import type { TB303Config, EffectConfig } from '@typedefs/instrument';

export const TB303KnobPanel: React.FC = memo(() => {
  // ALL HOOKS MUST BE AT THE TOP
  const { instruments, updateInstrument } = useInstrumentStore(
    useShallow((state) => ({ 
      instruments: state.instruments, 
      updateInstrument: state.updateInstrument 
    }))
  );
  
  const { tb303Collapsed, toggleTB303Collapsed, tb303PoppedOut, setTB303PoppedOut } = useUIStore(
    useShallow((state) => ({
      tb303Collapsed: state.tb303Collapsed,
      toggleTB303Collapsed: state.toggleTB303Collapsed,
      tb303PoppedOut: state.tb303PoppedOut,
      setTB303PoppedOut: state.setTB303PoppedOut,
    }))
  );

  const { controlledInstrumentId } = useMIDIStore();
  const contentRef = useRef<HTMLDivElement>(null);

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
      tb303: { ...latest.tb303, ...updates }
    });
  }, [targetInstrument, updateInstrument]);

  // Handle full preset load (synth config + effects chain)
  const handlePresetLoad = useCallback(async (preset: { tb303?: Partial<TB303Config>; effects?: Array<Record<string, unknown>> }) => {
    if (!targetInstrument) return;

    // Apply TB-303 synth config
    if (preset.tb303) {
      handleConfigChange(preset.tb303);
    }

    // Apply effects chain (or clear if preset has none)
    if (preset.effects !== undefined) {
      const effects = preset.effects.map((fx: Record<string, unknown>, i: number) => ({
        ...fx,
        id: (fx.id as string) || `tb303-fx-${Date.now()}-${i}`,
      })) as EffectConfig[];
      updateInstrument(targetInstrument.id, { effects });

      // Rebuild audio chain immediately
      const { getToneEngine } = await import('@engine/ToneEngine');
      const engine = getToneEngine();
      await engine.rebuildInstrumentEffects(targetInstrument.id, effects);
    }
  }, [targetInstrument, handleConfigChange, updateInstrument]);

  // NOW conditional returns are safe
  if (!targetInstrument || !targetInstrument.tb303) {
    // Still render popout window if it was open (instrument might get re-assigned)
    if (tb303PoppedOut) {
      return (
        <PopOutWindow
          isOpen={true}
          onClose={() => setTB303PoppedOut(false)}
          title="DEViLBOX — TB-303"
          width={1200}
          height={640}
        >
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            No TB-303 instrument found
          </div>
        </PopOutWindow>
      );
    }
    return null;
  }

  // Popped out — render into separate window, show placeholder strip inline
  if (tb303PoppedOut) {
    return (
      <>
        <PopOutWindow
          isOpen={true}
          onClose={() => setTB303PoppedOut(false)}
          title="DEViLBOX — TB-303"
          width={1200}
          height={640}
        >
          <div style={{ background: 'var(--color-bg-tertiary)' }}>
            <ScrollLockContainer>
              <JC303StyledKnobPanel
                key={targetInstrument.id}
                config={targetInstrument.tb303}
                onChange={handleConfigChange}
                onPresetLoad={handlePresetLoad}
                instrumentId={targetInstrument.id}
              />
            </ScrollLockContainer>
          </div>
        </PopOutWindow>

        {/* Placeholder strip in main window */}
        <div
          className="tb303-knob-panel"
          style={{
            position: 'relative',
            width: '100%',
            height: '40px',
            background: 'var(--color-bg-tertiary)',
            borderTop: '1px solid var(--color-border-light)',
          }}
        >
          <div className="absolute top-0 left-0 p-2 text-xs font-mono text-accent-primary flex items-center gap-2">
            <span className="font-bold">TB-303</span>
            <span className="text-text-muted">Popped Out</span>
          </div>
          <div className="absolute top-0 right-0 z-[99990]">
            <button
              className="p-2 text-text-secondary hover:text-text-primary bg-black/50 hover:bg-black/80 rounded-bl-lg flex items-center gap-1 text-xs"
              onClick={() => setTB303PoppedOut(false)}
              title="Restore panel inline"
            >
              <Undo2 size={14} />
              Restore
            </button>
          </div>
        </div>
      </>
    );
  }

  const COLLAPSED_HEIGHT = 40;
  const EXPANDED_HEIGHT = 512; // 480px panel + 16px padding + 16px buffer

  // Unified panel — always renders content, height animates between states
  return (
    <div
      className="tb303-knob-panel"
      style={{
        position: 'relative',
        width: '100%',
        height: tb303Collapsed ? `${COLLAPSED_HEIGHT}px` : `${EXPANDED_HEIGHT}px`,
        background: 'var(--color-bg-tertiary)',
        borderTop: '1px solid var(--color-border-light)',
        overflow: 'hidden',
        transition: 'height 300ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Collapsed header — always visible */}
      <div className="absolute top-0 left-0 p-2 text-xs font-mono text-accent-primary flex items-center gap-2"
        style={{ opacity: tb303Collapsed ? 1 : 0, transition: 'opacity 200ms ease', pointerEvents: tb303Collapsed ? 'auto' : 'none' }}
      >
        <span className="font-bold">TB-303</span>
        <span className="text-text-muted">CH{String(instruments.indexOf(targetInstrument) + 1).padStart(2, '0')}</span>
        <span className="text-text-secondary">{targetInstrument.name}</span>
      </div>

      {/* Action buttons — always pinned to top-right */}
      <div className="absolute top-1 right-1 z-[99990] flex items-center gap-1">
        {tb303Collapsed ? (
          <button
            className="p-2 text-text-secondary hover:text-text-primary bg-black/50 hover:bg-black/80 rounded-bl-lg"
            onClick={toggleTB303Collapsed}
            title="Expand synth panel"
          >
            <ChevronDown size={16} />
          </button>
        ) : (
          <>
            <button
              className="p-1.5 text-text-muted hover:text-accent-highlight bg-black/40 hover:bg-black/70 rounded transition-colors"
              onClick={() => {
                if (tb303PoppedOut) {
                  focusPopout('DEViLBOX — TB-303');
                } else {
                  setTB303PoppedOut(true);
                }
              }}
              title="Pop out to separate window"
            >
              <ExternalLink size={14} />
            </button>
            <button
              className="p-1.5 text-text-muted hover:text-text-primary bg-black/40 hover:bg-black/70 rounded transition-colors"
              onClick={toggleTB303Collapsed}
              title="Collapse synth panel"
            >
              <ChevronUp size={14} />
            </button>
            <button
              className="p-1.5 text-text-muted hover:text-red-400 bg-black/40 hover:bg-black/70 rounded transition-colors"
              onClick={() => useUIStore.getState().setTB303Collapsed(true)}
              title="Close synth panel"
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>

      {/* Full panel content — always in DOM, clipped when collapsed */}
      <div ref={contentRef} style={{
        opacity: tb303Collapsed ? 0 : 1,
        transition: 'opacity 200ms ease',
        pointerEvents: tb303Collapsed ? 'none' : 'auto',
      }}>
        <ScrollLockContainer className="w-full">
          <JC303StyledKnobPanel
            key={targetInstrument.id}
            config={targetInstrument.tb303}
            onChange={handleConfigChange}
            onPresetLoad={handlePresetLoad}
            instrumentId={targetInstrument.id}
          />
        </ScrollLockContainer>
      </div>
    </div>
  );
});

TB303KnobPanel.displayName = 'TB303KnobPanel';

export default TB303KnobPanel;