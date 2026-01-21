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
import type { NeuralPedalboard } from '@typedefs/pedalboard';
import { getModelByIndex, GUITARML_MODEL_REGISTRY } from '@constants/guitarMLRegistry';

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

  // Overdrive Parameters
  const [overdriveEnabled, setOverdriveEnabled] = useState(false);
  const [overdriveModel, setOverdriveModel] = useState(0);
  const [overdriveDrive, setOverdriveDrive] = useState(50);
  const [overdriveMix, setOverdriveMix] = useState(50);

  // Advanced Parameters
  const [oversampling, setOversampling] = useState(4);

  // Sequencer Parameters
  const [bpm, setBpm] = useState(130);
  const [currentStep, setCurrentStep] = useState(-1);
  // Unused - pattern index for future multi-pattern support
  // const [activePattern, setActivePattern] = useState(0);
  const [pattern, setPattern] = useState<AcidPattern>(new AcidPattern());

  const tb303Ref = useRef<TB303EngineAccurate | null>(null);
  const sequencerRef = useRef<SequencerEngine | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize audio (called after user interaction)
  const initializeAudio = async () => {
    try {
      setError(null);

      // Create AudioContext
      audioContextRef.current = new AudioContext();

      // Resume if suspended (required for user interaction)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // Create TB-303
      const config: TB303Config = {
        oscillator: { type: 'square' },
        filter: { cutoff, resonance },
        filterEnvelope: { envMod, decay },
        accent: { amount: accent },
        slide: { time: 60, mode: 'exponential' },
        devilFish: {
          enabled: false,
          normalDecay: decay,
          accentDecay: decay * 0.5,
          vegDecay: 200,
          vegSustain: 0,
          softAttack: 5,
          filterTracking: 100,
          filterFM: 0,
          sweepSpeed: 'normal',
          accentSweepEnabled: false,
          highResonance: false,
          muffler: 'off',
        },
      };

      const tb303 = new TB303EngineAccurate(audioContextRef.current, config);
      await tb303.initialize();
      tb303.connect(audioContextRef.current.destination);
      tb303Ref.current = tb303;

      // console.log('[Complete303SequencerDemo] TB-303 connected to destination');
      // console.log('[Complete303SequencerDemo] AudioContext state:', audioContextRef.current.state);
      // console.log('[Complete303SequencerDemo] AudioContext sample rate:', audioContextRef.current.sampleRate);

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

        // console.log('[Complete303SequencerDemo] Initialized');
      } catch (err) {
        console.error('[Complete303SequencerDemo] Init error:', err);
        setError(`Failed to initialize: ${err}`);
      }
    };

  // Cleanup
  useEffect(() => {
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

  // Update pedalboard enabled state
  useEffect(() => {
    if (tb303Ref.current && isInitialized) {
      tb303Ref.current.setPedalboardEnabled(overdriveEnabled);
    }
  }, [overdriveEnabled, isInitialized]);

  // Update pedalboard when model changes
  useEffect(() => {
    if (tb303Ref.current && isInitialized && overdriveEnabled) {
      const modelInfo = getModelByIndex(overdriveModel);
      const pedalboard: NeuralPedalboard = {
        enabled: true,
        inputGain: 100,
        outputGain: 100,
        chain: [{
          id: `effect-${overdriveModel}`,
          enabled: true,
          type: 'neural',
          modelIndex: overdriveModel,
          modelName: modelInfo?.name ?? 'TS808',
          parameters: {
            drive: overdriveDrive,
            tone: 50,
            level: 75,
            dryWet: overdriveMix,
          },
        }],
      };
      tb303Ref.current.updatePedalboard(pedalboard);
    }
  }, [overdriveModel, isInitialized, overdriveEnabled, overdriveDrive, overdriveMix]);

  // Update drive parameter
  useEffect(() => {
    if (tb303Ref.current && isInitialized && overdriveEnabled) {
      tb303Ref.current.setEffectParameter(`effect-${overdriveModel}`, 'drive', overdriveDrive);
    }
  }, [overdriveDrive, isInitialized, overdriveEnabled, overdriveModel]);

  // Update mix parameter
  useEffect(() => {
    if (tb303Ref.current && isInitialized && overdriveEnabled) {
      tb303Ref.current.setEffectParameter(`effect-${overdriveModel}`, 'dryWet', overdriveMix);
    }
  }, [overdriveMix, isInitialized, overdriveEnabled, overdriveModel]);

  // Update oversampling
  useEffect(() => {
    if (tb303Ref.current && isInitialized) {
      tb303Ref.current.setParameter('oversampling', oversampling);
    }
  }, [oversampling, isInitialized]);

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
        <div className="flex flex-col items-center justify-center py-12">
          <div className="text-ft2-text text-lg mb-4">
            Click below to initialize the TB-303 engine
          </div>
          <button
            onClick={initializeAudio}
            className="px-8 py-4 bg-green-700 hover:bg-green-600 text-white font-bold text-lg rounded-lg transition-all"
          >
            🎵 Initialize TB-303
          </button>
          <p className="text-ft2-textDim text-sm mt-4">
            (Audio requires user interaction to start)
          </p>
        </div>
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

          {/* Overdrive (GuitarML) */}
          <div className="border-t border-ft2-border pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-ft2-highlight font-bold">Neural Overdrive (GuitarML)</h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={overdriveEnabled}
                  onChange={(e) => setOverdriveEnabled(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-ft2-text text-sm">Enabled</span>
              </label>
            </div>

            {overdriveEnabled && (
              <>
                <div>
                  <label className="block text-ft2-textDim text-sm mb-1">
                    Model: {getModelByIndex(overdriveModel)?.name ?? 'Unknown'}
                  </label>
                  <select
                    value={overdriveModel}
                    onChange={(e) => setOverdriveModel(parseInt(e.target.value))}
                    className="w-full bg-ft2-bg text-ft2-text border border-ft2-border rounded px-2 py-1"
                  >
                    {GUITARML_MODEL_REGISTRY.map((model) => (
                      <option key={model.index} value={model.index}>
                        {model.name} ({model.category})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-ft2-textDim text-sm mb-1">
                    Drive: {overdriveDrive}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={overdriveDrive}
                    onChange={(e) => setOverdriveDrive(parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-ft2-textDim text-sm mb-1">
                    Dry/Wet Mix: {overdriveMix}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={overdriveMix}
                    onChange={(e) => setOverdriveMix(parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>
              </>
            )}
          </div>

          {/* Advanced Settings */}
          <div className="border-t border-ft2-border pt-4 space-y-3">
            <h3 className="text-ft2-highlight font-bold">Advanced</h3>

            <div>
              <label className="block text-ft2-textDim text-sm mb-1">
                Oversampling: {oversampling}x {oversampling === 4 ? '(Open303 default)' : ''}
              </label>
              <select
                value={oversampling}
                onChange={(e) => setOversampling(parseInt(e.target.value))}
                className="w-full bg-ft2-bg text-ft2-text border border-ft2-border rounded px-2 py-1"
              >
                <option value={1}>1x (No oversampling - fastest)</option>
                <option value={2}>2x (Moderate quality)</option>
                <option value={4}>4x (Open303 quality - recommended)</option>
              </select>
              <p className="text-ft2-textDim text-xs mt-1">
                Higher oversampling = better quality, more CPU usage
              </p>
            </div>
          </div>

          {/* Info */}
          <div className="border-t border-ft2-border pt-4 text-xs text-ft2-textDim">
            <p>✨ Open303 DSP + Acid Sequencer + Pattern Editor</p>
            <p>✨ 16-step patterns with accents and slides</p>
            <p>✨ Sample-accurate timing via ScriptProcessor</p>
            <p>✨ 37 Neural amp/pedal models via GuitarML</p>
            <p>✨ Calibrated envelope modulation from real hardware</p>
            <p>✨ Additional filters + 4x oversampling (Open303)</p>
          </div>
        </>
      )}
    </div>
  );
};
