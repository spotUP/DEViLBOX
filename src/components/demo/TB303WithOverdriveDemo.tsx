/**
 * TB303WithOverdriveDemo - Complete TB-303 + GuitarML Overdrive Demo
 *
 * This component demonstrates the full JC303 implementation:
 * - Accurate TB-303 core (Open303 DSP engine)
 * - Neural network overdrive (GuitarML LSTM models)
 * - 37 amp/pedal models to choose from
 */

import React, { useState, useEffect, useRef } from 'react';
import { TB303EngineAccurate } from '@engine/TB303EngineAccurate';
import { GuitarMLEngine } from '@engine/GuitarMLEngine';
import type { TB303Config } from '@typedefs/instrument';

export const TB303WithOverdriveDemo: React.FC = () => {
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
  const [overdriveModel, setOverdriveModel] = useState(6); // Default: Ibanez TS808
  const [overdriveDrive, setOverdriveDrive] = useState(50);
  const [overdriveMix, setOverdriveMix] = useState(80);

  const engineRef = useRef<TB303EngineAccurate | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sequenceIntervalRef = useRef<number | null>(null);

  // Initialize engine
  useEffect(() => {
    const initEngine = async () => {
      try {
        audioContextRef.current = new AudioContext();

        const config: TB303Config = {
          oscillator: {
            type: 'square',
          },
          filter: {
            cutoff,
            resonance,
          },
          filterEnvelope: {
            envMod,
            decay,
          },
          accent: {
            amount: accent,
          },
          devilFish: {
            normalDecay: decay,
            accentDecay: decay * 0.5,
            slideTime: 60,
          },
        };

        const engine = new TB303EngineAccurate(audioContextRef.current, config);
        await engine.initialize();
        engine.connect(audioContextRef.current.destination);

        engineRef.current = engine;
        setIsInitialized(true);

        console.log('[TB303WithOverdriveDemo] Engine initialized');
      } catch (err) {
        console.error('[TB303WithOverdriveDemo] Initialization error:', err);
        setError(`Failed to initialize: ${err}`);
      }
    };

    initEngine();

    return () => {
      if (engineRef.current) {
        engineRef.current.dispose();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (sequenceIntervalRef.current) {
        clearInterval(sequenceIntervalRef.current);
      }
    };
  }, []);

  // Update TB-303 parameters
  useEffect(() => {
    if (engineRef.current && isInitialized) {
      engineRef.current.setParameter('waveform', waveform);
    }
  }, [waveform, isInitialized]);

  useEffect(() => {
    if (engineRef.current && isInitialized) {
      engineRef.current.setParameter('cutoff', cutoff);
    }
  }, [cutoff, isInitialized]);

  useEffect(() => {
    if (engineRef.current && isInitialized) {
      engineRef.current.setParameter('resonance', resonance);
    }
  }, [resonance, isInitialized]);

  useEffect(() => {
    if (engineRef.current && isInitialized) {
      engineRef.current.setParameter('envMod', envMod);
    }
  }, [envMod, isInitialized]);

  useEffect(() => {
    if (engineRef.current && isInitialized) {
      engineRef.current.setParameter('decay', decay);
    }
  }, [decay, isInitialized]);

  useEffect(() => {
    if (engineRef.current && isInitialized) {
      engineRef.current.setParameter('accent', accent);
    }
  }, [accent, isInitialized]);

  // Update overdrive parameters
  useEffect(() => {
    if (engineRef.current && isInitialized) {
      engineRef.current.setOverdriveEnabled(overdriveEnabled);
    }
  }, [overdriveEnabled, isInitialized]);

  useEffect(() => {
    if (engineRef.current && isInitialized && overdriveEnabled) {
      engineRef.current.loadOverdriveModel(overdriveModel);
    }
  }, [overdriveModel, isInitialized, overdriveEnabled]);

  useEffect(() => {
    if (engineRef.current && isInitialized) {
      engineRef.current.setOverdriveDrive(overdriveDrive);
    }
  }, [overdriveDrive, isInitialized]);

  useEffect(() => {
    if (engineRef.current && isInitialized) {
      engineRef.current.setOverdriveMix(overdriveMix);
    }
  }, [overdriveMix, isInitialized]);

  // Test note
  const playTestNote = (note: number, accentNote: boolean = false, slideNote: boolean = false) => {
    if (!engineRef.current || !isInitialized) return;

    engineRef.current.noteOn(note, 100, accentNote, slideNote);

    setTimeout(() => {
      engineRef.current?.noteOff();
    }, 300);
  };

  // Play acid sequence
  const playAcidSequence = () => {
    if (!engineRef.current || !isInitialized) return;

    setIsPlaying(true);

    const pattern = [
      { note: 36, accent: false, slide: false },
      { note: 36, accent: true, slide: false },
      { note: 43, accent: false, slide: true },
      { note: 36, accent: false, slide: false },
      { note: 41, accent: true, slide: false },
      { note: 36, accent: false, slide: true },
      { note: 38, accent: false, slide: false },
      { note: 41, accent: false, slide: true },
    ];

    let step = 0;
    const tempo = 130;
    const sixteenthNote = (60 / tempo) * 1000 / 4;

    sequenceIntervalRef.current = window.setInterval(() => {
      const { note, accent: accentNote, slide } = pattern[step];

      engineRef.current?.noteOn(note, 100, accentNote, slide);

      setTimeout(() => {
        engineRef.current?.noteOff();
      }, sixteenthNote * 0.8);

      step = (step + 1) % pattern.length;
    }, sixteenthNote);
  };

  const stopSequence = () => {
    if (sequenceIntervalRef.current) {
      clearInterval(sequenceIntervalRef.current);
      sequenceIntervalRef.current = null;
    }
    setIsPlaying(false);
  };

  // Group models by type
  const pedalModels = GuitarMLEngine.BUILT_IN_MODELS.filter((m) => m.type === 'pedal');
  const ampModels = GuitarMLEngine.BUILT_IN_MODELS.filter((m) => m.type === 'amp');
  const bassModels = GuitarMLEngine.BUILT_IN_MODELS.filter((m) => m.type === 'bass');

  return (
    <div className="p-6 bg-ft2-panel border border-ft2-border rounded">
      <h2 className="text-xl font-bold text-ft2-highlight mb-4">
        TB-303 + Neural Overdrive Demo
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-900 text-white rounded">
          Error: {error}
        </div>
      )}

      {!isInitialized ? (
        <div className="text-ft2-textDim">Initializing AudioWorklets...</div>
      ) : (
        <div className="space-y-6">
          {/* Status */}
          <div className="text-ft2-highlight">
            ✅ Open303 DSP + GuitarML LSTM Ready
          </div>

          {/* Test Buttons */}
          <div className="space-y-2">
            <h3 className="font-bold text-ft2-textDim">Test:</h3>
            <div className="flex gap-2">
              <button
                onClick={() => playTestNote(36)}
                className="px-3 py-1 bg-ft2-header text-white rounded hover:bg-ft2-cursor hover:text-ft2-bg"
              >
                C2
              </button>
              <button
                onClick={() => playTestNote(36, true)}
                className="px-3 py-1 bg-ft2-header text-white rounded hover:bg-ft2-cursor hover:text-ft2-bg"
              >
                C2 Accent
              </button>
              <button
                onClick={() => playTestNote(43, false, true)}
                className="px-3 py-1 bg-ft2-header text-white rounded hover:bg-ft2-cursor hover:text-ft2-bg"
              >
                G2 Slide
              </button>
            </div>
          </div>

          {/* Sequence */}
          <div className="space-y-2">
            <h3 className="font-bold text-ft2-textDim">Acid Sequence:</h3>
            <div className="flex gap-2">
              <button
                onClick={playAcidSequence}
                disabled={isPlaying}
                className="px-4 py-2 bg-green-700 text-white rounded hover:bg-green-600 disabled:opacity-50"
              >
                Play
              </button>
              <button
                onClick={stopSequence}
                disabled={!isPlaying}
                className="px-4 py-2 bg-red-700 text-white rounded hover:bg-red-600 disabled:opacity-50"
              >
                Stop
              </button>
            </div>
          </div>

          {/* TB-303 Parameters */}
          <div className="space-y-3 border-t border-ft2-border pt-4">
            <h3 className="font-bold text-ft2-highlight">TB-303 Parameters:</h3>

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

          {/* Overdrive Parameters */}
          <div className="space-y-3 border-t border-ft2-border pt-4">
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-ft2-highlight">Neural Overdrive:</h3>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={overdriveEnabled}
                  onChange={(e) => setOverdriveEnabled(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-ft2-textDim text-sm">Enabled</span>
              </label>
            </div>

            {overdriveEnabled && (
              <>
                <div>
                  <label className="block text-ft2-textDim text-sm mb-1">
                    Model: {GuitarMLEngine.BUILT_IN_MODELS[overdriveModel]?.name}
                  </label>
                  <select
                    value={overdriveModel}
                    onChange={(e) => setOverdriveModel(parseInt(e.target.value))}
                    className="w-full bg-ft2-bg text-ft2-text border border-ft2-border rounded p-2"
                  >
                    <optgroup label="Pedals">
                      {pedalModels.map((model, idx) => {
                        const globalIdx = GuitarMLEngine.BUILT_IN_MODELS.indexOf(model);
                        return (
                          <option key={globalIdx} value={globalIdx}>
                            {model.name}
                          </option>
                        );
                      })}
                    </optgroup>
                    <optgroup label="Amps">
                      {ampModels.map((model, idx) => {
                        const globalIdx = GuitarMLEngine.BUILT_IN_MODELS.indexOf(model);
                        return (
                          <option key={globalIdx} value={globalIdx}>
                            {model.name}
                          </option>
                        );
                      })}
                    </optgroup>
                    <optgroup label="Bass">
                      {bassModels.map((model, idx) => {
                        const globalIdx = GuitarMLEngine.BUILT_IN_MODELS.indexOf(model);
                        return (
                          <option key={globalIdx} value={globalIdx}>
                            {model.name}
                          </option>
                        );
                      })}
                    </optgroup>
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
                    Mix: {overdriveMix}%
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

          {/* Info */}
          <div className="border-t border-ft2-border pt-4 text-xs text-ft2-textDim space-y-1">
            <p>✨ TB-303: TeeBeeFilter (mystran & kunn), PolyBLEP, Open303 DSP</p>
            <p>✨ Overdrive: LSTM neural networks, 37 models (GuitarML project)</p>
            <p>✨ 1:1 accurate port of JC303 reference implementation</p>
          </div>
        </div>
      )}
    </div>
  );
};
