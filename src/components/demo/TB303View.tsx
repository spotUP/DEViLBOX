/**
 * TB303View - Modern TB-303 interface
 * Integrates new TB303Sequencer with ToneEngine
 * Connected to tracker pattern data
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SequencerEngine } from '@engine/SequencerEngine';
import { TB303Sequencer, type TB303Step } from '@components/sequencer/TB303Sequencer';
import { Knob } from '@components/controls/Knob';
import { useTrackerStore, useInstrumentStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';
import { AcidPatternGeneratorDialog } from '@components/dialogs/AcidPatternGeneratorDialog';
import { Play, Square, Shuffle, Trash2, Wand2 } from 'lucide-react';
import { xmNoteToString, stringNoteToXM } from '@/lib/xmConversions';
import type { InstrumentConfig } from '@typedefs/instrument';
import './TB303View.css';

// Note name to MIDI note number mapping (C3 = middle C = 60)
const NOTE_TO_MIDI: Record<string, number> = {
  'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
  'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11,
};

// Parse tracker note (numeric XM or legacy string) to TB303Step format
const parseTrackerNote = (noteValue: number | string | null): { note: string; octave: number } => {
  // Handle numeric XM format
  if (typeof noteValue === 'number') {
    if (noteValue === 0 || noteValue === 97) {
      return { note: 'C', octave: 2 };
    }
    // Convert to string first
    const noteStr = xmNoteToString(noteValue);
    const notePart = noteStr.substring(0, 2); // "C-", "C#", etc.
    const octavePart = noteStr.substring(2); // "4", "5", etc.
    const octaveNum = parseInt(octavePart, 10);

    // Convert tracker octave to TB-303 octave (1=down, 2=mid, 3=up)
    let tb303Octave = 2; // Default to middle
    if (octaveNum <= 2) tb303Octave = 1; // Low
    else if (octaveNum >= 4) tb303Octave = 3; // High

    // Clean up note name (remove dash)
    const noteName = notePart.replace('-', '');
    return { note: noteName, octave: tb303Octave };
  }

  // Handle legacy string format
  if (typeof noteValue === 'string') {
    if (!noteValue || noteValue === '...' || noteValue === '===') {
      return { note: 'C', octave: 2 };
    }
    const notePart = noteValue.substring(0, 2); // "C-", "C#", etc.
    const octavePart = noteValue.substring(2); // "4", "5", etc.
    const octaveNum = parseInt(octavePart, 10);

    let tb303Octave = 2;
    if (octaveNum <= 2) tb303Octave = 1;
    else if (octaveNum >= 4) tb303Octave = 3;

    const noteName = notePart.replace('-', '');
    return { note: noteName, octave: tb303Octave };
  }

  return { note: 'C', octave: 2 };
};

// Convert TB303Step to tracker note (XM numeric format)
const tb303ToTrackerNote = (note: string, octave: number): number => {
  // Convert TB-303 octave (1-3) to tracker octave
  const trackerOctave = octave === 1 ? 2 : octave === 2 ? 3 : 4;

  // Add dash if needed
  const noteStr = note.length === 1 ? `${note}-` : note;
  const noteString = `${noteStr}${trackerOctave}`;

  // Convert to XM numeric format
  return stringNoteToXM(noteString);
};

interface TB303ViewProps {
  channelIndex?: number;
}

export const TB303View: React.FC<TB303ViewProps> = ({ channelIndex = 0 }) => {
  // Get tracker store and instrument store
  const { patterns, currentPatternIndex, setCell } = useTrackerStore();
  const { instruments, updateInstrument } = useInstrumentStore();
  const currentPattern = patterns[currentPatternIndex];
  const channel = currentPattern?.channels[channelIndex];

  // Get instrument ID from channel (default to 0 if not set)
  const instrumentId = channel?.instrumentId ?? 0;
  const instrument = instruments.find((inst) => inst.id === instrumentId);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [bpm, setBpm] = useState(130);

  // Acid pattern generator state
  const [showAcidGenerator, setShowAcidGenerator] = useState(false);

  // Refs for latest values without triggering dependency updates
  const instrumentRef = useRef(instrument);
  const tb303ConfigRef = useRef(instrument?.tb303);
  instrumentRef.current = instrument;
  tb303ConfigRef.current = instrument?.tb303;

  // Debounced store update to prevent re-render spam during knob dragging
  const storeUpdateTimerRef = useRef<number | null>(null);
  const debouncedStoreUpdate = useCallback((updates: Partial<InstrumentConfig>) => {
    if (storeUpdateTimerRef.current) {
      clearTimeout(storeUpdateTimerRef.current);
    }
    storeUpdateTimerRef.current = window.setTimeout(() => {
      updateInstrument(instrumentId, updates);
      storeUpdateTimerRef.current = null;
    }, 300); // Longer debounce - only update store 300ms after user stops dragging
  }, [instrumentId, updateInstrument]);

  // Get TB-303 parameters from instrument config (stored as Hz/ms/%)
  const tb303Config = instrument?.tb303;
  const waveform = tb303Config?.oscillator.type === 'square' ? 1.0 : 0.0;
  const cutoff = tb303Config?.filter.cutoff ?? 1000;
  const resonance = tb303Config?.filter.resonance ?? 50;
  const envMod = tb303Config?.filterEnvelope.envMod ?? 50;
  const decay = tb303Config?.filterEnvelope.decay ?? 300;
  const accent = tb303Config?.accent.amount ?? 50;

  // Convert tracker pattern data to TB303Step format
  const steps = useMemo<TB303Step[]>(() => {
    if (!currentPattern || !currentPattern.channels[channelIndex]) {
      // Return empty steps if no pattern
      return Array.from({ length: 16 }, () => ({
        active: false,
        note: 'C',
        octave: 2,
        accent: false,
        slide: false,
      }));
    }

    const channel = currentPattern.channels[channelIndex];
    const result: TB303Step[] = [];

    // Read first 16 rows
    for (let i = 0; i < 16; i++) {
      const row = channel.rows[i];
      // XM format: 0 = no note, 97 = note off
      const hasNote = !!(row && row.note && row.note !== 0 && row.note !== 97);
      const { note, octave } = hasNote ? parseTrackerNote(row.note) : { note: 'C', octave: 2 };

      result.push({
        active: hasNote,
        note,
        octave,
        accent: !!(row?.flag1 === 1 || row?.flag2 === 1),
        slide: !!(row?.flag1 === 2 || row?.flag2 === 2),
      });
    }

    return result;
  }, [currentPattern, channelIndex]);

  // Sequencer ref for playback loop (still needed for 16-step pattern loop)
  const sequencerRef = React.useRef<SequencerEngine | null>(null);

  // Initialize sequencer engine with ToneEngine's TB303 instance
  useEffect(() => {
    const initSequencer = async () => {
      try {
        const toneEngine = getToneEngine();

        // Ensure audio context is initialized
        await toneEngine.init();

        // Get the TB303 instrument for this channel
        const tb303Inst = toneEngine.getInstrument(instrumentId, instrument!, channelIndex);

        // Create sequencer engine (reuses Tone.js context)
        // Note: Tone.js uses BaseContext which extends AudioContext
        const sequencer = new SequencerEngine(toneEngine.masterInput.context as unknown as AudioContext, { bpm });

        // Connect to ToneEngine's TB303 instance
        sequencer.connectToTB303(tb303Inst);

        // Set up callbacks
        sequencer.onStep((step) => setCurrentStep(step));

        sequencerRef.current = sequencer;

        // Load initial pattern
        updateAcidPattern();
      } catch (err) {
        console.error('[TB303View] Init error:', err);
      }
    };

    if (instrument && (instrument.synthType === 'TB303' || instrument.synthType === 'Buzz3o3' || instrument.tb303)) {
      initSequencer();
    }

    return () => {
      if (sequencerRef.current) {
        sequencerRef.current.dispose();
        sequencerRef.current = null;
      }
    };
  }, [instrumentId, channelIndex, instrument]);

  // Convert our TB303Step to AcidPattern note
  const updateAcidPattern = useCallback(() => {
    if (!sequencerRef.current) return;

    const pattern = sequencerRef.current.getActivePattern();
    for (let i = 0; i < 16; i++) {
      const step = steps[i];
      pattern.setGate(i, step.active);

      if (step.active) {
        // Convert note name to MIDI note number (0-11)
        const noteNum = NOTE_TO_MIDI[step.note] ?? 0;
        pattern.setKey(i, noteNum);

        // Convert octave (1=down, 2=mid, 3=up) to (-1, 0, 1)
        const octave = step.octave - 2;
        pattern.setOctave(i, octave);

        pattern.setAccent(i, step.accent);
        pattern.setSlide(i, step.slide);
      }
    }
  }, [steps]);

  // Update pattern when steps change
  useEffect(() => {
    updateAcidPattern();
  }, [steps, updateAcidPattern]);

  // Update sequencer BPM
  useEffect(() => {
    if (sequencerRef.current) {
      sequencerRef.current.setTempo(bpm);
    }
  }, [bpm]);

  // Parameter setters - update instrument store which will update ToneEngine
  const handleWaveformChange = useCallback((value: number) => {
    if (!instrument || !tb303Config) return;
    updateInstrument(instrumentId, {
      tb303: {
        ...tb303Config,
        oscillator: {
          ...tb303Config.oscillator,
          type: value < 0.5 ? 'sawtooth' : 'square',
        },
      },
    });
  }, [instrumentId, instrument, tb303Config, updateInstrument]);

  const handleCutoffChange = useCallback((value: number) => {
    const config = tb303ConfigRef.current;
    if (!instrumentRef.current || !config) return;
    
    // Store Hz value directly (no conversion needed)
    const updatedConfig = {
      ...config,
      filter: {
        ...config.filter,
        cutoff: value,
      },
    };
    getToneEngine().updateTB303Parameters(instrumentId, updatedConfig);
    debouncedStoreUpdate({ tb303: updatedConfig });
  }, [instrumentId, debouncedStoreUpdate]);

  const handleResonanceChange = useCallback((value: number) => {
    const config = tb303ConfigRef.current;
    if (!instrumentRef.current || !config) return;
    
    const updatedConfig = {
      ...config,
      filter: {
        ...config.filter,
        resonance: value,
      },
    };
    getToneEngine().updateTB303Parameters(instrumentId, updatedConfig);
    debouncedStoreUpdate({ tb303: updatedConfig });
  }, [instrumentId, debouncedStoreUpdate]);

  const handleEnvModChange = useCallback((value: number) => {
    const config = tb303ConfigRef.current;
    if (!instrumentRef.current || !config) return;
    
    const updatedConfig = {
      ...config,
      filterEnvelope: {
        ...config.filterEnvelope,
        envMod: value,
      },
    };
    getToneEngine().updateTB303Parameters(instrumentId, updatedConfig);
    debouncedStoreUpdate({ tb303: updatedConfig });
  }, [instrumentId, debouncedStoreUpdate]);

  const handleDecayChange = useCallback((value: number) => {
    const config = tb303ConfigRef.current;
    if (!instrumentRef.current || !config) return;
    
    const updatedConfig = {
      ...config,
      filterEnvelope: {
        ...config.filterEnvelope,
        decay: value,
      },
    };
    getToneEngine().updateTB303Parameters(instrumentId, updatedConfig);
    debouncedStoreUpdate({ tb303: updatedConfig });
  }, [instrumentId, debouncedStoreUpdate]);

  const handleAccentChange = useCallback((value: number) => {
    const config = tb303ConfigRef.current;
    if (!instrumentRef.current || !config) return;
    
    const updatedConfig = {
      ...config,
      accent: {
        ...config.accent,
        amount: value,
      },
    };
    getToneEngine().updateTB303Parameters(instrumentId, updatedConfig);
    debouncedStoreUpdate({ tb303: updatedConfig });
  }, [instrumentId, debouncedStoreUpdate]);

  // Transport controls
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

  // Pattern controls
  const handleClearPattern = () => {
    // Clear first 16 rows of the current channel
    for (let i = 0; i < 16; i++) {
      setCell(channelIndex, i, { note: 0, flag1: 0, flag2: 0 }); // XM format: 0 = no note
    }
  };

  const handleRandomizePattern = () => {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    for (let i = 0; i < 16; i++) {
      const active = Math.random() > 0.3;
      const note = notes[Math.floor(Math.random() * notes.length)];
      const octave = Math.floor(Math.random() * 3) + 1;
      const accent = Math.random() > 0.7;
      const slide = Math.random() > 0.8;

      setCell(channelIndex, i, {
        note: active ? tb303ToTrackerNote(note, octave) : 0, // XM format: 0 = no note
        flag1: accent ? 1 : 0,
        flag2: slide ? 2 : 0,
      });
    }
  };

  // Step callbacks - write to tracker store
  const handleStepChange = useCallback((stepIndex: number, step: TB303Step) => {
    setCell(channelIndex, stepIndex, {
      note: step.active ? tb303ToTrackerNote(step.note, step.octave) : 0, // XM format: 0 = no note
      flag1: step.accent ? 1 : undefined,
      flag2: step.slide ? 2 : undefined,
    });
  }, [channelIndex, setCell]);

  const handleStepToggle = useCallback((stepIndex: number) => {
    const currentStep = steps[stepIndex];
    const newActive = !currentStep.active;

    setCell(channelIndex, stepIndex, {
      note: newActive ? tb303ToTrackerNote(currentStep.note, currentStep.octave) : 0, // XM format: 0 = no note
      flag1: currentStep.accent ? 1 : undefined,
      flag2: currentStep.slide ? 2 : undefined,
    });
  }, [channelIndex, setCell, steps]);

  // Show error if instrument not found or not TB-303
  if (!instrument) {
    return (
      <div className="tb303-view">
        <div className="tb303-error">
          No instrument assigned to channel {channelIndex + 1}
        </div>
      </div>
    );
  }

  if (!tb303Config && instrument.synthType !== 'TB303' && instrument.synthType !== 'Buzz3o3') {
    return (
      <div className="tb303-view">
        <div className="tb303-error">
          Channel {channelIndex + 1} is using {instrument.synthType}, not TB-303
        </div>
      </div>
    );
  }

  return (
    <div className="tb303-view">
      {/* Content starts here */}
      <>
          {/* Transport Bar */}
          <div className="tb303-transport">
            <button
              onClick={handlePlayPause}
              className={`transport-btn ${isPlaying ? 'stop' : 'play'}`}
            >
              {isPlaying ? <Square size={16} /> : <Play size={16} />}
              <span>{isPlaying ? 'Stop' : 'Play'}</span>
            </button>

            <div className="transport-bpm">
              <label>BPM</label>
              <input
                type="number"
                value={bpm}
                onChange={(e) => setBpm(parseInt(e.target.value) || 130)}
                min="60"
                max="200"
              />
            </div>

            {isPlaying && (
              <div className="transport-step">
                Step {(currentStep + 1).toString().padStart(2, '0')}/16
              </div>
            )}

            <div className="transport-spacer" />

            <button onClick={() => setShowAcidGenerator(true)} className="pattern-btn acid">
              <Wand2 size={16} />
              <span>Acid</span>
            </button>

            <button onClick={handleRandomizePattern} className="pattern-btn randomize">
              <Shuffle size={16} />
              <span>Random</span>
            </button>

            <button onClick={handleClearPattern} className="pattern-btn clear">
              <Trash2 size={16} />
              <span>Clear</span>
            </button>
          </div>

          {/* Sequencer */}
          <div className="tb303-sequencer-section">
            <h3 className="section-title">Pattern Sequencer</h3>
            <TB303Sequencer
              steps={steps}
              currentStep={currentStep}
              isPlaying={isPlaying}
              onStepChange={handleStepChange}
              onStepToggle={handleStepToggle}
              unitId={1}
            />
          </div>

          {/* TB-303 Parameters */}
          <div className="tb303-params-section">
            <h3 className="section-title">TB-303 Parameters</h3>
            <div className="params-grid">
              <div className="param-item">
                <Knob
                  label="Waveform"
                  value={waveform}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={handleWaveformChange}
                  bipolar={false}
                  size="md"
                />
                <div className="param-value">
                  {waveform < 0.5 ? 'Saw' : 'Square'}
                </div>
              </div>

              <div className="param-item">
                <Knob
                  label="Cutoff"
                  value={cutoff}
                  min={200}
                  max={5000}
                  logarithmic
                  onChange={handleCutoffChange}
                  bipolar={false}
                  size="md"
                />
                <div className="param-value">{Math.round(cutoff)}Hz</div>
              </div>

              <div className="param-item">
                <Knob
                  label="Resonance"
                  value={resonance}
                  min={0}
                  max={100}
                  onChange={handleResonanceChange}
                  bipolar={false}
                  size="md"
                />
                <div className="param-value">{resonance}%</div>
              </div>

              <div className="param-item">
                <Knob
                  label="Env Mod"
                  value={envMod}
                  min={0}
                  max={100}
                  onChange={handleEnvModChange}
                  bipolar={false}
                  size="md"
                />
                <div className="param-value">{envMod}%</div>
              </div>

              <div className="param-item">
                <Knob
                  label="Decay"
                  value={decay}
                  min={200}
                  max={2000}
                  logarithmic
                  onChange={handleDecayChange}
                  bipolar={false}
                  size="md"
                />
                <div className="param-value">{Math.round(decay)}ms</div>
              </div>

              <div className="param-item">
                <Knob
                  label="Accent"
                  value={accent}
                  min={0}
                  max={100}
                  onChange={handleAccentChange}
                  bipolar={false}
                  size="md"
                />
                <div className="param-value">{accent}%</div>
              </div>
            </div>
          </div>

      </>

      {/* Acid Pattern Generator Dialog */}
      {showAcidGenerator && (
        <AcidPatternGeneratorDialog
          channelIndex={channelIndex}
          onClose={() => setShowAcidGenerator(false)}
        />
      )}
    </div>
  );
};
