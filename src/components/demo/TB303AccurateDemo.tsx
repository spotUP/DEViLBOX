/**
 * TB303AccurateDemo - Demo component for testing the accurate TB-303 engine
 *
 * This component provides a simple interface to test the new AudioWorklet-based
 * TB-303 emulation and compare it with the Tone.js version.
 */

import React, { useState, useEffect, useRef } from 'react';
import { TB303EngineAccurate } from '@engine/TB303EngineAccurate';
import type { TB303Config } from '@typedefs/instrument';

export const TB303AccurateDemo: React.FC = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parameters
  const [waveform, setWaveform] = useState(1.0);  // 0=saw, 1=square
  const [cutoff, setCutoff] = useState(800);
  const [resonance, setResonance] = useState(70);
  const [envMod, setEnvMod] = useState(60);
  const [decay, setDecay] = useState(400);
  const [accent, setAccent] = useState(50);
  const [slideTime, setSlideTime] = useState(60);

  const engineRef = useRef<TB303EngineAccurate | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sequenceIntervalRef = useRef<number | null>(null);

  // Initialize engine
  useEffect(() => {
    const initEngine = async () => {
      try {
        // Create AudioContext
        audioContextRef.current = new AudioContext();

        // Create config
        const config: TB303Config = {
          oscillator: {
            type: waveform < 0.5 ? 'sawtooth' : 'square',
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
          slide: {
            time: slideTime,
            mode: 'exponential',
          },
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

        // Create engine
        const engine = new TB303EngineAccurate(audioContextRef.current, config);

        // Initialize worklet
        await engine.initialize();

        // Connect to output
        engine.connect(audioContextRef.current.destination);

        engineRef.current = engine;
        setIsInitialized(true);

        console.log('[TB303AccurateDemo] Engine initialized successfully');
      } catch (err) {
        console.error('[TB303AccurateDemo] Initialization error:', err);
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

  // Update parameters when they change
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

  useEffect(() => {
    if (engineRef.current && isInitialized) {
      engineRef.current.setParameter('slideTime', slideTime);
    }
  }, [slideTime, isInitialized]);

  // Test note
  const playTestNote = (note: number, accentNote: boolean = false, slideNote: boolean = false) => {
    if (!engineRef.current || !isInitialized) {
      console.warn('Engine not ready');
      return;
    }

    engineRef.current.noteOn(note, 100, accentNote, slideNote);

    setTimeout(() => {
      engineRef.current?.noteOff();
    }, 300);
  };

  // Play acid sequence
  const playAcidSequence = () => {
    if (!engineRef.current || !isInitialized) return;

    setIsPlaying(true);

    // Classic 303 acid pattern
    const pattern = [
      { note: 36, accent: false, slide: false },  // C2
      { note: 36, accent: true, slide: false },   // C2 accent
      { note: 43, accent: false, slide: true },   // G2 slide
      { note: 36, accent: false, slide: false },  // C2
      { note: 41, accent: true, slide: false },   // F2 accent
      { note: 36, accent: false, slide: true },   // C2 slide
      { note: 38, accent: false, slide: false },  // D2
      { note: 41, accent: false, slide: true },   // F2 slide
    ];

    let step = 0;
    const tempo = 130; // BPM
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

  return (
    <div className="p-6 bg-ft2-panel border border-ft2-border rounded">
      <h2 className="text-xl font-bold text-ft2-highlight mb-4">
        TB-303 Accurate Engine Demo
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-900 text-white rounded">
          Error: {error}
        </div>
      )}

      {!isInitialized ? (
        <div className="text-ft2-textDim">Initializing AudioWorklet...</div>
      ) : (
        <div className="space-y-4">
          {/* Status */}
          <div className="text-ft2-highlight">
            ✅ Engine Ready - Using Open303 DSP Algorithm
          </div>

          {/* Test Buttons */}
          <div className="space-y-2">
            <h3 className="font-bold text-ft2-textDim">Test Notes:</h3>
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
              <button
                onClick={() => playTestNote(41, true, true)}
                className="px-3 py-1 bg-ft2-header text-white rounded hover:bg-ft2-cursor hover:text-ft2-bg"
              >
                F2 Accent+Slide
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
                Play Sequence
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

          {/* Parameters */}
          <div className="space-y-3 border-t border-ft2-border pt-4">
            <h3 className="font-bold text-ft2-textDim">Parameters:</h3>

            {/* Waveform */}
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

            {/* Cutoff */}
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

            {/* Resonance */}
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

            {/* Env Mod */}
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

            {/* Decay */}
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

            {/* Accent */}
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

            {/* Slide Time */}
            <div>
              <label className="block text-ft2-textDim text-sm mb-1">
                Slide Time: {slideTime}ms
              </label>
              <input
                type="range"
                min="33"
                max="500"
                value={slideTime}
                onChange={(e) => setSlideTime(parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          {/* Info */}
          <div className="border-t border-ft2-border pt-4 text-xs text-ft2-textDim">
            <p>✨ Using TeeBeeFilter algorithm (mystran & kunn)</p>
            <p>✨ PolyBLEP anti-aliased oscillator</p>
            <p>✨ Accurate MEG + VEG envelopes with RC filters</p>
            <p>✨ 1:1 port of Open303 DSP engine</p>
          </div>
        </div>
      )}
    </div>
  );
};
