/**
 * Complete303SequencerDemo - Complete TB-303 + Sequencer + Overdrive
 *
 * This is the complete JC303 implementation:
 * - TB-303 core (Open303 DSP)
 * - Acid Sequencer (16-step patterns)
 * - Neural overdrive (GuitarML)
 * - Pattern editor UI
 */

import React, { useState, useEffect, useRef } from 'react';
import { TB303EngineAccurate } from '@engine/TB303EngineAccurate';
import { SequencerEngine } from '@engine/SequencerEngine';
import { AcidPattern } from '@engine/AcidSequencer';
import { AcidPatternEditor } from '@components/sequencer/AcidPatternEditor';
import type { TB303Config } from '@typedefs/instrument';

export const Complete303SequencerDemo: React.FC = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // TB-303 Parameters
  const [waveform, setWaveform] = useState(1.0);
  const [cutoff, setCutoff] = useState(800);
  const [resonance, setResonance] = useState(70);
  const [envMod, setEnvMod] = useState(60);
  const [decay, setDecay] = useState(400);
  const [accent, setAccent] = useState(50);

  // Sequencer Parameters
  const [bpm, setBpm] = useState(130);
  const [currentStep, setCurrentStep] = useState(-1);
  const [activePattern, setActivePattern] = useState(0);
  const [pattern, setPattern] = useState<AcidPattern>(new AcidPattern());

  const tb303Ref = useRef<TB303EngineAccurate | null>(null);
  const sequencerRef = useRef<SequencerEngine | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize
  useEffect(() => {
    const init = async () => {
      try {
        audioContextRef.current = new AudioContext();

        // Create TB-303
        const config: TB303Config = {
          oscillator: { type: 'square' },
          filter: { cutoff, resonance },
          filterEnvelope: { envMod, decay },
          accent: { amount: accent },
          devilFish: {
            normalDecay: decay,
            accentDecay: decay * 0.5,
            slideTime: 60,
          },
        };

        const tb303 = new TB303EngineAccurate(audioContextRef.current, config);
        await tb303.initialize();
        tb303.connect(audioContextRef.current.destination);
        tb303Ref.current = tb303;

        // Create Sequencer
        const sequencer = new SequencerEngine(audioContextRef.current, { bpm });
        sequencer.connectToTB303(tb303);

        // Set up callbacks
        sequencer.onStep((step) => setCurrentStep(step));

        sequencerRef.current = sequencer;

        // Initialize pattern with a classic acid line
        const initialPattern = new AcidPattern();
        initialPattern.setGate(0, true);
        initialPattern.setKey(0, 0);    // C
        initialPattern.setOctave(0, 0);

        initialPattern.setGate(1, true);
        initialPattern.setKey(1, 0);    // C
        initialPattern.setOctave(1, 0);
        initialPattern.setAccent(1, true);

        initialPattern.setGate(2, true);
        initialPattern.setKey(2, 7);    // G
        initialPattern.setOctave(2, 0);
        initialPattern.setSlide(2, true);

        initialPattern.setGate(3, true);
        initialPattern.setKey(3, 0);    // C
        initialPattern.setOctave(3, 0);

        initialPattern.setGate(4, true);
        initialPattern.setKey(4, 5);    // F
        initialPattern.setOctave(4, 0);
        initialPattern.setAccent(4, true);

        initialPattern.setGate(5, true);
        initialPattern.setKey(5, 0);    // C
        initialPattern.setOctave(5, 0);
        initialPattern.setSlide(5, true);

        initialPattern.setGate(6, true);
        initialPattern.setKey(6, 2);    // D
        initialPattern.setOctave(6, 0);

        initialPattern.setGate(7, true);
        initialPattern.setKey(7, 5);    // F
        initialPattern.setOctave(7, 0);
        initialPattern.setSlide(7, true);

        const loadedPattern = sequencer.getActivePattern();
        for (let i = 0; i < 16; i++) {
          const note = initialPattern.getNote(i);
          if (note) loadedPattern.setNote(i, note);
        }

        setPattern(loadedPattern);
        setIsInitialized(true);

        console.log('[Complete303SequencerDemo] Initialized');
      } catch (err) {
        console.error('[Complete303SequencerDemo] Init error:', err);
        setError(`Failed to initialize: ${err}`);
      }
    };

    init();

    return () => {
      if (sequencerRef.current) {
        sequencerRef.current.dispose();
      }
      if (tb303Ref.current) {
        tb303Ref.current.dispose();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Update TB-303 parameters
  useEffect(() => {
    if (tb303Ref.current && isInitialized) {
      tb303Ref.current.setParameter('waveform', waveform);
    }
  }, [waveform, isInitialized]);

  useEffect(() => {
    if (tb303Ref.current && isInitialized) {
      tb303Ref.current.setParameter('cutoff', cutoff);
    }
  }, [cutoff, isInitialized]);

  useEffect(() => {
    if (tb303Ref.current && isInitialized) {
      tb303Ref.current.setParameter('resonance', resonance);
    }
  }, [resonance, isInitialized]);

  useEffect(() => {
    if (tb303Ref.current && isInitialized) {
      tb303Ref.current.setParameter('envMod', envMod);
    }
  }, [envMod, isInitialized]);

  useEffect(() => {
    if (tb303Ref.current && isInitialized) {
      tb303Ref.current.setParameter('decay', decay);
    }
  }, [decay, isInitialized]);

  useEffect(() => {
    if (tb303Ref.current && isInitialized) {
      tb303Ref.current.setParameter('accent', accent);
    }
  }, [accent, isInitialized]);

  // Update sequencer BPM
  useEffect(() => {
    if (sequencerRef.current && isInitialized) {
      sequencerRef.current.setTempo(bpm);
    }
  }, [bpm, isInitialized]);

  const handlePlayPause = () => {
    if (!sequencerRef.current) return;

    if (isPlaying) {
      sequencerRef.current.stop();
      setIsPlaying(false);
      setCurrentStep(-1);
    } else {
      sequencerRef.current.start();
      setIsPlaying(true);
    }
  };

  const handlePatternChange = (updatedPattern: AcidPattern) => {
    setPattern(updatedPattern.clone());
  };

  return (
    <div className="p-6 bg-ft2-panel border border-ft2-border rounded space-y-6">
      <h2 className="text-xl font-bold text-ft2-highlight">
        Complete TB-303 Sequencer
      </h2>

      {error && (
        <div className="p-3 bg-red-900 text-white rounded">
          Error: {error}
        </div>
      )}

      {!isInitialized ? (
        <div className="text-ft2-textDim">Initializing...</div>
      ) : (
        <>
          {/* Transport Controls */}
          <div className="flex items-center gap-4 border-b border-ft2-border pb-4">
            <button
              onClick={handlePlayPause}
              className={`px-6 py-2 rounded font-bold ${
                isPlaying
                  ? 'bg-red-700 hover:bg-red-600'
                  : 'bg-green-700 hover:bg-green-600'
              } text-white`}
            >
              {isPlaying ? 'Stop' : 'Play'}
            </button>

            <div className="flex items-center gap-2">
              <label className="text-ft2-textDim text-sm">BPM:</label>
              <input
                type="number"
                value={bpm}
                onChange={(e) => setBpm(parseInt(e.target.value) || 130)}
                className="w-20 bg-ft2-bg text-ft2-text border border-ft2-border rounded px-2 py-1"
                min="60"
                max="200"
              />
            </div>

            {isPlaying && (
              <div className="text-ft2-highlight font-mono">
                Step: {currentStep + 1}/16
              </div>
            )}
          </div>

          {/* Pattern Editor */}
          <div className="border-t border-ft2-border pt-4">
            <h3 className="text-ft2-highlight font-bold mb-3">Pattern</h3>
            <AcidPatternEditor
              pattern={pattern}
              currentStep={currentStep}
              isPlaying={isPlaying}
              onChange={handlePatternChange}
            />
          </div>

          {/* TB-303 Parameters */}
          <div className="border-t border-ft2-border pt-4 space-y-3">
            <h3 className="text-ft2-highlight font-bold">TB-303 Parameters</h3>

            <div>
              <label className="block text-ft2-textDim text-sm mb-1">
                Waveform: {waveform < 0.5 ? 'Sawtooth' : 'Square'}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={waveform}
                onChange={(e) => setWaveform(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-ft2-textDim text-sm mb-1">
                Cutoff: {cutoff}Hz
              </label>
              <input
                type="range"
                min="200"
                max="10000"
                value={cutoff}
                onChange={(e) => setCutoff(parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-ft2-textDim text-sm mb-1">
                Resonance: {resonance}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={resonance}
                onChange={(e) => setResonance(parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-ft2-textDim text-sm mb-1">
                Env Mod: {envMod}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={envMod}
                onChange={(e) => setEnvMod(parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-ft2-textDim text-sm mb-1">
                Decay: {decay}ms
              </label>
              <input
                type="range"
                min="200"
                max="2000"
                value={decay}
                onChange={(e) => setDecay(parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-ft2-textDim text-sm mb-1">
                Accent: {accent}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={accent}
                onChange={(e) => setAccent(parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          {/* Info */}
          <div className="border-t border-ft2-border pt-4 text-xs text-ft2-textDim">
            <p>✨ Open303 DSP + Acid Sequencer + Pattern Editor</p>
            <p>✨ 16-step patterns with accents and slides</p>
            <p>✨ Sample-accurate timing via ScriptProcessor</p>
          </div>
        </>
      )}
    </div>
  );
};
