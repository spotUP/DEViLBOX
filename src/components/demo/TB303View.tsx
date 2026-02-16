/**
 * TB303View - Modern TB-303 interface
 * Displays pattern from tracker store and syncs with global transport
 * All playback handled by TrackerReplayer
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { TB303Sequencer, type TB303Step } from '@components/sequencer/TB303Sequencer';
import { Knob } from '@components/controls/Knob';
import { useTrackerStore, useInstrumentStore, useTransportStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';
import { AcidPatternGeneratorDialog } from '@components/dialogs/AcidPatternGeneratorDialog';
import { Shuffle, Trash2, Wand2 } from 'lucide-react';
import { xmNoteToString, stringNoteToXM } from '@/lib/xmConversions';
import type { InstrumentConfig, DevilFishConfig } from '@typedefs/instrument';
import { DEFAULT_TB303 } from '@typedefs/instrument';
import './TB303View.css';

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
  const { instruments, updateInstrument, addInstrument } = useInstrumentStore();
  // Use global transport for playback state (TrackerReplayer handles actual playback)
  const { isPlaying, currentRow, bpm } = useTransportStore();
  const currentPattern = patterns[currentPatternIndex];
  const channel = currentPattern?.channels[channelIndex];

  // Find all TB-303 instruments
  const tb303Instruments = useMemo(() => 
    instruments.filter(inst => 
      inst.synthType === 'TB303' || 
      inst.synthType === 'Buzz3o3'
    ),
    [instruments]
  );

  // Get instrument ID from channel (default to 0 if not set)
  const instrumentId = channel?.instrumentId ?? 0;
  let instrument = instruments.find((inst) => inst.id === instrumentId);

  // Auto-detect or create TB-303 instrument
  useEffect(() => {
    if (!instrument || (instrument.synthType !== 'TB303' && instrument.synthType !== 'Buzz3o3')) {
      // No valid TB-303 on this channel
      if (tb303Instruments.length === 0) {
        // No TB-303 instruments exist - create one
        console.log('[TB303View] No TB-303 instruments found, creating default TB-303');
        const newInst: InstrumentConfig = {
          id: Date.now(),
          name: 'TB-303',
          type: 'synth',
          synthType: 'TB303',
          volume: 0.7,
          pan: 0,
          monophonic: true,
          effects: [],
          tb303: { ...DEFAULT_TB303 },
        };
        addInstrument(newInst);
        // Assign to channel
        useTrackerStore.setState((state) => {
          const pattern = state.patterns[state.currentPatternIndex];
          if (pattern && pattern.channels[channelIndex]) {
            pattern.channels[channelIndex].instrumentId = newInst.id;
          }
        });
      } else if (tb303Instruments.length === 1) {
        // One TB-303 exists - auto-assign it
        console.log('[TB303View] Auto-assigning TB-303 instrument:', tb303Instruments[0].name);
        useTrackerStore.setState((state) => {
          const pattern = state.patterns[state.currentPatternIndex];
          if (pattern && pattern.channels[channelIndex]) {
            pattern.channels[channelIndex].instrumentId = tb303Instruments[0].id;
          }
        });
      }
      // If multiple TB-303s exist, user can pick from dropdown (don't auto-assign)
    }
  }, [instrument, tb303Instruments, channelIndex, addInstrument]);

  // Re-fetch instrument after auto-assignment
  instrument = instruments.find((inst) => inst.id === (channel?.instrumentId ?? 0));

  // Current step syncs with global transport (mod 16 for 16-step view)
  const currentStep = isPlaying ? currentRow % 16 : -1;

  // Acid pattern generator state
  const [showAcidGenerator, setShowAcidGenerator] = useState(false);

  // Refs for latest values without triggering dependency updates
  const instrumentRef = useRef(instrument);
  const tb303ConfigRef = useRef(instrument?.tb303);
  useEffect(() => {
    instrumentRef.current = instrument;
    tb303ConfigRef.current = instrument?.tb303;
  }, [instrument]);

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

  // Get TB-303 parameters from instrument config (all 0-1 normalized)
  // Source of truth: db303 site rip — all knobs are 0-1, WASM converts internally
  const tb303Config = instrument?.tb303;
  const waveform = tb303Config?.oscillator.type === 'square' ? 1.0 : 0.0;
  const cutoff = tb303Config?.filter.cutoff ?? 0.5;
  const resonance = tb303Config?.filter.resonance ?? 0.5;
  const envMod = tb303Config?.filterEnvelope.envMod ?? 0.5;
  // CRITICAL: When Devil Fish is enabled, read decay from devilFish.normalDecay (not filterEnvelope.decay)
  const decay = tb303Config?.devilFish?.enabled 
    ? (tb303Config?.devilFish?.normalDecay ?? 0.164)
    : (tb303Config?.filterEnvelope.decay ?? 0.5);
  const accent = tb303Config?.accent.amount ?? 0.5;

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

  // Parameter setters - update instrument store which will update ToneEngine
  const handleWaveformChange = useCallback((value: number) => {
    const config = tb303ConfigRef.current;
    if (!instrumentRef.current || !config) return;
    
    const updatedConfig = {
      ...config,
      oscillator: {
        ...config.oscillator,
        type: (value < 0.5 ? 'sawtooth' : 'square') as 'sawtooth' | 'square',
      },
    };
    getToneEngine().updateTB303Parameters(instrumentId, updatedConfig);
    debouncedStoreUpdate({ tb303: updatedConfig });
  }, [instrumentId, debouncedStoreUpdate]);

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
    
    // CRITICAL: normalDecay is what the WASM actually uses for filter envelope.
    // We must ALWAYS set devilFish.normalDecay, even if devilFish doesn't exist yet.
    const updatedConfig = {
      ...config,
      filterEnvelope: {
        ...config.filterEnvelope,
        decay: value,
      },
      devilFish: {
        ...DEFAULT_TB303.devilFish,
        ...(config.devilFish || {}),
        normalDecay: value,
      } as DevilFishConfig,
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

  // Handler for switching between TB-303 instruments
  const handleInstrumentChange = useCallback((newInstrumentId: number) => {
    useTrackerStore.setState((state) => {
      const pattern = state.patterns[state.currentPatternIndex];
      if (pattern && pattern.channels[channelIndex]) {
        pattern.channels[channelIndex].instrumentId = newInstrumentId;
      }
    });
  }, [channelIndex]);

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
          {/* Instrument Selector - Only show if multiple TB-303 instruments exist */}
          {tb303Instruments.length > 1 && (
            <div className="tb303-instrument-selector">
              <label htmlFor="tb303-instrument-select">TB-303 Instrument:</label>
              <select
                id="tb303-instrument-select"
                value={instrumentId}
                onChange={(e) => handleInstrumentChange(Number(e.target.value))}
                className="instrument-select"
              >
                {tb303Instruments.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name} (ID: {inst.id})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Transport Bar - Pattern controls only (playback via main transport) */}
          <div className="tb303-transport">
            {isPlaying && (
              <div className="transport-step">
                Step {(currentStep + 1).toString().padStart(2, '0')}/16 @ {bpm} BPM
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
                  min={0}
                  max={1}
                  onChange={handleCutoffChange}
                  bipolar={false}
                  size="md"
                  formatValue={v => Math.round(314 * Math.pow(2394 / 314, v)) + ' Hz'}
                />
              </div>

              <div className="param-item">
                <Knob
                  label="Resonance"
                  value={resonance}
                  min={0}
                  max={1}
                  onChange={handleResonanceChange}
                  bipolar={false}
                  size="md"
                  formatValue={v => Math.round(v * 100) + '%'}
                />
              </div>

              <div className="param-item">
                <Knob
                  label="Env Mod"
                  value={envMod}
                  min={0}
                  max={1}
                  onChange={handleEnvModChange}
                  bipolar={false}
                  size="md"
                  formatValue={v => Math.round(v * 100) + '%'}
                />
              </div>

              <div className="param-item">
                <Knob
                  label="Decay"
                  value={decay}
                  min={0}
                  max={1}
                  onChange={handleDecayChange}
                  bipolar={false}
                  size="md"
                  formatValue={v => Math.round(200 * Math.pow(2000 / 200, v)) + ' ms'}
                />
              </div>

              <div className="param-item">
                <Knob
                  label="Accent"
                  value={accent}
                  min={0}
                  max={1}
                  onChange={handleAccentChange}
                  bipolar={false}
                  size="md"
                  formatValue={v => Math.round(v * 100) + '%'}
                />
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
