/**
 * AcidSequencer - TB-303 Style Pattern Sequencer
 *
 * Port of Open303 AcidSequencer to TypeScript/Web Audio.
 * Handles 16-step patterns with notes, accents, slides, and gates.
 *
 * Based on: rosic_AcidSequencer by Robin Schmidt
 */

/**
 * Single note event in an acid pattern
 */
export class AcidNote {
  key: number = 0;           // 0-11 (C=0, C#=1, etc.)
  octave: number = 0;        // -1, 0, +1 (relative to root note, db303 style)
  accent: boolean = false;   // Accent flag
  slide: boolean = false;    // Slide/portamento flag
  gate: boolean = false;     // Gate open/closed
  mute: boolean = false;     // Mute flag (TT-303 extension) - step is silent but data preserved
  hammer: boolean = false;   // Hammer-on flag (TT-303 extension) - legato without pitch glide

  constructor() {}

  isInDefaultState(): boolean {
    return this.key === 0 &&
           this.octave === 0 &&
           !this.accent &&
           !this.slide &&
           !this.gate &&
           !this.mute &&
           !this.hammer;
  }

  clone(): AcidNote {
    const note = new AcidNote();
    note.key = this.key;
    note.octave = this.octave;
    note.accent = this.accent;
    note.slide = this.slide;
    note.gate = this.gate;
    note.mute = this.mute;
    note.hammer = this.hammer;
    return note;
  }

  /**
   * Convert to MIDI note number
   * Uses relative octave from rootNote (db303 style)
   * @param rootNote - Base MIDI note (default 36 = C2)
   */
  toMidiNote(rootNote: number = 36): number {
    return rootNote + this.octave * 12 + this.key;
  }

  /**
   * Create from MIDI note number
   * @param midiNote - MIDI note number
   * @param rootNote - Base MIDI note (default 36 = C2)
   */
  static fromMidiNote(midiNote: number, rootNote: number = 36): AcidNote {
    const note = new AcidNote();
    const noteOffset = midiNote - rootNote;
    note.octave = Math.floor(noteOffset / 12);
    note.key = ((noteOffset % 12) + 12) % 12;  // Handle negative modulo
    return note;
  }
}

/**
 * JSON representation of an AcidNote
 */
interface AcidNoteJSON {
  key: number;
  octave: number;
  accent: boolean;
  slide: boolean;
  gate: boolean;
  mute: boolean;
  hammer: boolean;
}

/**
 * JSON representation of an AcidPattern
 */
export interface AcidPatternJSON {
  numSteps: number;
  stepLength: number;
  notes: AcidNoteJSON[];
}

/**
 * JSON representation of AcidSequencer state
 */
export interface AcidSequencerJSON {
  patterns: AcidPatternJSON[];
  bpm: number;
  activePattern: number;
}

/**
 * 16-step acid pattern
 */
export class AcidPattern {
  private static readonly MAX_NUM_STEPS = 32;  // Extended to 32 steps (db303 style)
  private notes: AcidNote[] = [];
  private numSteps: number = 16;  // Default to 16, can be set up to 32
  private stepLength: number = 1.0;  // In 16th note units

  constructor() {
    // Initialize 32 steps (max capacity)
    for (let i = 0; i < AcidPattern.MAX_NUM_STEPS; i++) {
      this.notes.push(new AcidNote());
    }
  }

  // Setters
  setStepLength(length: number): void {
    this.stepLength = length;
  }

  setKey(step: number, key: number): void {
    if (step >= 0 && step < this.numSteps) {
      this.notes[step].key = key;
    }
  }

  setOctave(step: number, octave: number): void {
    if (step >= 0 && step < this.numSteps) {
      this.notes[step].octave = octave;
    }
  }

  setAccent(step: number, accent: boolean): void {
    if (step >= 0 && step < this.numSteps) {
      this.notes[step].accent = accent;
    }
  }

  setSlide(step: number, slide: boolean): void {
    if (step >= 0 && step < this.numSteps) {
      this.notes[step].slide = slide;
    }
  }

  setGate(step: number, gate: boolean): void {
    if (step >= 0 && step < this.numSteps) {
      this.notes[step].gate = gate;
    }
  }

  setMute(step: number, mute: boolean): void {
    if (step >= 0 && step < this.numSteps) {
      this.notes[step].mute = mute;
    }
  }

  setHammer(step: number, hammer: boolean): void {
    if (step >= 0 && step < this.numSteps) {
      this.notes[step].hammer = hammer;
    }
  }

  setNote(step: number, note: AcidNote): void {
    if (step >= 0 && step < this.numSteps) {
      this.notes[step] = note.clone();
    }
  }

  // Getters
  getStepLength(): number {
    return this.stepLength;
  }

  getKey(step: number): number {
    return step >= 0 && step < this.numSteps ? this.notes[step].key : 0;
  }

  getOctave(step: number): number {
    return step >= 0 && step < this.numSteps ? this.notes[step].octave : 0;
  }

  getAccent(step: number): boolean {
    return step >= 0 && step < this.numSteps ? this.notes[step].accent : false;
  }

  getSlide(step: number): boolean {
    return step >= 0 && step < this.numSteps ? this.notes[step].slide : false;
  }

  getGate(step: number): boolean {
    return step >= 0 && step < this.numSteps ? this.notes[step].gate : false;
  }

  getMute(step: number): boolean {
    return step >= 0 && step < this.numSteps ? this.notes[step].mute : false;
  }

  getHammer(step: number): boolean {
    return step >= 0 && step < this.numSteps ? this.notes[step].hammer : false;
  }

  getNote(step: number): AcidNote | null {
    return step >= 0 && step < this.numSteps ? this.notes[step] : null;
  }

  getNumSteps(): number {
    return this.numSteps;
  }

  /**
   * Set number of active steps (1-32)
   */
  setNumSteps(numSteps: number): void {
    if (numSteps >= 1 && numSteps <= AcidPattern.MAX_NUM_STEPS) {
      this.numSteps = numSteps;
    }
  }

  static getMaxNumSteps(): number {
    return AcidPattern.MAX_NUM_STEPS;
  }

  // Utilities
  clear(): void {
    for (let i = 0; i < this.numSteps; i++) {
      this.notes[i] = new AcidNote();
    }
  }

  randomize(): void {
    const keys = [0, 2, 3, 5, 7, 8, 10]; // Minor pentatonic scale
    const octaves = [-1, 0, 1]; // Relative octaves (db303-style)

    for (let i = 0; i < this.numSteps; i++) {
      this.notes[i].key = keys[Math.floor(Math.random() * keys.length)];
      this.notes[i].octave = octaves[Math.floor(Math.random() * octaves.length)];
      this.notes[i].gate = Math.random() > 0.3;  // 70% chance of gate
      this.notes[i].accent = Math.random() > 0.7;  // 30% chance of accent
      this.notes[i].slide = Math.random() > 0.85;  // 15% chance of slide
      this.notes[i].mute = false;  // Don't randomize mute
      this.notes[i].hammer = false;  // Don't randomize hammer
    }
  }

  circularShift(numSteps: number): void {
    if (numSteps === 0) return;

    // Normalize shift amount
    numSteps = ((numSteps % this.numSteps) + this.numSteps) % this.numSteps;

    const temp: AcidNote[] = [];
    for (let i = 0; i < this.numSteps; i++) {
      temp.push(this.notes[i].clone());
    }

    for (let i = 0; i < this.numSteps; i++) {
      const sourceIndex = (i - numSteps + this.numSteps) % this.numSteps;
      this.notes[i] = temp[sourceIndex];
    }
  }

  isEmpty(): boolean {
    for (let i = 0; i < this.numSteps; i++) {
      if (!this.notes[i].isInDefaultState()) {
        return false;
      }
    }
    return true;
  }

  clone(): AcidPattern {
    const pattern = new AcidPattern();
    pattern.numSteps = this.numSteps;
    pattern.stepLength = this.stepLength;
    for (let i = 0; i < this.numSteps; i++) {
      pattern.notes[i] = this.notes[i].clone();
    }
    return pattern;
  }

  /**
   * Export pattern to JSON
   */
  toJSON(): AcidPatternJSON {
    return {
      numSteps: this.numSteps,
      stepLength: this.stepLength,
      notes: this.notes.map(note => ({
        key: note.key,
        octave: note.octave,
        accent: note.accent,
        slide: note.slide,
        gate: note.gate,
        mute: note.mute,
        hammer: note.hammer,
      })),
    };
  }

  /**
   * Import pattern from JSON
   */
  static fromJSON(data: AcidPatternJSON): AcidPattern {
    const pattern = new AcidPattern();
    if (data.numSteps) pattern.numSteps = data.numSteps;
    if (data.stepLength) pattern.stepLength = data.stepLength;
    if (data.notes) {
      for (let i = 0; i < Math.min(data.notes.length, AcidPattern.MAX_NUM_STEPS); i++) {
        const noteData = data.notes[i];
        pattern.notes[i].key = noteData.key || 0;
        pattern.notes[i].octave = noteData.octave || 0;
        pattern.notes[i].accent = noteData.accent || false;
        pattern.notes[i].slide = noteData.slide || false;
        pattern.notes[i].gate = noteData.gate || false;
        pattern.notes[i].mute = noteData.mute || false;
        pattern.notes[i].hammer = noteData.hammer || false;
      }
    }
    return pattern;
  }
}

/**
 * Sequencer modes
 */
export const SequencerMode = {
  OFF: 0,
  KEY_SYNC: 1,   // Start on MIDI note
  HOST_SYNC: 2,  // Start on transport (not implemented in web)
} as const;

export type SequencerMode = typeof SequencerMode[keyof typeof SequencerMode];

/**
 * Event emitted by sequencer
 */
export interface SequencerEvent {
  type: 'noteOn' | 'noteOff' | 'step';
  midiNote?: number;
  velocity?: number;
  accent?: boolean;
  slide?: boolean;
  mute?: boolean;
  hammer?: boolean;
  step?: number;
}

/**
 * Acid Sequencer
 *
 * Plays up to 32-step patterns with tempo sync.
 * Triggers notes, accents, and slides based on pattern data.
 * Supports TT-303 extensions: mute (silent step) and hammer (legato without glide).
 */
export class AcidSequencer {
  private sampleRate: number = 44100;
  private bpm: number = 140;
  private running: boolean = false;
  private mode: SequencerMode = SequencerMode.OFF;
  private modeChanged: boolean = false;

  // Pattern management
  private patterns: AcidPattern[] = [];
  private activePattern: number = 0;
  private static readonly NUM_PATTERNS = 8;

  // Playback state
  private step: number = 0;
  private countDown: number = 0;
  private driftError: number = 0.0;

  // TB-303 slide timing state
  // Real 303: Slide flag on step N means "slide FROM step N TO step N+1"
  // So we track the PREVIOUS step's slide flag to apply at the current step
  private previousSlideFlag: boolean = false;
  private previousHammerFlag: boolean = false;

  // Key filtering (for scale quantization)
  private keyPermissible: boolean[] = new Array(13).fill(true);

  // Event callback
  private eventCallback: ((event: SequencerEvent) => void) | null = null;

  constructor() {
    // Initialize patterns
    for (let i = 0; i < AcidSequencer.NUM_PATTERNS; i++) {
      this.patterns.push(new AcidPattern());
    }
  }

  // Setup
  setSampleRate(sampleRate: number): void {
    if (sampleRate > 0) {
      this.sampleRate = sampleRate;
    }
  }

  setTempo(bpm: number): void {
    this.bpm = bpm;
  }

  setMode(mode: SequencerMode): void {
    if (mode >= 0 && mode < 3) {
      this.mode = mode;
      this.modeChanged = true;
    }
  }

  setActivePattern(index: number): void {
    if (index >= 0 && index < this.patterns.length) {
      this.activePattern = index;
    }
  }

  setEventCallback(callback: (event: SequencerEvent) => void): void {
    this.eventCallback = callback;
  }

  // Pattern access
  getPattern(index: number): AcidPattern | null {
    return index >= 0 && index < this.patterns.length ? this.patterns[index] : null;
  }

  getActivePattern(): AcidPattern {
    return this.patterns[this.activePattern];
  }

  getNumPatterns(): number {
    return AcidSequencer.NUM_PATTERNS;
  }

  // Key filtering
  setKeyPermissible(key: number, permissible: boolean): void {
    if (key >= 0 && key <= 12) {
      this.keyPermissible[key] = permissible;
    }
  }

  toggleKeyPermissibility(key: number): void {
    if (key >= 0 && key <= 12) {
      this.keyPermissible[key] = !this.keyPermissible[key];
    }
  }

  isKeyPermissible(key: number): boolean {
    return key >= 0 && key <= 12 ? this.keyPermissible[key] : false;
  }

  // Control
  start(): void {
    this.running = true;
    this.countDown = -1;
    this.step = 0;
    this.driftError = 0.0;
    this.previousSlideFlag = false;  // Reset slide state on start
    this.previousHammerFlag = false;

    if (this.eventCallback) {
      this.eventCallback({ type: 'step', step: 0 });
    }
  }

  stop(): void {
    this.running = false;

    if (this.eventCallback) {
      this.eventCallback({ type: 'noteOff' });
    }
  }

  reset(): void {
    this.step = 0;
    this.countDown = 0;
    this.driftError = 0.0;
    this.previousSlideFlag = false;  // Reset slide state
    this.previousHammerFlag = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  modeWasChanged(): boolean {
    const result = this.modeChanged;
    this.modeChanged = false;
    return result;
  }

  getCurrentStep(): number {
    return this.step;
  }

  /**
   * Process audio samples and trigger events
   *
   * Call this from your audio callback to advance the sequencer.
   * Events are triggered via the eventCallback.
   */
  processSamples(numSamples: number): void {
    if (!this.running || this.mode === SequencerMode.OFF) {
      return;
    }

    const pattern = this.getActivePattern();
    if (!pattern) return;

    for (let i = 0; i < numSamples; i++) {
      this.processSample();
    }
  }

  private processSample(): void {
    const pattern = this.getActivePattern();

    if (this.countDown <= 0) {
      // Time to trigger next step
      this.triggerStep();

      // Calculate samples until next step (16th note)
      const samplesPerBeat = (60.0 * this.sampleRate) / this.bpm;
      const samplesPerSixteenth = samplesPerBeat / 4.0;

      // Account for step length
      const stepLengthSamples = samplesPerSixteenth * pattern.getStepLength();

      // Compensate for drift
      this.countDown = Math.round(stepLengthSamples - this.driftError);
      this.driftError = (stepLengthSamples - this.driftError) - this.countDown;

      // Advance step
      this.step = (this.step + 1) % pattern.getNumSteps();
    }

    this.countDown--;
  }

  private triggerStep(): void {
    const pattern = this.getActivePattern();
    const note = pattern.getNote(this.step);

    if (!note) return;

    // Emit step event
    if (this.eventCallback) {
      this.eventCallback({ type: 'step', step: this.step });
    }

    // Handle mute flag - skip note entirely (TT-303 extension)
    if (note.mute) {
      // Muted step - emit note off to silence any playing note
      if (this.eventCallback) {
        this.eventCallback({ type: 'noteOff' });
      }
      // Clear previous slide state - mute breaks the chain
      this.previousSlideFlag = false;
      this.previousHammerFlag = false;
      return;
    }

    if (note.gate) {
      // Note on
      let midiNote = note.toMidiNote();

      // Apply key filtering if needed
      if (!this.isKeyPermissible(note.key)) {
        midiNote = this.findClosestPermissibleKey(note.key, note.octave);
      }

      // TB-303 SLIDE TIMING (critical for authentic 303 feel):
      // Slide flag on step N means "slide FROM step N TO step N+1"
      // So we check the PREVIOUS step's slide flag, not the current step's
      //
      // Example pattern: [C slide=ON] [E slide=OFF] [G slide=ON] [A slide=OFF]
      //   Step 0 (C): Plays C, gate opens, NO slide (first note)
      //   Step 1 (E): Pitch glides C→E because step 0 had slide=ON
      //   Step 2 (G): New attack (gate re-triggers) because step 1 had slide=OFF
      //   Step 3 (A): Pitch glides G→A because step 2 had slide=ON
      //
      // Hammer flag uses same timing but disables pitch glide (instant pitch change)
      const slideActive = this.previousSlideFlag && !this.previousHammerFlag;
      const hammerActive = this.previousHammerFlag;
      const legatoActive = slideActive || hammerActive;  // Either keeps gate high

      if (this.eventCallback) {
        this.eventCallback({
          type: 'noteOn',
          midiNote,
          velocity: note.accent ? 127 : 100,
          accent: note.accent,
          slide: legatoActive,  // True for both slide and hammer (keeps gate high)
          hammer: hammerActive, // Pass hammer flag so engine can skip pitch glide
        });
      }

      // Update previous slide/hammer flags for the NEXT step
      // Current step's slide flag determines how the NEXT note will trigger
      this.previousSlideFlag = note.slide;
      this.previousHammerFlag = note.hammer;
    } else {
      // Gate closed - note off
      if (this.eventCallback) {
        this.eventCallback({ type: 'noteOff' });
      }
      // Clear previous slide state - rest breaks the chain
      this.previousSlideFlag = false;
      this.previousHammerFlag = false;
    }
  }

  private findClosestPermissibleKey(key: number, octave: number): number {
    // Find closest permissible key
    for (let distance = 1; distance <= 6; distance++) {
      // Try lower key first
      const lowerKey = key - distance;
      if (lowerKey >= 0 && this.isKeyPermissible(lowerKey)) {
        return 36 + octave * 12 + lowerKey;
      }

      // Try higher key
      const higherKey = key + distance;
      if (higherKey <= 11 && this.isKeyPermissible(higherKey)) {
        return 36 + octave * 12 + higherKey;
      }
    }

    // Fallback to original
    return 36 + octave * 12 + key;
  }

  /**
   * Load all patterns from JSON
   */
  loadPatternsFromJSON(data: AcidSequencerJSON): void {
    if (data.patterns && Array.isArray(data.patterns)) {
      for (let i = 0; i < Math.min(data.patterns.length, this.patterns.length); i++) {
        this.patterns[i] = AcidPattern.fromJSON(data.patterns[i]);
      }
    }
  }

  /**
   * Export all patterns to JSON
   */
  exportPatternsToJSON(): AcidSequencerJSON {
    return {
      patterns: this.patterns.map(p => p.toJSON()),
      bpm: this.bpm,
      activePattern: this.activePattern,
    };
  }
}
