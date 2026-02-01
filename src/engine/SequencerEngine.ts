/**
 * SequencerEngine - Web Audio Integration for AcidSequencer
 *
 * Provides sample-accurate sequencing via ScriptProcessor or AudioWorklet.
 * Integrates with TB303EngineAccurate for complete acid bassline playback.
 */

import { AcidSequencer, AcidPattern, SequencerMode, type SequencerEvent } from './AcidSequencer';
import type { TB303EngineAccurate } from './TB303EngineAccurate';
import { getNativeContext } from '@utils/audio-context';

export interface SequencerConfig {
  bpm?: number;
  mode?: SequencerMode;
  sampleRate?: number;
}

/**
 * SequencerEngine
 *
 * Drives the AcidSequencer with sample-accurate timing using Web Audio.
 */
export class SequencerEngine {
  private audioContext: AudioContext;
  private sequencer: AcidSequencer;
  private tb303Engine: TB303EngineAccurate | null = null;

  // Timing
  private scriptProcessor: ScriptProcessorNode | null = null;
  private isRunning: boolean = false;

  // State
  private currentStep: number = 0;
  private lastNoteOn: number | null = null;

  // Callbacks
  private stepCallback: ((step: number) => void) | null = null;
  private noteCallback: ((event: SequencerEvent) => void) | null = null;

  constructor(audioContext: AudioContext, config: SequencerConfig = {}) {
    this.audioContext = audioContext;
    this.sequencer = new AcidSequencer();

    // Configure sequencer
    this.sequencer.setSampleRate(config.sampleRate || audioContext.sampleRate);
    this.sequencer.setTempo(config.bpm || 140);
    this.sequencer.setMode(config.mode || SequencerMode.KEY_SYNC);

    // Set up event handling
    this.sequencer.setEventCallback((event) => this.handleSequencerEvent(event));

    console.log('[SequencerEngine] Initialized');
  }

  /**
   * Connect to TB-303 engine for audio output
   */
  connectToTB303(tb303: TB303EngineAccurate): void {
    this.tb303Engine = tb303;
    console.log('[SequencerEngine] Connected to TB-303 engine');
  }

  /**
   * Start the sequencer
   */
  start(): void {
    if (this.isRunning) return;

    // Create ScriptProcessor for sample-accurate timing
    // Note: ScriptProcessor is deprecated but still works. For production,
    // should move to AudioWorklet. This is simpler for now.
    const nativeCtx = getNativeContext(this.audioContext);
    this.scriptProcessor = nativeCtx.createScriptProcessor(256, 0, 1);

    this.scriptProcessor.onaudioprocess = (e) => {
      const numSamples = e.outputBuffer.length;
      this.sequencer.processSamples(numSamples);

      // Clear output buffer (we're just using this for timing)
      const output = e.outputBuffer.getChannelData(0);
      output.fill(0);
    };

    // Connect to destination (but output silence)
    this.scriptProcessor.connect(nativeCtx.destination);

    this.sequencer.start();
    this.isRunning = true;

    console.log('[SequencerEngine] Started');
  }

  /**
   * Stop the sequencer
   */
  stop(): void {
    if (!this.isRunning) return;

    this.sequencer.stop();

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    // Turn off any playing note
    if (this.tb303Engine && this.lastNoteOn !== null) {
      this.tb303Engine.noteOff();
      this.lastNoteOn = null;
    }

    this.isRunning = false;

    console.log('[SequencerEngine] Stopped');
  }

  /**
   * Handle events from sequencer
   */
  private handleSequencerEvent(event: SequencerEvent): void {
    switch (event.type) {
      case 'noteOn':
        if (this.tb303Engine && event.midiNote !== undefined) {
          this.tb303Engine.noteOn(
            event.midiNote,
            event.velocity || 100,
            event.accent || false,
            event.slide || false
          );
          this.lastNoteOn = event.midiNote;
        }

        if (this.noteCallback) {
          this.noteCallback(event);
        }
        break;

      case 'noteOff':
        if (this.tb303Engine) {
          this.tb303Engine.noteOff();
          this.lastNoteOn = null;
        }

        if (this.noteCallback) {
          this.noteCallback(event);
        }
        break;

      case 'step':
        this.currentStep = event.step || 0;

        if (this.stepCallback) {
          this.stepCallback(this.currentStep);
        }
        break;
    }
  }

  /**
   * Set tempo
   */
  setTempo(bpm: number): void {
    this.sequencer.setTempo(bpm);
  }

  /**
   * Set active pattern
   */
  setActivePattern(index: number): void {
    this.sequencer.setActivePattern(index);
  }

  /**
   * Get pattern
   */
  getPattern(index: number): AcidPattern | null {
    return this.sequencer.getPattern(index);
  }

  /**
   * Get active pattern
   */
  getActivePattern(): AcidPattern {
    return this.sequencer.getActivePattern();
  }

  /**
   * Get current step
   */
  getCurrentStep(): number {
    return this.currentStep;
  }

  /**
   * Get number of patterns
   */
  getNumPatterns(): number {
    return this.sequencer.getNumPatterns();
  }

  /**
   * Set step callback
   */
  onStep(callback: (step: number) => void): void {
    this.stepCallback = callback;
  }

  /**
   * Set note callback
   */
  onNote(callback: (event: SequencerEvent) => void): void {
    this.noteCallback = callback;
  }

  /**
   * Check if running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Load patterns from JSON
   */
  loadPatterns(data: any): void {
    this.sequencer.loadPatternsFromJSON(data);
  }

  /**
   * Export patterns to JSON
   */
  exportPatterns(): any {
    return this.sequencer.exportPatternsToJSON();
  }

  /**
   * Dispose
   */
  dispose(): void {
    this.stop();
    console.log('[SequencerEngine] Disposed');
  }
}