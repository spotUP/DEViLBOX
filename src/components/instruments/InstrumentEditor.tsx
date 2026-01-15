// @ts-nocheck - Component prop types need updating
/**
 * InstrumentEditor - Main instrument editing interface
 */

import React, { useState } from 'react';
import { SynthTypeSelector } from './SynthTypeSelector';
import { OscillatorEditor } from './OscillatorEditor';
import { EnvelopeEditor } from './EnvelopeEditor';
import { FilterEditor } from './FilterEditor';
import { SampleEditor } from './SampleEditor';
import { TestKeyboard } from './TestKeyboard';
import { EffectChain } from './EffectChain';
import { useInstrumentStore } from '../../stores';

export const InstrumentEditor: React.FC = () => {
  const { currentInstrument } = useInstrumentStore();
  const [activeTab, setActiveTab] = useState<'synth' | 'effects'>('synth');

  if (!currentInstrument) {
    return (
      <div className="flex-1 flex items-center justify-center bg-ft2-panel text-ft2-textDim">
        <div className="text-center">
          <p className="text-lg mb-2">No instrument selected</p>
          <p className="text-sm">Create or select an instrument to edit</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-ft2-panel overflow-hidden">
      {/* Header */}
      <div className="bg-ft2-header border-b-2 border-ft2-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-ft2-highlight font-bold text-lg">
              Instrument Editor
            </h2>
            <p className="text-ft2-textDim text-sm">
              {currentInstrument.name} - {currentInstrument.synthType}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('synth')}
              className={`px-4 py-2 rounded ${
                activeTab === 'synth'
                  ? 'bg-ft2-cursor text-ft2-bg font-bold'
                  : 'bg-ft2-bgLight text-ft2-text'
              }`}
            >
              Synth
            </button>
            <button
              onClick={() => setActiveTab('effects')}
              className={`px-4 py-2 rounded ${
                activeTab === 'effects'
                  ? 'bg-ft2-cursor text-ft2-bg font-bold'
                  : 'bg-ft2-bgLight text-ft2-text'
              }`}
            >
              Effects
            </button>
          </div>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 overflow-y-auto scrollbar-ft2 p-4">
        {activeTab === 'synth' && (
          <div className="space-y-6">
            {/* Synth Type Selector */}
            <section>
              <h3 className="text-ft2-highlight font-bold mb-3">Synth Type</h3>
              <SynthTypeSelector instrument={currentInstrument} />
            </section>

            {/* Sample Section (for Sampler/Player types) */}
            {(currentInstrument.synthType === 'Sampler' || currentInstrument.synthType === 'Player') && (
              <section>
                <h3 className="text-ft2-highlight font-bold mb-3">Sample</h3>
                <SampleEditor instrument={currentInstrument} />
              </section>
            )}

            {/* Oscillator Section */}
            {currentInstrument.synthType !== 'Sampler' && currentInstrument.synthType !== 'Player' && (
              <section>
                <h3 className="text-ft2-highlight font-bold mb-3">Oscillator</h3>
                <OscillatorEditor instrument={currentInstrument} />
              </section>
            )}

            {/* Envelope Section */}
            <section>
              <h3 className="text-ft2-highlight font-bold mb-3">Envelope</h3>
              <EnvelopeEditor instrument={currentInstrument} />
            </section>

            {/* Filter Section */}
            {currentInstrument.synthType !== 'NoiseSynth' && (
              <section>
                <h3 className="text-ft2-highlight font-bold mb-3">Filter</h3>
                <FilterEditor instrument={currentInstrument} />
              </section>
            )}
          </div>
        )}

        {activeTab === 'effects' && (
          <EffectChain instrumentId={currentInstrument.id} />
        )}
      </div>

      {/* Test Keyboard at bottom */}
      <div className="border-t-2 border-ft2-border bg-ft2-bgLight p-4">
        <TestKeyboard instrument={currentInstrument} />
      </div>
    </div>
  );
};
