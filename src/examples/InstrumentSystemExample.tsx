import React, { useState, useEffect, useRef } from 'react';
import { InstrumentFactory } from '@engine/InstrumentFactory';
import { ToneEngine } from '@engine/ToneEngine';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { EffectChain } from '@components/instruments/EffectChain';
import { EffectPanel } from '@components/instruments/EffectPanel';
import { PresetBrowser } from '@components/instruments/PresetBrowser';
import { InstrumentEditor } from '@components/instruments/InstrumentEditor';
import { TestKeyboard } from '@components/instruments/TestKeyboard';
import type { EffectConfig } from '@typedefs/instrument';
import * as Tone from 'tone';

/**
 * Example 1: Simple Integration
 * Shows the minimum code needed to use the system
 */
export const SimpleExample: React.FC = () => {
  const { currentInstrument, currentInstrumentId } = useInstrumentStore();

  if (!currentInstrument || currentInstrumentId === null) {
    return <div>No instrument selected</div>;
  }

  return (
    <div className="p-4 bg-ft2-bg">
      <h1 className="text-ft2-highlight text-xl font-bold mb-4">Simple Example</h1>

      {/* Instrument parameters */}
      <InstrumentEditor instrumentId={currentInstrumentId} />

      {/* Effect chain */}
      <EffectChain
        instrumentId={currentInstrumentId}
        effects={currentInstrument.effects}
      />

      <TestKeyboard instrument={currentInstrument} />
    </div>
  );
};

/**
 * Example 2: Advanced Integration
 * Shows how to use InstrumentFactory directly with ToneEngine
 */
export const AdvancedExample: React.FC = () => {
  const [instrumentCreated, setInstrumentCreated] = useState(false);
  const [effectCount, setEffectCount] = useState(0);
  const { currentInstrument, currentInstrumentId } = useInstrumentStore();
  
  const toneInstrumentRef = useRef<Tone.ToneAudioNode | null>(null);
  const toneEffectsRef = useRef<Tone.ToneAudioNode[]>([]);

  // Create Tone.js instrument when config changes
  useEffect(() => {
    if (!currentInstrument) return;

    // Get ToneEngine instance
    const engine = ToneEngine.getInstance();

    // Dispose old instrument
    if (toneInstrumentRef.current) {
      InstrumentFactory.disposeInstrument(toneInstrumentRef.current, toneEffectsRef.current);
    }

    // Create new instrument
    const instrument = InstrumentFactory.createInstrument(currentInstrument);
    const effects = InstrumentFactory.createEffectChain(currentInstrument.effects);
    if (engine.masterChannel) {
      InstrumentFactory.connectWithEffects(instrument, effects, engine.masterChannel);
    }


    // Store references in refs (non-reactive)
    toneInstrumentRef.current = instrument;
    toneEffectsRef.current = effects;
    
    // Update UI state - defer to next tick to avoid cascading render warning
    setTimeout(() => {
      setInstrumentCreated(true);
      setEffectCount(effects.length);
    }, 0);

    // Cleanup
    return () => {
      if (instrument) {
        InstrumentFactory.disposeInstrument(instrument, effects);
      }
    };
  }, [currentInstrument]);

  const handlePlayNote = (note: string) => {
    if (toneInstrumentRef.current && 'triggerAttackRelease' in toneInstrumentRef.current) {
      (toneInstrumentRef.current as any).triggerAttackRelease(note, '8n');
    }
  };

  if (!currentInstrument || currentInstrumentId === null) {
    return <div>No instrument selected</div>;
  }

  return (
    <div className="p-4 bg-ft2-bg">
      <h1 className="text-ft2-highlight text-xl font-bold mb-4">Advanced Example</h1>

      {/* Show Tone.js status */}
      <div className="mb-4 p-2 bg-ft2-header border border-ft2-border">
        <div className="text-xs font-mono text-ft2-textDim">
          Tone.js Instrument:{' '}
          <span className="text-ft2-highlight">{instrumentCreated ? 'Created' : 'None'}</span>
        </div>
        <div className="text-xs font-mono text-ft2-textDim">
          Effects Chain:{' '}
          <span className="text-ft2-highlight">{effectCount} effects</span>
        </div>
      </div>

      {/* Test buttons */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => handlePlayNote('C4')}
          className="px-3 py-1 bg-ft2-header border border-ft2-border hover:border-ft2-highlight"
        >
          Play C4
        </button>
        <button
          onClick={() => handlePlayNote('E4')}
          className="px-3 py-1 bg-ft2-header border border-ft2-border hover:border-ft2-highlight"
        >
          Play E4
        </button>
        <button
          onClick={() => handlePlayNote('G4')}
          className="px-3 py-1 bg-ft2-header border border-ft2-border hover:border-ft2-highlight"
        >
          Play G4
        </button>
      </div>

      <InstrumentEditor instrumentId={currentInstrumentId} />
      <EffectChain
        instrumentId={currentInstrumentId}
        effects={currentInstrument.effects}
      />
    </div>
  );
};

/**
 * Example 3: Preset Browser Integration
 * Shows how to use the preset browser in a modal
 */
export const PresetBrowserExample: React.FC = () => {
  const [showBrowser, setShowBrowser] = useState(false);
  const { currentInstrument, currentInstrumentId } = useInstrumentStore();

  if (!currentInstrument || currentInstrumentId === null) {
    return <div>No instrument selected</div>;
  }

  return (
    <div className="p-4 bg-ft2-bg">
      <h1 className="text-ft2-highlight text-xl font-bold mb-4">Preset Browser Example</h1>

      {/* Current instrument info */}
      <div className="mb-4 p-3 bg-ft2-header border border-ft2-border">
        <div className="text-sm font-mono">
          <span className="text-ft2-textDim">Current:</span>{' '}
          <span className="text-ft2-highlight font-bold">{currentInstrument.name}</span>
        </div>
        <div className="text-xs font-mono text-ft2-textDim mt-1">
          Type: {currentInstrument.synthType}
        </div>
      </div>

      {/* Browse button */}
      <button
        onClick={() => setShowBrowser(true)}
        className="px-4 py-2 bg-ft2-cursor text-ft2-bg font-bold border border-ft2-highlight"
      >
        BROWSE PRESETS
      </button>

      {/* Modal */}
      {showBrowser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="w-2/3 h-2/3 bg-ft2-bg border-4 border-ft2-highlight">
            <PresetBrowser
              instrumentId={currentInstrumentId}
              onClose={() => setShowBrowser(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Example 4: Effect Chain with Editor
 * Shows how to use effect chain with parameter editor
 */
export const EffectChainExample: React.FC = () => {
  const [editingEffect, setEditingEffect] = useState<EffectConfig | null>(null);
  const { currentInstrument, currentInstrumentId, addEffect } = useInstrumentStore();

  if (!currentInstrument || currentInstrumentId === null) {
    return <div>No instrument selected</div>;
  }

  return (
    <div className="p-4 bg-ft2-bg flex gap-4">
      {/* Left: Effect Chain */}
      <div className="flex-1">
        <h1 className="text-ft2-highlight text-xl font-bold mb-4">Effect Chain Example</h1>

        {/* Quick add buttons */}
        <div className="mb-4 flex gap-2 flex-wrap">
          <button
            onClick={() => addEffect(currentInstrumentId, 'Reverb')}
            className="px-3 py-1 bg-ft2-header border border-ft2-border hover:border-ft2-highlight text-xs"
          >
            + Reverb
          </button>
          <button
            onClick={() => addEffect(currentInstrumentId, 'Delay')}
            className="px-3 py-1 bg-ft2-header border border-ft2-border hover:border-ft2-highlight text-xs"
          >
            + Delay
          </button>
          <button
            onClick={() => addEffect(currentInstrumentId, 'Distortion')}
            className="px-3 py-1 bg-ft2-header border border-ft2-border hover:border-ft2-highlight text-xs"
          >
            + Distortion
          </button>
          <button
            onClick={() => addEffect(currentInstrumentId, 'Chorus')}
            className="px-3 py-1 bg-ft2-header border border-ft2-border hover:border-ft2-highlight text-xs"
          >
            + Chorus
          </button>
        </div>

        <EffectChain
          instrumentId={currentInstrumentId}
          effects={currentInstrument.effects}
          onEditEffect={setEditingEffect}
        />
      </div>

      {/* Right: Effect Editor */}
      {editingEffect && (
        <div className="w-1/3">
          <EffectPanel
            instrumentId={currentInstrumentId}
            effect={editingEffect}
            onClose={() => setEditingEffect(null)}
          />
        </div>
      )}
    </div>
  );
};

/**
 * Example 5: Complete Integration
 * Shows all components working together (same as InstrumentEditorDemo)
 */
export const CompleteExample: React.FC = () => {
  const [view, setView] = useState<'presets' | 'synth' | 'effects'>('synth');
  const [editingEffect, setEditingEffect] = useState<EffectConfig | null>(null);
  const { currentInstrument, currentInstrumentId } = useInstrumentStore();

  if (!currentInstrument || currentInstrumentId === null) {
    return <div>No instrument selected</div>;
  }

  return (
    <div className="h-screen bg-ft2-bg flex flex-col">
      {/* Navigation */}
      <div className="flex bg-ft2-header border-b border-ft2-border">
        <button
          onClick={() => setView('presets')}
          className={`px-6 py-3 font-mono text-sm ${
            view === 'presets'
              ? 'bg-ft2-cursor text-ft2-bg font-bold'
              : 'text-ft2-text hover:text-ft2-highlight'
          }`}
        >
          PRESETS
        </button>
        <button
          onClick={() => setView('synth')}
          className={`px-6 py-3 font-mono text-sm ${
            view === 'synth'
              ? 'bg-ft2-cursor text-ft2-bg font-bold'
              : 'text-ft2-text hover:text-ft2-highlight'
          }`}
        >
          SYNTH
        </button>
        <button
          onClick={() => setView('effects')}
          className={`px-6 py-3 font-mono text-sm ${
            view === 'effects'
              ? 'bg-ft2-cursor text-ft2-bg font-bold'
              : 'text-ft2-text hover:text-ft2-highlight'
          }`}
        >
          EFFECTS ({currentInstrument.effects.length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-y-auto scrollbar-ft2">
          {view === 'presets' && <PresetBrowser instrumentId={currentInstrumentId} />}
          {view === 'synth' && <InstrumentEditor instrumentId={currentInstrumentId} />}
          {view === 'effects' && (
            <EffectChain
              instrumentId={currentInstrumentId}
              effects={currentInstrument.effects}
              onEditEffect={setEditingEffect}
            />
          )}
        </div>

        {editingEffect && view === 'effects' && (
          <div className="w-1/3 border-l border-ft2-border overflow-y-auto scrollbar-ft2">
            <EffectPanel
              instrumentId={currentInstrumentId}
              effect={editingEffect}
              onClose={() => setEditingEffect(null)}
            />
          </div>
        )}
      </div>

      {/* Keyboard */}
      <div className="border-t border-ft2-border">
        <TestKeyboard instrument={currentInstrument} />
      </div>
    </div>
  );
};

/**
 * Example 6: Custom Effect Chain
 * Demonstrates programmatically creating a complex effect chain
 */
export const CustomEffectChainExample: React.FC = () => {
  const { currentInstrumentId, addEffect } = useInstrumentStore();

  const createDelayReverbChain = () => {
    if (currentInstrumentId === null) return;

    // Add delay
    addEffect(currentInstrumentId, 'Delay');
    // Add reverb
    addEffect(currentInstrumentId, 'Reverb');

    // Note: In a real implementation, you'd need to get the effect IDs
    // from the store after adding them to update their parameters
  };

  const createDistortionChain = () => {
    if (currentInstrumentId === null) return;

    addEffect(currentInstrumentId, 'Distortion');
    addEffect(currentInstrumentId, 'BitCrusher');
    addEffect(currentInstrumentId, 'Reverb');
  };

  const createModulationChain = () => {
    if (currentInstrumentId === null) return;

    addEffect(currentInstrumentId, 'Chorus');
    addEffect(currentInstrumentId, 'Phaser');
    addEffect(currentInstrumentId, 'PingPongDelay');
  };

  return (
    <div className="p-4 bg-ft2-bg">
      <h1 className="text-ft2-highlight text-xl font-bold mb-4">Custom Effect Chain Example</h1>

      <div className="mb-4 space-y-2">
        <button
          onClick={createDelayReverbChain}
          className="w-full px-4 py-2 bg-ft2-header border border-ft2-border
                   hover:border-ft2-highlight text-left"
        >
          <div className="font-bold text-ft2-text">Create Delay + Reverb Chain</div>
          <div className="text-xs text-ft2-textDim">Classic space effect</div>
        </button>

        <button
          onClick={createDistortionChain}
          className="w-full px-4 py-2 bg-ft2-header border border-ft2-border
                   hover:border-ft2-highlight text-left"
        >
          <div className="font-bold text-ft2-text">Create Distortion Chain</div>
          <div className="text-xs text-ft2-textDim">Heavy processing with reverb</div>
        </button>

        <button
          onClick={createModulationChain}
          className="w-full px-4 py-2 bg-ft2-header border border-ft2-border
                   hover:border-ft2-highlight text-left"
        >
          <div className="font-bold text-ft2-text">Create Modulation Chain</div>
          <div className="text-xs text-ft2-textDim">Chorus, phaser, and ping-pong delay</div>
        </button>
      </div>
    </div>
  );
};