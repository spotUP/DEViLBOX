/**
 * DrumPadManager - Main drum pad interface container
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useDrumPadKeyboard } from '@/hooks/drumpad/useDrumPadKeyboard';
import { PadGrid } from './PadGrid';
import { PadEditor } from './PadEditor';
import { MpkStatusBar } from './MpkStatusBar';
import { SamplePackBrowser } from '../instruments/SamplePackBrowser';
import { ErrorBoundary } from './ErrorBoundary';
import { useDrumPadStore } from '../../stores/useDrumPadStore';
import type { SampleData } from '../../types/drumpad';
import { useTransportStore } from '../../stores/useTransportStore';
import { useDJStore } from '../../stores/useDJStore';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import { CustomSelect } from '@components/common/CustomSelect';
import { DJ_PAD_PRESETS } from '../../constants/djPadPresets';


/** Mini performance status: BPM + active deck letters */
const PerformanceStatus: React.FC = () => {
  const bpm = useTransportStore(s => s.bpm);
  const decks = useDJStore(s => s.decks);
  const activeLetters = Object.entries(decks)
    .filter(([, d]) => d.isPlaying)
    .map(([id]) => id.toUpperCase());
  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <span className="text-accent-primary font-bold">{bpm} BPM</span>
      {activeLetters.length > 0 && (
        <span className="text-text-muted">
          Deck {activeLetters.join('+')}
        </span>
      )}
    </div>
  );
};

interface DrumPadManagerProps {
  onClose?: () => void;
}

export const DrumPadManager: React.FC<DrumPadManagerProps> = ({ onClose }) => {
  // Register keyboard shortcuts for drum pad view
  useDrumPadKeyboard();

  const [selectedPadId, setSelectedPadId] = useState<number | null>(null);
  const [showSampleBrowser, setShowSampleBrowser] = useState(false);
  const [showPadEditor, setShowPadEditor] = useState(false);
  const [padEditorShowSamples, setPadEditorShowSamples] = useState(false);

  // Performance mode: fullscreen pads with minimal UI
  const [performanceMode, setPerformanceMode] = useState(false);

  // DJ presets — action-only select (no persistent selection)

  const { loadProgram, loadSampleToPad } = useDrumPadStore();



  const handleLoadSample = useCallback((sample: SampleData) => {
    if (selectedPadId !== null) {
      loadSampleToPad(selectedPadId, sample);
    }
  }, [selectedPadId, loadSampleToPad]);

  const handleLoadDJPreset = useCallback((presetId: string) => {
    const preset = DJ_PAD_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    const program = preset.create();
    
    // Debug logging
    if (process.env.NODE_ENV === 'development') {
      console.log('[handleLoadDJPreset] Loading preset', {
        presetId,
        presetName: preset.name,
        programId: program.id,
        programName: program.name,
        padCount: program.pads.filter(p => p.djFxAction || p.synthConfig || p.scratchAction || p.sample).length,
        bankAPads: program.pads.slice(0, 16).map((p) => ({
          id: p.id,
          name: p.name,
          hasDjFx: !!p.djFxAction,
          hasSynth: !!p.synthConfig,
          djFxAction: p.djFxAction
        }))
      });
    }
    
    useDrumPadStore.getState().saveProgram(program);
    loadProgram(program.id);

    // Auto-switch to Bank A since presets load into Bank A
    useDrumPadStore.getState().setBank('A');

    // Let the preset apply side-effects (e.g. King Tubby Dub Kit flips the
    // Dub Bus on and dials in musical defaults so the kit is usable instantly).
    preset.onApply?.({
      setDubBus: useDrumPadStore.getState().setDubBus,
    });
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[handleLoadDJPreset] After loading, current program:', {
        currentProgramId: useDrumPadStore.getState().currentProgramId,
        currentBank: useDrumPadStore.getState().currentBank
      });
    }
  }, [loadProgram]);

  // Escape key handler — pad triggering handled by useDrumPadKeyboard hook
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Escape to close (always works, even in inputs)
      if (event.key === 'Escape') {
        if (performanceMode) {
          setPerformanceMode(false);
        } else if (onClose) {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, performanceMode]);

  // Determine if we're rendered as a full view (no onClose) or as a modal
  const isViewMode = !onClose;

  // Perform mode takes over the full viewport (covering the app navbar +
  // status bar) so pads get every pixel available. Otherwise the normal
  // view-mode / modal shells apply.
  const outerClass = performanceMode
    ? 'fixed inset-0 z-[99995] bg-dark-bg flex flex-col overflow-hidden select-none font-mono'
    : isViewMode
      ? 'flex flex-col h-full w-full overflow-hidden select-none bg-dark-bg font-mono'
      : 'fixed inset-0 z-[99990] bg-dark-bg/95 backdrop-blur-sm flex items-center justify-center animate-in fade-in-0 duration-300';

  const innerClass = performanceMode
    ? 'flex flex-col h-full w-full overflow-hidden'
    : isViewMode
      ? 'flex flex-col h-full w-full overflow-hidden'
      : 'bg-dark-surface border border-dark-border rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-8 duration-400';

  const content = (
    <div className={outerClass}>
      <div className={innerClass}>
        {/* Header / Top Bar */}
        <div className={`flex items-center justify-between px-4 py-2 shrink-0 border-b border-dark-border ${
          performanceMode ? 'bg-dark-bg' : 'bg-dark-bgSecondary'
        }`}>
          <div className="flex items-center gap-3">
            {isViewMode && !performanceMode && (
              <>
                <CustomSelect
                  value="drumpad"
                  onChange={(val) => {
                    if (val !== 'drumpad') {
                      useUIStore.getState().setActiveView(val as any);
                    }
                  }}
                  options={[
                    { value: 'tracker', label: 'Tracker' },
                    { value: 'grid', label: 'Grid' },
                    { value: 'tb303', label: 'TB-303' },
                    { value: 'dj', label: 'DJ Mixer' },
                    { value: 'drumpad', label: 'Drum Pads' },
                    { value: 'vj', label: 'VJ View' },
                  ]}
                  className="px-3 py-1.5 rounded-md text-xs font-mono font-bold tracking-widest uppercase border transition-all cursor-pointer border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary"
                  title="Switch view"
                />
                <div className="h-4 w-px bg-dark-border" />
              </>
            )}
            <span className="font-mono text-sm font-bold tracking-widest uppercase text-accent-primary">
              {performanceMode ? 'LIVE' : 'DRUM PADS'}
            </span>
            {!performanceMode && (
              <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">
                8 MPK slots · 2 banks · 8 pads each
              </span>
            )}
            {performanceMode && <PerformanceStatus />}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPerformanceMode(!performanceMode)}
              className={`px-3 py-1.5 text-xs font-mono border rounded transition-colors flex items-center gap-1.5 ${
                performanceMode
                  ? 'bg-accent-primary text-text-primary border-accent-primary'
                  : 'text-text-muted hover:text-text-primary bg-dark-bgTertiary border-dark-border'
              }`}
              title={performanceMode ? 'Exit performance mode (Esc)' : 'Performance mode — fullscreen pads'}
            >
              {performanceMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              {performanceMode ? 'EXIT' : 'PERFORM'}
            </button>
            {onClose && !performanceMode && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-dark-border rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-text-muted" />
              </button>
            )}
          </div>
        </div>

        {/* MPK-aligned status bar (slots 1-8, program name, bank A/B, knob labels) */}
        {!performanceMode && <MpkStatusBar />}

        {/* Preset strip — hidden in perform mode for a minimal live surface */}
        {!performanceMode && (
        <div className="flex items-center gap-1 px-4 py-1.5 border-b border-dark-border bg-dark-bg shrink-0">
          <span className="text-[10px] font-mono text-text-muted mr-1">PRESETS</span>
          <CustomSelect
            value=""
            onChange={handleLoadDJPreset}
            placeholder="Load Preset..."
            options={DJ_PAD_PRESETS.map(p => ({ value: p.id, label: p.name }))}
            className="px-2.5 py-1 text-[10px] font-mono font-bold rounded transition-colors bg-dark-bgTertiary border border-dark-border text-text-muted hover:text-text-primary hover:border-accent-highlight/50 cursor-pointer"
          />
        </div>
        )}

        {/* Main content area */}
        <ErrorBoundary fallbackMessage="An error occurred in the drum pad interface.">
          {performanceMode ? (
            /* Performance Mode: fullscreen pads with minimal controls.
             * Square-ish cap so pads don't stretch on ultrawide displays. */
            <div className="flex-1 flex items-center justify-center overflow-auto p-4">
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-full max-w-[min(95vh,1400px)]">
                  <PadGrid
                    onPadSelect={setSelectedPadId}
                    selectedPadId={selectedPadId}
                    performanceMode
                  />
                </div>
              </div>
            </div>
          ) : (
          <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
            {/* Pad grid — fills remaining height */}
            <div className="flex-1 min-h-0 px-4 pb-3">
              <div className="bg-dark-bg border border-dark-border rounded-lg h-full">
                <PadGrid
                  onPadSelect={(id) => {
                    setSelectedPadId(id);
                    setPadEditorShowSamples(false);
                    setShowPadEditor(true);
                  }}
                  onLoadSample={(id) => {
                    setSelectedPadId(id);
                    setPadEditorShowSamples(true);
                    setShowPadEditor(true);
                  }}
                  selectedPadId={selectedPadId}
                />
              </div>
            </div>
          </div>
          )}
        </ErrorBoundary>

        {/* Sample Browser Modal */}
        {showSampleBrowser && (
          <div className="animate-in fade-in-0 duration-200">
            <SamplePackBrowser
              mode="drumpad"
              onSelectSample={handleLoadSample}
              onClose={() => setShowSampleBrowser(false)}
            />
          </div>
        )}

        {/* Pad Editor Modal */}
        {showPadEditor && selectedPadId !== null && (
          <div
            className="fixed inset-0 z-[99990] bg-dark-bg/95 backdrop-blur-sm flex items-center justify-center animate-in fade-in-0 duration-200"
            onMouseDown={(e) => { if (e.target === e.currentTarget) setShowPadEditor(false); }}
          >
            <div className="max-w-6xl w-full mx-4 max-h-[95vh]">
              <PadEditor
                padId={selectedPadId}
                onClose={() => setShowPadEditor(false)}
                initialShowSampleBrowser={padEditorShowSamples}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return content;
};
