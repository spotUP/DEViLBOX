/**
 * ArpeggiatorModule - MIDI Arpeggiator
 *
 * Generates arpeggiated note sequences from held notes.
 * Inspired by classic hardware and Max for Live arpeggiators.
 */

import type { ModuleDescriptor, ModuleInstance, ModulePort } from '../../../types/modular';

export const ArpeggiatorDescriptor: ModuleDescriptor = {
  id: 'Arpeggiator',
  name: 'Arpeggiator',
  category: 'modulator',
  voiceMode: 'shared', // Arpeggiator operates on note collection
  color: '#10b981', // green

  ports: [
    { id: 'gate', name: 'Gate Out', direction: 'output', signal: 'gate' },
    { id: 'cv', name: 'CV Out', direction: 'output', signal: 'cv' },
    { id: 'clock', name: 'Clock In', direction: 'input', signal: 'trigger' },
  ],

  parameters: [
    { id: 'rate', name: 'Rate', min: 0, max: 1, default: 0.5 }, // Map to note divisions
    { id: 'pattern', name: 'Pattern', min: 0, max: 7, default: 0 }, // Up, Down, UpDown, Random, etc.
    { id: 'octaves', name: 'Octaves', min: 0, max: 1, default: 0 }, // 1-4 octaves
    { id: 'gateLength', name: 'Gate Length', min: 0, max: 1, default: 0.5, unit: '%' },
  ],

  create: (ctx: AudioContext): ModuleInstance => {
    const gateOut = ctx.createConstantSource();
    const cvOut = ctx.createConstantSource();
    const clockInput = ctx.createGain();

    // Initialize
    gateOut.offset.value = 0;
    cvOut.offset.value = 0;
    gateOut.start();
    cvOut.start();

    const ports = new Map<string, ModulePort>([
      ['gate', { id: 'gate', name: 'Gate Out', direction: 'output', signal: 'gate', node: gateOut }],
      ['cv', { id: 'cv', name: 'CV Out', direction: 'output', signal: 'cv', node: cvOut }],
      ['clock', { id: 'clock', name: 'Clock In', direction: 'input', signal: 'trigger', node: clockInput }],
    ]);

    // Arpeggiator state
    let heldNotes: number[] = []; // MIDI note numbers
    let currentIndex = 0;
    let currentPattern = 0;
    let currentOctaves = 1;
    let currentRate = 0.5;
    let currentGateLength = 0.5;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    /**
     * Get note sequence based on pattern
     */
    function getNoteSequence(): number[] {
      if (heldNotes.length === 0) return [];

      const sorted = [...heldNotes].sort((a, b) => a - b);
      let sequence: number[] = [];

      // Generate base pattern
      switch (currentPattern) {
        case 0: // Up
          sequence = sorted;
          break;

        case 1: // Down
          sequence = [...sorted].reverse();
          break;

        case 2: // Up-Down
          sequence = [...sorted, ...[...sorted].reverse().slice(1, -1)];
          break;

        case 3: // Down-Up
          const rev = [...sorted].reverse();
          sequence = [...rev, ...sorted.slice(1, -1)];
          break;

        case 4: // Random
          sequence = sorted.map(() => sorted[Math.floor(Math.random() * sorted.length)]);
          break;

        case 5: // Order Played
          sequence = heldNotes;
          break;

        case 6: // Chord (all at once)
          sequence = sorted;
          break;

        case 7: // Octave Up
          sequence = sorted;
          for (let oct = 1; oct < currentOctaves; oct++) {
            sequence = [...sequence, ...sorted.map((n) => n + 12 * oct)];
          }
          break;
      }

      return sequence;
    }

    /**
     * Advance arpeggiator step
     */
    function step() {
      const sequence = getNoteSequence();
      if (sequence.length === 0) {
        gateOut.offset.value = 0;
        return;
      }

      // Get current note
      const note = sequence[currentIndex % sequence.length];

      // Output CV (pitch) and gate
      cvOut.offset.value = note; // MIDI note number as CV
      gateOut.offset.value = 1;

      // Schedule gate off
      const gateTime = (60 / 120) * currentGateLength * 1000; // Based on BPM
      setTimeout(() => {
        gateOut.offset.value = 0;
      }, gateTime);

      // Advance to next note
      currentIndex++;
    }

    /**
     * Start arpeggiator
     */
    function start() {
      if (intervalId) stop();

      // Calculate interval based on rate (maps to note divisions)
      const bpm = 120; // TODO: Get from global tempo
      const quarterNoteMs = (60 / bpm) * 1000;
      const divisions = [4, 2, 1, 0.5, 0.25, 0.125]; // Whole to 32nd notes
      const divisionIndex = Math.floor(currentRate * (divisions.length - 1));
      const intervalMs = quarterNoteMs * divisions[divisionIndex];

      intervalId = setInterval(step, intervalMs);
    }

    /**
     * Stop arpeggiator
     */
    function stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      gateOut.offset.value = 0;
      currentIndex = 0;
    }

    return {
      descriptorId: 'Arpeggiator',
      ports,

      setParam: (paramId: string, value: number) => {
        switch (paramId) {
          case 'rate':
            currentRate = value;
            if (intervalId) {
              start(); // Restart with new rate
            }
            break;

          case 'pattern':
            currentPattern = Math.floor(value);
            currentIndex = 0; // Reset pattern position
            break;

          case 'octaves':
            currentOctaves = Math.floor(1 + value * 3); // 1-4 octaves
            break;

          case 'gateLength':
            currentGateLength = value;
            break;
        }
      },

      getParam: (paramId: string) => {
        switch (paramId) {
          case 'rate':
            return currentRate;
          case 'pattern':
            return currentPattern;
          case 'octaves':
            return (currentOctaves - 1) / 3;
          case 'gateLength':
            return currentGateLength;
          default:
            return 0;
        }
      },

      gateOn: (time: number, velocity: number) => {
        // When a note is held, add to arpeggiator
        const midiNote = Math.round(velocity * 127); // Use velocity as note number for now
        if (!heldNotes.includes(midiNote)) {
          heldNotes.push(midiNote);
        }

        // Start arpeggiator if not running
        if (!intervalId && heldNotes.length > 0) {
          start();
        }
      },

      gateOff: (time: number) => {
        // When all notes released, stop arpeggiator
        heldNotes = [];
        stop();
      },

      dispose: () => {
        stop();
        gateOut.stop();
        gateOut.disconnect();
        cvOut.stop();
        cvOut.disconnect();
        clockInput.disconnect();
      },
    };
  },
};
